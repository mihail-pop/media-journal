"""Provider lookups for CSV transfer. All writes stay in g_transfer."""

import json
import re
import threading
import time
import unicodedata
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

import requests

from core.models import APIKey


SOURCES = {'movie': 'tmdb', 'tv': 'tmdb', 'anime': 'anilist', 'manga': 'anilist',
           'game': 'igdb', 'book': 'openlib', 'music': 'musicbrainz'}
# At least the same spacing as Refresh; applied to every request, not every item.
DELAYS = {'tmdb': 0.2, 'anilist': 2.1, 'igdb': 0.3, 'openlib': 1.1, 'musicbrainz': 1.1}
_RATE_LOCK = threading.Lock()
_NEXT_REQUEST = {}


class ProviderError(Exception):
    def __init__(self, message, retryable=False):
        super().__init__(message)
        self.retryable = retryable


def normalized_title(value):
    value = unicodedata.normalize('NFKD', str(value).casefold())
    return ''.join(c for c in value if (c.isalnum() or c in '+#') and not unicodedata.combining(c))


def canonical_source(value):
    value = str(value or '').strip().casefold()
    return {'openlibrary': 'openlib', 'open library': 'openlib', 'mbid': 'musicbrainz',
            'myanimelist': 'mal'}.get(value, value)


def clean_id(source, value):
    value = str(value).strip()
    # Spreadsheets/exporters sometimes wrap text identifiers as ="0123".
    wrapped = re.fullmatch(r'="([\w\s-]+)"', value)
    if wrapped:
        value = wrapped[1]
    if value.startswith('custom_') and re.fullmatch(r'custom_[\w-]{1,90}', value):
        return value
    if value.startswith(('https://', 'http://', '/')):
        path_text = urlparse(value).path
        if source == 'tmdb':
            match = re.search(r'/(?:movie|tv)/(\d+)(?:-[^/]*)?(?:/season/(\d+))?', path_text)
            if not match:
                raise ValueError('Use a TMDB ID or a TMDB movie, show or season URL.')
            value = match[1] + ('_s' + match[2] if match[2] else '')
        else:
            path = path_text.strip('/').split('/')
            value = next((part for part in reversed(path) if re.fullmatch(r'\d+|tt\d+|OL\d+[WE]|[0-9a-fA-F-]{36}', part)), '')
    if source == 'tmdb' and re.fullmatch(r'[1-9]\d{0,17}_s\d{1,5}', value):
        return value
    if source in ('tmdb', 'anilist', 'mal', 'igdb'):
        value = re.sub(r'\.0+$', '', value)
        if not re.fullmatch(r'[1-9]\d{0,17}', value):
            raise ValueError(f'Invalid {source} ID.')
    elif source == 'imdb':
        if not re.fullmatch(r'tt\d{5,12}', value):
            raise ValueError('IMDb IDs must start with tt.')
    elif source == 'openlib':
        value = value.removesuffix('.json').upper()
        if not re.fullmatch(r'OL\d+[WE]', value):
            raise ValueError('Invalid Open Library work or edition ID.')
    elif source == 'musicbrainz':
        try:
            value = str(uuid.UUID(value))
        except ValueError as error:
            raise ValueError('Invalid MusicBrainz recording ID.') from error
    elif source == 'isbn':
        value = re.sub(r'[-\s]', '', value).upper()
        if not re.fullmatch(r'\d{9}[\dX]|\d{13}', value):
            raise ValueError('Invalid ISBN.')
    else:
        raise ValueError('Unknown provider. Map an ID to its specific provider field.')
    return value


