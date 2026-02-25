from django.views.decorators.http import require_GET
from django.http import JsonResponse
from core.models import MediaItem
import logging

logger = logging.getLogger(__name__)

@require_GET
def check_in_list(request):
    source = request.GET.get("source")
    source_id = request.GET.get("source_id")

    if not source or not source_id:
        return JsonResponse({"error": "Missing parameters"}, status=400)

    exists = MediaItem.objects.filter(source=source, source_id=str(source_id)).exists()
    return JsonResponse({"in_list": exists})
