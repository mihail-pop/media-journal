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

    # 1. Only do network requests in the fast threads
    def fetch_movie(item):
        try:
            resp = requests.get(f"https://api.themoviedb.org/3/movie/{item.source_id}", params={"api_key": api_key}, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                release_date_str = data.get("release_date")
                if release_date_str:
                    release_dt = datetime.datetime.strptime(release_date_str, "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc)
                    return (item, release_dt)
        except Exception as e:
            print(f"Error fetching TMDB movie {item.title}: {e}")
        return (item, None)

    # Launch threads to grab all the data super fast
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        results = list(executor.map(fetch_movie, items))

    # 2. Save to database sequentially on the main thread to prevent SQLite locking
    current_utc = datetime.datetime.now(datetime.timezone.utc)
    three_months_ago = current_utc - datetime.timedelta(days=90)

    for item, release_dt in results:
        if release_dt and release_dt >= three_months_ago:
            db_date = _normalize_dt(release_dt)
            CalendarEvent.objects.update_or_create(
                item=item, 
                title="Global Release", 
                is_custom=False,
                defaults={'date': db_date}
            )
        _mark_as_synced(item)

def _sync_tmdb_tv(items):
    if not items: 
        return
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return

    # 1. Only do network requests in the fast threads
    def fetch_tv(item):
        try:
            is_season = "_s" in str(item.source_id)
            base_id = str(item.source_id).split("_s")[0] if is_season else item.source_id
                
            resp = requests.get(f"https://api.themoviedb.org/3/tv/{base_id}", params={"api_key": api_key}, timeout=5)
            if resp.status_code != 200:
                return (item, None)
                
            data = resp.json()
            seasons_to_fetch = set()
            
            # Find out which seasons are currently active
            if data.get("last_episode_to_air"):
                seasons_to_fetch.add(data["last_episode_to_air"]["season_number"])
            if data.get("next_episode_to_air"):
                seasons_to_fetch.add(data["next_episode_to_air"]["season_number"])
            
            # Fetch full episode lists for those seasons and group by date
            episodes_by_date_season = {}
            for s_num in seasons_to_fetch:
                s_resp = requests.get(f"https://api.themoviedb.org/3/tv/{base_id}/season/{s_num}", params={"api_key": api_key}, timeout=5)
                if s_resp.status_code == 200:
                    s_data = s_resp.json()
                    for ep in s_data.get("episodes", []):
                        ad = ep.get("air_date")
                        if ad:
                            key = (ad, s_num)
                            if key not in episodes_by_date_season:
                                episodes_by_date_season[key] = []
                            episodes_by_date_season[key].append(ep)
                            
            return (item, episodes_by_date_season)
        except Exception as e:
            print(f"Error fetching TMDB TV {item.title}: {e}")
        return (item, None)

    # Launch threads
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        results = list(executor.map(fetch_tv, items))

    # 2. Save to database sequentially on the main thread
    current_utc = datetime.datetime.now(datetime.timezone.utc)
    three_months_ago = current_utc - datetime.timedelta(days=90)

    for item, episodes_by_date_season in results:
        if episodes_by_date_season:
            # Smart Notifications: Inherit notify state from the most recent episode
            latest_event = CalendarEvent.objects.filter(item=item, is_custom=False).exclude(title="__API_SYNC__").order_by('-date').first()
            auto_notify = latest_event.notify if latest_event else False

            for (air_date_str, s_num), eps in episodes_by_date_season.items():
                air_dt = datetime.datetime.strptime(air_date_str, "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc)
                
                if air_dt >= three_months_ago:
                    db_date = _normalize_dt(air_dt)
                    
                    # Sort the episodes for this specific date by episode number
                    eps = sorted(eps, key=lambda x: x.get("episode_number", 0))
                    
                    # Create a consolidated title (e.g. "Episode 4" OR "Episodes 4-6")
                    if len(eps) == 1:
                        title_str = f"Episode {eps[0].get('episode_number')} (S{s_num})"
                    else:
                        first_ep = eps[0]
                        last_ep = eps[-1]
                        title_str = f"Episodes {first_ep.get('episode_number')}-{last_ep.get('episode_number')} (S{s_num})"
                        
                    # Find any existing events for this exact item and date
                    existing_events = list(CalendarEvent.objects.filter(
                        item=item, date=db_date, is_custom=False
                    ).exclude(title="__API_SYNC__"))
                    
                    if existing_events:
                        # Update the title of the primary event if it changed
                        ev = existing_events[0]
                        if ev.title != title_str:
                            ev.title = title_str
                            ev.save(update_fields=['title'])
                        
                        # If the old logic created duplicates on this exact date, delete them
                        if len(existing_events) > 1:
                            for dup in existing_events[1:]:
                                dup.delete()
                    else:
                        CalendarEvent.objects.create(
                            item=item,
                            date=db_date,
                            title=title_str,
                            is_custom=False,
                            notify=auto_notify
                        )
        _mark_as_synced(item)

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
                
                # Smart Notifications
                latest_event = CalendarEvent.objects.filter(item=item, is_custom=False).exclude(title="__API_SYNC__").order_by('-date').first()
                auto_notify = latest_event.notify if latest_event else False
                
                next_ep = m.get("nextAiringEpisode")
                if next_ep:
                    air_dt = datetime.datetime.fromtimestamp(next_ep["airingAt"], tz=datetime.timezone.utc)
                    db_date = _normalize_dt(air_dt)
                    
                    ev, created = CalendarEvent.objects.get_or_create(
                        item=item, 
                        title=f"Episode {next_ep['episode']}", 
                        is_custom=False,
                        defaults={'date': db_date, 'notify': auto_notify}
                    )
                    if not created and ev.date != db_date:
                        ev.date = db_date
                        ev.save(update_fields=['date'])
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