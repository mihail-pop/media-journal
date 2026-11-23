from core.services.g_api_errors import ApiError, ApiClient, require_api_data
import time
from datetime import datetime, date

import requests
from django.http import JsonResponse
from django.utils import timezone

from core.models import MediaItem
from core.services.g_runtimes import positive_runtime
from core.services.g_utils import apply_initial_item_status, download_image
from core.services.g_relations import pack_relations


def save_anilist_item(media_type, anilist_id=None, mal_id=None, *, http=None, prepare_only=False, initial_status='planned'):
    try:
        data = fetch_anilist_data(media_type, anilist_id=anilist_id, mal_id=mal_id, http=http)

        canonical_id = data["anilist_id"]
        cache_bust = int(time.time() * 1000)
        # --- Download images
        local_poster = (
            download_image(
                data["poster_url"],
                f"posters/anilist_{media_type}_{canonical_id}_{cache_bust}.jpg",
            )
            if data["poster_url"]
            else ""
        )

        local_banner = (
            download_image(
                data["banner_url"],
                f"banners/anilist_{media_type}_{canonical_id}_{cache_bust}.jpg",
            )
            if data["banner_url"]
            else ""
        )

        cast = []
        for member in data["cast"][:8]:
            profile_url = member.get("profile_path")
            character_id = member.get("id", "unknown")
            local_path = ""
            if profile_url:
                # Use character ID instead of index to prevent mismatches
                filename = f"cast/anilist_{media_type}_{canonical_id}_{character_id}_{cache_bust}.jpg"
                local_path = download_image(profile_url, filename)

            cast.append(
                {
                    "name": member["name"],
                    "character": member["character"],
                    "profile_path": local_path,
                    "id": character_id,
                }
            )

        related_titles = []
        for related in data["related_titles"]:
            r_ref_id = related.get("anilist_id") or related.get("mal_id")
            poster_path = related["poster_path"]
            local_related_poster = (
                download_image(poster_path, f"related/anilist_{media_type}_{r_ref_id}_{cache_bust}.jpg")
                if poster_path
                else ""
            )

            related_titles.append(
                {
                    "anilist_id": related.get("anilist_id"),
                    "mal_id": related.get("mal_id"),
                    "title": related["title"],
                    "poster_path": local_related_poster,
                    "relation": related["relation"],
                    "media_type": related.get("media_type"),
                }
            )

        new_provider_ids = {"anilist": str(data["anilist_id"])}
        if data["mal_id"]:
            new_provider_ids["mal"] = str(data["mal_id"])

        # --- Save to DB
        item_data = dict(
            title=data["title"],
            media_type=media_type,
            source="anilist",
            provider_ids=new_provider_ids,
            cover_url=local_poster,
            banner_url=local_banner,
            overview=data["overview"],
            release_date=data["release_date"],
            cast=cast,
            seasons=None,
            related_titles=pack_relations(related_titles, data.get('has_extra_relations')),
            total_main=data.get("total_main"),
            total_secondary=data.get("total_secondary"),
            episode_runtime=data.get("episode_runtime") if media_type == "anime" else None,
            genres=data["genres"],
            creators=data["creators"],
        )
        if prepare_only:
            return {"item": item_data}
        apply_initial_item_status(item_data, initial_status)
        MediaItem.objects.create(**item_data)

        return JsonResponse({"message": "Saved to your list."})

    except ApiError:
        raise
    except Exception as e:
        return JsonResponse({"error": f"Save failed: {str(e)}"})


