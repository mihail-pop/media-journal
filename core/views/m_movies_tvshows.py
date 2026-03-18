import datetime

import requests
from django.apps import apps
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET

from core.models import APIKey, MediaItem


@ensure_csrf_cookie
@require_GET
def tmdb_search(request):
    query = request.GET.get("q", "").strip()
    media_type = request.GET.get("type", "").lower()  # Expect 'movie' or 'tv'

    if not query:
        return JsonResponse({"error": "Query parameter 'q' is required."}, status=400)

    if media_type not in ("movie", "tv"):
        return JsonResponse(
            {"error": "Query parameter 'type' must be 'movie' or 'tv'."}, status=400
        )

    from core.models import APIKey

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

    return JsonResponse({"results": results})


@ensure_csrf_cookie
@require_GET
def tmdb_detail(request, media_type, tmdb_id):
    if media_type not in ("movie", "tv"):
        return JsonResponse({"error": "Invalid media type."}, status=400)

    item = None
    try:
        item = MediaItem.objects.get(
            media_type=media_type, 
            provider_ids__tmdb=str(tmdb_id)
        )

        # Handle cast (add is_full_url for image path rendering)
        cast_data = []
        for member in item.cast or []:
            profile = member.get("profile_path")
            is_full_url = False
            if profile:
                if profile.startswith("http") or profile.startswith("/media/"):
                    is_full_url = True

            cast_data.append(
                {
                    "name": member.get("name"),
                    "character": member.get("character"),
                    "profile_path": profile,
                    "is_full_url": is_full_url,
                    "id": member.get("id"),
                }
            )

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
                        season["poster_path_full"] = (
                            f"https://image.tmdb.org/t/p/w185{poster}"
                        )
                else:
                    season["poster_path_full"] = ""

                # Format season air_date like release_date
                raw_air_date = season.get("air_date") or ""
                formatted_air_date = ""
                try:
                    if raw_air_date:
                        parsed_date = datetime.datetime.strptime(
                            raw_air_date, "%Y-%m-%d"
                        )
                        formatted_air_date = parsed_date.strftime("%b %Y")
                except ValueError:
                    formatted_air_date = raw_air_date
                season["air_date"] = formatted_air_date

        raw_date = item.release_date or ""
        formatted_release_date = ""

        try:
            if raw_date:
                parsed_date = datetime.datetime.strptime(raw_date, "%Y-%m-%d")
                formatted_release_date = parsed_date.strftime("%d %B %Y")
        except ValueError:
            formatted_release_date = raw_date

        # Get theme mode
        AppSettings = apps.get_model("core", "AppSettings")
        settings = AppSettings.objects.first()
        theme_mode = settings.theme_mode if settings else "dark"

        return render(
            request,
            "core/p_media_details.html",
            {
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
                "release_date": formatted_release_date,
                "genres": [],
                "cast": cast_data,
                "recommendations": [],
                "seasons": seasons,
                "page_type": media_type,
                "theme_mode": theme_mode,
            },
        )

    except MediaItem.DoesNotExist:
        pass  # Fall through to live fetch

    # Fallback to TMDB API
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "TMDB API key not found."}, status=500)

    url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}"
    if media_type == "tv":
        params = {
            "api_key": api_key,
            "append_to_response": "aggregate_credits,recommendations",
        }
    else:
        params = {"api_key": api_key, "append_to_response": "credits,recommendations"}
    response = requests.get(url, params=params)

    if response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch details from TMDB."}, status=500)

    data = response.json()

    # Poster and Banner (direct URLs from TMDB)
    poster_path = data.get("poster_path")
    banner_path = data.get("backdrop_path")
    poster_url = (
        f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None
    )
    banner_url = (
        f"https://image.tmdb.org/t/p/original{banner_path}" if banner_path else None
    )

    # Cast (use TMDB URLs)
    cast_data = []
    if media_type == "tv":
        cast_list = data.get("aggregate_credits", {}).get("cast", [])[:8]
    else:
        cast_list = data.get("credits", {}).get("cast", [])[:8]

    for i, actor in enumerate(cast_list):
        if media_type == "tv":
            character_name = (
                actor.get("roles", [{}])[0].get("character")
                if actor.get("roles")
                else ""
            )
        else:
            character_name = actor.get("character")

        profile_url = (
            f"https://image.tmdb.org/t/p/w185{actor.get('profile_path')}"
            if actor.get("profile_path")
            else ""
        )
        cast_data.append(
            {
                "name": actor.get("name"),
                "character": character_name,
                "profile_path": profile_url,
                "is_full_url": True,  # Because it's a complete URL
                "id": actor.get("id"),
            }
        )

    # Seasons
    seasons = data.get("seasons", []) if media_type == "tv" else None
    if seasons:
        for season in seasons:
            poster_path = season.get("poster_path")
            season["poster_path_full"] = (
                f"https://image.tmdb.org/t/p/w185{poster_path}" if poster_path else ""
            )

            # Format air_date for each season
            raw_air_date = season.get("air_date") or ""
            formatted_air_date = ""
            try:
                if raw_air_date:
                    parsed_date = datetime.datetime.strptime(raw_air_date, "%Y-%m-%d")
                    formatted_air_date = parsed_date.strftime("%b %Y")
            except ValueError:
                formatted_air_date = raw_air_date
            season["air_date"] = formatted_air_date

    raw_date = data.get("release_date") or data.get("first_air_date") or ""
    formatted_release_date = ""

    try:
        if raw_date:
            parsed_date = datetime.datetime.strptime(raw_date, "%Y-%m-%d")
            formatted_release_date = parsed_date.strftime(
                "%d %B %Y"
            )  # e.g., "05 November 2023"
    except ValueError:
        formatted_release_date = raw_date  # fallback to raw string if parsing fails

    # Get theme mode
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else "dark"

    return render(
        request,
        "core/p_media_details.html",
        {
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
            "release_date": formatted_release_date,
            "genres": data.get("genres", []),
            "cast": cast_data,
            "recommendations": data.get("recommendations", {}).get("results", [])[:16],
            "seasons": seasons,
            "page_type": media_type,
            "theme_mode": theme_mode,
        },
    )


