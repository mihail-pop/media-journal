from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from django.core.files.storage import default_storage
from django.conf import settings
from django.http import JsonResponse
from core.models import APIKey, MediaItem
from core.services.m_anime_manga import get_anime_extra_info, get_manga_extra_info
from core.services.m_games import get_game_extra_info
from core.services.m_movies_tvshows import get_movie_extra_info, get_tv_extra_info
from core.services.m_music import get_music_extra_info
from core.services.g_utils import download_image
import time
import json
import requests
import logging
import os
import glob

logger = logging.getLogger(__name__)

@ensure_csrf_cookie
@require_POST
def upload_banner(request):
    uploaded_file = request.FILES.get("banner")
    source = request.POST.get("source")
    source_id = request.POST.get("id")

    if not uploaded_file or not source or not source_id:
        return JsonResponse({"error": "Missing required data."}, status=400)

    ext = os.path.splitext(uploaded_file.name)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        return JsonResponse({"error": "Unsupported file type."}, status=400)

    banner_dir = os.path.join(settings.MEDIA_ROOT, "banners")
    os.makedirs(banner_dir, exist_ok=True)

    # Generate cache-busting filename
    timestamp = int(time.time() * 1000)
    media_type = request.POST.get("media_type", "")
    if media_type and source in ["tmdb", "mal"]:
        base_name = f"{source}_{media_type}_{source_id}_{timestamp}"
    else:
        base_name = f"{source}_{source_id}_{timestamp}"
    new_path = os.path.join(banner_dir, base_name + ext)

    # Remove any old banner files for this source/source_id
    for old_file in glob.glob(os.path.join(banner_dir, f"{source}_*")):
        if os.path.isfile(old_file):
            filename = os.path.splitext(os.path.basename(old_file))[0]
            # For tmdb/mal: match source_mediatype_id or source_mediatype_id_timestamp
            if media_type and source in ["tmdb", "mal"]:
                if (
                    filename == f"{source}_{media_type}_{source_id}"
                    or filename.startswith(f"{source}_{media_type}_{source_id}_")
                ):
                    os.remove(old_file)
            # For others: match source_id or source_id_timestamp
            else:
                if filename == f"{source}_{source_id}" or filename.startswith(
                    f"{source}_{source_id}_"
                ):
                    os.remove(old_file)

    # Save the new file
    with open(new_path, "wb+") as destination:
        for chunk in uploaded_file.chunks():
            destination.write(chunk)

    relative_url = f"/media/banners/{base_name}{ext}"

    # Update MediaItem
    try:
        item = MediaItem.objects.get(source=source, source_id=source_id)
        item.banner_url = relative_url
        item.save(update_fields=["banner_url"])
    except MediaItem.DoesNotExist:
        pass

    return JsonResponse({"success": True, "url": relative_url})


@ensure_csrf_cookie
@require_POST
def upload_cover(request):
    uploaded_file = request.FILES.get("cover")
    source = request.POST.get("source")
    source_id = request.POST.get("id")

    if not uploaded_file or not source or not source_id:
        return JsonResponse({"error": "Missing required data."}, status=400)

    ext = os.path.splitext(uploaded_file.name)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        return JsonResponse({"error": "Unsupported file type."}, status=400)

    poster_dir = os.path.join(settings.MEDIA_ROOT, "posters")
    os.makedirs(poster_dir, exist_ok=True)

    # Generate cache-busting filename
    timestamp = int(time.time() * 1000)
    media_type = request.POST.get("media_type", "")
    if media_type and source in ["tmdb", "mal"]:
        base_name = f"{source}_{media_type}_{source_id}_{timestamp}"
    else:
        base_name = f"{source}_{source_id}_{timestamp}"
    new_path = os.path.join(poster_dir, base_name + ext)

    # Remove old cover files for this source/source_id
    for old_file in glob.glob(os.path.join(poster_dir, f"{source}_*")):
        if os.path.isfile(old_file):
            filename = os.path.splitext(os.path.basename(old_file))[0]
            # For tmdb/mal: match source_mediatype_id or source_mediatype_id_timestamp
            if media_type and source in ["tmdb", "mal"]:
                if (
                    filename == f"{source}_{media_type}_{source_id}"
                    or filename.startswith(f"{source}_{media_type}_{source_id}_")
                ):
                    os.remove(old_file)
            # For others: match source_id or source_id_timestamp
            else:
                if filename == f"{source}_{source_id}" or filename.startswith(
                    f"{source}_{source_id}_"
                ):
                    os.remove(old_file)

    # Save the new file
    with open(new_path, "wb+") as destination:
        for chunk in uploaded_file.chunks():
            destination.write(chunk)

    relative_url = f"/media/posters/{base_name}{ext}"

    # Update MediaItem
    try:
        item = MediaItem.objects.get(source=source, source_id=source_id)
        item.cover_url = relative_url
        item.save(update_fields=["cover_url"])
    except MediaItem.DoesNotExist:
        pass

    return JsonResponse({"success": True, "url": relative_url})

