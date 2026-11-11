"""Guided CSV migration of media items; staging is separate from the library database."""

import csv
import io
import json
import logging
import re
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

from django.conf import settings
from django.db import close_old_connections, transaction
from django.db.models import Max, Q
from django.utils import timezone

from core.models import Collection, CollectionItem, MediaItem, MusicVideo, Screenshot
from core.services.g_backup import BACKUP_LOCK
from core.services.g_transfer_providers import (
    SOURCES, ProviderError, TransferHTTP, canonical_source, clean_id,
    normalized_title, prepare_item, search_candidates,
)

logger = logging.getLogger(__name__)
MAX_BYTES = 50 * 1024 * 1024
MAX_ROWS = 50000
csv.field_size_limit(1024 * 1024)
_INIT_LOCK = threading.Lock()
_INITIALIZED = set()
BUSY = ('running', 'pausing')
PERSONAL = ('status', 'personal_rating', 'notes', 'progress_main', 'progress_secondary',
            'total_main', 'total_secondary', 'repeats', 'favorite', 'date_added')
ID_FIELDS = {'tmdb_id': 'tmdb', 'anilist_id': 'anilist', 'mal_id': 'mal', 'igdb_id': 'igdb',
             'openlibrary_id': 'openlib', 'musicbrainz_id': 'musicbrainz', 'imdb_id': 'imdb', 'isbn': 'isbn'}
FIELDS = {
    'title': 'Title (for matching)', 'media_type': 'Media type', 'release_year': 'Release year (for matching)',
    'release_date': 'Release date', 'creators': 'Creators / artists / authors', 'genres': 'Genres',
    'overview': 'Overview', 'status': 'Status', 'personal_rating': 'Score', 'notes': 'Notes',
    'progress_main': 'Episode / chapter / page / hour progress',
    'progress_secondary': 'Season / volume progress', 'total_main': 'Main total / movie length (minutes)',
    'total_secondary': 'Season / volume total', 'repeats': 'Repeats', 'favorite': 'Favorite',
    'date_added': 'Activity date', 'collections': 'Collections', 'source': 'Provider',
    'source_id': 'Provider ID', 'provider_ids': 'Provider IDs (JSON)',
    **{key: label for key, label in zip(ID_FIELDS, ('TMDB ID', 'AniList ID', 'MyAnimeList ID', 'IGDB ID',
                                                'Open Library ID', 'MusicBrainz recording ID', 'IMDb ID', 'ISBN'))},
    'cover_url': 'Cover URL (custom items)', 'banner_url': 'Banner URL (custom items)',
}
TYPE_LABELS = dict(MediaItem.MEDIA_TYPES)
STATUS_LABELS = dict(MediaItem.STATUS_CHOICES)
TYPE_ALIASES = {**{key: key for key in TYPE_LABELS}, 'movies': 'movie', 'film': 'movie',
                'tvshows': 'tv', 'tv shows': 'tv', 'tv series': 'tv', 'television': 'tv',
                'games': 'game', 'books': 'book', 'song': 'music', 'songs': 'music'}
STATUS_ALIASES = {**{key: key for key in STATUS_LABELS}, 'watching': 'ongoing', 'reading': 'ongoing',
                  'playing': 'ongoing', 'listening': 'ongoing', 'paused': 'on_hold', 'on hold': 'on_hold',
                  'plan to watch': 'planned', 'plan to read': 'planned'}
EXPORT_FIELDS = ['title', 'media_type', 'source', 'source_id', 'provider_ids', *ID_FIELDS,
                 'release_date', 'release_year', 'creators', 'genres', 'overview', *PERSONAL,
                 'favorite_position', 'collections', 'collection_positions', 'cover_url', 'banner_url',
                 'last_updated', '_mj_csv_version', '_mj_escaped_fields']


def root():
    path = Path(settings.BASE_DIR) / 'data' / 'transfer'
    path.mkdir(parents=True, exist_ok=True)
    return path


@contextmanager
def store():
    path = root() / 'state.sqlite3'
    with _INIT_LOCK:
        if str(path) not in _INITIALIZED:
            with sqlite3.connect(path, timeout=30) as db:
                db.execute('PRAGMA journal_mode=WAL')
                db.executescript('''
                    CREATE TABLE IF NOT EXISTS jobs (
                        id TEXT PRIMARY KEY, kind TEXT, state TEXT, phase TEXT, config TEXT,
                        headers TEXT, total INTEGER DEFAULT 0, processed INTEGER DEFAULT 0,
                        created REAL, updated REAL, message TEXT DEFAULT '', error TEXT DEFAULT '',
                        stop_requested INTEGER DEFAULT 0);
                    CREATE TABLE IF NOT EXISTS rows (
                        job_id TEXT, number INTEGER, raw TEXT, normalized TEXT, state TEXT DEFAULT 'pending',
                        match TEXT, candidates TEXT DEFAULT '[]', error TEXT DEFAULT '', item_id INTEGER,
                        PRIMARY KEY (job_id, number));
                    CREATE INDEX IF NOT EXISTS transfer_rows_state ON rows(job_id, state, number);
                    CREATE TABLE IF NOT EXISTS cache (job_id TEXT, key TEXT, value TEXT, PRIMARY KEY(job_id,key));
                ''')
            _INITIALIZED.add(str(path))
    db = sqlite3.connect(path, timeout=30, isolation_level=None)
    db.row_factory = sqlite3.Row
    try:
        yield db
    finally:
        db.close()


