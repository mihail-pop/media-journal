from django.views.decorators.http import require_GET, require_POST
from django.shortcuts import render
from django.conf import settings
from django.http import JsonResponse
from .models import APIKey, MediaItem
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
    return render(request, 'core/settings.html', {'keys': keys})

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
        "fields": "id,title,main_picture"
    }
    response = requests.get(url, headers=headers, params=params)

    if response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch from MAL."}, status=500)

    data = response.json()
    results = []
    for item in data.get("data", []):
        results.append({
            "id": str(item["node"]["id"]),
            "title": item["node"]["title"],
            "poster_path": item["node"]["main_picture"]["medium"] if item["node"].get("main_picture") else None,
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

    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "TMDB API key not found."}, status=500)

    url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}"
    params = {
        "api_key": api_key,
        "append_to_response": "credits,recommendations"
    }
    response = requests.get(url, params=params)

    if response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch details from TMDB."}, status=500)

    data = response.json()

    # Prepare poster URL with fallback to None
    poster_path = data.get("poster_path")
    poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None

    # For TV shows get seasons, for movies no seasons
    seasons = data.get("seasons") if media_type == "tv" else None

    in_my_list = check_if_in_list("tmdb", tmdb_id)
    item = MediaItem.objects.get(source="tmdb", source_id=tmdb_id)
    context = {
        "item": item,
        "item_id": item.id,  # pass the id here explicitly
        "source": "tmdb",
        "source_id": tmdb_id,
        "in_my_list": in_my_list,
        "media_type": media_type,
        "title": data.get("title") or data.get("name"),
        "overview": data.get("overview"),
        "poster_url": poster_url,
        "release_date": data.get("release_date") or data.get("first_air_date"),
        "genres": data.get("genres", []),
        "cast": data.get("credits", {}).get("cast", [])[:10],  # top 10 cast members
        "recommendations": data.get("recommendations", {}).get("results", [])[:5],
        "seasons": seasons,
        #
        "status": item.status,
        "personal_rating": item.personal_rating,
        "notes": item.notes,
        "progress_main": item.progress_main,
        "total_main": item.total_main,
        "progress_secondary": item.progress_secondary,
        "total_secondary": item.total_secondary,
        "is_full_url": False,  # relative path
        "item_status_choices": MediaItem.STATUS_CHOICES,
        "item_rating_choices": MediaItem.RATING_CHOICES,
    }

    return render(request, "core/detail.html", context)

# manga / anime
@require_GET
def mal_detail(request, media_type, mal_id):
    if media_type not in ("anime", "manga"):
        return JsonResponse({"error": "Invalid media type."}, status=400)

    jikan_url = f"https://api.jikan.moe/v4/{media_type}/{mal_id}/full"
    response = requests.get(jikan_url)
    if response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch details from Jikan."}, status=500)

    data = response.json().get("data", {})

    poster_url = data.get("images", {}).get("jpg", {}).get("large_image_url") or \
                 data.get("images", {}).get("jpg", {}).get("image_url")
    title = data.get("title")
    overview = data.get("synopsis")
    release_date = data.get("aired", {}).get("from") or data.get("published", {}).get("from")

    cast = []
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

    # Collect raw prequels and sequels first from relations
    raw_prequels = []
    raw_sequels = []
    for relation in data.get("relations", []):
        relation_type = relation["relation"].lower()
        if relation_type == "prequel":
            raw_prequels.extend(relation["entry"])
        elif relation_type == "sequel":
            raw_sequels.extend(relation["entry"])

    # Fetch detailed info (with poster images) for prequels and sequels
    prequels = fetch_related_with_images(raw_prequels, media_type)
    sequels = fetch_related_with_images(raw_sequels, media_type)

    in_my_list = check_if_in_list("mal", mal_id)
    item = MediaItem.objects.get(source="mal", source_id=mal_id)

    context = {
        "item": item,
        "item_id": item.id,  # pass the id here explicitly
        "source": "mal",
        "source_id": mal_id,
        "media_type": media_type,
        "title": title,
        "overview": overview,
        "poster_url": poster_url,
        "release_date": release_date,
        "cast": cast,
        "seasons": None,
        "recommendations": [],
        "prequels": prequels,
        "sequels": sequels,
        "status": item.status,
        "personal_rating": item.personal_rating,
        "notes": item.notes,
        "progress_main": item.progress_main,
        "total_main": item.total_main,
        "progress_secondary": item.progress_secondary,
        "total_secondary": item.total_secondary,
        "in_my_list": in_my_list,
        "item_status_choices": MediaItem.STATUS_CHOICES,
        "item_rating_choices": MediaItem.RATING_CHOICES,
    }

    return render(request, "core/detail.html", context)