# Delete, Swap, Add actions
@ensure_csrf_cookie
def upload_game_screenshots(request):
    if request.method != "POST":
        return JsonResponse(
            {"success": False, "message": "Invalid request method."}, status=400
        )

    igdb_id = request.POST.get("igdb_id")
    if not igdb_id:
        return JsonResponse(
            {"success": False, "message": "Missing igdb_id."}, status=400
        )

    try:
        media_item = MediaItem.objects.get(
            media_type="game", source="igdb", source_id=str(igdb_id)
        )
    except MediaItem.DoesNotExist:
        return JsonResponse(
            {"success": False, "message": "Game not found."}, status=404
        )

    action = request.headers.get("X-Action", "replace")  # default to replace

    def generate_unique_filename(index, ext):
        timestamp = int(time.time() * 1000)
        return f"screenshots/igdb_{igdb_id}_{index}_{timestamp}{ext}"

    # DELETE action
    if action == "delete":
        screenshot_url = request.POST.get("screenshot_url")
        if not screenshot_url:
            return JsonResponse(
                {"success": False, "message": "Missing screenshot_url."}, status=400
            )

        screenshots = media_item.screenshots or []
        new_screenshots = [s for s in screenshots if s.get("url") != screenshot_url]

        # Remove actual file from disk
        filename = screenshot_url.replace("/media/", "")
        file_path = os.path.join(settings.MEDIA_ROOT, filename)
        if os.path.exists(file_path):
            os.remove(file_path)

        media_item.screenshots = new_screenshots
        media_item.save()
        return JsonResponse(
            {
                "success": True,
                "message": "Screenshot deleted.",
                "screenshots": new_screenshots,
            }
        )

    # ADD / REPLACE actions
    files = request.FILES.getlist("screenshots[]")
    if not files:
        return JsonResponse(
            {"success": False, "message": "No files uploaded."}, status=400
        )

    if action == "replace":
        # Remove old screenshots from disk
        pattern = os.path.join(settings.MEDIA_ROOT, f"screenshots/igdb_{igdb_id}_*.*")
        for path in glob.glob(pattern):
            os.remove(path)
        start_index = 1
        old_screenshots = []

    elif action == "add":
        old_screenshots = media_item.screenshots or []

        # Find the highest index in existing screenshots to avoid collisions
        max_index = 0
        prefix = f"igdb_{igdb_id}_"

        for s in old_screenshots:
            try:
                url = s.get("url", "")
                filename = url.split("/")[-1]
                if filename.startswith(prefix):
                    # Format: igdb_{id}_{index}_{timestamp}.ext OR igdb_{id}_{index}.ext
                    suffix = filename[len(prefix) :]
                    name_body = os.path.splitext(suffix)[0]
                    parts = name_body.split("_")
                    if len(parts) >= 1 and parts[0].isdigit():
                        idx = int(parts[0])
                        if idx > max_index:
                            max_index = idx
            except (ValueError, IndexError, AttributeError):
                continue

        start_index = max_index + 1

    else:
        return JsonResponse(
            {"success": False, "message": "Invalid action."}, status=400
        )

    new_screenshots = list(old_screenshots)
    for i, file in enumerate(files, start=start_index):
        ext = os.path.splitext(file.name)[1].lower()
        if ext not in [".jpg", ".jpeg", ".png"]:
            continue
        filename = generate_unique_filename(i, ext)
        default_storage.save(filename, file)
        url = f"/media/{filename}"
        new_screenshots.append({"url": url, "is_full_url": False})

    media_item.screenshots = new_screenshots
    media_item.save()

    return JsonResponse(
        {
            "success": True,
            "message": "Screenshots updated.",
            "screenshots": new_screenshots,
        }
    )

