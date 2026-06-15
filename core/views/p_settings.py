import os
import json
import uuid
import datetime
import tempfile
import concurrent.futures

import requests
from django.apps import apps
from django.http import FileResponse, JsonResponse, HttpResponseBadRequest
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from core.models import APIKey, NavItem
from core.services.p_settings import (
    BACKUP_TASKS,
    BackupTask,
    RefreshTask,
    cleanup_old_tasks,
)


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


@require_POST
def update_preferences(request):
    data = json.loads(request.body.decode("utf-8"))
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    if not settings:
        settings = AppSettings.objects.create()

    settings.show_date_field = data.get("show_date_field", False)
    settings.show_repeats_field = data.get("show_repeats_field", False)
    settings.show_collections_field = data.get("show_collections_field", False)
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


class AutoDeleteFile:
    """A cross-platform wrapper that deletes the file from disk the moment the browser finishes downloading."""
    def __init__(self, path):
        self._path = path
        self._file = open(path, 'rb')

    def __getattr__(self, item):
        # Pass normal file operations (read, seek, size) to the actual file
        return getattr(self._file, item)

    def close(self):
        # 1. Close the file to release OS locks (crucial for Windows)
        self._file.close()
        
        # 2. Instantly delete the file if it hasn't been deleted already
        if os.path.exists(self._path):
            try:
                os.remove(self._path)
            except Exception:
                pass

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

    # --- CHANGED LINE HERE --- 
    # Added the prefix so we can easily track and clean up orphaned uploads
    temp_fd, temp_path = tempfile.mkstemp(prefix="media_journal_upload_", suffix=".zip")
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

    # Use our new AutoDelete wrapper instead of the standard open()
    wrapped_file = AutoDeleteFile(task.result_path)

    return FileResponse(
        wrapped_file,
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

@require_GET
def api_status_check(request):
    def check_tmdb():
        key = APIKey.objects.filter(name="tmdb").first()
        if not key or not key.key_1: 
            return "missing_key"
        try:
            r = requests.get(f"https://api.themoviedb.org/3/configuration?api_key={key.key_1}", timeout=3)
            if r.status_code == 200: 
                return "ok"
            if r.status_code == 401: 
                return "invalid_key"
            if r.status_code == 429: 
                return "rate_limited"
            return "down"
        except Exception: 
            return "down"

    def check_anilist():
        try:
            r = requests.post("https://graphql.anilist.co", json={"query": "{ Media(id: 1) { id } }"}, timeout=3)
            if r.status_code in [200, 400]: 
                return "ok"
            if r.status_code == 429: 
                return "rate_limited"
            return "down"
        except Exception: 
            return "down"

    def check_igdb():
        from core.services.m_games import get_igdb_token
        key = APIKey.objects.filter(name="igdb").first()
        if not key or not key.key_1 or not key.key_2: 
            return "missing_key"
        try:
            token = get_igdb_token()
            if not token: 
                return "auth_error"
            r = requests.post(
                "https://api.igdb.com/v4/games",
                headers={"Client-ID": key.key_1, "Authorization": f"Bearer {token}"},
                data="fields id; limit 1;",
                timeout=3
            )
            if r.status_code == 200: 
                return "ok"
            if r.status_code == 401: 
                return "invalid_key"
            if r.status_code == 429: 
                return "rate_limited"
            return "down"
        except Exception: 
            return "down"

    def check_openlib():
        try:
            # Fetch a specific, highly-cached Work instead of doing a heavy DB search
            r = requests.get("https://openlibrary.org/works/OL45804W.json", timeout=5)
            if r.status_code == 200: 
                return "ok"
            if r.status_code == 429: 
                return "rate_limited"
            return "down"
        except Exception: 
            return "down"

    def check_musicbrainz():
        try:
            headers = {"User-Agent": "MediaJournal/1.0 (https://github.com/mihail-pop/media-journal)"}
            # Increased timeout to 5 seconds
            r = requests.get("https://musicbrainz.org/ws/2/recording?query=test&limit=1&fmt=json", headers=headers, timeout=5)
            if r.status_code == 200: 
                return "ok"
            if r.status_code == 429: 
                return "rate_limited"
            return "ok" if r.status_code < 500 else "down"
        except Exception: 
            return "down"

    # Run checks concurrently to prevent the page from hanging on multiple timeouts
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            "tmdb": executor.submit(check_tmdb),
            "anilist": executor.submit(check_anilist),
            "igdb": executor.submit(check_igdb),
            "openlib": executor.submit(check_openlib),
            "musicbrainz": executor.submit(check_musicbrainz),
        }
        
        statuses = {k: v.result() for k, v in futures.items()}

    return JsonResponse({"statuses": statuses})

@ensure_csrf_cookie
@require_POST
def refresh_data(request):
    try:
        data = json.loads(request.body)
        media_type = data.get("media_type", "all")

        cleanup_old_tasks()
        task_id = uuid.uuid4().hex
        task = RefreshTask(task_id, media_type)
        BACKUP_TASKS[task_id] = task
        task.start()

        return JsonResponse({"task_id": task_id})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)