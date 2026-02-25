from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST
from django.http import JsonResponse
from core.models import MediaItem, FavoritePerson
from django.db import transaction
import json
import logging

logger = logging.getLogger(__name__)


@ensure_csrf_cookie
@require_POST
def update_favorite_person_order(request):
    try:
        data = json.loads(request.body)
        new_order = data.get("order", [])  # List of IDs in new order

        if not isinstance(new_order, list):
            return JsonResponse({"error": "Invalid data format"}, status=400)

        # Wrap updates in a transaction for atomicity
        with transaction.atomic():
            for position, person_id in enumerate(new_order, start=1):
                FavoritePerson.objects.filter(id=person_id).update(position=position)

        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@ensure_csrf_cookie
@require_POST
def update_favorite_media_order(request):
    try:
        data = json.loads(request.body)
        new_order = data.get("order", [])

        if not isinstance(new_order, list):
            return JsonResponse({"error": "Invalid data format"}, status=400)

        with transaction.atomic():
            for position, media_id in enumerate(new_order, start=1):
                MediaItem.objects.filter(id=media_id).update(favorite_position=position)

        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)