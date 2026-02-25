from django.apps import apps
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from django.core.files.storage import default_storage
from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from core.models import APIKey, MediaItem, FavoritePerson
from django.utils.text import slugify
import datetime as dt
from core.views.m_anime_manga import save_mal_item, get_anime_extra_info, get_manga_extra_info
from core.views.m_books import save_openlib_item
from core.views.m_games import save_igdb_item, get_game_extra_info
from core.views.m_movies_tvshows import save_tmdb_item, save_tmdb_season, get_movie_extra_info, get_tv_extra_info
from core.views.m_music import save_musicbrainz_item, get_music_extra_info
from core.views.u_utils import rating_to_display, display_to_rating
from core.views.u_utils import download_image
import time
import json
import requests
import logging
import os
import datetime
import glob
import re


logger = logging.getLogger(__name__)

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

    # Prevent duplicate entries
    if MediaItem.objects.filter(
        source=source, source_id=source_id, media_type=media_type
    ).exists():
        return JsonResponse({"error": "Item already in list"}, status=400)

    # Route to the correct handler (TMDB, MAL, IGDB, etc.)
    if source == "tmdb":
        return save_tmdb_item(media_type, source_id)

    if source == "mal":
        return save_mal_item(media_type, source_id)

    if source == "igdb":
        return save_igdb_item(source_id)

    if source == "openlib":
        return save_openlib_item(source_id)

    if source == "musicbrainz":
        return save_musicbrainz_item(source_id)

    return JsonResponse({"error": "Unsupported source"}, status=400)

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
            if "progress_main" in data and data["progress_main"] not in [None, ""]:
                progress_main = int(data["progress_main"])
                if item.total_main is not None and progress_main > item.total_main:
                    progress_main = item.total_main
                item.progress_main = progress_main

            if "progress_secondary" in data and data["progress_secondary"] not in [
                None,
                "",
            ]:
                progress_secondary = int(data["progress_secondary"])
                if (
                    item.total_secondary is not None
                    and progress_secondary > item.total_secondary
                ):
                    progress_secondary = item.total_secondary
                item.progress_secondary = progress_secondary

            # If status changed TO "completed", override progress with totals
            if old_status != "completed" and new_status == "completed":
                if item.total_main is not None:
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

def character_search(query):
    url = "https://graphql.anilist.co"
    headers = {"Content-Type": "application/json"}

    graphql_query = """
    query ($search: String) {
      Page(perPage: 10) {
        characters(search: $search) {
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
    """

    variables = {"search": query}

    response = requests.post(
        url, json={"query": graphql_query, "variables": variables}, headers=headers
    )

    if response.status_code == 200:
        data = response.json()
        results = []
        for char in data["data"]["Page"]["characters"]:
            results.append(
                {
                    "id": char["id"],
                    "name": char["name"]["full"],
                    "image": char["image"]["large"],
                }
            )
        return results
    else:
        return []


def actor_search(query):
    url = "https://api.themoviedb.org/3/search/person"
    params = {
        "api_key": APIKey.objects.get(name="tmdb").key_1,
        "query": query,
        "include_adult": False,
        "language": "en-US",
        "page": 1,
    }

    response = requests.get(url, params=params)

    if response.status_code == 200:
        data = response.json()
        results = []
        for person in data.get("results", [])[:10]:
            results.append(
                {
                    "id": person["id"],
                    "name": person["name"],
                    "image": f"https://image.tmdb.org/t/p/w185{person['profile_path']}"
                    if person.get("profile_path")
                    else None,
                }
            )
        return results
    else:
        return []


