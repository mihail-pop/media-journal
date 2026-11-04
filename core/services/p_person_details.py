import logging
import os
import time

from django.conf import settings
from django.utils.text import slugify

from core.models import FavoritePerson
from core.services.g_utils import download_image
from core.services.m_people import fetch_actor_data, fetch_character_data

logger = logging.getLogger(__name__)


def refresh_favorite_person(person_id, refresh_mode="data"):
    try:
        person = FavoritePerson.objects.get(id=person_id)
    except FavoritePerson.DoesNotExist:
        return False
    if person.resolved_source == 'custom' or not person.person_id:
        return False

    if person.type == 'actor':
        data = fetch_actor_data(person.person_id, source=person.resolved_source, force_refresh=True)
        fields = ['age', 'biography', 'known_for', 'related_media', 'directed', 'produced', 'crew_credits']
    else:
        data = fetch_character_data(person.person_id, force_refresh=True)
        fields = ['description', 'age', 'media_appearances', 'voice_actors']
    if not data:
        return False

    updates = {field: data.get(field) for field in fields}
    updates['role'] = person.role or data.get('role')
    if person.type == 'actor':
        updates['birthday'] = data.get('birthday_raw') or data.get('birthday')
        updates['deathday'] = data.get('deathday_raw') or data.get('deathday')

    old_image = person.image_url
    fresh_image = data.get('image')
    if refresh_mode == 'all' and fresh_image:
        timestamp = time.time_ns()
        extension = fresh_image.split('.')[-1].split('?')[0]
        # Keep historical actors/characters image directories for compatibility.
        relative_path = f'favorites/{person.type}s/{slugify(person.name)}_{timestamp}.{extension}'
        local_url = download_image(fresh_image, relative_path)
        if local_url:
            updates['image_url'] = local_url

    # Update only fetched fields; position, date_added, source, primary key and
    # every MediaPersonLink stay intact. Failed API calls reach no writes.
    updated = FavoritePerson.objects.filter(pk=person.pk).update(**updates)
    if updated and updates.get('image_url') and old_image and old_image != updates['image_url']:
        if old_image.startswith(settings.MEDIA_URL):
            relative_path = old_image[len(settings.MEDIA_URL):].lstrip('/')
            if relative_path.startswith('favorites/'):
                try:
                    os.remove(os.path.join(settings.MEDIA_ROOT, relative_path))
                except OSError:
                    logger.debug('Old person image could not be removed: %s', relative_path)
    return bool(updated)
