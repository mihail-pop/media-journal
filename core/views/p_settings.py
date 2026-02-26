from django.apps import apps
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from core.services.p_settings import cleanup_old_tasks, BackupTask, BACKUP_TASKS
from django.http import FileResponse, HttpResponseBadRequest
from django.http import JsonResponse
from core.models import APIKey, NavItem
import uuid
import json
import requests
import logging
import os
import datetime
import tempfile

logger = logging.getLogger(__name__)

@require_POST
def update_preferences(request):
    data = json.loads(request.body.decode("utf-8"))
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    if not settings:
        settings = AppSettings.objects.create()

    settings.show_date_field = data.get("show_date_field", False)
    settings.show_repeats_field = data.get("show_repeats_field", False)
    settings.save()

    return JsonResponse({"success": True})


@require_POST
def update_theme(request):
    data = json.loads(request.body.decode("utf-8"))
    theme_mode = data.get("theme_mode")

    if theme_mode not in ["light", "dark", "brown", "green"]:
        return JsonResponse({"error": "Invalid theme mode"}, status=400)

    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    if not settings:
        settings = AppSettings.objects.create()

    settings.theme_mode = theme_mode
    settings.save()

    return JsonResponse({"success": True})

@ensure_csrf_cookie
@require_GET
def create_backup(request):
    cleanup_old_tasks()
    task_id = uuid.uuid4().hex
    task = BackupTask(task_id, "export")
    BACKUP_TASKS[task_id] = task
    task.start()
    return JsonResponse({"task_id": task_id})


@ensure_csrf_cookie
@require_POST
def restore_backup(request):
    cleanup_old_tasks()
    uploaded_file = request.FILES.get("backup_file")
    if not uploaded_file:
        return JsonResponse({"error": "No file uploaded"}, status=400)

    # Save to temp file first
    temp_fd, temp_path = tempfile.mkstemp(suffix=".zip")
    os.close(temp_fd)

    with open(temp_path, "wb") as f:
        for chunk in uploaded_file.chunks():
            f.write(chunk)

    task_id = uuid.uuid4().hex
    task = BackupTask(task_id, "import", upload_path=temp_path)
    BACKUP_TASKS[task_id] = task
    task.start()

    return JsonResponse({"task_id": task_id})


@require_GET
def backup_status(request, task_id):
    task = BACKUP_TASKS.get(task_id)
    if not task:
        return JsonResponse({"error": "Task not found"}, status=404)

    return JsonResponse(
        {
            "status": task.status,
            "progress": task.progress,
            "message": task.message,
            "details": task.details,
            "error": task.error,
        }
    )


@require_GET
def backup_cancel(request, task_id):
    task = BACKUP_TASKS.get(task_id)
    if task:
        task.cancel()
    return JsonResponse({"success": True})


@require_GET
def backup_download(request, task_id):
    task = BACKUP_TASKS.get(task_id)
    if not task or task.status != "completed" or not task.result_path:
        return HttpResponseBadRequest("Backup not ready or not found")

    return FileResponse(
        open(task.result_path, "rb"),
        as_attachment=True,
        filename=f"media_journal_backup_{datetime.datetime.now().strftime('%Y%m%d')}.zip",
    )


@ensure_csrf_cookie
def add_key(request):
    data = json.loads(request.body)
    name = data.get("name", "").strip().lower()
    key_1 = data.get("key_1", "").strip()
    key_2 = data.get("key_2", "").strip()

    allowed_names = ["tmdb", "igdb", "mal", "anilist"]

    if not name or not key_1:
        return JsonResponse({"error": "Name and Key 1 are required."}, status=400)

    if name not in allowed_names:
        return JsonResponse(
            {"error": "Invalid name. Must be one of: tmdb, igdb, mal, anilist."},
            status=400,
        )

    if APIKey.objects.filter(name=name).exists():
        return JsonResponse(
            {"error": f"There is already an entry for '{name}'."}, status=400
        )

    APIKey.objects.create(name=name, key_1=key_1, key_2=key_2)
    return JsonResponse({"message": "API key added."})


@ensure_csrf_cookie
def update_key(request):
    data = json.loads(request.body)
    try:
        key = APIKey.objects.get(id=data["id"])
        key.key_1 = data.get("key_1", key.key_1)
        key.key_2 = data.get("key_2", key.key_2)
        key.save()
        return JsonResponse({"message": "API key updated."})
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "Key not found."}, status=404)


@ensure_csrf_cookie
def delete_key(request):
    data = json.loads(request.body)
    try:
        key = APIKey.objects.get(id=data["id"])
        key.delete()
        return JsonResponse({"message": "API key deleted."})
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "Key not found."}, status=404)

@ensure_csrf_cookie
@require_POST
def update_rating_mode(request):
    import json

    try:
        data = json.loads(request.body)
        new_mode = data.get("rating_mode")
        valid_modes = {"faces", "stars_5", "scale_10", "scale_100"}
        if new_mode not in valid_modes:
            return JsonResponse({"success": False, "error": "Invalid rating mode."})
        AppSettings = apps.get_model("core", "AppSettings")
        settings = AppSettings.objects.first()
        if not settings:
            settings = AppSettings.objects.create(rating_mode=new_mode)
        else:
            settings.rating_mode = new_mode
            settings.save()
        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)})


def version_info_api(request):
    from core.context_processors import version_context

    current_version = version_context(request)["version"]

    try:
        response = requests.get(
            "https://api.github.com/repos/mihail-pop/media-journal/releases/latest",
            timeout=5,
        )
        latest_version = response.json().get("tag_name", "Unknown")
    except Exception:
        latest_version = "Unable to check"

    return JsonResponse(
        {"current_version": current_version, "latest_version": latest_version}
    )

@ensure_csrf_cookie
@require_POST
def update_nav_items(request):
    try:
        data = json.loads(request.body)
        items = data.get("items", [])

        for item_data in items:
            nav_id = item_data.get("id")
            position = item_data.get("position")
            visible = item_data.get("visible", True)

            try:
                nav_item = NavItem.objects.get(id=nav_id)
                nav_item.position = position
                nav_item.visible = visible
                nav_item.save()
            except NavItem.DoesNotExist:
                continue  # Skip invalid IDs

        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=400)
