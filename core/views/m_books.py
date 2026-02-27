import re
import datetime

import requests
from django.apps import apps
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET

from core.models import MediaItem


@ensure_csrf_cookie
@require_GET
def openlib_search(request):
    query = request.GET.get("q", "").strip()

    if not query:
        return JsonResponse({"error": "Query parameter 'q' is required."}, status=400)

    url = "https://openlibrary.org/search.json"
    params = {"q": query}

    response = requests.get(url, params=params)
    if response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch from Open Library."}, status=500)

    data = response.json()
    results = []

    for item in data.get("docs", []):
        title = item.get("title") or "Untitled"
        author = ", ".join(item.get("author_name", []))
        year = item.get("first_publish_year", "")
        description = item.get("subtitle", "")
        poster_url = None

        # Prefer edition-based cover if possible
        edition_keys = item.get("edition_key", [])
        if edition_keys:
            for key in edition_keys[:3]:  # Check up to 3 editions
                edition_response = requests.get(
                    f"https://openlibrary.org/books/{key}.json"
                )
                if edition_response.status_code == 200:
                    ed_data = edition_response.json()
                    fmt = ed_data.get("physical_format", "").lower()
                    if "hardcover" in fmt or "paperback" in fmt or "book" in fmt:
                        cover_ids = ed_data.get("covers", [])
                        if cover_ids:
                            poster_url = f"https://covers.openlibrary.org/b/id/{cover_ids[0]}-L.jpg"
                            break

        # Fallback to search cover if edition didn't yield better one
        if not poster_url and "cover_i" in item:
            poster_url = f"https://covers.openlibrary.org/b/id/{item['cover_i']}-L.jpg"

        results.append(
            {
                "id": item.get("key", "").split("/")[-1],  # Extract OLxxxxxW
                "title": title,
                "media_type": "book",
                "poster_path": poster_url,
                "overview": description,
                "release_date": str(year),
                "author": author,
            }
        )

    return JsonResponse({"results": results})


@ensure_csrf_cookie
@require_GET
def openlib_detail(request, work_id):
    item = None
    try:
        item = MediaItem.objects.get(source="openlib", source_id=work_id)

        raw_date = item.release_date or ""
        formatted_release_date = ""
        try:
            if raw_date:
                parsed_date = datetime.datetime.strptime(raw_date, "%Y-%m-%d")
                formatted_release_date = parsed_date.strftime("%d %B %Y")
        except ValueError:
            formatted_release_date = raw_date

        # Get theme mode
        AppSettings = apps.get_model("core", "AppSettings")
        settings = AppSettings.objects.first()
        theme_mode = settings.theme_mode if settings else "dark"

        return render(
            request,
            "core/p_media_details.html",
            {
                "item": item,
                "item_id": item.id,
                "source": "openlib",
                "source_id": work_id,
                "in_my_list": True,
                "media_type": "book",
                "title": item.title,
                "overview": item.overview,
                "banner_url": item.banner_url,
                "poster_url": item.cover_url,
                "release_date": formatted_release_date,
                "genres": [],
                "cast": item.cast or [],
                "recommendations": [],
                "seasons": None,
                "page_type": "book",
                "theme_mode": theme_mode,
            },
        )

    except MediaItem.DoesNotExist:
        pass  # Fall through to live fetch

    # Fetch from Open Library API
    detail_url = f"https://openlibrary.org/works/{work_id}.json"
    detail_response = requests.get(detail_url)

    if detail_response.status_code != 200:
        return JsonResponse(
            {"error": "Failed to fetch book details from Open Library."}, status=500
        )

    detail_data = detail_response.json()

    # Title and description
    title = detail_data.get("title", "Untitled")
    description_raw = detail_data.get("description", "")
    if isinstance(description_raw, dict):
        description = description_raw.get("value", "")
    else:
        description = description_raw

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

    # Cover image
    cover_ids = detail_data.get("covers", [])
    poster_url = (
        f"https://covers.openlibrary.org/b/id/{cover_ids[0]}-L.jpg"
        if cover_ids
        else None
    )

    # Try to format a date (note: not always present)
    raw_date = detail_data.get("created", {}).get("value", "")
    formatted_release_date = ""
    try:
        if raw_date:
            parsed_date = datetime.datetime.strptime(raw_date[:10], "%Y-%m-%d")
            formatted_release_date = parsed_date.strftime("%d %B %Y")
    except ValueError:
        formatted_release_date = raw_date

    # Author names (optional enhancement)
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

    # Recommendations: based on shared subjects (limit to 8)
    subjects = detail_data.get("subjects", [])
    recommendations = []
    if subjects:
        subject = subjects[0].replace(" ", "+")
        rec_response = requests.get(
            f"https://openlibrary.org/search.json?subject={subject}"
        )
        if rec_response.status_code == 200:
            rec_data = rec_response.json()
            for doc in rec_data.get("docs", []):
                rec_id = doc.get("key", "").split("/")[-1]
                rec_title = doc.get("title", "Untitled")
                rec_cover_id = doc.get("cover_i")
                rec_cover_url = (
                    f"https://covers.openlibrary.org/b/id/{rec_cover_id}-M.jpg"
                    if rec_cover_id
                    else None
                )
                recommendations.append(
                    {
                        "id": rec_id,
                        "title": rec_title,
                        "poster_path": rec_cover_url,
                        "media_type": "book",
                    }
                )
                if len(recommendations) >= 8:
                    break

    # Get theme mode
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else "dark"

    return render(
        request,
        "core/p_media_details.html",
        {
            "item": None,
            "item_id": None,
            "source": "openlib",
            "source_id": work_id,
            "in_my_list": False,
            "media_type": "book",
            "title": title,
            "overview": description,
            "banner_url": None,
            "poster_url": poster_url,
            "release_date": formatted_release_date,
            "genres": [],
            "cast": [{"name": name, "character": ""} for name in author_names],
            "recommendations": recommendations,
            "seasons": None,
            "page_type": "book",
            "theme_mode": theme_mode,
        },
    )
