from core.services.g_api_errors import ApiError, ApiClient, require_api_data
import time

import concurrent.futures
import requests
from django.http import JsonResponse
from django.utils import timezone
from requests.exceptions import RequestException
from datetime import datetime

from core.models import APIKey, MediaItem
from core.services.g_runtimes import tmdb_episode_runtime, tmdb_season_runtime
from core.services.g_utils import apply_initial_item_status, download_image

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


def movie_collection_relations(data, *, http=None, cache_bust=None, existing=None):
    """Save collection neighbours in the existing related_titles JSON field."""
    collection = data.get('belongs_to_collection') or {}
    if not collection.get('id'):
        return []
    api_key = APIKey.objects.get(name='tmdb').key_1
    payload = ApiClient('tmdb', http).get(
        f'https://api.themoviedb.org/3/collection/{collection["id"]}', params={'api_key': api_key}).json()
    require_api_data(isinstance(payload, dict) and isinstance(payload.get('parts'), list), 'tmdb')
    previous = {str(entry.get('id')): entry.get('poster_path') for entry in existing or [] if isinstance(entry, dict)}
    stamp = cache_bust if cache_bust is not None else int(time.time() * 1000)
    relations = []
    for movie in sorted(payload['parts'], key=lambda entry: entry.get('release_date') or ''):
        identity = movie.get('id')
        if not identity or str(identity) == str(data.get('id')):
            continue
        poster = previous.get(str(identity)) or ''
        if not poster and movie.get('poster_path'):
            poster = download_image(f'https://image.tmdb.org/t/p/w342{movie["poster_path"]}',
                                    f'related/tmdb_movie_{data["id"]}_{identity}_{stamp}.jpg')
        relations.append({'id': identity, 'title': movie.get('title') or movie.get('name') or '',
                          'poster_path': poster, 'release_date': movie.get('release_date') or '',
                          'source': 'tmdb', 'media_type': 'movie', 'relation': 'Collection'})
    return relations


def save_tmdb_item(media_type, tmdb_id, *, http=None, prepare_only=False, initial_status='planned'):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
        url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}"
        if media_type == "tv":
            params = {"api_key": api_key, "append_to_response": "aggregate_credits"}
        else:
            params = {"api_key": api_key, "append_to_response": "credits"}
        response = (ApiClient('tmdb', http)).get(url, params=params)

        if response.status_code != 200:
            return JsonResponse({"error": "Failed to fetch TMDB details."})

        data = response.json()
        require_api_data(isinstance(data, dict) and data.get('id') and (data.get('title') or data.get('name')), 'tmdb')
        credits_key = 'aggregate_credits' if media_type == 'tv' else 'credits'
        require_api_data(isinstance(data.get(credits_key), dict) and isinstance(data[credits_key].get('cast'), list), 'tmdb')
        if media_type == 'tv':
            require_api_data(isinstance(data.get('seasons'), list), 'tmdb')

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
            today = datetime.now().date()
            one_year_ahead = datetime(today.year + 1, today.month, today.day).date()
            for i, season in enumerate(data.get("seasons", [])):
                season_number = season.get("season_number")
                episode_count = season.get("episode_count", 0)
                
                # Count episodes and seasons (excluding specials, within one year)
                if season_number != 0:
                    air_date_str = season.get("air_date")
                    if air_date_str:
                        try:
                            air_date = datetime.strptime(air_date_str, "%Y-%m-%d").date()
                            if air_date <= one_year_ahead:
                                total_episodes += episode_count
                                total_seasons += 1
                        except Exception:
                            pass
                
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

        genres =[g.get("name") for g in data.get("genres", []) if g.get("name")]

        creators =[]
        if media_type == "tv":
            creators =[c.get("name") for c in data.get("created_by", []) if c.get("name")]
        else:
            crew = data.get("credits", {}).get("crew", [])
            creators =[c.get("name") for c in crew if c.get("job") == "Director" and c.get("name")]

        item_data = dict(
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
            **({'related_titles': movie_collection_relations(data, http=http, cache_bust=cache_bust)} if media_type == 'movie' else {}),
            total_main=total_episodes if media_type == "tv" else data.get("runtime"),
            total_secondary=total_seasons if media_type == "tv" else None,
            episode_runtime=tmdb_episode_runtime(data) if media_type == 'tv' else None,
            genres=genres,
            creators=creators,
        )
        if prepare_only:
            return {"item": item_data}
        apply_initial_item_status(item_data, initial_status)
        MediaItem.objects.create(**item_data)

        return JsonResponse({"message": "Added to your list."})

    except ApiError:
        raise
    except Exception as e:
        return JsonResponse({"error": f"Failed to save: {str(e)}"})


