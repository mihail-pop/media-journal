from pathlib import Path

import requests
from django.conf import settings


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


def rating_to_display(rating_value: int | None, rating_mode: str) -> int | None:
    """
    Convert internal rating (1-100) to display rating according to rating_mode.
    Returns None if no rating.
    """
    if rating_value is None:
        return None

    if rating_mode == "faces":
        # Always round to the nearest face value: 1 (bad), 50 (neutral), 100 (good)
        # This ensures any value maps to a valid face
        faces = [1, 50, 100]
        # Find the face value with the smallest absolute difference
        return min(faces, key=lambda x: abs(rating_value - x))

    elif rating_mode == "stars_5":
        # Map 1–100 to 1–5 stars
        # We'll round nearest integer: divide by 20 and round (e.g. 50->3 stars)
        result = round(rating_value / 20)
        if rating_value != 0 and result < 1:
            return 1
        return result

    elif rating_mode == "scale_10":
        # Map 1–100 to 1–10 scale, rounded nearest int
        result = round(rating_value / 10)
        if rating_value != 0 and result < 1:
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
        # Faces are only 1, 50, 100
        if display_value <= 1:
            return 1
        elif display_value <= 50:
            return 50
        else:
            return 100

    elif rating_mode == "stars_5":
        # 1–5 stars * 20
        return display_value * 20

    elif rating_mode == "scale_10":
        # 1–10 * 10
        return display_value * 10

    elif rating_mode == "scale_100":
        # Direct 1–100
        return display_value

    return None
