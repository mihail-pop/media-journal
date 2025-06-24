from django.views.decorators.http import require_GET, require_POST
from django.shortcuts import render
from django.conf import settings
from django.http import JsonResponse
from .models import APIKey, MediaItem
from .utils import download_image
import time
import json
import requests
import logging
logger = logging.getLogger(__name__)

IGDB_ACCESS_TOKEN = None
IGDB_TOKEN_EXPIRY = 0

def movies(request):
    movies = MediaItem.objects.filter(media_type="movie").order_by("-date_added")
    return render(request, 'core/movies.html', {'items': movies, 'page_type': 'movie'})

def tvshows(request):
    tvshows = MediaItem.objects.filter(media_type="tv").order_by("-date_added")
    return render(request, 'core/tvshows.html', {'items': tvshows, 'page_type': 'tv'})

def anime(request):
    anime = MediaItem.objects.filter(media_type="anime").order_by("-date_added")
    return render(request, 'core/anime.html', {'items': anime, 'page_type': 'anime'})

def games(request):
    games = MediaItem.objects.filter(media_type="game").order_by("-date_added")
    return render(request, 'core/games.html', {'items': games, 'page_type': 'game'})

def books(request):
    books = MediaItem.objects.filter(media_type="book").order_by("-date_added")
    return render(request, 'core/books.html', {'items': books, 'page_type': 'book'})

def manga(request):
    manga = MediaItem.objects.filter(media_type="manga").order_by("-date_added")
    return render(request, 'core/manga.html', {'items': manga, 'page_type': 'manga'})

def settings(request):
    keys = APIKey.objects.all().order_by("name")
    existing_names = [key.name for key in keys]
    allowed_names = APIKey.NAME_CHOICES  # [('tmdb', 'TMDb'), ('igdb', 'IGDB'), ...]

    return render(request, 'core/settings.html', {
        'keys': keys,
        'allowed_names': allowed_names,
        'existing_names': existing_names,
    })

def home(request):
    # no search bar here
    return render(request, 'core/home.html', {})



# Anime


@require_GET
def mal_search(request):
    query = request.GET.get("q", "").strip()
    search_type = request.GET.get("type", "anime").lower()  # default to anime

    if not query:
        return JsonResponse({"error": "Query parameter 'q' is required."}, status=400)

    if search_type not in ("anime", "manga"):
        return JsonResponse({"error": "Invalid search type. Use 'anime' or 'manga'."}, status=400)

    try:
        mal_keys = APIKey.objects.get(name="mal")
        client_id = mal_keys.key_1
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "MAL API keys not found."}, status=500)

    headers = {
        "X-MAL-CLIENT-ID": client_id
    }

    url = f"https://api.myanimelist.net/v2/{search_type}"
    params = {
        "q": query,
        "limit": 9,
        "fields": "id,title,main_picture,alternative_titles"
    }

    response = requests.get(url, headers=headers, params=params)

    if response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch from MAL."}, status=500)

    data = response.json()
    results = []
    for item in data.get("data", []):
        node = item["node"]
        english_title = node.get("alternative_titles", {}).get("en")
        results.append({
            "id": str(node["id"]),
            "title": english_title or node["title"],
            "poster_path": node["main_picture"]["medium"] if node.get("main_picture") else None,
        })

    return JsonResponse({"results": results})




#igdb / games

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

