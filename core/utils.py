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

def get_trending_movies():
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return []

    url = "https://api.themoviedb.org/3/trending/movie/week"
    params = {"api_key": api_key}

    try:
        response = requests.get(url, params=params)
        if response.status_code != 200:
            return []

        data = response.json()
        results = []

        for item in data.get("results", [])[:10]:
            poster = item.get("poster_path")
            poster_url = f"https://image.tmdb.org/t/p/w342{poster}" if poster else None

            results.append({
                "id": str(item["id"]),
                "title": item.get("title", "Untitled"),
                "poster_path": poster_url,
                "media_type" : "movie"
            })

        return results

    except Exception:
        return []
    

def get_trending_tv():
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return []

    url = "https://api.themoviedb.org/3/trending/tv/week"
    params = {"api_key": api_key}

    try:
        response = requests.get(url, params=params)
        if response.status_code != 200:
            return []

        data = response.json()
        results = []

        for item in data.get("results", []):
            # Filter out anime based on language and country
            original_language = item.get("original_language", "")
            origin_country = item.get("origin_country", [])
            genre_ids = item.get("genre_ids", [])

            is_anime = (
                original_language == "ja" or
                "JP" in origin_country or
                16 in genre_ids  # Genre ID 16 = Animation
            )

            if is_anime:
                continue  # skip this item

            poster = item.get("poster_path")
            poster_url = f"https://image.tmdb.org/t/p/w342{poster}" if poster else None

            results.append({
                "id": str(item["id"]),
                "title": item.get("name", "Untitled"),
                "poster_path": poster_url,
                "media_type": "tv"
            })

            if len(results) == 10:
                break

        return results

    except Exception:
        return []
    
def get_trending_anime():
    query = '''
    query {
      Page(perPage: 10) {
        media(type: ANIME, sort: TRENDING_DESC) {
          idMal
          title {
            english
            romaji
          }
          coverImage {
            large
          }
        }
      }
    }
    '''

    headers = {"Content-Type": "application/json"}

    try:
        response = requests.post(
            "https://graphql.anilist.co",
            json={"query": query},
            headers=headers
        )

        if response.status_code != 200:
            return []

        data = response.json()
        results = []

        for media in data.get("data", {}).get("Page", {}).get("media", []):
            mal_id = media.get("idMal")
            if not mal_id:
                continue

            title = media["title"].get("english") or media["title"].get("romaji") or "Unknown Title"
            poster = media.get("coverImage", {}).get("large")

            results.append({
                "id": str(mal_id),
                "title": title,
                "poster_path": poster,
                "media_type" : "anime"
            })

        return results

    except Exception:
        return []
    
def get_trending_manga():
    query = '''
    query {
      Page(perPage: 10) {
        media(type: MANGA, sort: TRENDING_DESC) {
          idMal
          title {
            english
            romaji
          }
          coverImage {
            large
          }
        }
      }
    }
    '''

    headers = {"Content-Type": "application/json"}

    try:
        response = requests.post(
            "https://graphql.anilist.co",
            json={"query": query},
            headers=headers
        )

        if response.status_code != 200:
            return []

        data = response.json()
        results = []

        for media in data.get("data", {}).get("Page", {}).get("media", []):
            mal_id = media.get("idMal")
            if not mal_id:
                continue

            title = media["title"].get("english") or media["title"].get("romaji") or "Unknown Title"
            poster = media.get("coverImage", {}).get("large")

            results.append({
                "id": str(mal_id),
                "title": title,
                "poster_path": poster,
                "media_type" : "manga"
            })

        return results

    except Exception:
        return []
    
def get_trending_games():
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
    
    # Get games with cover images, sorted by popularity, limited to 10
    body = (
        'fields id, name, cover.url; '
        'where cover != null & total_rating_count > 10; '
        'sort popularity desc; '
        'limit 10;'
    )

    try:
        response = requests.post("https://api.igdb.com/v4/games", headers=headers, data=body)
        if response.status_code != 200:
            return []

        results_raw = response.json()
        results = []

        for item in results_raw:
            cover_url = None
            if "cover" in item and item["cover"] and "url" in item["cover"]:
                cover_url = "https:" + item["cover"]["url"].replace("t_thumb", "t_cover_big")

            results.append({
                "id": str(item["id"]),
                "title": item.get("name", "Untitled"),
                "poster_path": cover_url,
                "media_type" : "game"
            })

        return results

    except Exception:
        return []


