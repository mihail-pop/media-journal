"""CSV transfer endpoints. Uploads and matching never write to the media library."""

import json

from django.http import FileResponse, JsonResponse, StreamingHttpResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from core.services import g_transfer as transfer


def _error(error):
    return JsonResponse({'error': str(error)}, status=400)


def _body(request):
    result = json.loads(request.body)
    if not isinstance(result, dict):
        raise ValueError('Expected a JSON object.')
    return result


@never_cache
@ensure_csrf_cookie
@require_POST
def transfer_upload(request):
    try:
        uploaded = request.FILES.get('file')
        if not uploaded or not uploaded.name.lower().endswith('.csv'):
            raise ValueError('Choose a CSV file.')
        if uploaded.size > transfer.MAX_BYTES:
            raise ValueError('Choose a CSV no larger than 50 MB.')
        encoding = request.POST.get('encoding', 'utf-8-sig')
        delimiter = request.POST.get('delimiter', '')
        if encoding not in ('utf-8-sig', 'utf-16', 'cp1252') or delimiter not in ('', ',', ';', '\t', '|'):
            raise ValueError('Invalid CSV encoding or delimiter.')
        identity = transfer.create_job('import', {'encoding': encoding, 'delimiter': delimiter, 'filename': uploaded.name[:200]})
        path = transfer.root() / f'{identity}.upload.csv'
        with path.open('wb') as stream:
            size = 0
            for chunk in uploaded.chunks():
                size += len(chunk)
                if size > transfer.MAX_BYTES:
                    raise ValueError('Choose a CSV no larger than 50 MB.')
                stream.write(chunk)
        transfer.start(identity, 'read')
        return JsonResponse({'job_id': identity})
    except (ValueError, OSError) as error:
        return _error(error)


@never_cache
@require_GET
def transfer_status(request, job_id):
    try:
        return JsonResponse(transfer.snapshot(job_id))
    except ValueError as error:
        return _error(error)


@never_cache
@ensure_csrf_cookie
@require_POST
def transfer_action(request, job_id):
    try:
        task = transfer.job(job_id)
        data = _body(request)
        action = data.get('action')
        if action == 'configure':
            return JsonResponse({'value_fields': transfer.configure(job_id, data.get('config', {}))})
        if action == 'match':
            if task['state'] != 'values':
                raise ValueError('Configure the columns first.')
            config = task['config']
            maps = data.get('value_maps', {})
            if not isinstance(maps, dict) or any(not isinstance(value, dict) for value in maps.values()):
                raise ValueError('Invalid value mappings.')
            config['value_maps'] = maps
            transfer.update_job(job_id, config=config)
            with transfer.store() as db:
                db.execute("UPDATE rows SET state='pending',normalized=NULL,match=NULL,candidates='[]',error='',item_id=NULL WHERE job_id=?", (job_id,))
                total = db.execute('SELECT COUNT(*) FROM rows WHERE job_id=?', (job_id,)).fetchone()[0]
            transfer.update_job(job_id, total=total, processed=0)
            transfer.start(job_id, 'match')
        elif action == 'import':
            if not transfer.counts(job_id).get('ready'):
                raise ValueError('There are no matched items ready to import.')
            transfer.start(job_id, 'import')
        elif action == 'resume':
            transfer.start(job_id)
        elif action == 'pause':
            if task['state'] in transfer.BUSY:
                transfer.update_job(job_id, stop_requested=1, state='pausing', message='Pausing after the current item…')
        elif action == 'decision':
            transfer.decisions(job_id, int(data['number']), data.get('decision'), int(data.get('candidate', 0)))
        elif action == 'research':
            if task['state'] in transfer.BUSY:
                raise ValueError('Wait for the current step to finish.')
            query = str(data.get('query', '')).strip()
            if not query or len(query) > 300:
                raise ValueError('Enter a title to search for (maximum 300 characters).')
            with transfer.store() as db:
                row = db.execute('SELECT normalized,state FROM rows WHERE job_id=? AND number=?', (job_id, int(data['number']))).fetchone()
            if not row or not row['normalized'] or row['state'] in ('imported', 'existing'):
                raise ValueError('This row cannot be searched.')
            config = task['config']
            config.update(research_row=int(data['number']), research_query=query)
            transfer.update_job(job_id, config=config)
            transfer.start(job_id, 'research')
        else:
            raise ValueError('Unknown transfer action.')
        return JsonResponse({'success': True})
    except (ValueError, TypeError, KeyError) as error:
        return _error(error)


@never_cache
@ensure_csrf_cookie
@require_POST
def transfer_export(request):
    try:
        data = _body(request)
        kinds = data.get('media_types', [])
        if not isinstance(kinds, list) or not kinds or not set(kinds) <= set(transfer.TYPE_LABELS):
            raise ValueError('Select at least one media type.')
        identity = transfer.create_job('export', {'media_types': kinds})
        transfer.start(identity, 'export')
        return JsonResponse({'job_id': identity})
    except (ValueError, TypeError) as error:
        return _error(error)


@never_cache
@require_GET
def transfer_rows(request, job_id):
    try:
        return JsonResponse(transfer.review_rows(job_id, int(request.GET.get('page', 1)), request.GET.get('filter', 'review')))
    except (ValueError, TypeError) as error:
        return _error(error)


@never_cache
@require_GET
def transfer_download(request, job_id):
    try:
        task = transfer.job(job_id)
        if task['kind'] == 'import':
            response = StreamingHttpResponse(transfer.report_csv(job_id), content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = 'attachment; filename="media_journal_unimported.csv"'
            return response
        path = transfer.root() / f'{job_id}.export.csv'
        if task['state'] != 'completed' or not path.is_file():
            raise ValueError('CSV export is not ready.')
        return FileResponse(path.open('rb'), as_attachment=True, filename='media_journal_library.csv', content_type='text/csv; charset=utf-8')
    except (ValueError, OSError) as error:
        return _error(error)
