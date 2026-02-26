from core.models import APIKey, MediaItem
from core.services.m_games import get_igdb_token
import requests
import logging

IGDB_ACCESS_TOKEN = None
IGDB_TOKEN_EXPIRY = 0

logger = logging.getLogger(__name__)

# Helper for game screenshots API
def get_game_screenshots_data(igdb_id):
    # Try DB first
    try:
        item = MediaItem.objects.get(source="igdb", source_id=str(igdb_id))
        return item.screenshots or []
    except MediaItem.DoesNotExist:
        pass

    # Try IGDB API
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

    # Fetch only screenshots
    query = f"fields screenshots.url; where id = {igdb_id};"
    try:
        response = requests.post(
            "https://api.igdb.com/v4/games", headers=headers, data=query
        )
        if response.status_code == 200:
            data = response.json()
            if data and "screenshots" in data[0]:
                screenshots = []
                for ss in data[0]["screenshots"]:
                    if ss and "url" in ss:
                        url = "https:" + ss["url"].replace("t_thumb", "t_1080p")
                        screenshots.append({"url": url, "is_full_url": True})
                return screenshots
    except Exception:
        pass
    return []