def fetch_actor_data(actor_id):
    """Fetch actor data from database or TMDB API"""
    try:
        # Check if actor exists in database
        actor = FavoritePerson.objects.get(person_id=str(actor_id), type="actor")
        # Ensure database stored media has the required fields
        related_media = actor.related_media or []
        for media in related_media:
            if "url" not in media and media.get("id") and media.get("media_type"):
                media["url"] = f"/tmdb/{media['media_type']}/{media['id']}/"
            if "type_display" not in media:
                media["type_display"] = (
                    "Movie" if media.get("media_type") == "movie" else "TV Show"
                )
            if "formatted_date" not in media and media.get("release_date"):
                try:
                    parsed_date = datetime.datetime.strptime(
                        media["release_date"], "%Y-%m-%d"
                    )
                    media["formatted_date"] = parsed_date.strftime("%b %Y")
                except ValueError:
                    media["formatted_date"] = media["release_date"]
            if "character" not in media:
                media["character"] = ""

        # Format dates
        formatted_birthday = ""
        if actor.birthday:
            try:
                parsed = datetime.datetime.strptime(actor.birthday, "%Y-%m-%d")
                formatted_birthday = parsed.strftime("%d %B %Y")
            except ValueError:
                formatted_birthday = actor.birthday

        formatted_deathday = ""
        if actor.deathday:
            try:
                parsed = datetime.datetime.strptime(actor.deathday, "%Y-%m-%d")
                formatted_deathday = parsed.strftime("%d %B %Y")
            except ValueError:
                formatted_deathday = actor.deathday

        return {
            "id": actor.person_id,
            "name": actor.name,
            "birthday": formatted_birthday,
            "deathday": formatted_deathday,
            "biography": actor.biography,
            "image": actor.image_url,
            "related_media": related_media,
        }
    except FavoritePerson.DoesNotExist:
        pass

    # Fetch from TMDB API
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1

        # Get person details
        person_url = f"https://api.themoviedb.org/3/person/{actor_id}"
        person_response = requests.get(person_url, params={"api_key": api_key})

        if person_response.status_code != 200:
            return None

        person_data = person_response.json()

        # Get combined credits
        credits_url = f"https://api.themoviedb.org/3/person/{actor_id}/combined_credits"
        credits_response = requests.get(credits_url, params={"api_key": api_key})

        related_media = []
        if credits_response.status_code == 200:
            credits_data = credits_response.json()
            for credit in credits_data.get("cast", []):  # Limit to 20 entries
                media_type = credit.get("media_type")
                if media_type in ["movie", "tv"]:
                    release_date = credit.get("release_date") or credit.get(
                        "first_air_date"
                    )
                    formatted_date = ""
                    if release_date:
                        try:
                            parsed_date = datetime.datetime.strptime(
                                release_date, "%Y-%m-%d"
                            )
                            formatted_date = parsed_date.strftime("%b %Y")
                        except ValueError:
                            formatted_date = release_date

                    related_media.append(
                        {
                            "id": credit.get("id"),
                            "title": credit.get("title") or credit.get("name"),
                            "media_type": media_type,
                            "type_display": "Movie"
                            if media_type == "movie"
                            else "TV Show",
                            "release_date": release_date,
                            "formatted_date": formatted_date,
                            "poster_path": f"https://image.tmdb.org/t/p/original{credit.get('poster_path')}"
                            if credit.get("poster_path")
                            else None,
                            "character": credit.get("character") or "",
                            "url": f"/tmdb/{media_type}/{credit.get('id')}/",
                        }
                    )

            # Sort by release date (latest first)
            related_media.sort(
                key=lambda x: x.get("release_date") or "0000-00-00", reverse=True
            )

        # Format dates
        formatted_birthday = ""
        if person_data.get("birthday"):
            try:
                parsed = datetime.datetime.strptime(
                    person_data.get("birthday"), "%Y-%m-%d"
                )
                formatted_birthday = parsed.strftime("%d %B %Y")
            except ValueError:
                formatted_birthday = person_data.get("birthday")

        formatted_deathday = ""
        if person_data.get("deathday"):
            try:
                parsed = datetime.datetime.strptime(
                    person_data.get("deathday"), "%Y-%m-%d"
                )
                formatted_deathday = parsed.strftime("%d %B %Y")
            except ValueError:
                formatted_deathday = person_data.get("deathday")

        return {
            "id": str(person_data.get("id")),
            "name": person_data.get("name"),
            "birthday": formatted_birthday,
            "deathday": formatted_deathday,
            "biography": person_data.get("biography"),
            "image": f"https://image.tmdb.org/t/p/original{person_data.get('profile_path')}"
            if person_data.get("profile_path")
            else None,
            "related_media": related_media,
        }

    except Exception as e:
        logger.error(f"Error fetching actor data for {actor_id}: {str(e)}")
        return None


