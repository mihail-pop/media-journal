import logging
from datetime import timedelta, date
from collections import defaultdict

from django.apps import apps
from django.urls import reverse
from django.utils import timezone
from django.db.models import Q, Sum
from django.shortcuts import render
from django.utils.text import slugify
from django.utils.timesince import timesince
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET

from core.models import APIKey, NavItem, MediaItem, FavoritePerson
from core.services.p_home import (
    start_tmdb_background_loop,
    start_anilist_background_loop,
    start_media_cleanup_loop,
)
from core.services.m_people import fetch_actor_data, fetch_character_data

logger = logging.getLogger(__name__)

@ensure_csrf_cookie
def home(request):
    start_tmdb_background_loop()
    start_anilist_background_loop()
    start_media_cleanup_loop()

    limit = 25

    # Single query for favorites with prefetch
    favorites = list(MediaItem.objects.filter(favorite=True).order_by(
        "favorite_position", "date_added"
    ))
    
    # Group favorites by media_type in Python
    favorite_sections = {
        "Movies": [f for f in favorites if f.media_type == "movie"][:limit],
        "TV Shows": [f for f in favorites if f.media_type == "tv"][:limit],
        "Anime": [f for f in favorites if f.media_type == "anime"][:limit],
        "Manga": [f for f in favorites if f.media_type == "manga"][:limit],
        "Games": [f for f in favorites if f.media_type == "game"][:limit],
        "Books": [f for f in favorites if f.media_type == "book"][:limit],
        "Music": [f for f in favorites if f.media_type == "music"][:limit],
    }

    # Single query with Count aggregation by media_type
    from django.db.models import Count, Case, When, IntegerField
    counts_result = MediaItem.objects.aggregate(
        movies=Count(Case(When(media_type="movie", then=1), output_field=IntegerField())),
        tv=Count(Case(When(media_type="tv", then=1), output_field=IntegerField())),
        anime=Count(Case(When(media_type="anime", then=1), output_field=IntegerField())),
        games=Count(Case(When(media_type="game", then=1), output_field=IntegerField())),
        books=Count(Case(When(media_type="book", then=1), output_field=IntegerField())),
        manga=Count(Case(When(media_type="manga", then=1), output_field=IntegerField())),
        music=Count(Case(When(media_type="music", then=1), output_field=IntegerField())),
    )
    
    media_counts = {
        "Movies": counts_result["movies"],
        "TV Shows": counts_result["tv"],
        "Anime": counts_result["anime"],
        "Games": counts_result["games"],
        "Books": counts_result["books"],
        "Manga": counts_result["manga"],
        "Music": counts_result["music"],
    }

    total_entries = sum(media_counts.values())

    media_colors = {
        "Movies": "#F4B400",  # Yellow
        "TV Shows": "#E53935",  # Red
        "Anime": "#42A5F5",  # Blue
        "Games": "#66BB6A",  # Green
        "Books": "#EC407A",  # Pink
        "Manga": "#AB47BC",  # Purple
        "Music": "#FF7043",  # Orange
    }

    stats_blocks = []
    for label, count in media_counts.items():
        if count > 0:
            stats_blocks.append(
                {
                    "label": label,
                    "count": count,
                    "color": media_colors[label],
                    "percentage": round((count / total_entries) * 100, 2)
                    if total_entries
                    else 0,
                }
            )

    # Sort by count and mark top 5 as visible
    stats_blocks.sort(key=lambda x: x["count"], reverse=True)
    for i, block in enumerate(stats_blocks):
        block["visible"] = i < 5

    stats = dict(media_counts)
    stats["Total Entries"] = total_entries
    stats["Favorites"] = len(favorites)

    # Extra stats - single aggregate query
    extra_aggregates = MediaItem.objects.aggregate(
        movie_count=Count(Case(When(media_type="movie", status="completed", then=1), output_field=IntegerField())),
        tv_episodes=Sum(Case(When(media_type="tv", then="progress_main"), output_field=IntegerField())),
        anime_episodes=Sum(Case(When(media_type="anime", then="progress_main"), output_field=IntegerField())),
        game_hours=Sum(Case(When(media_type="game", then="progress_main"), output_field=IntegerField())),
        chapters_read=Sum(Case(When(media_type="manga", then="progress_main"), output_field=IntegerField())),
        pages_read=Sum(Case(When(media_type="book", then="progress_main"), output_field=IntegerField())),
    )
    
    movie_count = extra_aggregates["movie_count"] or 0
    tv_episodes = extra_aggregates["tv_episodes"] or 0
    anime_episodes = extra_aggregates["anime_episodes"] or 0

    total_hours = (
        movie_count * (90 / 60) + tv_episodes * (40 / 60) + anime_episodes * (24 / 60)
    )
    days_watched = round(total_hours / 24, 1)
    if days_watched.is_integer():
        days_watched = int(days_watched)

    game_hours = extra_aggregates["game_hours"] or 0
    days_played = round(game_hours / 24, 1)
    if days_played.is_integer():
        days_played = int(days_played)

    chapters_read = extra_aggregates["chapters_read"] or 0
    pages_read = extra_aggregates["pages_read"] or 0

    extra_stats = {}
    if days_watched > 0:
        extra_stats["Days Watched"] = days_watched
    if days_played > 0:
        extra_stats["Days Played"] = days_played
    if pages_read > 0:
        extra_stats["Pages Read"] = pages_read
    if chapters_read > 0:
        extra_stats["Chapters Read"] = chapters_read

    today = date.today()
    raw_start = today - timedelta(days=161) # Roughly 23 weeks ago
    start_date = raw_start - timedelta(days=raw_start.weekday()) 
    num_days = (today - start_date).days + 1 

    activity_counts = MediaItem.objects.filter(
        date_added__date__gte=start_date
    ).values_list("date_added", flat=True)

    count_by_day = defaultdict(int)
    for activity_date in activity_counts:
        count_by_day[activity_date.date()] += 1

    activity_data = []
    for i in range(num_days):
        day = start_date + timedelta(days=i)
        activity_data.append(
            {
                "date": day.strftime("%A %d %B %Y"),
                "count": count_by_day.get(day, 0),
            }
        )

    columns = [activity_data[i : i + 7] for i in range(0, len(activity_data), 7)]

    notifications = MediaItem.objects.filter(notification=True).order_by(
        "-last_updated"
    )

    notifications_list = []
    for item in notifications:
        if item.media_type == "tv":
            # Fail-safe: If item is a season (e.g. '123_s2'), 
            # we extract the base ID ('123') to link to the main show page.
            base_id = str(item.source_id).split('_')[0]
            
            url = reverse(
                "tmdb_detail", args=[item.media_type, base_id]
            )
        elif item.media_type in ["anime", "manga"]:
            url = reverse("anilist_detail", args=[item.source, item.media_type, item.source_id])
        else:
            url = "#"
        notifications_list.append(
            {
                "id": item.id,
                "title": item.title,
                "url": url,
                "media_type": item.media_type,
            }
        )

    favorite_characters = FavoritePerson.objects.filter(type="character").order_by("position")[:limit]
    favorite_actors = FavoritePerson.objects.filter(type="actor").order_by("position")[:limit]

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
            if "_s" in item.source_id:  # it's a season
                show_id = item.source_id.split("_s")[0]
                season_number = item.source_id.split("_s")[1]
                url = reverse("tmdb_season_detail", args=[show_id, season_number])
            else:
                url = reverse("tmdb_detail", args=[item.media_type, item.source_id])
        elif item.media_type in ["anime", "manga"]:
            url = reverse("anilist_detail", args=[item.source, item.media_type, item.source_id])
        elif item.source == "igdb" and item.media_type == "game":
            url = reverse("igdb_detail", args=[item.source_id])
        elif item.source == "openlib" and item.media_type == "book":
            url = reverse("openlib_detail", args=[item.source_id])
        elif item.source == "musicbrainz" and item.media_type == "music":
            url = reverse("musicbrainz_detail", args=[item.source_id])
        else:
            url = "#"

        cover_url = item.cover_url or "/static/core/img/placeholder.png"

        recent_activity.append(
            {
                "message_main": action,
                "message_time": time_ago,
                "media_type": item.media_type,
                "title": item.title,
                "url": url,
                "cover_url": cover_url,
            }
        )

    # Reuse favorites list for banner
    favorite_banners = [f for f in favorites if f.banner_url]

    initial_banner = None
    
    if favorite_banners:
        import random
        random_item = random.choice(favorite_banners)
        
        initial_banner = {
            "url": random_item.banner_url,
            "notes": random_item.notes,
            "media_type":random_item.media_type
        }

    # Get theme mode
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else "dark"

    return render(
        request,
        "core/p_home.html",
        {
            "favorite_sections": favorite_sections.items(),
            "favorite_sections_dict": favorite_sections,
            "favorite_characters": favorite_characters,
            "favorite_actors": favorite_actors,
            "stats": stats,
            "stats_blocks": stats_blocks,
            "extra_stats": extra_stats,
            "activity_data": activity_data,
            "activity_columns": columns,
            "notifications": notifications_list,
            "recent_activity": recent_activity,
            "theme_mode": theme_mode,
            "initial_banner": initial_banner,
        },
    )

