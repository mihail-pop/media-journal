"""Read-only favorites exports. Original records and images are never changed."""
import mimetypes
from pathlib import Path
from urllib.parse import unquote, urlsplit

import requests
from django.conf import settings
from django.db.models import Count
from django.http import FileResponse, Http404, HttpResponse
from django.urls import reverse

from core.models import AppSettings, FavoritePerson, MediaItem, default_favorite_sections_order


IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp'}
MAX_IMAGE_BYTES = 20 * 1024 * 1024


def favorite_export_options(app_settings=None):
    media_counts = dict(MediaItem.objects.filter(favorite=True).values('media_type').annotate(total=Count('id')).values_list('media_type', 'total'))
    person_counts = dict(FavoritePerson.objects.values('type').annotate(total=Count('id')).values_list('type', 'total'))
    preferences = app_settings.get_favorite_sections_order() if app_settings else default_favorite_sections_order()
    options = []
    for section in preferences:
        key = section['id']
        count = person_counts.get('character' if key == 'characters' else 'actor', 0) if key in ('characters', 'actors') else media_counts.get(key, 0)
        options.append({**section, 'count': min(count, 25)})
    return options


def favorite_export_data(selected, limit=25):
    app_settings = AppSettings.objects.first()
    sections = []
    for option in favorite_export_options(app_settings):
        key = option['id']
        if key not in selected:
            continue
        is_person = key in ('characters', 'actors')
        if is_person:
            queryset = FavoritePerson.objects.filter(type='character' if key == 'characters' else 'actor').only('id', 'name').order_by('position', 'id')
        else:
            queryset = MediaItem.objects.filter(favorite=True, media_type=key).only('id', 'title').order_by('favorite_position', 'date_added', 'id')
        items = []
        for item in queryset[:limit]:
            items.append({
                'title': item.name if is_person else item.title,
                'image_url': reverse('favorite_export_image', args=['person' if is_person else 'media', item.pk]),
            })
        if items:
            sections.append({'id': key, 'title': f"Favorite {option['name']}", 'items': items})
    return sections


def favorite_export_image_response(kind, item_id):
    if kind == 'media':
        item = MediaItem.objects.filter(pk=item_id, favorite=True).only('cover_url').first()
        image_url = item.cover_url if item else None
    elif kind == 'person':
        item = FavoritePerson.objects.filter(pk=item_id).only('image_url').first()
        image_url = item.image_url if item else None
    else:
        raise Http404
    if not image_url:
        raise Http404

    url = urlsplit(image_url)
    if not url.netloc and url.path.startswith(settings.MEDIA_URL):
        root = Path(settings.MEDIA_ROOT).resolve()
        path = (root / unquote(url.path[len(settings.MEDIA_URL):])).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise Http404
        content_type = mimetypes.guess_type(path.name)[0]
        if content_type not in IMAGE_TYPES:
            raise Http404
        return FileResponse(path.open('rb'), content_type=content_type)

    # Only fetch a saved favorite's image URL; clients cannot supply arbitrary URLs.
    # Serving the bytes on our origin also avoids external CDN canvas/CORS failures.
    if url.scheme not in ('http', 'https') or not url.netloc:
        raise Http404
    try:
        with requests.get(image_url, stream=True, timeout=(5, 15)) as response:
            response.raise_for_status()
            content_type = response.headers.get('Content-Type', '').split(';')[0].strip().lower()
            if content_type not in IMAGE_TYPES:
                raise Http404
            chunks, size = [], 0
            for chunk in response.iter_content(65536):
                size += len(chunk)
                if size > MAX_IMAGE_BYTES:
                    raise Http404
                chunks.append(chunk)
            return HttpResponse(b''.join(chunks), content_type=content_type)
    except requests.RequestException:
        raise Http404 from None
