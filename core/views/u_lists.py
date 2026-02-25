from django.http import JsonResponse
from core.models import APIKey, MediaItem
import time
import requests
import logging

logger = logging.getLogger(__name__)



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

    # Prepare list of (mal_id, item)
    item_list = [
        (item.source_id, item)
        for item in planned_items
        if item.source_id and item.source_id.isdigit()
    ]

    request_count = 0

    for batch in chunks(item_list, 25):
        request_count += 1
        if request_count >= 12:
            time.sleep(60)
            request_count = 0
        else:
            time.sleep(0.1)

        aliases = []
        for i, (mal_id, _) in enumerate(batch):
            aliases.append(
                f"i{i}: Media(idMal: {mal_id}, type: {media_type.upper()}) {{ status }}"
            )

        query = f"query {{\n  {'\n  '.join(aliases)}\n}}"

        try:
            response = requests.post(
                ANILIST_API_URL, json={"query": query}, headers=headers, timeout=10
            )

            if response.status_code != 200:
                for mal_id, _ in batch:
                    status_map[mal_id] = "Error"
                continue

            data = response.json().get("data", {})
            for i, (mal_id, _) in enumerate(batch):
                entry = data.get(f"i{i}")
                if not entry:
                    status_map[mal_id] = "Unknown"
                    continue

                raw_status = entry.get("status")
                if raw_status == "FINISHED":
                    status_map[mal_id] = "Finished"
                elif raw_status == "RELEASING":
                    status_map[mal_id] = "Releasing"
                elif raw_status == "NOT_YET_RELEASED":
                    status_map[mal_id] = "Not yet released"
                else:
                    status_map[mal_id] = raw_status or "Unknown"

        except Exception:
            for mal_id, _ in batch:
                status_map[mal_id] = "Error"

    return JsonResponse(status_map)
