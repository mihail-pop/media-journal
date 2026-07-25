import os
import json
import time

import requests
from django.conf import settings
from django.http import JsonResponse
from django.core.files.storage import default_storage
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST

from core.models import MediaItem
from core.services.g_utils import download_image, get_sharded_path
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
    media_type = request.POST.get("media_type", "")

    if not uploaded_file or not source or not source_id:
        return JsonResponse({"error": "Missing required data."}, status=400)

    ext = os.path.splitext(uploaded_file.name)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        return JsonResponse({"error": "Unsupported file type."}, status=400)

    # Get MediaItem
    try:
        lookup_key = f"provider_ids__{source}"
        if media_type and source in ["tmdb", "mal", "anilist"]:
            item = MediaItem.objects.get(**{lookup_key: str(source_id)}, media_type=media_type)
        else:
            item = MediaItem.objects.get(**{lookup_key: str(source_id)})
        
        if item.banner_url:
            old_file_path = os.path.join(settings.MEDIA_ROOT, item.banner_url.replace("/media/", ""))
            if os.path.exists(old_file_path):
                os.remove(old_file_path)
    except MediaItem.DoesNotExist:
        return JsonResponse({"error": "Item not found."}, status=404)

    timestamp = int(time.time() * 1000)
    if media_type and source in ["tmdb", "mal", "anilist"]:
        base_name = f"{source}_{media_type}_{source_id}_{timestamp}"
    else:
        base_name = f"{source}_{source_id}_{timestamp}"
        
    flat_relative_path = f"banners/{base_name}{ext}"
    sharded_relative_path = get_sharded_path(flat_relative_path)
    new_path = os.path.join(settings.MEDIA_ROOT, sharded_relative_path)
    
    os.makedirs(os.path.dirname(new_path), exist_ok=True)

    with open(new_path, "wb+") as destination:
        for chunk in uploaded_file.chunks():
            destination.write(chunk)

    relative_url = f"{settings.MEDIA_URL}{sharded_relative_path}"
    item.banner_url = relative_url
    item.save(update_fields=["banner_url"])

    return JsonResponse({"success": True, "url": relative_url})


