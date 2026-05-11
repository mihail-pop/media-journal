import os
import json
import uuid
import time
import datetime
import datetime as dt

from django.apps import apps
from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from django.core.files.storage import FileSystemStorage
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
@require_POST
def create_custom_item(request):
    try:
        # 1. Base Variables & Normalization
        media_type_raw = request.POST.get("media_type", "movie").lower()
        
        # Map frontend plurals to strict database singulars
        type_map = {
            "movies": "movie",
            "movie": "movie",
            "tvshows": "tv",
            "tv": "tv",
            "anime": "anime",
            "manga": "manga",
            "games": "game",
            "game": "game",
            "books": "book",
            "book": "book",
            "music": "music"
        }
        # Fallback to "movie" if somehow unmatched
        media_type = type_map.get(media_type_raw, "movie")
            
        title = request.POST.get("title", "Untitled")
        
        # Determine strict source mapping for the app
        source_map = {
            "movie": "tmdb",
            "tv": "tmdb",
            "anime": "anilist",
            "manga": "anilist",
            "game": "igdb",
            "book": "openlib",
            "music": "musicbrainz"
        }
        source = source_map.get(media_type, "tmdb")
        
        # 2. Assign Custom ID
        custom_id = f"custom_{uuid.uuid4().hex}"
        provider_ids = {source: custom_id}

        # 3. Handle File Uploads with proper naming
        cache_bust = int(time.time() * 1000)
        fs = FileSystemStorage(location=settings.MEDIA_ROOT)
        
        def save_custom_image(file_obj, image_type):
            if not file_obj:
                return ""
            
            ext = os.path.splitext(file_obj.name)[1] or ".jpg"
            folder = "posters" if image_type == "poster" else "banners"
            
            if source in ["tmdb", "anilist"]:
                filename = f"{folder}/{source}_{media_type}_{custom_id}_{cache_bust}{ext}"
            else:
                filename = f"{folder}/{source}_{custom_id}_{cache_bust}{ext}"
                
            saved_name = fs.save(filename, file_obj)
            return fs.url(saved_name)

        cover_url = save_custom_image(request.FILES.get("cover_image"), "poster")
        banner_url = save_custom_image(request.FILES.get("banner_image"), "banner")

        # 4. Handle Formatting numbers
        def parse_int(val):
            try:
                return int(val)
            except (TypeError, ValueError):
                return None

        personal_rating_input = request.POST.get("personal_rating")
        rating_val = None
        if personal_rating_input:
            AppSettings = apps.get_model("core", "AppSettings")
            try:
                app_settings = AppSettings.objects.first()
                rating_mode = app_settings.rating_mode if app_settings else "faces"
            except Exception:
                rating_mode = "faces"
                
            display_value_int = parse_int(personal_rating_input)
            if display_value_int is not None:
                rating_val = display_to_rating(display_value_int, rating_mode)

        # Handle genres and creators
        genres = request.POST.get("genres", "")
        genres_list =[g.strip() for g in genres.split(",") if g.strip()]
        
        creators = request.POST.get("creators", "")
        creators_list =[c.strip() for c in creators.split(",") if c.strip()]

        total_main = parse_int(request.POST.get("total_main"))
        total_secondary = parse_int(request.POST.get("total_secondary"))
        progress_main = parse_int(request.POST.get("progress_main")) or 0
        progress_secondary = parse_int(request.POST.get("progress_secondary")) or 0

        date_added_input = request.POST.get("date_added", "")
        if date_added_input:
            try:
                date_added = timezone.datetime.strptime(date_added_input, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except ValueError:
                date_added = timezone.now()
        else:
            date_added = timezone.now()

        # 5. Create Item
        new_item = MediaItem.objects.create(
            title=title,
            media_type=media_type, # Now guaranteed to be "movie", "tv", "game", etc.
            source=source,
            provider_ids=provider_ids,
            cover_url=cover_url,
            banner_url=banner_url,
            release_date=request.POST.get("release_date", ""),
            overview=request.POST.get("overview", ""),
            status=request.POST.get("status", "planned"),
            genres=genres_list,
            creators=creators_list,
            
            progress_main=progress_main,
            total_main=total_main,
            progress_secondary=progress_secondary,
            total_secondary=total_secondary,
            
            personal_rating=rating_val,
            favorite=request.POST.get("favorite") in ["true", "on", True],
            notes=request.POST.get("notes", ""),
            date_added=date_added
        )

        # 6. Format Display Rating for frontend
        try:
            settings_obj = apps.get_model("core", "AppSettings").objects.first()
            rating_mode = settings_obj.rating_mode if settings_obj else "faces"
        except Exception:
            rating_mode = "faces"
            
        display_rating = rating_to_display(new_item.personal_rating, rating_mode)

        # 7. Return Data
        return JsonResponse({
            "success": True,
            "item": {
                "id": new_item.id,
                "title": new_item.title,
                "media_type": new_item.media_type,
                "source": new_item.source,
                "source_id": custom_id,
                "status": new_item.status,
                "personal_rating": display_rating,
                "notes": new_item.notes,
                "progress_main": new_item.progress_main,
                "progress_secondary": new_item.progress_secondary,
                "favorite": new_item.favorite,
                "repeats": new_item.repeats,
                "date_added": new_item.date_added.isoformat(),
                "cover_url": new_item.cover_url,
                "banner_url": new_item.banner_url,
            }
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({"success": False, "error": str(e)}, status=400)

@ensure_csrf_cookie
def edit_metadata(request, item_id):
    if request.method == "POST":
        try:
            item = MediaItem.objects.get(id=item_id)

            item.title = request.POST.get("title", item.title)
            item.release_date = request.POST.get("release_date", item.release_date)
            item.overview = request.POST.get("overview", item.overview)

            genres = request.POST.get("genres", "")
            item.genres =[g.strip() for g in genres.split(",") if g.strip()]

            creators = request.POST.get("creators", "")
            item.creators =[c.strip() for c in creators.split(",") if c.strip()]

            def parse_int(val):
                try:
                    return int(val)
                except (TypeError, ValueError):
                    return None

            if "progress_main" in request.POST:
                item.progress_main = parse_int(request.POST.get("progress_main")) or 0
            if "total_main" in request.POST:
                item.total_main = parse_int(request.POST.get("total_main"))
            if "progress_secondary" in request.POST:
                item.progress_secondary = parse_int(request.POST.get("progress_secondary")) or 0
            if "total_secondary" in request.POST:
                item.total_secondary = parse_int(request.POST.get("total_secondary"))

            # Image processing
            fs = FileSystemStorage(location=settings.MEDIA_ROOT)
            cache_bust = int(time.time() * 1000)

            if "cover_image" in request.FILES:
                if item.cover_url and item.cover_url.startswith("/media/"):
                    old_path = os.path.join(settings.MEDIA_ROOT, item.cover_url.replace("/media/", ""))
                    if os.path.exists(old_path):
                        os.remove(old_path)

                file_obj = request.FILES["cover_image"]
                ext = os.path.splitext(file_obj.name)[1] or ".jpg"
                if item.source in ["tmdb", "anilist"]:
                    filename = f"posters/{item.source}_{item.media_type}_{item.source_id}_{cache_bust}{ext}"
                else:
                    filename = f"posters/{item.source}_{item.source_id}_{cache_bust}{ext}"
                saved_name = fs.save(filename, file_obj)
                item.cover_url = fs.url(saved_name)

            if "banner_image" in request.FILES:
                if item.banner_url and item.banner_url.startswith("/media/"):
                    old_path = os.path.join(settings.MEDIA_ROOT, item.banner_url.replace("/media/", ""))
                    if os.path.exists(old_path):
                        os.remove(old_path)

                file_obj = request.FILES["banner_image"]
                ext = os.path.splitext(file_obj.name)[1] or ".jpg"
                if item.source in ["tmdb", "anilist"]:
                    filename = f"banners/{item.source}_{item.media_type}_{item.source_id}_{cache_bust}{ext}"
                else:
                    filename = f"banners/{item.source}_{item.source_id}_{cache_bust}{ext}"
                saved_name = fs.save(filename, file_obj)
                item.banner_url = fs.url(saved_name)

            item.save()
            return JsonResponse({"success": True})
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({"success": False, "error": str(e)})

    return JsonResponse({"success": False, "error": "Invalid request"})

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
                        "source": item.source,
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
        original_provider_ids = dict(item.provider_ids)
        
        source = item.source
        source_id = item.source_id
        media_type = item.media_type

        # 1. Temporarily hide the old item by changing its provider_ids 
        # so the API fetcher doesn't think it's a duplicate and abort.
        item.provider_ids = {source: f"temp_{uuid.uuid4().hex}"}
        item.save(update_fields=['provider_ids'])

        try:
            # 2. Fetch fresh data by triggering the standard save function
            res = None
            if source == "tmdb":
                if "_s" in source_id:  # It's a season
                    tmdb_id, season_number = source_id.split("_s")
                    res = save_tmdb_season(tmdb_id, season_number)
                else:
                    res = save_tmdb_item(media_type, source_id)
            elif source in ["mal", "anilist"]:
                anilist_id = original_provider_ids.get("anilist")
                mal_id = original_provider_ids.get("mal")
                res = save_anilist_item(media_type, anilist_id=anilist_id, mal_id=mal_id)
            elif source == "igdb":
                res = save_igdb_item(source_id)
            elif source == "openlib":
                res = save_openlib_item(source_id)
            elif source == "musicbrainz":
                res = save_musicbrainz_item(source_id)
            else:
                raise Exception("Unsupported source.")
            
            # Check for API failure
            if res and res.status_code != 200:
                error_msg = "Unknown API error"
                try:
                    error_msg = json.loads(res.content).get("error", error_msg)
                except Exception:
                    pass
                raise Exception(error_msg)

            # 3. Find the newly created temporary item holding the fresh data
            lookup_key = f"provider_ids__{source}"
            new_item = MediaItem.objects.get(media_type=media_type, **{lookup_key: str(source_id)})

        except Exception as e:
            # 4a. On API failure, simply revert provider_ids and abort. NO DATA LOST!
            item.provider_ids = original_provider_ids
            item.save(update_fields=['provider_ids'])
            return JsonResponse({"error": f"Failed to refresh: {str(e)}"}, status=500)

        # 4b. On success, securely copy purely API-driven metadata from new_item to old item
        metadata_fields =[
            'title', 'overview', 'release_date', 'cast', 'seasons', 'episodes',
            'related_titles', 'genres', 'creators', 'total_main', 'total_secondary'
        ]
        
        # Mark local metadata images of the OLD item for cleanup (since they are replaced)
        files_to_delete =[]
        if item.media_type != "music":
            for member in (item.cast or[]):
                p = member.get("profile_path", "")
                if p.startswith("/media/"):
                    files_to_delete.append(os.path.join(settings.MEDIA_ROOT, p.replace("/media/", "")))
        for related in (item.related_titles or[]):
            p = related.get("poster_path", "")
            if p.startswith("/media/"):
                files_to_delete.append(os.path.join(settings.MEDIA_ROOT, p.replace("/media/", "")))
        for season in (item.seasons or[]):
            p = season.get("poster_path", "")
            if p.startswith("/media/"):
                files_to_delete.append(os.path.join(settings.MEDIA_ROOT, p.replace("/media/", "")))
        for episode in (item.episodes or[]):
            p = episode.get("still_path", "")
            if p.startswith("/media/"):
                files_to_delete.append(os.path.join(settings.MEDIA_ROOT, p.replace("/media/", "")))

        # Apply the new text-based metadata
        for field in metadata_fields:
            setattr(item, field, getattr(new_item, field))

        # Handle Cover based on refresh_type
        if refresh_type in ['all', 'cover']:
            if item.cover_url and item.cover_url.startswith('/media/'):
                files_to_delete.append(os.path.join(settings.MEDIA_ROOT, item.cover_url.replace('/media/', '')))
            item.cover_url = new_item.cover_url
        else:
            if new_item.cover_url and new_item.cover_url.startswith('/media/'):
                files_to_delete.append(os.path.join(settings.MEDIA_ROOT, new_item.cover_url.replace('/media/', '')))

        # Handle Banner based on refresh_type
        if refresh_type in ['all', 'banner']:
            if item.banner_url and item.banner_url.startswith('/media/'):
                files_to_delete.append(os.path.join(settings.MEDIA_ROOT, item.banner_url.replace('/media/', '')))
            item.banner_url = new_item.banner_url
        else:
            if new_item.banner_url and new_item.banner_url.startswith('/media/'):
                files_to_delete.append(os.path.join(settings.MEDIA_ROOT, new_item.banner_url.replace('/media/', '')))

        # Screenshots are manual, so we ALWAYS keep old screenshots. Mark new ones for deletion.
        if new_item.screenshots:
            for shot in new_item.screenshots:
                url = shot.get("url", "")
                if url.startswith("/media/"):
                    files_to_delete.append(os.path.join(settings.MEDIA_ROOT, url.replace("/media/", "")))

        # Restore original provider ids to put it back in its rightful place
        item.provider_ids = original_provider_ids
        item.last_updated = timezone.now()
        item.save()

        # 5. Delete the temporary new_item container from DB
        new_item.delete()

        # 6. Delete orphaned local files
        for path in files_to_delete:
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass

        return JsonResponse({"message": "Item refreshed successfully."})

    except MediaItem.DoesNotExist:
        return JsonResponse({"error": "Item not found."}, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
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
                    "progress_secondary": item.progress_secondary if item.progress_secondary else None,
                    "total_secondary": item.total_secondary,
                    "favorite": item.favorite,
                    "item_status_choices": MediaItem.STATUS_CHOICES,
                    "rating_mode": rating_mode,
                    "repeats": item.repeats if item.repeats else None,
                    "date_added": item.date_added.isoformat() if item.date_added else None,
                    "show_date_field": settings.show_date_field,
                    "show_repeats_field": settings.show_repeats_field,
                    "cover_url": item.cover_url,
                    "banner_url": item.banner_url,
                    "overview": item.overview,
                    "release_date": item.release_date,
                    "genres": item.genres,
                    "creators": item.creators,
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
