"""Year in Review pages and cover exports. All endpoints are read-only."""

import mimetypes
from pathlib import Path
from urllib.parse import unquote, urlsplit

import requests
from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import redirect, render
from django.urls import reverse
from django.views.decorators.http import require_GET

from core.models import AppSettings, MediaItem, MusicPlay
from core.services.g_favorites_export import IMAGE_TYPES, MAX_IMAGE_BYTES
from core.services.p_year_review import build_year_review, year_bounds, year_review_calendar


def _valid_year(year):
    if not isinstance(year, int) or not 1 <= year <= 9998:
        raise Http404('Invalid review year.')
    return year


@require_GET
def year_review(request, year=None):
    if year is None and 'year' in request.GET:
        value = request.GET['year']
        if not value.isascii() or not value.isdecimal() or len(value) > 4:
            raise Http404('Invalid review year.')
        year = int(value)
    if year is not None:
        _valid_year(year)
        latest_year = year_review_calendar()['latest_year']
        if year > latest_year:
            url = reverse('year_review_year', args=[latest_year])
            if request.GET.get('browse') == '1':
                url += '?browse=1'
            return redirect(url)
    app_settings = AppSettings.objects.only('theme_mode', 'rating_mode', 'favorite_sections_order').first()
    review = build_year_review(year, app_settings=app_settings)
    has_data = bool(
        review['completed'] or review['dropped']
        or review['stats']['tracked']['metrics'] or review['stats']['music']['plays']
        or review['stats']['music']['listening_seconds']
    )
    return render(request, 'core/p_year_review.html', {
        'review': review, 'has_review_data': has_data,
        'can_choose_year': request.GET.get('browse') == '1',
        'theme_mode': app_settings.theme_mode if app_settings else 'dark',
        'page_type': 'year-review',
    })


@require_GET
def year_review_image(request, year, item_id):
    """Serve an eligible saved cover on our origin for canvas downloads."""
    year = _valid_year(year)
    if year > year_review_calendar()['latest_year']:
        raise Http404('Invalid review year.')
    start, end = year_bounds(year)
    item = MediaItem.objects.filter(pk=item_id).only('cover_url', 'media_type', 'status', 'date_added').first()
    if item is None:
        raise Http404
    eligible = item.status in ('completed', 'dropped') and start <= item.date_added < end
    if not eligible and item.media_type == 'music':
        eligible = MusicPlay.objects.filter(item=item, played_at__gte=start, played_at__lt=end).exists()
    if not eligible or not item.cover_url:
        raise Http404
    image_url = item.cover_url
    try:
        url = urlsplit(image_url)
    except ValueError:
        raise Http404 from None
    if not url.netloc and url.path.startswith(settings.MEDIA_URL):
        root = Path(settings.MEDIA_ROOT).resolve()
        path = (root / unquote(url.path[len(settings.MEDIA_URL):])).resolve()
        if not path.is_relative_to(root) or not path.is_file() or path.stat().st_size > MAX_IMAGE_BYTES:
            raise Http404
        content_type = mimetypes.guess_type(path.name)[0]
        if content_type not in IMAGE_TYPES:
            raise Http404
        return FileResponse(path.open('rb'), content_type=content_type)
    if url.scheme not in ('http', 'https') or not url.netloc:
        raise Http404
    # Only the saved cover URL can be fetched; requests cannot supply a URL.
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
