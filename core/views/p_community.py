import json
import math
import requests
import logging
import re

from django.apps import apps
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_GET

logger = logging.getLogger(__name__)


def _community_identity():
    AppSettings = apps.get_model('core', 'AppSettings')
    preferences = AppSettings.objects.only('community_id').first()
    if preferences is None:
        preferences, _ = AppSettings.objects.get_or_create(pk=1)
    return str(preferences.community_id)


@require_POST
def post_like(request, post_id):
    try:
        data = json.loads(request.body)
        liked = data['liked']
        legacy = data.get('legacy', False)
        if not isinstance(liked, bool) or not isinstance(legacy, bool):
            raise ValueError
        if legacy and not liked:
            raise ValueError
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', post_id):
            raise ValueError
    except (ValueError, TypeError, KeyError, AttributeError):
        return JsonResponse({'error': 'Invalid like.'}, status=400)

    identity = _community_identity()
    url = f"{settings.FIREBASE_URL.rstrip('/')}/posts/{post_id}.json"
    try:
        with requests.Session() as session:
            response = session.get(url, headers={'X-Firebase-ETag': 'true'}, timeout=10)
            for _ in range(4):
                if response.status_code not in (200, 412):
                    response.raise_for_status()
                post = response.json()
                if post is None:
                    return JsonResponse({'error': 'This post is no longer available.'}, status=404)
                if not isinstance(post, dict):
                    raise ValueError('Invalid community post')
                total = max(0, int(post.get('likes') or 0))
                liked_by = post.get('liked_by', {})
                if not isinstance(liked_by, dict):
                    raise ValueError('Invalid community likes')
                previous = liked_by.get(identity)
                if isinstance(previous, bool) and (legacy or previous == liked):
                    return JsonResponse({'liked': previous, 'likes': total})

                # Import a browser's old like without counting it a second time.
                next_total = total if legacy else max(0, total + int(liked) - int(previous is True))
                liked_by[identity] = liked
                post['liked_by'] = liked_by
                post['likes'] = next_total
                etag = response.headers.get('ETag')
                if not etag:
                    raise ValueError('Missing Firebase ETag')
                # Keep the identity and counter together. A concurrent like or
                # comment-count update must never be overwritten by this edit.
                response = session.put(url, json=post, headers={'if-match': etag}, timeout=10)
                if response.status_code == 412:
                    continue
                response.raise_for_status()
                return JsonResponse({'liked': liked, 'likes': next_total})
        return JsonResponse({'error': 'The post changed. Please try again.'}, status=409)
    except (requests.RequestException, ValueError, TypeError, OverflowError):
        logger.exception('Unable to update a community like.')
        return JsonResponse({'error': 'Unable to update your like. Please try again.'}, status=502)


@require_POST
def save_username(request):
    try:
        data = json.loads(request.body)
        username = data.get("username", "")
        if not isinstance(username, str) or len(username.strip()) > 50:
            raise ValueError
        username = username.strip()
    except (ValueError, AttributeError):
        return JsonResponse({"error": "Use a username of up to 50 characters."}, status=400)

    AppSettings = apps.get_model("core", "AppSettings")
    app_settings = AppSettings.objects.first()
    if not app_settings:
        app_settings = AppSettings.objects.create()

    app_settings.username = username
    app_settings.save(update_fields=["username"])

    return JsonResponse({"success": True})


@require_GET
def posts_api(request):
    try:
        page = int(request.GET.get("page", 1))
        if page < 1:
            raise ValueError
        cursor = json.loads(request.GET['cursor']) if 'cursor' in request.GET else None
        if cursor is not None and (
            not isinstance(cursor, list) or len(cursor) != 2 or
            isinstance(cursor[0], bool) or not isinstance(cursor[0], (int, float)) or
            not math.isfinite(cursor[0]) or not isinstance(cursor[1], str) or not cursor[1]
        ):
            raise ValueError
        if page > 1 and cursor is None:
            raise ValueError
    except (ValueError, TypeError):
        return JsonResponse({'error': 'Invalid page.'}, status=400)
    page_size = 25
    
    firebase_url = settings.FIREBASE_URL.rstrip('/')
    # One extra post tells us whether another page exists, without a full-feed read.
    params = {'orderBy': json.dumps('timestamp'), 'limitToLast': page_size + 1}
    if cursor is not None:
        # Firebase's REST boundary includes the key after the indexed value.
        # This also pages correctly when many posts share the same timestamp.
        params['endBefore'] = f'{json.dumps(cursor[0])},{json.dumps(cursor[1])}'
    
    try:
        response = requests.get(f"{firebase_url}/posts.json", params=params, timeout=10)
        if not response.ok:
            if response.status_code == 400 and 'index not defined' in response.text.lower():
                logger.warning('Community pagination requires a Firebase index on posts.timestamp.')
                return JsonResponse({'error': 'Community needs a Firebase index on posts.timestamp.'}, status=502)
            return JsonResponse({'error': 'Unable to load community posts. Please try again.'}, status=502)
        
        data = response.json() or {}
        
        # Convert to list and sort by timestamp (newest first)
        if not isinstance(data, dict):
            raise ValueError('Invalid community response')

        def post_key(post):
            try:
                timestamp = float(post[1].get('timestamp', 0))
                if not math.isfinite(timestamp):
                    timestamp = 0
            except (TypeError, ValueError):
                timestamp = 0
            return timestamp, post[0]

        posts_list = [(key, value) for key, value in data.items() if isinstance(value, dict) and value]
        posts_list.sort(key=post_key, reverse=True)
        # Keep the boundary exclusive even if an upstream response contains it.
        if cursor is not None:
            posts_list = [post for post in posts_list if post_key(post) < tuple(cursor)]

        paginated = posts_list[:page_size]
        has_more = len(posts_list) > page_size
        
        # Format response
        identity = _community_identity()
        items = []
        for post_id, post_data in paginated:
            liked_by = post_data.get('liked_by')
            my_like = liked_by.get(identity) if isinstance(liked_by, dict) else None
            # Only send this installation's state, not everyone else's IDs.
            items.append({
                **{key: value for key, value in post_data.items() if key != 'liked_by'},
                'id': post_id,
                'liked_by_me': my_like if isinstance(my_like, bool) else None,
            })
        
        return JsonResponse({
            'items': items,
            'has_more': has_more,
            'page': page,
            'next_cursor': list(post_key(paginated[-1])) if paginated else None,
        })
        
    except Exception as e:
        logger.error(f"Error fetching posts: {e}")
        return JsonResponse({'error': 'Unable to load community posts. Please try again.'}, status=502)
