"""Consistent provider failures without extra health-check requests."""
from functools import wraps
import json

import requests
from django.http import JsonResponse
from django.shortcuts import render


API_STATUS_URL = '/settings/?api_status=1#api-status'
PROVIDER_NAMES = {
    'tmdb': 'TMDB', 'anilist': 'AniList', 'mal': 'AniList', 'igdb': 'IGDB',
    'openlib': 'Open Library', 'musicbrainz': 'MusicBrainz', 'listenbrainz': 'ListenBrainz',
}


class ApiError(Exception):
    def __init__(self, provider, code='unavailable'):
        self.provider = 'anilist' if provider == 'mal' else provider
        self.code = code
        name = PROVIDER_NAMES.get(self.provider, 'the API')
        self.message = {
            'rate_limited': f'{name} rate limit reached. Check API status.',
            'missing_key': f'Add your {name} API credentials in Settings.',
            'invalid_key': f'Check your {name} API credentials in Settings.',
            'not_found': f'This item could not be found on {name}.',
        }.get(code, f"Couldn’t load data from {name}. Check API status.")
        self.status = {'rate_limited': 429, 'missing_key': 503, 'invalid_key': 503,
                       'not_found': 404}.get(code, 503)
        super().__init__(self.message)

    def payload(self):
        return {'success': False, 'error': self.message, 'provider': self.provider,
                'error_code': self.code, 'api_status_url': API_STATUS_URL}


def provider_for_request(request, *args, **kwargs):
    try:
        data = json.loads(request.body) if request.method == 'POST' else request.GET
        source = data.get('source')
        if source:
            return source
        media_type = data.get('type') or data.get('media_type')
        return {'movie': 'tmdb', 'tv': 'tmdb', 'anime': 'anilist', 'manga': 'anilist',
                'game': 'igdb', 'book': 'openlib', 'music': 'musicbrainz'}.get(media_type)
    except (ValueError, AttributeError):
        return None


def as_api_error(error, provider):
    if isinstance(error, ApiError):
        return error
    response = getattr(error, 'response', None)
    status = getattr(response, 'status_code', None)
    message = str(error).lower()
    if status == 429 or '429' in message or 'rate limit' in message or 'too many requests' in message:
        return ApiError(provider, 'rate_limited')
    if status in (401, 403) or 'invalid key' in message or 'authorization failed' in message:
        return ApiError(provider, 'invalid_key')
    if 'key' in message and any(word in message for word in ('missing', 'not found', 'does not exist', 'matching query')):
        return ApiError(provider, 'missing_key')
    if status == 404:
        return ApiError(provider, 'not_found')
    return ApiError(provider)


def api_request(provider, method, url, *, http=None, **kwargs):
    # Import uses its own paced/retrying client. Ordinary browsing still needs a
    # finite timeout; Open Library keeps its more generous response allowance.
    if http is None:
        kwargs.setdefault('timeout', (10, 60 if provider == 'openlib' else 30))
    try:
        response = getattr(http or requests, method)(url, **kwargs)
        response.raise_for_status()
        data = response.json()
    except (requests.RequestException, ValueError) as error:
        if provider == 'igdb' and 'id.twitch.tv/' in url and getattr(getattr(error, 'response', None), 'status_code', None) in (400, 401, 403):
            raise ApiError(provider, 'invalid_key') from error
        raise as_api_error(error, provider) from error
    if not isinstance(data, (dict, list)):
        raise ApiError(provider)
    if provider in ('anilist', 'mal') and isinstance(data, dict) and data.get('errors'):
        errors = data['errors']
        limited = any(str(error.get('status')) == '429' for error in errors if isinstance(error, dict))
        raise ApiError(provider, 'rate_limited' if limited else 'unavailable')
    return response


def require_api_data(condition, provider):
    if not condition:
        raise ApiError(provider)


class ApiClient:
    """Small adapter that also accepts the existing CSV import HTTP client."""
    def __init__(self, provider, http=None):
        self.provider, self.http = provider, http

    def get(self, url, **kwargs):
        return api_request(self.provider, 'get', url, http=self.http, **kwargs)

    def post(self, url, **kwargs):
        return api_request(self.provider, 'post', url, http=self.http, **kwargs)


def api_errors(provider=None, *, detail_page=False):
    """Keep API failures in the app UI; leave unrelated programming errors visible."""
    def decorate(view):
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            from core.models import APIKey, AppSettings
            source = provider(request, *args, **kwargs) if callable(provider) else provider
            source = source or provider_for_request(request)
            try:
                response = view(request, *args, **kwargs)
                if isinstance(response, JsonResponse):
                    body = json.loads(response.content)
                    if isinstance(body, dict) and body.get('error') and (response.status_code >= 500 or response.status_code == 200):
                        raise as_api_error(body['error'], source)
                return response
            except (ApiError, requests.RequestException, APIKey.DoesNotExist) as error:
                failure = ApiError(source, 'missing_key') if isinstance(error, APIKey.DoesNotExist) else as_api_error(error, source)
                if detail_page:
                    media_type = (detail_page if isinstance(detail_page, str) else kwargs.get('media_type')) or {
                        'tmdb': 'movie', 'anilist': 'anime', 'igdb': 'game',
                        'openlib': 'book', 'musicbrainz': 'music',
                    }.get(failure.provider, 'movie')
                    list_url = {'movie': '/movies/', 'tv': '/tvshows/', 'anime': '/anime/',
                                'manga': '/manga/', 'game': '/games/', 'book': '/books/',
                                'music': '/music/', 'person': '/favorites/'}.get(media_type, '/')
                    return render(request, 'core/g_api_unavailable.html', {
                        'api_error': failure.payload(), 'list_url': list_url,
                        'api_error_text': failure.message.removesuffix(' Check API status.'),
                        'page_type': media_type,
                        'theme_mode': AppSettings.objects.values_list('theme_mode', flat=True).first() or 'dark',
                    }, status=failure.status)
                return JsonResponse(failure.payload(), status=failure.status)
        return wrapped
    return decorate