@require_GET
def igdb_search(request):
    query = request.GET.get("q", "").strip()
    if not query:
        return JsonResponse({"error": "Query parameter 'q' is required."}, status=400)

    token = get_igdb_token()
    if not token:
        return JsonResponse({"error": "Failed to get IGDB access token."}, status=500)

    try:
        igdb_keys = APIKey.objects.get(name="igdb")
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "IGDB API keys not found."}, status=500)

    headers = {
        "Client-ID": igdb_keys.key_1,
        "Authorization": f"Bearer {token}",
    }

    # IGDB uses a POST request with a query language (IGDB API docs)
    data = f'search "{query}"; fields id,name,cover.url; limit 10;'

    response = requests.post("https://api.igdb.com/v4/games", headers=headers, data=data)
    if response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch from IGDB."}, status=500)

    results_raw = response.json()
    results = []
    for item in results_raw:
        cover_url = None
        if "cover" in item and item["cover"] and "url" in item["cover"]:
            # IGDB returns URLs like "//images.igdb.com/igdb/image/upload/t_thumb/co1abc.jpg"
            # prepend https:
            cover_url = "https:" + item["cover"]["url"].replace("t_thumb", "t_cover_big")

        results.append({
            "id": str(item["id"]),
            "title": item.get("name", "Untitled"),
            "poster_path": cover_url,
        })

    return JsonResponse({"results": results[:9]})

# Movies/Shows Search

@require_GET
def tmdb_search(request):
    query = request.GET.get("q", "").strip()
    media_type = request.GET.get("type", "").lower()  # Expect 'movie' or 'tv'

    if not query:
        return JsonResponse({"error": "Query parameter 'q' is required."}, status=400)

    if media_type not in ("movie", "tv"):
        return JsonResponse({"error": "Query parameter 'type' must be 'movie' or 'tv'."}, status=400)

    from .models import APIKey
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "TMDB API key not found."}, status=500)

    # TMDB endpoint to search movies or TV shows specifically
    if media_type == "movie":
        url = "https://api.themoviedb.org/3/search/movie"
    else:
        url = "https://api.themoviedb.org/3/search/tv"

    params = {"api_key": api_key, "query": query}
    response = requests.get(url, params=params)

    if response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch from TMDB."}, status=500)

    data = response.json()

    # Format results
    results = [
        {
            "id": item["id"],
            "title": item.get("title") or item.get("name"),
            "media_type": media_type,
            "poster_path": item.get("poster_path"),
            "overview": item.get("overview", ""),
            "release_date": item.get("release_date") or item.get("first_air_date", ""),
        }
        for item in data.get("results", [])
    ]

    return JsonResponse({"results": results[:9]})

# Movie and show details
@require_GET
def tmdb_detail(request, media_type, tmdb_id):
    if media_type not in ("movie", "tv"):
        return JsonResponse({"error": "Invalid media type."}, status=400)

    item = None
    try:
        item = MediaItem.objects.get(source="tmdb", source_id=tmdb_id)

        # Handle cast (add is_full_url for image path rendering)
        cast_data = []
        for member in item.cast or []:
            profile = member.get("profile_path")
            is_full_url = False
            if profile:
                if profile.startswith("http") or profile.startswith("/media/"):
                    is_full_url = True

            cast_data.append({
                "name": member.get("name"),
                "character": member.get("character"),
                "profile_path": profile,
                "is_full_url": is_full_url,
            })

        seasons = item.seasons if media_type == "tv" else None
        if seasons:
            for season in seasons:
                poster = season.get("poster_path")
                if poster:
                    if poster.startswith("http") or poster.startswith("/media/"):
                        season["poster_path_full"] = poster
                    elif poster.startswith("media/"):
                        season["poster_path_full"] = f"/{poster}"
                    else:
                        # fallback: assume it's a TMDB path
                        season["poster_path_full"] = f"https://image.tmdb.org/t/p/w185{poster}"
                else:
                    season["poster_path_full"] = ""


        return render(request, "core/detail.html", {
            "item": item,
            "item_id": item.id,
            "source": "tmdb",
            "source_id": tmdb_id,
            "in_my_list": True,
            "media_type": item.media_type,
            "title": item.title,
            "overview": item.overview,
            "banner_url": item.banner_url,
            "poster_url": item.cover_url,
            "release_date": item.release_date,
            "genres": [],  # Optional
            "cast": cast_data,
            "recommendations": [],  # Optional
            "seasons": seasons,
        })

    except MediaItem.DoesNotExist:
        pass  # Fall through to live fetch

    # Fallback to TMDB API
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "TMDB API key not found."}, status=500)

    url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}"
    params = {"api_key": api_key, "append_to_response": "credits,recommendations"}
    response = requests.get(url, params=params)

    if response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch details from TMDB."}, status=500)

    data = response.json()

    # Poster and Banner (direct URLs from TMDB)
    poster_path = data.get("poster_path")
    banner_path = data.get("backdrop_path")
    poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None
    banner_url = f"https://image.tmdb.org/t/p/original{banner_path}" if banner_path else None

    # Cast (use TMDB URLs)
    cast_data = []
    for i, actor in enumerate(data.get("credits", {}).get("cast", [])[:10]):
        profile_url = f"https://image.tmdb.org/t/p/w185{actor.get('profile_path')}" if actor.get("profile_path") else ""
        cast_data.append({
            "name": actor.get("name"),
            "character": actor.get("character"),
            "profile_path": profile_url,
            "is_full_url": True,  # Because it's a complete URL
        })

    # Seasons
    seasons = data.get("seasons", []) if media_type == "tv" else None
    if seasons:
        for season in seasons:
            poster_path = season.get("poster_path")
            season["poster_path_full"] = f"https://image.tmdb.org/t/p/w185{poster_path}" if poster_path else ""

    return render(request, "core/detail.html", {
        "item": None,
        "item_id": None,
        "source": "tmdb",
        "source_id": tmdb_id,
        "in_my_list": False,
        "media_type": media_type,
        "title": data.get("title") or data.get("name"),
        "overview": data.get("overview", ""),
        "banner_url": banner_url,
        "poster_url": poster_url,
        "release_date": data.get("release_date") or data.get("first_air_date") or "",
        "genres": data.get("genres", []),
        "cast": cast_data,
        "recommendations": data.get("recommendations", {}).get("results", [])[:5],
        "seasons": seasons,
    })

