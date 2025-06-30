import requests
from .models import APIKey, MediaItem
from .utils import download_image
from django.utils import timezone
from core.utils import fetch_anilist_data
from requests.exceptions import RequestException


def update_tmdb_seasons(media_item):
    """
    Check if the TMDB TV series has new seasons.
    If so, update the MediaItem and set a notification.
    """
    if media_item.media_type != "tv" or media_item.source != "tmdb":
        return False  # Skip if not a TMDB TV show

    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        print("TMDB API key not found.")
        return False
    
    url = f"https://api.themoviedb.org/3/tv/{media_item.source_id}"
    params = {"api_key": api_key}
    response = requests.get(url, params=params)

    try:
        # ... your TMDB API call
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
            # proceed with update if valid
    except RequestException as e:
        print(f"🌐 TMDB update skipped for {media_item.title} — no connection or error: {e}")
    except Exception as e:
        print(f"⚠️ Unexpected error while updating {media_item.title}: {e}")
    

    if response.status_code != 200:
        print(f"TMDB fetch failed for ID {media_item.source_id}")
        return False

    data = response.json()
    fetched_seasons = data.get("seasons", [])

    # Compare with existing
    existing_seasons = media_item.seasons or []
    existing_numbers = {s["season_number"] for s in existing_seasons}

    new_seasons = []
    for i, season in enumerate(fetched_seasons):
        season_number = season.get("season_number")
        if season_number in existing_numbers:
            continue  # already saved

        # New season found
        poster_path = season.get("poster_path")
        local_poster = ""
        if poster_path:
            full_url = f"https://image.tmdb.org/t/p/w300{poster_path}"
            local_poster = download_image(full_url, f"seasons/tmdb_{media_item.source_id}_s{season_number}.jpg")

        new_seasons.append({
            "season_number": season_number,
            "name": season.get("name"),
            "episode_count": season.get("episode_count"),
            "poster_path": local_poster,
            "air_date": season.get("air_date"),
        })

    if new_seasons:
        media_item.seasons = existing_seasons + new_seasons
        media_item.notification = True
        media_item.last_updated = timezone.now()
        media_item.save()
        print(f"[TMDB] Updated: {media_item.title} – {len(new_seasons)} new season(s).")
        return True

    # No new seasons
    media_item.last_updated = timezone.now()
    media_item.save()
    return False

def update_mal_anime_manga(item: MediaItem):
    if item.source != "mal" or item.media_type not in ["anime", "manga"]:
        return  # Not a MAL anime/manga, skip

    try:
        anilist_data = fetch_anilist_data(item.source_id, item.media_type)
    except requests.exceptions.RequestException as e:
        print(f"[AniList Update] Network error for {item.title}: {e}")
        item.last_updated = timezone.now()  # Prevent retry storm
        item.save()
        return
    except Exception as e:
        print(f"[AniList Update] Unexpected error for {item.title}: {e}")
        item.last_updated = timezone.now()
        item.save()
        return

    existing = item.related_titles or []
    existing_ids = {r["mal_id"] for r in existing if "mal_id" in r}

    new_sequels = []
    for rel in anilist_data.get("related_titles", []):
        if rel["relation"].lower() != "sequel":
            continue

        if rel["mal_id"] in existing_ids:
            continue  # already present

        # Download image if needed
        poster_path = rel.get("poster_path")
        local_path = download_image(poster_path, f"related/mal_{rel['mal_id']}.jpg") if poster_path else ""

        new_sequels.append({
            "mal_id": rel["mal_id"],
            "title": rel["title"],
            "poster_path": local_path,
            "relation": "Sequel",
        })

    if new_sequels:
        print(f"[AniList Update] Found {len(new_sequels)} new sequel(s) for {item.title}")
        item.related_titles = existing + new_sequels
        item.notification = True

    item.last_updated = timezone.now()
    item.save()