@ensure_csrf_cookie
@require_POST
def upload_cover(request):
    uploaded_file = request.FILES.get("cover")
    source = request.POST.get("source")
    source_id = request.POST.get("id")
    media_type = request.POST.get("media_type", "")

    if not uploaded_file or not source or not source_id:
        return JsonResponse({"error": "Missing required data."}, status=400)

    ext = os.path.splitext(uploaded_file.name)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        return JsonResponse({"error": "Unsupported file type."}, status=400)

    # Get MediaItem
    try:
        lookup_key = f"provider_ids__{source}"
        if media_type and source in ["tmdb", "mal", "anilist"]:
            item = MediaItem.objects.get(**{lookup_key: str(source_id)}, media_type=media_type)
        else:
            item = MediaItem.objects.get(**{lookup_key: str(source_id)})
        
        if item.cover_url:
            old_file_path = os.path.join(settings.MEDIA_ROOT, item.cover_url.replace("/media/", ""))
            if os.path.exists(old_file_path):
                os.remove(old_file_path)
    except MediaItem.DoesNotExist:
        return JsonResponse({"error": "Item not found."}, status=404)

    timestamp = int(time.time() * 1000)
    if media_type and source in ["tmdb", "mal", "anilist"]:
        base_name = f"{source}_{media_type}_{source_id}_{timestamp}"
    else:
        base_name = f"{source}_{source_id}_{timestamp}"
        
    flat_relative_path = f"posters/{base_name}{ext}"
    sharded_relative_path = get_sharded_path(flat_relative_path)
    new_path = os.path.join(settings.MEDIA_ROOT, sharded_relative_path)
    
    os.makedirs(os.path.dirname(new_path), exist_ok=True)

    with open(new_path, "wb+") as destination:
        for chunk in uploaded_file.chunks():
            destination.write(chunk)

    relative_url = f"{settings.MEDIA_URL}{sharded_relative_path}"
    item.cover_url = relative_url
    item.save(update_fields=["cover_url"])

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
        flat_path = f"screenshots/igdb_{igdb_id}_{index}_{timestamp}{ext}"
        return get_sharded_path(flat_path)

    # DELETE action
    if action == "delete":
        screenshot_url = request.POST.get("screenshot_url")
        if not screenshot_url:
            return JsonResponse(
                {"success": False, "message": "Missing screenshot_url."}, status=400
            )

        # Remove actual file from disk
        filename = screenshot_url.replace(settings.MEDIA_URL, "")
        file_path = os.path.join(settings.MEDIA_ROOT, filename)
        if os.path.exists(file_path):
            os.remove(file_path)

        from core.models import Screenshot
        Screenshot.objects.filter(item=media_item, url=screenshot_url).delete()

        # Return updated list from DB
        return_screenshots = [{"url": s.url, "is_full_url": s.is_full_url} for s in media_item.game_screenshots.all()]
        return JsonResponse(
            {
                "success": True,
                "message": "Screenshot deleted.",
                "screenshots": return_screenshots,
            }
        )

    # ADD / REPLACE actions
    files = request.FILES.getlist("screenshots[]")
    if not files:
        return JsonResponse(
            {"success": False, "message": "No files uploaded."}, status=400
        )

    if action == "replace":
        from core.models import Screenshot
        # Safely remove old files using DB
        for s in media_item.game_screenshots.all():
            if s.url:
                file_path = os.path.join(settings.MEDIA_ROOT, s.url.replace(settings.MEDIA_URL, ""))
                if os.path.exists(file_path):
                    os.remove(file_path)
                    
        media_item.game_screenshots.all().delete()
        media_item.screenshots = []
        start_index = 1
        old_screenshots = []

    elif action == "add":
        from django.db.models import Max
        old_screenshots = media_item.screenshots or []
        
        # Get highest position from DB to avoid collisions
        max_pos = media_item.game_screenshots.aggregate(Max('position'))['position__max']
        start_index = (max_pos or 0) + 1

    else:
        return JsonResponse(
            {"success": False, "message": "Invalid action."}, status=400
        )

    from core.models import Screenshot
    screenshot_objs = []

    for i, file in enumerate(files, start=start_index):
        ext = os.path.splitext(file.name)[1].lower()
        if ext not in [".jpg", ".jpeg", ".png"]:
            continue
        filename = generate_unique_filename(i, ext)
        default_storage.save(filename, file)
        url = f"/media/{filename}"
        screenshot_objs.append(Screenshot(item=media_item, url=url, is_full_url=False, position=i))

    Screenshot.objects.bulk_create(screenshot_objs)
    
    return_screenshots = [{"url": s.url, "is_full_url": s.is_full_url} for s in media_item.game_screenshots.all()]

    return JsonResponse(
        {
            "success": True,
            "message": "Screenshots updated.",
            "screenshots": return_screenshots,
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

        from core.models import MusicVideo
        MusicVideo.objects.create(item=item, url=url, position=new_position)

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

        from core.models import MusicVideo
        MusicVideo.objects.filter(item=item, position=position).delete()
        
        # Reorder remaining DB objects
        remaining = list(item.music_videos.all().order_by('position'))
        for i, video in enumerate(remaining, start=1):
            video.position = i
            video.save(update_fields=['position'])

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
        
        from core.models import MusicVideo
        videos = list(item.music_videos.all())
        
        # Reorder DB based on new_order list
        for new_pos, old_pos in enumerate(new_order, start=1):
            for video in videos:
                if video.position == old_pos:
                    video.position = new_pos
                    video.save(update_fields=['position'])
                    break

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
        
        from core.models import MusicVideo
        video = item.music_videos.filter(position=position).first()

        if not video or "youtube.com/watch?v=" not in video.url:
            return JsonResponse({"error": "Video not found"}, status=404)
            
        video_url = video.url

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

        # Delete old cover file if it exists
        if item.cover_url:
            old_file_path = os.path.join(settings.MEDIA_ROOT, item.cover_url.replace("/media/", ""))
            if os.path.exists(old_file_path):
                os.remove(old_file_path)

        # Delete old banner file if it exists
        if item.banner_url:
            old_file_path = os.path.join(settings.MEDIA_ROOT, item.banner_url.replace("/media/", ""))
            if os.path.exists(old_file_path):
                os.remove(old_file_path)

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
