import re
import time
import datetime

import requests
from django.http import JsonResponse

from core.models import MediaItem
from core.services.g_utils import download_image


def save_openlib_item(work_id):
    # Fetch main Work details (Title, Description, Covers)
    detail_url = f"https://openlibrary.org/works/{work_id}.json"
    detail_response = requests.get(detail_url, timeout=10)

    if detail_response.status_code != 200:
        raise Exception("Failed to fetch book details from Open Library.")

    detail_data = detail_response.json()

    # Get Authors and Pages in ONE request with the search index
    author_names = []
    total_pages = None
    search_url = f"https://openlibrary.org/search.json?q=key:/works/{work_id}&fields=author_name,number_of_pages_median"
    
    try:
        search_response = requests.get(search_url, timeout=10)
        if search_response.status_code == 200:
            search_data = search_response.json()
            if search_data.get("docs"):
                doc = search_data["docs"][0]
                author_names = doc.get("author_name", [])
                total_pages = doc.get("number_of_pages_median")
    except Exception:
        # if search fails, the script continues without authors/pages
        pass

    # Title and description logic
    title = detail_data.get("title", "Untitled")
    description_raw = detail_data.get("description", "")
    if isinstance(description_raw, dict):
        description = description_raw.get("value", "")
    else:
        description = description_raw or ""

    # Your regex cleaning
    description = re.sub(r"- \[.*?\]\(https?://[^\)]+\)", "", description)
    description = re.sub(r"\[.*?\]:\s+https?://\S+", "", description)
    description = re.sub(r"-{2,}", "", description)
    description = re.sub(r"See:\s*$", "", description)
    description = re.sub(r"\(\[.*?\]\[\d+\]\)", "", description)
    description = re.sub(r"\[.*?\]\[\d+\]", "", description)
    description = re.sub(r"\[.*?\]\(https?://[^\)]+\)", "", description)
    description = description.strip()

    # Cover logic
    cover_ids = detail_data.get("covers", [])
    cover_id = cover_ids[0] if cover_ids else None
    poster_url = f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg" if cover_id else None

    cache_bust = int(time.time() * 1000)
    local_poster = (
        download_image(poster_url, f"posters/openlib_{work_id}_{cache_bust}.jpg")
        if poster_url
        else ""
    )

    if local_poster.startswith("media/"):
        local_poster = local_poster[len("media/") :]

    # Release date
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
        provider_ids={"openlib": str(work_id)},
        cover_url=local_poster,
        banner_url="",
        overview=description,
        release_date=release_date,
        cast=[{"name": name, "character": ""} for name in author_names],
        seasons=None,
        related_titles=[],
        screenshots=[],
        total_main=total_pages,
    )

    return JsonResponse({"success": True, "message": "Book added to list"})
