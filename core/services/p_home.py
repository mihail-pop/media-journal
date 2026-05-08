import os
import time
import threading
from datetime import timedelta, datetime

from django.conf import settings
from django.utils import timezone

from core.models import MediaItem
from core.services.m_anime_manga import update_anilist_anime_manga
from core.services.m_movies_tvshows import update_tmdb_seasons

_started_tmdb = False
_started_anilist = False
_started_cleanup = False

def start_media_cleanup_loop():
    global _started_cleanup
    if _started_cleanup:
        return
    _started_cleanup = True

    # --- Monthly Run Logic ---
    # Use a text file to track the last run date
    counter_file = os.path.join(settings.BASE_DIR, '.cleanup_runs')
    last_run_date = None
    
    if os.path.exists(counter_file):
        try:
            with open(counter_file, 'r') as f:
                content = f.read().strip()
                if content.isdigit():
                    last_run_date = None
                else:
                    last_run_date = datetime.strptime(content, '%Y-%m-%d').date()
        except (ValueError, Exception):
            last_run_date = None

    today = datetime.now().date()
    if last_run_date:
        days_since_last_run = (today - last_run_date).days
        if days_since_last_run < 30:
            print(f"Cleanup already ran {days_since_last_run} days ago. Skipping (runs monthly).")
            return

    try:
        with open(counter_file, 'w') as f:
            f.write(today.strftime('%Y-%m-%d'))
    except Exception as e:
        print(f"Failed to write cleanup date: {e}")

    # --- The Cleanup Thread ---
    def loop():
        print("Media cleanup task scheduled (runs monthly). Starting in 30 seconds...")
        time.sleep(30)

        try:
            print("Running orphan media cleanup...")
            
            # Helper function to recursively find all media URLs inside JSON fields
            def extract_valid_media(data, valid_set):
                if isinstance(data, dict):
                    for value in data.values():
                        extract_valid_media(value, valid_set)
                elif isinstance(data, list):
                    for item in data:
                        extract_valid_media(item, valid_set)
                elif isinstance(data, str):
                    if data.startswith("/media/"):
                        valid_set.add(data.replace("/media/", "", 1).strip('/'))

            # 1. Gather all VALID images currently in use by the database
            valid_files = set()
            for item in MediaItem.objects.all():
                # Add Cover
                if item.cover_url and item.cover_url.startswith("/media/"):
                    valid_files.add(item.cover_url.replace("/media/", "", 1).strip('/'))
                
                # Add Banner
                if item.banner_url and item.banner_url.startswith("/media/"):
                    valid_files.add(item.banner_url.replace("/media/", "", 1).strip('/'))
                
                # Smart scan all JSON fields for any image paths
                extract_valid_media(item.screenshots, valid_files)
                extract_valid_media(item.seasons, valid_files)
                extract_valid_media(item.episodes, valid_files)
                extract_valid_media(item.related_titles, valid_files)
                extract_valid_media(item.cast, valid_files)

            # 2. Define the specific folders we want to clean
            folders_to_clean =[
                "posters", 
                "banners", 
                "screenshots", 
                "seasons", 
                "episodes", 
                "related", 
                "cast"
            ]
            deleted_count = 0

            # 3. Scan the folders and delete files NOT in the valid list
            for folder_name in folders_to_clean:
                folder_path = os.path.join(settings.MEDIA_ROOT, folder_name)
                
                if not os.path.exists(folder_path):
                    continue
                
                for filename in os.listdir(folder_path):
                    if filename.startswith('.'):
                        continue
                    
                    # Reconstruct the relative path (e.g., "posters/image.jpg")
                    rel_path = f"{folder_name}/{filename}"
                    
                    if rel_path not in valid_files:
                        file_to_delete = os.path.join(folder_path, filename)
                        try:
                            os.remove(file_to_delete)
                            deleted_count += 1
                        except OSError as e:
                            print(f"Could not delete {file_to_delete}: {e}")

            print(f"Media cleanup finished successfully. Deleted {deleted_count} orphaned files.")

        except Exception as e:
            print(f"Error during media cleanup: {e}")

    t = threading.Thread(target=loop, daemon=True)
    t.start()

def start_tmdb_background_loop():
    global _started_tmdb
    if _started_tmdb:
        return
    _started_tmdb = True

    def loop():
        print("TMDB background update loop started")
        while True:
            now = timezone.now()
            cutoff = now - timedelta(days=30)

            items = MediaItem.objects.filter(media_type="tv", source="tmdb").exclude(
                provider_ids__tmdb__icontains='_s'
            )
            eligible = [item for item in items if item.last_updated < cutoff]

            for item in eligible[:30]:
                update_tmdb_seasons(item)
                time.sleep(60)

            print("TMDB check loop finished batch. Pausing for 1 hour...")
            time.sleep(3600)

    t = threading.Thread(target=loop, daemon=True)
    t.start()


def start_anilist_background_loop():
    global _started_anilist
    if _started_anilist:
        return
    _started_anilist = True

    def loop():
        print("AniList background update loop started")
        while True:
            now = timezone.now()
            cutoff = now - timedelta(days=30)

            items = MediaItem.objects.filter(
                media_type__in=["anime", "manga"]
            )
            eligible = [
                item
                for item in items
                if item.last_updated < cutoff and not has_sequel(item)
            ]

            for item in eligible[:30]:
                update_anilist_anime_manga(item)
                time.sleep(60)

            print("AniList check loop finished batch. Pausing for 1 hour...")
            time.sleep(3600)

    t = threading.Thread(target=loop, daemon=True)
    t.start()


def has_sequel(item):
    """Check if item.related_titles includes a sequel"""
    if not item.related_titles:
        return False
    for rel in item.related_titles:
        if rel.get("relation", "").lower() == "sequel":
            return True
    return False