def fetch_character_data(character_id):
    """Fetch character data from database or AniList API"""
    logger.info(
        f"fetch_character_data called with character_id: {character_id} (type: {type(character_id)})"
    )

    if character_id is None:
        logger.error("character_id is None")
        return None

    # Debug: Print the exact value and type
    logger.info(
        f"DEBUG: character_id value = '{character_id}', type = {type(character_id)}, repr = {repr(character_id)}"
    )

    # Convert to string and validate
    try:
        character_id_str = str(character_id)
        logger.info(f"DEBUG: character_id_str = '{character_id_str}'")
        if not character_id_str or character_id_str == "None":
            logger.error(f"Invalid character_id: {character_id}")
            return None
    except Exception as e:
        logger.error(
            f"Error converting character_id to string: {character_id} - {str(e)}"
        )
        return None

    try:
        # Check if character exists in database
        character = FavoritePerson.objects.get(
            person_id=character_id_str, type="character"
        )
        # Ensure database stored media has the required fields
        media_appearances = character.media_appearances or []
        for media in media_appearances:
            if "url" not in media:
                media_type = media.get("type", "").lower()
                if media_type in ["anime", "manga"] and media.get("id"):
                    # For AniList data, we need to find the MAL ID or use AniList ID
                    media["url"] = f"/mal/{media_type}/{media.get('id')}/"
                else:
                    media["url"] = "#"
            if "type_display" not in media:
                media["type_display"] = (
                    media.get("format") or media.get("type", "").title()
                )
            if "formatted_date" not in media and media.get("release_date"):
                try:
                    parsed_date = datetime.datetime.strptime(
                        media["release_date"], "%Y-%m-%d"
                    )
                    media["formatted_date"] = parsed_date.strftime("%b %Y")
                except ValueError:
                    media["formatted_date"] = media["release_date"]

        return {
            "id": character.person_id,
            "name": character.name,
            "image": character.image_url,
            "description": character.description,
            "age": character.age,
            "media_appearances": media_appearances,
            "voice_actors": character.voice_actors or [],
        }
    except FavoritePerson.DoesNotExist:
        pass

    # Fetch from AniList API
    try:
        query = """
        query ($id: Int) {
          Character(id: $id) {
            id
            name {
              full
            }
            image {
              large
            }
            description
            age
            media {
              edges {
                characterRole
                node {
                  id
                  idMal
                  title {
                    romaji
                    english
                  }
                  type
                  format
                  startDate {
                    year
                    month
                    day
                  }
                  coverImage {
                    large
                  }
                }
                voiceActors {
                  id
                  name {
                    full
                  }
                  language
                  image {
                    large
                  }
                }
              }
            }
          }
        }
        """

        try:
            # Use the validated character_id_str and convert to int
            if not character_id_str or character_id_str == "None":
                logger.error(f"Character ID is None or empty: {character_id}")
                return None
            character_id_int = int(character_id_str)
            if character_id_int <= 0:
                logger.error(f"Character ID must be positive: {character_id_int}")
                return None
            variables = {"id": character_id_int}
        except (ValueError, TypeError) as e:
            logger.error(
                f"Invalid character_id cannot be converted to int: {character_id} - {str(e)}"
            )
            return None

        logger.info(
            f"Making AniList request for character {character_id} with variables: {variables}"
        )

        response = requests.post(
            "https://graphql.anilist.co",
            json={"query": query, "variables": variables},
            headers={"Content-Type": "application/json"},
        )

        logger.info(f"AniList response status: {response.status_code}")

        if response.status_code != 200:
            logger.error(
                f"AniList API error for character {character_id}: {response.status_code} - {response.text}"
            )
            return None

        data = response.json()
        logger.info(f"AniList response data: {data}")

        # Check for GraphQL errors
        if "errors" in data:
            logger.error(
                f"GraphQL errors for character {character_id}: {data['errors']}"
            )
            return None

        character_data = data.get("data", {}).get("Character")
        logger.info(f"Character data extracted: {character_data}")

        if not character_data:
            logger.error(
                f"No character data found for character {character_id}. Full response: {data}"
            )
            return None

        # Process media appearances
        media_appearances = []
        voice_actors = []

        for edge in character_data.get("media", {}).get("edges", [])[
            :24
        ]:  # Limit to 10
            node = edge.get("node", {})

            # Get start date and format it
            start_date = node.get("startDate", {})
            release_date = ""
            formatted_date = ""
            if start_date and start_date.get("year"):
                year = start_date.get("year")
                month = start_date.get("month") or 1
                day = start_date.get("day") or 1
                try:
                    date_obj = datetime.datetime(year, month, day)
                    release_date = date_obj.strftime("%Y-%m-%d")
                    formatted_date = date_obj.strftime("%b %Y")
                except ValueError:
                    formatted_date = str(year)

            media_type = node.get("type", "").lower()
            media_format = node.get("format", "")

            # Create URL based on media type
            url = "#"
            if media_type in ["anime", "manga"] and node.get("idMal"):
                url = f"/mal/{media_type}/{node.get('idMal')}/"

            media_appearances.append(
                {
                    "id": node.get("id"),
                    "title": node.get("title", {}).get("english")
                    or node.get("title", {}).get("romaji"),
                    "type": node.get("type"),
                    "format": media_format,
                    "type_display": media_format or media_type.title(),
                    "image": node.get("coverImage", {}).get("large"),
                    "character_role": edge.get("characterRole"),
                    "release_date": release_date,
                    "formatted_date": formatted_date,
                    "url": url,
                }
            )

            # Add voice actors from this media
            for va in edge.get("voiceActors", []):
                va_id = va.get("id")
                if not any(
                    existing_va.get("id") == va_id for existing_va in voice_actors
                ):
                    voice_actors.append(
                        {
                            "id": va_id,
                            "name": va.get("name", {}).get("full"),
                            "language": va.get("language"),
                            "image": va.get("image", {}).get("large"),
                        }
                    )

        # Sort by release date (latest first)
        media_appearances.sort(
            key=lambda x: x.get("release_date") or "0000-00-00", reverse=True
        )

        # Process description to format markdown-style text
        description = character_data.get("description", "")
        if description:
            # Convert __text__ to <strong>text</strong> (first occurrence without br, rest with br)
            parts = description.split("__")
            result = []
            for i, part in enumerate(parts):
                if i % 2 == 1:  # This is inside __ __
                    if i == 1:  # First bold text
                        result.append(f"<strong>{part}</strong> ")
                    else:
                        result.append(f"<br><strong>{part}</strong> ")
                else:
                    result.append(part)
            description = "".join(result)
            # Convert spoiler tags ~!text!~ to spoiler spans
            description = re.sub(
                r"~!([^!]+)!~", r'<span class="spoiler">\1</span>', description
            )
            # Convert markdown links [text](url) to HTML links
            description = re.sub(
                r"\[([^\]]+)\]\(([^\)]+)\)",
                r'<a href="\2" target="_blank">\1</a>',
                description,
            )

        # Process age to remove trailing dash if single age
        age = character_data.get("age")
        if age and isinstance(age, str) and age.endswith("-") and "-" not in age[:-1]:
            age = age[:-1]  # Remove trailing dash for single ages

        return {
            "id": str(character_data.get("id")),
            "name": character_data.get("name", {}).get("full"),
            "image": character_data.get("image", {}).get("large"),
            "description": description,
            "age": age,
            "media_appearances": media_appearances,
            "voice_actors": voice_actors,
        }

    except Exception as e:
        logger.error(f"Error fetching character data for {character_id}: {str(e)}")
        return None


