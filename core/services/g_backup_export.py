"""Write compatible backup archives without collecting their contents in RAM."""

import io
import json
import os
import tempfile
import zipfile
from pathlib import Path

from django.conf import settings
from django.core.serializers import serialize
from django.db import transaction


def export_archive(task):
    # Imported on use: g_backup owns the public API and shared format helpers.
    from core.services.g_backup import (
        DATA_FILE, MANIFEST_FILE, STAGING_PREFIX, BackupJSONEncoder,
        _report_progress, _scan_error, backup_models, check_cancelled,
    )

    root = Path(settings.MEDIA_ROOT).resolve()
    check_cancelled(task)
    if root.exists() and not root.is_dir():
        raise ValueError('The configured media directory is not a directory.')

    result_path = None
    try:
        descriptor, result_path = tempfile.mkstemp(prefix='media_journal_backup_', suffix='.zip')
        os.close(descriptor)
        task.result_path = result_path
        with transaction.atomic(), tempfile.TemporaryFile(mode='w+t', encoding='utf-8', newline='\n') as files:
            temporary_paths = {Path(result_path).resolve()}
            if isinstance(files.name, (str, os.PathLike)):
                temporary_paths.add(Path(files.name).resolve())
            registry = backup_models()
            counts = {model._meta.label_lower: 0 for model in registry}
            total_records = 0
            for model in registry:
                check_cancelled(task)
                total_records += model.objects.count()

            def objects():
                processed = 0
                for model in registry:
                    for obj in model.objects.order_by(model._meta.pk.name).iterator(chunk_size=500):
                        check_cancelled(task)
                        yield obj
                        counts[model._meta.label_lower] += 1
                        processed += 1
                        _report_progress(task, processed, total_records, 'Gathering database data')

            with zipfile.ZipFile(result_path, 'w', zipfile.ZIP_STORED) as archive:
                _report_progress(task, 0, total_records, 'Gathering database data')
                with archive.open(DATA_FILE, 'w', force_zip64=True) as binary:
                    with io.TextIOWrapper(binary, encoding='utf-8', newline='\n') as stream:
                        serialize('json', objects(), stream=stream,
                                  use_natural_foreign_keys=True, cls=BackupJSONEncoder)

                task.message = 'Scanning files'
                task.details = '0 files found'
                file_count = 0
                directories = os.walk(root, onerror=_scan_error) if root.exists() else ()
                for directory, dirs, names in directories:
                    check_cancelled(task)
                    dirs[:] = [name for name in dirs if not name.startswith(STAGING_PREFIX)]
                    for name in dirs:
                        if (Path(directory) / name).is_symlink():
                            raise ValueError(f'Cannot archive a symbolic-link directory: {name}')
                    for name in names:
                        check_cancelled(task)
                        path = Path(directory) / name
                        resolved = path.resolve()
                        if resolved in temporary_paths:
                            continue
                        if not resolved.is_relative_to(root):
                            raise ValueError(f'Media file points outside the media directory: {path.name}')
                        relative = path.relative_to(root).as_posix()
                        if relative in (DATA_FILE, MANIFEST_FILE):
                            raise ValueError(f'Reserved backup filename in media directory: {relative}')
                        files.write(json.dumps(relative) + '\n')
                        file_count += 1
                        if file_count % 100 == 0:
                            task.details = f'{file_count:,} files found'

                check_cancelled(task)
                archive.writestr(MANIFEST_FILE, json.dumps({
                    'format_version': 2, 'models': counts, 'file_count': file_count,
                    'datetime_precision': 'microseconds',
                }))
                total = file_count + 2
                _report_progress(task, 2, total, 'Archiving')
                files.seek(0)
                for index, line in enumerate(files, 3):
                    check_cancelled(task)
                    relative = json.loads(line)
                    path = root / relative
                    if not path.resolve().is_relative_to(root):
                        raise ValueError(f'Media file points outside the media directory: {path.name}')
                    # Missing/unreadable files invalidate the archive, never skip.
                    archive.write(path, relative)
                    _report_progress(task, index, total, 'Archiving')
                check_cancelled(task)
    except BaseException:
        if result_path:
            try:
                os.remove(result_path)
            except OSError:
                pass
        raise