def _json(value):
    return json.dumps(value, ensure_ascii=False)


def job(job_id):
    if not re.fullmatch(r'[a-f0-9]{32}', str(job_id)):
        raise ValueError('Transfer not found.')
    with store() as db:
        result = db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
    if not result:
        raise ValueError('Transfer not found or expired.')
    result = dict(result)
    result['config'] = json.loads(result['config'])
    result['headers'] = json.loads(result['headers'])
    # A separate heartbeat runs even during slow downloads. Interrupted jobs require an explicit resume.
    if result['state'] in BUSY and time.time() - result['updated'] > 120:
        update_job(job_id, state='paused', error='The server stopped during this transfer. Resume to continue.')
        result['state'] = 'paused'
        result['error'] = 'The server stopped during this transfer. Resume to continue.'
    return result


def update_job(job_id, **values):
    allowed = {'state', 'phase', 'config', 'headers', 'total', 'processed', 'message', 'error', 'stop_requested', 'updated'}
    if not values.keys() <= allowed:
        raise ValueError('Invalid transfer update.')
    values.setdefault('updated', time.time())
    for key in ('config', 'headers'):
        if key in values:
            values[key] = _json(values[key])
    with store() as db:
        db.execute('UPDATE jobs SET ' + ','.join(f'{key}=?' for key in values) + ' WHERE id=?', (*values.values(), job_id))


def row_update(job_id, number, **values):
    if not values.keys() <= {'normalized', 'state', 'match', 'candidates', 'error', 'item_id'}:
        raise ValueError('Invalid row update.')
    for key in ('normalized', 'match', 'candidates'):
        if key in values:
            values[key] = _json(values[key])
    with store() as db:
        db.execute('UPDATE rows SET ' + ','.join(f'{key}=?' for key in values) + ' WHERE job_id=? AND number=?',
                   (*values.values(), job_id, number))


def cleanup():
    with store() as db:
        db.execute("UPDATE jobs SET state='paused' WHERE state IN ('running','pausing') AND updated<?", (time.time() - 120,))
        expired = db.execute("SELECT id FROM jobs WHERE updated<? AND state NOT IN ('running','pausing')", (time.time() - 7 * 86400,)).fetchall()
        for item in expired:
            db.execute('DELETE FROM rows WHERE job_id=?', (item['id'],))
            db.execute('DELETE FROM cache WHERE job_id=?', (item['id'],))
            db.execute('DELETE FROM jobs WHERE id=?', (item['id'],))
            for suffix in ('upload.csv', 'export.csv'):
                (root() / f'{item["id"]}.{suffix}').unlink(missing_ok=True)


def create_job(kind, config=None):
    cleanup()
    identity = uuid.uuid4().hex
    with store() as db:
        db.execute('INSERT INTO jobs(id,kind,state,phase,config,headers,created,updated) VALUES(?,?,?,?,?,?,?,?)',
                   (identity, kind, 'new', 'read' if kind == 'import' else 'export', _json(config or {}), '[]', time.time(), time.time()))
    return identity


def counts(job_id):
    with store() as db:
        return dict(db.execute('SELECT state,COUNT(*) FROM rows WHERE job_id=? GROUP BY state', (job_id,)).fetchall())


def snapshot(job_id):
    result = job(job_id)
    result['counts'] = counts(job_id)
    result['fields'] = FIELDS
    result['types'] = TYPE_LABELS
    result['statuses'] = STATUS_LABELS
    with store() as db:
        sample = db.execute('SELECT raw FROM rows WHERE job_id=? ORDER BY number LIMIT 5', (job_id,)).fetchall()
    result['samples'] = [{key: str(value)[:300] for key, value in json.loads(row['raw']).items()} for row in sample]
    return result


def _raw(row):
    raw = json.loads(row['raw'])
    # Only our own exporter supplies an exact list of cells escaped for spreadsheet safety.
    if raw.get('_mj_csv_version') == '1':
        try:
            escaped = json.loads(raw.get('_mj_escaped_fields', '[]'))
        except (ValueError, TypeError):
            escaped = []
        if isinstance(escaped, list):
            for key in escaped:
                if isinstance(key, str) and str(raw.get(key, '')).startswith("'"):
                    raw[key] = raw[key][1:]
    return raw