class TransferHTTP:
    def __init__(self, check_cancelled):
        self.check_cancelled = check_cancelled
        self.session = requests.Session()
        self.session.headers['User-Agent'] = 'MediaJournal/CSVTransfer (self-hosted library migration)'
        self.last_error = None

    def request(self, method, url, **kwargs):
        host = urlparse(url).hostname or ''
        source = next((name for suffix, name in (
            ('themoviedb.org', 'tmdb'), ('anilist.co', 'anilist'), ('igdb.com', 'igdb'),
            ('openlibrary.org', 'openlib'), ('musicbrainz.org', 'musicbrainz'), ('twitch.tv', 'igdb')
        ) if host == suffix or host.endswith('.' + suffix)), None)
        if not source:
            raise ValueError('CSV transfer may only query supported provider APIs.')
        kwargs.setdefault('timeout', (5, 30))
        if source == 'musicbrainz':
            from core.services.m_music import mb_session
            kwargs['headers'] = {**mb_session.headers, **kwargs.get('headers', {})}
        self.last_error = None
        for attempt in range(3):
            while True:
                try:
                    self.check_cancelled()
                except Exception as error:
                    self.last_error = error
                    raise
                with _RATE_LOCK:
                    wait = _NEXT_REQUEST.get(source, 0) - time.monotonic()
                    if wait <= 0:
                        _NEXT_REQUEST[source] = time.monotonic() + DELAYS[source]
                        break
                time.sleep(min(wait, 0.2))
            try:
                response = self.session.request(method, url, **kwargs)
            except requests.RequestException:
                self.last_error = ProviderError(f'{source} could not be reached. Resume to retry.', True)
                raise self.last_error from None
            if response.status_code in (429, 502, 503, 504):
                try:
                    wait = min(300, max(5, float(response.headers.get('Retry-After', 5 * (attempt + 1)))))
                except ValueError:
                    wait = 10 * (attempt + 1)
                with _RATE_LOCK:
                    _NEXT_REQUEST[source] = max(_NEXT_REQUEST.get(source, 0), time.monotonic() + wait)
                if attempt < 2:
                    continue
            if not response.ok:
                self.last_error = ProviderError(
                    f'{source} returned HTTP {response.status_code}. Check its API key or resume later.',
                    response.status_code in (401, 403, 429, 502, 503, 504),
                )
                raise self.last_error
            return response
        raise ProviderError(f'{source} is temporarily unavailable.', True)

    def get(self, url, **kwargs):
        return self.request('GET', url, **kwargs)

    def post(self, url, **kwargs):
        return self.request('POST', url, **kwargs)

    def close(self):
        self.session.close()


def _key(source):
    try:
        return APIKey.objects.get(name=source)
    except APIKey.DoesNotExist as error:
        raise ProviderError(f'Add the {source} API key in Settings, then resume.', True) from error


def _candidate(source, identity, title, year='', poster='', creators=None, aliases=None):
    return {'source': source, 'id': str(identity), 'title': title or 'Untitled',
            'year': str(year or '')[:4], 'poster': poster or '',
            'creators': creators or [], 'aliases': aliases or []}


