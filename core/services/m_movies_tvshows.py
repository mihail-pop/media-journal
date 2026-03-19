import time

import concurrent.futures
import requests
from django.http import JsonResponse
from django.utils import timezone
from requests.exceptions import RequestException
from datetime import datetime

from core.models import APIKey, MediaItem
from core.services.g_utils import download_image

TMDB_MOVIE_GENRES = {
    28: "Action",
    12: "Adventure",
    16: "Animation",
    35: "Comedy",
    80: "Crime",
    99: "Documentary",
    18: "Drama",
    10751: "Family",
    14: "Fantasy",
    36: "History",
    27: "Horror",
    10402: "Music",
    9648: "Mystery",
    10749: "Romance",
    878: "Science Fiction",
    10770: "TV Movie",
    53: "Thriller",
    10752: "War",
    37: "Western",
}

TMDB_TV_GENRES = {
    10759: "Action & Adventure",
    16: "Animation",
    35: "Comedy",
    80: "Crime",
    99: "Documentary",
    18: "Drama",
    10751: "Family",
    10762: "Kids",
    9648: "Mystery",
    10763: "News",
    10764: "Reality",
    10765: "Sci-Fi & Fantasy",
    10766: "Soap",
    10767: "Talk",
    10768: "War & Politics",
    37: "Western",
}


def save_tmdb_item(media_type, tmdb_id):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
        url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}"
        if media_type == "tv":
            params = {"api_key": api_key, "append_to_response": "aggregate_credits"}
        else:
            params = {"api_key": api_key, "append_to_response": "credits"}
        response = requests.get(url, params=params)

        if response.status_code != 200:
            return JsonResponse({"error": "Failed to fetch TMDB details."})

        data = response.json()

        # Poster and banner
        poster_url = (
            f"https://image.tmdb.org/t/p/w500{data.get('poster_path')}"
            if data.get("poster_path")
            else ""
        )
        banner_url = (
            f"https://image.tmdb.org/t/p/original{data.get('backdrop_path')}"
            if data.get("backdrop_path")
            else ""
        )

        cache_bust = int(time.time() * 1000)
        local_poster = (
            download_image(
                poster_url, f"posters/tmdb_{media_type}_{tmdb_id}_{cache_bust}.jpg"
            )
            if poster_url
            else ""
        )
        local_banner = (
            download_image(
                banner_url, f"banners/tmdb_{media_type}_{tmdb_id}_{cache_bust}.jpg"
            )
            if banner_url
            else ""
        )

        # Cast
        cast_data = []
        if media_type == "tv":
            cast_list = data.get("aggregate_credits", {}).get("cast", [])[:8]
        else:
            cast_list = data.get("credits", {}).get("cast", [])[:8]

        for actor in cast_list:
            if media_type == "tv":
                character_name = (
                    actor.get("roles", [{}])[0].get("character")
                    if actor.get("roles")
                    else ""
                )
            else:
                character_name = actor.get("character")

            actor_id = actor.get("id", "unknown")
            profile_url = (
                f"https://image.tmdb.org/t/p/w185{actor.get('profile_path')}"
                if actor.get("profile_path")
                else ""
            )
            local_profile = ""
            if profile_url:
                # Use actor ID instead of index to prevent mismatches
                filename = f"cast/tmdb_{media_type}_{tmdb_id}_{actor_id}_{cache_bust}.jpg"
                local_profile = download_image(profile_url, filename)

            cast_data.append(
                {
                    "name": actor.get("name"),
                    "character": character_name,
                    "profile_path": local_profile,
                    "id": actor_id,
                }
            )

        # Seasons (only for TV shows)
        seasons = []
        total_episodes = 0
        total_seasons = 0
        if media_type == "tv":
            for i, season in enumerate(data.get("seasons", [])):
                season_number = season.get("season_number")
                episode_count = season.get("episode_count", 0)
                
                # Count episodes and seasons (excluding specials)
                if season_number != 0:
                    total_episodes += episode_count
                    total_seasons += 1
                
                season_poster_url = (
                    f"https://image.tmdb.org/t/p/w300{season.get('poster_path')}"
                    if season.get("poster_path")
                    else ""
                )
                local_season_poster = (
                    download_image(
                        season_poster_url, f"seasons/tmdb_tv_{tmdb_id}_s{i}_{cache_bust}.jpg"
                    )
                    if season_poster_url
                    else ""
                )

                seasons.append(
                    {
                        "season_number": season_number,
                        "name": season.get("name"),
                        "episode_count": episode_count,
                        "poster_path": local_season_poster,
                        "air_date": season.get("air_date"),
                    }
                )

        MediaItem.objects.create(
            title=data.get("title") or data.get("name"),
            media_type=media_type,
            source="tmdb",
            provider_ids={"tmdb": str(tmdb_id)},
            cover_url=local_poster,
            banner_url=local_banner,
            overview=data.get("overview", ""),
            release_date=data.get("release_date") or data.get("first_air_date") or "",
            cast=cast_data,
            seasons=seasons,
            total_main=total_episodes if media_type == "tv" else None,
            total_secondary=total_seasons if media_type == "tv" else None,
        )

        return JsonResponse({"message": "Added to your list."})

    except Exception as e:
        return JsonResponse({"error": f"Failed to save: {str(e)}"})