@ensure_csrf_cookie
@require_GET
def tmdb_season_detail(request, tmdb_id, season_number):
    # Check if season already exists in database
    season_source_id = f"{tmdb_id}_s{season_number}"
    item = None
    try:
        item = MediaItem.objects.get(
            provider_ids__tmdb=str(season_source_id), media_type="tv"
        )

        # Format episode data for display
        episodes = item.episodes or []
        for episode in episodes:
            if episode.get("air_date"):
                try:
                    parsed_date = datetime.datetime.strptime(
                        episode["air_date"], "%Y-%m-%d"
                    )
                    episode["formatted_air_date"] = parsed_date.strftime("%d %B %Y")
                except ValueError:
                    episode["formatted_air_date"] = episode["air_date"]

        # Handle cast
        cast_data = []
        for member in item.cast or []:
            profile = member.get("profile_path")
            is_full_url = (
                profile.startswith("http") or profile.startswith("/media/")
                if profile
                else False
            )
            cast_data.append(
                {
                    "name": member.get("name"),
                    "character": member.get("character"),
                    "profile_path": profile,
                    "is_full_url": is_full_url,
                    "id": member.get("id"),
                }
            )

        # Format release date from DB
        raw_date = item.release_date or ""
        formatted_release_date = ""
        try:
            if raw_date:
                parsed_date = datetime.datetime.strptime(raw_date, "%Y-%m-%d")
                formatted_release_date = parsed_date.strftime("%d %B %Y")
        except ValueError:
            formatted_release_date = raw_date

        # Get navigation data from main show
        try:
            main_show = MediaItem.objects.get(
                provider_ids__tmdb=str(tmdb_id), media_type="tv"
            )
            all_seasons = main_show.seasons or []
            season_nav = get_season_navigation(all_seasons, int(season_number))
        except MediaItem.DoesNotExist:
            # Fallback: fetch seasons from TMDB API
            try:
                api_key = APIKey.objects.get(name="tmdb").key_1
                show_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}"
                show_params = {"api_key": api_key}
                show_response = requests.get(show_url, params=show_params)
                if show_response.status_code == 200:
                    show_data = show_response.json()
                    all_seasons = show_data.get("seasons", [])
                    season_nav = get_season_navigation(all_seasons, int(season_number))
                else:
                    season_nav = {}
            except (APIKey.DoesNotExist, Exception):
                season_nav = {}

        # Get theme mode
        AppSettings = apps.get_model("core", "AppSettings")
        settings = AppSettings.objects.first()
        theme_mode = settings.theme_mode if settings else "dark"

        return render(
            request,
            "core/p_season_details.html",
            {
                "item": item,
                "item_id": item.id,
                "source": "tmdb",
                "source_id": season_source_id,
                "tmdb_id": tmdb_id,
                "season_number": season_number,
                "in_my_list": True,
                "media_type": "tv",
                "title": item.title,
                "overview": item.overview,
                "banner_url": item.banner_url,
                "poster_url": item.cover_url,
                "release_date": formatted_release_date,
                "cast": cast_data,
                "episodes": episodes,
                "page_type": "tv",
                "season_nav": season_nav,
                "theme_mode": theme_mode,
            },
        )
    except MediaItem.DoesNotExist:
        pass

    # Fetch from TMDB API
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "TMDB API key not found."}, status=500)

    # Get season details
    season_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{season_number}"
    season_params = {"api_key": api_key, "append_to_response": "aggregate_credits"}
    season_response = requests.get(season_url, params=season_params)

    if season_response.status_code != 200:
        return JsonResponse(
            {"error": "Failed to fetch season details from TMDB."}, status=500
        )

    season_data = season_response.json()

    # Get main show details for context
    show_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}"
    show_params = {"api_key": api_key}
    show_response = requests.get(show_url, params=show_params)
    show_data = show_response.json() if show_response.status_code == 200 else {}

    # Format data
    poster_url = (
        f"https://image.tmdb.org/t/p/w500{season_data.get('poster_path')}"
        if season_data.get("poster_path")
        else None
    )
    banner_url = (
        f"https://image.tmdb.org/t/p/original{show_data.get('backdrop_path')}"
        if show_data.get("backdrop_path")
        else None
    )

    # Cast data
    cast_data = []
    for actor in season_data.get("aggregate_credits", {}).get("cast", [])[:8]:
        character_name = (
            actor.get("roles", [{}])[0].get("character") if actor.get("roles") else ""
        )
        profile_url = (
            f"https://image.tmdb.org/t/p/w185{actor.get('profile_path')}"
            if actor.get("profile_path")
            else ""
        )
        cast_data.append(
            {
                "name": actor.get("name"),
                "character": character_name,
                "profile_path": profile_url,
                "is_full_url": True,
                "id": actor.get("id"),
            }
        )

    # Episodes data
    episodes = []
    for episode in season_data.get("episodes", []):
        air_date = episode.get("air_date", "")
        formatted_air_date = ""
        if air_date:
            try:
                parsed_date = datetime.datetime.strptime(air_date, "%Y-%m-%d")
                formatted_air_date = parsed_date.strftime("%d %B %Y")
            except ValueError:
                formatted_air_date = air_date

        episodes.append(
            {
                "episode_number": episode.get("episode_number"),
                "name": episode.get("name"),
                "overview": episode.get("overview", ""),
                "air_date": air_date,
                "formatted_air_date": formatted_air_date,
                "still_path": f"https://image.tmdb.org/t/p/w1280{episode.get('still_path')}"
                if episode.get("still_path")
                else None,
            }
        )

    # Format release date
    raw_date = season_data.get("air_date", "")
    formatted_release_date = ""
    if raw_date:
        try:
            parsed_date = datetime.datetime.strptime(raw_date, "%Y-%m-%d")
            formatted_release_date = parsed_date.strftime("%d %B %Y")
        except ValueError:
            formatted_release_date = raw_date

    season_title = f"{show_data.get('name', 'Unknown Show')} {season_data.get('name', f'Season {season_number}')}"

    # Get season navigation data
    all_seasons = show_data.get("seasons", [])
    season_nav = get_season_navigation(all_seasons, int(season_number))

    # Get theme mode
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else "dark"

    return render(
        request,
        "core/p_season_details.html",
        {
            "item": None,
            "item_id": None,
            "source": "tmdb",
            "source_id": season_source_id,
            "tmdb_id": tmdb_id,
            "season_number": season_number,
            "in_my_list": False,
            "media_type": "tv",
            "title": season_title,
            "overview": season_data.get("overview", ""),
            "banner_url": banner_url,
            "poster_url": poster_url,
            "release_date": formatted_release_date,
            "cast": cast_data,
            "episodes": episodes,
            "page_type": "tv",
            "season_nav": season_nav,
            "theme_mode": theme_mode,
        },
    )


