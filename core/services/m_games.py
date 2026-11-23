from django.db import transaction
from core.services.g_api_errors import ApiError, ApiClient, require_api_data
import time
import json
from datetime import datetime

import requests
from django.http import JsonResponse

from core.models import APIKey, MediaItem
from core.services.g_utils import apply_initial_item_status, download_image
from core.services.g_relations import pack_relations

IGDB_ACCESS_TOKEN = None
IGDB_TOKEN_EXPIRY = 0


def save_igdb_item(igdb_id, *, http=None, prepare_only=False, initial_status='planned'):
    token = get_igdb_token(http=http)
    if not token:
        raise Exception("Failed to get IGDB access token.")

    try:
        igdb_keys = APIKey.objects.get(name="igdb")
    except APIKey.DoesNotExist:
        raise Exception("IGDB API keys not found.")

    headers = {
        "Client-ID": igdb_keys.key_1,
        "Authorization": f"Bearer {token}",
    }

    query = f"""
    fields 
      id, name, summary, storyline, 
      cover.url, genres.name, platforms.name, 
      involved_companies.company.name, involved_companies.developer,
      first_release_date, screenshots.url, artworks.url, expansions.id, dlcs.id;
    where id = {igdb_id};
    """

    response = (ApiClient('igdb', http)).post(
        "https://api.igdb.com/v4/games", headers=headers, data=query
    )
    if response.status_code != 200:
        raise Exception("Failed to fetch details from IGDB.")

    data = response.json()
    require_api_data(isinstance(data, list), 'igdb')
    if not data:
        raise ApiError('igdb', 'not_found')

    game = data[0]
    require_api_data(isinstance(game, dict) and game.get('id') and game.get('name'), 'igdb')

    title = game.get("name") or "Unknown Title"
    overview = game.get("summary") or game.get("storyline") or ""

    # Poster
    cache_bust = int(time.time() * 1000)
    poster_url = None
    if "cover" in game and game["cover"]:
        poster_url = "https:" + game["cover"]["url"].replace(
            "t_thumb", "t_cover_big_2x"
        )
    local_poster = (
        download_image(poster_url, f"posters/igdb_{igdb_id}_{cache_bust}.jpg")
        if poster_url
        else ""
    )

    # Strip media/ prefix
    if local_poster.startswith("media/"):
        local_poster = local_poster[len("media/") :]

    # Get artworks and screenshots
    artworks = game.get("artworks", [])
    screenshots = game.get("screenshots", [])

    banner_url = None

    # 1. Try artwork banner first
    if artworks:
        first_art = artworks[0]
        if first_art and "url" in first_art:
            banner_url = "https:" + first_art["url"].replace("t_thumb", "t_4k")

    # 2. Fallback: banner from first screenshot
    used_screenshot_for_banner = False
    if not banner_url and screenshots:
        banner_raw = screenshots[0].get("url")
        if banner_raw:
            banner_url = "https:" + banner_raw.replace("t_thumb", "t_1080p")
            used_screenshot_for_banner = True

    # Save banner
    local_banner = (
        download_image(banner_url, f"banners/igdb_{igdb_id}_{cache_bust}.jpg")
        if banner_url
        else ""
    )
    if local_banner.startswith("media/"):
        local_banner = local_banner[len("media/") :]

    # 3. Save screenshots
    local_screenshots = []

    # If screenshot was used as banner → skip the first screenshot
    start_index = 1 if used_screenshot_for_banner else 0

    for i, ss in enumerate(screenshots[start_index:], start=start_index):
        if ss and "url" in ss:
            url = "https:" + ss["url"].replace("t_thumb", "t_1080p")
            local_path = download_image(
                url, f"screenshots/igdb_{igdb_id}_{i}_{cache_bust}.jpg"
            )
            if local_path.startswith("media/"):
                local_path = local_path[len("media/") :]
            if local_path:
                local_screenshots.append(
                    {
                        "url": local_path,
                        "is_full_url": False,
                    }
                )

    # Release date
    release_date = None
    if game.get("first_release_date"):
        release_date = time.strftime(
            "%Y-%m-%d", time.localtime(game["first_release_date"])
        )

    genres =[g.get("name") for g in game.get("genres", []) if g.get("name")]
    creators =[
        c.get("company", {}).get("name")
        for c in game.get("involved_companies", [])
        if c.get("developer") and c.get("company", {}).get("name")
    ]

    # Save to DB
    item_data = dict(
        title=title,
        media_type="game",
        source="igdb",
        provider_ids={"igdb": str(igdb_id)},
        cover_url=local_poster,
        banner_url=local_banner,
        overview=overview,
        release_date=release_date,
        cast=[],
        seasons=None,
        related_titles=pack_relations([], bool(game.get('expansions') or game.get('dlcs'))),
        genres=genres,
        creators=creators,
    )
    if prepare_only:
        return {"item": item_data, "screenshots": local_screenshots}
    apply_initial_item_status(item_data, initial_status)
    with transaction.atomic():
        item = MediaItem.objects.create(**item_data)

        from core.models import Screenshot
        Screenshot.objects.bulk_create([
            Screenshot(
                item=item,
                url=s["url"],
                is_full_url=s.get("is_full_url", False),
                position=i+1
            )
            for i, s in enumerate(local_screenshots)
        ])

    return JsonResponse({"success": True, "message": "Game added to list"})


