import os
import shutil
import logging

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST

from core.models import MediaItem
from core.services.p_home import acquire_media_lock, release_media_lock

logger = logging.getLogger(__name__)


@ensure_csrf_cookie
@require_POST
def dismiss_notification(request, item_id):
    try:
        item = MediaItem.objects.get(id=item_id)
        item.notification = False
        item.save()
        return JsonResponse({"success": True})
    except MediaItem.DoesNotExist:
        return JsonResponse({"error": "Item not found"}, status=404)
    
@ensure_csrf_cookie
@require_POST
def dismiss_sys_notification(request, sys_id):
    from core.models import AppSettings
    settings_obj = AppSettings.objects.first()
    
    if not settings_obj:
        settings_obj = AppSettings.objects.create()
        
    if not isinstance(settings_obj.dismissed_system_notifications, list):
        settings_obj.dismissed_system_notifications = []
        
    if sys_id not in settings_obj.dismissed_system_notifications:
        settings_obj.dismissed_system_notifications.append(sys_id)
        settings_obj.save(update_fields=['dismissed_system_notifications'])
        
    return JsonResponse({"success": True})