def get_season_navigation(seasons, current_season):
    """Generate navigation data for season detail pages"""
    nav = {}

    # Sort seasons by season_number, handle specials (season 0)
    sorted_seasons = sorted(seasons, key=lambda s: s.get("season_number", 0))

    current_index = next(
        (
            i
            for i, s in enumerate(sorted_seasons)
            if s.get("season_number") == current_season
        ),
        None,
    )
    if current_index is None:
        return nav

    # Previous season
    if current_index > 0:
        prev_season = sorted_seasons[current_index - 1]
        nav["prev_season"] = prev_season.get("season_number")
        nav["prev_name"] = (
            "Specials"
            if prev_season.get("season_number") == 0
            else f"Season {prev_season.get('season_number')}"
        )

    # Next season
    if current_index < len(sorted_seasons) - 1:
        next_season = sorted_seasons[current_index + 1]
        nav["next_season"] = next_season.get("season_number")
        nav["next_name"] = (
            "Specials"
            if next_season.get("season_number") == 0
            else f"Season {next_season.get('season_number')}"
        )

    # Last season (if there are more than 2 seasons ahead)
    if current_index < len(sorted_seasons) - 2:
        last_season = sorted_seasons[-1]
        if (
            last_season.get("season_number") != 0
        ):  # Don't show "Last Season" for specials
            nav["last_season"] = last_season.get("season_number")
            nav["last_name"] = f"Season {last_season.get('season_number')}"

    return nav
