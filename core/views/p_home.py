from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST
from django.http import JsonResponse
from core.models import MediaItem
import logging


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
