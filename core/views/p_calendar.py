import json
import uuid
import datetime
import re
from django.db import transaction
from django.db.models import Min, Q
from django.http import HttpResponse, JsonResponse
from django.views.decorators.http import require_GET, require_POST
from django.views.decorators.csrf import ensure_csrf_cookie

from core.models import MediaItem, CalendarEvent
from core.services.g_calendar_dates import (
    all_day_datetime, calendar_iso_datetime, calendar_now, display_calendar_datetime,
    is_all_day_event, normalize_calendar_datetime, parse_media_types,
)
from core.services.g_calendar_export import build_calendar_export
from core.services.p_calendar import (
    SYNC_LOCK, calendar_sync_can_request, retry_sync_allowed, sync_items_with_apis,
)


def _calendar_event_query(request):
    """Saved events only: browsing, filtering and exporting never call APIs."""
    start = request.GET.get('start')
    end = request.GET.get('end')
    if start is not None or end is not None:
        if not start or not end:
            raise ValueError('Choose a start and end date.')
        start_date = datetime.date.fromisoformat(start)
        end_date = datetime.date.fromisoformat(end)
        if not 0 < (end_date - start_date).days <= 93:
            raise ValueError('Choose a date range of up to 93 days.')
    else:
        year = int(request.GET.get('year'))
        month = int(request.GET.get('month'))
        first = datetime.date(year, month, 1)
        start_date = first - datetime.timedelta(days=min(7, (first - datetime.date.min).days))
        following = datetime.date(year + (month == 12), month % 12 + 1, 1)
        end_date = following + datetime.timedelta(days=min(7, (datetime.date.max - following).days))
    types = parse_media_types(request.GET.get('media_types', request.COOKIES.get('calendar_media_types')))
    events = CalendarEvent.objects.filter(
        date__gte=all_day_datetime(start_date), date__lt=all_day_datetime(end_date),
        item__media_type__in=types,
    ).exclude(title='__API_SYNC__').select_related('item').order_by('date', 'id')
    return events, start_date, end_date

@require_GET
def get_calendar_events(request):
    try:
        events, _, _ = _calendar_event_query(request)
        
        events_data = []
        for e in events:
            events_data.append({
                "id": e.id,
                "item_id": e.item.id,
                "title": e.item.title,
                "event_title": e.title,
                "media_type": e.item.media_type,
                "date": calendar_iso_datetime(e.date),
                "all_day": is_all_day_event(e),
                "is_custom": e.is_custom,
                "notify": e.notify,
                "notes": e.notes,
                "recurring_group": str(e.recurring_group) if e.recurring_group else None,
                "cover_url": e.item.cover_url or "/static/core/img/placeholder.png",
                "source_id": e.item.source_id,
                "source": e.item.source
            })
            
        return JsonResponse({"success": True, "events": events_data})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)})


@require_GET
def export_calendar_events(request):
    try:
        events, start_date, end_date = _calendar_event_query(request)
        content = build_calendar_export(events)
        response = HttpResponse(content, content_type='text/calendar; charset=utf-8')
        filename = f'Media Journal - Releases {start_date.isoformat()} to {(end_date - datetime.timedelta(days=1)).isoformat()}.ics'
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['Cache-Control'] = 'no-store'
        return response
    except (ValueError, TypeError, OverflowError) as error:
        return JsonResponse({'success': False, 'error': str(error)}, status=400)

@require_GET
def calendar_search_local_items(request):
    query = request.GET.get('q', '').strip()
    if len(query) < 2:
        return JsonResponse({"items": []})
        
    items = MediaItem.objects.filter(title__icontains=query)[:10]
    results = [{
        "id": i.id,
        "title": i.title,
        "media_type": i.media_type,
        "cover_url": i.cover_url or "/static/core/img/placeholder.png"
    } for i in items]
    
    return JsonResponse({"items": results})

