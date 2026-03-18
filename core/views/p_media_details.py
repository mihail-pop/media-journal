import os
import glob
import json
import time

import requests
from django.conf import settings
from django.http import JsonResponse
from django.core.files.storage import default_storage
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST

from core.models import MediaItem
from core.services.g_utils import download_image
from core.services.m_games import get_game_extra_info
from core.services.m_music import get_music_extra_info
from core.services.m_anime_manga import get_anime_extra_info, get_manga_extra_info
from core.services.m_movies_tvshows import get_tv_extra_info, get_movie_extra_info


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
        lookup_key = f"provider_ids__{source}"
        item = MediaItem.objects.get(**{lookup_key: str(source_id)})
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
        lookup_key = f"provider_ids__{source}"
        item = MediaItem.objects.get(**{lookup_key: str(source_id)})
        item.cover_url = relative_url
        item.save(update_fields=["cover_url"])
    except MediaItem.DoesNotExist:
        pass

    return JsonResponse({"success": True, "url": relative_url})


def get_extra_info(request):
    media_type = request.GET.get("media_type")
    item_id = request.GET.get("item_id")
    source = request.GET.get("source", "mal") # Default to mal for legacy/compatibility

    if not media_type or not item_id:
        return JsonResponse({"error": "Missing parameters"}, status=400)

    if media_type != "music":
        try:
            # We check if it's a valid integer string, but keep it for routing
            int(item_id)
        except ValueError:
            return JsonResponse({"error": "Invalid item_id"}, status=400)

    if media_type == "movie":
        data = get_movie_extra_info(item_id)
    elif media_type == "tv":
        data = get_tv_extra_info(item_id)
    elif media_type == "anime":
        # Check source to decide which parameter to use
        if source == "anilist":
            data = get_anime_extra_info(media_type, anilist_id=item_id)
        else:
            data = get_anime_extra_info(media_type, mal_id=item_id)
    elif media_type == "manga":
        # Check source to decide which parameter to use
        if source == "anilist":
            data = get_manga_extra_info(media_type, anilist_id=item_id)
        else:
            data = get_manga_extra_info(media_type, mal_id=item_id)
    elif media_type == "game":
        data = get_game_extra_info(item_id)
    elif media_type == "music":
        artist_id = request.GET.get("artist_id", "")
        album_id = request.GET.get("album_id", "")
        data = get_music_extra_info(item_id, artist_id, album_id)
    else:
        data = {}

    return JsonResponse(data)


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
            media_type="game", provider_ids__igdb=str(igdb_id)
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
        
        item = MediaItem.objects.get(provider_ids__musicbrainz=str(source_id), media_type="music")

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

        item = MediaItem.objects.get(provider_ids__musicbrainz=str(source_id), media_type="music")

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


@ensure_csrf_cookie
@require_POST
def reorder_music_videos(request):
    try:
        data = json.loads(request.body)
        source_id = data.get("source_id")
        new_order = data.get("order")  # List of positions in new order

        item = MediaItem.objects.get(provider_ids__musicbrainz=str(source_id))
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

        item = MediaItem.objects.get(provider_ids__musicbrainz=str(source_id))
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
