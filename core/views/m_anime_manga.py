import datetime

import requests
from django.apps import apps
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET

from core.models import MediaItem
from core.services.m_anime_manga import fetch_anilist_data


@ensure_csrf_cookie
@require_GET
def anilist_search(request):
    query_str = request.GET.get("q", "").strip()
    search_type = request.GET.get("type", "anime").lower()

    if not query_str:
        return JsonResponse({"error": "Query parameter 'q' is required."}, status=400)

    if search_type not in ("anime", "manga"):
        return JsonResponse(
            {"error": "Invalid search type. Use 'anime' or 'manga'."}, status=400
        )

    graphql_query = """
    query ($search: String, $type: MediaType) {
      Page(perPage: 20) {
        media(search: $search, type: $type) {
          idMal
          title {
            english
            romaji
          }
          coverImage {
            large
          }
        }
      }
    }
    """

    variables = {
        "search": query_str,
        "type": search_type.upper(),  # "ANIME" or "MANGA"
    }

    headers = {"Content-Type": "application/json"}

    response = requests.post(
        "https://graphql.anilist.co",
        json={"query": graphql_query, "variables": variables},
        headers=headers,
    )

    if response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch from AniList."}, status=500)

    try:
        data = response.json()
        results = []

        for media in data.get("data", {}).get("Page", {}).get("media", []):
            mal_id = media.get("idMal")
            if not mal_id:
                continue  # skip entries without MAL ID

            title = (
                media["title"].get("english")
                or media["title"].get("romaji")
                or "Unknown Title"
            )
            poster = media.get("coverImage", {}).get("large")

            results.append(
                {
                    "id": str(mal_id),  # Still return MAL ID for compatibility
                    "title": title,
                    "poster_path": poster,
                }
            )

        return JsonResponse({"results": results})

    except Exception as e:
        return JsonResponse({"error": f"AniList parse error: {str(e)}"}, status=500)


@ensure_csrf_cookie
@require_GET
def anilist_detail(request, media_type, mal_id):
    if media_type not in ("anime", "manga"):
        return JsonResponse({"error": "Invalid media type."}, status=400)

    item = None
    item_id = None
    cast = []
    prequels = []
    sequels = []
    poster_url = None
    banner_url = None
    overview = ""
    release_date = ""
    formatted_release_date = ""
    title = ""
    in_my_list = False

    try:
        item = MediaItem.objects.get(
            source="mal", source_id=mal_id, media_type=media_type
        )
        item_id = item.id
        title = item.title
        poster_url = item.cover_url
        banner_url = item.banner_url
        overview = item.overview
        release_date = item.release_date

        # Format release date from DB
        if release_date:
            try:
                parsed_date = datetime.datetime.strptime(release_date, "%Y-%m-%d")
                formatted_release_date = parsed_date.strftime("%d %B %Y")
            except ValueError:
                formatted_release_date = release_date

        cast = []
        for member in item.cast or []:
            profile = member.get("profile_path")
            is_full_url = (
                profile.startswith("http") or profile.startswith("/media/")
                if profile
                else False
            )
            cast.append(
                {
                    "name": member.get("name"),
                    "character": member.get("character"),
                    "profile_path": profile,
                    "is_full_url": is_full_url,
                    "id": member.get("id"),
                }
            )

        for related in item.related_titles or []:
            entry = {
                "id": related.get("mal_id"),
                "title": related.get("title"),
                "poster_path": related.get("poster_path"),
                "is_full_url": related.get("poster_path", "").startswith("http")
                or related.get("poster_path", "").startswith("/media/"),
            }
            if related.get("relation", "").lower() == "prequel":
                prequels.append(entry)
            elif related.get("relation", "").lower() == "sequel":
                sequels.append(entry)

        in_my_list = True
        recommendations = []
    except MediaItem.DoesNotExist:
        try:
            anilist_data = fetch_anilist_data(mal_id, media_type)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

        title = anilist_data["title"]
        poster_url = anilist_data["poster_url"]
        banner_url = anilist_data["banner_url"]
        overview = anilist_data["overview"]
        release_date = anilist_data["release_date"]

        # Format release date from AniList
        if release_date:
            try:
                parsed_date = datetime.datetime.strptime(release_date, "%Y-%m-%d")
                formatted_release_date = parsed_date.strftime("%d %B %Y")
            except ValueError:
                formatted_release_date = release_date

        cast = anilist_data["cast"]
        related_titles = anilist_data["related_titles"]
        recommendations = anilist_data.get("recommendations", [])

        prequels = [r for r in related_titles if r["relation"].lower() == "prequel"]
        sequels = [r for r in related_titles if r["relation"].lower() == "sequel"]
        for r in prequels + sequels:
            if "id" not in r and "mal_id" in r:
                r["id"] = r["mal_id"]

    # Get theme mode
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else "dark"

    context = {
        "item": item,
        "item_id": item_id,
        "source": "mal",
        "source_id": mal_id,
        "media_type": media_type,
        "title": title,
        "overview": overview,
        "poster_url": poster_url,
        "banner_url": banner_url,
        "release_date": formatted_release_date,
        "cast": cast,
        "seasons": None,
        "prequels": prequels,
        "sequels": sequels,
        "in_my_list": in_my_list,
        "recommendations": recommendations,
        "page_type": media_type,
        "theme_mode": theme_mode,
    }

    return render(request, "core/p_media_details.html", context)
