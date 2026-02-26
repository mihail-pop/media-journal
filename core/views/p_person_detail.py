from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from django.conf import settings
from django.http import JsonResponse
from core.models import FavoritePerson
from django.utils.text import slugify
from core.services.u_utils import download_image
from core.views.p_detail import fetch_character_data, fetch_actor_data, delete_favorite_person_and_reorder, save_favorite_actor_character
import time
import json
import logging
import os

logger = logging.getLogger(__name__)


def refresh_favorite_person(person_id):
    try:
        person = FavoritePerson.objects.get(id=person_id)
        old_position = person.position
        person_type = person.type
        name = person.name
        api_person_id = person.person_id  # The actual API ID (TMDB/AniList)

        # Delete old image if it's in favorites directory
        if person.image_url and person.image_url.startswith(settings.MEDIA_URL):
            relative_path = person.image_url.replace(settings.MEDIA_URL, "").lstrip("/")
            if relative_path.startswith("favorites/"):
                old_path = os.path.join(settings.MEDIA_ROOT, relative_path)
                if os.path.exists(old_path):
                    try:
                        os.remove(old_path)
                    except Exception as e:
                        print(f"Failed to delete image file {old_path}: {e}")

        # Delete person without reordering
        person.delete()

        # Fetch fresh data from API
        additional_data = {}
        fresh_image_url = None

        if person_type == "actor" and api_person_id:
            actor_data = fetch_actor_data(api_person_id)
            if actor_data:
                fresh_image_url = actor_data.get("image")
                additional_data = {
                    "birthday": actor_data.get("birthday"),
                    "deathday": actor_data.get("deathday"),
                    "biography": actor_data.get("biography"),
                    "related_media": actor_data.get("related_media"),
                }
        elif person_type == "character" and api_person_id:
            character_data = fetch_character_data(api_person_id)
            if character_data:
                fresh_image_url = character_data.get("image")
                additional_data = {
                    "description": character_data.get("description"),
                    "age": character_data.get("age"),
                    "media_appearances": character_data.get("media_appearances"),
                    "voice_actors": character_data.get("voice_actors"),
                }

        # Download fresh image
        if fresh_image_url:
            slug_name = slugify(name)
            ext = fresh_image_url.split(".")[-1].split("?")[0]
            relative_path = f"favorites/{person_type}s/{slug_name}.{ext}"
            local_url = download_image(fresh_image_url, relative_path)
            final_image_url = local_url if local_url else fresh_image_url
        else:
            final_image_url = fresh_image_url

        # Recreate with old position and fresh data
        FavoritePerson.objects.create(
            name=name,
            image_url=final_image_url,
            type=person_type,
            position=old_position,
            person_id=api_person_id,
            **additional_data,
        )
        return True
    except FavoritePerson.DoesNotExist:
        return False


@ensure_csrf_cookie
def delete_favorite_person(request, person_id):
    success = delete_favorite_person_and_reorder(person_id)
    return JsonResponse({"success": success})


@ensure_csrf_cookie
@require_POST
def refresh_favorite_person_view(request):
    data = json.loads(request.body)
    api_person_id = data.get("person_id")  # This is the API ID (TMDB/AniList)
    person_type = data.get("person_type")

    if not api_person_id or not person_type:
        return JsonResponse({"error": "Missing parameters"}, status=400)

    # Find the database record using API ID and type
    try:
        person = FavoritePerson.objects.get(person_id=api_person_id, type=person_type)
        success = refresh_favorite_person(person.id)  # Pass database ID
        return JsonResponse({"success": success})
    except FavoritePerson.DoesNotExist:
        return JsonResponse({"error": "Person not found"}, status=404)