def save_tmdb_item(media_type, tmdb_id):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
        url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}"
        params = {"api_key": api_key, "append_to_response": "credits"}
        response = requests.get(url, params=params)

        if response.status_code != 200:
            return JsonResponse({"error": "Failed to fetch TMDB details."})

        data = response.json()

        # Poster and banner
        poster_url = f"https://image.tmdb.org/t/p/w500{data.get('poster_path')}" if data.get("poster_path") else ""
        banner_url = f"https://image.tmdb.org/t/p/original{data.get('backdrop_path')}" if data.get("backdrop_path") else ""
        local_poster = download_image(poster_url, f"posters/tmdb_{tmdb_id}.jpg") if poster_url else ""
        local_banner = download_image(banner_url, f"banners/tmdb_{tmdb_id}.jpg") if banner_url else ""

        # Cast
        cast_data = []
        for i, actor in enumerate(data.get("credits", {}).get("cast", [])[:10]):
            profile_url = f"https://image.tmdb.org/t/p/w185{actor.get('profile_path')}" if actor.get("profile_path") else ""
            local_profile = download_image(profile_url, f"cast/tmdb_{tmdb_id}_{i}.jpg") if profile_url else ""
            cast_data.append({
                "name": actor.get("name"),
                "character": actor.get("character"),
                "profile_path": local_profile,
            })

        # Seasons (only for TV shows)
        seasons = []
        if media_type == "tv":
            for i, season in enumerate(data.get("seasons", [])):
                season_poster_url = f"https://image.tmdb.org/t/p/w300{season.get('poster_path')}" if season.get("poster_path") else ""
                local_season_poster = download_image(season_poster_url, f"seasons/tmdb_{tmdb_id}_s{i}.jpg") if season_poster_url else ""

                seasons.append({
                    "season_number": season.get("season_number"),
                    "name": season.get("name"),
                    "episode_count": season.get("episode_count"),
                    "poster_path": local_season_poster,
                    "air_date": season.get("air_date"),
                })

        MediaItem.objects.create(
            title=data.get("title") or data.get("name"),
            media_type=media_type,
            source="tmdb",
            source_id=tmdb_id,
            cover_url=local_poster,
            banner_url=local_banner,
            overview=data.get("overview", ""),
            release_date=data.get("release_date") or data.get("first_air_date") or "",
            cast=cast_data,
            seasons=seasons,
        )

        return JsonResponse({"message": "Added to your list."})

    except Exception as e:
        return JsonResponse({"error": f"Failed to save: {str(e)}"})

    
