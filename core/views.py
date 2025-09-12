from django.apps import apps
from core.utils import download_image, fetch_anilist_data, get_trending_anime, get_trending_games, get_trending_manga, get_trending_movies, get_trending_tv, get_igdb_token, get_anime_extra_info, get_game_extra_info, get_manga_extra_info, get_movie_extra_info, get_tv_extra_info, rating_to_display, display_to_rating
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from django.db.models import Case, When, IntegerField, Value, F
from django.conf import settings
from django.core.files.storage import default_storage
from django.core.serializers import deserialize
from core.background import start_tmdb_background_loop, start_anilist_background_loop
from django.core.serializers import serialize
from django.http import FileResponse, HttpResponseBadRequest
from django.shortcuts import render
from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from datetime import timedelta
from collections import defaultdict
from .models import APIKey, MediaItem, FavoritePerson, NavItem
from django.db.models import Sum
from django.utils.text import slugify
from django.urls import reverse
from django.db import transaction
from django.core.files.base import ContentFile
from django.utils.timesince import timesince
import time
import json
import requests
import logging
import os
import datetime
import shutil
import tempfile
import zipfile
import glob
import re



logger = logging.getLogger(__name__)

IGDB_ACCESS_TOKEN = None
IGDB_TOKEN_EXPIRY = 0





@ensure_csrf_cookie
def movies(request):

    status_ordering = Case(
        When(status='ongoing', then=Value(1)),
        When(status='completed', then=Value(2)),
        When(status='on_hold', then=Value(3)),
        When(status='planned', then=Value(4)),
        When(status='dropped', then=Value(5)),
        default=Value(6),  # just in case
        output_field=IntegerField(),
    )
    
    rating_ordering = Case(
        When(personal_rating=None, then=Value(0)),  # Null rating gets lowest priority
        default=F('personal_rating'),  # Use actual rating for ordering
        output_field=IntegerField(),
    )
    
    movies = MediaItem.objects.filter(media_type="movie").annotate(
        status_order=status_ordering,
        rating_order=rating_ordering
    ).order_by('status_order', '-rating_order', 'title')

    # Get current rating mode from AppSettings
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else 'faces'

    return render(request, 'core/movies.html', {
        'items': movies,
        'page_type': 'movie',
        'rating_mode': rating_mode,
    })


@ensure_csrf_cookie
def tvshows(request):
    status_ordering = Case(
        When(status='ongoing', then=Value(1)),
        When(status='completed', then=Value(2)),
        When(status='on_hold', then=Value(3)),
        When(status='planned', then=Value(4)),
        When(status='dropped', then=Value(5)),
        default=Value(6),
        output_field=IntegerField(),
    )
    
    rating_ordering = Case(
        When(personal_rating=None, then=Value(0)),  # Null rating gets lowest priority
        default=F('personal_rating'),  # Use actual rating for ordering
        output_field=IntegerField(),
    )
    
    tvshows = MediaItem.objects.filter(media_type="tv").annotate(
        status_order=status_ordering,
        rating_order=rating_ordering
    ).order_by('status_order', '-rating_order', 'title')

    # Get current rating mode from AppSettings
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else 'faces'

    return render(request, 'core/tvshows.html', {
        'items': tvshows,
        'page_type': 'tv',
        'rating_mode': rating_mode,
    })


@ensure_csrf_cookie
def anime(request):
    status_ordering = Case(
        When(status='ongoing', then=Value(1)),
        When(status='completed', then=Value(2)),
        When(status='on_hold', then=Value(3)),
        When(status='planned', then=Value(4)),
        When(status='dropped', then=Value(5)),
        default=Value(6),
        output_field=IntegerField(),
    )
    
    rating_ordering = Case(
        When(personal_rating=None, then=Value(0)),  # Null rating gets lowest priority
        default=F('personal_rating'),  # Use actual rating for ordering
        output_field=IntegerField(),
    )
    
    anime = MediaItem.objects.filter(media_type="anime").annotate(
        status_order=status_ordering,
        rating_order=rating_ordering
    ).order_by('status_order', '-rating_order', 'title')

    # Get current rating mode from AppSettings
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else 'faces'

    return render(request, 'core/anime.html', {
        'items': anime,
        'page_type': 'anime',
        'rating_mode': rating_mode,
    })


@ensure_csrf_cookie
def games(request):
    status_ordering = Case(
        When(status='ongoing', then=Value(1)),
        When(status='completed', then=Value(2)),
        When(status='on_hold', then=Value(3)),
        When(status='planned', then=Value(4)),
        When(status='dropped', then=Value(5)),
        default=Value(6),
        output_field=IntegerField(),
    )
    
    rating_ordering = Case(
        When(personal_rating=None, then=Value(0)),  # Null rating gets lowest priority
        default=F('personal_rating'),  # Use actual rating for ordering
        output_field=IntegerField(),
    )
    
    games = MediaItem.objects.filter(media_type="game").annotate(
        status_order=status_ordering,
        rating_order=rating_ordering
    ).order_by('status_order', '-rating_order', 'title')

    # Get current rating mode from AppSettings
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else 'faces'

    return render(request, 'core/games.html', {
        'items': games,
        'page_type': 'game',
        'rating_mode': rating_mode,
    })


@ensure_csrf_cookie
def manga(request):
    status_ordering = Case(
        When(status='ongoing', then=Value(1)),
        When(status='completed', then=Value(2)),
        When(status='on_hold', then=Value(3)),
        When(status='planned', then=Value(4)),
        When(status='dropped', then=Value(5)),
        default=Value(6),
        output_field=IntegerField(),
    )
    
    rating_ordering = Case(
        When(personal_rating=None, then=Value(0)),  # Null rating gets lowest priority
        default=F('personal_rating'),  # Use actual rating for ordering
        output_field=IntegerField(),
    )
    
    manga = MediaItem.objects.filter(media_type="manga").annotate(
        status_order=status_ordering,
        rating_order=rating_ordering
    ).order_by('status_order', '-rating_order', 'title')

    # Get current rating mode from AppSettings
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else 'faces'

    return render(request, 'core/manga.html', {
        'items': manga,
        'page_type': 'manga',
        'rating_mode': rating_mode,
    })


@ensure_csrf_cookie
def books(request):
    status_ordering = Case(
        When(status='ongoing', then=Value(1)),
        When(status='completed', then=Value(2)),
        When(status='on_hold', then=Value(3)),
        When(status='planned', then=Value(4)),
        When(status='dropped', then=Value(5)),
        default=Value(6),
        output_field=IntegerField(),
    )
    
    rating_ordering = Case(
        When(personal_rating=None, then=Value(0)),  # Null rating gets lowest priority
        default=F('personal_rating'),  # Use actual rating for ordering
        output_field=IntegerField(),
    )
    
    books = MediaItem.objects.filter(media_type="book").annotate(
        status_order=status_ordering,
        rating_order=rating_ordering
    ).order_by('status_order', '-rating_order', 'title')

    # Get current rating mode from AppSettings
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else 'faces'

    return render(request, 'core/books.html', {
        'items': books,
        'page_type': 'book',
        'rating_mode': rating_mode,
    })

@ensure_csrf_cookie
def history(request):
    # Load all items
    items = MediaItem.objects.all().order_by('-date_added')  # newest first

    # For sidebar: calculate latest 3 years dynamically
    current_year = timezone.now().year
    latest_years = [current_year - i for i in range(3)]  # e.g., 2025, 2024, 2023

    return render(request, 'core/history.html', {
        'items': items,
        'latest_years': latest_years,
    })

@ensure_csrf_cookie
def home(request):
    favorites = MediaItem.objects.filter(favorite=True)
    start_tmdb_background_loop()
    start_anilist_background_loop()

    favorite_sections = {
        "Movies": favorites.filter(media_type="movie"),
        "TV Shows": favorites.filter(media_type="tv"),
        "Anime": favorites.filter(media_type="anime"),
        "Manga": favorites.filter(media_type="manga"),
        "Games": favorites.filter(media_type="game"),
        "Books": favorites.filter(media_type="book"),
    }

    all_items = MediaItem.objects.all()
    media_counts = {
        "Movies": all_items.filter(media_type="movie").count(),
        "TV Shows": all_items.filter(media_type="tv").count(),
        "Anime": all_items.filter(media_type="anime").count(),
        "Games": all_items.filter(media_type="game").count(),
        "Books": all_items.filter(media_type="book").count(),
        "Manga": all_items.filter(media_type="manga").count(),
    }

    total_entries = sum(media_counts.values())

    media_colors = {
        "Movies": "#F4B400",     # Yellow
        "TV Shows": "#DB4437",   # Red
        "Anime": "#4285F4",      # Blue
        "Games": "#0F9D58",      # Green
        "Books": "#F06292",
        "Manga": "#A142F4",      # Purple
    }

    stats_blocks = []
    for label, count in media_counts.items():
        if count > 0:
            stats_blocks.append({
                "label": label,
                "count": count,
                "color": media_colors[label],
                "percentage": round((count / total_entries) * 100, 2) if total_entries else 0,
            })

    stats = dict(media_counts)
    stats["Total Entries"] = total_entries
    stats["Favorites"] = favorites.count()

    # Extra stats
    movie_count = media_counts["Movies"]
    tv_episodes = all_items.filter(media_type="tv").aggregate(Sum("progress_main"))["progress_main__sum"] or 0
    anime_episodes = all_items.filter(media_type="anime").aggregate(Sum("progress_main"))["progress_main__sum"] or 0

    total_hours = movie_count * (90/60) + tv_episodes * (40/60) + anime_episodes * (24/60)
    days_watched = round(total_hours / 24, 1)

    game_hours = all_items.filter(media_type="game").aggregate(Sum("progress_main"))["progress_main__sum"] or 0
    days_played = round(game_hours / 24, 1)

    chapters_read = (
        all_items.filter(media_type="manga").aggregate(Sum("progress_main"))["progress_main__sum"] or 0
    )

    pages_read = (
        all_items.filter(media_type="book").aggregate(Sum("progress_main"))["progress_main__sum"] or 0
    )

    extra_stats = {}
    if days_watched > 0:
        extra_stats["Days Watched"] = days_watched
    if days_played > 0:
        extra_stats["Days Played"] = days_played
    if pages_read > 0:
        extra_stats["Pages Read"] = pages_read
    if chapters_read > 0:
        extra_stats["Chapters Read"] = chapters_read

    # Activity history (167 days)
    today = timezone.now().date()
    start_date = today - timedelta(days=166)

    activity_counts = (
        MediaItem.objects
        .filter(date_added__date__gte=start_date)
        .values_list('date_added', flat=True)
    )

    count_by_day = defaultdict(int)
    for dt in activity_counts:
        count_by_day[dt.date()] += 1

    activity_data = []
    for i in range(167):
        day = start_date + timedelta(days=i)
        formatted_date = day.strftime("%A %d %B %Y")
        activity_data.append({
            "date": formatted_date,
            "count": count_by_day.get(day, 0),
        })

    columns = [activity_data[i:i+7] for i in range(0, len(activity_data), 7)]

    notifications = MediaItem.objects.filter(notification=True).order_by('-last_updated')

    notifications_list = []
    for item in notifications:
        if item.media_type == 'tv':
            url = reverse('tmdb_detail', args=[item.media_type, item.source_id])  # adjust the name/args if needed
        elif item.media_type in ['anime', 'manga']:
            url = reverse('mal_detail', args=[item.media_type, item.source_id])
        else:
            url = '#'
        notifications_list.append({
            'id': item.id,
            'title': item.title,
            'url': url,
            'media_type': item.media_type,
        })

    favorite_characters = FavoritePerson.objects.filter(type="character").order_by("position")
    favorite_actors = FavoritePerson.objects.filter(type="actor").order_by("position")

    recent_items = MediaItem.objects.order_by("-date_added")[:12]
    recent_activity = []

    for item in recent_items:
        time_ago = timesince(item.date_added).split(",")[0] + " ago"
        if item.status == "completed":
            action = f"Completed {item.title}"
        elif item.status == "planned":
            action = f"Planned {item.title}"
        elif item.status == "dropped":
            action = f"Dropped {item.title}"
        elif item.status == "ongoing":
            action = f"Started {item.title}"
        elif item.status == "on_hold":
            action = f"Put {item.title} on hold"
        else:
            action = f"Added {item.title}"
    
        # Generate the detail URL
        if item.source == "tmdb" and item.media_type in ["movie", "tv"]:
            url = reverse("tmdb_detail", args=[item.media_type, item.source_id])
        elif item.source == "mal" and item.media_type in ["anime", "manga"]:
            url = reverse("mal_detail", args=[item.media_type, item.source_id])
        elif item.source == "igdb" and item.media_type == "game":
            url = reverse("igdb_detail", args=[item.source_id])
        elif item.source == "openlib" and item.media_type == "book":
            url = reverse("openlib_detail", args=[item.source_id])
        else:
            url = "#"
        
        cover_url = item.cover_url or "/static/core/img/placeholder.png"

        recent_activity.append({
            "message_main": action,
            "message_time": time_ago,
            "media_type": item.media_type,
            "title": item.title,
            "url": url,
            "cover_url": cover_url,
        })

    return render(request, "core/home.html", {
        "favorite_sections": favorite_sections.items(),
        "favorite_characters": favorite_characters,
        "favorite_actors": favorite_actors,
        "stats": stats,
        "stats_blocks": stats_blocks,
        "extra_stats": extra_stats,             # ⬅️ added for HTML usage
        "activity_data": activity_data,
        "activity_columns": columns,
        'notifications': notifications_list,
        "recent_activity": recent_activity,
    })