def fetch_anilist_data(media_type, anilist_id=None, mal_id=None, *, http=None, include_sections=False):
    # Determine which ID to use for the query
    if anilist_id:
        id_field = "id"
        search_id = int(anilist_id)
    elif mal_id:
        id_field = "idMal"
        search_id = int(mal_id)
    else:
        raise Exception("AniList Fetch: No ID provided (Anilist or MAL required).")

    query = """
    query ($id: Int, $type: MediaType) {
      Media(""" + id_field + """: $id, type: $type) {
        id
        idMal
        title {
          romaji
          english
        }
        description(asHtml: true)
        startDate {
          year
          month
          day
        }
        episodes
        duration
        chapters
        volumes
        bannerImage
        coverImage {
          extraLarge
        }
        genres
        studios(isMain: true) {
          nodes {
            name
          }
        }
        staff {
          edges {
            role
            node {
              id
              name {
                full
              }
            }
          }
        }
        characters(sort: [ROLE, RELEVANCE], perPage: 8) {
          edges {
            role
            node {
              id
              name {
                full
              }
              image {
                medium
              }
            }
          }
        }
        relations {
          edges {
            relationType
            node {
              id
              idMal
              title {
                english
                romaji
              }
              coverImage {
                large
              }
              type
            }
          }
        }
        recommendations(sort: RATING_DESC, perPage: 16) {
          edges {
            node {
              mediaRecommendation {
                id
                idMal
                title {
                  romaji
                  english
                }
                coverImage {
                  large
                }
                type
              }
            }
          }
        }
      }
    }
    """

    if include_sections:
        from core.services.g_details_sections import anilist_query, anilist_bundle
        query = anilist_query(id_field)
    variables = {"id": search_id, "type": media_type.upper()}
    if include_sections:
        variables['page'] = 1

    headers = {"Content-Type": "application/json"}

    response = (ApiClient('anilist', http)).post(
        "https://graphql.anilist.co",
        json={"query": query, "variables": variables},
        headers=headers,
    )

    if response.status_code == 429:
        raise Exception("HTTP 429 Too Many Requests: Rate Limit Exceeded")
    elif response.status_code != 200:
        raise Exception(f"AniList API request failed with status {response.status_code}.")

    payload = response.json()
    require_api_data(isinstance(payload.get('data'), dict) and 'Media' in payload['data'], 'anilist')
    media = payload['data']['Media']
    if not media:
        raise ApiError('anilist', 'not_found')
    require_api_data(isinstance(media, dict) and media.get('id') and isinstance(media.get('title'), dict)
                     and (media['title'].get('english') or media['title'].get('romaji')), 'anilist')

    # Title
    title = (
        media["title"].get("english") or media["title"].get("romaji") or "Unknown Title"
    )

    # Overview
    overview = media.get("description") or ""

    # Release Date
    start = media.get("startDate")
    if start and start.get("year"):
        release_date = (
            f"{start['year']}-{start['month'] or 1:02}-{start['day'] or 1:02}"
        )
    else:
        release_date = ""

    # Poster & Banner
    poster_url = media.get("coverImage", {}).get("extraLarge")
    banner_url = media.get("bannerImage")

    # Cast
    cast = []
    for edge in media.get("characters", {}).get("edges", []):
        character = edge["node"]
        cast.append(
            {
                "name": character["name"]["full"],
                "character": edge.get("role", ""),
                "profile_path": character["image"]["medium"],
                "is_full_url": True,
                "id": character.get("id"),
            }
        )

# Related Titles
    related_titles = []
    for rel in media.get("relations", {}).get("edges", []):
        relation_type = rel.get("relationType", "").lower()
        if relation_type in ("prequel", "sequel"):
            node = rel["node"]
            r_anilist_id = node.get("id")
            r_mal_id = node.get("idMal")

            if not r_anilist_id and not r_mal_id:
                continue

            r_title = (
                node["title"].get("english")
                or node["title"].get("romaji")
                or "Unknown Title"
            )
            r_poster = node["coverImage"].get("large") or ""

            related_titles.append(
                {
                    "anilist_id": r_anilist_id,
                    "mal_id": r_mal_id,
                    "title": r_title,
                    "poster_path": r_poster,
                    "relation": relation_type.capitalize(),
                    "is_full_url": True,
                    "media_type": node.get("type", "").lower() if node.get("type") else media_type.lower(),
                }
            )

    # Recommendations
    recommendations = []
    for edge in media.get("recommendations", {}).get("edges", []):
        node = edge.get("node", {}).get("mediaRecommendation")
        if not node:
            continue
            
        rec_anilist_id = node.get("id")
        rec_mal_id = node.get("idMal")

        if not rec_anilist_id and not rec_mal_id:
            continue

        rec_title = (
            node["title"].get("english")
            or node["title"].get("romaji")
            or "Unknown Title"
        )
        rec_poster = node["coverImage"].get("large") or ""

        recommendations.append(
            {
                "anilist_id": rec_anilist_id,
                "mal_id": rec_mal_id,
                "title": rec_title,
                "poster_path": rec_poster,
                "is_full_url": True,
                "media_type": node.get("type", "").lower() if node.get("type") else media_type.lower(),
            }
        )

    genres = media.get("genres") or list()
    creators = list()
    
    if media_type.lower() == "anime":
        # Anime = Main Studio
        studios = media.get("studios") or dict()
        nodes = studios.get("nodes") or list()
        
        for s in nodes:
            if s and s.get("name"):
                creators.append(s["name"])
    else:
        # Manga = Original Creator / Story & Art
        staff = media.get("staff") or dict()
        edges = staff.get("edges") or list()
        
        # Exact roles that designate the main creator(s)
        valid_roles =[
            "story & art", 
            "story", 
            "art", 
            "original creator", 
            "original story"
        ]
        
        for edge in edges:
            if not edge:
                continue
                
            # Safely handle null roles and strip whitespace
            raw_role = edge.get("role")
            if not raw_role:
                continue
            
            # Clean the role: lowercase and remove leading/trailing spaces
            role = str(raw_role).lower().strip()
            
            # Safely navigate nested dictionaries for the name
            node = edge.get("node") or dict()
            name_dict = node.get("name") or dict()
            name = name_dict.get("full")
            
            # Use exact matching in our valid_roles list instead of loose substring matching
            if name and role in valid_roles:
                if name not in creators:
                    creators.append(name)

    return {
        "anilist_id": media.get("id"),
        "mal_id": media.get("idMal"),
        "title": title,
        "overview": overview,
        "release_date": release_date,
        "poster_url": poster_url,
        "banner_url": banner_url,
        "cast": cast,
        "related_titles": related_titles,
        "has_extra_relations": any(edge.get('relationType') not in ('PREQUEL', 'SEQUEL')
            and ((edge.get('node') or {}).get('id') or (edge.get('node') or {}).get('idMal'))
            for edge in (media.get('relations') or {}).get('edges', [])),
        "recommendations": recommendations,
        "total_main": media.get("episodes") or media.get("chapters"),
        "total_secondary": media.get("volumes"),
        "episode_runtime": positive_runtime(media.get("duration")) if media_type == "anime" else None,
        "genres": genres,
        "creators": creators,
        **({'details_bundle': anilist_bundle(media, media_type)} if include_sections else {}),
    }


