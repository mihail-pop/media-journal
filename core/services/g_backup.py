"""Backup snapshots and merge restores, independent of page/refresh logic."""

import hashlib
import json
import ntpath
import os
import re
import shutil
import tempfile
import threading
import time
import zipfile
from collections import Counter, defaultdict, deque
from datetime import datetime, timedelta
from pathlib import Path, PurePosixPath
from urllib.parse import quote

from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.serializers import deserialize, serialize
from django.core.serializers.json import DjangoJSONEncoder
from django.db import connection, models, transaction
from django.db.models import Q
from django.utils import timezone


BACKUP_LOCK = threading.Lock()
DATA_FILE = 'backup_data.json'
MANIFEST_FILE = 'backup_manifest.json'
STAGING_PREFIX = '.media-journal-restore-'
CHILD_IDENTITIES = {
    'core.collection': ('date_created', 'title'),
    'core.collectionitem': ('collection', 'item'),
    'core.mediapersonlink': ('item', 'person', 'media_role'),
    'core.screenshot': ('item', 'url', 'date_added'),
    'core.musicvideo': ('item', 'url', 'date_added'),
    'core.mediaitemlog': ('item', 'date_added'),
    'core.calendarevent': ('item', 'date_added'),
}


class BackupCancelled(Exception):
    pass


class BackupJSONEncoder(DjangoJSONEncoder):
    def default(self, value):
        if isinstance(value, datetime):
            # Django's default encoder truncates datetimes to milliseconds.
            encoded = value.isoformat()
            return encoded[:-6] + 'Z' if encoded.endswith('+00:00') else encoded
        return super().default(value)


