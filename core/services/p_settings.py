import os
import glob
import time
import uuid
import logging
import zipfile
import tempfile
import threading
from datetime import datetime

from django.conf import settings
from django.utils import timezone
from django.core.serializers import serialize, deserialize

from core.models import APIKey, NavItem, MediaItem, AppSettings, FavoritePerson
from core.services.m_books import save_openlib_item
from core.services.m_movies_tvshows import save_tmdb_season

logger = logging.getLogger(__name__)

# Global dictionary to store backup tasks (in-memory for simplicity)
BACKUP_TASKS = {}


class BackupTask(threading.Thread):
    def __init__(self, task_id, task_type, upload_path=None):
        super().__init__()
        self.task_id = task_id
        self.task_type = task_type
        self.upload_path = upload_path
        self.progress = 0
        self.status = "pending"  # pending, running, completed, error, cancelled
        self.message = "Initializing..."
        self.details = ""
        self.result_path = None
        self.error = None
        self._cancel_event = threading.Event()
        self.daemon = True
        self.created_at = time.time()
        self.start_processing_time = None

    def cancel(self):
        self._cancel_event.set()
        self.status = "cancelled"
        self.message = "Cancelling..."

    def run(self):
        self.status = "running"
        self.start_processing_time = time.time()
        try:
            if self.task_type == "export":
                self.do_export()
            elif self.task_type == "import":
                self.do_import()
        except Exception as e:
            self.status = "error"
            self.error = str(e)
            logger.error(f"Backup task error: {e}")
        finally:
            # Cleanup upload file if import
            if self.upload_path and os.path.exists(self.upload_path):
                try:
                    os.remove(self.upload_path)
                except Exception:
                    pass

            if self.status == "running":
                self.status = "completed"
                self.progress = 100
                self.message = "Done!"
            elif self.status == "cancelled":
                self.message = "Cancelled."
                # Cleanup result if export cancelled
                if self.result_path and os.path.exists(self.result_path):
                    try:
                        os.remove(self.result_path)
                    except Exception:
                        pass

    def update_progress(self, processed, total, message):
        self.progress = int((processed / total) * 100)
        self.message = message

        if self.start_processing_time:
            elapsed = time.time() - self.start_processing_time
            if elapsed > 0 and processed > 0:
                rate = processed / elapsed
                remaining_items = total - processed
                seconds_left = int(remaining_items / rate)

                if seconds_left < 60:
                    time_str = f"{seconds_left}s left"
                else:
                    time_str = f"{seconds_left // 60}m {seconds_left % 60}s left"

                self.details = f"{processed}/{total} ({time_str})"
            else:
                self.details = f"{processed}/{total}"

    def do_export(self):
        self.message = "Gathering database data"

        # 1. Serialize Data (Include all relevant models)
        models_to_backup = [
            MediaItem.objects.all(),
            FavoritePerson.objects.all(),
            APIKey.objects.all(),
            NavItem.objects.all(),
            AppSettings.objects.all(),
        ]

        all_objects = []
        for qs in models_to_backup:
            all_objects.extend(list(qs))

        json_data = serialize("json", all_objects)

        if self._cancel_event.is_set():
            return

        # 2. Prepare Zip
        self.message = "Scanning files"
        temp_dir = tempfile.gettempdir()
        zip_filename = f"media_journal_backup_{uuid.uuid4().hex}.zip"
        zip_path = os.path.join(temp_dir, zip_filename)
        self.result_path = zip_path

        media_root = settings.MEDIA_ROOT
        files_to_zip = []

        # Folders to include
        include_folders = [
            "posters",
            "banners",
            "cast",
            "related",
            "screenshots",
            "seasons",
            "episodes",
            "favorites",
        ]

        for folder in include_folders:
            folder_path = os.path.join(media_root, folder)
            if os.path.exists(folder_path):
                for root, dirs, files in os.walk(folder_path):
                    for file in files:
                        abs_path = os.path.join(root, file)
                        rel_path = os.path.relpath(abs_path, media_root)
                        files_to_zip.append((abs_path, rel_path))

        total_items = len(files_to_zip) + 1  # +1 for json
        processed = 0

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_STORED) as zipf:
            # Write JSON
            zipf.writestr("backup_data.json", json_data)

            processed += 1
            self.update_progress(processed, total_items, "Archiving")

            # Write Files directly (efficient)
            for abs_path, rel_path in files_to_zip:
                if self._cancel_event.is_set():
                    return

                try:
                    zipf.write(abs_path, arcname=rel_path)
                except Exception as e:
                    logger.warning(f"Could not zip {abs_path}: {e}")

                processed += 1
                if processed % 100 == 0:  # Update progress periodically
                    self.update_progress(processed, total_items, "Archiving")

    def do_import(self):
        self.message = "Reading backup file"
        if not self.upload_path or not os.path.exists(self.upload_path):
            raise Exception("Upload file not found")

        with zipfile.ZipFile(self.upload_path, "r") as zipf:
            all_files = zipf.namelist()

            # 1. Restore DB
            json_filename = "backup_data.json"
            if "media_items.json" in all_files and json_filename not in all_files:
                json_filename = "media_items.json"  # Legacy support

            # Initialize variables to avoid UnboundLocalError
            files_to_extract = [f for f in all_files if not f.endswith(".json")]
            processed = 0
            total_items = len(files_to_extract)

            if json_filename in all_files:
                self.message = "Restoring database"
                json_data = zipf.read(json_filename)

                # Deserialize to list first to get count for progress
                objects = list(deserialize("json", json_data))
                del json_data  # Free memory: Raw JSON bytes no longer needed
                total_items += len(objects)

                if total_items == 0:
                    total_items = 1  # Avoid division by zero

                for deserialized_object in objects:
                    if self._cancel_event.is_set():
                        return
                    obj = deserialized_object.object

                    try:
                        # Smart Merge Logic
                        if isinstance(obj, MediaItem):
                            lookup_key = f"provider_ids__{obj.source}"
                            MediaItem.objects.update_or_create(
                                source=obj.source,
                                media_type=obj.media_type,
                                **{lookup_key: str(obj.source_id)},
                                defaults={
                                    field.name: getattr(obj, field.name)
                                    for field in MediaItem._meta.fields
                                    if field.name != "id"
                                },
                            )
                        elif isinstance(obj, FavoritePerson):
                            # Try to find existing by name and type to avoid duplicates
                            existing = FavoritePerson.objects.filter(
                                name=obj.name, type=obj.type
                            ).first()
                            if existing:
                                for field in FavoritePerson._meta.fields:
                                    if field.name != "id":
                                        setattr(
                                            existing,
                                            field.name,
                                            getattr(obj, field.name),
                                        )
                                existing.save()
                            else:
                                obj.save()
                        elif isinstance(obj, APIKey):
                            APIKey.objects.update_or_create(
                                name=obj.name,
                                defaults={"key_1": obj.key_1, "key_2": obj.key_2},
                            )
                        elif isinstance(obj, NavItem):
                            NavItem.objects.update_or_create(
                                name=obj.name,
                                defaults={
                                    "visible": obj.visible,
                                    "position": obj.position,
                                },
                            )
                        elif isinstance(obj, AppSettings):
                            if not AppSettings.objects.exists():
                                obj.save()
                            else:
                                current = AppSettings.objects.first()
                                for field in AppSettings._meta.fields:
                                    if field.name != "id":
                                        setattr(
                                            current,
                                            field.name,
                                            getattr(obj, field.name),
                                        )
                                current.save()
                        else:
                            obj.save()
                    except Exception as e:
                        logger.warning(f"Error restoring object {obj}: {e}")

                    processed += 1
                    if processed % 100 == 0:
                        self.update_progress(
                            processed, total_items, "Restoring database"
                        )

            # 2. Restore Files
            self.message = "Restoring media files"
            media_root = settings.MEDIA_ROOT

            if total_items == 0:
                total_items = 1

            for file_name in files_to_extract:
                if self._cancel_event.is_set():
                    return

                # Security check
                if (
                    ".." in file_name
                    or file_name.startswith("/")
                    or file_name.startswith("\\")
                ):
                    continue

                # Extract
                target_path = os.path.join(media_root, file_name)
                os.makedirs(os.path.dirname(target_path), exist_ok=True)

                with open(target_path, "wb") as f:
                    f.write(zipf.read(file_name))

                processed += 1
                if processed % 100 == 0:
                    self.update_progress(
                        processed, total_items, "Restoring media files"
                    )