@ensure_csrf_cookie
@require_POST
def update_favorite_person_order(request):
    try:
        data = json.loads(request.body)
        new_order = data.get("order", [])  # List of IDs in new order

        if not isinstance(new_order, list):
            return JsonResponse({"error": "Invalid data format"}, status=400)

        # Wrap updates in a transaction for atomicity
        with transaction.atomic():
            for position, person_id in enumerate(new_order, start=1):
                FavoritePerson.objects.filter(id=person_id).update(position=position)

        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@ensure_csrf_cookie
def settings_page(request):
    keys = APIKey.objects.all().order_by("name")
    existing_names = [key.name for key in keys]
    allowed_names = APIKey.NAME_CHOICES

    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    if not settings:
        settings = AppSettings.objects.create()  # ensure one exists

    current_rating_mode = settings.rating_mode

    nav_items = NavItem.objects.all().order_by("position")
    for item in nav_items:
        item.display_name = item.get_name_display()

    return render(request, 'core/settings.html', {
        'keys': keys,
        'allowed_names': allowed_names,
        'existing_names': existing_names,
        'nav_items': nav_items,
        "current_rating_mode": current_rating_mode,
        "show_date_field": settings.show_date_field,
        "show_repeats_field": settings.show_repeats_field,
    })

@require_POST
def update_preferences(request):
    data = json.loads(request.body.decode("utf-8"))
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    if not settings:
        settings = AppSettings.objects.create()

    settings.show_date_field = data.get("show_date_field", False)
    settings.show_repeats_field = data.get("show_repeats_field", False)
    settings.save()

    return JsonResponse({"success": True})


@ensure_csrf_cookie
@require_POST
def dismiss_notification(request, item_id):
    try:
        item = MediaItem.objects.get(id=item_id)
        item.notification = False
        item.save()
        return JsonResponse({"success": True})
    except MediaItem.DoesNotExist:
        return JsonResponse({"error": "Item not found"}, status=404)


@ensure_csrf_cookie
def discover_view(request):
    trending_movies = get_trending_movies()
    trending_tv = get_trending_tv()
    trending_anime = get_trending_anime()
    trending_manga = get_trending_manga()
    trending_games = get_trending_games()

    # Combine all trending items into a single list
    media_items = []
    media_items.extend(trending_movies)
    media_items.extend(trending_tv)
    media_items.extend(trending_anime)
    media_items.extend(trending_manga)
    media_items.extend(trending_games)

    MEDIA_SECTIONS = [
    ("movie", "Trending Movies"),
    ("tv", "Trending TV Shows"),
    ("anime", "Trending Anime"),
    ("manga", "Trending Manga"),
    ("game", "Trending Games"),
]

    context = {
        "media_items": media_items,
        "media_sections": MEDIA_SECTIONS,
    }
    return render(request, "core/discover.html", context)

@ensure_csrf_cookie
def board(request):
    firebase_url = "https://media-journal-6c8cf-default-rtdb.europe-west1.firebasedatabase.app"

    # Get only the fields we need for posting
    items = MediaItem.objects.values(
        "id",
        "title",
        "media_type",
        "source",
        "source_id",
        "status"
    ).order_by("title")

    media_types = dict(MediaItem.MEDIA_TYPES)

    return render(request, "core/board.html", {
        "firebase_url": firebase_url,
        "items": list(items),        # Convert QuerySet to list for JSON serialization in template
        "media_types": media_types   # For dropdown
    })

# Anime

