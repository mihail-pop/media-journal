import threading
import time
from datetime import timedelta
from django.utils import timezone
from core.models import MediaItem
from core.updaters import (
    update_tmdb_seasons,
    update_mal_anime_manga,
)

_started_tmdb = False
_started_anilist = False


def start_tmdb_background_loop():
    global _started_tmdb
    if _started_tmdb:
        return
    _started_tmdb = True

    def loop():
        print("✅ TMDB background update loop started")
        while True:
            now = timezone.now()
            cutoff = now - timedelta(days=30)

            items = MediaItem.objects.filter(media_type="tv", source="tmdb").exclude(
                source_id__contains="_s"
            )
            eligible = [item for item in items if item.last_updated < cutoff]

            for item in eligible[:30]:
                update_tmdb_seasons(item)
                time.sleep(60)

            print("⏳ TMDB check loop finished batch. Pausing for 1 hour...")
            time.sleep(3600)

    t = threading.Thread(target=loop, daemon=True)
    t.start()


def start_anilist_background_loop():
    global _started_anilist
    if _started_anilist:
        return
    _started_anilist = True

    def loop():
        print("✅ AniList background update loop started")
        while True:
            now = timezone.now()
            cutoff = now - timedelta(days=30)

            items = MediaItem.objects.filter(
                media_type__in=["anime", "manga"], source="mal"
            )
            eligible = [
                item
                for item in items
                if item.last_updated < cutoff and not has_sequel(item)
            ]

            for item in eligible[:30]:
                update_mal_anime_manga(item)
                time.sleep(60)

            print("⏳ AniList check loop finished batch. Pausing for 1 hour...")
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