def configure(job_id, config):
    task = job(job_id)
    if not isinstance(config, dict):
        raise ValueError('Invalid transfer configuration.')
    if task['state'] in BUSY or task['kind'] != 'import' or counts(job_id).get('imported') or (task['phase'] == 'read' and task['state'] != 'mapping'):
        raise ValueError('This transfer cannot be remapped. Start a new upload instead.')
    mapping = config.get('mapping', {})
    if not isinstance(mapping, dict) or not set(mapping) <= set(task['headers']):
        raise ValueError('Invalid column mapping.')
    targets = [value for value in mapping.values() if value]
    if not targets or not set(targets) <= set(FIELDS) or len(targets) != len(set(targets)):
        raise ValueError('Map each destination field at most once.')
    if 'title' not in targets and not (set(targets) & (set(ID_FIELDS) | {'source_id', 'provider_ids'})):
        raise ValueError('Map a title or a supported provider ID.')
    if config.get('media_type') not in TYPE_LABELS and 'media_type' not in targets:
        raise ValueError('Choose a media type or map a media-type column.')
    if config.get('status', 'planned') not in STATUS_LABELS:
        raise ValueError('Choose a default status.')
    if str(config.get('score_scale', '100')) not in ('5', '10', '100', 'faces'):
        raise ValueError('Choose a score scale.')
    if config.get('date_format', 'iso') not in ('iso', 'dmy', 'mdy', 'dots'):
        raise ValueError('Choose a date format.')
    if config.get('list_separator', '|') not in ('|', ';', ',', '\n'):
        raise ValueError('Choose a list separator.')
    config = {key: config.get(key, default) for key, default in (
        ('mapping', {}), ('media_type', ''), ('status', 'planned'), ('score_scale', '100'),
        ('date_format', 'iso'), ('list_separator', '|'), ('value_maps', {}))}
    values = {}
    value_fields = {'media_type', 'status', 'favorite'} | ({'personal_rating'} if config['score_scale'] == 'faces' else set())
    with store() as db:
        for record in db.execute('SELECT raw FROM rows WHERE job_id=?', (job_id,)):
            raw = _raw(record)
            for column, field in mapping.items():
                if field in value_fields and str(raw[column]).strip():
                    values.setdefault(field, set()).add(str(raw[column]).strip())
                    if len(values[field]) > 200:
                        raise ValueError(f'Too many distinct values for {FIELDS[field]}. Check the column mapping.')
    update_job(job_id, config=config, state='values', phase='match', error='')
    choices = {}
    for field, distinct in values.items():
        options = TYPE_LABELS if field == 'media_type' else STATUS_LABELS if field == 'status' else (
            {'true': 'Yes', 'false': 'No'} if field == 'favorite' else {'1': 'Bad', '50': 'Neutral', '100': 'Good', 'unrated': 'Unrated'})
        aliases = TYPE_ALIASES if field == 'media_type' else STATUS_ALIASES if field == 'status' else (
            {'true': 'true', 'yes': 'true', '1': 'true', 'false': 'false', 'no': 'false', '0': 'false'} if field == 'favorite'
            else {'0': 'unrated', '1': '1', '50': '50', '100': '100', 'bad': '1', 'neutral': '50', 'good': '100'})
        choices[field] = {'options': options, 'values': [{'value': value, 'suggested': aliases.get(value.casefold(), '')} for value in sorted(distinct)]}
    return choices


def _integer(value, field):
    try:
        number = Decimal(str(value).strip())
        if not number.is_finite() or number != number.to_integral_value() or not 0 <= number <= 2147483647:
            raise ValueError()
        return int(number)
    except (ValueError, InvalidOperation) as error:
        raise ValueError(f'{FIELDS.get(field, field)} must be a non-negative whole number.') from error


def _list(value, separator):
    if str(value).lstrip().startswith('['):
        result = json.loads(value)
        if not isinstance(result, list) or not all(isinstance(item, str) for item in result):
            raise ValueError('List fields must contain names or a JSON array of names.')
    else:
        result = str(value).split(separator)
    return list(dict.fromkeys(item.strip() for item in result if item.strip()))


