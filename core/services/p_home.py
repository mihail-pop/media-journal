import os
import time
import threading
from collections import defaultdict
from datetime import timedelta, datetime

from django.conf import settings
from django.urls import reverse
from django.utils import timezone
from django.utils.timesince import timeuntil

from core.models import CalendarEvent, MediaItem
from core.services.m_anime_manga import update_anilist_anime_manga
from core.services.m_movies_tvshows import update_tmdb_seasons


def get_home_upcoming():
    """Build the same Upcoming content for the initial page and later refreshes."""
    now = timezone.now()
    today_date = now.date()
    cal_start_date = today_date - timedelta(days=7)
    cal_end_date = today_date + timedelta(days=7)

    calendar_events = CalendarEvent.objects.filter(
        date__date__gte=cal_start_date,
        date__date__lte=cal_end_date
    ).select_related('item').only(
        'date', 'title', 'item__title', 'item__media_type', 'item__cover_url',
        'item__source', 'item__provider_ids',
    ).order_by('date')

    events_by_date = defaultdict(list)
    for e in calendar_events:
        if e.title == "__API_SYNC__":
            continue
        events_by_date[e.date.date()].append(e)

    upcoming_tiles = []
    for i in range(15):
        d = cal_start_date + timedelta(days=i)
        if d == today_date:
            day_label = "Today"
        else:
            day_label = d.strftime("%A")

        day_events = []
        for e in events_by_date.get(d, []):
            time_str = ""
            if e.date.strftime("%H:%M") != "00:00":
                time_str = e.date.strftime("%H:%M")

            day_events.append({
                "title": e.item.title,
                "event_title": e.title,
                "time_str": time_str,
                "media_type": e.item.media_type,
                "cover_url": e.item.cover_url or "/static/core/img/placeholder.png",
            })

        upcoming_tiles.append({
            "date_str": d.strftime("%Y-%m-%d"),
            "display_date": d.strftime("%d %b"),
            "day_label": day_label,
            "is_today": d == today_date,
            "events": day_events
        })

    future_events = CalendarEvent.objects.filter(
        date__gte=now
    ).exclude(title="__API_SYNC__").select_related('item').only(
        'date', 'title', 'item__title', 'item__media_type', 'item__cover_url',
        'item__source', 'item__provider_ids',
    ).order_by('date')[:12]

    upcoming_list = []
    for e in future_events:
        url = "#"
        if e.item.source == "tmdb" and e.item.media_type in ["movie", "tv"]:
            if "_s" in str(e.item.source_id):
                show_id = str(e.item.source_id).split("_s")[0]
                season_number = str(e.item.source_id).split("_s")[1]
                url = reverse("tmdb_season_detail", args=[show_id, season_number])
            else:
                url = reverse("tmdb_detail", args=[e.item.media_type, e.item.source_id])
        elif e.item.media_type in ["anime", "manga"]:
            url = reverse("anilist_detail", args=[e.item.source, e.item.media_type, e.item.source_id])
        elif e.item.source == "igdb" and e.item.media_type == "game":
            url = reverse("igdb_detail", args=[e.item.source_id])
        elif e.item.source == "openlib" and e.item.media_type == "book":
            url = reverse("openlib_detail", args=[e.item.source_id])
        elif e.item.source == "musicbrainz" and e.item.media_type == "music":
            url = reverse("musicbrainz_detail", args=[e.item.source_id])

        time_until = timeuntil(e.date, now).split(',')[0]

        if e.title and e.title not in ["Global Release", "Release Date", "Game Release"]:
            action = f"{e.item.title} {e.title}"
        else:
            action = f"{e.item.title}"

        time_str_list = ""
        if e.date.strftime("%H:%M") != "00:00":
            time_str_list = f" ({e.date.strftime('%H:%M')})"

        upcoming_list.append({
            "message_main": action,
            "message_time": f"in {time_until}{time_str_list}",
            "media_type": e.item.media_type,
            "cover_url": e.item.cover_url or "/static/core/img/placeholder.png",
            "url": url,
        })

    return {"upcoming_tiles": upcoming_tiles, "upcoming_list": upcoming_list}


_started_tmdb = False
_started_anilist = False
_started_cleanup = False