@ensure_csrf_cookie
@require_GET
def mal_search(request):
    query_str = request.GET.get("q", "").strip()
    search_type = request.GET.get("type", "anime").lower()

    if not query_str:
        return JsonResponse({"error": "Query parameter 'q' is required."}, status=400)

    if search_type not in ("anime", "manga"):
        return JsonResponse({"error": "Invalid search type. Use 'anime' or 'manga'."}, status=400)

    graphql_query = '''
    query ($search: String, $type: MediaType) {
      Page(perPage: 10) {
        media(search: $search, type: $type) {
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

    variables = {
        "search": query_str,
        "type": search_type.upper()  # "ANIME" or "MANGA"
    }

    headers = {
        "Content-Type": "application/json"
    }

    response = requests.post(
        "https://graphql.anilist.co",
        json={"query": graphql_query, "variables": variables},
        headers=headers
    )

    if response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch from AniList."}, status=500)

    try:
        data = response.json()
        results = []

        for media in data.get("data", {}).get("Page", {}).get("media", []):
            mal_id = media.get("idMal")
            if not mal_id:
                continue  # skip entries without MAL ID

            title = media["title"].get("english") or media["title"].get("romaji") or "Unknown Title"
            poster = media.get("coverImage", {}).get("large")

            results.append({
                "id": str(mal_id),  # Still return MAL ID for compatibility
                "title": title,
                "poster_path": poster,
            })

        return JsonResponse({"results": results})

    except Exception as e:
        return JsonResponse({"error": f"AniList parse error: {str(e)}"}, status=500)


# If search/Anilist API ever breaks use this function that uses the MAL api
# @require_GET
# def mal_search(request):
#     query = request.GET.get("q", "").strip()
#     search_type = request.GET.get("type", "anime").lower()  # default to anime

#     if not query:
#         return JsonResponse({"error": "Query parameter 'q' is required."}, status=400)

#     if search_type not in ("anime", "manga"):
#         return JsonResponse({"error": "Invalid search type. Use 'anime' or 'manga'."}, status=400)

#     try:
#         mal_keys = APIKey.objects.get(name="mal")
#         client_id = mal_keys.key_1
#     except APIKey.DoesNotExist:
#         return JsonResponse({"error": "MAL API keys not found."}, status=500)

#     headers = {
#         "X-MAL-CLIENT-ID": client_id
#     }

#     url = f"https://api.myanimelist.net/v2/{search_type}"
#     params = {
#         "q": query,
#         "limit": 9,
#         "fields": "id,title,main_picture,alternative_titles"
#     }

#     response = requests.get(url, headers=headers, params=params)

#     if response.status_code != 200:
#         return JsonResponse({"error": "Failed to fetch from MAL."}, status=500)

#     data = response.json()
#     results = []
#     for item in data.get("data", []):
#         node = item["node"]
#         english_title = node.get("alternative_titles", {}).get("en")
#         results.append({
#             "id": str(node["id"]),
#             "title": english_title or node["title"],
#             "poster_path": node["main_picture"]["medium"] if node.get("main_picture") else None,
#         })

#     return JsonResponse({"results": results})


# books search
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

    for item in data.get("docs", [])[:10]:
        title = item.get("title") or "Untitled"
        author = ", ".join(item.get("author_name", []))
        year = item.get("first_publish_year", "")
        description = item.get("subtitle", "")
        poster_url = None

        # Prefer edition-based cover if possible
        edition_keys = item.get("edition_key", [])
        if edition_keys:
            for key in edition_keys[:3]:  # Check up to 3 editions
                edition_response = requests.get(f"https://openlibrary.org/books/{key}.json")
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

        results.append({
            "id": item.get("key", "").split("/")[-1],  # Extract OLxxxxxW
            "title": title,
            "media_type": "book",
            "poster_path": poster_url,
            "overview": description,
            "release_date": str(year),
        })

    return JsonResponse({"results": results})


# games search

@ensure_csrf_cookie
@require_GET
def igdb_search(request):
    query = request.GET.get("q", "").strip()
    if not query:
        return JsonResponse({"error": "Query parameter 'q' is required."}, status=400)

    token = get_igdb_token()
    if not token:
        return JsonResponse({"error": "Failed to get IGDB access token."}, status=500)

    try:
        igdb_keys = APIKey.objects.get(name="igdb")
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "IGDB API keys not found."}, status=500)

    headers = {
        "Client-ID": igdb_keys.key_1,
        "Authorization": f"Bearer {token}",
    }

    data = f'''
    search "{query}";
    fields id, name, cover.url;
    where category = (0, 1, 2, 3, 4, 5, 8, 9, 10, 11);
    limit 30;
    '''

    response = requests.post("https://api.igdb.com/v4/games", headers=headers, data=data)
    if response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch from IGDB."}, status=500)

    query_lower = query.lower()
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
        })

    # Manual relevance ranking
    def rank(item):
        name = item["title"].lower()
        if name == query_lower:
            return 0
        if name.startswith(query_lower):
            return 1
        if query_lower in name:
            return 2
        return 3

    results.sort(key=rank)

    return JsonResponse({"results": results[:10]})


# Movies/Shows Search

@ensure_csrf_cookie
@require_GET
def tmdb_search(request):
    query = request.GET.get("q", "").strip()
    media_type = request.GET.get("type", "").lower()  # Expect 'movie' or 'tv'

    if not query:
        return JsonResponse({"error": "Query parameter 'q' is required."}, status=400)

    if media_type not in ("movie", "tv"):
        return JsonResponse({"error": "Query parameter 'type' must be 'movie' or 'tv'."}, status=400)

    from .models import APIKey
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "TMDB API key not found."}, status=500)

    # TMDB endpoint to search movies or TV shows specifically
    if media_type == "movie":
        url = "https://api.themoviedb.org/3/search/movie"
    else:
        url = "https://api.themoviedb.org/3/search/tv"

    params = {"api_key": api_key, "query": query}
    response = requests.get(url, params=params)

    if response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch from TMDB."}, status=500)

    data = response.json()

    # Format results
    results = [
        {
            "id": item["id"],
            "title": item.get("title") or item.get("name"),
            "media_type": media_type,
            "poster_path": item.get("poster_path"),
            "overview": item.get("overview", ""),
            "release_date": item.get("release_date") or item.get("first_air_date", ""),
        }
        for item in data.get("results", [])
    ]

    return JsonResponse({"results": results[:10]})

# Movie and show details

@ensure_csrf_cookie
@require_GET
def tmdb_detail(request, media_type, tmdb_id):
    if media_type not in ("movie", "tv"):
        return JsonResponse({"error": "Invalid media type."}, status=400)

    item = None
    try:
        item = MediaItem.objects.get(source="tmdb", source_id=tmdb_id)

        # Handle cast (add is_full_url for image path rendering)
        cast_data = []
        for member in item.cast or []:
            profile = member.get("profile_path")
            is_full_url = False
            if profile:
                if profile.startswith("http") or profile.startswith("/media/"):
                    is_full_url = True

            cast_data.append({
                "name": member.get("name"),
                "character": member.get("character"),
                "profile_path": profile,
                "is_full_url": is_full_url,
            })

        seasons = item.seasons if media_type == "tv" else None
        if seasons:
            for season in seasons:
                poster = season.get("poster_path")
                if poster:
                    if poster.startswith("http") or poster.startswith("/media/"):
                        season["poster_path_full"] = poster
                    elif poster.startswith("media/"):
                        season["poster_path_full"] = f"/{poster}"
                    else:
                        # fallback: assume it's a TMDB path
                        season["poster_path_full"] = f"https://image.tmdb.org/t/p/w185{poster}"
                else:
                    season["poster_path_full"] = ""

                # Format season air_date like release_date
                raw_air_date = season.get("air_date") or ""
                formatted_air_date = ""
                try:
                    if raw_air_date:
                        parsed_date = datetime.datetime.strptime(raw_air_date, "%Y-%m-%d")
                        formatted_air_date = parsed_date.strftime("%b %Y")
                except ValueError:
                    formatted_air_date = raw_air_date
                season["air_date"] = formatted_air_date

        raw_date = item.release_date or ""
        formatted_release_date = ""

        try:
            if raw_date:
                parsed_date = datetime.datetime.strptime(raw_date, "%Y-%m-%d")
                formatted_release_date = parsed_date.strftime("%d %B %Y")
        except ValueError:
            formatted_release_date = raw_date

        return render(request, "core/detail.html", {
            "item": item,
            "item_id": item.id,
            "source": "tmdb",
            "source_id": tmdb_id,
            "in_my_list": True,
            "media_type": item.media_type,
            "title": item.title,
            "overview": item.overview,
            "banner_url": item.banner_url,
            "poster_url": item.cover_url,
            "release_date": formatted_release_date,
            "genres": [],  # Optional
            "cast": cast_data,
            "recommendations": [],  # Optional
            "seasons": seasons,
            'page_type': media_type,
        })

    except MediaItem.DoesNotExist:
        pass  # Fall through to live fetch

    # Fallback to TMDB API
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "TMDB API key not found."}, status=500)

    url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}"
    params = {"api_key": api_key, "append_to_response": "credits,recommendations"}
    response = requests.get(url, params=params)

    if response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch details from TMDB."}, status=500)

    data = response.json()

    # Poster and Banner (direct URLs from TMDB)
    poster_path = data.get("poster_path")
    banner_path = data.get("backdrop_path")
    poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None
    banner_url = f"https://image.tmdb.org/t/p/original{banner_path}" if banner_path else None

    # Cast (use TMDB URLs)
    cast_data = []
    for i, actor in enumerate(data.get("credits", {}).get("cast", [])[:8]):
        profile_url = f"https://image.tmdb.org/t/p/w185{actor.get('profile_path')}" if actor.get("profile_path") else ""
        cast_data.append({
            "name": actor.get("name"),
            "character": actor.get("character"),
            "profile_path": profile_url,
            "is_full_url": True,  # Because it's a complete URL
        })

    # Seasons
    seasons = data.get("seasons", []) if media_type == "tv" else None
    if seasons:
        for season in seasons:
            poster_path = season.get("poster_path")
            season["poster_path_full"] = f"https://image.tmdb.org/t/p/w185{poster_path}" if poster_path else ""

            # Format air_date for each season
            raw_air_date = season.get("air_date") or ""
            formatted_air_date = ""
            try:
                if raw_air_date:
                    parsed_date = datetime.datetime.strptime(raw_air_date, "%Y-%m-%d")
                    formatted_air_date = parsed_date.strftime("%b %Y")
            except ValueError:
                formatted_air_date = raw_air_date
            season["air_date"] = formatted_air_date

    raw_date = data.get("release_date") or data.get("first_air_date") or ""
    formatted_release_date = ""

    try:
        if raw_date:
            parsed_date = datetime.datetime.strptime(raw_date, "%Y-%m-%d")
            formatted_release_date = parsed_date.strftime("%d %B %Y")  # e.g., "05 November 2023"
    except ValueError:
        formatted_release_date = raw_date  # fallback to raw string if parsing fails

    return render(request, "core/detail.html", {
        "item": None,
        "item_id": None,
        "source": "tmdb",
        "source_id": tmdb_id,
        "in_my_list": False,
        "media_type": media_type,
        "title": data.get("title") or data.get("name"),
        "overview": data.get("overview", ""),
        "banner_url": banner_url,
        "poster_url": poster_url,
        "release_date": formatted_release_date,
        "genres": data.get("genres", []),
        "cast": cast_data,
        "recommendations": data.get("recommendations", {}).get("results", [])[:16],
        "seasons": seasons,
        'page_type': media_type,
    })

def save_tmdb_item(media_type, tmdb_id):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
        url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}"
        params = {"api_key": api_key, "append_to_response": "credits"}
        response = requests.get(url, params=params)

        if response.status_code != 200:
            return JsonResponse({"error": "Failed to fetch TMDB details."})

        data = response.json()

        # Poster and banner
        poster_url = f"https://image.tmdb.org/t/p/w500{data.get('poster_path')}" if data.get("poster_path") else ""
        banner_url = f"https://image.tmdb.org/t/p/original{data.get('backdrop_path')}" if data.get("backdrop_path") else ""
        local_poster = download_image(poster_url, f"posters/tmdb_{tmdb_id}.jpg") if poster_url else ""
        local_banner = download_image(banner_url, f"banners/tmdb_{tmdb_id}.jpg") if banner_url else ""

        # Cast
        cast_data = []
        for i, actor in enumerate(data.get("credits", {}).get("cast", [])[:8]):
            profile_url = f"https://image.tmdb.org/t/p/w185{actor.get('profile_path')}" if actor.get("profile_path") else ""
            local_profile = download_image(profile_url, f"cast/tmdb_{tmdb_id}_{i}.jpg") if profile_url else ""
            cast_data.append({
                "name": actor.get("name"),
                "character": actor.get("character"),
                "profile_path": local_profile,
            })

        # Seasons (only for TV shows)
        seasons = []
        if media_type == "tv":
            for i, season in enumerate(data.get("seasons", [])):
                season_poster_url = f"https://image.tmdb.org/t/p/w300{season.get('poster_path')}" if season.get("poster_path") else ""
                local_season_poster = download_image(season_poster_url, f"seasons/tmdb_{tmdb_id}_s{i}.jpg") if season_poster_url else ""

                seasons.append({
                    "season_number": season.get("season_number"),
                    "name": season.get("name"),
                    "episode_count": season.get("episode_count"),
                    "poster_path": local_season_poster,
                    "air_date": season.get("air_date"),
                })

        MediaItem.objects.create(
            title=data.get("title") or data.get("name"),
            media_type=media_type,
            source="tmdb",
            source_id=tmdb_id,
            cover_url=local_poster,
            banner_url=local_banner,
            overview=data.get("overview", ""),
            release_date=data.get("release_date") or data.get("first_air_date") or "",
            cast=cast_data,
            seasons=seasons,
        )

        return JsonResponse({"message": "Added to your list."})

    except Exception as e:
        return JsonResponse({"error": f"Failed to save: {str(e)}"})


@ensure_csrf_cookie
@require_GET
def mal_detail(request, media_type, mal_id):
    if media_type not in ("anime", "manga"):
        return JsonResponse({"error": "Invalid media type."}, status=400)

    item = None
    item_id = None
    cast = []
    prequels = []
    sequels = []
    poster_url = None
    banner_url = None
    overview = ""
    release_date = ""
    formatted_release_date = ""
    title = ""
    in_my_list = False

    try:
        item = MediaItem.objects.get(source="mal", source_id=mal_id)
        item_id = item.id
        title = item.title
        poster_url = item.cover_url
        banner_url = item.banner_url
        overview = item.overview
        release_date = item.release_date

        # Format release date from DB
        if release_date:
            try:
                parsed_date = datetime.datetime.strptime(release_date, "%Y-%m-%d")
                formatted_release_date = parsed_date.strftime("%d %B %Y")
            except ValueError:
                formatted_release_date = release_date

        cast = []
        for member in item.cast or []:
            profile = member.get("profile_path")
            is_full_url = profile.startswith("http") or profile.startswith("/media/") if profile else False
            cast.append({
                "name": member.get("name"),
                "character": member.get("character"),
                "profile_path": profile,
                "is_full_url": is_full_url,
            })

        for related in item.related_titles or []:
            entry = {
                "id": related.get("mal_id"),
                "title": related.get("title"),
                "poster_path": related.get("poster_path"),
                "is_full_url": related.get("poster_path", "").startswith("http") or related.get("poster_path", "").startswith("/media/"),
            }
            if related.get("relation", "").lower() == "prequel":
                prequels.append(entry)
            elif related.get("relation", "").lower() == "sequel":
                sequels.append(entry)

        in_my_list = True
        recommendations = [];

    except MediaItem.DoesNotExist:
        try:
            anilist_data = fetch_anilist_data(mal_id, media_type)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

        title = anilist_data["title"]
        poster_url = anilist_data["poster_url"]
        banner_url = anilist_data["banner_url"]
        overview = anilist_data["overview"]
        release_date = anilist_data["release_date"]

        # Format release date from AniList
        if release_date:
            try:
                parsed_date = datetime.datetime.strptime(release_date, "%Y-%m-%d")
                formatted_release_date = parsed_date.strftime("%d %B %Y")
            except ValueError:
                formatted_release_date = release_date

        cast = anilist_data["cast"]
        related_titles = anilist_data["related_titles"]
        recommendations = anilist_data.get("recommendations", [])

        prequels = [r for r in related_titles if r["relation"].lower() == "prequel"]
        sequels = [r for r in related_titles if r["relation"].lower() == "sequel"]
        for r in prequels + sequels:
            if "id" not in r and "mal_id" in r:
                r["id"] = r["mal_id"]

    context = {
        "item": item,
        "item_id": item_id,
        "source": "mal",
        "source_id": mal_id,
        "media_type": media_type,
        "title": title,
        "overview": overview,
        "poster_url": poster_url,
        "banner_url": banner_url,
        "release_date": formatted_release_date,
        "cast": cast,
        "seasons": None,
        "recommendations": [],
        "prequels": prequels,
        "sequels": sequels,
        "in_my_list": in_my_list,
        "recommendations": recommendations,
        'page_type': media_type,
    }

    return render(request, "core/detail.html", context)

def save_mal_item(media_type, mal_id):
    try:
        anilist_data = fetch_anilist_data(mal_id, media_type)

        # --- Download images
        local_poster = download_image(
            anilist_data["poster_url"], f"posters/mal_{mal_id}.jpg"
        ) if anilist_data["poster_url"] else ""

        local_banner = download_image(
            anilist_data["banner_url"], f"banners/mal_{mal_id}.jpg"
        ) if anilist_data["banner_url"] else ""

        cast = []
        for i, member in enumerate(anilist_data["cast"][:8]):
            profile_url = member.get("profile_path")
            local_path = download_image(profile_url, f"cast/mal_{mal_id}_{i}.jpg") if profile_url else ""
            cast.append({
                "name": member["name"],
                "character": member["character"],
                "profile_path": local_path,
            })

        related_titles = []
        for related in anilist_data["related_titles"]:
            r_id = related["mal_id"]
            poster_path = related["poster_path"]
            local_related_poster = download_image(poster_path, f"related/mal_{r_id}.jpg") if poster_path else ""

            related_titles.append({
                "mal_id": r_id,
                "title": related["title"],
                "poster_path": local_related_poster,
                "relation": related["relation"],
            })

        # --- Save to DB
        MediaItem.objects.create(
            title=anilist_data["title"],
            media_type=media_type,
            source="mal",  # Still marked as "mal" for consistency
            source_id=mal_id,
            cover_url=local_poster,
            banner_url=local_banner,
            overview=anilist_data["overview"],
            release_date=anilist_data["release_date"],
            cast=cast,
            seasons=None,
            related_titles=related_titles,
        )

        return JsonResponse({"message": "Saved to your list."})

    except Exception as e:
        return JsonResponse({"error": f"Save failed: {str(e)}"})


# In case anilist breaks, comment out that functions and use those functions!!<3   
# @require_GET
# def mal_detail(request, media_type, mal_id):
#     in_my_list = False
#     if media_type not in ("anime", "manga"):
#         return JsonResponse({"error": "Invalid media type."}, status=400)

#     item = None
#     item_id = None
#     cast = []
#     prequels = []
#     sequels = []
#     banner_url = None
#     poster_url = None
#     overview = ""
#     release_date = ""

#     # Check if it's saved in the local DB
#     try:
#         item = MediaItem.objects.get(source="mal", source_id=mal_id)
#         item_id = item.id

#         # Prepare cast data
#         for member in item.cast or []:
#             profile = member.get("profile_path")
#             is_full_url = profile.startswith("http") or profile.startswith("/media/") if profile else False
#             cast.append({
#                 "name": member.get("name"),
#                 "character": member.get("character"),
#                 "profile_path": profile,
#                 "is_full_url": is_full_url,
#             })

#         # Prepare related titles
#         for related in item.related_titles or []:
#             poster = related.get("poster_path")
#             is_full_url = poster.startswith("http") or poster.startswith("/media/") if poster else False
#             entry = {
#                 "id": related.get("mal_id"),
#                 "title": related.get("title"),
#                 "poster_path": poster,
#                 "is_full_url": is_full_url,
#             }
#             if related.get("relation", "").lower() == "prequel":
#                 prequels.append(entry)
#             elif related.get("relation", "").lower() == "sequel":
#                 sequels.append(entry)

#         poster_url = item.cover_url
#         banner_url = item.banner_url
#         overview = item.overview
#         release_date = item.release_date
#         in_my_list = True

#     except MediaItem.DoesNotExist:
#         # Live fetch from Jikan and AniList
#         jikan_url = f"https://api.jikan.moe/v4/{media_type}/{mal_id}/full"
#         response = requests.get(jikan_url)
#         if response.status_code != 200:
#             return JsonResponse({"error": "Failed to fetch details from Jikan."}, status=500)

#         data = response.json().get("data", {})
#         poster_url = data.get("images", {}).get("jpg", {}).get("large_image_url") or \
#                      data.get("images", {}).get("jpg", {}).get("image_url")
#         overview = data.get("synopsis")
#         release_date = data.get("aired", {}).get("from") or data.get("published", {}).get("from")
#         title = data.get("title_english") or data.get("title") or "Unknown Title"

#         # Cast
#         char_url = f"https://api.jikan.moe/v4/{media_type}/{mal_id}/characters"
#         char_resp = requests.get(char_url)
#         if char_resp.status_code == 200:
#             for ch in char_resp.json().get("data", [])[:10]:
#                 cast.append({
#                     "name": ch["character"]["name"],
#                     "character": ch["role"],
#                     "profile_path": ch["character"]["images"]["jpg"]["image_url"],
#                     "is_full_url": True,
#                 })

#         # Related titles: fetch posters using same method as save_mal_item
#         related_titles = []
#         for relation in data.get("relations", []):
#             if relation["relation"].lower() in ("prequel", "sequel"):
#                 for entry in relation["entry"]:
#                     r_id = entry["mal_id"]

#                     # Use a different variable to avoid overwriting the main poster
#                     detail_url = f"https://api.jikan.moe/v4/{media_type}/{r_id}"
#                     r_resp = requests.get(detail_url)
#                     if r_resp.status_code == 200:
#                         r_data = r_resp.json().get("data", {})
#                         r_title = r_data.get("title_english") or r_data.get("title") or entry["name"]
#                         related_poster = r_data.get("images", {}).get("jpg", {}).get("image_url") or ""
#                     else:
#                         related_poster = ""

#                     related_titles.append({
#                         "id": r_id,
#                         "mal_id": r_id,
#                         "title": r_title,
#                         "poster_path": related_poster,
#                         "relation": relation["relation"].capitalize(),  # "Prequel" or "Sequel"
#                         "is_full_url": True,
#                     })
#                     time.sleep(1)

#         prequels = [r for r in related_titles if r["relation"].lower() == "prequel"]
#         sequels = [r for r in related_titles if r["relation"].lower() == "sequel"]
#         print("SEQUELS:", json.dumps(sequels, indent=2))
        

#         banner_url = fetch_anilist_banner(mal_id, media_type)

#     context = {
#         "item": item,
#         "item_id": item_id,
#         "source": "mal",
#         "source_id": mal_id,
#         "media_type": media_type,
#         "title": item.title if item else title,
#         "overview": overview,
#         "poster_url": poster_url,
#         "banner_url": banner_url,
#         "release_date": release_date,
#         "cast": cast,
#         "seasons": None,
#         "recommendations": [],
#         "prequels": prequels,
#         "sequels": sequels,
#         "in_my_list": in_my_list,
#     }

#     return render(request, "core/detail.html", context)


# def save_mal_item(media_type, mal_id):
#     try:
#         # --- Fetch Jikan full data
#         jikan_url = f"https://api.jikan.moe/v4/{media_type}/{mal_id}/full"
#         response = requests.get(jikan_url)
#         if response.status_code != 200:
#             return JsonResponse({"error": "Failed to fetch data from Jikan."})
#         data = response.json().get("data", {})

#         # --- Poster
#         poster_url = data.get("images", {}).get("jpg", {}).get("large_image_url") or \
#                      data.get("images", {}).get("jpg", {}).get("image_url") or ""
#         local_poster = download_image(poster_url, f"posters/mal_{mal_id}.jpg") if poster_url else ""

#         # --- Banner (AniList)
#         banner_url = fetch_anilist_banner(mal_id, media_type)
#         local_banner = download_image(banner_url, f"banners/mal_{mal_id}.jpg") if banner_url else ""
#         main_poster = download_image(poster_url, f"posters/mal_{mal_id}.jpg") if poster_url else ""

#         # --- Title and description
#         title = data.get("title_english") or data.get("title") or "Unknown Title"
#         overview = data.get("synopsis") or ""
#         release_date = data.get("aired", {}).get("from") or data.get("published", {}).get("from") or ""

#         # --- Cast
#         cast = []
#         char_url = f"https://api.jikan.moe/v4/{media_type}/{mal_id}/characters"
#         char_resp = requests.get(char_url)
#         if char_resp.status_code == 200:
#             for i, ch in enumerate(char_resp.json().get("data", [])[:10]):
#                 image_url = ch["character"]["images"]["jpg"]["image_url"]
#                 local_path = download_image(image_url, f"cast/mal_{mal_id}_{i}.jpg")
#                 cast.append({
#                     "name": ch["character"]["name"],
#                     "character": ch["role"],
#                     "profile_path": local_path,
#                 })

#         # --- Related Titles (prequels/sequels)
#         related_titles = []
#         for relation in data.get("relations", []):
#             if relation["relation"].lower() in ("prequel", "sequel"):
#                 for entry in relation["entry"]:
#                     r_id = entry["mal_id"]
#                     # Fetch related entry for poster
#                     detail_url = f"https://api.jikan.moe/v4/{media_type}/{r_id}"
#                     r_resp = requests.get(detail_url)
#                     if r_resp.status_code == 200:
#                         r_data = r_resp.json().get("data", {})
#                         r_title = r_data.get("title_english") or r_data.get("title") or entry["name"]
#                         poster_url = r_data.get("images", {}).get("jpg", {}).get("image_url") or ""
#                         local_poster = download_image(poster_url, f"related/mal_{r_id}.jpg") if poster_url else ""
#                     else:
#                         local_poster = ""

#                     related_titles.append({
#                         "mal_id": r_id,
#                         "title": r_title,
#                         "poster_path": local_poster,
#                         "relation": relation["relation"].capitalize(),  # e.g. "Prequel"
#                     })

#         # --- Save to DB
#         MediaItem.objects.create(
#             title=title,
#             media_type=media_type,
#             source="mal",
#             source_id=mal_id,
#             cover_url=main_poster,
#             banner_url=local_banner,
#             overview=overview,
#             release_date=release_date,
#             cast=cast,
#             seasons=None,
#             related_titles=related_titles,
#         )

#         return JsonResponse({"message": "Saved to your list."})

#     except Exception as e:
#         return JsonResponse({"error": f"Save failed: {str(e)}"})


# def fetch_anilist_banner(mal_id, media_type):
#     query = '''
#     query ($malId: Int, $type: MediaType) {
#       Media(idMal: $malId, type: $type) {
#         bannerImage
#       }
#     }
#     '''
#     variables = {
#         "malId": int(mal_id),
#         "type": media_type.upper()  # "ANIME" or "MANGA"
#     }

