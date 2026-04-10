import time
from datetime import datetime, date

import requests
from django.http import JsonResponse
from django.utils import timezone

from core.models import MediaItem
from core.services.g_utils import download_image


def save_anilist_item(media_type, anilist_id=None, mal_id=None):
    try:
        data = fetch_anilist_data(media_type, anilist_id=anilist_id, mal_id=mal_id)

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
                }
            )

        new_provider_ids = {"anilist": str(data["anilist_id"])}
        if data["mal_id"]:
            new_provider_ids["mal"] = str(data["mal_id"])

        # --- Save to DB
        MediaItem.objects.create(
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
            related_titles=related_titles,
            total_main=data.get("total_main"),
            total_secondary=data.get("total_secondary"),
        )

        return JsonResponse({"message": "Saved to your list."})

    except Exception as e:
        return JsonResponse({"error": f"Save failed: {str(e)}"})


def fetch_anilist_data(media_type, anilist_id=None, mal_id=None):
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
              }
            }
          }
        }
      }
    }
    """

    variables = {"id": search_id, "type": media_type.upper()}

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
        raise Exception(f"AniList: No entry found for {id_field} {search_id}")

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
            }
        )

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
        "recommendations": recommendations,
        "total_main": media.get("episodes") or media.get("chapters"),
        "total_secondary": media.get("volumes"),
    }


def get_anime_extra_info(media_type, anilist_id=None, mal_id=None):
    # Determine which ID field to use for the query
    if anilist_id:
        id_field = "id"
        search_id = int(anilist_id)
    elif mal_id:
        id_field = "idMal"
        search_id = int(mal_id)
    else:
        return {}

    query = """
    query ($id: Int, $type: MediaType) {
      Media(""" + id_field + """: $id, type: $type) {
        id
        idMal
        status
        averageScore
        format
        episodes
        duration
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
              id
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
                id
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

    variables = {"id": search_id, "type": media_type.upper()}
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
        if not data:
            return {}

        # --- Next Airing Logic ---
        next_airing = None
        next_episode = None
        next_airing_data = data.get("nextAiringEpisode")
        if next_airing_data and next_airing_data.get("airingAt"):
            airing_dt = datetime.fromtimestamp(next_airing_data["airingAt"])
            diff = airing_dt - datetime.now()
            if diff.total_seconds() > 0:
                days = diff.days
                hours, remainder = divmod(diff.seconds, 3600)
                minutes, _ = divmod(remainder, 60)
                parts = []
                if days > 0: 
                    parts.append(f"{days}d")
                if hours > 0: 
                    parts.append(f"{hours}h")
                parts.append(f"{minutes}m")
                next_airing = f"{airing_dt.strftime('%A')} ({' '.join(parts)})"
            else:
                next_airing = "Aired"
            next_episode = next_airing_data.get("episode")

        # --- External Links & Staff ---
        external_links = [
            {"site": l["site"], "url": l["url"], "language": l.get("language") or ""}
            for l in data.get("externalLinks", [])
            # Ensure the keys exist
            if l.get("site") and l.get("url")
            # Perform security check on the URL
            and l["url"].startswith(('http://', 'https://', '/'))
        ]
        staff_list = [
            f"{e['node']['name']['full']} ({e['role']})"
            for e in data.get("staff", {}).get("edges", [])
            if e.get("node") and e["node"].get("name") and e.get("role")
        ]

        # --- Trailers ---
        trailers = []
        t_data = data.get("trailer") or {}
        if t_data and t_data.get("site") == "youtube":
            trailers.append({
                "youtube_id": t_data.get("id"),
                "thumbnail": t_data.get("thumbnail"),
                "url": f"https://www.youtube.com/watch?v={t_data.get('id')}",
            })

        # --- Relations (Supporting both IDs) ---
        relations_list = []
        for edge in data.get("relations", {}).get("edges", []):
            node = edge.get("node")
            if not node or edge.get("relationType") in ["SEQUEL", "PREQUEL"]:
                continue

            rel_type = edge["relationType"]
            display_type = "Source" if rel_type == "ADAPTATION" else rel_type.replace("_", " ").title()

            relations_list.append({
                "relation_type": rel_type,
                "display_relation_type": display_type,
                "id": node.get("id"),
                "mal_id": node.get("idMal"),
                "title": node["title"].get("english") or node["title"].get("romaji"),
                "type": node.get("type"),
                "format": node.get("format"),
                "status": node.get("status"),
                "cover": node.get("coverImage", {}).get("large"),
            })

        # Sort relations
        relation_order = ["Source", "Prequel", "Sequel", "Adaptation", "Side Story", "Summary", "Spin-Off", "Alternative", "Character", "Other"]
        relations_list.sort(key=lambda r: relation_order.index(r["display_relation_type"]) if r["display_relation_type"] in relation_order else 999)

        # --- Recommendations (Supporting both IDs) ---
        recommendations = []
        for edge in data.get("recommendations", {}).get("edges", []):
            node = edge.get("node", {}).get("mediaRecommendation")
            if node:
                recommendations.append({
                    "id": node.get("id"),
                    "mal_id": node.get("idMal"),
                    "title": node["title"].get("english") or node["title"].get("romaji"),
                    "poster_path": node.get("coverImage", {}).get("large"),
                })

        return {
            "external_links": external_links,
            "status": data.get("status"),
            "averageScore": round(data.get("averageScore", 0) / 10, 1) if data.get("averageScore") else None,
            "format": data.get("format"),
            "episodes": data.get("episodes"),
            "duration": data.get("duration"),
            "genres": data.get("genres", []),
            "studios": [s["name"] for s in data.get("studios", {}).get("nodes", [])],
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


def get_manga_extra_info(media_type, anilist_id=None, mal_id=None):
    # Determine which ID field to use for the query
    if anilist_id:
        id_field = "id"
        search_id = int(anilist_id)
    elif mal_id:
        id_field = "idMal"
        search_id = int(mal_id)
    else:
        return {}

    query = """
    query ($id: Int, $type: MediaType) {
      Media(""" + id_field + """: $id, type: $type) {
        id
        idMal
        status
        averageScore
        format
        chapters
        volumes
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
              id
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
                id
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

    variables = {"id": search_id, "type": media_type.upper()}
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
        if not data:
            return {}

        # --- External Links ---
        external_links = [
            {"site": l["site"], "url": l["url"], "language": l.get("language") or ""}
            for l in data.get("externalLinks", [])
            if l.get("site") and l.get("url")
            and l["url"].startswith(('http://', 'https://', '/'))
        ]

        # --- Staff ---
        staff_list = [
            f"{e['node']['name']['full']} ({e['role']})"
            for e in data.get("staff", {}).get("edges", [])
            if e.get("node") and e["node"].get("name") and e.get("role")
        ]

        # --- Trailers ---
        trailers = []
        t_data = data.get("trailer") or {}
        if t_data and t_data.get("site") == "youtube":
            trailers.append({
                "youtube_id": t_data.get("id"),
                "thumbnail": t_data.get("thumbnail"),
                "url": f"https://www.youtube.com/watch?v={t_data.get('id')}",
            })

        # --- Relations (Supporting both IDs) ---
        relations_list = []
        for edge in data.get("relations", {}).get("edges", []):
            node = edge.get("node")
            if not node or edge.get("relationType") in ["SEQUEL", "PREQUEL"]:
                continue

            rel_type = edge["relationType"]
            display_type = "Adaptation" if rel_type == "ADAPTATION" else rel_type.replace("_", " ").title()

            relations_list.append({
                "relation_type": rel_type,
                "display_relation_type": display_type,
                "id": node.get("id"),
                "mal_id": node.get("idMal"),
                "title": node["title"].get("english") or node["title"].get("romaji"),
                "type": node.get("type"),
                "format": node.get("format"),
                "status": node.get("status"),
                "cover": node.get("coverImage", {}).get("large"),
            })

        # Sort relations
        relation_order = ["Source", "Prequel", "Sequel", "Adaptation", "Side Story", "Summary", "Spin-Off", "Alternative", "Character", "Other"]
        relations_list.sort(key=lambda r: relation_order.index(r["display_relation_type"]) if r["display_relation_type"] in relation_order else 999)

        # --- Recommendations (Supporting both IDs) ---
        recommendations = []
        for edge in data.get("recommendations", {}).get("edges", []):
            node = edge.get("node", {}).get("mediaRecommendation")
            if node:
                recommendations.append({
                    "id": node.get("id"),
                    "mal_id": node.get("idMal"),
                    "title": node["title"].get("english") or node["title"].get("romaji"),
                    "poster_path": node.get("coverImage", {}).get("large"),
                })

        return {
            "external_links": external_links,
            "status": data.get("status"),
            "averageScore": round(data.get("averageScore", 0) / 10, 1) if data.get("averageScore") else None,
            "format": data.get("format"),
            "chapters": data.get("chapters"),
            "volumes": data.get("volumes"),
            "genres": data.get("genres", []),
            "studios": [s["name"] for s in data.get("studios", {}).get("nodes", [])],
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

        return {"results": results, "hasMore": len(raw_media) == 20}
    except Exception:
        return {"results": [], "hasMore": False}


def update_anilist_anime_manga(item: MediaItem):
    if item.media_type not in ["anime", "manga"]:
        return  # Not an anime/manga, skip

    try:
        a_id = item.provider_ids.get("anilist")
        m_id = item.provider_ids.get("mal")
        
        anilist_data = fetch_anilist_data(item.media_type, anilist_id=a_id, mal_id=m_id)
        
        # Heal IDs and source if they were missing/old
        item.provider_ids["anilist"] = str(anilist_data["anilist_id"])
        if anilist_data["mal_id"]:
            item.provider_ids["mal"] = str(anilist_data["mal_id"])
        item.source = "anilist"
        
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
    existing_anilist_ids = {str(r["anilist_id"]) for r in existing if r.get("anilist_id")}
    existing_mal_ids = {str(r["mal_id"]) for r in existing if r.get("mal_id")}

    new_sequels = []
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
            download_image(poster_path, f"related/anilist_{ref_id}.jpg")
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