def normalize(raw, config):
    mapped = {field: raw[column] for column, field in config['mapping'].items() if field and raw.get(column, '') != ''}
    values = config.get('value_maps', {})
    def mapped_value(field, default):
        value = str(mapped.get(field, '')).strip()
        if not value:
            return default
        result = values.get(field, {}).get(value)
        if not result:
            raise ValueError(f'Choose how to map {FIELDS[field]} value: {value[:80]}')
        return result
    kind = mapped_value('media_type', config['media_type'])
    status = mapped_value('status', config['status'])
    if kind not in TYPE_LABELS or status not in STATUS_LABELS:
        raise ValueError('Invalid media type or status mapping.')
    result = {'title': str(mapped.get('title', '')).strip(), 'media_type': kind, 'status': status, 'provider_ids': {}}
    if len(result['title']) > 300:
        raise ValueError('Title is longer than 300 characters.')
    for field in ('notes', 'overview', 'release_date'):
        if field in mapped:
            result[field] = str(mapped[field])
    if len(result.get('release_date', '')) > 20:
        raise ValueError('Release date is longer than 20 characters.')
    for field in ('creators', 'genres', 'collections'):
        if field in mapped:
            result[field] = _list(mapped[field], config['list_separator'])
    if any(len(title) > 200 for title in result.get('collections', [])):
        raise ValueError('Collection names must be at most 200 characters.')
    for field in ('progress_main', 'progress_secondary', 'total_main', 'total_secondary', 'repeats'):
        if field in mapped:
            result[field] = _integer(mapped[field], field)
    if kind in ('movie', 'music'):
        result['progress_main'] = 0
    if 'release_year' in mapped:
        result['release_year'] = str(_integer(mapped['release_year'], 'release_year'))
        if not re.fullmatch(r'\d{4}', result['release_year']):
            raise ValueError('Release year must contain four digits.')
    elif re.match(r'^\d{4}', result.get('release_date', '')):
        result['release_year'] = result['release_date'][:4]
    if 'favorite' in mapped:
        favorite = mapped_value('favorite', 'false')
        if favorite not in ('true', 'false'):
            raise ValueError('Invalid favorite mapping.')
        result['favorite'] = favorite == 'true'
    if 'personal_rating' in mapped:
        if config['score_scale'] == 'faces':
            score = mapped_value('personal_rating', '')
            if score not in ('1', '50', '100', 'unrated'):
                raise ValueError('Choose a valid face rating.')
            result['personal_rating'] = None if score == 'unrated' else int(score)
        else:
            try:
                score = Decimal(str(mapped['personal_rating']).strip().replace(',', '.'))
                scale = Decimal(config['score_scale'])
                if not score.is_finite() or not 0 <= score <= scale:
                    raise ValueError()
                result['personal_rating'] = max(1, int((score * 100 / scale).quantize(Decimal('1'), rounding=ROUND_HALF_UP))) if score else None
            except (ValueError, InvalidOperation) as error:
                raise ValueError(f'Score must be between 0 and {config["score_scale"]}.') from error
    if 'date_added' in mapped:
        try:
            text = str(mapped['date_added']).strip()
            fmt = config['date_format']
            date = datetime.fromisoformat(text.replace('Z', '+00:00')) if fmt == 'iso' else datetime.strptime(text, {'dmy': '%d/%m/%Y', 'mdy': '%m/%d/%Y', 'dots': '%d.%m.%Y'}[fmt])
            if timezone.is_aware(date):
                date = timezone.make_naive(date, timezone.get_default_timezone())
            result['date_added'] = date.isoformat()
        except ValueError as error:
            raise ValueError('Activity date does not match the selected date format.') from error
    ids = {}
    if 'provider_ids' in mapped:
        ids = json.loads(mapped['provider_ids'])
        if not isinstance(ids, dict):
            raise ValueError('Provider IDs must be a JSON object.')
    source = canonical_source(mapped.get('source')) or SOURCES[kind]
    if 'source_id' in mapped:
        if ids.get(source) not in ('', None) and str(ids[source]) != str(mapped['source_id']):
            raise ValueError(f'Conflicting {source} IDs.')
        ids[source] = mapped['source_id']
    for field, provider in ID_FIELDS.items():
        if field in mapped:
            if provider in ids and str(ids[provider]) != str(mapped[field]):
                raise ValueError(f'Conflicting {provider} IDs.')
            ids[provider] = mapped[field]
    for provider, value in ids.items():
        if value not in ('', None):
            provider = canonical_source(provider)
            identity = clean_id(provider, value)
            if provider in result['provider_ids'] and result['provider_ids'][provider] != identity:
                raise ValueError(f'Conflicting {provider} IDs.')
            result['provider_ids'][provider] = identity
    permitted = {'tmdb', 'imdb'} if kind in ('movie', 'tv') else {'anilist', 'mal'} if kind in ('anime', 'manga') else {'openlib', 'isbn'} if kind == 'book' else {SOURCES[kind]}
    if set(result['provider_ids']) - permitted:
        raise ValueError('The provider ID does not belong to the selected media type.')
    if kind != 'tv' and '_s' in result['provider_ids'].get('tmdb', ''):
        raise ValueError('TMDB season IDs belong to TV Shows.')
    if not result['title'] and not result['provider_ids']:
        raise ValueError('This row has neither a title nor a provider ID.')
    for field in ('cover_url', 'banner_url'):
        value = str(mapped.get(field, ''))
        if value.startswith(('https://', 'http://', settings.MEDIA_URL)):
            result[field] = value
    return result


def existing(kind, ids, *, trusted=False):
    if not trusted and SOURCES[kind] in ids:
        ids = {SOURCES[kind]: ids[SOURCES[kind]]}
    query = Q()
    for source, identity in ids.items():
        query |= Q(**{f'provider_ids__{source}': str(identity)})
        if source in ('tmdb', 'anilist', 'mal', 'igdb') and str(identity).isdigit():
            query |= Q(**{f'provider_ids__{source}': int(identity)})
    return MediaItem.objects.filter(query, media_type=kind).only('id').first() if ids else None