def cleanup_old_tasks():
    """Remove backup tasks older than 1 hour and sweep orphaned temp files"""
    now = time.time()
    
    # 1. Clean up in-memory tasks
    to_remove =[]
    for tid, task in list(BACKUP_TASKS.items()):
        if now - task.created_at > 3600:  # 1 hour
            to_remove.append(tid)
            # Clean up files
            if task.result_path and os.path.exists(task.result_path):
                try:
                    os.remove(task.result_path)
                except Exception:
                    pass
            if task.upload_path and os.path.exists(task.upload_path):
                try:
                    os.remove(task.upload_path)
                except Exception:
                    pass

    for tid in to_remove:
        del BACKUP_TASKS[tid]

    # 2. NEW: Clean up orphaned files in the OS Temp directory (Handles Server Restarts)
    temp_dir = tempfile.gettempdir()
    
    # Patterns to look for (exports and uploads)
    patterns_to_clean =[
        os.path.join(temp_dir, "media_journal_backup_*.zip"),
        os.path.join(temp_dir, "media_journal_upload_*.zip")
    ]
    
    for pattern in patterns_to_clean:
        for filepath in glob.glob(pattern):
            try:
                # If file exists and modification time is older than 1 hour
                if os.path.isfile(filepath) and (now - os.path.getmtime(filepath)) > 3600:
                    os.remove(filepath)
            except Exception as e:
                logger.warning(f"Could not remove orphaned temp file {filepath}: {e}")