@require_GET
def mal_detail(request, media_type, mal_id):
    in_my_list = False
    if media_type not in ("anime", "manga"):
        return JsonResponse({"error": "Invalid media type."}, status=400)

    item = None
    item_id = None
    cast = []
    prequels = []
    sequels = []
    banner_url = None
    poster_url = None
    overview = ""
    release_date = ""

    # Check if it's saved in the local DB
    try:
        item = MediaItem.objects.get(source="mal", source_id=mal_id)
        item_id = item.id

        # Prepare cast data
        for member in item.cast or []:
            profile = member.get("profile_path")
            is_full_url = profile.startswith("http") or profile.startswith("/media/") if profile else False
            cast.append({
                "name": member.get("name"),
                "character": member.get("character"),
                "profile_path": profile,
                "is_full_url": is_full_url,
            })

        # Prepare related titles
        for related in item.related_titles or []:
            poster = related.get("poster_path")
            is_full_url = poster.startswith("http") or poster.startswith("/media/") if poster else False
            entry = {
                "id": related.get("mal_id"),
                "title": related.get("title"),
                "poster_path": poster,
                "is_full_url": is_full_url,
            }
            if related.get("relation", "").lower() == "prequel":
                prequels.append(entry)
            elif related.get("relation", "").lower() == "sequel":
                sequels.append(entry)

        poster_url = item.cover_url
        banner_url = item.banner_url
        overview = item.overview
        release_date = item.release_date
        in_my_list = True

    except MediaItem.DoesNotExist:
        # Live fetch from Jikan and AniList
        jikan_url = f"https://api.jikan.moe/v4/{media_type}/{mal_id}/full"
        response = requests.get(jikan_url)
        if response.status_code != 200:
            return JsonResponse({"error": "Failed to fetch details from Jikan."}, status=500)

        data = response.json().get("data", {})
        poster_url = data.get("images", {}).get("jpg", {}).get("large_image_url") or \
                     data.get("images", {}).get("jpg", {}).get("image_url")
        overview = data.get("synopsis")
        release_date = data.get("aired", {}).get("from") or data.get("published", {}).get("from")
        title = data.get("title_english") or data.get("title") or "Unknown Title"

        # Cast
        char_url = f"https://api.jikan.moe/v4/{media_type}/{mal_id}/characters"
        char_resp = requests.get(char_url)
        if char_resp.status_code == 200:
            for ch in char_resp.json().get("data", [])[:10]:
                cast.append({
                    "name": ch["character"]["name"],
                    "character": ch["role"],
                    "profile_path": ch["character"]["images"]["jpg"]["image_url"],
                    "is_full_url": True,
                })

        # Related titles: fetch posters using same method as save_mal_item
        related_titles = []
        for relation in data.get("relations", []):
            if relation["relation"].lower() in ("prequel", "sequel"):
                for entry in relation["entry"]:
                    r_id = entry["mal_id"]

                    # Use a different variable to avoid overwriting the main poster
                    detail_url = f"https://api.jikan.moe/v4/{media_type}/{r_id}"
                    r_resp = requests.get(detail_url)
                    if r_resp.status_code == 200:
                        r_data = r_resp.json().get("data", {})
                        r_title = r_data.get("title_english") or r_data.get("title") or entry["name"]
                        related_poster = r_data.get("images", {}).get("jpg", {}).get("image_url") or ""
                    else:
                        related_poster = ""

                    related_titles.append({
                        "id": r_id,
                        "mal_id": r_id,
                        "title": r_title,
                        "poster_path": related_poster,
                        "relation": relation["relation"].capitalize(),  # "Prequel" or "Sequel"
                        "is_full_url": True,
                    })
                    time.sleep(1)

        prequels = [r for r in related_titles if r["relation"].lower() == "prequel"]
        sequels = [r for r in related_titles if r["relation"].lower() == "sequel"]
        print("SEQUELS:", json.dumps(sequels, indent=2))
        

        banner_url = fetch_anilist_banner(mal_id, media_type)

    context = {
        "item": item,
        "item_id": item_id,
        "source": "mal",
        "source_id": mal_id,
        "media_type": media_type,
        "title": item.title if item else title,
        "overview": overview,
        "poster_url": poster_url,
        "banner_url": banner_url,
        "release_date": release_date,
        "cast": cast,
        "seasons": None,
        "recommendations": [],
        "prequels": prequels,
        "sequels": sequels,
        "in_my_list": in_my_list,
    }

    return render(request, "core/detail.html", context)


