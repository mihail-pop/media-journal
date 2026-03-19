import logging

from django.http import JsonResponse
from django.views.decorators.http import require_GET
from django.db.models import Q

from core.models import MediaItem

logger = logging.getLogger(__name__)


@require_GET
def check_in_list(request):
    source = request.GET.get("source")
    source_id = request.GET.get("source_id")
    mal_id = request.GET.get("mal_id")

    if not source or not source_id:
        return JsonResponse({"error": "Missing parameters"}, status=400)

    base_query = Q(**{f"provider_ids__{source}": str(source_id)})

    if source in ["anilist", "mal"] and mal_id:
        exists = MediaItem.objects.filter(
            Q(media_type__in=["anime", "manga"]),
            base_query | Q(provider_ids__mal=str(mal_id))
        ).exists()
    else:
        exists = MediaItem.objects.filter(base_query).exists()
        
    return JsonResponse({"in_list": exists})