# --- CUSTOM LIGHTWEIGHT REFRESH HELPERS ---

def refresh_musicbrainz_item(recording_id):
    import requests

    headers = {"User-Agent": "MediaJournal/1.0 (https://github.com/mihail-pop/media-journal)"}
    recording_url = f"https://musicbrainz.org/ws/2/recording/{recording_id}"
    recording_params = {"inc": "artists+releases+release-groups+isrcs+tags", "fmt": "json"}

    response = requests.get(recording_url, params=recording_params, headers=headers, timeout=10)
    if response.status_code == 429:
        raise Exception("HTTP 429 Too Many Requests: Rate Limit Exceeded")
    response.raise_for_status()
    recording_data = response.json()

    title = recording_data.get("title", "Untitled")
    artist_credits = recording_data.get("artist-credit", [])
    artists = ", ".join([a.get("name", "") for a in artist_credits])
    artist_label = "Artist" if len(artist_credits) == 1 else "Artists"

    first_release = ""
    first_release_id = ""
    first_release_type = ""
    releases = recording_data.get("releases",[])
    if releases:
        sorted_releases = sorted([r for r in releases if r.get("date")], key=lambda x: x.get("date", ""))
        if sorted_releases:
            release = sorted_releases[0]
            first_release = release.get("title", "")
            first_release_id = release.get("id", "")
            first_release_type = release.get("release-group", {}).get("primary-type", "")

    isrcs = recording_data.get("isrcs",[])
    isrc = isrcs[0] if isrcs else ""
    genres =[tag.get("name", "") for tag in recording_data.get("tags", [])[:10]]

    overview_parts =[]
    if artists:
        overview_parts.append(f"{artist_label}: {artists}")
    if first_release:
        release_display = f"{first_release} ({first_release_type})" if first_release_type else first_release
        overview_parts.append(f"First released as: {release_display}")
    if genres:
        overview_parts.append(f"Genres: {', '.join(genres)}")
    overview = "\n".join(overview_parts)

    cast_data = {
        "artists":[{"name": a.get("name", ""), "id": a.get("artist", {}).get("id", "")} for a in artist_credits],
        "genres": genres,
        "album": {"title": first_release, "id": first_release_id, "type": first_release_type} if first_release else None,
        "isrc": isrc,
    }

    release_date = None
    if releases:
        first_release = releases[0]
        release_date_str = first_release.get("date", "")
        if release_date_str:
            try:
                if len(release_date_str) >= 10:
                    parsed_date = datetime.strptime(release_date_str[:10], "%Y-%m-%d")
                    release_date = parsed_date.strftime("%Y-%m-%d")
                elif len(release_date_str) >= 4:
                    release_date = f"{release_date_str[:4]}-01-01"
            except ValueError:
                pass

    creators =[a.get("name", "") for a in artist_credits if a.get("name")]

    MediaItem.objects.create(
        title=title,
        media_type="music",
        source="musicbrainz",
        provider_ids={"musicbrainz": str(recording_id)},
        cover_url="",      # Preserved later
        banner_url="",     # Preserved later
        overview=overview,
        release_date=release_date,
        cast=cast_data,
        seasons=None,
        related_titles=[],
        screenshots=[],    # Preserved later
        genres=genres,
        creators=creators,
    )
    return True