def match_row(http, row, query=None):
    ids, kind = row['provider_ids'], row['media_type']
    native = next((source for source in (SOURCES[kind], 'mal') if ids.get(source)), None)
    if native and query is None and not (native == 'openlib' and ids[native].endswith('E')):
        candidate = {'source': native, 'id': ids[native], 'title': row['title'] or f'{native} {ids[native]}',
                     'year': row.get('release_year', ''), 'poster': '', 'method': 'Provider ID supplied'}
        return 'ready', candidate, [candidate]
    candidates = search_candidates(http, row, query)
    title = normalized_title(query if query is not None else row['title'])
    year = row.get('release_year')
    for candidate in candidates:
        names = [candidate['title'], *candidate.get('aliases', [])]
        exact = title in [normalized_title(name) for name in names if name]
        same_year = not year or year == candidate.get('year')
        creators = {normalized_title(name) for name in row.get('creators', [])}
        same_creator = not creators or bool(creators & {normalized_title(name) for name in candidate.get('creators', [])})
        candidate['high_confidence'] = exact and same_year and same_creator and (kind not in ('book', 'music') or bool(creators))
        candidate['method'] = 'Title / metadata match'
    candidates.sort(key=lambda item: (item.get('high_confidence', False), item.get('year') == year), reverse=True)
    confident = [item for item in candidates if item.get('high_confidence')]
    if query is None and (ids.get('imdb') or ids.get('isbn') or ids.get('openlib', '').endswith('E')) and len(candidates) == 1:
        confident = candidates
    return ('ready', confident[0], candidates) if len(confident) == 1 else ('review' if candidates else 'unmatched', None, candidates)


class TransferPaused(Exception):
    pass


def check_pause(job_id):
    with store() as db:
        result = db.execute('SELECT stop_requested FROM jobs WHERE id=?', (job_id,)).fetchone()
    if not result or result['stop_requested']:
        raise TransferPaused()


def _read_csv(job_id):
    task = job(job_id)
    path = root() / f'{job_id}.upload.csv'
    config = task['config']
    encoding = config.get('encoding', 'utf-8-sig')
    with path.open('r', encoding=encoding, newline='') as stream:
        sample = stream.read(8192)
        stream.seek(0)
        delimiter = config.get('delimiter')
        if not delimiter:
            try:
                delimiter = csv.Sniffer().sniff(sample, delimiters=',;\t|').delimiter
            except csv.Error:
                delimiter = ','
        reader = csv.reader(stream, delimiter=delimiter, strict=True)
        headers = next(reader, None)
        if not headers or len(headers) > 100 or any(not header.strip() or len(header) > 200 for header in headers) or len(set(headers)) != len(headers):
            raise ValueError('CSV needs a header row with unique, non-empty column names (maximum 100 columns).')
        if any(header.lstrip().startswith(('=', '+', '-', '@')) for header in headers):
            raise ValueError('Rename column headers that begin with =, +, - or @ before importing.')
        update_job(job_id, headers=headers, message='Reading CSV rows')
        batch = []
        number = 0
        with store() as db:
            # A resumed read restarts staging only; no library data has been written.
            db.execute('DELETE FROM rows WHERE job_id=?', (job_id,))
            for values in reader:
                if not any(value.strip() for value in values):
                    continue
                if number % 100 == 0:
                    check_pause(job_id)
                if len(values) != len(headers):
                    raise ValueError(f'CSV record {number + 1} has {len(values)} columns; expected {len(headers)}. Check the delimiter and quoting.')
                number += 1
                if number > MAX_ROWS:
                    raise ValueError(f'Import at most {MAX_ROWS:,} items per file.')
                batch.append((job_id, number, _json(dict(zip(headers, values)))))
                if len(batch) >= 100:
                    db.execute('BEGIN')
                    db.executemany('INSERT INTO rows(job_id,number,raw) VALUES(?,?,?)', batch)
                    db.execute('COMMIT')
                    batch.clear()
                    update_job(job_id, processed=number, message='Reading CSV rows')
            if batch:
                db.executemany('INSERT INTO rows(job_id,number,raw) VALUES(?,?,?)', batch)
    if not number:
        raise ValueError('The CSV contains no items.')
    update_job(job_id, state='mapping', total=number, processed=number, message='Choose which columns to import')
    path.unlink(missing_ok=True)


