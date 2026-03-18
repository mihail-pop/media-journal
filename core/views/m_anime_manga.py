import datetime

import requests
from django.apps import apps
from django.http import JsonResponse
from django.shortcuts import render, redirect
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET
from django.db.models import Q

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

    # UPDATED: Fetch both 'id' (AniList) and 'idMal' (MAL)
    graphql_query = """
    query ($search: String, $type: MediaType) {
      Page(perPage: 20) {
        media(search: $search, type: $type) {
          id
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
        "type": search_type.upper(),
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
            # NEW LOGIC: We take everything AniList gives us
            anilist_id = media.get("id")
            mal_id = media.get("idMal")

            title = (
                media["title"].get("english")
                or media["title"].get("romaji")
                or "Unknown Title"
            )
            poster = media.get("coverImage", {}).get("large")

            # We return AniList as the primary source now
            results.append(
                {
                    "source": "anilist",
                    "id": str(anilist_id), # Primary search ID
                    "mal_id": str(mal_id) if mal_id else None, # Alt ID for duplicate checking
                    "title": title,
                    "poster_path": poster,
                }
            )

        return JsonResponse({"results": results})

    except Exception as e:
        return JsonResponse({"error": f"AniList parse error: {str(e)}"}, status=500)


@ensure_csrf_cookie
@require_GET
def anilist_detail(request, source, media_type, source_id):
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
    recommendations = []

    # 1. Try to find the item in the DB by the ID provided in the URL
    lookup_key = f"provider_ids__{source}"
    item = MediaItem.objects.filter(
        **{lookup_key: str(source_id)}, 
        media_type=media_type
    ).first()

    if item:
        # --- LOGIC: ITEM EXISTS IN DB ---
        item_id = item.id
        title = item.title
        poster_url = item.cover_url
        banner_url = item.banner_url
        overview = item.overview
        release_date = item.release_date

        if release_date:
            try:
                parsed_date = datetime.datetime.strptime(release_date, "%Y-%m-%d")
                formatted_release_date = parsed_date.strftime("%d %B %Y")
            except ValueError:
                formatted_release_date = release_date

        # Process Cast
        for member in item.cast or []:
            profile = member.get("profile_path")
            is_full_url = (
                profile.startswith("http") or profile.startswith("/media/")
                if profile
                else False
            )
            cast.append({
                "name": member.get("name"),
                "character": member.get("character"),
                "profile_path": profile,
                "is_full_url": is_full_url,
                "id": member.get("id"),
            })

        # Process Prequels/Sequels
        for related in item.related_titles or []:
            # Use the fallback logic: AniList ID preference, then MAL ID
            r_id = related.get("anilist_id") or related.get("mal_id")
            r_source = "anilist" if related.get("anilist_id") else "mal"
            
            entry = {
                "id": r_id,
                "source": r_source,
                "title": related.get("title"),
                "poster_path": related.get("poster_path"),
                "is_full_url": related.get("poster_path", "").startswith("http")
                or related.get("poster_path", "").startswith("/media/"),
            }
            rel_type = related.get("relation", "").lower()
            if rel_type == "prequel":
                prequels.append(entry)
            elif rel_type == "sequel":
                sequels.append(entry)

        in_my_list = True

    else:
        # --- LOGIC: ITEM NOT FOUND IN DB (OR ACCESSED VIA ALT ID) ---
        try:
            # Fetch from API using the provided source
            if source == "anilist":
                api_data = fetch_anilist_data(media_type, anilist_id=source_id)
            else:
                api_data = fetch_anilist_data(media_type, mal_id=source_id)
            
            # Healing check: 
            alt_anilist = api_data.get("anilist_id")
            alt_mal = api_data.get("mal_id")
            
            item = MediaItem.objects.filter(
                Q(provider_ids__anilist=str(alt_anilist)) | Q(provider_ids__mal=str(alt_mal)),
                media_type=media_type
            ).first()

            if item:
                # Silently update the item with the missing ID and redirect/reload
                item.provider_ids["anilist"] = str(alt_anilist)
                if alt_mal:
                    item.provider_ids["mal"] = str(alt_mal)
                item.save()
                return redirect(request.path)

        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

        title = api_data["title"]
        poster_url = api_data["poster_url"]
        banner_url = api_data["banner_url"]
        overview = api_data["overview"]
        release_date = api_data["release_date"]

        if release_date:
            try:
                parsed_date = datetime.datetime.strptime(release_date, "%Y-%m-%d")
                formatted_release_date = parsed_date.strftime("%d %B %Y")
            except ValueError:
                formatted_release_date = release_date

        cast = api_data["cast"]
        recommendations = api_data.get("recommendations", [])

        # Process related titles from API
        for r in api_data["related_titles"]:
            r_id = r.get("anilist_id") or r.get("mal_id")
            r_source = "anilist" if r.get("anilist_id") else "mal"
            entry = {
                "id": r_id,
                "source": r_source,
                "title": r["title"],
                "poster_path": r["poster_path"],
                "is_full_url": True
            }
            if r["relation"].lower() == "prequel":
                prequels.append(entry)
            elif r["relation"].lower() == "sequel":
                sequels.append(entry)

    # Theme logic
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else "dark"

    context = {
        "item": item,
        "item_id": item_id,
        "source": source,
        "source_id": source_id,
        "media_type": media_type,
        "title": title,
        "overview": overview,
        "poster_url": poster_url,
        "banner_url": banner_url,
        "release_date": formatted_release_date,
        "cast": cast,
        "prequels": prequels,
        "sequels": sequels,
        "in_my_list": in_my_list,
        "recommendations": recommendations,
        "page_type": media_type,
        "theme_mode": theme_mode,
    }

    return render(request, "core/p_media_details.html", context)