def refresh_igdb_item(igdb_id):
    import requests

    from core.services.m_games import get_igdb_token

    token = get_igdb_token()
    if not token:
        raise Exception("Failed to get IGDB access token.")

    igdb_keys = APIKey.objects.get(name="igdb")
    headers = {
        "Client-ID": igdb_keys.key_1,
        "Authorization": f"Bearer {token}",
    }

    query = f"""
    fields 
      id, name, summary, storyline, 
      cover.url, genres.name, platforms.name, 
      involved_companies.company.name, involved_companies.developer,
      first_release_date, screenshots.url, artworks.url;
    where id = {igdb_id};
    """

    response = requests.post("https://api.igdb.com/v4/games", headers=headers, data=query)
    if response.status_code == 429:
        raise Exception("HTTP 429 Too Many Requests: Rate Limit Exceeded")
    elif response.status_code != 200:
        raise Exception(f"Failed to fetch details from IGDB. Status: {response.status_code}")

    data = response.json()
    if not data:
        raise Exception("Game not found.")

    game = data[0]
    title = game.get("name") or "Unknown Title"
    overview = game.get("summary") or game.get("storyline") or ""

    release_date = None
    if game.get("first_release_date"):
        release_date = time.strftime("%Y-%m-%d", time.localtime(game["first_release_date"]))

    genres = [g.get("name") for g in game.get("genres", []) if g.get("name")]
    creators =[
        c.get("company", {}).get("name")
        for c in game.get("involved_companies", [])
        if c.get("developer") and c.get("company", {}).get("name")
    ]

    MediaItem.objects.create(
        title=title,
        media_type="game",
        source="igdb",
        provider_ids={"igdb": str(igdb_id)},
        cover_url="",
        banner_url="",
        overview=overview,
        release_date=release_date,
        cast=[],
        seasons=None,
        related_titles=[],
        screenshots=[],
        genres=genres,
        creators=creators,
    )
    return True

