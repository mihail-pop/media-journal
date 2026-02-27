import os
import logging

from django.conf import settings
from django.utils.text import slugify

from core.models import FavoritePerson
from core.services.g_utils import download_image
from core.services.m_people import fetch_actor_data, fetch_character_data

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