#     headers = {
#         "Content-Type": "application/json"
#     }

#     try:
#         keys = APIKey.objects.get(name="anilist")
#         client_id = keys.key_1
#         # Not needed in this case, but you can send Client-ID if required
#     except APIKey.DoesNotExist:
#         client_id = None  # fallback if needed

#     response = requests.post(
#         "https://graphql.anilist.co",
#         json={"query": query, "variables": variables},
#         headers=headers
#     )

#     if response.status_code != 200:
#         return None

#     data = response.json().get("data", {}).get("Media")
#     return data.get("bannerImage") if data else None

# Book Details

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

        return render(request, "core/detail.html", {
            "item": item,
            "item_id": item.id,
            "source": "openlib",
            "source_id": work_id,
            "in_my_list": True,
            "media_type": "book",
            "title": item.title,
            "overview": item.overview,
            "banner_url": item.banner_url,  # no wide artwork
            "poster_url": item.cover_url,
            "release_date": formatted_release_date,
            "genres": [],  # Could map from subjects later
            "cast": item.cast or [],
            "recommendations": [],
            "seasons": None,
            "page_type": "book",
        })

    except MediaItem.DoesNotExist:
        pass  # Fall through to live fetch

    # Fetch from Open Library API
    detail_url = f"https://openlibrary.org/works/{work_id}.json"
    detail_response = requests.get(detail_url)

    if detail_response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch book details from Open Library."}, status=500)

    detail_data = detail_response.json()

    # Title and description
    title = detail_data.get("title", "Untitled")
    description_raw = detail_data.get("description", "")
    if isinstance(description_raw, dict):
        description = description_raw.get("value", "")
    else:
        description = description_raw

    description = re.sub(r'- \[.*?\]\(https?://[^\)]+\)', '', description)  # Remove list of markdown links
    description = re.sub(r'\[.*?\]:\s+https?://\S+', '', description)       # Remove link footnotes if present
    description = re.sub(r'-{2,}', '', description)                         # Remove long dashed lines
    description = re.sub(r'See:\s*$', '', description)                      # Remove dangling 'See:' if left
    description = re.sub(r'\(\[.*?\]\[\d+\]\)', '', description)
    description = re.sub(r'\[.*?\]\[\d+\]', '', description)  # Remove [Source][1]
    description = re.sub(r'\[.*?\]\(https?://[^\)]+\)', '', description)
    description = description.strip()

    # Cover image
    cover_ids = detail_data.get("covers", [])
    poster_url = f"https://covers.openlibrary.org/b/id/{cover_ids[0]}-L.jpg" if cover_ids else None

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
        rec_response = requests.get(f"https://openlibrary.org/search.json?subject={subject}")
        if rec_response.status_code == 200:
            rec_data = rec_response.json()
            for doc in rec_data.get("docs", []):
                rec_id = doc.get("key", "").split("/")[-1]
                rec_title = doc.get("title", "Untitled")
                rec_cover_id = doc.get("cover_i")
                rec_cover_url = f"https://covers.openlibrary.org/b/id/{rec_cover_id}-M.jpg" if rec_cover_id else None
                recommendations.append({
                    "id": rec_id,
                    "title": rec_title,
                    "poster_path": rec_cover_url,
                    "media_type": "book",
                })
                if len(recommendations) >= 8:
                    break

    return render(request, "core/detail.html", {
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
        "genres": [],  # Could later be extracted from subjects
        "cast": [{"name": name, "character": ""} for name in author_names],
        "recommendations": recommendations,
        "seasons": None,
        "page_type": "book",
    })

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

    description = re.sub(r'- \[.*?\]\(https?://[^\)]+\)', '', description)  # Remove list of markdown links
    description = re.sub(r'\[.*?\]:\s+https?://\S+', '', description)       # Remove link footnotes if present
    description = re.sub(r'-{2,}', '', description)                         # Remove long dashed lines
    description = re.sub(r'See:\s*$', '', description)                      # Remove dangling 'See:' if left
    description = re.sub(r'\(\[.*?\]\[\d+\]\)', '', description)
    description = re.sub(r'\[.*?\]\[\d+\]', '', description)  # Remove [Source][1]
    description = re.sub(r'\[.*?\]\(https?://[^\)]+\)', '', description)
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

    poster_url = f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg" if cover_id else None
    local_poster = download_image(poster_url, f"posters/openlib_{work_id}.jpg") if poster_url else ""

    if local_poster.startswith("media/"):
        local_poster = local_poster[len("media/"):]

    # No banner art available for books
    banner_url = None
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