def _match(job_id, http):
    task = job(job_id)
    config = task['config']
    with store() as db:
        pending = db.execute("SELECT COUNT(*) FROM rows WHERE job_id=? AND state='pending'", (job_id,)).fetchone()[0]
    processed = task['total'] - pending
    with store() as db:
        for record in db.execute("SELECT * FROM rows WHERE job_id=? AND state='pending' ORDER BY number", (job_id,)):
            check_pause(job_id)
            try:
                normalized = normalize(_raw(record), config)
            except (ValueError, TypeError, InvalidOperation) as error:
                row_update(job_id, record['number'], state='invalid', error=str(error))
            else:
                local = existing(normalized['media_type'], normalized['provider_ids'])
                if local:
                    row_update(job_id, record['number'], normalized=normalized, state='existing', item_id=local.pk, error='Already in your library; kept unchanged.')
                else:
                    key = _json({field: normalized.get(field) for field in ('media_type', 'title', 'release_year', 'creators', 'provider_ids')})
                    with store() as cache_db:
                        cached = cache_db.execute('SELECT value FROM cache WHERE job_id=? AND key=?', (job_id, key)).fetchone()
                    if cached:
                        state, match, candidates = json.loads(cached['value'])
                    else:
                        try:
                            state, match, candidates = match_row(http, normalized)
                        except ProviderError as error:
                            if error.retryable:
                                raise
                            row_update(job_id, record['number'], normalized=normalized, state='failed', error=str(error))
                            processed += 1
                            update_job(job_id, processed=processed, message='Matching items')
                            continue
                        with store() as cache_db:
                            cache_db.execute('INSERT OR REPLACE INTO cache VALUES(?,?,?)', (job_id, key, _json([state, match, candidates])))
                    local = existing(normalized['media_type'], {match['source']: match['id']}) if match else None
                    row_update(job_id, record['number'], normalized=normalized, state='existing' if local else state,
                               match=match, candidates=candidates, item_id=local.pk if local else None, error='Already in your library; kept unchanged.' if local else '')
            processed += 1
            update_job(job_id, processed=processed, message='Matching items')
    update_job(job_id, state='review', message='Review matches before importing')


def _save_row(job_id, record, http):
    row = json.loads(record['normalized'])
    match = json.loads(record['match'])
    ids = {**row['provider_ids'], match['source']: match['id']}
    local = existing(row['media_type'], ids)
    if local:
        row_update(job_id, record['number'], state='existing', item_id=local.pk, error='Already in your library; kept unchanged.')
        return
    if str(match['id']).startswith('custom_'):
        if not row['title']:
            raise ValueError('Custom items need a title.')
        prepared = {'item': {'title': row['title'], 'media_type': row['media_type'],
                             'source': SOURCES[row['media_type']],
                             'provider_ids': {**ids, SOURCES[row['media_type']]: match['id']}}}
        for field in ('release_date', 'overview', 'genres', 'creators', 'cover_url', 'banner_url'):
            if field in row:
                prepared['item'][field] = row[field]
    else:
        prepared = prepare_item(http, row['media_type'], match)
    data = prepared['item']
    # Persist authoritative IDs returned by the provider, not unchecked alternate IDs from a CSV.
    for provider, identity in data['provider_ids'].items():
        if provider in row['provider_ids'] and str(row['provider_ids'][provider]) != str(identity):
            raise ValueError(f'The provider returned a conflicting {provider} ID. Check the mapped ID columns.')
    for field in ('release_date', 'overview', 'genres', 'creators'):
        if field in row:
            data[field] = row[field]
    for field in PERSONAL:
        if field in row:
            data[field] = datetime.fromisoformat(row[field]) if field == 'date_added' else row[field]
    # Network and image preparation finish before this short write transaction.
    with transaction.atomic():
        local = existing(row['media_type'], data['provider_ids'], trusted=True)
        if local:
            row_update(job_id, record['number'], state='existing', item_id=local.pk, error='Already in your library; kept unchanged.')
            return
        if data.get('favorite'):
            last = MediaItem.objects.filter(favorite=True).aggregate(last=Max('favorite_position'))['last'] or 0
            data['favorite_position'] = last + 1
        item = MediaItem.objects.create(**data)
        Screenshot.objects.bulk_create([Screenshot(item=item, url=shot['url'], is_full_url=shot.get('is_full_url', False), position=index + 1)
                                       for index, shot in enumerate(prepared.get('screenshots', []))])
        MusicVideo.objects.bulk_create([MusicVideo(item=item, url=video['url'], position=video.get('position', index + 1))
                                       for index, video in enumerate(prepared.get('music_videos', []))])
        for title in row.get('collections', []):
            matches = list(Collection.objects.filter(title=title).order_by('position', 'pk')[:2])
            if len(matches) > 1:
                raise ValueError(f'Multiple collections are named "{title}". Rename them or ignore the Collections column.')
            if matches:
                collection = matches[0]
            else:
                last = Collection.objects.aggregate(last=Max('position'))['last'] or 0
                collection = Collection.objects.create(title=title, position=last + 1)
            last = collection.collectionitem_set.aggregate(last=Max('position'))['last'] or 0
            CollectionItem.objects.create(collection=collection, item=item, position=last + 1)
    # On a crash after commit, the next attempt finds the same provider IDs and skips it.
    row_update(job_id, record['number'], state='imported', item_id=item.pk, error='')


def _import(job_id, http):
    with store() as db:
        total = db.execute("SELECT COUNT(*) FROM rows WHERE job_id=? AND state='ready'", (job_id,)).fetchone()[0]
    update_job(job_id, total=total, processed=0, message='Importing matched items')
    with store() as db:
        for index, record in enumerate(db.execute("SELECT * FROM rows WHERE job_id=? AND state='ready' ORDER BY number", (job_id,)), 1):
            check_pause(job_id)
            try:
                _save_row(job_id, record, http)
            except ProviderError as error:
                if error.retryable:
                    raise
                row_update(job_id, record['number'], state='failed', error=str(error))
            except TransferPaused:
                raise
            except ValueError as error:
                row_update(job_id, record['number'], state='failed', error=str(error))
            except Exception as error:
                logger.exception('CSV row import failed')
                row_update(job_id, record['number'], state='failed', error=str(error))
            update_job(job_id, processed=index, message='Importing matched items')
    update_job(job_id, state='completed', message='Import finished. Existing items were kept unchanged.')


