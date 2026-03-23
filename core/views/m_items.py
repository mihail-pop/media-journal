import os
import json
import datetime
import datetime as dt

from django.apps import apps
from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from core.models import MediaItem
from core.services.g_utils import display_to_rating, rating_to_display
from core.services.m_books import save_openlib_item
from core.services.m_games import save_igdb_item
from core.services.m_music import save_musicbrainz_item
from core.services.m_anime_manga import save_anilist_item
from core.services.m_movies_tvshows import save_tmdb_item, save_tmdb_season


@ensure_csrf_cookie
@require_POST
def add_to_list(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    required_fields = ["source", "source_id", "media_type"]
    if not all(data.get(field) for field in required_fields):
        return JsonResponse({"error": "Missing required fields"}, status=400)

    source = data["source"]
    source_id = str(data["source_id"])
    media_type = data["media_type"]

    lookup_key = f"provider_ids__{source}"

    # Prevent duplicate entries
    if MediaItem.objects.filter(
        media_type=media_type,
        **{lookup_key: source_id}
    ).exists():
        return JsonResponse({"error": "Item already in list"}, status=400)

    # Route to the correct handler (TMDB, MAL, IGDB, etc.)
    if source == "tmdb":
        return save_tmdb_item(media_type, source_id)

    if source in ["anilist", "mal"]:
        return save_anilist_item(
            media_type, 
            anilist_id=source_id if source == "anilist" else None,
            mal_id=source_id if source == "mal" else None
        )

    if source == "igdb":
        return save_igdb_item(source_id)

    if source == "openlib":
        return save_openlib_item(source_id)

    if source == "musicbrainz":
        return save_musicbrainz_item(source_id)

    return JsonResponse({"error": "Unsupported source"}, status=400)


@ensure_csrf_cookie
@require_POST
def add_season_to_list(request):
    try:
        data = json.loads(request.body)
        tmdb_id = data.get("tmdb_id")
        season_number = data.get("season_number")

        if not tmdb_id or season_number is None:
            return JsonResponse(
                {"error": "Missing tmdb_id or season_number"}, status=400
            )

        return save_tmdb_season(tmdb_id, season_number)

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@ensure_csrf_cookie
def edit_item(request, item_id):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            item = MediaItem.objects.get(id=item_id)

            old_status = item.status

            # Update totals if present
            if "total_main" in data and data["total_main"] not in [None, ""]:
                item.total_main = int(data["total_main"])
            if "total_secondary" in data and data["total_secondary"] not in [None, ""]:
                item.total_secondary = int(data["total_secondary"])

            # Always define new_status to avoid UnboundLocalError
            new_status = old_status

            # Update status if present
            if "status" in data and data["status"] != "":
                new_status = data["status"]
                item.status = new_status

            # --- Handle date_added ---
            status_changed = new_status != old_status
            user_date = data.get("date_added")

            if user_date:
                try:
                    year, month, day = map(int, user_date.split("-"))
                    user_date_obj = datetime.date(year, month, day)
                    current_date = item.date_added.date() if item.date_added else None

                    if current_date and current_date != user_date_obj:
                        # User changed date - set to current time on that date
                        now = dt.datetime.now()
                        item.date_added = dt.datetime.combine(user_date_obj, now.time())
                    elif status_changed:
                        item.date_added = dt.datetime.now()
                except Exception:
                    if status_changed:
                        item.date_added = dt.datetime.now()
            elif status_changed:
                item.date_added = dt.datetime.now()

            # Update progress fields if present (manual input)
            if "progress_main" in data:
                if data["progress_main"] in [None, ""]:
                    item.progress_main = 0
                else:
                    progress_main = int(data["progress_main"])
                    if item.media_type != "book" and item.total_main is not None and progress_main > item.total_main:
                        progress_main = item.total_main
                    item.progress_main = progress_main

            if "progress_secondary" in data:
                if data["progress_secondary"] in [None, ""]:
                    item.progress_secondary = 0
                else:
                    progress_secondary = int(data["progress_secondary"])
                    if (
                        item.total_secondary is not None
                        and progress_secondary > item.total_secondary
                    ):
                        progress_secondary = item.total_secondary
                    item.progress_secondary = progress_secondary

            # If status changed TO "completed", override progress with totals
            if old_status != "completed" and new_status == "completed":
                if item.total_main is not None and item.progress_main < item.total_main:
                    item.progress_main = item.total_main
                if item.total_secondary is not None:
                    item.progress_secondary = item.total_secondary

            if "repeats" in data:
                try:
                    item.repeats = max(0, int(data["repeats"]))
                except (ValueError, TypeError):
                    item.repeats = 0

            if "personal_rating" in data:
                # Get current rating mode (try to get from AppSettings, fallback to 'faces')
                AppSettings = apps.get_model("core", "AppSettings")
                try:
                    app_settings = AppSettings.objects.first()
                    rating_mode = app_settings.rating_mode if app_settings else "faces"
                except Exception:
                    rating_mode = "faces"

                display_value = data["personal_rating"]
                if display_value in [None, "", "null"]:
                    item.personal_rating = None
                else:
                    try:
                        display_value_int = int(display_value)
                    except ValueError:
                        display_value_int = None

                    if display_value_int is None:
                        item.personal_rating = None
                    else:
                        item.personal_rating = display_to_rating(
                            display_value_int, rating_mode
                        )

            if "notes" in data:
                item.notes = data["notes"]

            if "favorite" in data:
                item.favorite = data["favorite"] in ["true", "on", True]

            item.save()

            # Build a minimal serialized item to return to the client for UI updates
            AppSettings = apps.get_model("core", "AppSettings")
            try:
                settings = AppSettings.objects.first()
                rating_mode = settings.rating_mode if settings else "faces"
            except Exception:
                rating_mode = "faces"

            display_rating = rating_to_display(item.personal_rating, rating_mode)

            return JsonResponse(
                {
                    "success": True,
                    "item": {
                        "id": item.id,
                        "title": item.title,
                        "media_type": item.media_type,
                        "source_id": item.source_id,
                        "status": item.status,
                        "personal_rating": display_rating,
                        "notes": item.notes,
                        "progress_main": item.progress_main
                        if item.progress_main
                        else None,
                        "total_main": item.total_main,
                        "progress_secondary": item.progress_secondary,
                        "total_secondary": item.total_secondary,
                        "favorite": item.favorite,
                        "repeats": item.repeats or 0,
                        "date_added": item.date_added.isoformat()
                        if item.date_added
                        else None,
                        "cover_url": getattr(item, "cover_url", None),
                        "banner_url": getattr(item, "banner_url", None),
                    },
                }
            )

        except Exception as e:
            return JsonResponse({"success": False, "error": str(e)})

    return JsonResponse({"success": False, "error": "Invalid request"})


@ensure_csrf_cookie
@require_POST
def delete_item(request, item_id):
    try:
        item = MediaItem.objects.get(id=item_id)

        # --- Delete associated image files if locally stored
        media_root = settings.MEDIA_ROOT
        paths_to_check = []

        if item.cover_url and item.cover_url.startswith("/media/"):
            paths_to_check.append(
                os.path.join(media_root, item.cover_url.replace("/media/", ""))
            )
        if item.banner_url and item.banner_url.startswith("/media/"):
            paths_to_check.append(
                os.path.join(media_root, item.banner_url.replace("/media/", ""))
            )

        # Skip cast processing for music (different structure)
        if item.media_type != "music":
            for i, member in enumerate(item.cast or []):
                p = member.get("profile_path", "")
                if p.startswith("/media/"):
                    paths_to_check.append(
                        os.path.join(media_root, p.replace("/media/", ""))
                    )

        for related in item.related_titles or []:
            p = related.get("poster_path", "")
            if p.startswith("/media/"):
                paths_to_check.append(
                    os.path.join(media_root, p.replace("/media/", ""))
                )

        for season in item.seasons or []:
            p = season.get("poster_path", "")
            if p.startswith("/media/"):
                paths_to_check.append(
                    os.path.join(media_root, p.replace("/media/", ""))
                )

        for shot in item.screenshots or []:
            p = shot.get("url", "")
            if p.startswith("/media/"):
                paths_to_check.append(
                    os.path.join(media_root, p.replace("/media/", ""))
                )

        for episode in item.episodes or []:
            p = episode.get("still_path", "")
            if p.startswith("/media/"):
                paths_to_check.append(
                    os.path.join(media_root, p.replace("/media/", ""))
                )

        for path in paths_to_check:
            try:
                if os.path.exists(path):
                    os.remove(path)
            except Exception:
                pass  # Ignore deletion errors

        # --- Delete the DB entry
        item.delete()
        return JsonResponse({"success": True})

    except MediaItem.DoesNotExist:
        return JsonResponse({"success": False, "error": "Item not found"})
    except Exception as e:
        import traceback

        traceback.print_exc()  # Show full traceback in terminal
        return JsonResponse({"success": False, "error": str(e)})


@ensure_csrf_cookie
@require_POST
def refresh_item(request):
    try:
        data = json.loads(request.body)
        item_id = data.get("id")
        refresh_type = data.get("refresh_type", "all")
        if not item_id:
            return JsonResponse({"error": "Missing item ID."}, status=400)

        # Get the item first
        item = MediaItem.objects.get(id=item_id)

        anilist_id = item.provider_ids.get("anilist")
        mal_id = item.provider_ids.get("mal")

        source = item.source
        source_id = item.source_id
        media_type = item.media_type

        # Save user data
        user_data = {
            "status": item.status,
            "progress_main": item.progress_main,
            "progress_secondary": item.progress_secondary,
            "personal_rating": item.personal_rating,
            "favorite": item.favorite,
            "date_added": item.date_added,
            "repeats": item.repeats,
            "notes": item.notes,
            "screenshots": item.screenshots,
            "favorite_position": item.favorite_position,
        }

        # Backup images based on refresh_type
        banner_backup = None
        cover_backup = None

        if refresh_type in ["data", "cover"]:
            if item.banner_url and item.banner_url.startswith("/media/"):
                file_path = os.path.join(
                    settings.MEDIA_ROOT, item.banner_url.replace("/media/", "")
                )
                if os.path.exists(file_path):
                    with open(file_path, "rb") as f:
                        banner_backup = {"url": item.banner_url, "data": f.read()}

        if refresh_type in ["data", "banner"]:
            if item.cover_url and item.cover_url.startswith("/media/"):
                file_path = os.path.join(
                    settings.MEDIA_ROOT, item.cover_url.replace("/media/", "")
                )
                if os.path.exists(file_path):
                    with open(file_path, "rb") as f:
                        cover_backup = {"url": item.cover_url, "data": f.read()}

        # Backup screenshot files
        screenshot_backups = []
        if item.screenshots:
            for shot in item.screenshots:
                url = shot.get("url", "")
                if url.startswith("/media/"):
                    file_path = os.path.join(
                        settings.MEDIA_ROOT, url.replace("/media/", "")
                    )
                    if os.path.exists(file_path):
                        with open(file_path, "rb") as f:
                            screenshot_backups.append(
                                {
                                    "url": url,
                                    "data": f.read(),
                                    "is_full_url": shot.get("is_full_url", False),
                                }
                            )

        # Delete the existing item
        delete_item(request, item_id)

        # Re-save the item based on its source
        if source == "tmdb":
            if "_s" in source_id:  # It's a season
                tmdb_id, season_number = source_id.split("_s")
                save_tmdb_season(tmdb_id, season_number)
            else:
                save_tmdb_item(media_type, source_id)
        elif source in ["mal", "anilist"]:
            save_anilist_item(
                media_type, 
                anilist_id=anilist_id,
                mal_id=mal_id
            )
        elif source == "igdb":
            save_igdb_item(source_id)
        elif source == "openlib":
            save_openlib_item(source_id)
        elif source == "musicbrainz":
            save_musicbrainz_item(source_id)
        else:
            return JsonResponse({"error": "Unsupported source."}, status=400)

        # Restore user data
        lookup_key = f"provider_ids__{source}"
        new_item = MediaItem.objects.get(
            media_type=media_type,
            **{lookup_key: str(source_id)}
        )
        for field, value in user_data.items():
            setattr(new_item, field, value)

        # Restore backed up images
        if banner_backup:
            file_path = os.path.join(
                settings.MEDIA_ROOT, banner_backup["url"].replace("/media/", "")
            )
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "wb") as f:
                f.write(banner_backup["data"])
            new_item.banner_url = banner_backup["url"]

        if cover_backup:
            file_path = os.path.join(
                settings.MEDIA_ROOT, cover_backup["url"].replace("/media/", "")
            )
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "wb") as f:
                f.write(cover_backup["data"])
            new_item.cover_url = cover_backup["url"]

        # Restore screenshot files
        if screenshot_backups:
            for backup in screenshot_backups:
                file_path = os.path.join(
                    settings.MEDIA_ROOT, backup["url"].replace("/media/", "")
                )
                os.makedirs(os.path.dirname(file_path), exist_ok=True)
                with open(file_path, "wb") as f:
                    f.write(backup["data"])

        new_item.last_updated = timezone.now()
        new_item.save()

        return JsonResponse({"message": "Item refreshed successfully."})

    except MediaItem.DoesNotExist:
        return JsonResponse({"error": "Item not found."}, status=404)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