# Game Details
@ensure_csrf_cookie
@require_GET
def igdb_detail(request, igdb_id):
    try:
        item = MediaItem.objects.get(source="igdb", source_id=str(igdb_id))
        in_my_list = True
    except MediaItem.DoesNotExist:
        in_my_list = False
        item = None

    formatted_release_date = ""

    if in_my_list:
        # Use saved data
        screenshots = item.screenshots or []

        # Format release date from DB
        if item.release_date:
            try:
                parsed_date = datetime.datetime.strptime(item.release_date, "%Y-%m-%d")
                formatted_release_date = parsed_date.strftime("%d %B %Y")
            except ValueError:
                formatted_release_date = item.release_date

        context = {
            "item": item,
            "item_id": item.id,
            "source": "igdb",
            "source_id": igdb_id,
            "media_type": "game",
            "title": item.title,
            "overview": item.overview,
            "poster_url": item.cover_url,
            "banner_url": item.banner_url,
            "release_date": formatted_release_date,
            "cast": [],
            "seasons": None,
            "recommendations": [],
            "screenshots": screenshots,
            "in_my_list": True,
            'page_type': "game",
        }
        return render(request, "core/detail.html", context)

    # Not in DB, fetch from IGDB API but DO NOT save to DB
    token = get_igdb_token()
    if not token:
        return JsonResponse({"error": "Failed to get IGDB access token."}, status=500)

    try:
        igdb_keys = APIKey.objects.get(name="igdb")
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "IGDB API keys not found."}, status=500)

    headers = {
        "Client-ID": igdb_keys.key_1,
        "Authorization": f"Bearer {token}",
    }

    query = f'''
    fields 
      id, name, summary, storyline, 
      cover.url, genres.name, platforms.name, 
      first_release_date, screenshots.url, similar_games.name, similar_games.cover.url, artworks.url;
    where id = {igdb_id};
    '''

    response = requests.post("https://api.igdb.com/v4/games", headers=headers, data=query)
    if response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch details from IGDB."}, status=500)

    data = response.json()
    if not data:
        return JsonResponse({"error": "Game not found."}, status=404)

    game = data[0]
    title = game.get("name") or "Unknown Title"
    overview = game.get("summary") or game.get("storyline") or ""

    poster_url = None
    if "cover" in game and game["cover"]:
        poster_url = "https:" + game["cover"]["url"].replace("t_thumb", "t_cover_big")

    screenshots = []
    for ss in game.get("screenshots", []):
        if ss and "url" in ss:
            url = "https:" + ss["url"].replace("t_thumb", "t_screenshot_huge")
            screenshots.append({
                "url": url,
                "is_full_url": True
            })
    
    # I tried artworks but overall ingame screenshots look better as banners
    # if "artworks" in game and game["artworks"]:
    #     first_artwork = game["artworks"][0]
    #     if first_artwork and "url" in first_artwork:
    #        banner_url = "https:" + first_artwork["url"].replace("t_thumb", "t_screenshot_huge")

    # Fallback to screenshot if no artwork is present
    # if not banner_url and screenshots:
    #     banner_url = screenshots[0]["url"]
    #     screenshots = screenshots[1:] if len(screenshots) > 1 else []

    banner_url = screenshots[0]["url"] if screenshots else None
    screenshots = screenshots[1:] if len(screenshots) > 1 else []

    # Format release date from IGDB (timestamp -> %Y-%m-%d -> %d %B %Y)
    release_date = ""
    if game.get("first_release_date"):
        try:
            date_str = time.strftime('%Y-%m-%d', time.localtime(game["first_release_date"]))
            parsed_date = datetime.datetime.strptime(date_str, "%Y-%m-%d")
            formatted_release_date = parsed_date.strftime("%d %B %Y")
        except Exception:
            formatted_release_date = ""  # fallback if error

    recommendations = []
    for rec in game.get("similar_games", [])[:16]:
        rec_cover_url = None
        if rec.get("cover") and rec["cover"].get("url"):
            rec_cover_url = "https:" + rec["cover"]["url"].replace("t_thumb", "t_cover_big")
        recommendations.append({
            "id": rec["id"],
            "title": rec["name"],
            "poster_path": rec_cover_url,
        })

    genres = [g["name"] for g in game.get("genres", []) if "name" in g]
    platforms = [p["name"] for p in game.get("platforms", []) if "name" in p]

    context = {
        "item": None,
        "item_id": None,
        "source": "igdb",
        "source_id": igdb_id,
        "media_type": "game",
        "title": title,
        "overview": overview,
        "poster_url": poster_url,
        "banner_url": banner_url,
        "release_date": formatted_release_date,
        "cast": [],
        "seasons": None,
        "recommendations": recommendations,
        "screenshots": screenshots,
        "genres": genres,
        "platforms": platforms,
        "in_my_list": False,
        'page_type': "game",
    }

    return render(request, "core/detail.html", context)



def save_igdb_item(igdb_id):
    token = get_igdb_token()
    if not token:
        raise Exception("Failed to get IGDB access token.")

    try:
        igdb_keys = APIKey.objects.get(name="igdb")
    except APIKey.DoesNotExist:
        raise Exception("IGDB API keys not found.")

    headers = {
        "Client-ID": igdb_keys.key_1,
        "Authorization": f"Bearer {token}",
    }

    query = f'''
    fields 
      id, name, summary, storyline, 
      cover.url, genres.name, platforms.name, 
      first_release_date, screenshots.url;
    where id = {igdb_id};
    '''

    response = requests.post("https://api.igdb.com/v4/games", headers=headers, data=query)
    if response.status_code != 200:
        raise Exception("Failed to fetch details from IGDB.")

    data = response.json()
    if not data:
        raise Exception("Game not found.")

    game = data[0]

    title = game.get("name") or "Unknown Title"
    overview = game.get("summary") or game.get("storyline") or ""

    # Poster
    poster_url = None
    if "cover" in game and game["cover"]:
        poster_url = "https:" + game["cover"]["url"].replace("t_thumb", "t_cover_big")
    local_poster = download_image(poster_url, f"posters/igdb_{igdb_id}.jpg") if poster_url else ""

    # Strip media/ prefix
    if local_poster.startswith("media/"):
        local_poster = local_poster[len("media/"):]

    # Banner = first screenshot
    screenshots = game.get("screenshots", [])
    banner_url = None
    if screenshots:
        banner_url_raw = screenshots[0].get("url")
        if banner_url_raw:
            banner_url = "https:" + banner_url_raw.replace("t_thumb", "t_screenshot_huge")
    local_banner = download_image(banner_url, f"banners/igdb_{igdb_id}.jpg") if banner_url else ""
    if local_banner.startswith("media/"):
        local_banner = local_banner[len("media/"):]

    # Save screenshots locally (skip first, it's banner)
    local_screenshots = []
    for i, ss in enumerate(screenshots[1:], start=1):
        if ss and "url" in ss:
            url = "https:" + ss["url"].replace("t_thumb", "t_screenshot_huge")
            local_path = download_image(url, f"screenshots/igdb_{igdb_id}_{i}.jpg")
            if local_path.startswith("media/"):
                local_path = local_path[len("media/"):]
            if local_path:
                local_screenshots.append({
                    "url": local_path,
                    "is_full_url": False,
                })

    # Release date
    release_date = None
    if game.get("first_release_date"):
        release_date = time.strftime('%Y-%m-%d', time.localtime(game["first_release_date"]))

    # Save to DB
    MediaItem.objects.create(
        title=title,
        media_type="game",
        source="igdb",
        source_id=str(igdb_id),
        cover_url=local_poster,
        banner_url=local_banner,
        overview=overview,
        release_date=release_date,
        cast=[],
        seasons=None,
        related_titles=[],
        screenshots=local_screenshots,
    )

    return JsonResponse({"success": True, "message": "Game added to list"})