@ensure_csrf_cookie
@require_POST
def upload_person_image(request):
    uploaded_file = request.FILES.get("image")
    person_id = request.POST.get("person_id")
    person_type = request.POST.get("person_type")

    if not uploaded_file or not person_id or not person_type:
        return JsonResponse({"error": "Missing required data."}, status=400)

    ext = os.path.splitext(uploaded_file.name)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        return JsonResponse({"error": "Unsupported file type."}, status=400)

    try:
        person = FavoritePerson.objects.get(person_id=person_id, type=person_type)

        favorites_dir = os.path.join(settings.MEDIA_ROOT, f"favorites/{person_type}s")
        os.makedirs(favorites_dir, exist_ok=True)

        # Generate cache-busting filename
        timestamp = int(time.time() * 1000)
        slug_name = slugify(person.name)
        base_name = f"{slug_name}_{timestamp}"
        new_path = os.path.join(favorites_dir, base_name + ext)

        # Remove old image if it's in favorites directory
        if person.image_url and person.image_url.startswith(settings.MEDIA_URL):
            relative_path = person.image_url.replace(settings.MEDIA_URL, "").lstrip("/")
            if relative_path.startswith("favorites/"):
                old_path = os.path.join(settings.MEDIA_ROOT, relative_path)
                if os.path.exists(old_path):
                    os.remove(old_path)

        # Save new file
        with open(new_path, "wb+") as destination:
            for chunk in uploaded_file.chunks():
                destination.write(chunk)

        relative_url = f"/media/favorites/{person_type}s/{base_name}{ext}"
        person.image_url = relative_url
        person.save(update_fields=["image_url"])

        return JsonResponse({"success": True, "url": relative_url})

    except FavoritePerson.DoesNotExist:
        return JsonResponse({"error": "Person not found."}, status=404)

@ensure_csrf_cookie
@require_GET
def actor_detail_api(request, actor_id):
    """API endpoint for actor details"""
    data = fetch_actor_data(actor_id)
    if data:
        return JsonResponse(data)
    return JsonResponse({"error": "Actor not found"}, status=404)


@ensure_csrf_cookie
@require_GET
def character_detail_api(request, character_id):
    """API endpoint for character details"""
    logger.info(
        f"character_detail_api called with character_id: {character_id} (type: {type(character_id)})"
    )

    # Validate character_id
    if not character_id or character_id == "None":
        logger.error(f"Invalid character_id received: {character_id}")
        return JsonResponse({"error": "Invalid character ID"}, status=400)

    # Try to convert to int to validate it's a valid ID
    try:
        int(character_id)
    except (ValueError, TypeError):
        logger.error(f"Character ID cannot be converted to integer: {character_id}")
        return JsonResponse({"error": "Invalid character ID format"}, status=400)

    try:
        data = fetch_character_data(character_id)
        if data:
            return JsonResponse(data)
        logger.error(f"No data returned for character_id: {character_id}")
        return JsonResponse({"error": "Character not found"}, status=404)
    except Exception as e:
        logger.error(
            f"Error in character_detail_api for character_id {character_id}: {str(e)}"
        )
        return JsonResponse({"error": "Internal server error"}, status=500)

def check_favorite_person_view(request):
    name = request.GET.get("name")
    person_type = request.GET.get("type")

    if not name or not person_type:
        return JsonResponse({"error": "Missing parameters"}, status=400)

    is_favorited = FavoritePerson.objects.filter(name=name, type=person_type).exists()
    return JsonResponse({"is_favorited": is_favorited})


@ensure_csrf_cookie
def toggle_favorite_person_view(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST request required."}, status=400)

    data = json.loads(request.body)
    name = data.get("name")
    image_url = data.get("image_url")
    person_type = data.get("type")
    person_id = data.get("person_id")  # New parameter for ID

    # Check if already favorited
    existing = FavoritePerson.objects.filter(name=name, type=person_type).first()
    if existing:
        # Delete favorite and reorder positions
        delete_favorite_person_and_reorder(existing.id)
        return JsonResponse({"status": "removed"})
    else:
        save_favorite_actor_character(name, image_url, person_type, person_id)
        return JsonResponse({"status": "added"})
