from core.services.g_api_errors import api_errors, as_api_error
import re
import datetime
import time

import requests
from django.apps import apps
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.urls import reverse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET

from core.models import MediaItem


def _openlib_json(url, *, params=None, deadline=None, optional=False):
    # Normal browsing allows slow Open Library responses. After deletion, all
    # required/optional calls share one shorter navigation budget.
    timeout = 60
    if deadline is not None:
        # Leave time to render an already fetched Work before the browser's
        # post-delete guard expires; optional metadata must not consume it all.
        timeout = min(timeout, deadline - time.monotonic() - (3 if optional else 0))
        if timeout <= 0:
            raise requests.Timeout("Open Library detail navigation timed out.")
    options = {"timeout": timeout}
    if params is not None:
        options["params"] = params
    response = requests.get(url, **options)
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, dict):
        raise ValueError("Invalid Open Library response.")
    return data


def _openlib_list(data, field):
    value = data.get(field)
    return value if isinstance(value, list) else []


@ensure_csrf_cookie
@require_GET
@api_errors('openlib')
def openlib_search(request):
    query = request.GET.get("q", "").strip()

    if not query:
        return JsonResponse({"error": "Query parameter 'q' is required."}, status=400)

    url = "https://openlibrary.org/search.json"
    params = {"q": query}

    try:
        data = _openlib_json(url, params=params)
    except (requests.RequestException, ValueError) as error:
        raise as_api_error(error, 'openlib') from error
    results = []
    editions_available = True

    for item in _openlib_list(data, "docs"):
        if not isinstance(item, dict):
            continue
        title = item.get("title") if isinstance(item.get("title"), str) and item["title"] else "Untitled"
        author = ", ".join(name for name in _openlib_list(item, "author_name") if isinstance(name, str))
        year = item.get("first_publish_year", "")
        description = item.get("subtitle", "")
        poster_url = None

        # Prefer edition-based cover if possible
        edition_keys = _openlib_list(item, "edition_key")
        if editions_available and edition_keys:
            for key in edition_keys[:3]:  # Check up to 3 editions
                if not isinstance(key, str) or not key:
                    continue
                try:
                    ed_data = _openlib_json(f"https://openlibrary.org/books/{key}.json")
                except (requests.Timeout, requests.ConnectionError):
                    # Preserve the search results instead of repeating the same
                    # optional outage for every edition of every result.
                    editions_available = False
                    break
                except requests.HTTPError as error:
                    if error.response is not None and (error.response.status_code == 429 or error.response.status_code >= 500):
                        editions_available = False
                        break
                    continue
                except (requests.RequestException, ValueError):
                    continue
                fmt = ed_data.get("physical_format")
                fmt = fmt.lower() if isinstance(fmt, str) else ""
                if "hardcover" in fmt or "paperback" in fmt or "book" in fmt:
                    cover_ids = _openlib_list(ed_data, "covers")
                    if cover_ids:
                        poster_url = f"https://covers.openlibrary.org/b/id/{cover_ids[0]}-L.jpg"
                        break

        # Fallback to search cover if edition didn't yield better one
        if not poster_url and "cover_i" in item:
            poster_url = f"https://covers.openlibrary.org/b/id/{item['cover_i']}-L.jpg"

        results.append(
            {
                "id": item.get("key", "").split("/")[-1] if isinstance(item.get("key"), str) else "",  # Extract OLxxxxxW
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
@api_errors('openlib', detail_page=True)
def openlib_detail(request, work_id):
    item = None
    deadline = time.monotonic() + 30 if request.GET.get("after_delete") == "1" else None
    try:
        item = MediaItem.objects.get(provider_ids__openlib=str(work_id))

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
        details_sections_order = settings.details_sections_order if settings else []

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
                "details_sections_order": details_sections_order,
            },
        )

    except MediaItem.DoesNotExist:
        pass  # Fall through to live fetch

    # Fetch from Open Library API
    detail_url = f"https://openlibrary.org/works/{work_id}.json"
    try:
        detail_data = _openlib_json(detail_url, deadline=deadline)
    except (requests.RequestException, ValueError) as error:
        if deadline is not None:
            return redirect(f"{reverse('books')}?detail_unavailable=1")
        raise as_api_error(error, 'openlib') from error

    # Title and description
    title = detail_data.get("title") if isinstance(detail_data.get("title"), str) and detail_data["title"] else "Untitled"
    description_raw = detail_data.get("description", "")
    if isinstance(description_raw, dict):
        description = description_raw.get("value", "")
    else:
        description = description_raw
    if not isinstance(description, str):
        description = ""

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
    cover_ids = _openlib_list(detail_data, "covers")
    poster_url = (
        f"https://covers.openlibrary.org/b/id/{cover_ids[0]}-L.jpg"
        if cover_ids
        else None
    )

    # Try to format a date (note: not always present)
    created = detail_data.get("created")
    raw_date = created.get("value", "") if isinstance(created, dict) else ""
    if not isinstance(raw_date, str):
        raw_date = ""
    formatted_release_date = ""
    try:
        if raw_date:
            parsed_date = datetime.datetime.strptime(raw_date[:10], "%Y-%m-%d")
            formatted_release_date = parsed_date.strftime("%d %B %Y")
    except ValueError:
        formatted_release_date = raw_date

    # Author names (optional enhancement)
    author_names = []
    extras_available = True
    for a in _openlib_list(detail_data, "authors"):
        if deadline is not None and time.monotonic() >= deadline - 3:
            break
        author = a.get("author") if isinstance(a, dict) else None
        author_key = author.get("key", "") if isinstance(author, dict) else ""
        if not isinstance(author_key, str) or not author_key.startswith("/authors/"):
            continue
        if author_key:
            try:
                author_data = _openlib_json(f"https://openlibrary.org{author_key}.json", deadline=deadline, optional=True)
            except (requests.Timeout, requests.ConnectionError):
                extras_available = False
                break
            except requests.HTTPError as error:
                if error.response is not None and (error.response.status_code == 429 or error.response.status_code >= 500):
                    extras_available = False
                    break
                continue
            except (requests.RequestException, ValueError):
                continue
            name = author_data.get("name")
            if isinstance(name, str) and name:
                author_names.append(name)

    # Recommendations: based on shared subjects (limit to 8)
    subjects = [value for value in _openlib_list(detail_data, "subjects") if isinstance(value, str) and value]
    recommendations = []
    if extras_available and subjects and (deadline is None or time.monotonic() < deadline - 3):
        try:
            rec_data = _openlib_json(
                "https://openlibrary.org/search.json",
                params={"subject": subjects[0], "limit": 8, "fields": "key,title,cover_i"},
                deadline=deadline, optional=True,
            )
        except (requests.RequestException, ValueError):
            rec_data = {}
        for doc in _openlib_list(rec_data, "docs"):
            if not isinstance(doc, dict) or not isinstance(doc.get("key"), str):
                continue
            rec_id = doc["key"].split("/")[-1]
            if not rec_id:
                continue
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
    details_sections_order = settings.details_sections_order if settings else []

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
            "details_sections_order": details_sections_order,
        },
    )
