import datetime
from django.conf import settings
from django.utils import timezone
import requests
import concurrent.futures

from core.models import APIKey, CalendarEvent
from core.services.m_games import get_igdb_token

def _normalize_dt(dt_obj):
    """Helper to convert timezone-aware datetimes to naive if USE_TZ is False."""
    if not settings.USE_TZ and timezone.is_aware(dt_obj):
        return timezone.make_naive(dt_obj)
    return dt_obj

def cleanup_old_events():
    """Deletes all events (API and Custom) older than 90 days, except the tracker."""
    current_utc = datetime.datetime.now(datetime.timezone.utc)
    cutoff = current_utc - datetime.timedelta(days=90)
    db_cutoff = _normalize_dt(cutoff)
    CalendarEvent.objects.filter(date__lt=db_cutoff).exclude(title="__API_SYNC__").delete()

def sync_items_with_apis(items):
    # Run the 3-month cleanup every time a sync happens
    cleanup_old_events()

    tmdb_movies = []
    tmdb_tv = []
    anilist_items = []
    igdb_items = []

    for item in items:
        # Skip custom user-created items
        if str(item.source_id).startswith("custom_"):
            continue

        source = item.source
        media_type = item.media_type

        if source == "tmdb":
            if media_type == "movie":
                tmdb_movies.append(item)
            elif media_type == "tv":
                tmdb_tv.append(item)
        elif source in ["anilist", "mal"]:
            anilist_items.append(item)
        elif source == "igdb":
            igdb_items.append(item)
    
    _sync_tmdb_movies(tmdb_movies)
    _sync_tmdb_tv(tmdb_tv)
    _sync_anilist(anilist_items)
    _sync_igdb(igdb_items)

def _mark_as_synced(item):
    item.calendar_last_sync = timezone.now()
    item.save(update_fields=['calendar_last_sync'])