# API endpoint used by edit modal (g_edit_modal.js, p_history.js, m_lists.js)
# Returns item data from DB to populate the edit form when user clicks edit button
@ensure_csrf_cookie
def get_item(request, item_id):
    try:
        item = MediaItem.objects.get(id=item_id)

        AppSettings = apps.get_model("core", "AppSettings")
        try:
            settings = AppSettings.objects.first()
            rating_mode = settings.rating_mode if settings else "faces"
        except Exception:
            rating_mode = "faces"

        display_rating = rating_to_display(item.personal_rating, rating_mode)

        return JsonResponse(
            {
                "success": True,
                "item": {
                    "id": item.id,
                    "title": item.title,
                    "media_type": item.media_type,
                    "source_id": item.source_id,
                    "status": item.status,
                    "personal_rating": display_rating,
                    "notes": item.notes,
                    "progress_main": item.progress_main if item.progress_main else None,
                    "total_main": item.total_main,
                    "progress_secondary": item.progress_secondary,
                    "total_secondary": item.total_secondary,
                    "favorite": item.favorite,
                    "item_status_choices": MediaItem.STATUS_CHOICES,
                    "rating_mode": rating_mode,
                    "repeats": item.repeats or 0,
                    "date_added": item.date_added.isoformat()
                    if item.date_added
                    else None,
                    "show_date_field": settings.show_date_field,
                    "show_repeats_field": settings.show_repeats_field,
                },
            }
        )
    except MediaItem.DoesNotExist:
        return JsonResponse({"success": False, "error": "Item not found"})


# Youtube Player favorite/unfavorite
@ensure_csrf_cookie
@require_POST
def toggle_music_favorite(request):
    try:
        data = json.loads(request.body)
        item_id = data.get("item_id")
        favorite = data.get("favorite")

        item = MediaItem.objects.get(id=item_id)
        item.favorite = favorite
        item.save()

        return JsonResponse({"success": True})
    except MediaItem.DoesNotExist:
        return JsonResponse({"success": False, "error": "Item not found"}, status=404)
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=500)


# Fetching videos for the youtube player
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