@ensure_csrf_cookie
def movies(request):
    # Get current rating mode and theme from AppSettings
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else "faces"
    theme_mode = settings.theme_mode if settings else "dark"

    # Get status counts for sidebar
    status_counts = {
        "all": MediaItem.objects.filter(media_type="movie").count(),
        "ongoing": MediaItem.objects.filter(
            media_type="movie", status="ongoing"
        ).count(),
        "completed": MediaItem.objects.filter(
            media_type="movie", status="completed"
        ).count(),
        "on_hold": MediaItem.objects.filter(
            media_type="movie", status="on_hold"
        ).count(),
        "planned": MediaItem.objects.filter(
            media_type="movie", status="planned"
        ).count(),
        "dropped": MediaItem.objects.filter(
            media_type="movie", status="dropped"
        ).count(),
    }

    items_with_banners = MediaItem.objects.filter(
        media_type="movie"
    ).exclude(banner_url="") 

    initial_banner = None
    if items_with_banners.exists():
        random_item = items_with_banners.order_by("?").first()
        
        initial_banner = {
            "url": random_item.banner_url,
            "notes": random_item.notes
        }

    return render(
        request,
        "core/m_movies.html",
        {
            "page_type": "movie",
            "rating_mode": rating_mode,
            "theme_mode": theme_mode,
            "status_counts": status_counts,
            "initial_banner": initial_banner,
        },
    )