def search_candidates(http, row, query=None):
    """Small search responses, with no per-result detail/cover requests."""
    kind = row['media_type']
    ids = row.get('provider_ids', {})
    source = SOURCES[kind]
    title = query if query is not None else row['title']
    creators = row.get('creators') or []
    if source == 'tmdb':
        params = {'api_key': _key('tmdb').key_1, 'include_adult': 'true'}
        if ids.get('imdb') and query is None:
            params['external_source'] = 'imdb_id'
            data = http.get(f'https://api.themoviedb.org/3/find/{ids["imdb"]}', params=params).json()
            items = data.get('movie_results' if kind == 'movie' else 'tv_results', [])
        else:
            params['query'] = title
            data = http.get(f'https://api.themoviedb.org/3/search/{kind}', params=params).json()
            items = data.get('results', [])
        return [_candidate(source, x['id'], x.get('title') or x.get('name'),
                           x.get('release_date') or x.get('first_air_date'),
                           'https://image.tmdb.org/t/p/w185' + x['poster_path'] if x.get('poster_path') else '',
                           aliases=[x.get('original_title') or x.get('original_name') or '']) for x in items[:10]]
    if source == 'anilist':
        query_text = '''query ($search: String, $type: MediaType) {
          Page(perPage: 10) { media(search: $search, type: $type) {
            id title { english romaji native } synonyms startDate { year }
            coverImage { medium } studios(isMain: true) { nodes { name } }
          } }
        }'''
        data = http.post('https://graphql.anilist.co', json={'query': query_text, 'variables': {'search': title, 'type': kind.upper()}}).json()
        if data.get('errors'):
            raise ProviderError('AniList could not complete the search. Resume to retry.', True)
        return [_candidate(source, x['id'], x['title'].get('english') or x['title'].get('romaji'),
                           (x.get('startDate') or {}).get('year'), (x.get('coverImage') or {}).get('medium'),
                           [s['name'] for s in (x.get('studios') or {}).get('nodes', [])],
                           list(x['title'].values()) + (x.get('synonyms') or []))
                for x in (data.get('data') or {}).get('Page', {}).get('media', [])]
    if source == 'igdb':
        from core.services.m_games import get_igdb_token
        key = _key(source)
        token = get_igdb_token(http=http)
        if not token:
            raise ProviderError('IGDB authentication failed. Check its API keys.', True)
        query_text = f'search {json.dumps(title, ensure_ascii=False)}; fields id,name,alternative_names.name,first_release_date,cover.url,involved_companies.company.name; limit 10;'
        data = http.post('https://api.igdb.com/v4/games', headers={'Client-ID': key.key_1, 'Authorization': 'Bearer ' + token}, data=query_text).json()
        return [_candidate(source, x['id'], x.get('name'),
                           datetime.fromtimestamp(x['first_release_date'], timezone.utc).year if x.get('first_release_date') else '',
                           ('https:' + x['cover']['url']).replace('t_thumb', 't_cover_small') if (x.get('cover') or {}).get('url') else '',
                           [c['company']['name'] for c in x.get('involved_companies', []) if c.get('company')],
                           [a.get('name', '') for a in x.get('alternative_names', [])]) for x in data]
    if source == 'openlib':
        if ids.get('openlib', '').endswith('E') and query is None:
            edition = http.get(f'https://openlibrary.org/books/{ids["openlib"]}.json').json()
            return [_candidate(source, w['key'].split('/')[-1], edition.get('title'), edition.get('publish_date')) for w in edition.get('works', [])]
        params = {'limit': 10, 'fields': 'key,title,author_name,first_publish_year,cover_i'}
        params.update({'isbn': ids['isbn']} if ids.get('isbn') and query is None else {'title': title})
        if creators and not ids.get('isbn'):
            params['author'] = creators[0]
        data = http.get('https://openlibrary.org/search.json', params=params).json()
        return [_candidate(source, x['key'].split('/')[-1], x.get('title'), x.get('first_publish_year'),
                           f'https://covers.openlibrary.org/b/id/{x["cover_i"]}-S.jpg' if x.get('cover_i') else '', x.get('author_name', [])) for x in data.get('docs', [])]
    # MusicBrainz recording IDs match the app's music items, not releases/albums.
    def escaped(text):
        return re.sub(r'([+\-!(){}\[\]^"~*?:\\/])', r'\\\1', text)
    query_text = f'recording:"{escaped(title)}"'
    if creators:
        query_text += f' AND artist:"{escaped(creators[0])}"'
    data = http.get('https://musicbrainz.org/ws/2/recording', params={'query': query_text, 'fmt': 'json', 'limit': 10}).json()
    return [_candidate(source, x['id'], x.get('title'), x.get('first-release-date'), creators=[a.get('name', '') for a in x.get('artist-credit', [])]) for x in data.get('recordings', [])]


def prepare_item(http, kind, match):
    """Reuse normal loaders, but defer their database writes for an atomic import."""
    from core.services.m_anime_manga import save_anilist_item
    from core.services.m_books import save_openlib_item
    from core.services.m_games import save_igdb_item
    from core.services.m_movies_tvshows import save_tmdb_item, save_tmdb_season
    from core.services.m_music import save_musicbrainz_item
    source, identity = match['source'], match['id']
    if source in ('tmdb', 'igdb'):
        _key(source)
    kwargs = {'http': http, 'prepare_only': True}
    try:
        if source == 'tmdb':
            if '_s' in identity:
                show, season = identity.split('_s')
                result = save_tmdb_season(show, int(season), **kwargs)
            else:
                result = save_tmdb_item(kind, identity, **kwargs)
        elif source in ('anilist', 'mal'):
            result = save_anilist_item(kind, **{'anilist_id' if source == 'anilist' else 'mal_id': identity}, **kwargs)
        else:
            result = {'igdb': save_igdb_item, 'openlib': save_openlib_item, 'musicbrainz': save_musicbrainz_item}[source](identity, **kwargs)
    except Exception:
        if http.last_error:
            raise http.last_error
        raise
    if http.last_error:
        raise http.last_error
    if not isinstance(result, dict) or not isinstance(result.get('item'), dict):
        if hasattr(result, 'content'):
            message = json.loads(result.content).get('error', 'Provider returned no item.')
        else:
            message = 'Provider returned no item.'
        raise ProviderError(message)
    return result