def refresh_tmdb_item(media_type, tmdb_id, existing_seasons=None, existing_cast=None):
    import requests

    from core.services.g_utils import download_image

    api_key = APIKey.objects.get(name="tmdb").key_1
    url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}"
    params = {"api_key": api_key, "append_to_response": "aggregate_credits" if media_type == "tv" else "credits"}
    response = requests.get(url, params=params)

    if response.status_code == 429:
        raise Exception("HTTP 429 Too Many Requests: Rate Limit Exceeded")
    elif response.status_code != 200:
        raise Exception(f"Failed to fetch TMDB details. Status: {response.status_code}")

    data = response.json()
    cache_bust = int(time.time() * 1000)

    # --- REUSE EXISTING CAST IMAGES ---
    existing_cast_map = {}
    for c in (existing_cast or[]):
        c_id = str(c.get("id", ""))
        if c_id:
            existing_cast_map[c_id] = c.get("profile_path", "")

    cast_data =[]
    cast_list = data.get("aggregate_credits", {}).get("cast", [])[:8] if media_type == "tv" else data.get("credits", {}).get("cast", [])[:8]

    for actor in cast_list:
        if media_type == "tv":
            character_name = actor.get("roles", [{}])[0].get("character") if actor.get("roles") else ""
        else:
            character_name = actor.get("character")

        actor_id = str(actor.get("id", "unknown"))
        profile_url = f"https://image.tmdb.org/t/p/w185{actor.get('profile_path')}" if actor.get("profile_path") else ""
        
        local_profile = ""
        # IF WE ALREADY HAVE IT, REUSE IT. OTHERWISE DOWNLOAD.
        if actor_id in existing_cast_map and existing_cast_map[actor_id]:
            local_profile = existing_cast_map[actor_id]
        elif profile_url:
            filename = f"cast/tmdb_{media_type}_{tmdb_id}_{actor_id}_{cache_bust}.jpg"
            local_profile = download_image(profile_url, filename)

        cast_data.append({
            "name": actor.get("name"),
            "character": character_name,
            "profile_path": local_profile,
            "id": actor_id,
        })

    # --- REUSE EXISTING SEASON IMAGES ---
    existing_season_map = {}
    for s in (existing_seasons or[]):
        s_num = str(s.get("season_number", ""))
        if s_num:
            existing_season_map[s_num] = s.get("poster_path", "")

    seasons =[]
    total_episodes = 0
    total_seasons = 0
    has_new_season = False

    if media_type == "tv":
        today = datetime.now().date()
        one_year_ahead = datetime(today.year + 1, today.month, today.day).date()
        existing_numbers = {s.get("season_number") for s in (existing_seasons or[])}

        for i, season in enumerate(data.get("seasons",[])):
            season_number = season.get("season_number")
            episode_count = season.get("episode_count", 0)

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

            season_poster_url = f"https://image.tmdb.org/t/p/w300{season.get('poster_path')}" if season.get("poster_path") else ""
            local_season_poster = ""
            
            # IF WE ALREADY HAVE IT, REUSE IT
            s_num_str = str(season_number)
            if s_num_str in existing_season_map and existing_season_map[s_num_str]:
                local_season_poster = existing_season_map[s_num_str]
            elif season_poster_url:
                local_season_poster = download_image(season_poster_url, f"seasons/tmdb_tv_{tmdb_id}_s{i}_{cache_bust}.jpg")

            seasons.append({
                "season_number": season_number,
                "name": season.get("name"),
                "episode_count": episode_count,
                "poster_path": local_season_poster,
                "air_date": season.get("air_date"),
            })

            if season_number != 0 and season_number not in existing_numbers:
                has_new_season = True

    genres =[g.get("name") for g in data.get("genres", []) if g.get("name")]
    creators =[]
    if media_type == "tv":
        creators =[c.get("name") for c in data.get("created_by", []) if c.get("name")]
    else:
        crew = data.get("credits", {}).get("crew", [])
        creators =[c.get("name") for c in crew if c.get("job") == "Director" and c.get("name")]

    MediaItem.objects.create(
        title=data.get("title") or data.get("name"),
        media_type=media_type,
        source="tmdb",
        provider_ids={"tmdb": str(tmdb_id)},
        cover_url="",
        banner_url="",
        overview=data.get("overview", ""),
        release_date=data.get("release_date") or data.get("first_air_date") or "",
        cast=cast_data,
        seasons=seasons,
        total_main=total_episodes if media_type == "tv" else None,
        total_secondary=total_seasons if media_type == "tv" else None,
        notification=has_new_season,
        genres=genres,
        creators=creators,
    )
    return True

