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