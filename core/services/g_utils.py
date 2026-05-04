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