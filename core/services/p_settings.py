from django.core.serializers import deserialize
from django.core.serializers import serialize
from django.conf import settings
from core.models import APIKey, MediaItem, FavoritePerson, NavItem, AppSettings
import uuid
import time
import os
import tempfile
import zipfile
import threading
import logging

logger = logging.getLogger(__name__)

# Global dictionary to store backup tasks (in-memory for simplicity)
BACKUP_TASKS = {}

class BackupTask(threading.Thread):
    def __init__(self, task_id, task_type, upload_path=None):
        super().__init__()
        self.task_id = task_id
        self.task_type = task_type
        self.upload_path = upload_path
        self.progress = 0
        self.status = "pending"  # pending, running, completed, error, cancelled
        self.message = "Initializing..."
        self.details = ""
        self.result_path = None
        self.error = None
        self._cancel_event = threading.Event()
        self.daemon = True
        self.created_at = time.time()
        self.start_processing_time = None

    def cancel(self):
        self._cancel_event.set()
        self.status = "cancelled"
        self.message = "Cancelling..."

    def run(self):
        self.status = "running"
        self.start_processing_time = time.time()
        try:
            if self.task_type == "export":
                self.do_export()
            elif self.task_type == "import":
                self.do_import()
        except Exception as e:
            self.status = "error"
            self.error = str(e)
            logger.error(f"Backup task error: {e}")
        finally:
            # Cleanup upload file if import
            if self.upload_path and os.path.exists(self.upload_path):
                try:
                    os.remove(self.upload_path)
                except Exception:
                    pass

            if self.status == "running":
                self.status = "completed"
                self.progress = 100
                self.message = "Done!"
            elif self.status == "cancelled":
                self.message = "Cancelled."
                # Cleanup result if export cancelled
                if self.result_path and os.path.exists(self.result_path):
                    try:
                        os.remove(self.result_path)
                    except Exception:
                        pass

    def update_progress(self, processed, total, message):
        self.progress = int((processed / total) * 100)
        self.message = message

        if self.start_processing_time:
            elapsed = time.time() - self.start_processing_time
            if elapsed > 0 and processed > 0:
                rate = processed / elapsed
                remaining_items = total - processed
                seconds_left = int(remaining_items / rate)

                if seconds_left < 60:
                    time_str = f"{seconds_left} sec left"
                else:
                    time_str = f"{seconds_left // 60} min {seconds_left % 60} sec left"

                self.details = f"{processed}/{total} ({time_str})"
            else:
                self.details = f"{processed}/{total}"

    def do_export(self):
        self.message = "Gathering database data"

        # 1. Serialize Data (Include all relevant models)
        models_to_backup = [
            MediaItem.objects.all(),
            FavoritePerson.objects.all(),
            APIKey.objects.all(),
            NavItem.objects.all(),
            AppSettings.objects.all(),
        ]

        all_objects = []
        for qs in models_to_backup:
            all_objects.extend(list(qs))

        json_data = serialize("json", all_objects)

        if self._cancel_event.is_set():
            return

        # 2. Prepare Zip
        self.message = "Scanning files"
        temp_dir = tempfile.gettempdir()
        zip_filename = f"media_journal_backup_{uuid.uuid4().hex}.zip"
        zip_path = os.path.join(temp_dir, zip_filename)
        self.result_path = zip_path

        media_root = settings.MEDIA_ROOT
        files_to_zip = []

        # Folders to include
        include_folders = [
            "posters",
            "banners",
            "cast",
            "related",
            "screenshots",
            "seasons",
            "episodes",
            "favorites",
        ]

        for folder in include_folders:
            folder_path = os.path.join(media_root, folder)
            if os.path.exists(folder_path):
                for root, dirs, files in os.walk(folder_path):
                    for file in files:
                        abs_path = os.path.join(root, file)
                        rel_path = os.path.relpath(abs_path, media_root)
                        files_to_zip.append((abs_path, rel_path))

        total_items = len(files_to_zip) + 1  # +1 for json
        processed = 0

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_STORED) as zipf:
            # Write JSON
            zipf.writestr("backup_data.json", json_data)

            processed += 1
            self.update_progress(processed, total_items, "Archiving")

            # Write Files directly (efficient)
            for abs_path, rel_path in files_to_zip:
                if self._cancel_event.is_set():
                    return

                try:
                    zipf.write(abs_path, arcname=rel_path)
                except Exception as e:
                    logger.warning(f"Could not zip {abs_path}: {e}")

                processed += 1
                if processed % 100 == 0:  # Update progress periodically
                    self.update_progress(processed, total_items, "Archiving")

    def do_import(self):
        self.message = "Reading backup file"
        if not self.upload_path or not os.path.exists(self.upload_path):
            raise Exception("Upload file not found")

        with zipfile.ZipFile(self.upload_path, "r") as zipf:
            all_files = zipf.namelist()

            # 1. Restore DB
            json_filename = "backup_data.json"
            if "media_items.json" in all_files and json_filename not in all_files:
                json_filename = "media_items.json"  # Legacy support

            # Initialize variables to avoid UnboundLocalError
            files_to_extract = [f for f in all_files if not f.endswith(".json")]
            processed = 0
            total_items = len(files_to_extract)

            if json_filename in all_files:
                self.message = "Restoring database"
                json_data = zipf.read(json_filename)

                # Deserialize to list first to get count for progress
                objects = list(deserialize("json", json_data))
                del json_data  # Free memory: Raw JSON bytes no longer needed
                total_items += len(objects)

                if total_items == 0:
                    total_items = 1  # Avoid division by zero

                for deserialized_object in objects:
                    if self._cancel_event.is_set():
                        return
                    obj = deserialized_object.object

                    try:
                        # Smart Merge Logic
                        if isinstance(obj, MediaItem):
                            MediaItem.objects.update_or_create(
                                source=obj.source,
                                source_id=obj.source_id,
                                media_type=obj.media_type,
                                defaults={
                                    field.name: getattr(obj, field.name)
                                    for field in MediaItem._meta.fields
                                    if field.name != "id"
                                },
                            )
                        elif isinstance(obj, FavoritePerson):
                            # Try to find existing by name and type to avoid duplicates
                            existing = FavoritePerson.objects.filter(
                                name=obj.name, type=obj.type
                            ).first()
                            if existing:
                                for field in FavoritePerson._meta.fields:
                                    if field.name != "id":
                                        setattr(
                                            existing,
                                            field.name,
                                            getattr(obj, field.name),
                                        )
                                existing.save()
                            else:
                                obj.save()
                        elif isinstance(obj, APIKey):
                            APIKey.objects.update_or_create(
                                name=obj.name,
                                defaults={"key_1": obj.key_1, "key_2": obj.key_2},
                            )
                        elif isinstance(obj, NavItem):
                            NavItem.objects.update_or_create(
                                name=obj.name,
                                defaults={
                                    "visible": obj.visible,
                                    "position": obj.position,
                                },
                            )
                        elif isinstance(obj, AppSettings):
                            if not AppSettings.objects.exists():
                                obj.save()
                            else:
                                current = AppSettings.objects.first()
                                for field in AppSettings._meta.fields:
                                    if field.name != "id":
                                        setattr(
                                            current,
                                            field.name,
                                            getattr(obj, field.name),
                                        )
                                current.save()
                        else:
                            obj.save()
                    except Exception as e:
                        logger.warning(f"Error restoring object {obj}: {e}")

                    processed += 1
                    if processed % 100 == 0:
                        self.update_progress(
                            processed, total_items, "Restoring database"
                        )

            # 2. Restore Files
            self.message = "Restoring media files"
            media_root = settings.MEDIA_ROOT

            if total_items == 0:
                total_items = 1

            for file_name in files_to_extract:
                if self._cancel_event.is_set():
                    return

                # Security check
                if (
                    ".." in file_name
                    or file_name.startswith("/")
                    or file_name.startswith("\\")
                ):
                    continue

                # Extract
                target_path = os.path.join(media_root, file_name)
                os.makedirs(os.path.dirname(target_path), exist_ok=True)

                with open(target_path, "wb") as f:
                    f.write(zipf.read(file_name))

                processed += 1
                if processed % 100 == 0:
                    self.update_progress(
                        processed, total_items, "Restoring media files"
                    )


def cleanup_old_tasks():
    """Remove backup tasks older than 1 hour"""
    now = time.time()
    to_remove = []
    for tid, task in list(BACKUP_TASKS.items()):
        if now - task.created_at > 3600:  # 1 hour
            to_remove.append(tid)
            # Clean up files
            if task.result_path and os.path.exists(task.result_path):
                try:
                    os.remove(task.result_path)
                except Exception:
                    pass
            if task.upload_path and os.path.exists(task.upload_path):
                try:
                    os.remove(task.upload_path)
                except Exception:
                    pass

    for tid in to_remove:
        del BACKUP_TASKS[tid]