def save_tmdb_season(tmdb_id, season_number):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1

        # Get season details
        season_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{season_number}"
        season_params = {"api_key": api_key, "append_to_response": "aggregate_credits"}
        season_response = requests.get(season_url, params=season_params)

        if season_response.status_code != 200:
            return JsonResponse({"error": "Failed to fetch season details."})

        season_data = season_response.json()

        # Get main show details
        show_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}"
        show_params = {"api_key": api_key}
        show_response = requests.get(show_url, params=show_params)
        show_data = show_response.json() if show_response.status_code == 200 else {}

        # Download images
        poster_url = (
            f"https://image.tmdb.org/t/p/w500{season_data.get('poster_path')}"
            if season_data.get("poster_path")
            else ""
        )
        banner_url = (
            f"https://image.tmdb.org/t/p/original{show_data.get('backdrop_path')}"
            if show_data.get("backdrop_path")
            else ""
        )

        season_source_id = f"{tmdb_id}_s{season_number}"
        cache_bust = int(time.time() * 1000)
        local_poster = (
            download_image(
                poster_url, f"posters/tmdb_tv_{season_source_id}_{cache_bust}.jpg"
            )
            if poster_url
            else ""
        )
        local_banner = (
            download_image(
                banner_url, f"banners/tmdb_tv_{season_source_id}_{cache_bust}.jpg"
            )
            if banner_url
            else ""
        )

        # Cast data
        cast_data = []
        for actor in season_data.get("aggregate_credits", {}).get("cast", [])[:8]:
            character_name = (
                actor.get("roles", [{}])[0].get("character")
                if actor.get("roles")
                else ""
            )
            actor_id = actor.get("id", "unknown")
            profile_url = (
                f"https://image.tmdb.org/t/p/w185{actor.get('profile_path')}"
                if actor.get("profile_path")
                else ""
            )
            local_profile = ""
            if profile_url:
                # Use actor ID instead of index to prevent mismatches
                filename = f"cast/tmdb_{season_source_id}_{actor_id}_{cache_bust}.jpg"
                local_profile = download_image(profile_url, filename)

            cast_data.append(
                {
                    "name": actor.get("name"),
                    "character": character_name,
                    "profile_path": local_profile,
                    "id": actor_id,
                }
            )

        # Episodes data
        episodes_data = []
        for episode in season_data.get("episodes", []):
            still_url = (
                f"https://image.tmdb.org/t/p/w1280{episode.get('still_path')}"
                if episode.get("still_path")
                else ""
            )
            local_still = (
                download_image(
                    still_url,
                    f"episodes/tmdb_{season_source_id}_e{episode.get('episode_number', 0)}_{cache_bust}.jpg",
                )
                if still_url
                else ""
            )

            episodes_data.append(
                {
                    "episode_number": episode.get("episode_number"),
                    "name": episode.get("name"),
                    "overview": episode.get("overview", ""),
                    "air_date": episode.get("air_date", ""),
                    "still_path": local_still,
                }
            )

        season_title = f"{show_data.get('name', 'Unknown Show')} {season_data.get('name', f'Season {season_number}')}"

        MediaItem.objects.create(
            title=season_title,
            media_type="tv",
            source="tmdb",
            provider_ids={"tmdb": str(season_source_id)},
            cover_url=local_poster,
            banner_url=local_banner,
            overview=season_data.get("overview", ""),
            release_date=season_data.get("air_date", ""),
            cast=cast_data,
            episodes=episodes_data,
            total_main=len(episodes_data),
            total_secondary=1,
        )

        return JsonResponse({"message": "Season added to your list."})

    except Exception as e:
        return JsonResponse({"error": f"Failed to save season: {str(e)}"})