def save_favorite_actor_character(name, image_url, type, person_id=None):
    existing_count = FavoritePerson.objects.filter(type=type).count()
    position = existing_count + 1

    # Prepare local path
    slug_name = slugify(name)
    ext = image_url.split(".")[-1].split("?")[
        0
    ]  # crude extension extract, e.g. jpg, png
    relative_path = f"favorites/{type}s/{slug_name}.{ext}"

    local_url = download_image(image_url, relative_path)
    # fallback to original url if download failed
    final_image_url = local_url if local_url else image_url

    # Fetch additional data based on type
    additional_data = {}
    if type == "actor" and person_id:
        actor_data = fetch_actor_data(person_id)
        if actor_data:
            additional_data = {
                "birthday": actor_data.get("birthday"),
                "deathday": actor_data.get("deathday"),
                "biography": actor_data.get("biography"),
                "related_media": actor_data.get("related_media"),
            }
    elif type == "character" and person_id:
        character_data = fetch_character_data(person_id)
        if character_data:
            additional_data = {
                "description": character_data.get("description"),
                "age": character_data.get("age"),
                "media_appearances": character_data.get("media_appearances"),
                "voice_actors": character_data.get("voice_actors"),
            }

    person = FavoritePerson.objects.create(
        name=name,
        image_url=final_image_url,
        type=type,
        position=position,
        person_id=person_id,
        **additional_data,
    )
    return person