@ensure_csrf_cookie
@require_GET
def load_more_cast(request):
    source = request.GET.get("source")
    source_id = request.GET.get("source_id")
    media_type = request.GET.get("media_type")
    page = int(request.GET.get("page", 1))

    if not all([source, source_id, media_type]):
        return JsonResponse({"error": "Missing parameters"}, status=400)

    try:
        if source == "tmdb":
            api_key = APIKey.objects.get(name="tmdb").key_1
            if media_type == "tv":
                url = f"https://api.themoviedb.org/3/tv/{source_id}/aggregate_credits"
            else:
                url = f"https://api.themoviedb.org/3/movie/{source_id}/credits"

            response = requests.get(url, params={"api_key": api_key})
            if response.status_code != 200:
                return JsonResponse({"error": "Failed to fetch cast"}, status=500)

            data = response.json()
            all_cast = data.get("cast", [])

            # Paginate: page 1 = next 24 after first 8, page 2+ = 32 each
            if page == 1:
                start_idx = 8
                end_idx = 32
            else:
                start_idx = 32 + (page - 2) * 32
                end_idx = start_idx + 32
            cast_page = all_cast[start_idx:end_idx]

            cast_data = []
            for actor in cast_page:
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
                        "id": actor.get("id"),
                        "is_full_url": True,
                    }
                )

            has_more = end_idx < len(all_cast)

        elif source == "mal":
            # For anime/manga, use AniList API
            query = """
            query ($id: Int, $type: MediaType, $page: Int) {
              Media(idMal: $id, type: $type) {
                characters(sort: [ROLE, RELEVANCE], page: $page, perPage: 25) {
                  pageInfo {
                    hasNextPage
                  }
                  nodes {
                    id
                    name {
                      full
                    }
                    image {
                      large
                    }
                  }
                }
              }
            }
            """

            # For AniList: page 1 gets remaining 17 from first page, page 2+ gets full pages
            if page == 1:
                anilist_page = 1
            else:
                anilist_page = page

            variables = {
                "id": int(source_id),
                "type": media_type.upper(),
                "page": anilist_page,
            }

            response = requests.post(
                "https://graphql.anilist.co",
                json={"query": query, "variables": variables},
                headers={"Content-Type": "application/json"},
            )

            if response.status_code != 200:
                return JsonResponse({"error": "Failed to fetch characters"}, status=500)

            data = response.json()
            characters_data = (
                data.get("data", {}).get("Media", {}).get("characters", {})
            )
            characters = characters_data.get("nodes", [])
            has_more = characters_data.get("pageInfo", {}).get("hasNextPage", False)

            cast_data = []
            # For page 1, skip first 8 characters (already shown)
            start_idx = 8 if page == 1 else 0
            for char in characters[start_idx:]:
                cast_data.append(
                    {
                        "name": char.get("name", {}).get("full", ""),
                        "character": "Character",
                        "profile_path": char.get("image", {}).get("large", ""),
                        "id": char.get("id"),
                        "is_full_url": True,
                    }
                )

        else:
            return JsonResponse({"error": "Unsupported source"}, status=400)

        return JsonResponse({"cast": cast_data, "has_more": has_more, "page": page})

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

@require_POST
def add_music_video(request):
    try:
        data = json.loads(request.body)
        source_id = data.get("source_id")
        url = data.get("url")

        if not source_id or not url:
            return JsonResponse({"success": False, "error": "Missing data"})

        # Validate YouTube URL
        if "youtube.com/watch?v=" not in url and "youtu.be/" not in url:
            return JsonResponse({"success": False, "error": "Invalid YouTube URL"})

        # Normalize URL to standard format
        if "youtu.be/" in url:
            video_id = url.split("youtu.be/")[1].split("?")[0]
            url = f"https://www.youtube.com/watch?v={video_id}"

        item = MediaItem.objects.get(source_id=source_id, media_type="music")

        # Get current screenshots/youtube_links
        screenshots = item.screenshots or []

        # Find next position
        max_position = 0
        if screenshots:
            max_position = max([link.get("position", 0) for link in screenshots])

        new_position = max_position + 1

        # Add new video
        screenshots.append({"url": url, "position": new_position})

        item.screenshots = screenshots
        item.save()

        return JsonResponse({"success": True})
    except MediaItem.DoesNotExist:
        return JsonResponse({"success": False, "error": "Item not found"})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)})


@require_POST
def delete_music_video(request):
    try:
        data = json.loads(request.body)
        source_id = data.get("source_id")
        position = data.get("position")

        if not source_id or position is None:
            return JsonResponse({"success": False, "error": "Missing data"})

        item = MediaItem.objects.get(source_id=source_id, media_type="music")

        # Get current screenshots/youtube_links
        screenshots = item.screenshots or []

        # Remove the video at the specified position
        screenshots = [link for link in screenshots if link.get("position") != position]

        # Reorder positions
        screenshots.sort(key=lambda x: x.get("position", 0))
        for i, link in enumerate(screenshots, start=1):
            link["position"] = i

        item.screenshots = screenshots
        item.save()

        return JsonResponse({"success": True})
    except MediaItem.DoesNotExist:
        return JsonResponse({"success": False, "error": "Item not found"})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)})