@ensure_csrf_cookie
def tvshows(request):
    # Get current rating mode and theme from AppSettings
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else "faces"
    theme_mode = settings.theme_mode if settings else "dark"

    # Get status counts for sidebar
    status_counts = {
        "all": MediaItem.objects.filter(media_type="tv").count(),
        "ongoing": MediaItem.objects.filter(media_type="tv", status="ongoing").count(),
        "completed": MediaItem.objects.filter(
            media_type="tv", status="completed"
        ).count(),
        "on_hold": MediaItem.objects.filter(media_type="tv", status="on_hold").count(),
        "planned": MediaItem.objects.filter(media_type="tv", status="planned").count(),
        "dropped": MediaItem.objects.filter(media_type="tv", status="dropped").count(),
    }

    # Check if there are any seasons in the list
    has_seasons = (
        MediaItem.objects.filter(media_type="tv")
        .filter(Q(provider_ids__tmdb__icontains="_s") | Q(title__icontains="Season"))
        .exists()
    )

    items_with_banners = MediaItem.objects.filter(
        media_type="tv"
    ).exclude(banner_url="") 

    initial_banner = None
    if items_with_banners.exists():
        random_item = items_with_banners.order_by("?").first()
        
        initial_banner = {
            "url": random_item.banner_url,
            "notes": random_item.notes
        }

    return render(
        request,
        "core/m_tvshows.html",
        {
            "page_type": "tv",
            "rating_mode": rating_mode,
            "has_seasons": has_seasons,
            "theme_mode": theme_mode,
            "status_counts": status_counts,
            "initial_banner": initial_banner,
        },
    )

@ensure_csrf_cookie
def anime(request):
    # Get current rating mode and theme from AppSettings
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else "faces"
    theme_mode = settings.theme_mode if settings else "dark"

    # Get status counts for sidebar
    status_counts = {
        "all": MediaItem.objects.filter(media_type="anime").count(),
        "ongoing": MediaItem.objects.filter(
            media_type="anime", status="ongoing"
        ).count(),
        "completed": MediaItem.objects.filter(
            media_type="anime", status="completed"
        ).count(),
        "on_hold": MediaItem.objects.filter(
            media_type="anime", status="on_hold"
        ).count(),
        "planned": MediaItem.objects.filter(
            media_type="anime", status="planned"
        ).count(),
        "dropped": MediaItem.objects.filter(
            media_type="anime", status="dropped"
        ).count(),
    }

    items_with_banners = MediaItem.objects.filter(
        media_type="anime"
    ).exclude(banner_url="") 

    initial_banner = None
    if items_with_banners.exists():
        random_item = items_with_banners.order_by("?").first()
        
        initial_banner = {
            "url": random_item.banner_url,
            "notes": random_item.notes
        }

    return render(
        request,
        "core/m_anime.html",
        {
            "page_type": "anime",
            "rating_mode": rating_mode,
            "theme_mode": theme_mode,
            "status_counts": status_counts,
            "initial_banner": initial_banner,
        },
    )

