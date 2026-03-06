import time
import datetime

import requests
from django.http import JsonResponse
from django.utils import timezone

from core.models import MediaItem
from core.services.g_utils import download_image


def save_anilist_item(media_type, mal_id):
    try:
        anilist_data = fetch_anilist_data(mal_id, media_type)

        cache_bust = int(time.time() * 1000)
        # --- Download images
        local_poster = (
            download_image(
                anilist_data["poster_url"],
                f"posters/mal_{media_type}_{mal_id}_{cache_bust}.jpg",
            )
            if anilist_data["poster_url"]
            else ""
        )

        local_banner = (
            download_image(
                anilist_data["banner_url"],
                f"banners/mal_{media_type}_{mal_id}_{cache_bust}.jpg",
            )
            if anilist_data["banner_url"]
            else ""
        )

        cast = []
        for member in anilist_data["cast"][:8]:
            profile_url = member.get("profile_path")
            character_id = member.get("id", "unknown")
            local_path = ""
            if profile_url:
                # Use character ID instead of index to prevent mismatches
                filename = f"cast/mal_{media_type}_{mal_id}_{character_id}.jpg"
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
        for related in anilist_data["related_titles"]:
            r_id = related["mal_id"]
            poster_path = related["poster_path"]
            local_related_poster = (
                download_image(poster_path, f"related/mal_{media_type}_{r_id}.jpg")
                if poster_path
                else ""
            )

            related_titles.append(
                {
                    "mal_id": r_id,
                    "title": related["title"],
                    "poster_path": local_related_poster,
                    "relation": related["relation"],
                }
            )

        # --- Save to DB
        MediaItem.objects.create(
            title=anilist_data["title"],
            media_type=media_type,
            source="mal",  # Still marked as "mal" for consistency
            source_id=mal_id,
            cover_url=local_poster,
            banner_url=local_banner,
            overview=anilist_data["overview"],
            release_date=anilist_data["release_date"],
            cast=cast,
            seasons=None,
            related_titles=related_titles,
            total_main=anilist_data.get("total_main"),
            total_secondary=anilist_data.get("total_secondary"),
        )

        return JsonResponse({"message": "Saved to your list."})

    except Exception as e:
        return JsonResponse({"error": f"Save failed: {str(e)}"})


def fetch_anilist_data(mal_id, media_type):
    query = """
    query ($malId: Int, $type: MediaType) {
      Media(idMal: $malId, type: $type) {
        id
        title {
          romaji
          english
        }
        description(asHtml: false)
        startDate {
          year
          month
          day
        }
        episodes
        chapters
        volumes
        bannerImage
        coverImage {
          extraLarge
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
                idMal
                title {
                  romaji
                  english
                }
                coverImage {
                  large
                }
              }
            }
          }
        }
      }
    }
    """

    variables = {"malId": int(mal_id), "type": media_type.upper()}

    headers = {"Content-Type": "application/json"}

    response = requests.post(
        "https://graphql.anilist.co",
        json={"query": query, "variables": variables},
        headers=headers,
    )

    if response.status_code != 200:
        raise Exception("AniList API request failed.")

    media = response.json().get("data", {}).get("Media")
    if not media:
        raise Exception("AniList: No data found for this ID.")

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
            r_id = node.get("idMal")
            if not r_id:
                continue

            r_title = (
                node["title"].get("english")
                or node["title"].get("romaji")
                or "Unknown Title"
            )
            r_poster = node["coverImage"].get("large") or ""

            related_titles.append(
                {
                    "mal_id": r_id,
                    "title": r_title,
                    "poster_path": r_poster,
                    "relation": relation_type.capitalize(),
                    "is_full_url": True,
                }
            )

    # Recommendations
    recommendations = []
    for edge in media.get("recommendations", {}).get("edges", []):
        node = edge.get("node", {}).get("mediaRecommendation")
        if not node or not node.get("idMal"):
            continue

        rec_id = node["idMal"]
        rec_title = (
            node["title"].get("english")
            or node["title"].get("romaji")
            or "Unknown Title"
        )
        rec_poster = node["coverImage"].get("large") or ""

        recommendations.append(
            {
                "id": rec_id,
                "title": rec_title,
                "poster_path": rec_poster,
                "is_full_url": True,
            }
        )

    return {
        "title": title,
        "overview": overview,
        "release_date": release_date,
        "poster_url": poster_url,
        "banner_url": banner_url,
        "cast": cast,
        "related_titles": related_titles,
        "recommendations": recommendations,
        "total_main": media.get("episodes") or media.get("chapters"),
        "total_secondary": media.get("volumes"),
    }