@ensure_csrf_cookie
def upload_game_screenshots(request):
    if request.method != "POST":
        return JsonResponse({"success": False, "message": "Invalid request method."}, status=400)

    igdb_id = request.POST.get("igdb_id")
    if not igdb_id:
        return JsonResponse({"success": False, "message": "Missing igdb_id."}, status=400)

    try:
        media_item = MediaItem.objects.get(media_type="game", source="igdb", source_id=str(igdb_id))
    except MediaItem.DoesNotExist:
        return JsonResponse({"success": False, "message": "Game not found."}, status=404)

    files = request.FILES.getlist("screenshots[]")
    if not files:
        return JsonResponse({"success": False, "message": "No files uploaded."}, status=400)

    action = request.headers.get("X-Action", "replace")  # default to replace

    if action == "replace":
        # Delete existing screenshots
        pattern_jpg = os.path.join(settings.MEDIA_ROOT, f"screenshots/igdb_{igdb_id}_*.jpg")
        pattern_png = os.path.join(settings.MEDIA_ROOT, f"screenshots/igdb_{igdb_id}_*.png")

        for path in glob.glob(pattern_jpg) + glob.glob(pattern_png):
            os.remove(path)

        # Start numbering from 1
        start_index = 1

        # Clear old list
        old_screenshots = []

    elif action == "add":
        # Adding screenshots: keep old list
        old_screenshots = media_item.screenshots or []
        start_index = len(old_screenshots) + 1

    else:
        return JsonResponse({"success": False, "message": "Invalid action."}, status=400)

    # Save and rename new screenshots
    new_screenshots = list(old_screenshots)  # copy existing if adding

    for i, file in enumerate(files, start=start_index):
        ext = os.path.splitext(file.name)[1].lower()
        if ext not in [".jpg", ".jpeg", ".png"]:
            continue  # Skip unsupported files

        filename = f"screenshots/igdb_{igdb_id}_{i}{ext}"
        default_storage.save(filename, file)


        url = f"/media/{filename}"

        new_screenshots.append({
            "url": url,
            "is_full_url": False
        })

    # Update DB entry
    media_item.screenshots = new_screenshots
    media_item.save()

    return JsonResponse({"success": True, "message": "Screenshots updated."})




def check_if_in_list(source, source_id):
    return MediaItem.objects.filter(source=source, source_id=str(source_id)).exists() # useless?

# Add to list

@ensure_csrf_cookie
@require_POST
def add_to_list(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    required_fields = ["source", "source_id", "media_type"]
    if not all(data.get(field) for field in required_fields):
        return JsonResponse({"error": "Missing required fields"}, status=400)

    source = data["source"]
    source_id = str(data["source_id"])
    media_type = data["media_type"]

    # Prevent duplicate entries
    if MediaItem.objects.filter(source=source, source_id=source_id).exists():
        return JsonResponse({"error": "Item already in list"}, status=400)

    # Route to the correct handler (TMDB, MAL, IGDB, etc.)
    if source == "tmdb":
        return save_tmdb_item(media_type, source_id)

    if source == "mal":
        return save_mal_item(media_type, source_id)

    if source == "igdb":
        return save_igdb_item(source_id)
    
    if source == "openlib":
        return save_openlib_item(source_id)

    return JsonResponse({"error": "Unsupported source"}, status=400)


# Edit item
@ensure_csrf_cookie
def edit_item(request, item_id):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            item = MediaItem.objects.get(id=item_id)

            old_status = item.status

            # Update totals if present
            if "total_main" in data and data["total_main"] not in [None, ""]:
                item.total_main = int(data["total_main"])
            if "total_secondary" in data and data["total_secondary"] not in [None, ""]:
                item.total_secondary = int(data["total_secondary"])

            # Always define new_status to avoid UnboundLocalError
            new_status = old_status

            # Update status if present
            if "status" in data and data["status"] != "":
                new_status = data["status"]
                item.status = new_status

            # --- Handle date_added with comparison ---
            user_date = data.get("date_added")
            if user_date:
                try:
                    year, month, day = map(int, user_date.split("-"))
                    # Build candidate datetime using old time component
                    old_dt = item.date_added or timezone.now()
                    candidate_dt = timezone.datetime(year, month, day,
                                                     old_dt.hour, old_dt.minute, old_dt.second)
                    if settings.USE_TZ:
                        candidate_dt = timezone.make_aware(candidate_dt, timezone.get_current_timezone())

                    # Compare just the date part with current item.date_added
                    if item.date_added and item.date_added.date() != candidate_dt.date():
                        # User actually changed the date → take their value
                        item.date_added = candidate_dt
                    elif new_status != old_status:
                        # User sent the same date but status changed → update to now
                        item.date_added = timezone.now()
                    # else: same date, no status change → leave unchanged
                except Exception as e:
                    print("Failed to parse date_added:", e)
            elif new_status != old_status:
                # No date provided, but status changed → update to now
                item.date_added = timezone.now()

            # Update progress fields if present (manual input)
            if "progress_main" in data and data["progress_main"] not in [None, ""]:
                progress_main = int(data["progress_main"])
                if item.total_main is not None and progress_main > item.total_main:
                    progress_main = item.total_main
                item.progress_main = progress_main

            if "progress_secondary" in data and data["progress_secondary"] not in [None, ""]:
                progress_secondary = int(data["progress_secondary"])
                if item.total_secondary is not None and progress_secondary > item.total_secondary:
                    progress_secondary = item.total_secondary
                item.progress_secondary = progress_secondary

            # If status changed TO "completed", override progress with totals
            if old_status != "completed" and new_status == "completed":
                if item.total_main is not None:
                    item.progress_main = item.total_main
                if item.total_secondary is not None:
                    item.progress_secondary = item.total_secondary

            if "repeats" in data:
                try:
                    item.repeats = max(0, int(data["repeats"]))
                except (ValueError, TypeError):
                    item.repeats = 0

            if "personal_rating" in data:
                # Get current rating mode (try to get from AppSettings, fallback to 'faces')
                AppSettings = apps.get_model('core', 'AppSettings')
                try:
                    app_settings = AppSettings.objects.first()
                    rating_mode = app_settings.rating_mode if app_settings else 'faces'
                except Exception:
                    rating_mode = 'faces'

                display_value = data["personal_rating"]
                if display_value in [None, "", "null"]:
                    item.personal_rating = None
                else:
                    try:
                        display_value_int = int(display_value)
                    except ValueError:
                        display_value_int = None

                    if display_value_int is None:
                        item.personal_rating = None
                    else:
                        item.personal_rating = display_to_rating(display_value_int, rating_mode)

            if "notes" in data:
                item.notes = data["notes"]

            if "favorite" in data:
                item.favorite = data["favorite"] in ["true", "on", True]

            item.save()
            return JsonResponse({"success": True})

        except Exception as e:
            return JsonResponse({"success": False, "error": str(e)})

    return JsonResponse({"success": False, "error": "Invalid request"})


@ensure_csrf_cookie
@require_POST
def delete_item(request, item_id):
    try:
        item = MediaItem.objects.get(id=item_id)
        source = item.source
        mal_id = item.source_id

        # --- Delete associated image files if locally stored
        media_root = settings.MEDIA_ROOT
        paths_to_check = []

        if item.cover_url and item.cover_url.startswith("/media/"):
            paths_to_check.append(os.path.join(media_root, item.cover_url.replace("/media/", "")))
        if item.banner_url and item.banner_url.startswith("/media/"):
            paths_to_check.append(os.path.join(media_root, item.banner_url.replace("/media/", "")))

        for i, member in enumerate(item.cast or []):
            p = member.get("profile_path", "")
            if p.startswith("/media/"):
                paths_to_check.append(os.path.join(media_root, p.replace("/media/", "")))

        for related in item.related_titles or []:
            p = related.get("poster_path", "")
            if p.startswith("/media/"):
                paths_to_check.append(os.path.join(media_root, p.replace("/media/", "")))

        for season in item.seasons or []:
            p = season.get("poster_path", "")
            if p.startswith("/media/"):
                paths_to_check.append(os.path.join(media_root, p.replace("/media/", "")))
                
        for shot in item.screenshots or []:
            p = shot.get("url", "")
            if p.startswith("/media/"):
                paths_to_check.append(os.path.join(media_root, p.replace("/media/", "")))

        for path in paths_to_check:
            try:
                if os.path.exists(path):
                    os.remove(path)
            except Exception:
                pass  # Ignore deletion errors

        # --- Delete the DB entry
        item.delete()
        return JsonResponse({"success": True})

    except MediaItem.DoesNotExist:
        return JsonResponse({"success": False, "error": "Item not found"})
    except Exception as e:
            import traceback
            traceback.print_exc()  # Show full traceback in terminal
            return JsonResponse({"success": False, "error": str(e)})


@ensure_csrf_cookie
def get_item(request, item_id):
    try:
        item = MediaItem.objects.get(id=item_id)
        total_main = item.total_main
        total_secondary = item.total_secondary

        # Fetch live data only if values aren't already stored
        if item.source == "tmdb" and item.media_type == "tv":
            try:
                api_key = APIKey.objects.get(name="tmdb").key_1
                url = f"https://api.themoviedb.org/3/tv/{item.source_id}"
                params = {"api_key": api_key}
                response = requests.get(url, params=params)
                if response.status_code == 200:
                    data = response.json()
                    total_main = data.get("number_of_episodes") or total_main
                    total_secondary = data.get("number_of_seasons") or total_secondary
            except Exception:
                pass  # Fallback to DB values

        elif item.source == "mal":
            try:
                url = f"https://api.jikan.moe/v4/{item.media_type}/{item.source_id}"
                response = requests.get(url)
                if response.status_code == 200:
                    data = response.json().get("data", {})
                    if item.media_type == "anime":
                        total_main = data.get("episodes") or total_main
                    elif item.media_type == "manga":
                        total_main = data.get("chapters") or total_main
                        total_secondary = data.get("volumes") or total_secondary
            except Exception:
                pass

        elif item.source == "igdb":
            # IGDB does not have episode/season style totals; leave as is
            total_main = None
            total_secondary = None

        elif item.source == "openlib":
            total_main = None
            total_secondary = None

        AppSettings = apps.get_model('core', 'AppSettings')
        try:
            settings = AppSettings.objects.first()
            rating_mode = settings.rating_mode if settings else 'faces'
        except Exception:
            rating_mode = 'faces'

        display_rating = rating_to_display(item.personal_rating, rating_mode)
    
        RATING_CHOICES = [
            (1, "Bad"),
            (50, "Neutral"),
            (100, "Good"),
        ]

        return JsonResponse({
            "success": True,
            "item": {
                "id": item.id,
                "media_type": item.media_type,
                "status": item.status,
                "personal_rating": display_rating,
                "notes": item.notes,
                "progress_main": item.progress_main if item.progress_main else None,
                "total_main": total_main,
                "progress_secondary": item.progress_secondary,
                "total_secondary": total_secondary,
                "favorite": item.favorite,
                "item_status_choices": MediaItem.STATUS_CHOICES,
                "item_rating_choices": RATING_CHOICES,
                "rating_mode": rating_mode,
                "repeats": item.repeats or 0,
                "date_added": item.date_added.isoformat() if item.date_added else None,
                "show_date_field": settings.show_date_field,
                "show_repeats_field": settings.show_repeats_field,
            }
        })
    except MediaItem.DoesNotExist:
        return JsonResponse({"success": False, "error": "Item not found"})


# Settings

@ensure_csrf_cookie
@require_GET
def create_backup(request):
    import uuid

    with tempfile.TemporaryDirectory() as temp_dir:
        # Export MediaItem and FavoritePerson
        media_items = list(MediaItem.objects.all())
        favorite_people = list(FavoritePerson.objects.all())
        all_data = media_items + favorite_people

        json_path = os.path.join(temp_dir, "media_items.json")
        with open(json_path, "w", encoding="utf-8") as f:
            f.write(serialize("json", all_data))

        # Copy media
        media_root = settings.MEDIA_ROOT
        folders = ["posters", "banners", "cast", "related", "screenshots", "seasons", "favorites/actors", "favorites/characters"]
        for folder in folders:
            src = os.path.join(media_root, folder)
            dst = os.path.join(temp_dir, folder)
            if os.path.exists(src):
                shutil.copytree(src, dst)

        # Save to a permanent temp file outside context manager
        temp_zip = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        temp_zip_path = temp_zip.name
        temp_zip.close()  # We'll write manually

        with zipfile.ZipFile(temp_zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for root, _, files in os.walk(temp_dir):
                for file in files:
                    abs_path = os.path.join(root, file)
                    rel_path = os.path.relpath(abs_path, temp_dir)
                    zipf.write(abs_path, rel_path)

    # Open outside the `with` block to avoid "used by another process"
    return FileResponse(open(temp_zip_path, "rb"), as_attachment=True, filename="media_backup.zip")


@ensure_csrf_cookie
@require_POST
def restore_backup(request):
    uploaded_zip = request.FILES.get("backup_zip")
    if not uploaded_zip:
        return JsonResponse({"error": "No file uploaded"}, status=400)

    with tempfile.TemporaryDirectory() as temp_dir:
        # Save uploaded zip and extract it
        zip_path = os.path.join(temp_dir, "uploaded_backup.zip")
        with open(zip_path, "wb") as f:
            for chunk in uploaded_zip.chunks():
                f.write(chunk)

        with zipfile.ZipFile(zip_path, "r") as zipf:
            zipf.extractall(temp_dir)

        # Load JSON data
        json_file = os.path.join(temp_dir, "media_items.json")
        with open(json_file, "r", encoding="utf-8") as f:
            media_data = json.load(f)

        for obj in deserialize("json", json.dumps(media_data)):
            try:
                instance = obj.object
                if isinstance(instance, MediaItem):
                    if not MediaItem.objects.filter(source=instance.source, source_id=instance.source_id).exists():
                        obj.save()
                elif isinstance(instance, FavoritePerson):
                    if not FavoritePerson.objects.filter(name=instance.name, type=instance.type).exists():
                        obj.save()
            except Exception as e:
                continue  # optionally log errors


        # Copy media folders
        media_root = settings.MEDIA_ROOT
        folders = ["posters", "banners", "cast", "related", "screenshots", "seasons","favorites/actors", "favorites/characters"]
        for folder in folders:
            src_folder = os.path.join(temp_dir, folder)
            dest_folder = os.path.join(media_root, folder)
            if os.path.exists(src_folder):
                shutil.copytree(src_folder, dest_folder, dirs_exist_ok=True)

        return JsonResponse({"message": "Backup restored successfully"})

@ensure_csrf_cookie
def add_key(request):
    data = json.loads(request.body)
    name = data.get("name", "").strip().lower()
    key_1 = data.get("key_1", "").strip()
    key_2 = data.get("key_2", "").strip()

    allowed_names = ["tmdb", "igdb", "mal", "anilist"]

    if not name or not key_1:
        return JsonResponse({"error": "Name and Key 1 are required."}, status=400)

    if name not in allowed_names:
        return JsonResponse({"error": "Invalid name. Must be one of: tmdb, igdb, mal, anilist."}, status=400)

    if APIKey.objects.filter(name=name).exists():
        return JsonResponse({"error": f"There is already an entry for '{name}'."}, status=400)

    APIKey.objects.create(name=name, key_1=key_1, key_2=key_2)
    return JsonResponse({"message": "API key added."})


@ensure_csrf_cookie
def update_key(request):
    data = json.loads(request.body)
    try:
        key = APIKey.objects.get(id=data["id"])
        key.key_1 = data.get("key_1", key.key_1)
        key.key_2 = data.get("key_2", key.key_2)
        key.save()
        return JsonResponse({"message": "API key updated."})
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "Key not found."}, status=404)