@ensure_csrf_cookie
def manga(request):
    # Get current rating mode and theme from AppSettings
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else "faces"
    theme_mode = settings.theme_mode if settings else "dark"

    # Get status counts for sidebar
    status_counts = {
        "all": MediaItem.objects.filter(media_type="manga").count(),
        "ongoing": MediaItem.objects.filter(
            media_type="manga", status="ongoing"
        ).count(),
        "completed": MediaItem.objects.filter(
            media_type="manga", status="completed"
        ).count(),
        "on_hold": MediaItem.objects.filter(
            media_type="manga", status="on_hold"
        ).count(),
        "planned": MediaItem.objects.filter(
            media_type="manga", status="planned"
        ).count(),
        "dropped": MediaItem.objects.filter(
            media_type="manga", status="dropped"
        ).count(),
    }

    items_with_banners = MediaItem.objects.filter(
        media_type="manga"
    ).exclude(banner_url="") 

    initial_banner = None
    if items_with_banners.exists():
        random_item = items_with_banners.order_by("?").first()
        
        initial_banner = {
            "url": random_item.banner_url,
            "notes": random_item.notes
        }

    return render(
        request,
        "core/m_manga.html",
        {
            "page_type": "manga",
            "rating_mode": rating_mode,
            "theme_mode": theme_mode,
            "status_counts": status_counts,
            "initial_banner": initial_banner,
        },
    )

@ensure_csrf_cookie
def games(request):
    # Get current rating mode and theme from AppSettings
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else "faces"
    theme_mode = settings.theme_mode if settings else "dark"

    # Get status counts for sidebar
    status_counts = {
        "all": MediaItem.objects.filter(media_type="game").count(),
        "ongoing": MediaItem.objects.filter(
            media_type="game", status="ongoing"
        ).count(),
        "completed": MediaItem.objects.filter(
            media_type="game", status="completed"
        ).count(),
        "on_hold": MediaItem.objects.filter(
            media_type="game", status="on_hold"
        ).count(),
        "planned": MediaItem.objects.filter(
            media_type="game", status="planned"
        ).count(),
        "dropped": MediaItem.objects.filter(
            media_type="game", status="dropped"
        ).count(),
    }

    items_with_banners = MediaItem.objects.filter(
        media_type="game"
    ).exclude(banner_url="") 

    initial_banner = None
    if items_with_banners.exists():
        random_item = items_with_banners.order_by("?").first()
        
        initial_banner = {
            "url": random_item.banner_url,
            "notes": random_item.notes
        }

    return render(
        request,
        "core/m_games.html",
        {
            "page_type": "game",
            "rating_mode": rating_mode,
            "theme_mode": theme_mode,
            "status_counts": status_counts,
            "initial_banner": initial_banner,
        },
    )

@ensure_csrf_cookie
def music(request):
    # Get current rating mode and theme from AppSettings
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else "faces"
    theme_mode = settings.theme_mode if settings else "dark"

    # Get status counts for sidebar
    status_counts = {
        "all": MediaItem.objects.filter(media_type="music").count(),
        "ongoing": MediaItem.objects.filter(
            media_type="music", status="ongoing"
        ).count(),
        "completed": MediaItem.objects.filter(
            media_type="music", status="completed"
        ).count(),
        "on_hold": MediaItem.objects.filter(
            media_type="music", status="on_hold"
        ).count(),
        "planned": MediaItem.objects.filter(
            media_type="music", status="planned"
        ).count(),
        "dropped": MediaItem.objects.filter(
            media_type="music", status="dropped"
        ).count(),
    }

    items_with_banners = MediaItem.objects.filter(
        media_type="music"
    ).exclude(banner_url="") 

    initial_banner = None
    if items_with_banners.exists():
        random_item = items_with_banners.order_by("?").first()
        
        initial_banner = {
            "url": random_item.banner_url,
            "notes": random_item.notes
        }

    return render(
        request,
        "core/m_music.html",
        {
            "page_type": "music",
            "rating_mode": rating_mode,
            "theme_mode": theme_mode,
            "status_counts": status_counts,
            "initial_banner": initial_banner,
        },
    )