def safe_cells(values):
    result, escaped = {}, []
    for key, value in values.items():
        text = '' if value is None else str(value)
        if text.startswith(('=', '+', '-', '@', '\t', '\r')) or text.lstrip().startswith(('=', '+', '-', '@')):
            text = "'" + text
            escaped.append(key)
        result[key] = text
    result['_mj_csv_version'] = '1'
    result['_mj_escaped_fields'] = _json(escaped)
    return result


def _export(job_id):
    task = job(job_id)
    kinds = task['config'].get('media_types') or list(TYPE_LABELS)
    if not isinstance(kinds, list) or not set(kinds) <= set(TYPE_LABELS):
        raise ValueError('Invalid media types for export.')
    items = MediaItem.objects.filter(media_type__in=kinds).order_by('favorite_position', 'id')
    path = root() / f'{job_id}.export.csv'
    with transaction.atomic():
        total = items.count()
        update_job(job_id, total=total, processed=0, message='Exporting library items')
        memberships = {}
        for item_id, title, position in CollectionItem.objects.filter(item__media_type__in=kinds).order_by('position').values_list('item_id', 'collection__title', 'position'):
            memberships.setdefault(item_id, []).append((title, position))
        with path.open('w', encoding='utf-8-sig', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=EXPORT_FIELDS, quoting=csv.QUOTE_ALL)
            writer.writeheader()
            for index, item in enumerate(items.iterator(chunk_size=200), 1):
                if index % 20 == 1:
                    check_pause(job_id)
                values = {field: getattr(item, field, '') for field in EXPORT_FIELDS if not field.startswith('_mj_')}
                values['provider_ids'] = _json(item.provider_ids)
                values['release_year'] = (item.release_date or '')[:4]
                for field in ('genres', 'creators'):
                    values[field] = _json(getattr(item, field) or [])
                for field in ('date_added', 'last_updated'):
                    values[field] = getattr(item, field).isoformat() if getattr(item, field) else ''
                values['favorite'] = 'true' if item.favorite else 'false'
                values['collections'] = _json([title for title, _ in memberships.get(item.pk, [])])
                values['collection_positions'] = _json(memberships.get(item.pk, []))
                for field, source in ID_FIELDS.items():
                    values[field] = item.provider_ids.get(source, '')
                writer.writerow(safe_cells(values))
                if index % 20 == 0 or index == total:
                    update_job(job_id, processed=index)
    update_job(job_id, state='completed', message='CSV export ready')


def _research(job_id, http):
    task = job(job_id)
    number = task['config']['research_row']
    with store() as db:
        record = db.execute('SELECT * FROM rows WHERE job_id=? AND number=?', (job_id, number)).fetchone()
    if not record or not record['normalized'] or record['state'] in ('imported', 'existing'):
        raise ValueError('This row cannot be searched.')
    row = json.loads(record['normalized'])
    try:
        _, _, candidates = match_row(http, row, task['config']['research_query'])
    except ProviderError as error:
        if error.retryable:
            raise
        row_update(job_id, number, state='failed', error=str(error))
        update_job(job_id, state='review', message='This search failed. Try another title or review other rows.')
        return
    row_update(job_id, number, state='review' if candidates else 'unmatched', match=None, candidates=candidates, error='')
    update_job(job_id, state='review', message='Search complete. Select a match.')


def _run(job_id):
    stop_heartbeat = threading.Event()
    def heartbeat():
        while not stop_heartbeat.wait(5):
            try:
                update_job(job_id)
            except sqlite3.Error:
                logger.exception('Could not update transfer heartbeat')
    threading.Thread(target=heartbeat, daemon=True).start()
    http = TransferHTTP(lambda: check_pause(job_id))
    acquired = False
    phase = None
    try:
        close_old_connections()
        phase = job(job_id)['phase']
        if phase in ('import', 'export'):
            acquired = BACKUP_LOCK.acquire(blocking=False)
            if not acquired:
                raise ProviderError('Another backup, restore, refresh or transfer is running. Resume after it finishes.', True)
        if phase == 'read':
            _read_csv(job_id)
        elif phase == 'match':
            _match(job_id, http)
        elif phase == 'import':
            _import(job_id, http)
        elif phase == 'research':
            _research(job_id, http)
        elif phase == 'export':
            _export(job_id)
    except TransferPaused:
        update_job(job_id, state='paused', message='Paused. Completed work is kept.')
    except ProviderError as error:
        update_job(job_id, state='paused' if error.retryable else 'error', error=str(error))
    except (ValueError, UnicodeError, csv.Error) as error:
        logger.warning('CSV transfer validation failed: %s', error)
        update_job(job_id, state='error', error=str(error))
    except Exception as error:
        logger.exception('CSV transfer failed')
        update_job(job_id, state='error' if phase == 'read' else 'paused', error=str(error))
    finally:
        stop_heartbeat.set()
        http.close()
        if acquired:
            BACKUP_LOCK.release()
        close_old_connections()