def get_movie_extra_info(tmdb_id):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return {}

    base_url = f"https://api.themoviedb.org/3/movie/{tmdb_id}"
    params = {
        "api_key": api_key,
        "append_to_response": "videos,credits,recommendations",
    }

    try:
        # Single API call with all data
        response = requests.get(base_url, params=params)
        if response.status_code != 200:
            return {}

        data = response.json()

        # Process videos/trailers
        videos = data.get("videos", {}).get("results", [])
        trailer_videos = [
            v
            for v in videos
            if v.get("site") == "YouTube"
            and v.get("type") == "Trailer"
            and v.get("key")
        ]
        teaser_videos = [
            v
            for v in videos
            if v.get("site") == "YouTube" and v.get("type") == "Teaser" and v.get("key")
        ]
        combined = trailer_videos + teaser_videos
        trailers = [
            {
                "name": v.get("name"),
                "type": v.get("type"),
                "youtube_id": v.get("key"),
                "url": f"https://www.youtube.com/watch?v={v['key']}",
            }
            for v in combined[:3]
        ]

        # Process crew
        crew = data.get("credits", {}).get("crew", [])
        allowed_jobs = ["Director", "Writer", "Screenplay", "Producer", "Art Director"]
        staff_list = [
            f"{c['name']} ({c['job']})" for c in crew if c.get("job") in allowed_jobs
        ]

        # Fetch related movies if part of a collection
        relations = []
        collection = data.get("belongs_to_collection")
        if collection:
            collection_id = collection.get("id")
            collection_url = f"https://api.themoviedb.org/3/collection/{collection_id}"
            collection_resp = requests.get(collection_url, params=params)
            if collection_resp.status_code == 200:
                items = collection_resp.json().get("parts", [])
                # Sort by release date
                items.sort(key=lambda x: x.get("release_date") or "")
                for item in items:
                    relations.append(
                        {
                            "id": item.get("id"),
                            "title": item.get("title"),
                            "release_date": item.get("release_date"),
                            "poster": f"https://image.tmdb.org/t/p/w342{item.get('poster_path')}"
                            if item.get("poster_path")
                            else None,
                        }
                    )

        # Process recommendations
        recs = data.get("recommendations", {}).get("results", [])[:16]
        recommendations = [
            {
                "id": rec["id"],
                "title": rec.get("title"),
                "poster_path": rec.get("poster_path"),
            }
            for rec in recs
        ]

        return {
            "runtime": data.get("runtime"),
            "genres": [genre["name"] for genre in data.get("genres", [])],
            "status": data.get("status"),
            "homepage": data.get("homepage"),
            "vote_average": round(data.get("vote_average", 0), 1),
            "trailers": trailers,
            "staff": staff_list,
            "relations": relations,
            "recommendations": recommendations,
        }

    except Exception as e:
        print(f"Error in get_movie_extra_info: {e}")
        return {}