def refresh_anilist_item(media_type, anilist_id=None, mal_id=None, existing_related=None, existing_cast=None):
    from core.services.g_utils import download_image
    from core.services.m_anime_manga import fetch_anilist_data

    data = fetch_anilist_data(media_type, anilist_id=anilist_id, mal_id=mal_id)
    canonical_id = data["anilist_id"]
    cache_bust = int(time.time() * 1000)

    # --- REUSE EXISTING CAST IMAGES ---
    existing_cast_map = {}
    for c in (existing_cast or[]):
        c_id = str(c.get("id", ""))
        if c_id:
            existing_cast_map[c_id] = c.get("profile_path", "")

    cast = []
    for member in data["cast"][:8]:
        profile_url = member.get("profile_path")
        character_id = str(member.get("id", "unknown"))
        local_path = ""
        
        # IF WE ALREADY HAVE IT, REUSE IT
        if character_id in existing_cast_map and existing_cast_map[character_id]:
            local_path = existing_cast_map[character_id]
        elif profile_url:
            local_path = download_image(profile_url, f"cast/anilist_{media_type}_{canonical_id}_{character_id}_{cache_bust}.jpg")

        cast.append({
            "name": member["name"],
            "character": member["character"],
            "profile_path": local_path,
            "id": character_id,
        })

    # --- REUSE EXISTING RELATED IMAGES ---
    existing_related_map = {}
    existing_anilist = set()
    existing_mal = set()
    for r in (existing_related or[]):
        r_id = str(r.get("anilist_id") or r.get("mal_id") or "")
        if r_id:
            existing_related_map[r_id] = r.get("poster_path", "")
        if r.get("anilist_id"):
            existing_anilist.add(str(r.get("anilist_id")))
        if r.get("mal_id"):
            existing_mal.add(str(r.get("mal_id")))

    related_titles = []
    has_new_sequel = False

    for related in data["related_titles"]:
        r_ref_id = str(related.get("anilist_id") or related.get("mal_id") or "")
        poster_path = related["poster_path"]
        
        local_related_poster = ""
        # IF WE ALREADY HAVE IT, REUSE IT
        if r_ref_id in existing_related_map and existing_related_map[r_ref_id]:
            local_related_poster = existing_related_map[r_ref_id]
        elif poster_path:
            local_related_poster = download_image(poster_path, f"related/anilist_{media_type}_{r_ref_id}_{cache_bust}.jpg")

        rel_type = related["relation"]
        r_a = str(related.get("anilist_id")) if related.get("anilist_id") else None
        r_m = str(related.get("mal_id")) if related.get("mal_id") else None

        if rel_type.lower() == "sequel":
            if not ((r_a and r_a in existing_anilist) or (r_m and r_m in existing_mal)):
                has_new_sequel = True

        related_titles.append({
            "anilist_id": related.get("anilist_id"),
            "mal_id": related.get("mal_id"),
            "title": related["title"],
            "poster_path": local_related_poster,
            "relation": rel_type,
        })

    new_provider_ids = {"anilist": str(data["anilist_id"])}
    if data["mal_id"]:
        new_provider_ids["mal"] = str(data["mal_id"])

    MediaItem.objects.create(
        title=data["title"],
        media_type=media_type,
        source="anilist",
        provider_ids=new_provider_ids,
        cover_url="",
        banner_url="",
        overview=data["overview"],
        release_date=data["release_date"],
        cast=cast,
        seasons=None,
        related_titles=related_titles,
        total_main=data.get("total_main"),
        total_secondary=data.get("total_secondary"),
        notification=has_new_sequel,
        genres=data["genres"],
        creators=data["creators"],
    )
    return True


