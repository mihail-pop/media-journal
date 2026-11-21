"""Video news and saved YouTube sources."""

import json

from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_http_methods

from core.models import AppSettings, NewsChannel
from core.services.g_utils import get_ordered_types
from core.services.p_news import (
    NEWS_CHANNELS, NEWS_ORDERS, NEWS_SORTS, NewsFetchError,
    fetch_news, get_news_channels, resolve_news_channel,
)


@require_GET
@never_cache
def news(request):
    ordered_types = get_ordered_types()
    media_type = request.GET.get('type', 'movie')
    if media_type not in NEWS_CHANNELS:
        media_type = 'movie'
    sort = request.GET.get('sort', 'views')
    if sort not in NEWS_SORTS:
        sort = 'views'
    order = request.GET.get('order', 'desc')
    if order not in NEWS_ORDERS:
        order = 'desc'
    app_settings = AppSettings.objects.only('theme_mode').first()
    return render(request, 'core/p_news.html', {
        'theme_mode': app_settings.theme_mode if app_settings else 'dark',
        'page_type': 'news',
        'ordered_types': ordered_types,
        'selected_type': media_type,
        'selected_sort': sort,
        'selected_order': order,
    })


@require_GET
@never_cache
def news_api(request):
    media_type = request.GET.get('type', 'movie')
    sort = request.GET.get('sort', 'views')
    order = request.GET.get('order', 'desc')
    if media_type not in NEWS_CHANNELS or sort not in NEWS_SORTS or order not in NEWS_ORDERS:
        return JsonResponse({'error': 'Choose a valid media type and sort order.'}, status=400)
    channels = get_news_channels(media_type)
    try:
        return JsonResponse(fetch_news(media_type, sort, order, channels=channels))
    except NewsFetchError as error:
        # Keep source controls usable even when every enabled feed is down.
        return JsonResponse({'error': str(error), 'channels': channels}, status=error.status)


def _set_default_channel(media_type, channel_id, enabled):
    # No network work inside this short transaction. Update only this preference.
    with transaction.atomic():
        settings = AppSettings.objects.select_for_update().order_by('pk').first()
        if settings is None:
            settings = AppSettings.objects.create()
        preferences = dict(settings.news_disabled_channels) if isinstance(settings.news_disabled_channels, dict) else {}
        previous = preferences.get(media_type, [])
        disabled = {value for value in previous if isinstance(value, str)} if isinstance(previous, list) else set()
        if enabled:
            disabled.discard(channel_id)
        else:
            disabled.add(channel_id)
        preferences[media_type] = sorted(disabled)
        settings.news_disabled_channels = preferences
        settings.save(update_fields=['news_disabled_channels'])


@require_http_methods(['GET', 'POST'])
@never_cache
def news_channels(request):
    if request.method == 'GET':
        media_type = request.GET.get('type', 'movie')
        if media_type not in NEWS_CHANNELS:
            return JsonResponse({'error': 'Choose a valid media type.'}, status=400)
        return JsonResponse({'channels': get_news_channels(media_type)})
    try:
        if len(request.body) > 8192:
            raise ValueError
        data = json.loads(request.body)
        if not isinstance(data, dict):
            raise ValueError
    except (ValueError, UnicodeError):
        return JsonResponse({'error': 'Could not read the channel request.'}, status=400)
    media_type = data.get('type')
    action = data.get('action')
    if not isinstance(media_type, str) or media_type not in NEWS_CHANNELS:
        return JsonResponse({'error': 'Choose a valid media type.'}, status=400)

    if action == 'add':
        url = data.get('url')
        if not isinstance(url, str) or not 1 <= len(url.strip()) <= 500:
            return JsonResponse({'error': 'Enter a YouTube channel link.'}, status=400)
        try:
            metadata = resolve_news_channel(url)
        except ValueError as error:
            return JsonResponse({'error': str(error)}, status=400)
        except NewsFetchError as error:
            return JsonResponse({'error': str(error)}, status=error.status)
        default_ids = {channel['id'] for channel in NEWS_CHANNELS[media_type]}
        if metadata['channel_id'] in default_ids:
            _set_default_channel(media_type, metadata['channel_id'], True)
        else:
            source, created = NewsChannel.objects.get_or_create(
                media_type=media_type, channel_id=metadata['channel_id'],
                defaults={key: value for key, value in metadata.items() if key != 'channel_id'},
            )
            if not created:
                if source.enabled:
                    return JsonResponse({'error': 'This channel is already included.'}, status=400)
                source.enabled = True
                source.save(update_fields=['enabled'])
    elif action in ('toggle', 'delete'):
        key = data.get('key')
        if not isinstance(key, str) or len(key) > 64:
            return JsonResponse({'error': 'Choose a valid channel.'}, status=400)
        kind, _, identity = key.partition(':')
        if action == 'toggle' and not isinstance(data.get('enabled'), bool):
            return JsonResponse({'error': 'Choose whether the channel is enabled.'}, status=400)
        if kind == 'default':
            if action == 'delete':
                return JsonResponse({'error': 'Default channels can be disabled.'}, status=400)
            if identity not in {channel['id'] for channel in NEWS_CHANNELS[media_type]}:
                return JsonResponse({'error': 'This channel was not found.'}, status=404)
            _set_default_channel(media_type, identity, data['enabled'])
        elif kind == 'custom' and identity.isascii() and identity.isdecimal() and 0 < int(identity) < 2 ** 63:
            query = NewsChannel.objects.filter(pk=int(identity), media_type=media_type)
            if action == 'delete':
                changed, _ = query.delete()
            else:
                changed = query.update(enabled=data['enabled'])
            if not changed:
                return JsonResponse({'error': 'This channel was not found.'}, status=404)
        else:
            return JsonResponse({'error': 'Choose a valid channel.'}, status=400)
    else:
        return JsonResponse({'error': 'Choose a valid channel action.'}, status=400)
    return JsonResponse({'channels': get_news_channels(media_type)})
