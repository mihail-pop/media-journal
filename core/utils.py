from datetime import datetime
import json
import os
from pathlib import Path
import requests
from django.conf import settings
from .models import APIKey
import time

IGDB_ACCESS_TOKEN = None
IGDB_TOKEN_EXPIRY = 0

TMDB_MOVIE_GENRES = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
    10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western"
}

TMDB_TV_GENRES = {
    10759: "Action & Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 10762: "Kids", 9648: "Mystery",
    10763: "News", 10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap",
    10767: "Talk", 10768: "War & Politics", 37: "Western"
}


def get_igdb_token():
    global IGDB_ACCESS_TOKEN, IGDB_TOKEN_EXPIRY

    if IGDB_ACCESS_TOKEN and IGDB_TOKEN_EXPIRY > time.time():
        return IGDB_ACCESS_TOKEN

    try:
        igdb_keys = APIKey.objects.get(name="igdb")
    except APIKey.DoesNotExist:
        return None

    url = "https://id.twitch.tv/oauth2/token"
    params = {
        "client_id": igdb_keys.key_1,
        "client_secret": igdb_keys.key_2,
        "grant_type": "client_credentials",
    }

    resp = requests.post(url, params=params)
    if resp.status_code != 200:
        return None

    token_data = resp.json()
    IGDB_ACCESS_TOKEN = token_data["access_token"]
    IGDB_TOKEN_EXPIRY = time.time() + token_data["expires_in"] - 60
    return IGDB_ACCESS_TOKEN

def download_image(url, relative_path):
    local_path = Path(settings.MEDIA_ROOT) / relative_path
    local_path.parent.mkdir(parents=True, exist_ok=True)  # Ensure folder exists

    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            with open(local_path, "wb") as f:
                f.write(response.content)
            return settings.MEDIA_URL + relative_path.replace("\\", "/")
    except Exception as e:
        print("Image download failed:", e)

    return ""


def fetch_anilist_data(mal_id, media_type):
    query = '''
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
    '''

    variables = {
        "malId": int(mal_id),
        "type": media_type.upper()
    }

    headers = {
        "Content-Type": "application/json"
    }

    response = requests.post(
        "https://graphql.anilist.co",
        json={"query": query, "variables": variables},
        headers=headers
    )

    if response.status_code != 200:
        raise Exception("AniList API request failed.")

    media = response.json().get("data", {}).get("Media")
    if not media:
        raise Exception("AniList: No data found for this ID.")

    # Title
    title = media["title"].get("english") or media["title"].get("romaji") or "Unknown Title"

    # Overview
    overview = media.get("description") or ""

    # Release Date
    start = media.get("startDate")
    if start and start.get("year"):
        release_date = f"{start['year']}-{start['month'] or 1:02}-{start['day'] or 1:02}"
    else:
        release_date = ""

    # Poster & Banner
    poster_url = media.get("coverImage", {}).get("extraLarge")
    banner_url = media.get("bannerImage")

    # Cast
    cast = []
    for edge in media.get("characters", {}).get("edges", []):
        character = edge["node"]
        cast.append({
            "name": character["name"]["full"],
            "character": edge.get("role", ""),
            "profile_path": character["image"]["medium"],
            "is_full_url": True,
            "id": character.get("id"),
        })

    # Related Titles
    related_titles = []
    for rel in media.get("relations", {}).get("edges", []):
        relation_type = rel.get("relationType", "").lower()
        if relation_type in ("prequel", "sequel"):
            node = rel["node"]
            r_id = node.get("idMal")
            if not r_id:
                continue

            r_title = node["title"].get("english") or node["title"].get("romaji") or "Unknown Title"
            r_poster = node["coverImage"].get("large") or ""

            related_titles.append({
                "mal_id": r_id,
                "title": r_title,
                "poster_path": r_poster,
                "relation": relation_type.capitalize(),
                "is_full_url": True,
            })

    # Recommendations
    recommendations = []
    for edge in media.get("recommendations", {}).get("edges", []):
        node = edge.get("node", {}).get("mediaRecommendation")
        if not node or not node.get("idMal"):
            continue

        rec_id = node["idMal"]
        rec_title = node["title"].get("english") or node["title"].get("romaji") or "Unknown Title"
        rec_poster = node["coverImage"].get("large") or ""

        recommendations.append({
            "id": rec_id,
            "title": rec_title,
            "poster_path": rec_poster,
            "is_full_url": True,
        })

    return {
        "title": title,
        "overview": overview,
        "release_date": release_date,
        "poster_url": poster_url,
        "banner_url": banner_url,
        "cast": cast,
        "related_titles": related_titles,
        "recommendations": recommendations,
    }