def acquire_media_lock():
    """Attempts to acquire the media operation lock. Returns True if successful."""
    lock_file = os.path.join(settings.BASE_DIR, '.media_operation_lock')
    
    if os.path.exists(lock_file):
        # Anti-deadlock: If lock is older than 15 mins (e.g. server crashed), remove it
        if time.time() - os.path.getmtime(lock_file) > 900:
            try:
                os.remove(lock_file)
            except OSError:
                pass
                
    try:
        # os.O_CREAT | os.O_EXCL ensures the lock is atomic (prevents race conditions)
        fd = os.open(lock_file, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.close(fd)
        return True
    except FileExistsError:
        return False

def release_media_lock():
    """Releases the media operation lock."""
    lock_file = os.path.join(settings.BASE_DIR, '.media_operation_lock')
    if os.path.exists(lock_file):
        try:
            os.remove(lock_file)
        except OSError:
            pass

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

        # 1. Wait gracefully if migration holds the lock
        while not acquire_media_lock():
            print("Media operation in progress. Cleanup waiting 60 seconds...")
            time.sleep(60)

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

            # Gather all VALID images currently in use by the database
            valid_files = set()
            for item in MediaItem.objects.all():
                # Add Cover
                if item.cover_url and item.cover_url.startswith("/media/"):
                    valid_files.add(item.cover_url.replace("/media/", "", 1).strip('/'))
                
                # Add Banner
                if item.banner_url and item.banner_url.startswith("/media/"):
                    valid_files.add(item.banner_url.replace("/media/", "", 1).strip('/'))
                
                # Smart scan all JSON fields for any image paths
                extract_valid_media(item.seasons, valid_files)
                extract_valid_media(item.episodes, valid_files)
                extract_valid_media(item.related_titles, valid_files)
                extract_valid_media(item.cast, valid_files)

            # Add Game Screenshots from the new relational table
            from core.models import Screenshot
            for shot in Screenshot.objects.all():
                if shot.url and shot.url.startswith("/media/"):
                    valid_files.add(shot.url.replace("/media/", "", 1).strip('/'))

            # Define the specific folders we want to clean
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

            # Scan the folders and delete files NOT in the valid list
            for folder_name in folders_to_clean:
                folder_path = os.path.join(settings.MEDIA_ROOT, folder_name)
                
                if not os.path.exists(folder_path):
                    continue
                
                for root_dir, dirs, files in os.walk(folder_path):
                    # Clean empty shard folders while walking
                    if not dirs and not files and root_dir != folder_path:
                        try:
                            os.rmdir(root_dir)
                        except OSError:
                            pass
                        continue

                    for filename in files:
                        if filename.startswith('.'):
                            continue
                        
                        file_to_delete = os.path.join(root_dir, filename)
                        # Calculate accurate relative path (e.g., "posters/e4/image.jpg")
                        rel_path = os.path.relpath(file_to_delete, settings.MEDIA_ROOT).replace('\\', '/')
                        
                        if rel_path not in valid_files:
                            try:
                                os.remove(file_to_delete)
                                deleted_count += 1
                            except OSError as e:
                                print(f"Could not delete {file_to_delete}: {e}")

            print(f"Media cleanup finished successfully. Deleted {deleted_count} orphaned files.")

        except Exception as e:
            print(f"Error during media cleanup: {e}")
        finally:
            # 2. Always release the lock when finished!
            release_media_lock()

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
            cutoff = now - timedelta(days=7)

            items = MediaItem.objects.filter(media_type="tv", source="tmdb").exclude(
                provider_ids__tmdb__icontains='_s'
            ).exclude(
                provider_ids__tmdb__startswith='custom_'
            )
            eligible = [item for item in items if item.last_updated < cutoff]

            for item in eligible[:60]:
                update_tmdb_seasons(item)
                time.sleep(30)

            print("TMDB check loop finished batch. Pausing for 1 hour...")
            time.sleep(1800)

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
            cutoff = now - timedelta(days=7)

            items = MediaItem.objects.filter(
                media_type__in=["anime", "manga"]
            ).exclude(
                provider_ids__anilist__startswith='custom_'
            ).exclude(
                provider_ids__mal__startswith='custom_'
            )
            eligible = [
                item
                for item in items
                if item.last_updated < cutoff and not has_sequel(item)
            ]

            for item in eligible[:60]:
                update_anilist_anime_manga(item)
                time.sleep(30)

            print("AniList check loop finished batch. Pausing for 1 hour...")
            time.sleep(1800)

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