def save_mal_item(media_type, mal_id):
    try:
        # --- Fetch Jikan full data
        jikan_url = f"https://api.jikan.moe/v4/{media_type}/{mal_id}/full"
        response = requests.get(jikan_url)
        if response.status_code != 200:
            return JsonResponse({"error": "Failed to fetch data from Jikan."})
        data = response.json().get("data", {})

        # --- Poster
        poster_url = data.get("images", {}).get("jpg", {}).get("large_image_url") or \
                     data.get("images", {}).get("jpg", {}).get("image_url") or ""
        local_poster = download_image(poster_url, f"posters/mal_{mal_id}.jpg") if poster_url else ""

        # --- Banner (AniList)
        banner_url = fetch_anilist_banner(mal_id, media_type)
        local_banner = download_image(banner_url, f"banners/mal_{mal_id}.jpg") if banner_url else ""
        main_poster = download_image(poster_url, f"posters/mal_{mal_id}.jpg") if poster_url else ""

        # --- Title and description
        title = data.get("title_english") or data.get("title") or "Unknown Title"
        overview = data.get("synopsis") or ""
        release_date = data.get("aired", {}).get("from") or data.get("published", {}).get("from") or ""

        # --- Cast
        cast = []
        char_url = f"https://api.jikan.moe/v4/{media_type}/{mal_id}/characters"
        char_resp = requests.get(char_url)
        if char_resp.status_code == 200:
            for i, ch in enumerate(char_resp.json().get("data", [])[:10]):
                image_url = ch["character"]["images"]["jpg"]["image_url"]
                local_path = download_image(image_url, f"cast/mal_{mal_id}_{i}.jpg")
                cast.append({
                    "name": ch["character"]["name"],
                    "character": ch["role"],
                    "profile_path": local_path,
                })

        # --- Related Titles (prequels/sequels)
        related_titles = []
        for relation in data.get("relations", []):
            if relation["relation"].lower() in ("prequel", "sequel"):
                for entry in relation["entry"]:
                    r_id = entry["mal_id"]
                    # Fetch related entry for poster
                    detail_url = f"https://api.jikan.moe/v4/{media_type}/{r_id}"
                    r_resp = requests.get(detail_url)
                    if r_resp.status_code == 200:
                        r_data = r_resp.json().get("data", {})
                        r_title = r_data.get("title_english") or r_data.get("title") or entry["name"]
                        poster_url = r_data.get("images", {}).get("jpg", {}).get("image_url") or ""
                        local_poster = download_image(poster_url, f"related/mal_{r_id}.jpg") if poster_url else ""
                    else:
                        local_poster = ""

                    related_titles.append({
                        "mal_id": r_id,
                        "title": r_title,
                        "poster_path": local_poster,
                        "relation": relation["relation"].capitalize(),  # e.g. "Prequel"
                    })

        # --- Save to DB
        MediaItem.objects.create(
            title=title,
            media_type=media_type,
            source="mal",
            source_id=mal_id,
            cover_url=main_poster,
            banner_url=local_banner,
            overview=overview,
            release_date=release_date,
            cast=cast,
            seasons=None,
            related_titles=related_titles,
        )

        return JsonResponse({"message": "Saved to your list."})

    except Exception as e:
        return JsonResponse({"error": f"Save failed: {str(e)}"})