def get_anime_extra_info(mal_id):
    query = """
    query ($idMal: Int) {
      Media(idMal: $idMal, type: ANIME) {
        status
        averageScore
        format
        genres
        nextAiringEpisode {
          episode
          airingAt
        }
        studios(isMain: true) {
          nodes {
            name
          }
        }
        staff {
          edges {
            role
            node {
              name {
                full
              }
            }
          }
        }
        externalLinks {
          site
          url
          language
        }
        trailer {
          id
          site
          thumbnail
        }
        relations {
          edges {
            relationType
            node {
              idMal
              title {
                romaji
                english
              }
              type
              format
              status
              coverImage {
                large
              }
            }
          }
        }
        recommendations(sort: RATING_DESC, perPage: 16) {
          edges {
            node {
              mediaRecommendation {
                idMal
                title {
                  romaji
                  english
                }
                coverImage {
                  large
                }
              }
            }
          }
        }
      }
    }
    """

    variables = {"idMal": int(mal_id)}
    headers = {"Content-Type": "application/json"}

    try:
        response = requests.post(
            "https://graphql.anilist.co",
            json={"query": query, "variables": variables},
            headers=headers,
        )
        if response.status_code != 200:
            return {}

        data = response.json().get("data", {}).get("Media", {})

        # Next airing
        next_airing_data = data.get("nextAiringEpisode")
        if next_airing_data and next_airing_data.get("airingAt"):
            next_airing_timestamp = next_airing_data["airingAt"]
            next_airing = datetime.fromtimestamp(next_airing_timestamp).strftime(
                "%A %d %B %Y"
            )
            next_episode = next_airing_data.get("episode")
        else:
            next_airing = None
            next_episode = None

        # External links
        external_links = []
        for link in data.get("externalLinks", []):
            if link.get("site") and link.get("url"):
                external_links.append(
                    {
                        "site": link["site"],
                        "url": link["url"],
                        "language": link.get("language") or "",
                    }
                )

        # Staff
        staff_list = [
            f"{edge['node']['name']['full']} ({edge['role']})"
            for edge in data.get("staff", {}).get("edges", [])
            if edge.get("node") and edge["node"].get("name") and edge.get("role")
        ]

        # Trailers
        trailer_data = data.get("trailer") or {}
        trailers = []
        if (
            trailer_data
            and trailer_data.get("id")
            and trailer_data.get("site") == "youtube"
        ):
            trailers.append(
                {
                    "youtube_id": trailer_data.get("id"),
                    "thumbnail": trailer_data.get("thumbnail"),
                    "url": f"https://www.youtube.com/watch?v={trailer_data['id']}",
                }
            )

        # Relations (excluding SEQUEL/PREQUEL)
        relations_list = []
        for edge in data.get("relations", {}).get("edges", []):
            node = edge.get("node")
            if not node or edge.get("relationType") in ["SEQUEL", "PREQUEL"]:
                continue

            relation_type = edge["relationType"]
            # Determine display type
            display_type = (
                "Source"
                if relation_type == "ADAPTATION"
                else relation_type.replace("_", " ").title()
            )

            relations_list.append(
                {
                    "relation_type": relation_type,
                    "display_relation_type": display_type,
                    "id": node.get("idMal"),
                    "title": node["title"].get("english")
                    or node["title"].get("romaji"),
                    "type": node.get("type"),
                    "format": node.get("format"),
                    "status": node.get("status"),
                    "cover": node.get("coverImage", {}).get("large"),
                }
            )

        # Sort relations by custom order
        relation_order = [
            "Source",
            "Prequel",
            "Sequel",
            "Adaptation",
            "Side Story",
            "Summary",
            "Spin-Off",
            "Alternative",
            "Character",
            "Other",
        ]

        def sort_key(rel):
            t = rel.get("display_relation_type") or rel["relation_type"]
            return relation_order.index(t) if t in relation_order else 999

        relations_list.sort(key=sort_key)

        # Process recommendations
        recommendations = []
        for edge in data.get("recommendations", {}).get("edges", []):
            node = edge.get("node", {}).get("mediaRecommendation")
            if node and node.get("idMal"):
                recommendations.append(
                    {
                        "id": node["idMal"],
                        "title": node["title"].get("english")
                        or node["title"].get("romaji"),
                        "poster_path": node.get("coverImage", {}).get("large"),
                    }
                )

        return {
            "external_links": external_links,
            "status": data.get("status"),
            "averageScore": round(data.get("averageScore", 0) / 10, 1)
            if data.get("averageScore") is not None
            else None,
            "format": data.get("format"),
            "genres": data.get("genres", []),
            "studios": [
                studio["name"] for studio in data.get("studios", {}).get("nodes", [])
            ],
            "staff": staff_list,
            "trailers": trailers,
            "relations": relations_list,
            "next_airing": next_airing,
            "next_episode": next_episode,
            "recommendations": recommendations,
        }

    except Exception as e:
        print(f"Error in get_anime_extra_info: {e}")
        return {}


