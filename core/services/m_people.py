import os
import re
import logging
import datetime
import time

import requests
from django.conf import settings
from django.utils.text import slugify

from core.models import APIKey, FavoritePerson, MediaPersonLink
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


def calculate_age(birth_date, death_date=None):
    if not birth_date:
        return ""
    try:
        birth = datetime.datetime.strptime(birth_date, "%Y-%m-%d")
        end = datetime.datetime.strptime(death_date, "%Y-%m-%d") if death_date else datetime.datetime.now()
        age = end.year - birth.year - ((end.month, end.day) < (birth.month, birth.day))
        return str(age)
    except ValueError:
        return ""

def fetch_actor_data(actor_id):
    """Fetch actor data from database or TMDB API"""
    try:
        actor = FavoritePerson.objects.get(person_id=str(actor_id), type="actor")
        
        # Helper to format saved JSON media
        def fix_media_list(media_list):
            if not media_list: return []
            for media in media_list:
                if "url" not in media and media.get("id") and media.get("media_type"):
                    media["url"] = f"/tmdb/{media['media_type']}/{media['id']}/"
                if "type_display" not in media:
                    media["type_display"] = "Movie" if media.get("media_type") == "movie" else "TV Show"
                if "formatted_date" not in media and media.get("release_date"):
                    try:
                        parsed_date = datetime.datetime.strptime(media["release_date"], "%Y-%m-%d")
                        media["formatted_date"] = parsed_date.strftime("%b %Y")
                    except ValueError:
                        media["formatted_date"] = media["release_date"]
                if "character" not in media:
                    media["character"] = ""
            return media_list

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

        # Get linked media from "Media Journal" database
        assigned_media = []
        links = MediaPersonLink.objects.filter(person=actor).select_related('item')
        for link in links:
            item = link.item
            
            fmt_date = ""
            if item.release_date:
                try:
                    parsed = datetime.datetime.strptime(item.release_date, "%Y-%m-%d")
                    fmt_date = parsed.strftime("%b %Y")
                except ValueError:
                    fmt_date = item.release_date

            # Build correct URL based on Media Type and Source
            url = "#"
            if item.media_type in ["movie", "tv"]:
                if "_s" in str(item.source_id):
                    show_id, season_number = str(item.source_id).split("_s")
                    url = f"/tmdb/season/{show_id}/{season_number}/"
                else:
                    url = f"/tmdb/{item.media_type}/{item.source_id}/"
            elif item.media_type in ["anime", "manga"]:
                url = f"/{item.source}/{item.media_type}/{item.source_id}/"
            elif item.media_type == "game":
                url = f"/igdb/game/{item.source_id}/"
            elif item.media_type == "book":
                url = f"/openlib/book/{item.source_id}/"
            elif item.media_type == "music":
                url = f"/musicbrainz/music/{item.source_id}/"
            
            assigned_media.append({
                "id": item.id,
                "link_id": link.id,
                "title": item.title,
                "image": item.cover_url,
                "type_display": item.get_media_type_display(),
                "character": link.media_role or actor.role or "Actor",
                "media_role_raw": link.media_role or "",
                "formatted_date": fmt_date,
                "url": url, 
            })

        return {
            "id": actor.person_id,
            "name": actor.name,
            "role": actor.role or "Actor",
            "age": actor.age or calculate_age(actor.birthday, actor.deathday),
            "birthday": formatted_birthday,
            "birthday_raw": actor.birthday,
            "deathday": formatted_deathday,
            "deathday_raw": actor.deathday,
            "biography": actor.biography,
            "image": actor.image_url,
            "known_for": fix_media_list(actor.known_for),
            "related_media": fix_media_list(actor.related_media),
            "directed": fix_media_list(actor.directed),
            "produced": fix_media_list(actor.produced),
            "crew_credits": fix_media_list(actor.crew_credits),
            "assigned_media": assigned_media
        }
    except FavoritePerson.DoesNotExist:
        pass

    # Fetch from TMDB API
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
        person_url = f"https://api.themoviedb.org/3/person/{actor_id}"
        person_response = requests.get(person_url, params={"api_key": api_key})

        if person_response.status_code != 200:
            return None

        person_data = person_response.json()
        credits_url = f"https://api.themoviedb.org/3/person/{actor_id}/combined_credits"
        credits_response = requests.get(credits_url, params={"api_key": api_key})

        known_for = []
        related_media = []
        directed = []
        produced = []
        crew_credits = []
        all_credits_for_sorting = []

        if credits_response.status_code == 200:
            credits_data = credits_response.json()
            
            def format_tmdb_credit(credit, is_crew=False):
                media_type = credit.get("media_type")
                if media_type not in ["movie", "tv"]: return None
                if not credit.get("poster_path"): return None
                
                release_date = credit.get("release_date") or credit.get("first_air_date")
                formatted_date = ""
                if release_date:
                    try:
                        parsed_date = datetime.datetime.strptime(release_date, "%Y-%m-%d")
                        formatted_date = parsed_date.strftime("%b %Y")
                    except ValueError:
                        formatted_date = release_date

                return {
                    "id": credit.get("id"),
                    "title": credit.get("title") or credit.get("name"),
                    "media_type": media_type,
                    "type_display": "Movie" if media_type == "movie" else "TV Show",
                    "release_date": release_date,
                    "formatted_date": formatted_date,
                    "poster_path": f"https://image.tmdb.org/t/p/original{credit.get('poster_path')}",
                    "character": credit.get("job") if is_crew else (credit.get("character") or ""),
                    "url": f"/tmdb/{media_type}/{credit.get('id')}/",
                    "vote_count": credit.get("vote_count", 0)
                }

            # Process Cast (Played In)
            seen_cast = set()
            for credit in credits_data.get("cast", []):
                fmt = format_tmdb_credit(credit)
                if fmt and fmt["title"] not in seen_cast:
                    related_media.append(fmt)
                    all_credits_for_sorting.append(fmt)
                    seen_cast.add(fmt["title"])

            # Process Crew
            seen_crew = set()
            for credit in credits_data.get("crew", []):
                fmt = format_tmdb_credit(credit, is_crew=True)
                if not fmt: continue
                
                # Prevent exact job-title duplicates
                job_key = f"{fmt['title']}-{fmt['character']}"
                if job_key in seen_crew: continue
                seen_crew.add(job_key)
                
                job = credit.get("job", "")
                dept = credit.get("department", "")
                
                if job == "Director":
                    directed.append(fmt)
                elif job == "Producer" or dept == "Production":
                    produced.append(fmt)
                else:
                    crew_credits.append(fmt)
                    
                # Add to all credits for "Known For" if title isn't already there
                if not any(c["title"] == fmt["title"] for c in all_credits_for_sorting):
                    all_credits_for_sorting.append(fmt)

            # Sort lists by newest release date
            def sort_by_date(lst):
                lst.sort(key=lambda x: x.get("release_date") or "0000-00-00", reverse=True)
                
            sort_by_date(related_media)
            sort_by_date(directed)
            sort_by_date(produced)
            sort_by_date(crew_credits)
            
            # Extract Known For (Top 10 highest vote counts)
            all_credits_for_sorting.sort(key=lambda x: x.get("vote_count", 0), reverse=True)
            known_for = all_credits_for_sorting[:10]

        # Figure out Role
        dept = person_data.get("known_for_department", "")
        role_map = {"Acting": "Actor", "Directing": "Director", "Production": "Producer", "Writing": "Writer"}
        general_role = role_map.get(dept, dept) or "Actor"

        formatted_birthday = ""
        if person_data.get("birthday"):
            try:
                parsed = datetime.datetime.strptime(person_data.get("birthday"), "%Y-%m-%d")
                formatted_birthday = parsed.strftime("%d %B %Y")
            except ValueError:
                formatted_birthday = person_data.get("birthday")

        formatted_deathday = ""
        if person_data.get("deathday"):
            try:
                parsed = datetime.datetime.strptime(person_data.get("deathday"), "%Y-%m-%d")
                formatted_deathday = parsed.strftime("%d %B %Y")
            except ValueError:
                formatted_deathday = person_data.get("deathday")

        return {
            "id": str(person_data.get("id")),
            "name": person_data.get("name"),
            "role": general_role,
            "age": calculate_age(person_data.get("birthday"), person_data.get("deathday")),
            "birthday": formatted_birthday,
            "birthday_raw": person_data.get("birthday"),
            "deathday": formatted_deathday,
            "deathday_raw": person_data.get("deathday"),
            "biography": person_data.get("biography"),
            "image": f"https://image.tmdb.org/t/p/original{person_data.get('profile_path')}" if person_data.get("profile_path") else None,
            "known_for": known_for,
            "related_media": related_media,
            "directed": directed,
            "produced": produced,
            "crew_credits": crew_credits,
            "assigned_media": [] # Empty when fetching freshly from API
        }

    except Exception as e:
        logger.error(f"Error fetching actor data for {actor_id}: {str(e)}")
        return None


