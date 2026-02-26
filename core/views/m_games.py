from django.apps import apps
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET
from django.shortcuts import render
from django.http import JsonResponse
from core.models import APIKey, MediaItem
from core.services.m_games import get_igdb_token
import time
import requests
import logging
import datetime
import re
import unicodedata

IGDB_ACCESS_TOKEN = None
IGDB_TOKEN_EXPIRY = 0

logger = logging.getLogger(__name__)

@ensure_csrf_cookie
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
        "Accept": "application/json",
    }

    def process_cover(item):
        """Helper to resize IGDB cover images."""
        if item.get("cover") and item["cover"].get("url"):
            return "https:" + item["cover"]["url"].replace("t_thumb", "t_cover_big")
        return None

    # 1. Generate Presumed Slug
    # Normalize input to create a likely slug (e.g., "Pokémon Go" -> "pokemon-go")
    # This is used to check if the search results missed the exact game.
    query_norm = (
        unicodedata.normalize("NFKD", query)
        .encode("ASCII", "ignore")
        .decode("utf-8")
        .lower()
    )
    query_slug = re.sub(r"[^a-z0-9\s-]", "", query_norm).strip().replace(" ", "-")

    # 2. Primary Search (Fast)
    # Uses IGDB's text search index. Fast, but can occasionally bury exact matches.
    clean_query = query.replace('"', '\\"')
    data_search = f'''
    search "{clean_query}";
    fields id, name, cover.url, slug;
    limit 30;
    '''

    results = []
    found_exact_slug = False

    try:
        response = requests.post(
            "https://api.igdb.com/v4/games", headers=headers, data=data_search
        )
        if response.status_code == 200:
            for item in response.json():
                if item.get("slug") == query_slug:
                    found_exact_slug = True

                results.append(
                    {
                        "id": str(item["id"]),
                        "title": item.get("name", "Untitled"),
                        "poster_path": process_cover(item),
                        "slug": item.get("slug", ""),
                    }
                )
    except Exception as e:
        print(f"IGDB Search Error: {e}")
        return JsonResponse({"error": "Failed to fetch from IGDB."}, status=500)

    # 3. Fallback Search (Specific)
    # If the exact slug wasn't found in the primary results, perform a direct lookup.
    # This handles edge cases (like 'Pokémon Go') where the index prioritizes other titles.
    if not found_exact_slug and len(query_slug) > 2:
        data_slug_check = f'''
        fields id, name, cover.url, slug;
        where slug = "{query_slug}";
        '''
        try:
            slug_response = requests.post(
                "https://api.igdb.com/v4/games", headers=headers, data=data_slug_check
            )
            if slug_response.status_code == 200:
                slug_results = slug_response.json()
                if slug_results:
                    missing_game = slug_results[0]
                    # Insert the missing exact match at the top of the list
                    results.insert(
                        0,
                        {
                            "id": str(missing_game["id"]),
                            "title": missing_game.get("name", "Untitled"),
                            "poster_path": process_cover(missing_game),
                            "slug": missing_game.get("slug", ""),
                        },
                    )
        except Exception:
            pass

    # 4. Rank Results
    # Prioritize exact name matches and games starting with the query.
    query_lower = query.lower()

    def rank(item):
        name = item["title"]
        slug = item.get("slug", "")

        # Priority 0: Exact slug match
        if slug == query_slug:
            return 0

        try:
            name_norm = (
                unicodedata.normalize("NFKD", name)
                .encode("ASCII", "ignore")
                .decode("utf-8")
                .lower()
            )
            q_norm = (
                unicodedata.normalize("NFKD", query_lower)
                .encode("ASCII", "ignore")
                .decode("utf-8")
            )
        except Exception:
            return 3

        # Priority 0: Exact name match
        if name_norm == q_norm:
            return 0
        # Priority 1: Starts with query
        if name_norm.startswith(q_norm):
            return 1
        # Priority 2: Contains query
        if q_norm in name_norm:
            return 2

        return 3

    results.sort(key=rank)

    # 5. Clean and Deduplicate
    # Remove internal 'slug' field and ensure unique IDs
    final_results = []
    seen_ids = set()

    for r in results:
        if r["id"] not in seen_ids:
            # Create a new dict excluding 'slug'
            final_results.append({k: v for k, v in r.items() if k != "slug"})
            seen_ids.add(r["id"])

    return JsonResponse({"results": final_results[:30]})

