import json
import uuid
import datetime
from django.db import transaction
from django.db.models import Min, Q
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST
from django.views.decorators.csrf import ensure_csrf_cookie

from core.models import MediaItem, CalendarEvent
from core.services.g_calendar_dates import (
    calendar_iso_datetime, calendar_now,
    is_all_day_event, normalize_calendar_datetime,
)
from core.services.p_calendar import SYNC_LOCK, retry_sync_allowed, sync_items_with_apis

@require_GET
def get_calendar_events(request):
    try:
        # Expected format YYYY-MM
        year = int(request.GET.get('year'))
        month = int(request.GET.get('month'))
        
        # Determine the date range (include a bit of padding for overlapping weeks)
        start_date = datetime.date(year, month, 1) - datetime.timedelta(days=7)
        if month == 12:
            end_date = datetime.date(year + 1, 1, 1) + datetime.timedelta(days=7)
        else:
            end_date = datetime.date(year, month + 1, 1) + datetime.timedelta(days=7)
            
        events = CalendarEvent.objects.filter(
            date__gte=start_date,
            date__lt=end_date
        ).exclude(title="__API_SYNC__").select_related('item').order_by('date', 'id')
        
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


@ensure_csrf_cookie
@require_POST
def sync_calendar(request):
    empty_result = {'synced_count': 0, 'failed_count': 0, 'skipped_count': 0, 'changed': False}
    try:
        data = json.loads(request.body)
        if not isinstance(data, dict):
            raise ValueError('Invalid sync options.')
        from django.apps import apps
        AppSettings = apps.get_model("core", "AppSettings")
        app_settings = AppSettings.objects.first()

        # Default to database preferences if frontend doesn't send them (e.g. from Home page)
        db_ongoing = app_settings.cal_sync_ongoing if app_settings else True
        db_planned = app_settings.cal_sync_planned if app_settings else False

        sync_ongoing = data.get('sync_ongoing', db_ongoing)
        sync_planned = data.get('sync_planned', db_planned)
        force = data.get('force', False)
        preferences_only = data.get('preferences_only', False)
        if any(not isinstance(value, bool) for value in (sync_ongoing, sync_planned, force, preferences_only)):
            raise ValueError('Sync options must be enabled or disabled.')

        # Save preferences to DB if they were explicitly provided in the request
        if app_settings and ('sync_ongoing' in data or 'sync_planned' in data):
            app_settings.cal_sync_ongoing = sync_ongoing
            app_settings.cal_sync_planned = sync_planned
            app_settings.save(update_fields=['cal_sync_ongoing', 'cal_sync_planned'])

        if preferences_only:
            return JsonResponse({'success': True, **empty_result})

        statuses_to_sync = []
        if sync_ongoing: 
            statuses_to_sync.append("ongoing")
        if sync_planned: 
            statuses_to_sync.append("planned")

        if not statuses_to_sync:
            return JsonResponse({'success': True, **empty_result})

        # Home and Calendar share one process and one sync. Preferences above
        # still persist if another tab is already checking release data.
        if not SYNC_LOCK.acquire(blocking=False):
            return JsonResponse({'success': True, 'in_progress': True, **empty_result})
        try:
            items_query = MediaItem.objects.filter(status__in=statuses_to_sync).filter(
                Q(source='tmdb', media_type__in=('movie', 'tv')) |
                Q(source__in=('anilist', 'mal'), media_type__in=('anime', 'manga')) |
                Q(source='igdb', media_type='game')
            ).only('title', 'source', 'provider_ids', 'media_type', 'calendar_last_sync')
            now = calendar_now()
            future_dates = dict(
                CalendarEvent.objects.filter(item__in=items_query, date__gt=now, is_custom=False)
                .exclude(title='__API_SYNC__').values('item_id')
                .annotate(next_date=Min('date')).values_list('item_id', 'next_date')
            )
            items_to_sync = []
            for item in items_query:
                if force:
                    items_to_sync.append(item)
                    continue
                if not retry_sync_allowed(item.pk, now):
                    continue
                next_date = future_dates.get(item.pk)
                # Keep the call-saving behavior for scheduled releases while
                # eventually learning about postponements or cancellations.
                interval = datetime.timedelta(days=1)
                if next_date:
                    days_away = (next_date.date() - now.date()).days
                    interval = datetime.timedelta(days=14 if days_away <= 30 else 90)
                if not item.calendar_last_sync or now - item.calendar_last_sync >= interval:
                    items_to_sync.append(item)

            result = sync_items_with_apis(items_to_sync)
            return JsonResponse({'success': True, **result})
        finally:
            SYNC_LOCK.release()
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e), **empty_result}, status=400)
    
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