def _sync_tmdb_movies(items):
    if not items: 
        return
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return

    def fetch_movie(item):
        try:
            resp = requests.get(f"https://api.themoviedb.org/3/movie/{item.source_id}", params={"api_key": api_key}, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                release_date_str = data.get("release_date")
                if release_date_str:
                    release_dt = datetime.datetime.strptime(release_date_str, "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc)
                    
                    current_utc = datetime.datetime.now(datetime.timezone.utc)
                    three_months_ago = current_utc - datetime.timedelta(days=90)
                    
                    if release_dt >= three_months_ago:
                        db_date = _normalize_dt(release_dt)
                        CalendarEvent.objects.update_or_create(
                            item=item, 
                            title="Global Release", 
                            is_custom=False,
                            defaults={'date': db_date}
                        )
            _mark_as_synced(item)
        except Exception as e:
            print(f"Error syncing TMDB movie {item.title}: {e}")

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        executor.map(fetch_movie, items)

def _sync_tmdb_tv(items):
    if not items: 
        return
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return

    def fetch_tv(item):
        try:
            is_season = "_s" in str(item.source_id)
            base_id = str(item.source_id).split("_s")[0] if is_season else item.source_id
                
            resp = requests.get(f"https://api.themoviedb.org/3/tv/{base_id}", params={"api_key": api_key}, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                current_utc = datetime.datetime.now(datetime.timezone.utc)
                three_months_ago = current_utc - datetime.timedelta(days=90)
                
                # Check BOTH last aired and next to air
                for ep_key in ["last_episode_to_air", "next_episode_to_air"]:
                    ep_data = data.get(ep_key)
                    if ep_data and ep_data.get("air_date"):
                        air_dt = datetime.datetime.strptime(ep_data["air_date"], "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc)
                        
                        if air_dt >= three_months_ago:
                            db_date = _normalize_dt(air_dt)
                            CalendarEvent.objects.update_or_create(
                                item=item, 
                                title=f"Episode {ep_data.get('episode_number')} (S{ep_data.get('season_number')})", 
                                is_custom=False,
                                defaults={'date': db_date}
                            )
            _mark_as_synced(item)
        except Exception as e:
            print(f"Error syncing TMDB TV {item.title}: {e}")

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        executor.map(fetch_tv, items)

def _sync_anilist(items):
    if not items: 
        return
    
    item_map = {}
    ids_to_fetch = []
    for item in items:
        a_id = item.provider_ids.get("anilist")
        if a_id:
            ids_to_fetch.append(int(a_id))
            item_map[int(a_id)] = item
    
    if not ids_to_fetch:
        return

    query = """
    query ($ids: [Int]) {
      Page(perPage: 50) {
        media(id_in: $ids) {
          id
          nextAiringEpisode { airingAt episode }
          startDate { year month day }
        }
      }
    }
    """
    
    try:
        resp = requests.post("https://graphql.anilist.co", json={"query": query, "variables": {"ids": ids_to_fetch}}, timeout=10)
        if resp.status_code == 200:
            media_list = resp.json().get("data", {}).get("Page", {}).get("media", [])
            for m in media_list:
                item = item_map.get(m["id"])
                if not item: 
                    continue
                
                current_utc = datetime.datetime.now(datetime.timezone.utc)
                three_months_ago = current_utc - datetime.timedelta(days=90)
                
                next_ep = m.get("nextAiringEpisode")
                if next_ep:
                    air_dt = datetime.datetime.fromtimestamp(next_ep["airingAt"], tz=datetime.timezone.utc)
                    db_date = _normalize_dt(air_dt)
                    CalendarEvent.objects.update_or_create(
                        item=item, 
                        title=f"Episode {next_ep['episode']}", 
                        is_custom=False,
                        defaults={'date': db_date}
                    )
                else:
                    start = m.get("startDate")
                    if start and start.get("year") and start.get("month") and start.get("day"):
                        start_dt = datetime.datetime(start["year"], start["month"], start["day"], tzinfo=datetime.timezone.utc)
                        if start_dt >= three_months_ago:
                            db_date = _normalize_dt(start_dt)
                            CalendarEvent.objects.update_or_create(
                                item=item, 
                                title="Release Date", 
                                is_custom=False,
                                defaults={'date': db_date}
                            )
                
                _mark_as_synced(item)
    except Exception as e:
        print(f"Error syncing AniList: {e}")

def _sync_igdb(items):
    if not items: 
        return
    token = get_igdb_token()
    if not token: 
        return

    try:
        igdb_keys = APIKey.objects.get(name="igdb")
    except APIKey.DoesNotExist:
        return

    item_map = {}
    ids_to_fetch = []
    for item in items:
        try:
            igdb_id = int(item.source_id)
            ids_to_fetch.append(str(igdb_id))
            item_map[igdb_id] = item
        except Exception:
            pass

    if not ids_to_fetch: 
        return

    id_str = ",".join(ids_to_fetch)
    query = f"fields id, first_release_date; where id = ({id_str}); limit 50;"

    headers = {
        "Client-ID": igdb_keys.key_1,
        "Authorization": f"Bearer {token}",
    }

    try:
        resp = requests.post("https://api.igdb.com/v4/games", headers=headers, data=query, timeout=10)
        if resp.status_code == 200:
            games = resp.json()
            for g in games:
                item = item_map.get(g["id"])
                if not item: 
                    continue
                
                release_ts = g.get("first_release_date")
                if release_ts:
                    release_dt = datetime.datetime.fromtimestamp(release_ts, tz=datetime.timezone.utc)
                    current_utc = datetime.datetime.now(datetime.timezone.utc)
                    three_months_ago = current_utc - datetime.timedelta(days=90)
                    
                    if release_dt >= three_months_ago:
                        db_date = _normalize_dt(release_dt)
                        CalendarEvent.objects.update_or_create(
                            item=item, 
                            title="Game Release", 
                            is_custom=False,
                            defaults={'date': db_date}
                        )
                
                _mark_as_synced(item)
    except Exception as e:
        print(f"Error syncing IGDB: {e}")