def get_anilist_discover(
    media_type,
    page,
    query="",
    sort="TRENDING_DESC",
    season="",
    year="",
    format_filter="",
    status="",
    genre="",
    allow_adult=True,
):
    query_text = """
    query ($page: Int, $search: String, $type: MediaType, $sort: [MediaSort], $season: MediaSeason, $seasonYear: Int, $startDate_like: String, $format: MediaFormat, $status: MediaStatus, $genre: String, $isAdult: Boolean) {
      Page(page: $page, perPage: 20) {
        media(search: $search, type: $type, sort: $sort, season: $season, seasonYear: $seasonYear, startDate_like: $startDate_like, format: $format, status: $status, genre: $genre, isAdult: $isAdult) {
          id
          idMal
          title {
            english
            romaji
          }
          coverImage {
            large
          }
          bannerImage
          description(asHtml: false)
          averageScore
          startDate {
            year
            month
            day
          }
          genres
          nextAiringEpisode {
            episode
            airingAt
          }
          status
        }
      }
    }
    """

    variables = {
        "page": page,
        "type": media_type.upper(),
        "sort": [sort] if sort else ["TRENDING_DESC"],
    }

    # Include everything by omitting the filter, not by sending null.
    if not allow_adult:
        variables['isAdult'] = False

    if query:
        variables["search"] = query
    
    # Season and year logic
    if season and media_type.lower() == "anime":
        variables["season"] = season
        # When season is selected, use seasonYear
        if year:
            variables["seasonYear"] = int(year)
        else:
            # Default to current year if season selected but no year
            variables["seasonYear"] = datetime.now().year
    elif year:
        # Year filtering: anime uses seasonYear, manga uses startDate_like
        if media_type.lower() == "anime":
            variables["seasonYear"] = int(year)
        else:  # manga
            variables["startDate_like"] = f"{year}%"
    
    if format_filter:
        variables["format"] = format_filter
    if status:
        variables["status"] = status
    if genre:
        variables["genre"] = genre

    headers = {"Content-Type": "application/json"}

    try:
        response = ApiClient('anilist').post(
            "https://graphql.anilist.co",
            json={"query": query_text, "variables": variables},
            headers=headers,
        )

        if response.status_code != 200:
            return {"results": [], "hasMore": False}

        data = response.json()
        raw_media = data.get("data", {}).get("Page", {}).get("media", [])
        require_api_data(isinstance(data.get('data', {}).get('Page', {}).get('media'), list), 'anilist')
        results = []

        for media in raw_media:
            anilist_id = media.get("id")
            mal_id = media.get("idMal")

            if not anilist_id:
                continue

            title = (
                media["title"].get("english")
                or media["title"].get("romaji")
                or "Unknown Title"
            )
            poster = media.get("coverImage", {}).get("large")

            # Convert score to 1-10 scale
            score = media.get("averageScore")
            if score:
                score = round(score / 10, 1)

            # Format release date
            start_date = media.get("startDate")
            release_date = ""
            if start_date and start_date.get("year"):
                month = start_date.get("month") or 1
                day = start_date.get("day") or 1
                release_date = f"{start_date['year']}-{month:02d}-{day:02d}"

            # Next airing info
            next_airing = None
            next_ep_data = media.get("nextAiringEpisode")
            if next_ep_data and next_ep_data.get("airingAt"):
                airing_datetime = datetime.fromtimestamp(next_ep_data["airingAt"])
                today_date = date.today()
                airing_date = airing_datetime.date()
                delta = (airing_date - today_date).days
                day_of_week = airing_datetime.strftime("%A")

                if delta > 1:
                    next_airing = f"{day_of_week} (in {delta} days)"
                elif delta == 1:
                    next_airing = f"{day_of_week} (tomorrow)"
                elif delta == 0:
                    next_airing = f"{day_of_week} (today)"
                else:
                    next_airing = "Aired"

            results.append(
                {
                    "source": "anilist",
                    "id": str(anilist_id),
                    "mal_id": str(mal_id) if mal_id else None,
                    "title": title,
                    "poster_path": poster,
                    "backdrop_path": media.get("bannerImage"),
                    "media_type": media_type,
                    "overview": media.get("description", ""),
                    "score": score,
                    "release_date": release_date,
                    "genres": media.get("genres", []),
                    "next_airing": next_airing,
                    "next_episode": next_ep_data if next_ep_data else None,
                    "status": media.get("status"),
                }
            )

        return {"results": results, "hasMore": len(raw_media) > 0}
    except ApiError:
        raise
    except Exception as error:
        raise ApiError('anilist') from error


