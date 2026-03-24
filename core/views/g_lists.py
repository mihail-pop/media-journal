from django.http import JsonResponse
from core.models import APIKey, MediaItem
import time
import requests
import logging

logger = logging.getLogger(__name__)

# Functions for checking planned status for.......

def check_planned_movie_statuses(request):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "TMDB API key not found."}, status=500)

    planned_movies = MediaItem.objects.filter(media_type="movie", status="planned")
    status_map = {}  # {tmdb_id (str): status}
    request_count = 0

    for item in planned_movies:
        tmdb_id = item.source_id
        if not tmdb_id:
            continue

        url = f"https://api.themoviedb.org/3/movie/{tmdb_id}"
        params = {"api_key": api_key}

        try:
            response = requests.get(url, params=params)
            request_count += 1

            if request_count >= 300:
                time.sleep(60)
                request_count = 0
            else:
                time.sleep(0.025)

            if response.status_code == 200:
                data = response.json()
                status_map[str(tmdb_id)] = data.get("status", "Unknown")
            else:
                status_map[str(tmdb_id)] = "Error"
        except Exception:
            status_map[str(tmdb_id)] = "Error"

    return JsonResponse(status_map)


def check_planned_tvseries_statuses(request):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "TMDB API key not found."}, status=500)

    planned_series = MediaItem.objects.filter(media_type="tv", status="planned")
    status_map = {}  # {tmdb_id: status}
    request_count = 0

    for item in planned_series:
        tmdb_id = item.source_id
        if not tmdb_id:
            continue

        url = f"https://api.themoviedb.org/3/tv/{tmdb_id}"
        params = {"api_key": api_key}

        try:
            response = requests.get(url, params=params)
            request_count += 1

            if request_count >= 300:
                time.sleep(60)
                request_count = 0
            else:
                time.sleep(0.025)

            if response.status_code == 200:
                data = response.json()

                status = data.get("status", "Unknown")
                next_episode = data.get("next_episode_to_air")
                # Logic per your description:
                if status == "Ended":
                    status_map[tmdb_id] = "Ended"
                elif status == "In Production":
                    status_map[tmdb_id] = "In Production"
                elif status == "Returning Series":
                    if next_episode:
                        status_map[tmdb_id] = "Returning with upcoming episode"
                    else:
                        # Assume finished airing or hasn't started airing yet
                        status_map[tmdb_id] = "Ended"
                else:
                    status_map[tmdb_id] = status
            else:
                status_map[tmdb_id] = "Error"
        except Exception:
            status_map[tmdb_id] = "Error"

    return JsonResponse(status_map)


def check_planned_anime_manga_statuses(request):
    import requests
    import time
    from django.http import JsonResponse, HttpResponseBadRequest

    ANILIST_API_URL = "https://graphql.anilist.co"

    media_type = request.GET.get("media_type")
    if media_type not in ("anime", "manga"):
        return HttpResponseBadRequest(
            "Invalid or missing media_type parameter. Must be 'anime' or 'manga'."
        )

    planned_items = MediaItem.objects.filter(media_type=media_type, status="planned")
    headers = {"Content-Type": "application/json"}
    status_map = {}

    def chunks(lst, size):
        for i in range(0, len(lst), size):
            yield lst[i : i + size]

    # Prepare list of (frontend_id, query_param)
    item_list =[]
    for item in planned_items:
        frontend_id = item.source_id
        if not frontend_id:
            continue
            
        a_id = item.provider_ids.get("anilist")
        m_id = item.provider_ids.get("mal")
        
        # Determine which ID to query AniList with
        if a_id and str(a_id).isdigit():
            query_param = f"id: {a_id}"
        elif m_id and str(m_id).isdigit():
            query_param = f"idMal: {m_id}"
        else:
            continue
            
        item_list.append((frontend_id, query_param))

    request_count = 0

    for batch in chunks(item_list, 25):
        request_count += 1
        if request_count >= 12:
            time.sleep(60)
            request_count = 0
        else:
            time.sleep(0.1)

        aliases =[]
        for i, (frontend_id, query_param) in enumerate(batch):
            aliases.append(
                f"i{i}: Media({query_param}, type: {media_type.upper()}) {{ status }}"
            )

        query = f"query {{\n  {'\n  '.join(aliases)}\n}}"

        try:
            response = requests.post(
                ANILIST_API_URL, json={"query": query}, headers=headers, timeout=10
            )

            if response.status_code != 200:
                for frontend_id, _ in batch:
                    status_map[frontend_id] = "Error"
                continue

            data = response.json().get("data", {})
            for i, (frontend_id, _) in enumerate(batch):
                entry = data.get(f"i{i}")
                if not entry:
                    status_map[frontend_id] = "Unknown"
                    continue

                raw_status = entry.get("status")
                if raw_status == "FINISHED":
                    status_map[frontend_id] = "Finished"
                elif raw_status == "RELEASING":
                    status_map[frontend_id] = "Releasing"
                elif raw_status == "NOT_YET_RELEASED":
                    status_map[frontend_id] = "Not yet released"
                else:
                    status_map[frontend_id] = raw_status or "Unknown"

        except Exception:
            for frontend_id, _ in batch:
                status_map[frontend_id] = "Error"

    return JsonResponse(status_map)

