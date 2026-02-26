from django.views.decorators.csrf import ensure_csrf_cookie
from django.http import JsonResponse
from core.services.m_people import character_search, actor_search
import logging


logger = logging.getLogger(__name__)

@ensure_csrf_cookie
def character_search_view(request):
    query = request.GET.get("q", "")
    results = character_search(query) if query else []
    return JsonResponse(results, safe=False)

@ensure_csrf_cookie
def actor_search_view(request):
    query = request.GET.get("q", "")
    results = actor_search(query) if query else []
    return JsonResponse(results, safe=False)