@ensure_csrf_cookie
@require_POST
def add_custom_event(request):
    try:
        data = json.loads(request.body)
        item = MediaItem.objects.get(id=data['item_id'])
        
        base_date_str = data['date'] # YYYY-MM-DD
        time_str = data.get('time', '00:00') # HH:MM
        if not time_str:
            time_str = '00:00'
        
        repeats = int(data.get('repeats', 1))
        interval_days = int(data.get('interval_days', 7))
        if not 1 <= repeats <= 1000:
            raise ValueError('Choose between 1 and 1,000 repeats.')
        if interval_days < 1:
            raise ValueError('The interval must be at least one day.')
        title_input = data.get('title', '')
        notes = data.get('notes', '')
        notify = data.get('notify', False)
        if not isinstance(title_input, str) or len(title_input) > 255:
            raise ValueError('The event title must be 255 characters or fewer.')
        if not isinstance(notes, str) or not isinstance(notify, bool):
            raise ValueError('Invalid event notes or notification setting.')
        
        base_dt = datetime.datetime.strptime(f"{base_date_str} {time_str}", "%Y-%m-%d %H:%M")
        # Ensure timezone awareness only if USE_TZ is enabled in settings
        base_dt = normalize_calendar_datetime(base_dt)
        
        recurring_group = uuid.uuid4() if repeats > 1 else None
        
        events_created = []
        for i in range(repeats):
            current_dt = base_dt + datetime.timedelta(days=(interval_days * i))
            
            # Auto-increment episode number if the user typed "Episode 1"
            title = title_input
            if repeats > 1 and " " in title and title.split(" ")[-1].isdigit():
                parts = title.split(" ")
                current_num = int(parts[-1]) + i
                title = " ".join(parts[:-1]) + f" {current_num}"
            
            if len(title) > 255:
                raise ValueError('The recurring event title is too long.')
            event = CalendarEvent(
                item=item,
                date=current_dt,
                title=title,
                is_custom=True,
                notes=notes,
                notify=notify,
                recurring_group=recurring_group
            )
            events_created.append(event)

        # Validate the entire series before writing any rows. A failed request
        # must not leave half a recurring schedule behind.
        with transaction.atomic():
            CalendarEvent.objects.bulk_create(events_created)
            
        return JsonResponse({"success": True, "created_count": len(events_created)})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)})


@ensure_csrf_cookie
@require_POST
def edit_custom_event(request, event_id):
    try:
        data = json.loads(request.body)
        if not isinstance(data, dict):
            raise ValueError('Invalid event details.')
        title = data.get('title', '')
        notes = data.get('notes', '')
        notify = data.get('notify', False)
        apply_to_future = data.get('apply_to_future', False)
        if not isinstance(title, str) or len(title) > 255:
            raise ValueError('The event title must be 255 characters or fewer.')
        if not isinstance(notes, str) or not isinstance(notify, bool) or not isinstance(apply_to_future, bool):
            raise ValueError('Invalid event notes or options.')
        requested_date = datetime.datetime.strptime(
            f"{data['date']} {data.get('time') or '00:00'}", '%Y-%m-%d %H:%M',
        )
        with transaction.atomic():
            selected = CalendarEvent.objects.select_for_update().get(pk=event_id, is_custom=True)
            if 'item_id' in data and str(data['item_id']) != str(selected.item_id):
                raise ValueError('The media item cannot be changed when editing an event.')
            original_date = display_calendar_datetime(selected.date)
            if apply_to_future and selected.recurring_group:
                events = list(CalendarEvent.objects.select_for_update().filter(
                    item_id=selected.item_id, is_custom=True, recurring_group=selected.recurring_group,
                    date__gte=selected.date,
                ).order_by('date', 'id'))
            else:
                events = [selected]
            # Shift local dates/times together, preserving the existing spacing
            # rather than generating or deleting occurrences.
            delta = requested_date - original_date.replace(tzinfo=None)
            old_number = re.fullmatch(r'(.*\s)(\d+)', selected.title or '')
            new_number = re.fullmatch(r'(.*\s)(\d+)', title)
            title_changed = title != (selected.title or '')
            notes_changed = notes != (selected.notes or '')
            notify_changed = notify != selected.notify
            for event in events:
                local_date = display_calendar_datetime(event.date).replace(tzinfo=None)
                new_date = normalize_calendar_datetime(local_date + delta)
                event_title = title if event.pk == selected.pk or title_changed else (event.title or '')
                own_number = re.fullmatch(r'(.*\s)(\d+)', event.title or '')
                if apply_to_future and title_changed and old_number and new_number and own_number and own_number[1] == old_number[1]:
                    event_title = f'{new_number[1]}{int(new_number[2]) + int(own_number[2]) - int(old_number[2])}'
                if len(event_title) > 255:
                    raise ValueError('The recurring event title is too long.')
                if event.date != new_date:
                    event.notified = False
                event.date = new_date
                event.title = event_title
                # Moving a series must preserve occurrence-specific notes,
                # titles and alerts unless those fields were actually edited.
                if event.pk == selected.pk or notes_changed:
                    event.notes = notes
                if event.pk == selected.pk or notify_changed:
                    event.notify = notify
            CalendarEvent.objects.bulk_update(events, ('date', 'title', 'notes', 'notify', 'notified'))
        return JsonResponse({'success': True, 'updated_count': len(events)})
    except CalendarEvent.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'This custom event no longer exists.'}, status=404)
    except (ValueError, TypeError, KeyError, OverflowError) as error:
        return JsonResponse({'success': False, 'error': str(error)}, status=400)