def fetch_anilist_banner(mal_id, media_type):
    query = '''
    query ($malId: Int, $type: MediaType) {
      Media(idMal: $malId, type: $type) {
        bannerImage
      }
    }
    '''
    variables = {
        "malId": int(mal_id),
        "type": media_type.upper()  # "ANIME" or "MANGA"
    }

    headers = {
        "Content-Type": "application/json"
    }

    try:
        keys = APIKey.objects.get(name="anilist")
        client_id = keys.key_1
        # Not needed in this case, but you can send Client-ID if required
    except APIKey.DoesNotExist:
        client_id = None  # fallback if needed

    response = requests.post(
        "https://graphql.anilist.co",
        json={"query": query, "variables": variables},
        headers=headers
    )

    if response.status_code != 200:
        return None

    data = response.json().get("data", {}).get("Media")
    return data.get("bannerImage") if data else None


# Game Details

@require_GET
def igdb_detail(request, igdb_id):
    try:
        item = MediaItem.objects.get(source="igdb", source_id=str(igdb_id))
        in_my_list = True
    except MediaItem.DoesNotExist:
        in_my_list = False
        item = None

    if in_my_list:
        # Use saved data
        context = {
            "item": item,
            "item_id": item.id,
            "source": "igdb",
            "source_id": igdb_id,
            "media_type": "game",
            "title": item.title,
            "overview": item.overview,
            "poster_url": item.cover_url,
            "banner_url": item.banner_url,
            "release_date": item.release_date,
            "cast": [],  # games don't have cast saved
            "seasons": None,
            "recommendations": [],
            "screenshots": [],
            "in_my_list": True,
        }
        return render(request, "core/detail.html", context)

    # Not in DB, fetch from IGDB API but DO NOT save to DB
    token = get_igdb_token()
    if not token:
        return JsonResponse({"error": "Failed to get IGDB access token."}, status=500)

    try:
        igdb_keys = APIKey.objects.get(name="igdb")
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "IGDB API keys not found."}, status=500)

    headers = {
        "Client-ID": igdb_keys.key_1,
        "Authorization": f"Bearer {token}",
    }

    query = f'''
    fields 
      id, name, summary, storyline, 
      cover.url, genres.name, platforms.name, 
      first_release_date, screenshots.url, similar_games.name, similar_games.cover.url;
    where id = {igdb_id};
    '''

    response = requests.post("https://api.igdb.com/v4/games", headers=headers, data=query)
    if response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch details from IGDB."}, status=500)

    data = response.json()
    if not data:
        return JsonResponse({"error": "Game not found."}, status=404)

    game = data[0]

    # Parse API data
    title = game.get("name") or "Unknown Title"
    overview = game.get("summary") or game.get("storyline") or ""

    poster_url = None
    if "cover" in game and game["cover"]:
        poster_url = "https:" + game["cover"]["url"].replace("t_thumb", "t_cover_big")

    screenshots = []
    for ss in game.get("screenshots", []):
        if ss and "url" in ss:
            screenshots.append("https:" + ss["url"].replace("t_thumb", "t_screenshot_huge"))

    banner_url = screenshots[0] if screenshots else None
    screenshots = screenshots[1:] if len(screenshots) > 1 else []

    release_date = None
    if game.get("first_release_date"):
        release_date = time.strftime('%Y-%m-%d', time.localtime(game["first_release_date"]))

    recommendations = []
    for rec in game.get("similar_games", [])[:5]:
        rec_cover_url = None
        if rec.get("cover") and rec["cover"].get("url"):
            rec_cover_url = "https:" + rec["cover"]["url"].replace("t_thumb", "t_cover_big")
        recommendations.append({
            "id": rec["id"],
            "title": rec["name"],
            "poster_path": rec_cover_url,
        })

    genres = [g["name"] for g in game.get("genres", []) if "name" in g]
    platforms = [p["name"] for p in game.get("platforms", []) if "name" in p]

    context = {
        "item": None,
        "item_id": None,
        "source": "igdb",
        "source_id": igdb_id,
        "media_type": "game",
        "title": title,
        "overview": overview,
        "poster_url": poster_url,
        "banner_url": banner_url,
        "release_date": release_date,
        "cast": [],
        "seasons": None,
        "recommendations": recommendations,
        "screenshots": screenshots,
        "genres": genres,
        "platforms": platforms,
        "in_my_list": False,
    }

    return render(request, "core/detail.html", context)


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

    query = f'''
    fields 
      id, name, summary, storyline, 
      cover.url, genres.name, platforms.name, 
      first_release_date, screenshots.url;
    where id = {igdb_id};
    '''

    response = requests.post("https://api.igdb.com/v4/games", headers=headers, data=query)
    if response.status_code != 200:
        raise Exception("Failed to fetch details from IGDB.")

    data = response.json()
    if not data:
        raise Exception("Game not found.")

    game = data[0]

    title = game.get("name") or "Unknown Title"
    overview = game.get("summary") or game.get("storyline") or ""

    # Poster
    poster_url = None
    if "cover" in game and game["cover"]:
        poster_url = "https:" + game["cover"]["url"].replace("t_thumb", "t_cover_big")
    local_poster = download_image(poster_url, f"posters/igdb_{igdb_id}.jpg") if poster_url else ""

    # Banner = first screenshot
    screenshots = game.get("screenshots", [])
    banner_url = None
    if screenshots:
        banner_url_raw = screenshots[0].get("url")
        if banner_url_raw:
            banner_url = "https:" + banner_url_raw.replace("t_thumb", "t_screenshot_huge")
    local_banner = download_image(banner_url, f"banners/igdb_{igdb_id}.jpg") if banner_url else ""

    # Release date
    release_date = None
    if game.get("first_release_date"):
        release_date = time.strftime('%Y-%m-%d', time.localtime(game["first_release_date"]))

    # Genres & Platforms
    genres = [g["name"] for g in game.get("genres", []) if "name" in g]
    platforms = [p["name"] for p in game.get("platforms", []) if "name" in p]

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
    )

    return JsonResponse({"success": True, "message": "Game added to list"})