@ensure_csrf_cookie
def delete_key(request):
    data = json.loads(request.body)
    try:
        key = APIKey.objects.get(id=data["id"])
        key.delete()
        return JsonResponse({"message": "API key deleted."})
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "Key not found."}, status=404)


def character_search(query):
    url = 'https://graphql.anilist.co'
    headers = {'Content-Type': 'application/json'}

    graphql_query = '''
    query ($search: String) {
      Page(perPage: 10) {
        characters(search: $search) {
          id
          name {
            full
          }
          image {
            large
          }
        }
      }
    }
    '''

    variables = {
        'search': query
    }

    response = requests.post(url, json={'query': graphql_query, 'variables': variables}, headers=headers)

    if response.status_code == 200:
        data = response.json()
        results = []
        for char in data['data']['Page']['characters']:
            results.append({
                'id': char['id'],
                'name': char['name']['full'],
                'image': char['image']['large']
            })
        return results
    else:
        return []
    
def actor_search(query):
    url = 'https://api.themoviedb.org/3/search/person'
    params = {
        'api_key': APIKey.objects.get(name="tmdb").key_1,
        'query': query,
        'include_adult': False,
        'language': 'en-US',
        'page': 1
    }

    response = requests.get(url, params=params)

    if response.status_code == 200:
        data = response.json()
        results = []
        for person in data.get('results', [])[:10]:
            results.append({
                'id': person['id'],
                'name': person['name'],
                'image': f"https://image.tmdb.org/t/p/w185{person['profile_path']}" if person.get('profile_path') else None
            })
        return results
    else:
        return []
    

def save_favorite_actor_character(name, image_url, type):
    existing_count = FavoritePerson.objects.filter(type=type).count()
    position = existing_count + 1

    # Prepare local path
    slug_name = slugify(name)
    ext = image_url.split('.')[-1].split('?')[0]  # crude extension extract, e.g. jpg, png
    relative_path = f'favorites/{type}s/{slug_name}.{ext}'

    local_url = download_image(image_url, relative_path)
    # fallback to original url if download failed
    final_image_url = local_url if local_url else image_url

    person = FavoritePerson.objects.create(
        name=name,
        image_url=final_image_url,
        type=type,
        position=position
    )
    return person

def delete_favorite_person_and_reorder(person_id):
    try:
        person = FavoritePerson.objects.get(id=person_id)
        person_type = person.type

        # Attempt to delete the local image file if it's stored locally
        if person.image_url and person.image_url.startswith(settings.MEDIA_URL):
            # Convert URL to file system path
            relative_path = person.image_url.replace(settings.MEDIA_URL, '').lstrip('/')
            local_path = os.path.join(settings.MEDIA_ROOT, relative_path)
            if os.path.isfile(local_path):
                try:
                    os.remove(local_path)
                except Exception as e:
                    print(f"Failed to delete image file {local_path}: {e}")

        # Delete the person record from DB
        person.delete()

        # Reorder remaining people of the same type
        favorites = FavoritePerson.objects.filter(type=person_type).order_by('position')
        for i, fav in enumerate(favorites, start=1):
            fav.position = i
            fav.save()
        return True
    except FavoritePerson.DoesNotExist:
        return False

@ensure_csrf_cookie
def delete_favorite_person(request, person_id):
    success = delete_favorite_person_and_reorder(person_id)
    return JsonResponse({"success": success})

@ensure_csrf_cookie
def character_search_view(request):
    query = request.GET.get('q', '')
    results = character_search(query) if query else []
    return JsonResponse(results, safe=False)

@ensure_csrf_cookie
def actor_search_view(request):
    query = request.GET.get('q', '')
    results = actor_search(query) if query else []
    return JsonResponse(results, safe=False)

