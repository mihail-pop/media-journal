import time
from datetime import datetime

import requests
from django.http import JsonResponse

from core.models import APIKey, MediaItem
from core.services.g_utils import download_image

IGDB_ACCESS_TOKEN = None
IGDB_TOKEN_EXPIRY = 0


def save_igdb_item(igdb_id):
    token = get_igdb_token()
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
      first_release_date, screenshots.url, artworks.url;
    where id = {igdb_id};
    """

    response = requests.post(
        "https://api.igdb.com/v4/games", headers=headers, data=query
    )
    if response.status_code != 200:
        raise Exception("Failed to fetch details from IGDB.")

    data = response.json()
    if not data:
        raise Exception("Game not found.")

    game = data[0]

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

    # Save to DB
    MediaItem.objects.create(
        title=title,
        media_type="game",
        source="igdb",
        source_id=str(igdb_id),
        cover_url=local_poster,
        banner_url=local_banner,
        overview=overview,
        release_date=release_date,
        cast=[],
        seasons=None,
        related_titles=[],
        screenshots=local_screenshots,
    )

    return JsonResponse({"success": True, "message": "Game added to list"})


def get_igdb_token():
    global IGDB_ACCESS_TOKEN, IGDB_TOKEN_EXPIRY

    if IGDB_ACCESS_TOKEN and IGDB_TOKEN_EXPIRY > time.time():
        return IGDB_ACCESS_TOKEN

    try:
        igdb_keys = APIKey.objects.get(name="igdb")
    except APIKey.DoesNotExist:
        return None

    url = "https://id.twitch.tv/oauth2/token"
    params = {
        "client_id": igdb_keys.key_1,
        "client_secret": igdb_keys.key_2,
        "grant_type": "client_credentials",
    }

    resp = requests.post(url, params=params)
    if resp.status_code != 200:
        return None

    token_data = resp.json()
    IGDB_ACCESS_TOKEN = token_data["access_token"]
    IGDB_TOKEN_EXPIRY = time.time() + token_data["expires_in"] - 60
    return IGDB_ACCESS_TOKEN


def get_game_extra_info(game_id):
    token = get_igdb_token()
    if not token:
        return {}

    try:
        igdb_keys = APIKey.objects.get(name="igdb")
    except APIKey.DoesNotExist:
        return {}

    headers = {
        "Client-ID": igdb_keys.key_1,
        "Authorization": f"Bearer {token}",
    }

    # Request fields we want for extra info
    body = f"""
        fields
            platforms.name,
            genres.name,
            involved_companies.company.name,
            involved_companies.developer,
            status,
            first_release_date,
            rating,
            websites.url,
            videos.video_id,
            videos.name,
            expansions.id,
            expansions.name,
            expansions.cover.url,
            dlcs.id,
            dlcs.name,
            dlcs.cover.url,
            similar_games.name,
            similar_games.cover.url;
        where id = {game_id};
    """

    try:
        response = requests.post(
            "https://api.igdb.com/v4/games", headers=headers, data=body
        )
        if response.status_code != 200:
            return {}

        data = response.json()
        if not data:
            return {}

        game = data[0]

        # Process videos: trailers first, then others, limit to 3
        trailers = []
        if game.get("videos"):
            trailer_videos = []
            other_videos = []
            for v in game["videos"]:
                if not v.get("video_id"):
                    continue
                name_lower = v.get("name", "").lower()
                if "trailer" in name_lower:
                    trailer_videos.append(v)
                else:
                    other_videos.append(v)

            combined = trailer_videos + other_videos
            trailers = [
                {
                    "name": v.get("name"),
                    "youtube_id": v.get("video_id"),
                    "url": f"https://www.youtube.com/watch?v={v['video_id']}",
                }
                for v in combined[:3]
            ]

        # Process expansions
        expansions = []
        if game.get("expansions"):
            for exp in game["expansions"]:
                if exp.get("cover") and exp["cover"].get("url"):
                    raw_url = exp["cover"]["url"].replace("t_thumb", "t_cover_big")
                    cover_url = raw_url if raw_url.startswith("https:") else "https:" + raw_url
                    expansions.append(
                        {
                            "id": exp.get("id"),
                            "name": exp.get("name"),
                            "cover": cover_url,
                        }
                    )

        # Process DLCs
        dlcs = []
        if game.get("dlcs"):
            for dlc in game["dlcs"]:
                if dlc.get("cover") and dlc["cover"].get("url"):
                    raw_url = dlc["cover"]["url"].replace("t_thumb", "t_cover_big")
                    cover_url = raw_url if raw_url.startswith("https:") else "https:" + raw_url
                    dlcs.append(
                        {
                            "id": dlc.get("id"),
                            "name": dlc.get("name"),
                            "cover": cover_url,
                        }
                    )

        # Process time to beat - separate query filtering by game_id
        time_to_beat = {}
        ttb_body = f"fields hastily, normally, completely; where game_id = {game_id};"
        try:
            ttb_response = requests.post(
                "https://api.igdb.com/v4/game_time_to_beats", headers=headers, data=ttb_body
            )
            if ttb_response.status_code == 200:
                ttb_data = ttb_response.json()
                if ttb_data:
                    ttb = ttb_data[0]
                    hastily = round(ttb["hastily"] / 3600) if ttb.get("hastily") else None
                    normally = round(ttb["normally"] / 3600) if ttb.get("normally") else None
                    completely = round(ttb["completely"] / 3600) if ttb.get("completely") else None
                    
                    if hastily and hastily < 1000:
                        time_to_beat["main_story"] = hastily
                    if normally and normally < 1000:
                        time_to_beat["main_extras"] = normally
                    if completely and completely < 1000:
                        time_to_beat["completionist"] = completely
        except Exception:
            pass

        # Process similar games from main query
        recommendations = []
        if game.get("similar_games"):
            for similar in game["similar_games"][:16]:
                cover_url = None
                if similar.get("cover") and similar["cover"].get("url"):
                    raw_url = similar["cover"]["url"].replace("t_thumb", "t_cover_big")
                    cover_url = raw_url if raw_url.startswith("https:") else "https:" + raw_url
                recommendations.append(
                    {
                        "id": similar.get("id"),
                        "title": similar.get("name"),
                        "poster_path": cover_url,
                    }
                )

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

        raw_status = game.get("status")

        # If IGDB gives us a specific status (like Early Access or Cancelled), use it.
        if raw_status is not None:
            mapped_status = STATUS_MAP.get(raw_status)
        else:
            # If status is blank, we check the release date against the current time
            release_date = game.get("first_release_date")
            current_time = int(time.time())
            
            if release_date is None or release_date > current_time:
                mapped_status = "In development"
            else:
                mapped_status = "Released"

        result = {
            "status": mapped_status,
            "platforms": [p.get("name") for p in game.get("platforms", [])]
            if game.get("platforms")
            else [],
            "genres": [g.get("name") for g in game.get("genres", [])]
            if game.get("genres")
            else [],
            "involved_companies": [
                c.get("company", {}).get("name")
                for c in game.get("involved_companies", [])
                if c.get("company") and c.get("developer")
            ]
            if game.get("involved_companies")
            else [],
            "rating": round(game["rating"] / 10, 1)
            if game.get("rating") is not None
            else None,
            "websites": [w.get("url") for w in game.get("websites", [])]
            if game.get("websites")
            else [],
            "trailers": trailers,
            "recommendations": recommendations,
            "expansions": expansions,
            "dlcs": dlcs,
            "time_to_beat": time_to_beat,
        }
        return result

    except Exception:
        return {}


def get_igdb_discover(
    page, query="", sort="popularity", genre="", platform="", year=""
):
    token = get_igdb_token()
    if not token:
        return []

    try:
        igdb_keys = APIKey.objects.get(name="igdb")
    except APIKey.DoesNotExist:
        return []

    headers = {
        "Client-ID": igdb_keys.key_1,
        "Authorization": f"Bearer {token}",
    }

    offset = (page - 1) * 20

    if query:
        data = f'search "{query}"; fields id, name, cover.url, summary, rating, genres.name, first_release_date; limit 20; offset {offset};'
    else:
        conditions = ["cover != null"]
        if genre:
            conditions.append(f"genres = [{genre}]")
        if platform:
            conditions.append(f"platforms = [{platform}]")
        if year:
            conditions.append(f"release_dates.y = {year}")

        where_clause = " & ".join(conditions)
        sort_clause = f"sort {sort} desc" if sort else "sort popularity desc"

        data = f"fields id, name, cover.url, summary, rating, genres.name, first_release_date; where {where_clause}; {sort_clause}; limit 20; offset {offset};"

    try:
        response = requests.post(
            "https://api.igdb.com/v4/games", headers=headers, data=data
        )
        if response.status_code != 200:
            return []

        results_raw = response.json()
        results = []

        for item in results_raw:
            cover_url = None
            if "cover" in item and item["cover"] and "url" in item["cover"]:
                cover_url = "https:" + item["cover"]["url"].replace(
                    "t_thumb", "t_cover_big"
                )

            # Convert score to 1-10 scale
            score = item.get("rating")
            if score:
                score = round(score / 10, 1)

            # Format release date
            release_date = ""
            if item.get("first_release_date"):

                release_date = datetime.fromtimestamp(
                    item["first_release_date"]
                ).strftime("%Y-%m-%d")

            results.append(
                {
                    "id": str(item["id"]),
                    "title": item.get("name", "Untitled"),
                    "poster_path": cover_url,
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
    except Exception:
        return []
