import os
import hashlib
from pathlib import Path

import requests
from django.conf import settings

from core.models import NavItem


def get_sharded_path(original_path):
    """
    Takes 'posters/tmdb_123.jpg'
    Returns 'posters/e4/tmdb_123.jpg'
    """
    directory, filename = os.path.split(original_path)
    hash_str = hashlib.md5(filename.encode('utf-8')).hexdigest()
    shard_folder = hash_str[:2]  # 256 possible folders
    
    # If the parent folder is ALREADY named the hash, do nothing!
    if os.path.basename(directory) == shard_folder:
        return original_path.replace('\\', '/')

    # Combine back and force forward slashes for URLs
    return os.path.join(directory, shard_folder, filename).replace('\\', '/')


def download_image(url, relative_path):
    sharded_relative_path = get_sharded_path(relative_path)
    
    local_path = Path(settings.MEDIA_ROOT) / sharded_relative_path
    local_path.parent.mkdir(parents=True, exist_ok=True)  # Ensure folder exists

    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            with open(local_path, "wb") as f:
                f.write(response.content)
            return settings.MEDIA_URL + sharded_relative_path
    except Exception as e:
        print("Image download failed:", e)

    return ""


def rating_to_display(rating_value: int | None, rating_mode: str) -> int | None:
    """
    Convert internal rating (1-100) to display rating according to rating_mode.
    Returns None if no rating.
    """
    if rating_value is None:
        return None

    if rating_mode == "faces":
        # The same boundaries as in m_lists.js
        if rating_value <= 33:
            return 1
        elif rating_value <= 66:
            return 50
        else:
            return 100

    elif rating_mode == "stars_5":
        # Always divide by 20. int(val + 0.5) perfectly mimics JS Math.round()
        result = int((rating_value / 20) + 0.5)
        # Prevent 0 stars if they gave a low 1-100 rating (like 3)
        if rating_value > 0 and result < 1:
            return 1
        return result

    elif rating_mode == "scale_10":
        # Always divide by 10. 
        result = int((rating_value / 10) + 0.5)
        # Prevent 0 if they gave a low 1-100 rating (like 3)
        if rating_value > 0 and result < 1:
            return 1
        return result

    elif rating_mode == "scale_100":
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

    if rating_mode == "faces":
        if display_value <= 1:
            return 1
        elif display_value <= 50:
            return 50
        else:
            return 100

    elif rating_mode == "stars_5":
        return display_value * 20

    elif rating_mode == "scale_10":
        return display_value * 10

    elif rating_mode == "scale_100":
        return display_value

    return None

def get_ordered_types():
    nav_items = NavItem.objects.all().order_by("position")
    
    mapping = {
        'movies': {'data_type': 'movie', 'label': 'Movies'},
        'tvshows': {'data_type': 'tv', 'label': 'TV Shows'},
        'anime': {'data_type': 'anime', 'label': 'Anime'},
        'manga': {'data_type': 'manga', 'label': 'Manga'},
        'games': {'data_type': 'game', 'label': 'Games'},
        'books': {'data_type': 'book', 'label': 'Books'},
        'music': {'data_type': 'music', 'label': 'Music'},
    }
    
    ordered = []
    for item in nav_items:
        if item.name in mapping:
            ordered.append(mapping[item.name])
            
    # Add any missing types just in case they were not in NavItems
    for name, data in mapping.items():
        if data not in ordered:
            ordered.append(data)
            
    return ordered