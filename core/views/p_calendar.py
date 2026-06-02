import json
import uuid
import datetime
from django.conf import settings
from django.utils import timezone
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST
from django.views.decorators.csrf import ensure_csrf_cookie

from core.models import MediaItem, CalendarEvent
from core.services.p_calendar import sync_items_with_apis

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
        ).select_related('item')
        
        events_data = []
        for e in events:
            events_data.append({
                "id": e.id,
                "item_id": e.item.id,
                "title": e.item.title,
                "event_title": e.title,
                "media_type": e.item.media_type,
                "date": e.date.isoformat(),
                "is_custom": e.is_custom,
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
        
        base_dt = datetime.datetime.strptime(f"{base_date_str} {time_str}", "%Y-%m-%d %H:%M")
        # Ensure timezone awareness only if USE_TZ is enabled in settings
        if settings.USE_TZ:
            base_dt = timezone.make_aware(base_dt, datetime.timezone.utc)
        
        recurring_group = uuid.uuid4() if repeats > 1 else None
        
        events_created = []
        for i in range(repeats):
            current_dt = base_dt + datetime.timedelta(days=(interval_days * i))
            
            # Auto-increment episode number if the user typed "Episode 1"
            title = data.get('title', '')
            if repeats > 1 and " " in title and title.split(" ")[-1].isdigit():
                parts = title.split(" ")
                current_num = int(parts[-1]) + i
                title = " ".join(parts[:-1]) + f" {current_num}"
            
            event = CalendarEvent.objects.create(
                item=item,
                date=current_dt,
                title=title,
                is_custom=True,
                notes=data.get('notes', ''),
                notify=data.get('notify', False),
                recurring_group=recurring_group
            )
            events_created.append(event.id)
            
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
    try:
        data = json.loads(request.body)
        sync_ongoing = data.get('sync_ongoing', True)
        sync_planned = data.get('sync_planned', False)
        force = data.get('force', False)

        statuses_to_sync = []
        if sync_ongoing: 
            statuses_to_sync.append("ongoing")
        if sync_planned: 
            statuses_to_sync.append("planned")

        if not statuses_to_sync:
            return JsonResponse({"success": True, "synced_count": 0})

        items_query = MediaItem.objects.filter(status__in=statuses_to_sync)
        items_to_sync = []

        now = timezone.now()
        for item in items_query:
            if force:
                items_to_sync.append(item)
            else:
                # If never synced, or last synced more than 7 days ago, sync it
                if not item.calendar_last_sync or (now - item.calendar_last_sync).days >= 7:
                    items_to_sync.append(item)

        if items_to_sync:
            sync_items_with_apis(items_to_sync)

        return JsonResponse({"success": True, "synced_count": len(items_to_sync)})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)})