# --- REFRESH TASK ---

class RefreshTask(threading.Thread):
    def __init__(self, task_id, media_type):
        super().__init__()
        self.task_id = task_id
        self.media_type = media_type
        self.progress = 0
        self.status = "pending"
        self.message = "Initializing..."
        self.details = ""
        self.error = None
        self._cancel_event = threading.Event()
        self.daemon = True
        self.created_at = time.time()
        self.start_processing_time = None

    def cancel(self):
        self._cancel_event.set()
        self.status = "cancelled"
        self.message = "Cancelling..."

    def run(self):
        self.status = "running"
        self.start_processing_time = time.time()
        try:
            self.do_refresh()
        except Exception as e:
            self.status = "error"
            self.error = str(e)
            logger.error(f"Refresh task error: {e}")
        finally:
            if self.status == "running":
                self.status = "completed"
                self.progress = 100
                self.message = "Done!"
            elif self.status == "cancelled":
                self.message = "Cancelled."

    def update_progress(self, processed, total, message):
        self.progress = int((processed / total) * 100) if total > 0 else 100
        self.message = message

        if self.start_processing_time:
            elapsed = time.time() - self.start_processing_time
            if elapsed > 0 and processed > 0:
                rate = processed / elapsed
                remaining_items = total - processed
                seconds_left = int(remaining_items / rate)
                time_str = f"{seconds_left}s left" if seconds_left < 60 else f"{seconds_left // 60}m {seconds_left % 60}s left"
                self.details = f"{processed}/{total} ({time_str})"
            else:
                self.details = f"{processed}/{total}"

    def do_refresh(self):
        qs = MediaItem.objects.all()
        
        type_map = {
            "movies": "movie",
            "tvshows": "tv",
            "anime": "anime",
            "manga": "manga",
            "games": "game",
            "books": "book",
            "music": "music"
        }
        
        if self.media_type != "all":
            mapped_type = type_map.get(self.media_type, self.media_type)
            qs = qs.filter(media_type=mapped_type)

        items_to_refresh =[]
        for item in qs:
            source_id = str(item.source_id)
            if source_id.startswith("custom_"):
                continue
            
            is_custom = False
            for k, v in item.provider_ids.items():
                if str(v).startswith("custom_"):
                    is_custom = True
                    break
            
            if not is_custom:
                items_to_refresh.append(item.id)

        total_items = len(items_to_refresh)
        processed = 0
        consecutive_errors = 0  # <--- NEW: Track consecutive failures

        self.update_progress(0, total_items, "Starting refresh")

        for item_id in items_to_refresh:
            if self._cancel_event.is_set():
                return
            
            try:
                item = MediaItem.objects.get(id=item_id)
            except MediaItem.DoesNotExist:
                processed += 1
                continue

            source = item.source
            source_id = str(item.source_id)
            media_type = item.media_type

            # Serialize old item state as failsafe fallback
            old_data_json = serialize("json", [item])

            existing_seasons = item.seasons if media_type == 'tv' else None
            existing_related = item.related_titles if media_type in ['anime', 'manga'] else None

            # Preserve critical user modifications and local asset URLs
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
                "banner_url": item.banner_url,
                "cover_url": item.cover_url,
                "notification": item.notification,
            }

            existing_cast = item.cast

            try:
                # 1. Delete DB entry but DO NOT remove local files (ORM default behavior)
                item.delete()

                # 2. Refetch item via lightweight functions (respectfully against rate limits)
                if source == "tmdb":
                    if "_s" in source_id:
                        tmdb_id, season_number = source_id.split("_s")
                        save_tmdb_season(tmdb_id, season_number) # Full payload for seasons
                    else:
                        refresh_tmdb_item(media_type, source_id, existing_seasons, existing_cast)
                    time.sleep(0.2)
                elif source in["mal", "anilist"]:
                    anilist_id = item.provider_ids.get("anilist")
                    mal_id = item.provider_ids.get("mal")
                    refresh_anilist_item(media_type, anilist_id, mal_id, existing_related, existing_cast)
                    time.sleep(2.1)
                elif source == "igdb":
                    refresh_igdb_item(source_id)
                    time.sleep(0.3)
                elif source == "openlib":
                    save_openlib_item(source_id)
                    time.sleep(1.0)
                elif source == "musicbrainz":
                    refresh_musicbrainz_item(source_id)
                    time.sleep(1.1)
                else:
                    processed += 1
                    continue

                # 3. Pull recently made object to override variables back to our preserved custom ones
                lookup_key = f"provider_ids__{source}"
                new_item = MediaItem.objects.get(media_type=media_type, **{lookup_key: source_id})

                # Combine old notification state with the newly checked state
                user_data["notification"] = user_data["notification"] or new_item.notification

                # 4. Cleanup any orphan files downloaded during this specific run
                # --- NEW SMART ORPHAN CLEANUP ---
                def extract_urls(data, paths_set):
                    if isinstance(data, dict):
                        for v in data.values():
                            extract_urls(v, paths_set)
                    elif isinstance(data, list):
                        for i in data:
                            extract_urls(i, paths_set)
                    elif isinstance(data, str) and data.startswith("/media/"):
                        paths_set.add(data.replace("/media/", "", 1).strip('/'))

                # Fields that might contain image URLs
                media_fields =['cover_url', 'banner_url', 'screenshots', 'cast', 'seasons', 'episodes', 'related_titles']
                
                # 1. Gather OLD images and NEW temporary images
                old_files, temp_new_files = set(), set()
                old_obj = list(deserialize("json", old_data_json))[0].object
                
                for f in media_fields:
                    extract_urls(getattr(old_obj, f, None), old_files)
                    extract_urls(getattr(new_item, f, None), temp_new_files)

                # 2. Restore preserved user data (custom screenshots, covers, etc.)
                for field, value in user_data.items():
                    setattr(new_item, field, value)

                # 3. Gather FINAL images
                final_files = set()
                for f in media_fields:
                    extract_urls(getattr(new_item, f, None), final_files)

                # 4. Delete what is no longer used
                for rel_path in (old_files | temp_new_files) - final_files:
                    abs_path = os.path.join(settings.MEDIA_ROOT, rel_path)
                    if os.path.exists(abs_path):
                        try:
                            os.remove(abs_path)
                        except Exception:
                            pass
                # --- END SMART ORPHAN CLEANUP ---

                new_item.last_updated = timezone.now()
                new_item.save()

                consecutive_errors = 0  # <--- RESET on successful fetch
                processed += 1
                self.update_progress(processed, total_items, "Refreshing items")

            except Exception as e:
                consecutive_errors += 1
                error_msg = str(e).lower()
                
                # Restore the DB state for this failed item immediately
                for obj in deserialize("json", old_data_json):
                    obj.object.save()
                    
                # If it explicitly caught a known 429
                if "429" in error_msg or "rate limit" in error_msg or "too many requests" in error_msg:
                    logger.error(f"Rate limit hit on item {item_id}: {e}")
                    self.error = f"API Rate limit reached on {source}. Process stopped."
                    self.status = "error"
                    break # Break the for loop
                
                # NEW FAILSAFE: If it failed 3 times in a row with generic errors (like AniList's)
                if consecutive_errors >= 3:
                    logger.error(f"Too many consecutive errors ({consecutive_errors}). Last error on {item_id}: {e}")
                    self.error = f"Multiple API failures on {source} (Possible rate limit). Process stopped."
                    self.status = "error"
                    break # Break the for loop
                
                logger.error(f"Failed to refresh {item_id}, restoring backup: {e}")
                processed += 1
                self.update_progress(processed, total_items, "Refreshing items")