def get_manga_extra_info(mal_id):
    query = """
    query ($idMal: Int) {
      Media(idMal: $idMal, type: MANGA) {
        status
        averageScore
        format
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
              name {
                full
              }
            }
          }
        }
        externalLinks {
          site
          url
          language
        }
        trailer {
          id
          site
          thumbnail
        }
        relations {
          edges {
            relationType
            node {
              idMal
              title {
                english
                romaji
              }
              type
              format
              status
              coverImage {
                large
              }
            }
          }
        }
        recommendations(sort: RATING_DESC, perPage: 16) {
          edges {
            node {
              mediaRecommendation {
                idMal
                title {
                  romaji
                  english
                }
                coverImage {
                  large
                }
              }
            }
          }
        }
      }
    }
    """

    variables = {"idMal": int(mal_id)}
    headers = {"Content-Type": "application/json"}

    try:
        response = requests.post(
            "https://graphql.anilist.co",
            json={"query": query, "variables": variables},
            headers=headers,
        )
        if response.status_code != 200:
            return {}

        data = response.json().get("data", {}).get("Media", {})

        # External links
        external_links = []
        for link in data.get("externalLinks", []):
            if link.get("site") and link.get("url"):
                external_links.append(
                    {
                        "site": link["site"],
                        "url": link["url"],
                        "language": link.get("language") or "",
                    }
                )

        # Staff
        staff_list = [
            f"{edge['node']['name']['full']} ({edge['role']})"
            for edge in data.get("staff", {}).get("edges", [])
            if edge.get("node") and edge["node"].get("name") and edge.get("role")
        ]

        # Trailers
        trailer_data = data.get("trailer") or {}
        trailers = []
        if (
            trailer_data
            and trailer_data.get("id")
            and trailer_data.get("site") == "youtube"
        ):
            trailers.append(
                {
                    "youtube_id": trailer_data.get("id"),
                    "thumbnail": trailer_data.get("thumbnail"),
                    "url": f"https://www.youtube.com/watch?v={trailer_data['id']}",
                }
            )

        # Relations (excluding SEQUEL/PREQUEL)
        relations_list = []
        for edge in data.get("relations", {}).get("edges", []):
            node = edge.get("node")
            if not node or edge.get("relationType") in ["SEQUEL", "PREQUEL"]:
                continue

            relation_type = edge["relationType"]
            # For manga, display Adaptation for adaptations
            display_type = (
                "Adaptation"
                if relation_type == "ADAPTATION"
                else relation_type.replace("_", " ").title()
            )

            relations_list.append(
                {
                    "relation_type": relation_type,
                    "display_relation_type": display_type,
                    "id": node.get("idMal"),
                    "title": node["title"].get("english")
                    or node["title"].get("romaji"),
                    "type": node.get("type"),
                    "format": node.get("format"),
                    "status": node.get("status"),
                    "cover": node.get("coverImage", {}).get("large"),
                }
            )

        # Sort relations by custom order
        relation_order = [
            "Source",
            "Prequel",
            "Sequel",
            "Adaptation",
            "Side Story",
            "Summary",
            "Spin-Off",
            "Alternative",
            "Character",
            "Other",
        ]

        def sort_key(rel):
            t = rel.get("display_relation_type") or rel["relation_type"]
            return relation_order.index(t) if t in relation_order else 999

        relations_list.sort(key=sort_key)

        # Process recommendations
        recommendations = []
        for edge in data.get("recommendations", {}).get("edges", []):
            node = edge.get("node", {}).get("mediaRecommendation")
            if node and node.get("idMal"):
                recommendations.append(
                    {
                        "id": node["idMal"],
                        "title": node["title"].get("english")
                        or node["title"].get("romaji"),
                        "poster_path": node.get("coverImage", {}).get("large"),
                    }
                )

        return {
            "external_links": external_links,
            "status": data.get("status"),
            "averageScore": round(data.get("averageScore", 0) / 10, 1)
            if data.get("averageScore") is not None
            else None,
            "format": data.get("format"),
            "genres": data.get("genres", []),
            "studios": [
                studio["name"] for studio in data.get("studios", {}).get("nodes", [])
            ],
            "staff": staff_list,
            "trailers": trailers,
            "relations": relations_list,
            "recommendations": recommendations,
        }

    except Exception as e:
        print(f"Error in get_manga_extra_info: {e}")
        return {}


