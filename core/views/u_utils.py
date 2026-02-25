from django.apps import apps
from pathlib import Path
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST
from django.conf import settings
from django.http import JsonResponse
from core.models import APIKey, MediaItem
import json
import requests
import logging


logger = logging.getLogger(__name__)

def check_if_in_list(source, source_id):
    return MediaItem.objects.filter(
        source=source, source_id=str(source_id)
    ).exists()  # useless?


@ensure_csrf_cookie
def get_item(request, item_id):
    try:
        item = MediaItem.objects.get(id=item_id)
        total_main = item.total_main
        total_secondary = item.total_secondary

        # Fetch live data only if values aren't already stored
        # Skip API calls for season entries (source_id contains '_s')
        if (
            item.source == "tmdb"
            and item.media_type == "tv"
            and "_s" not in item.source_id
        ):
            try:
                api_key = APIKey.objects.get(name="tmdb").key_1
                url = f"https://api.themoviedb.org/3/tv/{item.source_id}"
                params = {"api_key": api_key}
                response = requests.get(url, params=params)
                if response.status_code == 200:
                    data = response.json()
                    total_main = data.get("number_of_episodes") or total_main
                    total_secondary = data.get("number_of_seasons") or total_secondary
            except Exception:
                pass  # Fallback to DB values

        elif item.source == "mal":
            try:
                url = f"https://api.jikan.moe/v4/{item.media_type}/{item.source_id}"
                response = requests.get(url)
                if response.status_code == 200:
                    data = response.json().get("data", {})
                    if item.media_type == "anime":
                        total_main = data.get("episodes") or total_main
                    elif item.media_type == "manga":
                        total_main = data.get("chapters") or total_main
                        total_secondary = data.get("volumes") or total_secondary
            except Exception:
                pass

        elif item.source == "igdb":
            # IGDB does not have episode/season style totals; leave as is
            total_main = None
            total_secondary = None

        elif item.source == "openlib":
            total_main = None
            total_secondary = None

        AppSettings = apps.get_model("core", "AppSettings")
        try:
            settings = AppSettings.objects.first()
            rating_mode = settings.rating_mode if settings else "faces"
        except Exception:
            rating_mode = "faces"

        display_rating = rating_to_display(item.personal_rating, rating_mode)

        RATING_CHOICES = [
            (1, "Bad"),
            (50, "Neutral"),
            (100, "Good"),
        ]

        return JsonResponse(
            {
                "success": True,
                "item": {
                    "id": item.id,
                    "title": item.title,
                    "media_type": item.media_type,
                    "source_id": item.source_id,
                    "status": item.status,
                    "personal_rating": display_rating,
                    "notes": item.notes,
                    "progress_main": item.progress_main if item.progress_main else None,
                    "total_main": total_main,
                    "progress_secondary": item.progress_secondary,
                    "total_secondary": total_secondary,
                    "favorite": item.favorite,
                    "item_status_choices": MediaItem.STATUS_CHOICES,
                    "item_rating_choices": RATING_CHOICES,
                    "rating_mode": rating_mode,
                    "repeats": item.repeats or 0,
                    "date_added": item.date_added.isoformat()
                    if item.date_added
                    else None,
                    "show_date_field": settings.show_date_field,
                    "show_repeats_field": settings.show_repeats_field,
                },
            }
        )
    except MediaItem.DoesNotExist:
        return JsonResponse({"success": False, "error": "Item not found"})

# Youtube player?
@ensure_csrf_cookie
@require_POST
def toggle_music_favorite(request):
    try:
        data = json.loads(request.body)
        item_id = data.get("item_id")
        favorite = data.get("favorite")

        item = MediaItem.objects.get(id=item_id)
        item.favorite = favorite
        item.save()

        return JsonResponse({"success": True})
    except MediaItem.DoesNotExist:
        return JsonResponse({"success": False, "error": "Item not found"}, status=404)
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=500)
    
def download_image(url, relative_path):
    local_path = Path(settings.MEDIA_ROOT) / relative_path
    local_path.parent.mkdir(parents=True, exist_ok=True)  # Ensure folder exists

    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            with open(local_path, "wb") as f:
                f.write(response.content)
            return settings.MEDIA_URL + relative_path.replace("\\", "/")
    except Exception as e:
        print("Image download failed:", e)

    return ""

def rating_to_display(rating_value: int | None, rating_mode: str) -> int | None:
    """
    Convert internal rating (1-100) to display rating according to rating_mode.
    Returns None if no rating.
    """
    if rating_value is None:
        return None

    if rating_mode == "faces":
        # Always round to the nearest face value: 1 (bad), 50 (neutral), 100 (good)
        # This ensures any value maps to a valid face
        faces = [1, 50, 100]
        # Find the face value with the smallest absolute difference
        return min(faces, key=lambda x: abs(rating_value - x))

    elif rating_mode == "stars_5":
        # Map 1–100 to 1–5 stars
        # We'll round nearest integer: divide by 20 and round (e.g. 50->3 stars)
        result = round(rating_value / 20)
        if rating_value != 0 and result < 1:
            return 1
        return result

    elif rating_mode == "scale_10":
        # Map 1–100 to 1–10 scale, rounded nearest int
        result = round(rating_value / 10)
        if rating_value != 0 and result < 1:
            return 1
        return result

    elif rating_mode == "scale_100":
        # Use value directly (1-100)
        return rating_value

    return None


def display_to_rating(display_value: int | None, rating_mode: str) -> int | None:
    """
    Convert display rating back to internal 1-100 rating to save.
    Returns None if no rating.
    """
    if display_value is None:
        return None

    if rating_mode == "faces":
        # Faces are only 1, 50, 100
        if display_value <= 1:
            return 1
        elif display_value <= 50:
            return 50
        else:
            return 100

    elif rating_mode == "stars_5":
        # 1–5 stars * 20
        return display_value * 20

    elif rating_mode == "scale_10":
        # 1–10 * 10
        return display_value * 10

    elif rating_mode == "scale_100":
        # Direct 1–100
        return display_value

    return None