def get_movie_extra_info(tmdb_id):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return {}

    url = f"https://api.themoviedb.org/3/movie/{tmdb_id}"
    params = {"api_key": api_key}

    try:
        response = requests.get(url, params=params)
        if response.status_code != 200:
            return {}

        data = response.json()

        return {
            "runtime": data.get("runtime"),  # in minutes
            "genres": [genre["name"] for genre in data.get("genres", [])],
            "status": data.get("status"),  # e.g. Released, Post Production
            "homepage": data.get("homepage"),
            "vote_average": round(data.get("vote_average", 0), 1)
        }

    except Exception:
        return {}
    
def get_tv_extra_info(tmdb_id):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return {}

    url = f"https://api.themoviedb.org/3/tv/{tmdb_id}"
    params = {"api_key": api_key}

    try:
        response = requests.get(url, params=params)
        if response.status_code != 200:
            return {}

        data = response.json()

        # Handle optional fields safely
        next_episode = data.get("next_episode_to_air")
        next_episode_air_date = next_episode.get("air_date") if next_episode else None

        return {
            "status": data.get("status"),
            "next_episode_to_air": next_episode_air_date,
            "last_air_date": data.get("last_air_date"),
            "networks": [n.get("name") for n in data.get("networks", [])],
            "vote_average": round(data.get("vote_average", 0), 1),
            "homepage": data.get("homepage"),
            "genres": [genre["name"] for genre in data.get("genres", [])],
        }

    except Exception as e:
        print("TV API error:", e)
        return {}
    
def get_anime_extra_info(mal_id):
    query = '''
    query ($idMal: Int) {
      Media(idMal: $idMal, type: ANIME) {
        status          # FINISHED, RELEASING, NOT_YET_RELEASED, CANCELLED
        averageScore
        format          # TV, MOVIE, OVA, etc.
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

        next_airing_data = data.get("nextAiringEpisode")
        if next_airing_data and next_airing_data.get("airingAt"):
            next_airing_timestamp = next_airing_data["airingAt"]
            next_airing = datetime.fromtimestamp(next_airing_timestamp).strftime("%d %B %Y")
            next_episode = next_airing_data.get("episode")
        else:
            next_airing = None
            next_episode = None
        
        return {
            "status": data.get("status"),
            "averageScore": round(data.get("averageScore", 0) / 10, 1) if data.get("averageScore") is not None else None,
            "format": data.get("format"),
            "studios": [studio["name"] for studio in data.get("studios", {}).get("nodes", [])],
            "next_airing": next_airing,
            "next_episode": next_episode,
            "genres": data.get("genres", []),
        }

    except Exception as e:
        print(f"Error in get_anime_extra_info: {e}")
        return {}
    
def get_manga_extra_info(mal_id):
    query = '''
    query ($idMal: Int) {
      Media(idMal: $idMal, type: MANGA) {
        status          # FINISHED, RELEASING, CANCELLED, etc.
        averageScore
        format          # MANGA, NOVEL, ONE_SHOT, etc.
        genres
        studios(isMain: true) {
          nodes {
            name
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

        return {
            "status": data.get("status"),
            "averageScore": round(data.get("averageScore", 0) / 10, 1) if data.get("averageScore") is not None else None,
            "format": data.get("format"),
            "genres": data.get("genres", []),
            "studios": [studio["name"] for studio in data.get("studios", {}).get("nodes", [])],
        }

    except Exception:
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

    # Request fields we want for extra info
    body = f'''
        fields
            platforms.name,
            genres.name,
            involved_companies.company.name,
            rating,
            websites.url;
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
        print(json.dumps(game, indent=2))
        return {
            "platforms": [p.get("name") for p in game.get("platforms", [])] if game.get("platforms") else [],
            "genres": [g.get("name") for g in game.get("genres", [])] if game.get("genres") else [],
            "involved_companies": [c.get("company", {}).get("name") for c in game.get("involved_companies", []) if c.get("company")] if game.get("involved_companies") else [],
            "rating": round(game["rating"] / 10, 1) if game.get("rating") is not None else None,
            "websites": [w.get("url") for w in game.get("websites", [])] if game.get("websites") else [],
        }

    except Exception:
        return {}