def check_planned_game_statuses(request):
    import time
    from django.http import JsonResponse
    from core.models import APIKey, MediaItem
    import requests

    try:
        igdb_keys = APIKey.objects.get(name="igdb")
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "IGDB API keys not found."}, status=500)

    # Generate token (inline to avoid circular imports, or import get_igdb_token from your services)
    url = "https://id.twitch.tv/oauth2/token"
    params = {
        "client_id": igdb_keys.key_1,
        "client_secret": igdb_keys.key_2,
        "grant_type": "client_credentials",
    }
    resp = requests.post(url, params=params)
    if resp.status_code != 200:
        return JsonResponse({"error": "Failed to get IGDB token"}, status=500)
    
    token = resp.json()["access_token"]
    headers = {
        "Client-ID": igdb_keys.key_1,
        "Authorization": f"Bearer {token}",
    }

    planned_games = MediaItem.objects.filter(media_type="game", status="planned")
    status_map = {}
    
    # Extract IDs
    game_ids =[item.source_id for item in planned_games if item.source_id]
    if not game_ids:
        return JsonResponse({})

    # Helper to chunk list to avoid hitting URI/Body limits
    def chunks(lst, size):
        for i in range(0, len(lst), size):
            yield lst[i : i + size]

    STATUS_MAP = {
        0: "Released",
        2: "Alpha",
        3: "Beta",
        4: "Early Access",
        5: "Offline",
        6: "Cancelled",
        7: "Rumored",
        8: "Delisted"
    }
    
    current_time = int(time.time())

    # IGDB allows querying up to 500 items at a time via body
    for batch in chunks(game_ids, 100):
        id_list_str = ",".join(str(gid) for gid in batch)
        body = f"fields id, status, first_release_date; where id = ({id_list_str}); limit 500;"
        
        try:
            response = requests.post("https://api.igdb.com/v4/games", headers=headers, data=body)
            if response.status_code == 200:
                data = response.json()
                for game in data:
                    gid = str(game["id"])
                    raw_status = game.get("status")
                    
                    if raw_status is not None:
                        mapped_status = STATUS_MAP.get(raw_status, "Unknown")
                    else:
                        release_date = game.get("first_release_date")
                        if release_date is None or release_date > current_time:
                            mapped_status = "In development"
                        else:
                            mapped_status = "Released"
                            
                    status_map[gid] = mapped_status
            else:
                for gid in batch:
                    status_map[str(gid)] = "Error"
        except Exception:
            for gid in batch:
                status_map[str(gid)] = "Error"
                
        time.sleep(0.26) # IGDB rate limit safety (4 requests per second)

    return JsonResponse(status_map)