def get_movie_extra_info(tmdb_id):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return {}

    base_url = f"https://api.themoviedb.org/3/movie/{tmdb_id}"
    params = {"api_key": api_key, "append_to_response": "videos,credits,recommendations"}

    try:
        # Single API call with all data
        response = requests.get(base_url, params=params)
        if response.status_code != 200:
            return {}

        data = response.json()

        # Process videos/trailers
        videos = data.get("videos", {}).get("results", [])
        trailer_videos = [v for v in videos if v.get("site") == "YouTube" and v.get("type") == "Trailer" and v.get("key")]
        teaser_videos = [v for v in videos if v.get("site") == "YouTube" and v.get("type") == "Teaser" and v.get("key")]
        combined = trailer_videos + teaser_videos
        trailers = [{
            "name": v.get("name"),
            "type": v.get("type"),
            "youtube_id": v.get("key"),
            "url": f"https://www.youtube.com/watch?v={v['key']}"
        } for v in combined[:3]]

        # Process crew
        crew = data.get("credits", {}).get("crew", [])
        allowed_jobs = ["Director", "Writer", "Screenplay", "Producer", "Art Director"]
        staff_list = [f"{c['name']} ({c['job']})" for c in crew if c.get("job") in allowed_jobs]

        # Fetch related movies if part of a collection
        relations = []
        collection = data.get("belongs_to_collection")
        if collection:
            collection_id = collection.get("id")
            collection_url = f"https://api.themoviedb.org/3/collection/{collection_id}"
            collection_resp = requests.get(collection_url, params=params)
            if collection_resp.status_code == 200:
                items = collection_resp.json().get("parts", [])
                # Sort by release date
                items.sort(key=lambda x: x.get("release_date") or "")
                for item in items:
                    relations.append({
                        "id": item.get("id"),
                        "title": item.get("title"),
                        "release_date": item.get("release_date"),
                        "poster": f"https://image.tmdb.org/t/p/w342{item.get('poster_path')}" if item.get("poster_path") else None
                    })

        # Process recommendations
        recs = data.get("recommendations", {}).get("results", [])[:16]
        recommendations = [{
            "id": rec["id"],
            "title": rec.get("title"),
            "poster_path": rec.get("poster_path")
        } for rec in recs]

        return {
            "runtime": data.get("runtime"),
            "genres": [genre["name"] for genre in data.get("genres", [])],
            "status": data.get("status"),
            "homepage": data.get("homepage"),
            "vote_average": round(data.get("vote_average", 0), 1),
            "trailers": trailers,
            "staff": staff_list,
            "relations": relations,
            "recommendations": recommendations,
        }

    except Exception as e:
        print(f"Error in get_movie_extra_info: {e}")
        return {}
    
def get_tv_extra_info(tmdb_id):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return {}

    base_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}"
    params = {"api_key": api_key, "append_to_response": "videos,credits,recommendations"}

    try:
        # Single API call with all data
        response = requests.get(base_url, params=params)
        if response.status_code != 200:
            return {}

        data = response.json()

        # Handle optional fields safely
        next_episode = data.get("next_episode_to_air")
        next_episode_air_date = next_episode.get("air_date") if next_episode else None

        # Process videos/trailers
        videos = data.get("videos", {}).get("results", [])
        trailer_videos = [v for v in videos if v.get("site") == "YouTube" and v.get("type") == "Trailer" and v.get("key")]
        teaser_videos = [v for v in videos if v.get("site") == "YouTube" and v.get("type") == "Teaser" and v.get("key")]
        combined = trailer_videos + teaser_videos
        trailers = [{
            "name": v.get("name"),
            "type": v.get("type"),
            "youtube_id": v.get("key"),
            "url": f"https://www.youtube.com/watch?v={v['key']}"
        } for v in combined[:3]]

        # Process crew
        crew = data.get("credits", {}).get("crew", [])
        allowed_jobs = ["Director", "Writer", "Screenplay", "Producer", "Art Director"]
        staff_list = [f"{c['name']} ({c['job']})" for c in crew if c.get("job") in allowed_jobs]

        # Process recommendations
        recs = data.get("recommendations", {}).get("results", [])[:16]
        recommendations = [{
            "id": rec["id"],
            "title": rec.get("name"),
            "poster_path": rec.get("poster_path")
        } for rec in recs]

        return {
            "status": data.get("status"),
            "next_episode_to_air": next_episode_air_date,
            "last_air_date": data.get("last_air_date"),
            "networks": [n.get("name") for n in data.get("networks", [])],
            "vote_average": round(data.get("vote_average", 0), 1),
            "homepage": data.get("homepage"),
            "genres": [genre["name"] for genre in data.get("genres", [])],
            "trailers": trailers,
            "staff": staff_list,
            "recommendations": recommendations,
        }

    except Exception as e:
        print("TV API error:", e)
        return {}
    