def check_if_in_list(source, source_id):
    return MediaItem.objects.filter(source=source, source_id=str(source_id)).exists() # useless?

# Add to list

@require_POST
def add_to_list(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    required_fields = ["source", "source_id", "media_type"]
    if not all(data.get(field) for field in required_fields):
        return JsonResponse({"error": "Missing required fields"}, status=400)

    source = data["source"]
    source_id = str(data["source_id"])
    media_type = data["media_type"]

    # Prevent duplicate entries
    if MediaItem.objects.filter(source=source, source_id=source_id).exists():
        return JsonResponse({"error": "Item already in list"}, status=400)

    # Route to the correct handler (TMDB, MAL, IGDB, etc.)
    if source == "tmdb":
        return save_tmdb_item(media_type, source_id)

    if source == "mal":
        return save_mal_item(media_type, source_id)

    if source == "igdb":
        return save_igdb_item(source_id)

    return JsonResponse({"error": "Unsupported source"}, status=400)


# Edit item


def edit_item(request, item_id):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            item = MediaItem.objects.get(id=item_id)

            old_status = item.status

            # Update totals if present
            if "total_main" in data and data["total_main"] not in [None, ""]:
                item.total_main = int(data["total_main"])
            if "total_secondary" in data and data["total_secondary"] not in [None, ""]:
                item.total_secondary = int(data["total_secondary"])

            # Update status if present
            if "status" in data and data["status"] != "":
                new_status = data["status"]
                item.status = new_status
            else:
                new_status = old_status

            # Update progress fields if present (always accept manual input)
            if "progress_main" in data and data["progress_main"] not in [None, ""]:
                item.progress_main = int(data["progress_main"])

            if "progress_secondary" in data and data["progress_secondary"] not in [None, ""]:
                item.progress_secondary = int(data["progress_secondary"])

            # ONLY if status changed from something else TO completed,
            # overwrite progress with total values
            if old_status != "completed" and new_status == "completed":
                if item.total_main is not None:
                    item.progress_main = item.total_main
                if item.total_secondary is not None:
                    item.progress_secondary = item.total_secondary

            # Update other fields
            if "personal_rating" in data:
                item.personal_rating = data["personal_rating"] or None

            if "notes" in data:
                item.notes = data["notes"]

            if "favorite" in data:
                item.favorite = data["favorite"] in ["true", "on", True]

            item.save()
            return JsonResponse({"success": True})

        except Exception as e:
            return JsonResponse({"success": False, "error": str(e)})

    return JsonResponse({"success": False, "error": "Invalid request"})







def get_item(request, item_id):
    try:
        item = MediaItem.objects.get(id=item_id)
        total_main = item.total_main
        total_secondary = item.total_secondary

        # Fetch live data only if values aren't already stored
        if item.source == "tmdb" and item.media_type == "tv":
            try:
                api_key = APIKey.objects.get(name="tmdb").key_1
                url = f"https://api.themoviedb.org/3/tv/{item.source_id}"
                params = {"api_key": api_key}
                response = requests.get(url, params=params)
                if response.status_code == 200:
                    data = response.json()
                    total_main = data.get("number_of_episodes") or total_main
                    total_secondary = data.get("number_of_seasons") or total_secondary
            except Exception:
                pass  # Fallback to DB values

        elif item.source == "mal":
            try:
                url = f"https://api.jikan.moe/v4/{item.media_type}/{item.source_id}"
                response = requests.get(url)
                if response.status_code == 200:
                    data = response.json().get("data", {})
                    if item.media_type == "anime":
                        total_main = data.get("episodes") or total_main
                    elif item.media_type == "manga":
                        total_main = data.get("chapters") or total_main
                        total_secondary = data.get("volumes") or total_secondary
            except Exception:
                pass

        elif item.source == "igdb":
            # IGDB does not have episode/season style totals; leave as is
            total_main = None
            total_secondary = None

        return JsonResponse({
            "success": True,
            "item": {
                "id": item.id,
                "media_type": item.media_type,
                "status": item.status,
                "personal_rating": item.personal_rating,
                "notes": item.notes,
                "progress_main": item.progress_main,
                "total_main": total_main,
                "progress_secondary": item.progress_secondary,
                "total_secondary": total_secondary,
                "favorite": item.favorite,
                "item_status_choices": MediaItem.STATUS_CHOICES,
                "item_rating_choices": MediaItem.RATING_CHOICES,
            }
        })
    except MediaItem.DoesNotExist:
        return JsonResponse({"success": False, "error": "Item not found"})


# Settings

def add_key(request):
    data = json.loads(request.body)
    name = data.get("name", "").strip().lower()
    key_1 = data.get("key_1", "").strip()
    key_2 = data.get("key_2", "").strip()

    allowed_names = ["tmdb", "igdb", "mal", "anilist"]

    if not name or not key_1:
        return JsonResponse({"error": "Name and Key 1 are required."}, status=400)

    if name not in allowed_names:
        return JsonResponse({"error": "Invalid name. Must be one of: tmdb, igdb, mal, anilist."}, status=400)

    if APIKey.objects.filter(name=name).exists():
        return JsonResponse({"error": f"There is already an entry for '{name}'."}, status=400)

    APIKey.objects.create(name=name, key_1=key_1, key_2=key_2)
    return JsonResponse({"message": "API key added."})


def update_key(request):
    data = json.loads(request.body)
    try:
        key = APIKey.objects.get(id=data["id"])
        key.key_1 = data.get("key_1", key.key_1)
        key.key_2 = data.get("key_2", key.key_2)
        key.save()
        return JsonResponse({"message": "API key updated."})
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "Key not found."}, status=404)


def delete_key(request):
    data = json.loads(request.body)
    try:
        key = APIKey.objects.get(id=data["id"])
        key.delete()
        return JsonResponse({"message": "API key deleted."})
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "Key not found."}, status=404)
    