def delete_favorite_person_and_reorder(person_id):
    try:
        person = FavoritePerson.objects.get(id=person_id)
        person_type = person.type

        # Only delete image files that are in the favorites directory
        if person.image_url and person.image_url.startswith(settings.MEDIA_URL):
            # Convert URL to file system path
            relative_path = person.image_url.replace(settings.MEDIA_URL, "").lstrip("/")
            # Only delete if it's in the favorites directory
            if relative_path.startswith("favorites/"):
                local_path = os.path.join(settings.MEDIA_ROOT, relative_path)
                if os.path.isfile(local_path):
                    try:
                        os.remove(local_path)
                    except Exception as e:
                        print(f"Failed to delete image file {local_path}: {e}")

        # Delete the person record from DB
        person.delete()

        # Reorder remaining people of the same type
        favorites = FavoritePerson.objects.filter(type=person_type).order_by("position")
        for i, fav in enumerate(favorites, start=1):
            fav.position = i
            fav.save()
        return True
    except FavoritePerson.DoesNotExist:
        return False

@ensure_csrf_cookie
def character_search_view(request):
    query = request.GET.get("q", "")
    results = character_search(query) if query else []
    return JsonResponse(results, safe=False)


@ensure_csrf_cookie
def actor_search_view(request):
    query = request.GET.get("q", "")
    results = actor_search(query) if query else []
    return JsonResponse(results, safe=False)

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
        elif source == "mal":
            save_mal_item(media_type, source_id)
        elif source == "igdb":
            save_igdb_item(source_id)
        elif source == "openlib":
            save_openlib_item(source_id)
        elif source == "musicbrainz":
            save_musicbrainz_item(source_id)
        else:
            return JsonResponse({"error": "Unsupported source."}, status=400)

        # Restore user data
        new_item = MediaItem.objects.get(
            source=source, source_id=source_id, media_type=media_type
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