def get_igdb_token(*, http=None):
    global IGDB_ACCESS_TOKEN, IGDB_TOKEN_EXPIRY

    if IGDB_ACCESS_TOKEN and IGDB_TOKEN_EXPIRY > time.time():
        return IGDB_ACCESS_TOKEN

    try:
        igdb_keys = APIKey.objects.get(name="igdb")
    except APIKey.DoesNotExist:
        raise ApiError('igdb', 'missing_key')
    if not igdb_keys.key_1 or not igdb_keys.key_2:
        raise ApiError('igdb', 'missing_key')

    url = "https://id.twitch.tv/oauth2/token"
    params = {
        "client_id": igdb_keys.key_1,
        "client_secret": igdb_keys.key_2,
        "grant_type": "client_credentials",
    }

    resp = (ApiClient('igdb', http)).post(url, params=params)
    if resp.status_code != 200:
        return None

    token_data = resp.json()
    IGDB_ACCESS_TOKEN = token_data["access_token"]
    IGDB_TOKEN_EXPIRY = time.time() + token_data["expires_in"] - 60
    return IGDB_ACCESS_TOKEN


def get_igdb_discover(
    page, query="", sort="rating", genre="", platform="", year="", free_to_play=False, allow_adult=True
):
    token = get_igdb_token()
    if not token:
        raise ApiError('igdb', 'invalid_key')

    try:
        igdb_keys = APIKey.objects.get(name="igdb")
    except APIKey.DoesNotExist:
        raise ApiError('igdb', 'missing_key')

    headers = {
        "Client-ID": igdb_keys.key_1,
        "Authorization": f"Bearer {token}",
    }

    offset = (page - 1) * 20

    fields_to_request = "id, name, cover.url, summary, rating, genres.name, first_release_date, artworks.url, screenshots.url, hypes"

    adult_conditions = [] if allow_adult else ['(themes = null | themes != (42))']
    if query:
        conditions = list(adult_conditions)
        if free_to_play:
            conditions.append('keywords.slug = "free-to-play"')
        where_clause = f"where {' & '.join(conditions)};" if conditions else ""
        data = f'search {json.dumps(query)}; fields {fields_to_request}; {where_clause} limit 20; offset {offset};'
    else:
        if sort == 'hypes':
            current_time = int(time.time())
            conditions = [
                "cover != null",
                "(artworks != null | screenshots != null)",
                f"first_release_date > {current_time}",
                "hypes > 0"
            ]
            sort_clause = "sort hypes desc"
        else:
            conditions =[
                "cover != null",
                "(artworks != null | screenshots != null)",
                "rating_count > 50"
            ]
            
            if year:
                try:
                    year_int = int(year)
                    start_time = int(datetime(year_int, 1, 1).timestamp())
                    end_time = int(datetime(year_int, 12, 31, 23, 59, 59).timestamp())
                    conditions.append(f"first_release_date >= {start_time}")
                    conditions.append(f"first_release_date <= {end_time}")
                except ValueError:
                    pass
                    
            sort_clause = f"sort {sort} desc" if sort else "sort total_rating desc"

        conditions.extend(adult_conditions)
        if genre:
            conditions.append(f"genres = ({genre})")
        if platform:
            conditions.append(f"platforms = ({platform})")
        if free_to_play:
            conditions.append('keywords.slug = "free-to-play"')

        where_clause = " & ".join(conditions)
        
        data = f"fields {fields_to_request}; where {where_clause}; {sort_clause}; limit 20; offset {offset};"

    try:
        response = ApiClient('igdb').post(
            "https://api.igdb.com/v4/games", headers=headers, data=data.encode('utf-8')
        )
        if response.status_code == 429:
            raise Exception("HTTP 429 Too Many Requests: Rate Limit Exceeded")
        elif response.status_code != 200:
            print(f"IGDB API Error: {response.status_code} - {response.text}")
            return list()

        results_raw = response.json()
        require_api_data(isinstance(results_raw, list), 'igdb')
        results = []

        for item in results_raw:
            cover_url = None
            if "cover" in item and item["cover"] and "url" in item["cover"]:
                cover_url = "https:" + item["cover"]["url"].replace(
                    "t_thumb", "t_cover_big"
                )

            banner_url = None
            if "artworks" in item and item["artworks"]:
                raw_url = item["artworks"][0].get("url")
                if raw_url:
                    banner_url = "https:" + raw_url.replace("t_thumb", "t_screenshot_med")
            
            if not banner_url and "screenshots" in item and item["screenshots"]:
                raw_url = item["screenshots"][0].get("url")
                if raw_url:
                    banner_url = "https:" + raw_url.replace("t_thumb", "t_screenshot_med")

            score = item.get("rating")
            if score:
                score = round(score / 10, 1)

            release_date = ""
            if item.get("first_release_date"):
                release_date = datetime.fromtimestamp(
                    item["first_release_date"]
                ).strftime("%Y-%m-%d")

            results.append(
                {
                    "source": "igdb",
                    "id": str(item["id"]),
                    "title": item.get("name", "Untitled"),
                    "poster_path": cover_url,
                    "backdrop_path": banner_url,
                    "media_type": "game",
                    "overview": item.get("summary", ""),
                    "score": score,
                    "release_date": release_date,
                    "genres": [
                        g.get("name") for g in item.get("genres", []) if g.get("name")
                    ],
                }
            )

        return results
    except ApiError:
        raise
    except Exception as e:
        raise ApiError('igdb') from e