def fetch_character_data(character_id):
    logger.info(
        f"fetch_character_data called with character_id: {character_id} (type: {type(character_id)})"
    )

    if character_id is None:
        logger.error("character_id is None")
        return None

    try:
        character_id_str = str(character_id)
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
        media_appearances = character.media_appearances or []
        for media in media_appearances:
            # Use dynamically fetched source if available, otherwise default to mal
            media_type = media.get("type", "").lower()
            m_anilist_id = media.get("anilist_id")
            m_mal_id = media.get("mal_id")

            if "url" not in media:
                if media_type in ["anime", "manga"]:
                    if m_anilist_id:
                        media["url"] = f"/anilist/{media_type}/{m_anilist_id}/"
                    elif m_mal_id:
                        media["url"] = f"/mal/{media_type}/{m_mal_id}/"
                    else:
                        media["url"] = "#" # Fallback if no ID is found
                else:
                    media["url"] = "#"
            
            # This logic remains the same
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

        # Get linked media from "Media Journal" database
        assigned_media = []
        links = MediaPersonLink.objects.filter(person=character).select_related('item')
        for link in links:
            item = link.item
            
            fmt_date = ""
            if item.release_date:
                try:
                    parsed = datetime.datetime.strptime(item.release_date, "%Y-%m-%d")
                    fmt_date = parsed.strftime("%b %Y")
                except ValueError:
                    fmt_date = item.release_date

            # Build correct URL based on Media Type and Source
            url = "#"
            if item.media_type in ["movie", "tv"]:
                if "_s" in str(item.source_id):
                    show_id, season_number = str(item.source_id).split("_s")
                    url = f"/tmdb/season/{show_id}/{season_number}/"
                else:
                    url = f"/tmdb/{item.media_type}/{item.source_id}/"
            elif item.media_type in ["anime", "manga"]:
                url = f"/{item.source}/{item.media_type}/{item.source_id}/"
            elif item.media_type == "game":
                url = f"/igdb/game/{item.source_id}/"
            elif item.media_type == "book":
                url = f"/openlib/book/{item.source_id}/"
            elif item.media_type == "music":
                url = f"/musicbrainz/music/{item.source_id}/"
            
            assigned_media.append({
                "id": item.id,
                "link_id": link.id,
                "title": item.title,
                "image": item.cover_url,
                "type_display": item.get_media_type_display(),
                "character": link.media_role or character.role or "Character",
                "media_role_raw": link.media_role or "",
                "formatted_date": fmt_date,
                "url": url, 
            })

        return {
            "id": character.person_id,
            "name": character.name,
            "role": character.role or "Character",
            "image": character.image_url,
            "description": character.description,
            "age": character.age,
            "media_appearances": media_appearances,
            "voice_actors": character.voice_actors or [],
            "assigned_media": assigned_media,
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
            media(sort: [START_DATE_DESC], perPage: 24) { # Fetch latest 24
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
            if not character_id_str or character_id_str == "None":
                logger.error(f"Character ID is None or empty: {character_id}")
                return None
            character_id_int = int(character_id_str)
            if character_id_int <= 0:
                logger.error(f"Character ID must be positive: {character_id_int}")
                return None
            variables = {"id": character_id_int} # Use generic 'id' for AniList API
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

        media_appearances = []
        voice_actors = []

        # No need for [:24] slicing here, as GraphQL query handles it
        for edge in character_data.get("media", {}).get("edges", []):
            node = edge.get("node", {})

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

            # Create URL based on both AniList and MAL IDs
            url = "#"
            node_anilist_id = node.get("id")
            node_mal_id = node.get("idMal")

            if media_type in ["anime", "manga"]:
                if node_anilist_id:
                    url = f"/anilist/{media_type}/{node_anilist_id}/"
                elif node_mal_id:
                    url = f"/mal/{media_type}/{node_mal_id}/"
            
            media_appearances.append({
                "id": node_anilist_id, # Use AniList ID as primary ID for appearances
                "mal_id": node_mal_id, # Also store MAL ID
                "title": node.get("title", {}).get("english") or node.get("title", {}).get("romaji"),
                "type": node.get("type"),
                "format": media_format,
                "type_display": media_format or media_type.title(),
                "image": node.get("coverImage", {}).get("large"),
                "character_role": edge.get("characterRole"),
                "release_date": release_date,
                "formatted_date": formatted_date,
                "url": url,
            })

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

        description = character_data.get("description", "")
        if description:
            # Markdown processing (unchanged)
            parts = description.split("__")
            result = []
            for i, part in enumerate(parts):
                if i % 2 == 1:
                    result.append(f"<strong>{part}</strong> ") if i == 1 else result.append(f"<br><strong>{part}</strong> ")
                else:
                    result.append(part)
            description = "".join(result)
            description = re.sub(r"~!([^!]+)!~", r'<span class="spoiler">\1</span>', description)
            description = re.sub(r"\[([^\]]+)\]\(([^\)]+)\)", r'<a href="\2" target="_blank">\1</a>', description)

        age = character_data.get("age")
        if age and isinstance(age, str) and age.endswith("-") and "-" not in age[:-1]:
            age = age[:-1]

        return {
            "id": str(character_data.get("id")),
            "name": character_data.get("name", {}).get("full"),
            "role": "Character",
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

    timestamp = int(time.time() * 1000)
    slug_name = slugify(name)

    additional_data = {}
    high_quality_image_url = image_url  
    
    if type == "actor" and person_id:
        actor_data = fetch_actor_data(person_id)
        if actor_data:
            high_quality_image_url = actor_data.get("image") or image_url
            additional_data = {
                "role": actor_data.get("role"),
                "age": actor_data.get("age"),
                "birthday": actor_data.get("birthday_raw") or actor_data.get("birthday"),
                "deathday": actor_data.get("deathday_raw") or actor_data.get("deathday"),
                "biography": actor_data.get("biography"),
                "known_for": actor_data.get("known_for"),
                "related_media": actor_data.get("related_media"),
                "directed": actor_data.get("directed"),
                "produced": actor_data.get("produced"),
                "crew_credits": actor_data.get("crew_credits"),
            }
    elif type == "character" and person_id:
        character_data = fetch_character_data(person_id)
        if character_data:
            high_quality_image_url = character_data.get("image") or image_url
            additional_data = {
                "role": character_data.get("role", "Character"),
                "description": character_data.get("description"),
                "age": character_data.get("age"),
                "media_appearances": character_data.get("media_appearances"),
                "voice_actors": character_data.get("voice_actors"),
            }

    ext = high_quality_image_url.split(".")[-1].split("?")[0]
    relative_path = f"favorites/{type}s/{slug_name}_{timestamp}.{ext}"

    local_url = download_image(high_quality_image_url, relative_path)
    final_image_url = local_url if local_url else high_quality_image_url

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