def get_tv_extra_info(tmdb_id):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return {}

    base_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}"
    params = {
        "api_key": api_key,
        "append_to_response": "videos,credits,recommendations",
    }

    try:
        # Single API call with all data
        response = requests.get(base_url, params=params)
        if response.status_code != 200:
            return {}

        data = response.json()

        # Handle optional fields safely
        next_ep_raw = data.get("next_episode_to_air")
        next_episode_data = {
            "number": next_ep_raw.get("episode_number"),
            "date": next_ep_raw.get("air_date"),
            "season": next_ep_raw.get("season_number")  # Add this line
        } if next_ep_raw else None

        last_ep_raw = data.get("last_episode_to_air")
        last_episode_data = {
            "number": last_ep_raw.get("episode_number"),
            "date": last_ep_raw.get("air_date"),
            "season": last_ep_raw.get("season_number")  # And this line
        } if last_ep_raw else None

        # Process videos/trailers
        videos = data.get("videos", {}).get("results", [])
        trailer_videos = [
            v
            for v in videos
            if v.get("site") == "YouTube"
            and v.get("type") == "Trailer"
            and v.get("key")
        ]
        teaser_videos = [
            v
            for v in videos
            if v.get("site") == "YouTube" and v.get("type") == "Teaser" and v.get("key")
        ]
        combined = trailer_videos + teaser_videos
        trailers = [
            {
                "name": v.get("name"),
                "type": v.get("type"),
                "youtube_id": v.get("key"),
                "url": f"https://www.youtube.com/watch?v={v['key']}",
            }
            for v in combined[:3]
        ]

        # Process crew
        crew = data.get("credits", {}).get("crew", [])
        allowed_jobs = ["Director", "Writer", "Screenplay", "Producer", "Art Director"]
        staff_list = [
            f"{c['name']} ({c['job']})" for c in crew if c.get("job") in allowed_jobs
        ]

        # Process recommendations
        recs = data.get("recommendations", {}).get("results", [])[:16]
        recommendations = [
            {
                "id": rec["id"],
                "title": rec.get("name"),
                "poster_path": rec.get("poster_path"),
            }
            for rec in recs
        ]

        seasons = data.get("seasons", [])
        total_episodes = sum(
            s.get("episode_count", 0) for s in seasons if s.get("season_number") != 0
        )

        run_times = data.get("episode_run_time", [])
        episode_runtime = run_times[0] if run_times else None

        # 2. FALLBACK: If the list is empty, check the last episode's runtime
        if not episode_runtime:
            last_ep = data.get("last_episode_to_air")
            if last_ep:
                # This field is often populated even when the main list isn't
                episode_runtime = last_ep.get("runtime")

        # 3. SECOND FALLBACK: Check the first episode (if available)
        if not episode_runtime:
            first_ep = data.get("next_episode_to_air")
            if first_ep:
                episode_runtime = first_ep.get("runtime")

        return {
            "status": data.get("status"),
            "next_episode_data": next_episode_data,
            "last_episode_data": last_episode_data,
            "networks": [n.get("name") for n in data.get("networks", [])],
            "vote_average": round(data.get("vote_average", 0), 1),
            "homepage": data.get("homepage"),
            "genres": [genre["name"] for genre in data.get("genres", [])],
            "trailers": trailers,
            "staff": staff_list,
            "recommendations": recommendations,
            "total_episodes": total_episodes,
            "episode_runtime": episode_runtime,
        }

    except Exception as e:
        print("TV API error:", e)
        return {}