def _identity_value(value, legacy_datetime_precision):
    if legacy_datetime_precision and isinstance(value, datetime):
        return value.replace(microsecond=value.microsecond // 1000 * 1000)
    return value


def check_cancelled(task):
    if task._cancel_event.is_set():
        raise BackupCancelled()


def _report_progress(task, processed, total, message):
    # Polling reads these values once a second; avoid updating on every small file.
    now = time.monotonic()
    previous = getattr(task, '_last_progress_report', None)
    if previous is None or previous[0] != message or now - previous[1] >= 0.25 or processed == total:
        task.update_progress(processed, total, message)
        task._last_progress_report = (message, now)


def backup_models():
    # Include explicit through tables and future core models automatically.
    return [Group, get_user_model(), *apps.get_app_config('core').get_models()]


def _scan_error(error):
    raise error


def export_archive(task):
    root = Path(settings.MEDIA_ROOT).resolve()
    task.message = 'Gathering database data'
    with transaction.atomic():
        objects = []
        for model in backup_models():
            check_cancelled(task)
            objects.extend(model.objects.all().order_by(model._meta.pk.name))
        data = serialize('json', objects, use_natural_foreign_keys=True, cls=BackupJSONEncoder)
        counts = Counter(obj._meta.label_lower for obj in objects)
        counts.update({model._meta.label_lower: 0 for model in backup_models()})

        task.message = 'Scanning files'
        files = []
        if root.exists() and not root.is_dir():
            raise ValueError('The configured media directory is not a directory.')
        # A fresh library may have database records but no media directory yet.
        directories = os.walk(root, onerror=_scan_error) if root.exists() else ()
        for directory, dirs, names in directories:
            check_cancelled(task)
            dirs[:] = [name for name in dirs if not name.startswith(STAGING_PREFIX)]
            for name in dirs:
                if (Path(directory) / name).is_symlink():
                    raise ValueError(f'Cannot archive a symbolic-link directory: {name}')
            for name in names:
                path = Path(directory) / name
                if not path.resolve().is_relative_to(root):
                    raise ValueError(f'Media file points outside the media directory: {path.name}')
                relative = path.relative_to(root).as_posix()
                if relative in (DATA_FILE, MANIFEST_FILE):
                    raise ValueError(f'Reserved backup filename in media directory: {relative}')
                files.append((path, relative))

        descriptor, task.result_path = tempfile.mkstemp(prefix='media_journal_backup_', suffix='.zip')
        os.close(descriptor)
        total = len(files) + 2
        with zipfile.ZipFile(task.result_path, 'w', zipfile.ZIP_STORED) as archive:
            archive.writestr(DATA_FILE, data)
            archive.writestr(MANIFEST_FILE, json.dumps({
                'format_version': 2, 'models': counts, 'file_count': len(files),
                'datetime_precision': 'microseconds',
            }))
            for index, (path, relative) in enumerate(files, 3):
                check_cancelled(task)
                # A missing/unreadable file invalidates the backup, never skip it.
                archive.write(path, relative)
                if index % 100 == 0 or index == total:
                    task.update_progress(index, total, 'Archiving')
        check_cancelled(task)


def _archive_path(name, root):
    name = name.replace('\\', '/')
    parts = PurePosixPath(name)
    if (not name or name.startswith('/') or ntpath.splitdrive(name)[0]
            or any(part in ('', '.', '..') or ':' in part for part in name.split('/'))
            or parts.parts[0].startswith(STAGING_PREFIX)):
        raise ValueError(f'Invalid backup file path: {name}')
    target = root.joinpath(*parts.parts)
    if not target.resolve().is_relative_to(root):
        raise ValueError(f'Backup file points outside the media directory: {name}')
    return parts.as_posix(), target


def _read_records(archive, registry):
    names = archive.namelist()
    data_file = DATA_FILE if DATA_FILE in names else 'media_items.json'
    if data_file not in names:
        raise ValueError('The archive does not contain backup database data.')
    records = json.loads(archive.read(data_file))
    if not isinstance(records, list):
        raise ValueError('Invalid backup database data.')
    manifest = None
    if MANIFEST_FILE in names:
        manifest = json.loads(archive.read(MANIFEST_FILE))
        if manifest.get('format_version') != 2:
            raise ValueError('Unsupported backup version. Please update Media Journal.')
        counts = Counter(record['model'] for record in records)
        expected = manifest['models']
        if any(counts[name] != count for name, count in expected.items()) or set(counts) - set(expected):
            raise ValueError('The backup record counts do not match its manifest.')
    seen = set()
    for record in records:
        if not isinstance(record, dict) or record.get('model') not in registry:
            raise ValueError('The backup contains an unsupported database model.')
        if not isinstance(record.get('fields'), dict) or record.get('pk') is None:
            raise ValueError('The backup contains an invalid database record.')
        identity = (record['model'], str(record['pk']))
        if identity in seen:
            raise ValueError(f'Duplicate backup record: {identity}')
        seen.add(identity)
        fields = record['fields']
        if record['model'] == 'core.mediaitem' and 'source_id' in fields:
            # Backups made before the provider_ids migration.
            source_id = fields.pop('source_id')
            fields.setdefault('provider_ids', {})[fields['source']] = str(source_id)
        if record['model'] == 'core.favoriteperson':
            fields.setdefault('source', 'custom' if str(fields.get('person_id', '')).startswith('custom_')
                              else 'anilist' if fields.get('type') == 'character' else 'tmdb')
    return records, manifest, data_file


def _restore_order(registry):
    ordered = []
    remaining = set(registry.values())
    while remaining:
        ready = []
        for model in remaining:
            dependencies = {
                field.remote_field.model for field in model._meta.fields + model._meta.many_to_many
                if field.is_relation and field.remote_field.model != model
            }
            if not dependencies.intersection(remaining):
                ready.append(model)
        if not ready:
            raise ValueError('Cannot restore models with circular dependencies.')
        ordered.extend(sorted(ready, key=lambda model: model._meta.label_lower))
        remaining.difference_update(ready)
    return ordered


def _match_object(obj, fields, used, indexes, legacy_datetime_precision):
    model = type(obj)
    query = model.objects.all()

    def first(candidates):
        return next((row for row in candidates.order_by('pk').iterator(chunk_size=100) if row.pk not in used), None)

    name = model._meta.label_lower
    if model == get_user_model():
        return first(query.filter(**{model.USERNAME_FIELD: getattr(obj, model.USERNAME_FIELD)}))
    if model == Group or name in ('core.apikey', 'core.navitem'):
        return first(query.filter(name=obj.name))
    if name == 'core.appsettings':
        return first(query)
    if name == 'core.mediaitem':
        query = query.filter(source=obj.source, media_type=obj.media_type)
        source_id = obj.provider_ids.get(obj.source)
        if source_id is not None:
            key = f'provider_ids__{obj.source}'
            identities = Q(**{key: str(source_id)}) | Q(**{key: source_id})
            if isinstance(source_id, str) and source_id.isdecimal():
                identities |= Q(**{key: int(source_id)})
            return first(query.filter(identities))
        query = query.filter(title=obj.title)
        if legacy_datetime_precision:
            start = _identity_value(obj.date_added, True)
            return first(query.filter(date_added__gte=start, date_added__lt=start + timedelta(milliseconds=1)))
        return first(query.filter(date_added=obj.date_added))
    if name == 'core.favoriteperson':
        source = obj.resolved_source
        legacy = 'anilist' if obj.type == 'character' else 'tmdb'
        sources = Q(source=source)
        if source == legacy:
            sources |= Q(source='') & ~Q(person_id__startswith='custom_')
        elif source == 'custom':
            sources |= Q(source='', person_id__startswith='custom_')
        query = query.filter(sources, type=obj.type)
        return first(query.filter(person_id=obj.person_id)) if obj.person_id else first(query.filter(name=obj.name))

    keys = CHILD_IDENTITIES.get(name, tuple(fields))
    lookup = {}
    for key in keys:
        if key in fields:
            field = model._meta.get_field(key)
            lookup[field.attname] = getattr(obj, field.attname)
    if not lookup:
        return None
    if name in CHILD_IDENTITIES:
        # One scan per child table, rather than a growing IN clause or a full
        # per-image scan for games with tens of thousands of screenshots.
        key = (model, tuple(lookup))
        if key not in indexes:
            index = defaultdict(deque)
            for row in query.order_by('pk').values_list('pk', *lookup).iterator():
                identity = tuple(_identity_value(value, legacy_datetime_precision) for value in row[1:])
                index[identity].append(row[0])
            indexes[key] = index
        identity = tuple(_identity_value(value, legacy_datetime_precision) for value in lookup.values())
        candidates = indexes[key].get(identity, deque())
        while candidates:
            pk = candidates.popleft()
            if pk not in used:
                return query.get(pk=pk)
        return None
    return first(query.filter(**lookup))


def _restore_database(records, registry, task, total, legacy_datetime_precision=False):
    grouped = defaultdict(list)
    for record in records:
        grouped[record['model']].append(record)
    id_map = {}
    used = defaultdict(set)
    indexes = {}
    processed = 0
    _report_progress(task, 0, total, 'Restoring database')
    for model in _restore_order(registry):
        label = model._meta.label_lower
        for record in grouped[label]:
            check_cancelled(task)
            old_id = record['pk']
            try:
                # Deserialize by model phase, so auth natural keys can resolve.
                restored = next(deserialize('python', [record]))
                obj = restored.object
                old_id = obj.pk
                for field in model._meta.fields:
                    if not field.is_relation or field.name not in record['fields']:
                        continue
                    related_id = getattr(obj, field.attname)
                    if related_id is None:
                        continue
                    key = (field.remote_field.model._meta.label_lower, related_id)
                    if key not in id_map:
                        raise ValueError(f'Missing backup parent for {field.name}: {related_id}')
                    setattr(obj, field.attname, id_map[key])

                existing = _match_object(obj, record['fields'], used[label], indexes, legacy_datetime_precision)
                target = existing or obj
                if existing:
                    # Old backups must not reset settings/fields they never contained.
                    for field in model._meta.fields:
                        if not field.primary_key and field.name in record['fields']:
                            value = getattr(obj, field.attname)
                            current = getattr(target, field.attname)
                            if (legacy_datetime_precision and isinstance(value, datetime)
                                    and isinstance(current, datetime)
                                    and _identity_value(value, True) == _identity_value(current, True)):
                                value = current
                            setattr(target, field.attname, value)
                else:
                    target.pk = None  # Never overwrite an unrelated row with a backup ID.
                    for field in model._meta.fields:
                        if (getattr(field, 'auto_now', False) or getattr(field, 'auto_now_add', False)) and getattr(target, field.attname) is None:
                            setattr(target, field.attname, timezone.now())
                # raw=True preserves auto_now/auto_now_add values from the backup.
                models.Model.save_base(target, raw=True, force_insert=existing is None)
                id_map[(label, old_id)] = target.pk
                used[label].add(target.pk)
                for field_name, values in (restored.m2m_data or {}).items():
                    raw_values = record['fields'][field_name]
                    if raw_values and not isinstance(raw_values[0], (list, tuple)):
                        related_model = model._meta.get_field(field_name).remote_field.model
                        # Legacy numeric auth relationships need backed-up parents too.
                        values = [id_map[(related_model._meta.label_lower, value)] for value in values]
                    getattr(target, field_name).set(values)
            except Exception as error:
                raise ValueError(f'Cannot restore {label} record {old_id}: {error}') from error
            processed += 1
            _report_progress(task, processed, total, 'Restoring database')
    return processed


def _same_file(first, second, task):
    # Do not use a stat/mtime cache: restored files can share metadata but differ.
    if first.stat().st_size != second.stat().st_size:
        return False
    with first.open('rb') as left, second.open('rb') as right:
        while True:
            check_cancelled(task)
            chunk = left.read(1024 * 1024)
            if chunk != right.read(1024 * 1024):
                return False
            if not chunk:
                return True


def _plan_files(files, records, root, task):
    """Keep existing images when a merging backup contains a different file at the same path."""
    planned = []
    replacements = {}
    _report_progress(task, 0, len(files), 'Checking existing files')
    for index, (incoming, relative, target) in enumerate(files, 1):
        check_cancelled(task)
        if target.exists():
            if not target.is_file():
                raise ValueError(f'A directory blocks restored file: {relative}')
            if not _same_file(incoming, target, task):
                digest = hashlib.sha256()
                with incoming.open('rb') as source:
                    while chunk := source.read(1024 * 1024):
                        check_cancelled(task)
                        digest.update(chunk)
                original = PurePosixPath(relative)
                renamed = original.with_name(f'{original.stem}_restored_{digest.hexdigest()[:16]}{original.suffix}')
                relative, target = _archive_path(renamed.as_posix(), root)
                if target.exists() and (not target.is_file() or not _same_file(incoming, target, task)):
                    raise ValueError(f'Conflicting restored filename: {relative}')
                old = original.as_posix()
                replacements[old] = relative
                prefix = settings.MEDIA_URL.rstrip('/') + '/'
                replacements[prefix + old] = prefix + relative
                replacements[prefix + quote(old, safe='/')] = prefix + quote(relative, safe='/')
        planned.append((incoming, relative, target))
        _report_progress(task, index, len(files), 'Checking existing files')

    # Also rewrite local image URLs embedded in notes/descriptions, not just URL fields.
    local_url = re.compile(re.escape(settings.MEDIA_URL.rstrip('/') + '/') + r'''[^\s"'<>\)\?#]+''')

    def rewrite(value):
        if isinstance(value, dict):
            return {key: rewrite(child) for key, child in value.items()}
        if isinstance(value, list):
            return [rewrite(child) for child in value]
        if isinstance(value, str):
            if value in replacements:
                return replacements[value]
            return local_url.sub(lambda match: replacements.get(match[0], match[0]), value)
        return value

    if replacements:
        _report_progress(task, 0, len(records), 'Updating file references')
        for index, record in enumerate(records, 1):
            record['fields'] = rewrite(record['fields'])
            _report_progress(task, index, len(records), 'Updating file references')
    return planned


def restore_archive(task):
    root = Path(settings.MEDIA_ROOT).resolve()
    root.mkdir(parents=True, exist_ok=True)
    registry = {model._meta.label_lower: model for model in backup_models()}
    task.message = 'Validating backup and preparing files'
    # Staging on the media volume permits atomic moves, including Docker mounts.
    stage = Path(tempfile.mkdtemp(prefix=STAGING_PREFIX, dir=root))
    installed = []
    keep_recovery_files = False
    try:
        with zipfile.ZipFile(task.upload_path) as archive:
            records, manifest, data_file = _read_records(archive, registry)
            files = []
            seen = set()
            file_count = sum(
                not info.is_dir() and info.filename.replace('\\', '/') not in (data_file, MANIFEST_FILE)
                for info in archive.infolist()
            )
            _report_progress(task, 0, file_count, 'Preparing files')
            for info in archive.infolist():
                check_cancelled(task)
                if info.is_dir():
                    continue
                relative, target = _archive_path(info.filename, root)
                key = os.path.normcase(relative)
                if key in seen:
                    raise ValueError(f'Duplicate backup filename: {relative}')
                seen.add(key)
                if relative in (data_file, MANIFEST_FILE):
                    continue
                incoming = stage / 'incoming' / relative
                incoming.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info) as source, incoming.open('wb') as destination:
                    while chunk := source.read(1024 * 1024):
                        check_cancelled(task)
                        destination.write(chunk)
                files.append((incoming, relative, target))
                _report_progress(task, len(files), file_count, 'Preparing files')
            if manifest and len(files) != manifest['file_count']:
                raise ValueError('The backup file count does not match its manifest.')

        files = _plan_files(files, records, root, task)
        total = max(1, len(records) + len(files))
        try:
            with transaction.atomic():
                legacy_precision = not manifest or manifest.get('datetime_precision') != 'microseconds'
                processed = _restore_database(records, registry, task, total, legacy_precision)
                connection.check_constraints(table_names=[model._meta.db_table for model in registry.values()])
                _report_progress(task, processed, total, 'Restoring media files')
                for incoming, relative, target in files:
                    check_cancelled(task)
                    # Recheck after staging in case a path now resolves elsewhere.
                    _archive_path(relative, root)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if target.exists():
                        if not target.is_file() or not _same_file(incoming, target, task):
                            raise ValueError(f'Media file changed during restore: {relative}. Please retry.')
                    else:
                        installed.append(target)
                        os.replace(incoming, target)
                    processed += 1
                    _report_progress(task, processed, total, 'Restoring media files')
                check_cancelled(task)
        except Exception:
            # Existing files were never overwritten. Remove newly installed files
            # when database writes, file installation, cancellation or commit fail.
            recovery_errors = []
            for target in reversed(installed):
                try:
                    target.unlink(missing_ok=True)
                except OSError as error:
                    recovery_errors.append(str(error))
            if recovery_errors:
                keep_recovery_files = True
                raise RuntimeError(f'File rollback needs attention. Recovery files are kept in {stage}. '
                                   + '; '.join(recovery_errors))
            raise
    finally:
        if not keep_recovery_files:
            shutil.rmtree(stage, ignore_errors=True)
