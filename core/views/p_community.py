import json
import requests
import logging

from django.apps import apps
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_GET

logger = logging.getLogger(__name__)


@require_POST
def save_username(request):
    data = json.loads(request.body.decode("utf-8"))
    username = data.get("username", "").strip()

    AppSettings = apps.get_model("core", "AppSettings")
    app_settings = AppSettings.objects.first()
    if not app_settings:
        app_settings = AppSettings.objects.create()

    app_settings.username = username
    app_settings.save()

    return JsonResponse({"success": True})


@require_GET
def posts_api(request):
    page = int(request.GET.get("page", 1))
    page_size = 25
    
    firebase_url = settings.FIREBASE_URL.rstrip('/')
    
    try:
        response = requests.get(f"{firebase_url}/posts.json", timeout=10)
        if not response.ok:
            return JsonResponse({'items': [], 'has_more': False, 'page': page})
        
        data = response.json() or {}
        
        # Convert to list and sort by timestamp (newest first)
        posts_list = [
            (post_id, post_data) 
            for post_id, post_data in data.items() 
            if post_data
        ]
        posts_list.sort(key=lambda x: x[1].get('timestamp', 0), reverse=True)
        
        # Paginate
        start = (page - 1) * page_size
        end = start + page_size
        paginated = posts_list[start:end]
        
        has_more = len(posts_list) > end
        
        # Format response
        items = [
            {**post_data, 'id': post_id}
            for post_id, post_data in paginated
        ]
        
        return JsonResponse({
            'items': items,
            'has_more': has_more,
            'page': page,
            'total': len(posts_list)
        })
        
    except Exception as e:
        logger.error(f"Error fetching posts: {e}")
        return JsonResponse({'error': str(e)}, status=500)
