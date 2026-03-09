import os
import re
import logging
import datetime

import requests
from django.conf import settings
from django.utils.text import slugify

from core.models import APIKey, FavoritePerson
from core.services.g_utils import download_image

logger = logging.getLogger(__name__)


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

        # Filter media: remove entries without poster and deduplicate by title
        filtered_media = []
        seen_titles = set()
        for media in related_media:
            if not media.get("poster_path"):
                continue
            title = media.get("title", "")
            if title in seen_titles:
                continue
            seen_titles.add(title)
            filtered_media.append(media)

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
            "related_media": filtered_media,
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