@ensure_csrf_cookie
def books(request):
    # Get current rating mode and theme from AppSettings
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else "faces"
    theme_mode = settings.theme_mode if settings else "dark"

    # Get status counts for sidebar
    status_counts = {
        "all": MediaItem.objects.filter(media_type="book").count(),
        "ongoing": MediaItem.objects.filter(
            media_type="book", status="ongoing"
        ).count(),
        "completed": MediaItem.objects.filter(
            media_type="book", status="completed"
        ).count(),
        "on_hold": MediaItem.objects.filter(
            media_type="book", status="on_hold"
        ).count(),
        "planned": MediaItem.objects.filter(
            media_type="book", status="planned"
        ).count(),
        "dropped": MediaItem.objects.filter(
            media_type="book", status="dropped"
        ).count(),
    }

    items_with_banners = MediaItem.objects.filter(
        media_type="book"
    ).exclude(banner_url="") 

    initial_banner = None
    if items_with_banners.exists():
        random_item = items_with_banners.order_by("?").first()
        
        initial_banner = {
            "url": random_item.banner_url,
            "notes": random_item.notes
        }

    return render(
        request,
        "core/m_books.html",
        {
            "page_type": "book",
            "rating_mode": rating_mode,
            "theme_mode": theme_mode,
            "status_counts": status_counts,
            "initial_banner": initial_banner,
        },
    )

@ensure_csrf_cookie
def history(request):
    # For sidebar: calculate latest 3 years dynamically
    current_year = timezone.now().year
    latest_years = [current_year - i for i in range(3)]  # e.g., 2025, 2024, 2023

    # Get theme mode from AppSettings
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else "dark"

    return render(
        request,
        "core/p_history.html",
        {
            "latest_years": latest_years,
            "theme_mode": theme_mode,
        },
    )