def get_tmdb_discover(media_type, page, query="", sort="popularity.desc", year=""):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return[]

    if query:
        url = f"https://api.themoviedb.org/3/search/{media_type}"
        params = {"api_key": api_key, "query": query, "page": page}
    elif sort == "trending":
        url = f"https://api.themoviedb.org/3/trending/{media_type}/week"
        params = {"api_key": api_key, "page": page}
    else:
        url = f"https://api.themoviedb.org/3/discover/{media_type}"
        params = {
            "api_key": api_key,
            "sort_by": sort,
            "page": page,
            "include_adult": "false",
            "vote_count.gte": 100,
        }

        if year:
            if media_type == "movie":
                params["primary_release_date.gte"] = f"{year}-01-01"
                params["primary_release_date.lte"] = f"{year}-12-31"
            elif media_type == "tv":
                params["first_air_date.gte"] = f"{year}-01-01"
                params["first_air_date.lte"] = f"{year}-12-31"

    try:
        response = requests.get(url, params=params)
        if response.status_code != 200:
            return[]

        data = response.json()
        raw_results = data.get("results", [])
        results =[]

        # --- Fetch Next Episode Data for TV Shows Concurrently ---
        next_ep_data_map = {}
        if media_type == "tv" and raw_results:
            def fetch_tv_details(tv_id):
                try:
                    detail_url = f"https://api.themoviedb.org/3/tv/{tv_id}"
                    # We only need basic details, no append_to_response needed to keep it lightning fast
                    resp = requests.get(detail_url, params={"api_key": api_key}, timeout=3)
                    if resp.status_code == 200:
                        return tv_id, resp.json().get("next_episode_to_air")
                except Exception:
                    pass
                return tv_id, None

            # max_workers=20 ensures all items on the page are fetched in one single, parallel burst
            with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
                futures = {executor.submit(fetch_tv_details, item["id"]): item["id"] for item in raw_results}
                for future in concurrent.futures.as_completed(futures):
                    tv_id, next_ep = future.result()
                    if next_ep:
                        next_ep_data_map[tv_id] = next_ep

        # Get today's date for math
        today = datetime.now().date()

        for item in raw_results:
            item_id = str(item["id"])
            poster = item.get("poster_path")
            poster_url = f"https://image.tmdb.org/t/p/w342{poster}" if poster else None

            backdrop = item.get("backdrop_path")
            backdrop_url = f"https://image.tmdb.org/t/p/w780{backdrop}" if backdrop else None

            score = item.get("vote_average")
            if score:
                score = round(score, 1)

            release_date = item.get("release_date") or item.get("first_air_date", "")

            genre_map = TMDB_MOVIE_GENRES if media_type == "movie" else TMDB_TV_GENRES
            genres =[genre_map.get(gid, "") for gid in item.get("genre_ids", [])]
            genres = [g for g in genres if g]

            result_dict = {
                "source": "tmdb",
                "id": item_id,
                "title": item.get("title") or item.get("name", "Untitled"),
                "poster_path": poster_url,
                "backdrop_path": backdrop_url,
                "media_type": media_type,
                "overview": item.get("overview", ""),
                "score": score,
                "release_date": release_date,
                "genres": genres,
            }

            # --- Process the Next Episode Data if it exists ---
            if media_type == "tv" and int(item_id) in next_ep_data_map:
                next_ep = next_ep_data_map[int(item_id)]
                air_date_str = next_ep.get("air_date")
                
                if air_date_str:
                    try:
                        air_date = datetime.strptime(air_date_str, "%Y-%m-%d").date()
                        delta_days = (air_date - today).days

                        # Only show if the episode hasn't already aired before today
                        if delta_days >= 0:
                            weekday = air_date.strftime("%A") 
                            
                            if delta_days == 0:
                                time_str = f"{weekday} (today)"
                            elif delta_days == 1:
                                time_str = f"{weekday} (tomorrow)"
                            else:
                                time_str = f"{weekday} (in {delta_days} days)"

                            result_dict["next_airing"] = time_str
                            result_dict["next_episode"] = {
                                "episode": next_ep.get("episode_number"),
                                "season": next_ep.get("season_number")
                            }
                    except Exception:
                        pass

            results.append(result_dict)

        return results
    except Exception as e:
        print(f"Discover Error: {e}")
        return


def update_tmdb_seasons(media_item):
    """
    Check if the TMDB TV series has new seasons.
    If so, update the MediaItem and set a notification.
    """
    if media_item.media_type != "tv" or media_item.source != "tmdb":
        return False  # Skip if not a TMDB TV show

    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        print("TMDB API key not found.")
        return False

    url = f"https://api.themoviedb.org/3/tv/{media_item.source_id}"
    params = {"api_key": api_key}
    response = requests.get(url, params=params)

    try:
        # ... your TMDB API call
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        # proceed with update if valid
    except RequestException as e:
        print(
            f"🌐 TMDB update skipped for {media_item.title} — no connection or error: {e}"
        )
    except Exception as e:
        print(f"⚠️ Unexpected error while updating {media_item.title}: {e}")

    if response.status_code != 200:
        print(f"TMDB fetch failed for ID {media_item.source_id}")
        return False

    data = response.json()
    fetched_seasons = data.get("seasons", [])

    # Compare with existing
    existing_seasons = media_item.seasons or []
    existing_numbers = {s["season_number"] for s in existing_seasons}

    new_seasons = []
    for i, season in enumerate(fetched_seasons):
        season_number = season.get("season_number")
        if season_number in existing_numbers:
            continue  # already saved

        # New season found
        poster_path = season.get("poster_path")
        local_poster = ""
        if poster_path:
            full_url = f"https://image.tmdb.org/t/p/w300{poster_path}"
            local_poster = download_image(
                full_url, f"seasons/tmdb_{media_item.source_id}_s{season_number}.jpg"
            )

        new_seasons.append(
            {
                "season_number": season_number,
                "name": season.get("name"),
                "episode_count": season.get("episode_count"),
                "poster_path": local_poster,
                "air_date": season.get("air_date"),
            }
        )

    if new_seasons:
        media_item.seasons = existing_seasons + new_seasons
        media_item.notification = True
        media_item.last_updated = timezone.now()
        media_item.save()
        print(f"[TMDB] Updated: {media_item.title} – {len(new_seasons)} new season(s).")
        return True

    # No new seasons
    media_item.last_updated = timezone.now()
    media_item.save()
    return False