@ensure_csrf_cookie
def toggle_favorite_person_view(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST request required.'}, status=400)

    data = json.loads(request.body)
    name = data.get('name')
    image_url = data.get('image_url')
    person_type = data.get('type')

    # Check if already favorited
    existing = FavoritePerson.objects.filter(name=name, type=person_type).first()
    if existing:
        # Delete favorite and reorder positions
        delete_favorite_person_and_reorder(existing.id)
        return JsonResponse({'status': 'removed'})
    else:
        save_favorite_actor_character(name, image_url, person_type)
        return JsonResponse({'status': 'added'})
    

@ensure_csrf_cookie
@require_POST
def upload_banner(request):
    uploaded_file = request.FILES.get("banner")
    source = request.POST.get("source")
    source_id = request.POST.get("id")

    if not uploaded_file or not source or not source_id:
        return JsonResponse({"error": "Missing required data."}, status=400)

    ext = os.path.splitext(uploaded_file.name)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        return JsonResponse({"error": "Unsupported file type."}, status=400)

    # Build full file path: media/banners/source_id.ext
    banner_dir = os.path.join(settings.MEDIA_ROOT, "banners")
    os.makedirs(banner_dir, exist_ok=True)

    # Base name (we may overwrite or replace extension)
    base_name = f"{source}_{source_id}"
    new_path = os.path.join(banner_dir, base_name + ext)

    # Delete any existing file with same base name but different ext
    for existing_ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        old_path = os.path.join(banner_dir, base_name + existing_ext)
        if os.path.exists(old_path) and old_path != new_path:
            os.remove(old_path)

    # Save new file
    with open(new_path, "wb+") as destination:
        for chunk in uploaded_file.chunks():
            destination.write(chunk)

    relative_url = f"/media/banners/{base_name}{ext}"

    try:
        item = MediaItem.objects.get(source=source, source_id=source_id)
        item.banner_url = relative_url
        item.save(update_fields=["banner_url"])
    except MediaItem.DoesNotExist:
        pass  # No item found yet — maybe it's added later

    return JsonResponse({"success": True, "url": f"/media/banners/{base_name}{ext}"})

@ensure_csrf_cookie
@require_POST
def upload_cover(request):
    uploaded_file = request.FILES.get("cover")
    source = request.POST.get("source")
    source_id = request.POST.get("id")

    if not uploaded_file or not source or not source_id:
        return JsonResponse({"error": "Missing required data."}, status=400)

    ext = os.path.splitext(uploaded_file.name)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        return JsonResponse({"error": "Unsupported file type."}, status=400)

    poster_dir = os.path.join(settings.MEDIA_ROOT, "posters")
    os.makedirs(poster_dir, exist_ok=True)

    base_name = f"{source}_{source_id}"
    new_path = os.path.join(poster_dir, base_name + ext)

    for existing_ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        old_path = os.path.join(poster_dir, base_name + existing_ext)
        if os.path.exists(old_path) and old_path != new_path:
            os.remove(old_path)

    with open(new_path, "wb+") as destination:
        for chunk in uploaded_file.chunks():
            destination.write(chunk)

    relative_url = f"/media/posters/{base_name}{ext}"

    try:
        item = MediaItem.objects.get(source=source, source_id=source_id)
        item.cover_url = relative_url
        item.save(update_fields=["cover_url"])
    except MediaItem.DoesNotExist:
        pass

    return JsonResponse({"success": True, "url": relative_url})


@ensure_csrf_cookie
@require_POST
def refresh_item(request):
    try:
        data = json.loads(request.body)
        item_id = data.get("id")
        if not item_id:
            return JsonResponse({"error": "Missing item ID."}, status=400)

        # Get the item first
        item = MediaItem.objects.get(id=item_id)
        source = item.source
        source_id = item.source_id
        media_type = item.media_type

        # Save user data
        user_data = {
            'status': item.status,
            'progress_main': item.progress_main,
            'progress_secondary': item.progress_secondary,
            'personal_rating': item.personal_rating,
            'favorite': item.favorite,
            'date_added': item.date_added,
            'repeats': item.repeats,
            'notes': item.notes,
            'screenshots': item.screenshots,
        }

        # Backup screenshot files
        screenshot_backups = []
        if item.screenshots:
            for shot in item.screenshots:
                url = shot.get('url', '')
                if url.startswith('/media/'):
                    file_path = os.path.join(settings.MEDIA_ROOT, url.replace('/media/', ''))
                    if os.path.exists(file_path):
                        with open(file_path, 'rb') as f:
                            screenshot_backups.append({
                                'url': url,
                                'data': f.read(),
                                'is_full_url': shot.get('is_full_url', False)
                            })

        # Delete the existing item
        delete_item(request, item_id)

        # Re-save the item based on its source
        if source == "tmdb":
            save_tmdb_item(media_type, source_id)
        elif source == "mal":
            save_mal_item(media_type, source_id)
        elif source == "igdb":
            save_igdb_item(source_id)
        elif source == "openlib":
            save_openlib_item(source_id)
        else:
            return JsonResponse({"error": "Unsupported source."}, status=400)

        # Restore user data
        new_item = MediaItem.objects.get(source=source, source_id=source_id, media_type=media_type)
        for field, value in user_data.items():
            setattr(new_item, field, value)
        
        # Restore screenshot files
        if screenshot_backups:
            for backup in screenshot_backups:
                file_path = os.path.join(settings.MEDIA_ROOT, backup['url'].replace('/media/', ''))
                os.makedirs(os.path.dirname(file_path), exist_ok=True)
                with open(file_path, 'wb') as f:
                    f.write(backup['data'])
        
        new_item.last_updated = timezone.now()
        new_item.save()

        return JsonResponse({"message": "Item refreshed successfully."})

    except MediaItem.DoesNotExist:
        return JsonResponse({"error": "Item not found."}, status=404)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

@ensure_csrf_cookie
@require_POST
def update_nav_items(request):
    try:
        data = json.loads(request.body)
        items = data.get("items", [])

        for item_data in items:
            nav_id = item_data.get("id")
            position = item_data.get("position")
            visible = item_data.get("visible", True)

            try:
                nav_item = NavItem.objects.get(id=nav_id)
                nav_item.position = position
                nav_item.visible = visible
                nav_item.save()
            except NavItem.DoesNotExist:
                continue  # Skip invalid IDs

        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=400)
    
def get_extra_info(request):
    media_type = request.GET.get("media_type")
    item_id = request.GET.get("item_id")

    if not media_type or not item_id:
        return JsonResponse({"error": "Missing parameters"}, status=400)

    try:
        item_id = int(item_id)
    except ValueError:
        return JsonResponse({"error": "Invalid item_id"}, status=400)

    if media_type == "movie":
        data = get_movie_extra_info(item_id)
    elif media_type == "tv":
        data = get_tv_extra_info(item_id)
    elif media_type == "anime":
        data = get_anime_extra_info(item_id)
    elif media_type == "manga":
        data = get_manga_extra_info(item_id)
    elif media_type == "game":
        data = get_game_extra_info(item_id)
    else:
        data = {}

    return JsonResponse(data)

def check_planned_movie_statuses(request):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "TMDB API key not found."}, status=500)

    planned_movies = MediaItem.objects.filter(media_type='movie', status='planned')
    status_map = {}  # {tmdb_id (str): status}
    request_count = 0

    for item in planned_movies:
        tmdb_id = item.source_id
        if not tmdb_id:
            continue

        url = f"https://api.themoviedb.org/3/movie/{tmdb_id}"
        params = {"api_key": api_key}

        try:
            response = requests.get(url, params=params)
            request_count += 1

            if request_count >= 300:
                time.sleep(60)
                request_count = 0
            else:
                time.sleep(0.025)

            if response.status_code == 200:
                data = response.json()
                status_map[str(tmdb_id)] = data.get("status", "Unknown")
            else:
                status_map[str(tmdb_id)] = "Error"
        except Exception:
            status_map[str(tmdb_id)] = "Error"

    return JsonResponse(status_map)

def check_planned_tvseries_statuses(request):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "TMDB API key not found."}, status=500)

    planned_series = MediaItem.objects.filter(media_type='tv', status='planned')
    status_map = {}  # {tmdb_id: status}
    request_count = 0

    for item in planned_series:
        tmdb_id = item.source_id
        if not tmdb_id:
            continue

        url = f"https://api.themoviedb.org/3/tv/{tmdb_id}"
        params = {"api_key": api_key}

        try:
            response = requests.get(url, params=params)
            request_count += 1

            if request_count >= 300:
                time.sleep(60)
                request_count = 0
            else:
                time.sleep(0.025)

            if response.status_code == 200:
                data = response.json()

                status = data.get("status", "Unknown")
                next_episode = data.get("next_episode_to_air")
                # Logic per your description:
                if status == "Ended":
                    status_map[tmdb_id] = "Ended"
                elif status == "In Production":
                    status_map[tmdb_id] = "In Production"
                elif status == "Returning Series":
                    if next_episode:
                        status_map[tmdb_id] = "Returning with upcoming episode"
                    else:
                        # Assume finished airing or hasn't started airing yet
                        status_map[tmdb_id] = "Ended"
                else:
                    status_map[tmdb_id] = status
            else:
                status_map[tmdb_id] = "Error"
        except Exception:
            status_map[tmdb_id] = "Error"

    return JsonResponse(status_map)

def check_planned_anime_manga_statuses(request):
    import requests
    from django.http import JsonResponse, HttpResponseBadRequest

    ANILIST_API_URL = "https://graphql.anilist.co"

    media_type = request.GET.get("media_type")
    if media_type not in ("anime", "manga"):
        return HttpResponseBadRequest("Invalid or missing media_type parameter. Must be 'anime' or 'manga'.")

    planned_items = MediaItem.objects.filter(media_type=media_type, status="planned")
    headers = {"Content-Type": "application/json"}
    status_map = {}

    def chunks(lst, size):
        for i in range(0, len(lst), size):
            yield lst[i:i + size]

    # Prepare list of (mal_id, item)
    item_list = [(item.source_id, item) for item in planned_items if item.source_id and item.source_id.isdigit()]

    request_count = 0

    for batch in chunks(item_list, 25):

        request_count += 1
        if request_count >= 12:
            time.sleep(60)
            request_count = 0
        else:
            time.sleep(0.1)

        aliases = []
        for i, (mal_id, _) in enumerate(batch):
            aliases.append(f"i{i}: Media(idMal: {mal_id}, type: {media_type.upper()}) {{ status }}")

        query = f"query {{\n  {'\n  '.join(aliases)}\n}}"

        try:
            response = requests.post(
                ANILIST_API_URL,
                json={"query": query},
                headers=headers,
                timeout=10
            )

            if response.status_code != 200:
                for mal_id, _ in batch:
                    status_map[mal_id] = "Error"
                continue

            data = response.json().get("data", {})
            for i, (mal_id, _) in enumerate(batch):
                entry = data.get(f"i{i}")
                if not entry:
                    status_map[mal_id] = "Unknown"
                    continue

                raw_status = entry.get("status")
                if raw_status == "FINISHED":
                    status_map[mal_id] = "Finished"
                elif raw_status == "RELEASING":
                    status_map[mal_id] = "Releasing"
                elif raw_status == "NOT_YET_RELEASED":
                    status_map[mal_id] = "Not yet released"
                else:
                    status_map[mal_id] = raw_status or "Unknown"

        except Exception:
            for mal_id, _ in batch:
                status_map[mal_id] = "Error"

    return JsonResponse(status_map)

@ensure_csrf_cookie
@require_POST
def update_rating_mode(request):
    import json
    try:
        data = json.loads(request.body)
        new_mode = data.get("rating_mode")
        valid_modes = {"faces", "stars_5", "scale_10", "scale_100"}
        if new_mode not in valid_modes:
            return JsonResponse({"success": False, "error": "Invalid rating mode."})
        AppSettings = apps.get_model('core', 'AppSettings')
        settings = AppSettings.objects.first()
        if not settings:
            settings = AppSettings.objects.create(rating_mode=new_mode)
        else:
            settings.rating_mode = new_mode
            settings.save()
        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)})
    

def version_info_api(request):
    current_version = "v1.3.0"  # Update this 
    
    try:
        response = requests.get("https://api.github.com/repos/mihail-pop/media-journal/releases/latest", timeout=5)
        latest_version = response.json().get("tag_name", "Unknown")
    except:
        latest_version = "Unable to check"
    
    return JsonResponse({
        "current_version": current_version,
        "latest_version": latest_version
    })