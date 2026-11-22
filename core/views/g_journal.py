import json

from django.db import transaction
from django.http import JsonResponse
from django.template.loader import render_to_string
from django.views.decorators.http import require_GET, require_POST

from core.models import AppSettings, MediaItem, MediaItemLog
from core.services.g_journal import apply_log_changes, journal_page, serialize_log


@require_GET
def journal_entries(request, item_id):
    try:
        item = MediaItem.objects.only('id', 'notes').get(pk=item_id)
        if request.GET.get('log_id'):
            log = item.logs.get(pk=request.GET['log_id'])
            return JsonResponse({'success': True, 'log': serialize_log(log)})
        page = max(1, int(request.GET.get('page', 1)))
        data = journal_page(
            item, query=request.GET.get('search', '').strip(),
            sort=request.GET.get('sort', 'activity_date'),
            direction=request.GET.get('direction', 'desc'), page=page,
        )
        html = render_to_string('core/g_journal_entries.html', {'journal': data})
        return JsonResponse({
            'success': True, 'html': html, 'logs': data['log_data'],
            'has_more': data['has_more'], 'remaining': data['remaining'], 'page': page,
        })
    except (MediaItem.DoesNotExist, MediaItemLog.DoesNotExist):
        return JsonResponse({'success': False, 'error': 'This journal entry no longer exists.'}, status=404)
    except (ValueError, TypeError):
        return JsonResponse({'success': False, 'error': 'Invalid journal request.'}, status=400)


@require_GET
def list_journals(request):
    """Fetch journals only when switching already loaded items to detailed view."""
    try:
        ids = [int(value) for value in request.GET.get('ids', '').split(',') if value]
        if not ids or len(ids) > 100:
            raise ValueError
    except ValueError:
        return JsonResponse({'error': 'Choose up to 100 items.'}, status=400)
    journals = {str(item_id): [] for item_id in ids}
    for log in MediaItemLog.objects.filter(item_id__in=ids).order_by('-activity_date', '-date_added', '-pk'):
        journals[str(log.item_id)].append(serialize_log(log))
    return JsonResponse({'journals': journals})


@require_POST
def manage_journal_log(request):
    try:
        data = json.loads(request.body)
        if not isinstance(data, dict) or data.get('action') not in ('save', 'delete'):
            raise ValueError('Choose a valid journal action.')
        with transaction.atomic():
            item = MediaItem.objects.only('id', 'media_type').get(pk=data.get('item_id'))
            log_id = data.get('log_id')
            if data['action'] == 'delete':
                if not log_id:
                    raise ValueError('Choose a log to delete.')
                MediaItemLog.objects.get(pk=log_id, item=item).delete()
            else:
                log = MediaItemLog.objects.get(pk=log_id, item=item) if log_id else MediaItemLog(item=item)
                log.item = item
                preferences = AppSettings.objects.only('rating_mode').first()
                mode = preferences.rating_mode if preferences else 'faces'
                apply_log_changes(log, data, mode).save()
        return JsonResponse({'success': True})
    except (MediaItem.DoesNotExist, MediaItemLog.DoesNotExist):
        return JsonResponse({'success': False, 'error': 'This item or log no longer exists.'}, status=404)
    except (ValueError, TypeError, OverflowError) as error:
        return JsonResponse({'success': False, 'error': str(error)}, status=400)