def update_anilist_anime_manga(item: MediaItem):
    if item.media_type not in ["anime", "manga"]:
        return  # Not an anime/manga, skip

    a_id = item.provider_ids.get("anilist")
    m_id = item.provider_ids.get("mal")
    
    if (a_id and str(a_id).startswith("custom_")) or (m_id and str(m_id).startswith("custom_")):
        item.last_updated = timezone.now()
        item.save()
        return

    try:
        anilist_data = fetch_anilist_data(item.media_type, anilist_id=a_id, mal_id=m_id)
        
        # Heal IDs and source if they were missing/old
        item.provider_ids["anilist"] = str(anilist_data["anilist_id"])
        if anilist_data["mal_id"]:
            item.provider_ids["mal"] = str(anilist_data["mal_id"])
        item.source = "anilist"
        
    except (requests.exceptions.RequestException, ApiError) as e:
        print(f"[AniList Update] Network error for {item.title}: {e}")
        item.last_updated = timezone.now()  # Prevent retry storm
        item.save()
        return
    except Exception as e:
        print(f"[AniList Update] Unexpected error for {item.title}: {e}")
        item.last_updated = timezone.now()
        item.save()
        return

    existing = item.related_entries
    existing_anilist_ids = {str(r["anilist_id"]) for r in existing if r.get("anilist_id")}
    existing_mal_ids = {str(r["mal_id"]) for r in existing if r.get("mal_id")}

    new_sequels = []
    cache_bust = int(time.time() * 1000)

    for rel in anilist_data.get("related_titles", []):
        if rel["relation"].lower() != "sequel":
            continue

        r_anilist_id = str(rel.get("anilist_id")) if rel.get("anilist_id") else None
        r_mal_id = str(rel.get("mal_id")) if rel.get("mal_id") else None

        # Check if already present via either ID
        if (r_anilist_id and r_anilist_id in existing_anilist_ids) or \
           (r_mal_id and r_mal_id in existing_mal_ids):
            continue  

        # Download image using anilist ID as preference for filename
        poster_path = rel.get("poster_path")
        ref_id = r_anilist_id or r_mal_id
        local_path = (
            download_image(poster_path, f"related/anilist_{item.media_type}_{ref_id}_{cache_bust}.jpg")
            if poster_path
            else ""
        )

        new_sequels.append(
            {
                "anilist_id": r_anilist_id,
                "mal_id": r_mal_id,
                "title": rel["title"],
                "poster_path": local_path,
                "relation": "Sequel",
                "media_type": rel.get("media_type"),
            }
        )

    if new_sequels:
        print(
            f"[AniList Update] Found {len(new_sequels)} new sequel(s) for {item.title}"
        )
        item.notification = True

    item.related_titles = pack_relations(existing + new_sequels, anilist_data.get('has_extra_relations'))

    if item.media_type == "anime" and anilist_data.get("episode_runtime"):
        item.episode_runtime = anilist_data["episode_runtime"]

    item.last_updated = timezone.now()
    item.save()
