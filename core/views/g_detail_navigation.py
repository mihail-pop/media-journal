"""Keep provider failures separate from a successful local item deletion."""

import logging
from functools import wraps

from django.shortcuts import redirect
from django.urls import reverse


logger = logging.getLogger(__name__)

_MEDIA_LIST_ROUTES = {
    'movie': 'movies', 'tv': 'tvshows', 'anime': 'anime', 'manga': 'manga',
    'game': 'games', 'book': 'books', 'music': 'music',
}


def detail_after_delete(media_type=None):
    """Fall back to the media list only for the immediate post-delete visit."""
    def decorate(view):
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            selected_type = media_type if media_type is not None else kwargs.get('media_type')
            list_route = _MEDIA_LIST_ROUTES.get(selected_type)
            if request.method != 'GET' or request.GET.get('after_delete') != '1' or list_route is None:
                return view(request, *args, **kwargs)

            def fallback():
                return redirect(f'{reverse(list_route)}?detail_unavailable=1')

            try:
                response = view(request, *args, **kwargs)
            except Exception:
                logger.exception('Could not load %s details after deleting a local item.', selected_type)
                return fallback()

            content_type = response.get('Content-Type', '').split(';', 1)[0].lower()
            if response.status_code >= 400 or (
                200 <= response.status_code < 300
                and content_type not in ('text/html', 'application/xhtml+xml')
            ):
                logger.warning(
                    'Could not load %s details after deletion (HTTP %s, %s).',
                    selected_type, response.status_code, content_type or 'no content type',
                )
                return fallback()
            return response

        return wrapped

    return decorate
