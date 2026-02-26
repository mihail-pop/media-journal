import json

from django.apps import apps
from django.http import JsonResponse
from django.views.decorators.http import require_POST


@require_POST
def save_username(request):
    data = json.loads(request.body.decode("utf-8"))
    username = data.get("username", "").strip()

    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    if not settings:
        settings = AppSettings.objects.create()

    settings.username = username
    settings.save()

    return JsonResponse({"success": True})
