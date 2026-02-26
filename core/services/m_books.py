from django.http import JsonResponse
from core.models import MediaItem
from core.services.g_utils import download_image
import time
import requests
import logging
import datetime
import re


logger = logging.getLogger(__name__)


def save_openlib_item(work_id):
    # Fetch from Open Library API
    detail_url = f"https://openlibrary.org/works/{work_id}.json"
    detail_response = requests.get(detail_url)

    if detail_response.status_code != 200:
        raise Exception("Failed to fetch book details from Open Library.")

    detail_data = detail_response.json()

    # Title and description
    title = detail_data.get("title", "Untitled")
    description_raw = detail_data.get("description", "")
    if isinstance(description_raw, dict):
        description = description_raw.get("value", "")
    else:
        description = description_raw or ""

    description = re.sub(
        r"- \[.*?\]\(https?://[^\)]+\)", "", description
    )  # Remove list of markdown links
    description = re.sub(
        r"\[.*?\]:\s+https?://\S+", "", description
    )  # Remove link footnotes if present
    description = re.sub(r"-{2,}", "", description)  # Remove long dashed lines
    description = re.sub(r"See:\s*$", "", description)  # Remove dangling 'See:' if left
    description = re.sub(r"\(\[.*?\]\[\d+\]\)", "", description)
    description = re.sub(r"\[.*?\]\[\d+\]", "", description)  # Remove [Source][1]
    description = re.sub(r"\[.*?\]\(https?://[^\)]+\)", "", description)
    description = description.strip()

    # Authors
    author_names = []
    for a in detail_data.get("authors", []):
        author_key = a.get("author", {}).get("key", "")
        if author_key:
            author_response = requests.get(f"https://openlibrary.org{author_key}.json")
            if author_response.status_code == 200:
                author_data = author_response.json()
                name = author_data.get("name")
                if name:
                    author_names.append(name)

    # Best available cover (pick last instead of first if possible)
    cover_ids = detail_data.get("covers", [])
    cover_id = cover_ids[0] if cover_ids else None

    poster_url = (
        f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg" if cover_id else None
    )

    cache_bust = int(time.time() * 1000)
    local_poster = (
        download_image(poster_url, f"posters/openlib_{work_id}_{cache_bust}.jpg")
        if poster_url
        else ""
    )

    if local_poster.startswith("media/"):
        local_poster = local_poster[len("media/") :]

    # No banner art available for books
    local_banner = ""

    # Format release date (from `created`)
    release_date = None
    raw_date = detail_data.get("created", {}).get("value", "")
    try:
        if raw_date:
            parsed_date = datetime.datetime.strptime(raw_date[:10], "%Y-%m-%d")
            release_date = parsed_date.strftime("%Y-%m-%d")
    except ValueError:
        release_date = None

    # Save to DB
    MediaItem.objects.create(
        title=title,
        media_type="book",
        source="openlib",
        source_id=work_id,
        cover_url=local_poster,
        banner_url=local_banner,
        overview=description,
        release_date=release_date,
        cast=[{"name": name, "character": ""} for name in author_names],
        seasons=None,
        related_titles=[],
        screenshots=[],
    )

    return JsonResponse({"success": True, "message": "Book added to list"})