@ensure_csrf_cookie
def favorites_page(request):
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else "dark"

    # Fetch favorite media items
    favorite_media = MediaItem.objects.filter(favorite=True).order_by(
        "favorite_position", "date_added"
    )

    # Fetch favorite people
    favorite_characters = FavoritePerson.objects.filter(type="character").order_by(
        "position"
    )
    favorite_actors = FavoritePerson.objects.filter(type="actor").order_by("position")

    # Define all sections with their metadata
    # (Display Name, Slug/Key, Type, QuerySet)
    all_section_defs = [
        ("Movies", "movie", "media", favorite_media.filter(media_type="movie")),
        ("TV Shows", "tv", "media", favorite_media.filter(media_type="tv")),
        ("Anime", "anime", "media", favorite_media.filter(media_type="anime")),
        ("Manga", "manga", "media", favorite_media.filter(media_type="manga")),
        ("Games", "game", "media", favorite_media.filter(media_type="game")),
        ("Books", "book", "media", favorite_media.filter(media_type="book")),
        ("Music", "music", "media", favorite_media.filter(media_type="music")),
        ("Characters", "characters", "person", favorite_characters),
        ("Actors", "actors", "person", favorite_actors),
    ]

    # Reorder based on requested section
    requested_section = request.GET.get("section")
    if requested_section:
        # Find the index of the requested section
        index = next(
            (i for i, s in enumerate(all_section_defs) if s[0] == requested_section), -1
        )
        if index > 0:
            # Move to front
            item = all_section_defs.pop(index)
            all_section_defs.insert(0, item)

    # Build the final list of sections to render
    sections = []
    global_limit = 100
    current_total = 0

    for display_name, key, kind, queryset in all_section_defs:
        count = queryset.count()
        if count > 0:
            # For media, key is the media_type code (e.g. 'movie')
            # For person, key is the slug (e.g. 'characters')
            # We need a consistent slug for the API/template
            if kind == "media":
                slug = slugify(display_name)
            else:
                slug = key

            # Determine items to take based on global limit
            remaining = global_limit - current_total
            items_to_take = 0

            if count <= remaining:
                items_to_take = count
            else:
                # Take multiples of 50 that fit in remaining to align with API pages
                items_to_take = (remaining // 50) * 50

            # Normalize items for template
            items_data = []
            for item in queryset[:items_to_take]:
                url = "#"
                cover_url = ""
                title = ""

                if kind == "media":
                    title = item.title
                    cover_url = item.cover_url or "/static/core/img/placeholder.png"

                    if item.media_type in ["movie", "tv"]:
                        if "_s" in item.source_id:
                            parts = item.source_id.split("_s")
                            url = f"/tmdb/season/{parts[0]}/{parts[1]}/"
                        else:
                            url = reverse(
                                "tmdb_detail", args=[item.media_type, item.source_id]
                            )
                    elif item.media_type in ["anime", "manga"]:
                        url = reverse(
                            "anilist_detail", args=[item.source, item.media_type, item.source_id]
                        )
                    elif item.media_type == "game":
                        url = reverse("igdb_detail", args=[item.source_id])
                    elif item.media_type == "book":
                        url = reverse("openlib_detail", args=[item.source_id])
                    elif item.media_type == "music":
                        url = reverse("musicbrainz_detail", args=[item.source_id])
                else:
                    # Person
                    title = item.name
                    cover_url = item.image_url or "/static/core/img/placeholder.png"
                    if item.person_id:
                        url = f"/person/{item.type}/{item.person_id}/"

                items_data.append(
                    {
                        "id": item.id,
                        "title": title,
                        "cover_url": cover_url,
                        "url": url,
                        "media_type": key,
                    }
                )

            current_total += items_to_take

            sections.append(
                {
                    "category": display_name,
                    "slug": slug,
                    "type": kind,
                    "items": items_data,
                    "has_more": count > items_to_take,
                    "page": items_to_take // 50,
                }
            )

    return render(
        request,
        "core/p_favorites.html",
        {
            "theme_mode": theme_mode,
            "sections": sections,
        },
    )

@ensure_csrf_cookie
@require_GET
def person_detail(request, person_type, person_id):
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else "dark"

    if person_type == "actor":
        person_data = fetch_actor_data(person_id)
    elif person_type == "character":
        person_data = fetch_character_data(person_id)
    else:
        person_data = None

    person_name = (
        person_data.get("name")
        if person_data
        else f"{person_type.title()} #{person_id}"
    )

    return render(
        request,
        "core/p_person_details.html",
        {
            "person_type": person_type,
            "person_id": person_id,
            "person_name": person_name,
            "person_data": person_data,
            "theme_mode": theme_mode,
        },
    )

@ensure_csrf_cookie
def discover_view(request):
    # Get theme mode
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else "dark"

    return render(
        request,
        "core/p_discover.html",
        {
            "theme_mode": theme_mode,
        },
    )

@ensure_csrf_cookie
def community(request):
    firebase_url = (
        "https://media-journal-6c8cf-default-rtdb.europe-west1.firebasedatabase.app"
    )

    # Get only the fields we need for posting
    items = MediaItem.objects.values(
        "id", "title", "media_type", "source", "provider_ids", "status"
    ).order_by("title")

    media_types = dict(MediaItem.MEDIA_TYPES)

    # Get theme mode
    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else "dark"

    return render(
        request,
        "core/p_community.html",
        {
            "firebase_url": firebase_url,
            "items": list(items),
            "media_types": media_types,
            "theme_mode": theme_mode,
            "username": settings.username if settings and settings.username else "",
        },
    )

@ensure_csrf_cookie
def settings_page(request):
    keys = APIKey.objects.all().order_by("name")
    existing_names = [key.name for key in keys]
    allowed_names = APIKey.NAME_CHOICES

    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    if not settings:
        settings = AppSettings.objects.create()  # ensure one exists

    current_rating_mode = settings.rating_mode

    nav_items = NavItem.objects.all().order_by("position")
    for item in nav_items:
        item.display_name = item.get_name_display()

    return render(
        request,
        "core/p_settings.html",
        {
            "keys": keys,
            "allowed_names": allowed_names,
            "existing_names": existing_names,
            "nav_items": nav_items,
            "current_rating_mode": current_rating_mode,
            "theme_mode": settings.theme_mode,
            "show_date_field": settings.show_date_field,
            "show_repeats_field": settings.show_repeats_field,
        },
    )