def get_anime_extra_info(mal_id):
    query = '''
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
    '''

    variables = {"idMal": int(mal_id)}
    headers = {"Content-Type": "application/json"}

    try:
        response = requests.post(
            "https://graphql.anilist.co",
            json={"query": query, "variables": variables},
            headers=headers
        )
        if response.status_code != 200:
            return {}

        data = response.json().get("data", {}).get("Media", {})

        # Next airing
        next_airing_data = data.get("nextAiringEpisode")
        if next_airing_data and next_airing_data.get("airingAt"):
            next_airing_timestamp = next_airing_data["airingAt"]
            next_airing = datetime.fromtimestamp(next_airing_timestamp).strftime("%A %d %B %Y")
            next_episode = next_airing_data.get("episode")
        else:
            next_airing = None
            next_episode = None

        # External links
        external_links = []
        for link in data.get("externalLinks", []):
            if link.get("site") and link.get("url"):
                external_links.append({
                    "site": link["site"],
                    "url": link["url"],
                    "language": link.get("language") or "",
                })

        # Staff
        staff_list = [
            f"{edge['node']['name']['full']} ({edge['role']})"
            for edge in data.get("staff", {}).get("edges", [])
            if edge.get("node") and edge["node"].get("name") and edge.get("role")
        ]

        # Trailers
        trailer_data = data.get("trailer") or {}
        trailers = []
        if trailer_data and trailer_data.get("id") and trailer_data.get("site") == "youtube":
            trailers.append({
                "youtube_id": trailer_data.get("id"),
                "thumbnail": trailer_data.get("thumbnail"),
                "url": f"https://www.youtube.com/watch?v={trailer_data['id']}"
            })

        # Relations (excluding SEQUEL/PREQUEL)
        relations_list = []
        for edge in data.get("relations", {}).get("edges", []):
            node = edge.get("node")
            if not node or edge.get("relationType") in ["SEQUEL", "PREQUEL"]:
                continue

            relation_type = edge["relationType"]
            # Determine display type
            display_type = "Source" if relation_type == "ADAPTATION" else relation_type.replace("_", " ").title()

            relations_list.append({
                "relation_type": relation_type,
                "display_relation_type": display_type,
                "id": node.get("idMal"),
                "title": node["title"].get("english") or node["title"].get("romaji"),
                "type": node.get("type"),
                "format": node.get("format"),
                "status": node.get("status"),
                "cover": node.get("coverImage", {}).get("large"),
            })

        # Sort relations by custom order
        relation_order = [
            "Source", "Prequel", "Sequel", "Adaptation", "Side Story",
            "Summary", "Spin-Off", "Alternative", "Character", "Other"
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
                recommendations.append({
                    "id": node["idMal"],
                    "title": node["title"].get("english") or node["title"].get("romaji"),
                    "poster_path": node.get("coverImage", {}).get("large")
                })

        return {
            "external_links": external_links,
            "status": data.get("status"),
            "averageScore": round(data.get("averageScore", 0) / 10, 1) if data.get("averageScore") is not None else None,
            "format": data.get("format"),
            "genres": data.get("genres", []),
            "studios": [studio["name"] for studio in data.get("studios", {}).get("nodes", [])],
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
    query = '''
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
    '''

    variables = {"idMal": int(mal_id)}
    headers = {"Content-Type": "application/json"}

    try:
        response = requests.post(
            "https://graphql.anilist.co",
            json={"query": query, "variables": variables},
            headers=headers
        )
        if response.status_code != 200:
            return {}

        data = response.json().get("data", {}).get("Media", {})

        # External links
        external_links = []
        for link in data.get("externalLinks", []):
            if link.get("site") and link.get("url"):
                external_links.append({
                    "site": link["site"],
                    "url": link["url"],
                    "language": link.get("language") or "",
                })

        # Staff
        staff_list = [
            f"{edge['node']['name']['full']} ({edge['role']})"
            for edge in data.get("staff", {}).get("edges", [])
            if edge.get("node") and edge["node"].get("name") and edge.get("role")
        ]

        # Trailers
        trailer_data = data.get("trailer") or {}
        trailers = []
        if trailer_data and trailer_data.get("id") and trailer_data.get("site") == "youtube":
            trailers.append({
                "youtube_id": trailer_data.get("id"),
                "thumbnail": trailer_data.get("thumbnail"),
                "url": f"https://www.youtube.com/watch?v={trailer_data['id']}"
            })

        # Relations (excluding SEQUEL/PREQUEL)
        relations_list = []
        for edge in data.get("relations", {}).get("edges", []):
            node = edge.get("node")
            if not node or edge.get("relationType") in ["SEQUEL", "PREQUEL"]:
                continue

            relation_type = edge["relationType"]
            # For manga, display Adaptation for adaptations
            display_type = "Adaptation" if relation_type == "ADAPTATION" else relation_type.replace("_", " ").title()

            relations_list.append({
                "relation_type": relation_type,
                "display_relation_type": display_type,
                "id": node.get("idMal"),
                "title": node["title"].get("english") or node["title"].get("romaji"),
                "type":  node.get("type"),
                "format": node.get("format"),
                "status": node.get("status"),
                "cover": node.get("coverImage", {}).get("large"),
            })

        # Sort relations by custom order
        relation_order = [
            "Source", "Prequel", "Sequel", "Adaptation", "Side Story",
            "Summary", "Spin-Off", "Alternative", "Character", "Other"
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
                recommendations.append({
                    "id": node["idMal"],
                    "title": node["title"].get("english") or node["title"].get("romaji"),
                    "poster_path": node.get("coverImage", {}).get("large")
                })

        return {
            "external_links": external_links,
            "status": data.get("status"),
            "averageScore": round(data.get("averageScore", 0) / 10, 1) if data.get("averageScore") is not None else None,
            "format": data.get("format"),
            "genres": data.get("genres", []),
            "studios": [studio["name"] for studio in data.get("studios", {}).get("nodes", [])],
            "staff": staff_list,
            "trailers": trailers,
            "relations": relations_list,
            "recommendations": recommendations,
        }

    except Exception as e:
        print(f"Error in get_manga_extra_info: {e}")
        return {}

    
def get_game_extra_info(game_id):
    token = get_igdb_token()
    if not token:
        return {}

    try:
        igdb_keys = APIKey.objects.get(name="igdb")
    except APIKey.DoesNotExist:
        return {}

    headers = {
        "Client-ID": igdb_keys.key_1,
        "Authorization": f"Bearer {token}",
    }

    # Request fields we want for extra info, now including videos
    body = f'''
        fields
            platforms.name,
            genres.name,
            involved_companies.company.name,
            rating,
            websites.url,
            videos.video_id,
            videos.name;
        where id = {game_id};
    '''

    try:
        response = requests.post("https://api.igdb.com/v4/games", headers=headers, data=body)
        if response.status_code != 200:
            return {}

        data = response.json()
        if not data:
            return {}

        game = data[0]

        # Process videos: trailers first, then others, limit to 3
        trailers = []
        if game.get("videos"):
            trailer_videos = []
            other_videos = []
            for v in game["videos"]:
                if not v.get("video_id"):
                    continue
                name_lower = v.get("name", "").lower()
                if "trailer" in name_lower:
                    trailer_videos.append(v)
                else:
                    other_videos.append(v)

            combined = trailer_videos + other_videos
            trailers = [{
                "name": v.get("name"),
                "youtube_id": v.get("video_id"),
                "url": f"https://www.youtube.com/watch?v={v['video_id']}"
            } for v in combined[:3]]

        # Fetch similar games (recommendations)
        similar_body = f'''
            fields
                similar_games.name,
                similar_games.cover.url;
            where id = {game_id};
        '''
        
        recommendations = []
        try:
            similar_response = requests.post("https://api.igdb.com/v4/games", headers=headers, data=similar_body)
            if similar_response.status_code == 200:
                similar_data = similar_response.json()
                if similar_data and similar_data[0].get("similar_games"):
                    for similar in similar_data[0]["similar_games"][:16]:
                        cover_url = None
                        if similar.get("cover") and similar["cover"].get("url"):
                            cover_url = "https:" + similar["cover"]["url"].replace("t_thumb", "t_cover_big")
                        recommendations.append({
                            "id": similar.get("id"),
                            "title": similar.get("name"),
                            "poster_path": cover_url
                        })
        except Exception:
            pass

        return {
            "platforms": [p.get("name") for p in game.get("platforms", [])] if game.get("platforms") else [],
            "genres": [g.get("name") for g in game.get("genres", [])] if game.get("genres") else [],
            "involved_companies": [c.get("company", {}).get("name") for c in game.get("involved_companies", []) if c.get("company")] if game.get("involved_companies") else [],
            "rating": round(game["rating"] / 10, 1) if game.get("rating") is not None else None,
            "websites": [w.get("url") for w in game.get("websites", [])] if game.get("websites") else [],
            "trailers": trailers,
            "recommendations": recommendations,
        }

    except Exception:
        return {}


    

def rating_to_display(rating_value: int | None, rating_mode: str) -> int | None:
    """
    Convert internal rating (1-100) to display rating according to rating_mode.
    Returns None if no rating.
    """
    if rating_value is None:
        return None

    if rating_mode == 'faces':
        # Always round to the nearest face value: 1 (bad), 50 (neutral), 100 (good)
        # This ensures any value maps to a valid face
        faces = [1, 50, 100]
        # Find the face value with the smallest absolute difference
        return min(faces, key=lambda x: abs(rating_value - x))

    elif rating_mode == 'stars_5':
        # Map 1–100 to 1–5 stars
        # We'll round nearest integer: divide by 20 and round (e.g. 50->3 stars)
        result = round(rating_value / 20)
        if rating_value != 0 and result < 1:
            return 1
        return result

    elif rating_mode == 'scale_10':
        # Map 1–100 to 1–10 scale, rounded nearest int
        result = round(rating_value / 10)
        if rating_value != 0 and result < 1:
            return 1
        return result

    elif rating_mode == 'scale_100':
        # Use value directly (1-100)
        return rating_value

    return None

def display_to_rating(display_value: int | None, rating_mode: str) -> int | None:
    """
    Convert display rating back to internal 1-100 rating to save.
    Returns None if no rating.
    """
    if display_value is None:
        return None

    if rating_mode == 'faces':
        # Faces are only 1, 50, 100
        if display_value <= 1:
            return 1
        elif display_value <= 50:
            return 50
        else:
            return 100

    elif rating_mode == 'stars_5':
        # 1–5 stars * 20
        return display_value * 20

    elif rating_mode == 'scale_10':
        # 1–10 * 10
        return display_value * 10

    elif rating_mode == 'scale_100':
        # Direct 1–100
        return display_value

    return None

def get_anilist_discover(media_type, page, query='', sort='TRENDING_DESC', season='', year='', format_filter='', status=''):
    query_text = f'''
    query ($page: Int, $search: String, $type: MediaType, $sort: [MediaSort], $season: MediaSeason, $seasonYear: Int, $format: MediaFormat, $status: MediaStatus) {{
      Page(page: $page, perPage: 20) {{
        media(search: $search, type: $type, sort: $sort, season: $season, seasonYear: $seasonYear, format: $format, status: $status) {{
          id
          idMal
          title {{
            english
            romaji
          }}
          coverImage {{
            large
          }}
          bannerImage
          description(asHtml: false)
          averageScore
          startDate {{
            year
            month
            day
          }}
          genres
          nextAiringEpisode {{
            episode
            airingAt
          }}
          status
        }}
      }}
    }}
    '''
    
    variables = {
        "page": page,
        "type": media_type.upper(),
        "sort": [sort] if sort else ["TRENDING_DESC"]
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
            headers=headers
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
                
            title = media["title"].get("english") or media["title"].get("romaji") or "Unknown Title"
            poster = media.get("coverImage", {}).get("large")
            
            # Convert score to 1-10 scale
            score = media.get("averageScore")
            if score:
                score = round(score / 10, 1)
            
            # Format release date
            start_date = media.get("startDate")
            release_date = ""
            if start_date and start_date.get("year"):
                month = start_date.get('month') or 1
                day = start_date.get('day') or 1
                release_date = f"{start_date['year']}-{month:02d}-{day:02d}"
            
            # Next airing info
            next_airing = None
            next_episode = media.get("nextAiringEpisode")
            if next_episode and next_episode.get("airingAt"):
                from datetime import datetime
                next_airing = datetime.fromtimestamp(next_episode["airingAt"]).strftime("%d %b %Y")
            
            results.append({
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
                "status": media.get("status")
            })
        
        # Add hasMore flag based on raw AniList data, not filtered results
        return {"results": results, "hasMore": len(raw_media) == 20}
    except Exception as e:
        return {"results": [], "hasMore": False}

def get_tmdb_discover(media_type, page, query='', sort='popularity.desc', year=''):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return []
    
    if query:
        url = f"https://api.themoviedb.org/3/search/{media_type}"
        params = {
            "api_key": api_key,
            "query": query,
            "page": page
        }
    elif sort == "trending":
        # Trending endpoint
        url = f"https://api.themoviedb.org/3/trending/{media_type}/week"
        params = {
            "api_key": api_key,
            "page": page
        }
    else:
        # Discover endpoint
        url = f"https://api.themoviedb.org/3/discover/{media_type}"
        params = {
            "api_key": api_key,
            "sort_by": sort,
            "page": page,
            "include_adult": "false",
            "vote_count.gte": 100
        }
        
        # Add year filter if provided
        if year:
            if media_type == 'movie':
                params["primary_release_date.gte"] = f"{year}-01-01"
                params["primary_release_date.lte"] = f"{year}-12-31"
            elif media_type == 'tv':
                params["first_air_date.gte"] = f"{year}-01-01"
                params["first_air_date.lte"] = f"{year}-12-31"
    
    try:
        response = requests.get(url, params=params)
        if response.status_code != 200:
            return []
            
        data = response.json()
        results = []
        
        for item in data.get("results", []):
            poster = item.get("poster_path")
            poster_url = f"https://image.tmdb.org/t/p/w342{poster}" if poster else None
            
            backdrop = item.get("backdrop_path")
            backdrop_url = f"https://image.tmdb.org/t/p/w780{backdrop}" if backdrop else None
            
            # Convert score to 1-10 scale
            score = item.get("vote_average")
            if score:
                score = round(score, 1)
            
            # Get release date
            release_date = item.get("release_date") or item.get("first_air_date", "")
            
            # Map genre IDs to names
            genre_map = TMDB_MOVIE_GENRES if media_type == 'movie' else TMDB_TV_GENRES
            genres = [genre_map.get(gid, "") for gid in item.get("genre_ids", [])]
            genres = [g for g in genres if g]  # Remove empty strings
            
            results.append({
                "id": str(item["id"]),
                "title": item.get("title") or item.get("name", "Untitled"),
                "poster_path": poster_url,
                "backdrop_path": backdrop_url,
                "media_type": media_type,
                "overview": item.get("overview", ""),
                "score": score,
                "release_date": release_date,
                "genres": genres
            })
            
        return results
    except Exception:
        return []

def get_igdb_discover(page, query='', sort='popularity', genre='', platform='', year=''):
    token = get_igdb_token()
    if not token:
        return []
        
    try:
        igdb_keys = APIKey.objects.get(name="igdb")
    except APIKey.DoesNotExist:
        return []
    
    headers = {
        "Client-ID": igdb_keys.key_1,
        "Authorization": f"Bearer {token}",
    }
    
    offset = (page - 1) * 20
    
    if query:
        data = f'search "{query}"; fields id, name, cover.url, summary, rating, genres.name, first_release_date; limit 20; offset {offset};'
    else:
        conditions = ["cover != null"]
        if genre:
            conditions.append(f"genres = [{genre}]")
        if platform:
            conditions.append(f"platforms = [{platform}]")
        if year:
            conditions.append(f"release_dates.y = {year}")
            
        where_clause = " & ".join(conditions)
        sort_clause = f"sort {sort} desc" if sort else "sort popularity desc"
        
        data = f'fields id, name, cover.url, summary, rating, genres.name, first_release_date; where {where_clause}; {sort_clause}; limit 20; offset {offset};'
    
    try:
        response = requests.post("https://api.igdb.com/v4/games", headers=headers, data=data)
        if response.status_code != 200:
            return []
            
        results_raw = response.json()
        results = []
        
        for item in results_raw:
            cover_url = None
            if "cover" in item and item["cover"] and "url" in item["cover"]:
                cover_url = "https:" + item["cover"]["url"].replace("t_thumb", "t_cover_big")
            
            # Convert score to 1-10 scale
            score = item.get("rating")
            if score:
                score = round(score / 10, 1)
            
            # Format release date
            release_date = ""
            if item.get("first_release_date"):
                from datetime import datetime
                release_date = datetime.fromtimestamp(item["first_release_date"]).strftime("%Y-%m-%d")
                
            results.append({
                "id": str(item["id"]),
                "title": item.get("name", "Untitled"),
                "poster_path": cover_url,
                "media_type": "game",
                "overview": item.get("summary", ""),
                "score": score,
                "release_date": release_date,
                "genres": [g.get("name") for g in item.get("genres", []) if g.get("name")]
            })
            
        return results
    except Exception:
        return []

def get_music_extra_info(recording_id, artist_id=None, album_id=None):
    from .models import MediaItem
    import time
    import requests

    print(f"[MUSIC] Starting for recording_id: {recording_id}, artist_id: {artist_id}, album_id: {album_id}")

    cast_data = {}
    try:
        item = MediaItem.objects.get(source="musicbrainz", source_id=recording_id)
        cast_data = item.cast or {}
        if not artist_id:
            artist_id = cast_data.get("artists", [{}])[0].get("id", "") if cast_data.get("artists") else ""
        if not album_id:
            album_id = cast_data.get("album", {}).get("id", "") if cast_data.get("album") else ""
        print(f"[MUSIC] From DB - artist_id: {artist_id}, album_id: {album_id}")
    except MediaItem.DoesNotExist:
        print(f"[MUSIC] Item not in DB, using passed IDs")

    headers = {"User-Agent": "MediaJournal/1.0 (https://github.com/mihail-pop/media-journal)"}
    album_tracks = []
    artist_singles = []

    # Fetch album tracks
    if album_id:
        time.sleep(1)
        album_url = f"https://musicbrainz.org/ws/2/release/{album_id}"
        album_params = {"inc": "recordings", "fmt": "json"}
        try:
            album_response = requests.get(album_url, params=album_params, headers=headers, timeout=10)
            print(f"[MUSIC] Album status: {album_response.status_code}")
            if album_response.status_code == 200:
                album_data = album_response.json()
                for medium in album_data.get("media", []):
                    for track in medium.get("tracks", []):
                        recording = track.get("recording", {})
                        rec_id = recording.get("id", "")
                        if rec_id and rec_id != recording_id:
                            album_tracks.append({"title": recording.get("title", ""), "id": rec_id})
                print(f"[MUSIC] Album tracks: {len(album_tracks)}")
        except Exception as e:
            print(f"[MUSIC] Album error: {e}")

    # Fetch artist singles via release-groups (no IDs)
    if artist_id:
        time.sleep(1)
        rg_url = f"https://musicbrainz.org/ws/2/release-group"
        rg_params = {"artist": artist_id, "type": "single", "fmt": "json", "limit": 100, "offset": 0}

        try:
            while True:
                rg_response = requests.get(rg_url, params=rg_params, headers=headers, timeout=10)
                if rg_response.status_code != 200:
                    print(f"[MUSIC] Release-group request failed: {rg_response.status_code}")
                    break

                rg_data = rg_response.json()
                rgs = rg_data.get("release-groups", [])
                print(f"[MUSIC] Retrieved {len(rgs)} release-groups at offset {rg_params['offset']}")

                for rg in rgs:
                    secondary_types = rg.get("secondary-types", [])
                    if secondary_types:
                        continue  # skip live, remix, compilation, EP

                    title = rg.get("title", "")
                    earliest_date = rg.get("first-release-date", "")
                    if title:
                        artist_singles.append({"title": title, "date": earliest_date})

                if len(rgs) < 100:
                    break
                rg_params["offset"] += 100

            # Sort by date descending (newest → oldest)
            artist_singles.sort(key=lambda x: x["date"] or "0000-00-00", reverse=True)
            print(f"[MUSIC] Total singles after sort: {len(artist_singles)}")
        except Exception as e:
            print(f"[MUSIC] Singles error: {e}")

    print(f"[MUSIC] Returning tracks={len(album_tracks)}, singles={len(artist_singles)}")
    return {"album_tracks": album_tracks, "artist_singles": artist_singles}