@ensure_csrf_cookie
@require_GET
def igdb_detail(request, igdb_id):
    try:
        item = MediaItem.objects.get(source="igdb", source_id=str(igdb_id))
        in_my_list = True
    except MediaItem.DoesNotExist:
        in_my_list = False
        item = None

    formatted_release_date = ""

    if in_my_list:
        # Use saved data
        screenshots = item.screenshots or []

        # Format release date from DB
        if item.release_date:
            try:
                parsed_date = datetime.datetime.strptime(item.release_date, "%Y-%m-%d")
                formatted_release_date = parsed_date.strftime("%d %B %Y")
            except ValueError:
                formatted_release_date = item.release_date

        # Slice screenshots for initial load
        total_screenshots = len(screenshots)
        initial_screenshots = screenshots[:40]

        # Get theme mode
        AppSettings = apps.get_model("core", "AppSettings")
        settings = AppSettings.objects.first()
        theme_mode = settings.theme_mode if settings else "dark"

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
            "release_date": formatted_release_date,
            "cast": [],
            "seasons": None,
            "recommendations": [],
            "screenshots": initial_screenshots,
            "total_screenshots": total_screenshots,
            "in_my_list": True,
            "page_type": "game",
            "theme_mode": theme_mode,
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

    query = f"""
    fields 
      id, name, summary, storyline, 
      cover.url, genres.name, platforms.name, 
      first_release_date, screenshots.url, similar_games.name, similar_games.cover.url, artworks.url;
    where id = {igdb_id};
    """

    response = requests.post(
        "https://api.igdb.com/v4/games", headers=headers, data=query
    )
    if response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch details from IGDB."}, status=500)

    data = response.json()
    if not data:
        return JsonResponse({"error": "Game not found."}, status=404)

    game = data[0]
    title = game.get("name") or "Unknown Title"
    overview = game.get("summary") or game.get("storyline") or ""

    poster_url = None
    if "cover" in game and game["cover"]:
        poster_url = "https:" + game["cover"]["url"].replace(
            "t_thumb", "t_cover_big_2x"
        )

    screenshots = []
    for ss in game.get("screenshots", []):
        if ss and "url" in ss:
            url = "https:" + ss["url"].replace("t_thumb", "t_1080p")
            screenshots.append({"url": url, "is_full_url": True})

    banner_url = None

    if "artworks" in game and game["artworks"]:
        first_artwork = game["artworks"][0]
        if first_artwork and "url" in first_artwork:
            banner_url = "https:" + first_artwork["url"].replace("t_thumb", "t_1080p")

    # Fallback to screenshot if no artwork is present
    if not banner_url and screenshots:
        banner_url = "https:" + screenshots[0]["url"].replace("t_thumb", "t_1080p")
        screenshots = screenshots[1:] if len(screenshots) > 1 else []

    # Slice screenshots for initial load
    total_screenshots = len(screenshots)
    initial_screenshots = screenshots[:40]

    # Format release date from IGDB (timestamp -> %Y-%m-%d -> %d %B %Y)
    if game.get("first_release_date"):
        try:
            date_str = time.strftime(
                "%Y-%m-%d", time.localtime(game["first_release_date"])
            )
            parsed_date = datetime.datetime.strptime(date_str, "%Y-%m-%d")
            formatted_release_date = parsed_date.strftime("%d %B %Y")
        except Exception:
            formatted_release_date = ""  # fallback if error

    recommendations = []
    for rec in game.get("similar_games", [])[:16]:
        rec_cover_url = None
        if rec.get("cover") and rec["cover"].get("url"):
            rec_cover_url = "https:" + rec["cover"]["url"].replace(
                "t_thumb", "t_cover_big"
            )
        recommendations.append(
            {
                "id": rec["id"],
                "title": rec["name"],
                "poster_path": rec_cover_url,
            }
        )

    genres = [g["name"] for g in game.get("genres", []) if "name" in g]
    platforms = [p["name"] for p in game.get("platforms", []) if "name" in p]

    # Get theme mode
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else "dark"

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
        "release_date": formatted_release_date,
        "cast": [],
        "seasons": None,
        "recommendations": recommendations,
        "screenshots": initial_screenshots,
        "total_screenshots": total_screenshots,
        "genres": genres,
        "platforms": platforms,
        "in_my_list": False,
        "page_type": "game",
        "theme_mode": theme_mode,
    }

    return render(request, "core/detail.html", context)