def start(job_id, phase=None):
    task = job(job_id)
    phase = phase or task['phase']
    allowed = {'read': ('new', 'paused', 'error'), 'match': ('values', 'paused'),
               'import': ('review', 'completed', 'paused'), 'research': ('review', 'completed', 'paused'),
               'export': ('new', 'paused', 'error')}
    if phase not in allowed or task['state'] not in allowed[phase] or (task['kind'] == 'export') != (phase == 'export'):
        raise ValueError('This transfer cannot start that step.')
    if task['state'] == 'paused' and task['phase'] != phase:
        raise ValueError('Resume the paused step before starting another step.')
    config = task['config']
    config['started_at'] = time.time()
    with store() as db:
        db.execute('BEGIN IMMEDIATE')
        if db.execute("SELECT 1 FROM jobs WHERE state IN ('running','pausing') AND updated>?", (time.time() - 120,)).fetchone():
            db.execute('ROLLBACK')
            raise ValueError('Another CSV transfer is running. Pause it or wait for it to finish.')
        db.execute("UPDATE jobs SET state='running',phase=?,config=?,stop_requested=0,error='',updated=? WHERE id=?", (phase, _json(config), time.time(), job_id))
        db.execute('COMMIT')
    threading.Thread(target=_run, args=(job_id,), daemon=True).start()


def decisions(job_id, number, action, candidate_index=0):
    task = job(job_id)
    if task['state'] in BUSY:
        raise ValueError('Wait for matching to finish first.')
    with store() as db:
        record = db.execute('SELECT * FROM rows WHERE job_id=? AND number=?', (job_id, number)).fetchone()
    if not record or record['state'] in ('imported', 'existing'):
        raise ValueError('This row cannot be changed.')
    if action == 'skip':
        row_update(job_id, number, state='skipped', error='Skipped by you.')
    elif action == 'approve':
        candidates = json.loads(record['candidates'])
        if not record['normalized'] or not 0 <= candidate_index < len(candidates):
            raise ValueError('Choose a valid candidate.')
        candidate = candidates[candidate_index]
        kind = json.loads(record['normalized'])['media_type']
        local = existing(kind, {candidate['source']: candidate['id']})
        row_update(job_id, number, state='existing' if local else 'ready', match=candidate, item_id=local.pk if local else None, error='Already in your library; kept unchanged.' if local else '')
    else:
        raise ValueError('Unknown review action.')


def review_rows(job_id, page=1, filter_by='review'):
    job(job_id)
    groups = {'review': ('review', 'unmatched', 'invalid', 'failed'), 'ready': ('ready',),
              'all': ('pending', 'review', 'unmatched', 'invalid', 'failed', 'ready', 'existing', 'skipped', 'imported')}
    states = groups.get(filter_by, groups['review'])
    page = max(1, page)
    placeholders = ','.join('?' for _ in states)
    where = f'job_id=? AND state IN ({placeholders})'
    with store() as db:
        total = db.execute('SELECT COUNT(*) FROM rows WHERE ' + where, (job_id, *states)).fetchone()[0]
        page = min(page, max(1, (total + 19) // 20))
        records = db.execute('SELECT * FROM rows WHERE ' + where + ' ORDER BY number LIMIT 20 OFFSET ?', (job_id, *states, (page - 1) * 20)).fetchall()
    result = []
    for record in records:
        raw = _raw(record)
        row = json.loads(record['normalized']) if record['normalized'] else {}
        result.append({'number': record['number'], 'title': row.get('title') or next((raw[key] for key in raw if key.casefold() in ('title', 'name')), 'Untitled row'),
                       'media_type': row.get('media_type'), 'year': row.get('release_year', ''), 'state': record['state'],
                       'error': record['error'], 'match': json.loads(record['match']) if record['match'] else None,
                       'candidates': json.loads(record['candidates'])})
    return {'items': result, 'total': total, 'page': page, 'has_more': page * 20 < total}


def report_csv(job_id):
    task = job(job_id)
    headers = task['headers']
    extras = ['__transfer_status', '__transfer_reason', '__matched_title']
    while set(extras) & set(headers):
        extras = ['_' + name for name in extras]
    fields = list(dict.fromkeys([*headers, *extras, '_mj_csv_version', '_mj_escaped_fields']))
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fields, quoting=csv.QUOTE_ALL)
    writer.writeheader()
    yield '\ufeff' + buffer.getvalue()
    with store() as db:
        for record in db.execute("SELECT * FROM rows WHERE job_id=? AND state NOT IN ('imported','existing') ORDER BY number", (job_id,)):
            values = _raw(record)
            match = json.loads(record['match']) if record['match'] else {}
            values.update({extras[0]: record['state'], extras[1]: record['error'], extras[2]: match.get('title', '')})
            buffer.seek(0)
            buffer.truncate(0)
            writer.writerow(safe_cells(values))
            yield buffer.getvalue()