def fetch_related_with_images(related_list, media_type):
    detailed_related = []
    for entry in related_list:
        mal_id = entry["mal_id"]
        title = entry["name"]
        # Fetch full detail to get poster
        url = f"https://api.jikan.moe/v4/{media_type}/{mal_id}"
        resp = requests.get(url)
        poster_path = ""
        if resp.status_code == 200:
            data = resp.json().get("data", {})
            poster_path = data.get("images", {}).get("jpg", {}).get("image_url") or ""
        detailed_related.append({
            "id": mal_id,
            "title": title,
            "poster_path": poster_path,
        })
    return detailed_related



# Game Details

@require_GET
def igdb_detail(request, igdb_id):
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

    # IGDB API query for detailed game info
    query = f'''
    fields 
      id, name, summary, storyline, 
      cover.url, genres.name, platforms.name, 
      first_release_date, screenshots.url, 
      similar_games.name, similar_games.cover.url;
    where id = {igdb_id};
    '''

    response = requests.post("https://api.igdb.com/v4/games", headers=headers, data=query)
    if response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch details from IGDB."}, status=500)

    data = response.json()
    if not data:
        return JsonResponse({"error": "Game not found."}, status=404)

    game = data[0]

    # Prepare poster/cover URL
    poster_url = None
    if "cover" in game and game["cover"]:
        poster_url = "https:" + game["cover"]["url"].replace("t_thumb", "t_cover_big")

    # Prepare screenshots (list of urls)
    screenshots = []
    for ss in game.get("screenshots", []):
        if ss and "url" in ss:
            screenshots.append("https:" + ss["url"].replace("t_thumb", "t_screenshot_huge"))

    # Format release date (IGDB returns unix timestamp in seconds)
    release_date = None
    if game.get("first_release_date"):
        release_date = time.strftime('%Y-%m-%d', time.localtime(game["first_release_date"]))

    # Prepare recommendations from similar_games (limit 5)
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

    # IGDB has no cast or seasons for games, so keep empty
    cast = []
    seasons = None

    in_my_list = check_if_in_list("igdb", igdb_id)
    item = MediaItem.objects.get(source="igdb", source_id=igdb_id)

    context = {
        "item": item,
        "item_id": item.id,  # pass the id here explicitly
        "source": "igdb",
        "source_id": igdb_id,
        "media_type": "game",
        "title": game.get("name"),
        "overview": game.get("summary") or game.get("storyline"),
        "poster_url": poster_url,
        "release_date": release_date,
        "cast": cast,
        "seasons": seasons,
        "recommendations": recommendations,
        "screenshots": screenshots,  # optional, you can use this in template if you want
        "genres": [g["name"] for g in game.get("genres", []) if "name" in g],
        "platforms": [p["name"] for p in game.get("platforms", []) if "name" in p],
        "in_my_list": in_my_list,
        "status": item.status,
        "personal_rating": item.personal_rating,
        "notes": item.notes,
        "progress_main": item.progress_main,
        "total_main": item.total_main,
        "progress_secondary": item.progress_secondary,
        "total_secondary": item.total_secondary,
        "item_status_choices": MediaItem.STATUS_CHOICES,
        "item_rating_choices": MediaItem.RATING_CHOICES,
    }


    return render(request, "core/detail.html", context)

def check_if_in_list(source, source_id):
    return MediaItem.objects.filter(source=source, source_id=str(source_id)).exists()

# Add to list

@require_POST
def add_to_list(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    required_fields = ["source", "source_id", "media_type", "title", "cover_url"]
    if not all(data.get(field) for field in required_fields):
        return JsonResponse({"error": "Missing or empty required fields"}, status=400)

    item, created = MediaItem.objects.get_or_create(
        source=data["source"],
        source_id=str(data["source_id"]),
        defaults={
            "media_type": data["media_type"],
            "title": data["title"],
            "cover_url": data["cover_url"],
        },
    )
    if not created:
        return JsonResponse({"error": "Item already in list"}, status=400)

    return JsonResponse({"message": "Item added to list"})


# Edit item


def edit_item(request, item_id):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            item = MediaItem.objects.get(id=item_id)

            item.status = data.get("status", item.status)
            item.personal_rating = data.get("personal_rating") or None
            item.notes = data.get("notes", "")
            item.progress_main = data.get("progress_main") or 0
            item.total_main = data.get("total_main") or None
            item.progress_secondary = data.get("progress_secondary") or None
            item.total_secondary = data.get("total_secondary") or None
            item.favorite = data.get("favorite") in ["true", "on", True]

            item.save()
            return JsonResponse({"success": True})
        except Exception as e:
            return JsonResponse({"success": False, "error": str(e)})
    return JsonResponse({"success": False, "error": "Invalid request"})

# Settings

def add_key(request):
    print("add_key view hit")
    data = json.loads(request.body)
    name = data.get("name", "").strip()
    key_1 = data.get("key_1", "").strip()
    key_2 = data.get("key_2", "").strip()

    if not name or not key_1:
        return JsonResponse({"error": "Name and Key 1 are required."}, status=400)

    if APIKey.objects.filter(name=name).exists():
        return JsonResponse({"error": "A key with this name already exists."}, status=400)

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