def save_tmdb_season(tmdb_id, season_number, *, http=None, prepare_only=False, initial_status='planned'):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1

        # Get season details
        season_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{season_number}"
        season_params = {"api_key": api_key, "append_to_response": "aggregate_credits"}
        season_response = (ApiClient('tmdb', http)).get(season_url, params=season_params)

        if season_response.status_code == 429:
            raise Exception("HTTP 429 Too Many Requests: Rate Limit Exceeded")
        elif season_response.status_code != 200:
            return JsonResponse({"error": "Failed to fetch season details."})
        season_data = season_response.json()
        require_api_data(isinstance(season_data, dict) and season_data.get('id') and
                         isinstance(season_data.get('episodes'), list), 'tmdb')
        require_api_data(isinstance(season_data.get('aggregate_credits'), dict) and
                         isinstance(season_data['aggregate_credits'].get('cast'), list), 'tmdb')

        # Get main show details
        show_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}"
        show_params = {"api_key": api_key}
        show_response = (ApiClient('tmdb', http)).get(show_url, params=show_params)
        show_data = show_response.json() if show_response.status_code == 200 else {}
        require_api_data(isinstance(show_data, dict) and show_data.get('id') and show_data.get('name'), 'tmdb')

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

        genres =[g.get("name") for g in show_data.get("genres", []) if g.get("name")]
        creators =[c.get("name") for c in show_data.get("created_by", []) if c.get("name")]

        item_data = dict(
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
            # Retain navigation locally even when only this season is saved.
            related_titles={'season_navigation': [
                {'season_number': season['season_number']} for season in show_data.get('seasons', [])
                if isinstance(season.get('season_number'), int)]},
            total_main=len(episodes_data),
            total_secondary=1,
            episode_runtime=tmdb_season_runtime(season_data, show_data),
            genres=genres,
            creators=creators,
        )

        if prepare_only:
            return {"item": item_data}
        apply_initial_item_status(item_data, initial_status)
        MediaItem.objects.create(**item_data)

        return JsonResponse({"message": "Season added to your list."})

    except ApiError:
        raise
    except Exception as e:
        return JsonResponse({"error": f"Failed to save season: {str(e)}"})


def get_tmdb_discover(media_type, page, query="", sort="popularity.desc", year="", genre="", allow_adult=True):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        raise ApiError('tmdb', 'missing_key')

    if query:
        url = f"https://api.themoviedb.org/3/search/{media_type}"
        params = {"api_key": api_key, "query": query, "page": page}
    elif sort == "trending":
        # Trending endpoint doesn't support genre filtering
        # If genre is selected, use discover with popularity sort instead
        if genre:
            url = f"https://api.themoviedb.org/3/discover/{media_type}"
            params = {
                "api_key": api_key,
                "sort_by": "popularity.desc",
                "page": page,
                "include_adult": str(allow_adult).lower(),
                "vote_count.gte": 100,
                "with_genres": genre,
            }
        else:
            url = f"https://api.themoviedb.org/3/trending/{media_type}/week"
            params = {"api_key": api_key, "page": page}
    else:
        url = f"https://api.themoviedb.org/3/discover/{media_type}"
        params = {
            "api_key": api_key,
            "sort_by": sort,
            "page": page,
            "include_adult": str(allow_adult).lower(),
            "vote_count.gte": 100,
        }

        if year:
            if media_type == "movie":
                params["primary_release_date.gte"] = f"{year}-01-01"
                params["primary_release_date.lte"] = f"{year}-12-31"
            elif media_type == "tv":
                params["first_air_date.gte"] = f"{year}-01-01"
                params["first_air_date.lte"] = f"{year}-12-31"
        
        if genre:
            params["with_genres"] = genre

    if '/trending/' not in url:
        params['include_adult'] = str(allow_adult).lower()

    try:
        response = ApiClient('tmdb').get(url, params=params)
        if response.status_code != 200:
            return []

        data = response.json()
        raw_results = data.get("results", [])
        require_api_data(isinstance(data.get('results'), list), 'tmdb')
        
        # Pagination follows the raw page, not the number left after filtering.
        has_more = bool(raw_results)
        if not allow_adult:
            raw_results = [item for item in raw_results if not item.get('adult', False)]
        if not raw_results:
            return {'results': [], 'hasMore': has_more}

        results =[]

        # --- Fetch Next Episode Data for TV Shows Concurrently ---
        next_ep_data_map = {}
        if media_type == "tv":
            def fetch_tv_details(tv_id):
                try:
                    detail_url = f"https://api.themoviedb.org/3/tv/{tv_id}"
                    # We only need basic details, no append_to_response needed to keep it lightning fast
                    resp = ApiClient('tmdb').get(detail_url, params={"api_key": api_key}, timeout=3)
                    if resp.status_code == 200:
                        return tv_id, resp.json().get("next_episode_to_air")
                except ApiError:
                    raise
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

        return {'results': results, 'hasMore': has_more}
    except ApiError:
        raise
    except Exception as e:
        raise ApiError('tmdb') from e


def update_tmdb_seasons(media_item):
    """
    Check if the TMDB TV series has new seasons.
    If so, update the MediaItem and set a notification.
    """
    if media_item.media_type != "tv" or media_item.source != "tmdb":
        return False  # Skip if not a TMDB TV show

    tmdb_id = str(media_item.provider_ids.get("tmdb", ""))
    if tmdb_id.startswith("custom_"):
        media_item.last_updated = timezone.now()
        media_item.save()
        return False

    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        print("TMDB API key not found.")
        return False

    url = f"https://api.themoviedb.org/3/tv/{media_item.source_id}"
    params = {"api_key": api_key}

    try:
        response = ApiClient('tmdb').get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
    except (RequestException, ApiError) as e:
        print(f"TMDB update skipped for {media_item.title} — no connection or error: {e}")
        media_item.last_updated = timezone.now()
        media_item.save()
        return False
    except Exception as e:
        print(f"Unexpected error while updating {media_item.title}: {e}")
        media_item.last_updated = timezone.now()
        media_item.save()
        return False

    episode_runtime = tmdb_episode_runtime(data)
    if episode_runtime is not None:
        media_item.episode_runtime = episode_runtime

    fetched_seasons = data.get("seasons", [])

    # Compare with existing
    existing_seasons = media_item.seasons or []
    existing_numbers = {s["season_number"] for s in existing_seasons}

    new_seasons = []
    cache_bust = int(time.time() * 1000)
    
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
                full_url, f"seasons/tmdb_tv_{media_item.source_id}_s{season_number}_{cache_bust}.jpg"
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