def get_anilist_discover(
    media_type,
    page,
    query="",
    sort="TRENDING_DESC",
    season="",
    year="",
    format_filter="",
    status="",
):
    query_text = """
    query ($page: Int, $search: String, $type: MediaType, $sort: [MediaSort], $season: MediaSeason, $seasonYear: Int, $format: MediaFormat, $status: MediaStatus) {
      Page(page: $page, perPage: 20) {
        media(search: $search, type: $type, sort: $sort, season: $season, seasonYear: $seasonYear, format: $format, status: $status) {
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

    if query:
        variables["search"] = query
    if season:
        variables["season"] = season
    if year:
        variables["seasonYear"] = int(year)
    if format_filter:
        variables["format"] = format_filter
    if status:
        variables["status"] = status

    headers = {"Content-Type": "application/json"}

    try:
        response = requests.post(
            "https://graphql.anilist.co",
            json={"query": query_text, "variables": variables},
            headers=headers,
        )

        if response.status_code != 200:
            return {"results": [], "hasMore": False}

        data = response.json()
        raw_media = data.get("data", {}).get("Page", {}).get("media", [])
        results = []

        for media in raw_media:
            # Use MAL ID if available, otherwise use AniList ID with 'al_' prefix
            mal_id = media.get("idMal")
            anilist_id = media.get("id")

            if mal_id:
                item_id = str(mal_id)
            elif anilist_id:
                item_id = f"al_{anilist_id}"
            else:
                continue  # Skip if no ID at all

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
            next_episode = media.get("nextAiringEpisode")
            if next_episode and next_episode.get("airingAt"):
                from datetime import datetime

                next_airing = datetime.fromtimestamp(next_episode["airingAt"]).strftime(
                    "%d %b %Y"
                )

            results.append(
                {
                    "id": item_id,
                    "title": title,
                    "poster_path": poster,
                    "backdrop_path": media.get("bannerImage"),
                    "media_type": media_type,
                    "overview": media.get("description", ""),
                    "score": score,
                    "release_date": release_date,
                    "genres": media.get("genres", []),
                    "next_airing": next_airing,
                    "status": media.get("status"),
                }
            )

        # Add hasMore flag based on raw AniList data, not filtered results
        return {"results": results, "hasMore": len(raw_media) == 20}
    except Exception:
        return {"results": [], "hasMore": False}


def update_mal_anime_manga(item: MediaItem):
    if item.source != "mal" or item.media_type not in ["anime", "manga"]:
        return  # Not a MAL anime/manga, skip

    try:
        anilist_data = fetch_anilist_data(item.source_id, item.media_type)
    except requests.exceptions.RequestException as e:
        print(f"[AniList Update] Network error for {item.title}: {e}")
        item.last_updated = timezone.now()  # Prevent retry storm
        item.save()
        return
    except Exception as e:
        print(f"[AniList Update] Unexpected error for {item.title}: {e}")
        item.last_updated = timezone.now()
        item.save()
        return

    existing = item.related_titles or []
    existing_ids = {r["mal_id"] for r in existing if "mal_id" in r}

    new_sequels = []
    for rel in anilist_data.get("related_titles", []):
        if rel["relation"].lower() != "sequel":
            continue

        if rel["mal_id"] in existing_ids:
            continue  # already present

        # Download image if needed
        poster_path = rel.get("poster_path")
        local_path = (
            download_image(poster_path, f"related/mal_{rel['mal_id']}.jpg")
            if poster_path
            else ""
        )

        new_sequels.append(
            {
                "mal_id": rel["mal_id"],
                "title": rel["title"],
                "poster_path": local_path,
                "relation": "Sequel",
            }
        )

    if new_sequels:
        print(
            f"[AniList Update] Found {len(new_sequels)} new sequel(s) for {item.title}"
        )
        item.related_titles = existing + new_sequels
        item.notification = True

    item.last_updated = timezone.now()
    item.save()
