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
    mal_id = request.GET.get("mal_id") # Get the optional mal_id from the request

    if not source or not source_id:
        return JsonResponse({"error": "Missing parameters"}, status=400)

    # Base query for the primary source/ID provided
    base_query = Q(**{f"provider_ids__{source}": str(source_id)})

    # If it's anime/manga and a mal_id is provided, add an OR condition
    if source in ["anilist", "mal"] and mal_id:
        # Combine the base query with an OR condition for the MAL ID
        # This checks if it's in the DB by the AniList ID OR by the MAL ID
        exists = MediaItem.objects.filter(
            Q(media_type__in=["anime", "manga"]),
            base_query | Q(provider_ids__mal=str(mal_id))
        ).exists()
    else:
        # For other media types or if no mal_id is provided, use the base query only
        exists = MediaItem.objects.filter(base_query).exists()
        
    return JsonResponse({"in_list": exists})