@require_GET
def favorite_music_videos(request):
    try:
        # Get all favorited music items
        mode = request.GET.get("mode", "favorites")
        status = request.GET.get("status", "all")

        if mode == "all":
            music_items = MediaItem.objects.filter(media_type="music")
        elif mode == "status":
            if status == "all":
                music_items = MediaItem.objects.filter(media_type="music")
            else:
                music_items = MediaItem.objects.filter(
                    media_type="music", status=status
                )
        else:
            music_items = MediaItem.objects.filter(media_type="music", favorite=True)

        videos = []
        for item in music_items:
            if item.screenshots:
                for link in item.screenshots:
                    if link.get("position") != 1:
                        continue
                    url = link.get("url", "")
                    if "youtube.com/watch?v=" in url:
                        video_id = url.split("watch?v=")[1].split("&")[0]
                        videos.append(
                            {
                                "video_id": video_id,
                                "item_id": item.id,
                                "is_favorite": item.favorite,
                                "source_id": item.source_id,
                            }
                        )

        return JsonResponse({"videos": videos})
    except Exception as e:
        return JsonResponse({"videos": [], "error": str(e)})

@ensure_csrf_cookie
@require_POST
def reorder_music_videos(request):
    try:
        data = json.loads(request.body)
        source_id = data.get("source_id")
        new_order = data.get("order")  # List of positions in new order

        item = MediaItem.objects.get(source="musicbrainz", source_id=source_id)
        youtube_links = item.screenshots or []

        # Reorder based on new_order list
        reordered = []
        for new_pos, old_pos in enumerate(new_order, start=1):
            for link in youtube_links:
                if link.get("position") == old_pos:
                    link["position"] = new_pos
                    reordered.append(link)
                    break

        item.screenshots = reordered
        item.save()

        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@ensure_csrf_cookie
@require_POST
def set_video_as_cover(request):
    try:
        data = json.loads(request.body)
        source_id = data.get("source_id")
        position = data.get("position")

        item = MediaItem.objects.get(source="musicbrainz", source_id=source_id)
        youtube_links = item.screenshots or []

        # Find video at position
        video_url = None
        for link in youtube_links:
            if link.get("position") == position:
                video_url = link.get("url")
                break

        if not video_url or "youtube.com/watch?v=" not in video_url:
            return JsonResponse({"error": "Video not found"}, status=404)

        # Extract video ID and get thumbnail
        video_id = video_url.split("v=")[1].split("&")[0]
        max_res_url = f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"

        try:
            img_check = requests.head(max_res_url, timeout=3)
            if (
                img_check.status_code == 200
                and int(img_check.headers.get("content-length", 0)) > 5000
            ):
                thumbnail_url = max_res_url
            else:
                thumbnail_url = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
        except Exception:
            thumbnail_url = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"

        # Download and save
        cache_bust = int(time.time() * 1000)
        local_poster = download_image(
            thumbnail_url, f"posters/musicbrainz_{source_id}_{cache_bust}.jpg"
        )
        local_banner = download_image(
            thumbnail_url, f"banners/musicbrainz_{source_id}_{cache_bust}.jpg"
        )

        item.cover_url = local_poster
        item.banner_url = local_banner
        item.save()

        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

def get_extra_info(request):
    media_type = request.GET.get("media_type")
    item_id = request.GET.get("item_id")

    if not media_type or not item_id:
        return JsonResponse({"error": "Missing parameters"}, status=400)

    if media_type != "music":
        try:
            item_id = int(item_id)
        except ValueError:
            return JsonResponse({"error": "Invalid item_id"}, status=400)

    if media_type == "movie":
        data = get_movie_extra_info(item_id)
    elif media_type == "tv":
        data = get_tv_extra_info(item_id)
    elif media_type == "anime":
        data = get_anime_extra_info(item_id)
    elif media_type == "manga":
        data = get_manga_extra_info(item_id)
    elif media_type == "game":
        data = get_game_extra_info(item_id)
    elif media_type == "music":
        artist_id = request.GET.get("artist_id", "")
        album_id = request.GET.get("album_id", "")
        data = get_music_extra_info(item_id, artist_id, album_id)
    else:
        data = {}

    return JsonResponse(data)

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