@ensure_csrf_cookie
@require_POST
def delete_calendar_event(request, event_id):
    try:
        data = json.loads(request.body)
        delete_all = data.get('delete_all', False)
        
        event = CalendarEvent.objects.get(id=event_id)
        
        if delete_all and event.recurring_group:
            # Delete this event and all FUTURE events in this group
            CalendarEvent.objects.filter(
                recurring_group=event.recurring_group,
                date__gte=event.date
            ).delete()
        else:
            event.delete()
            
        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)})


def _sync_options(data, *, save=False):
    if not isinstance(data, dict):
        raise ValueError('Invalid sync options.')
    from django.apps import apps
    app_settings = apps.get_model('core', 'AppSettings').objects.first()
    ongoing = data.get('sync_ongoing', app_settings.cal_sync_ongoing if app_settings else True)
    planned = data.get('sync_planned', app_settings.cal_sync_planned if app_settings else False)
    force = data.get('force', False)
    preferences_only = data.get('preferences_only', False)
    if any(not isinstance(value, bool) for value in (ongoing, planned, force, preferences_only)):
        raise ValueError('Sync options must be enabled or disabled.')
    if (save and app_settings and ('sync_ongoing' in data or 'sync_planned' in data)
            and (app_settings.cal_sync_ongoing != ongoing or app_settings.cal_sync_planned != planned)):
        app_settings.cal_sync_ongoing = ongoing
        app_settings.cal_sync_planned = planned
        app_settings.save(update_fields=['cal_sync_ongoing', 'cal_sync_planned'])
    return [status for status, enabled in (('ongoing', ongoing), ('planned', planned)) if enabled], force, preferences_only


def _sync_candidates(statuses, force=False):
    if not statuses:
        return []
    items = MediaItem.objects.filter(status__in=statuses).filter(
        Q(source='tmdb', media_type__in=('movie', 'tv')) |
        Q(source__in=('anilist', 'mal'), media_type__in=('anime', 'manga')) |
        Q(source='igdb', media_type='game')
    ).only('title', 'source', 'provider_ids', 'media_type', 'calendar_last_sync')
    now = calendar_now()
    future_dates = dict(
        CalendarEvent.objects.filter(item__in=items, date__gt=now, is_custom=False)
        .exclude(title='__API_SYNC__').values('item_id')
        .annotate(next_date=Min('date')).values_list('item_id', 'next_date')
    )
    selected = []
    for item in items:
        if force:
            selected.append(item)
            continue
        if not retry_sync_allowed(item.pk, now):
            continue
        interval = datetime.timedelta(days=1)
        next_date = future_dates.get(item.pk)
        if next_date:
            days_away = (display_calendar_datetime(next_date).date() - now.date()).days
            interval = datetime.timedelta(days=14 if days_away <= 30 else 90)
        if not item.calendar_last_sync or now - item.calendar_last_sync >= interval:
            selected.append(item)
    return selected


@ensure_csrf_cookie
@require_POST
def calendar_sync_plan(request):
    try:
        statuses, force, preferences_only = _sync_options(json.loads(request.body))
        in_progress = SYNC_LOCK.locked()
        will_sync = not preferences_only and not in_progress and calendar_sync_can_request(_sync_candidates(statuses, force))
        return JsonResponse({'success': True, 'will_sync': will_sync, 'in_progress': in_progress})
    except (ValueError, TypeError) as error:
        return JsonResponse({'success': False, 'error': str(error)}, status=400)


@ensure_csrf_cookie
@require_POST
def sync_calendar(request):
    empty_result = {'synced_count': 0, 'failed_count': 0, 'skipped_count': 0, 'attempted_count': 0, 'changed': False}
    try:
        statuses, force, preferences_only = _sync_options(json.loads(request.body), save=True)
        if preferences_only or not statuses:
            return JsonResponse({'success': True, **empty_result})
        # Saving preferences remains possible while another tab owns the sync.
        if not SYNC_LOCK.acquire(blocking=False):
            return JsonResponse({'success': True, 'in_progress': True, **empty_result})
        try:
            result = sync_items_with_apis(_sync_candidates(statuses, force))
            return JsonResponse({'success': True, **result})
        finally:
            SYNC_LOCK.release()
    except Exception as error:
        return JsonResponse({'success': False, 'error': str(error), **empty_result}, status=400)
    
@ensure_csrf_cookie
@require_POST
def toggle_calendar_notify(request, event_id):
    try:
        event = CalendarEvent.objects.get(id=event_id)
        event.notify = not event.notify
        event.save(update_fields=['notify'])
        return JsonResponse({"success": True, "notify": event.notify})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)})

@ensure_csrf_cookie
@require_POST
def dismiss_calendar_notify(request, event_id):
    try:
        event = CalendarEvent.objects.get(id=event_id)
        event.notified = True
        event.save(update_fields=['notified'])
        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)})
