from django.apps import apps
from core.utils import download_image, fetch_anilist_data, get_igdb_token, get_anime_extra_info, get_game_extra_info, get_manga_extra_info, get_movie_extra_info, get_tv_extra_info, get_music_extra_info, rating_to_display, display_to_rating, get_anilist_discover, get_tmdb_discover, get_igdb_discover
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from django.db.models import Case, When, IntegerField, Value, F, Q

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
from .models import APIKey, MediaItem, FavoritePerson, NavItem, AppSettings
from django.db.models import Sum
from django.utils.text import slugify
from django.urls import reverse
from django.db import transaction
from django.core.files.base import ContentFile
from django.utils.timesince import timesince
import datetime as dt
import uuid
import time
import json
import requests
import logging
import os
import datetime
import shutil
import tempfile
import zipfile
import io
import glob
import re
import threading



logger = logging.getLogger(__name__)

IGDB_ACCESS_TOKEN = None
IGDB_TOKEN_EXPIRY = 0

def get_season_navigation(seasons, current_season):
    """Generate navigation data for season detail pages"""
    nav = {}
    
    # Sort seasons by season_number, handle specials (season 0)
    sorted_seasons = sorted(seasons, key=lambda s: s.get('season_number', 0))
    
    current_index = next((i for i, s in enumerate(sorted_seasons) if s.get('season_number') == current_season), None)
    if current_index is None:
        return nav
    
    # Previous season
    if current_index > 0:
        prev_season = sorted_seasons[current_index - 1]
        nav['prev_season'] = prev_season.get('season_number')
        nav['prev_name'] = 'Specials' if prev_season.get('season_number') == 0 else f"Season {prev_season.get('season_number')}"
    
    # Next season
    if current_index < len(sorted_seasons) - 1:
        next_season = sorted_seasons[current_index + 1]
        nav['next_season'] = next_season.get('season_number')
        nav['next_name'] = 'Specials' if next_season.get('season_number') == 0 else f"Season {next_season.get('season_number')}"
    
    # Last season (if there are more than 2 seasons ahead)
    if current_index < len(sorted_seasons) - 2:
        last_season = sorted_seasons[-1]
        if last_season.get('season_number') != 0:  # Don't show "Last Season" for specials
            nav['last_season'] = last_season.get('season_number')
            nav['last_name'] = f"Season {last_season.get('season_number')}"
    
    return nav





@ensure_csrf_cookie
def movies(request):
    # Get current rating mode and theme from AppSettings
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else 'faces'
    theme_mode = settings.theme_mode if settings else 'dark'

    # Get status counts for sidebar
    status_counts = {
        'all': MediaItem.objects.filter(media_type="movie").count(),
        'ongoing': MediaItem.objects.filter(media_type="movie", status='ongoing').count(),
        'completed': MediaItem.objects.filter(media_type="movie", status='completed').count(),
        'on_hold': MediaItem.objects.filter(media_type="movie", status='on_hold').count(),
        'planned': MediaItem.objects.filter(media_type="movie", status='planned').count(),
        'dropped': MediaItem.objects.filter(media_type="movie", status='dropped').count(),
    }

    return render(request, 'core/movies.html', {
        'page_type': 'movie',
        'rating_mode': rating_mode,
        'theme_mode': theme_mode,
        'status_counts': status_counts,
    })

@require_GET
def movies_api(request):
    page = int(request.GET.get('page', 1))
    status = request.GET.get('status', 'all')
    search = request.GET.get('search', '').strip()
    sort_by = request.GET.get('sort_by', 'rating')
    sort_order = request.GET.get('sort_order', 'desc')
    page_size = 50
    
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
        When(personal_rating=None, then=Value(0)),
        default=F('personal_rating'),
        output_field=IntegerField(),
    )
    
    queryset = MediaItem.objects.filter(media_type="movie")
    
    if status != 'all':
        queryset = queryset.filter(status=status)
    
    if search:
        queryset = queryset.filter(title__icontains=search)
    
    queryset = queryset.annotate(
        status_order=status_ordering,
        rating_order=rating_ordering
    )
    
    # Apply sorting
    order_fields = ['status_order']
    if sort_by == 'title':
        order_fields.append('title' if sort_order == 'asc' else '-title')
    elif sort_by == 'rating':
        order_fields.append('-rating_order' if sort_order == 'desc' else 'rating_order')
        order_fields.append('title')  # Secondary sort by title
    elif sort_by == 'date':
        order_fields.append('-date_added' if sort_order == 'desc' else 'date_added')
    
    queryset = queryset.order_by(*order_fields)
    
    start = (page - 1) * page_size
    end = start + page_size
    items = queryset[start:end]
    
    has_more = queryset.count() > end
    
    items_data = []
    for item in items:
        items_data.append({
            'id': item.id,
            'title': item.title,
            'media_type': item.media_type,
            'status': item.status,
            'personal_rating': item.personal_rating,
            'cover_url': item.cover_url or '/static/core/img/placeholder.png',
            'banner_url': item.banner_url or '/static/core/img/placeholder.png',
            'notes': item.notes or '',
            'source_id': item.source_id,
            'get_status_display': item.get_status_display(),
            'repeats': item.repeats,
            'date_added': item.date_added.isoformat() if item.date_added else '',
        })
    
    return JsonResponse({
        'items': items_data,
        'has_more': has_more,
        'page': page
    })

@require_GET
def movies_banners_api(request):
    """Get all movie banners for the rotator"""
    movies = MediaItem.objects.filter(media_type="movie").values('banner_url', 'notes')
    banners = []
    for movie in movies:
        banner_url = movie['banner_url']
        notes = movie['notes'] or ''
        if banner_url and not 'placeholder' in banner_url:
            banners.append({
                'bannerUrl': banner_url,
                'notes': notes if notes != 'None' else ''
            })
    return JsonResponse({'banners': banners})


@ensure_csrf_cookie
def tvshows(request):
    # Get current rating mode and theme from AppSettings
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else 'faces'
    theme_mode = settings.theme_mode if settings else 'dark'

    # Get status counts for sidebar
    status_counts = {
        'all': MediaItem.objects.filter(media_type="tv").count(),
        'ongoing': MediaItem.objects.filter(media_type="tv", status='ongoing').count(),
        'completed': MediaItem.objects.filter(media_type="tv", status='completed').count(),
        'on_hold': MediaItem.objects.filter(media_type="tv", status='on_hold').count(),
        'planned': MediaItem.objects.filter(media_type="tv", status='planned').count(),
        'dropped': MediaItem.objects.filter(media_type="tv", status='dropped').count(),
    }

    # Check if there are any seasons in the list
    has_seasons = MediaItem.objects.filter(media_type="tv").filter(Q(source_id__contains='_s') | Q(title__contains='Season')).exists()

    return render(request, 'core/tvshows.html', {
        'page_type': 'tv',
        'rating_mode': rating_mode,
        'has_seasons': has_seasons,
        'theme_mode': theme_mode,
        'status_counts': status_counts,
    })

@require_GET
def tvshows_api(request):
    page = int(request.GET.get('page', 1))
    status = request.GET.get('status', 'all')
    search = request.GET.get('search', '').strip()
    type_filter = request.GET.get('type', 'both')
    sort_by = request.GET.get('sort_by', 'rating')
    sort_order = request.GET.get('sort_order', 'desc')
    page_size = 50
    
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
        When(personal_rating=None, then=Value(0)),
        default=F('personal_rating'),
        output_field=IntegerField(),
    )
    
    queryset = MediaItem.objects.filter(media_type="tv")
    
    if status != 'all':
        queryset = queryset.filter(status=status)
    
    if search:
        queryset = queryset.filter(title__icontains=search)
    
    # Type filtering for TV shows vs seasons
    if type_filter == 'shows':
        queryset = queryset.exclude(source_id__contains='_s')
    elif type_filter == 'seasons':
        queryset = queryset.filter(source_id__contains='_s')
    # 'both' shows everything
    
    queryset = queryset.annotate(
        status_order=status_ordering,
        rating_order=rating_ordering
    )
    
    # Apply sorting
    order_fields = ['status_order']
    if sort_by == 'title':
        order_fields.append('title' if sort_order == 'asc' else '-title')
    elif sort_by == 'rating':
        order_fields.append('-rating_order' if sort_order == 'desc' else 'rating_order')
        order_fields.append('title')  # Secondary sort by title
    elif sort_by == 'date':
        order_fields.append('-date_added' if sort_order == 'desc' else 'date_added')
    
    queryset = queryset.order_by(*order_fields)
    
    start = (page - 1) * page_size
    end = start + page_size
    items = queryset[start:end]
    
    has_more = queryset.count() > end
    
    items_data = []
    for item in items:
        items_data.append({
            'id': item.id,
            'title': item.title,
            'media_type': item.media_type,
            'status': item.status,
            'personal_rating': item.personal_rating,
            'cover_url': item.cover_url or '/static/core/img/placeholder.png',
            'banner_url': item.banner_url or '/static/core/img/placeholder.png',
            'notes': item.notes or '',
            'source_id': item.source_id,
            'get_status_display': item.get_status_display(),
            'progress_main': item.progress_main,
            'total_main': item.total_main,
            'progress_secondary': item.progress_secondary,
            'total_secondary': item.total_secondary,
            'repeats': item.repeats,
            'date_added': item.date_added.isoformat() if item.date_added else '',
        })
    
    return JsonResponse({
        'items': items_data,
        'has_more': has_more,
        'page': page
    })

@require_GET
def tvshows_banners_api(request):
    """Get all TV show banners for the rotator"""
    tvshows = MediaItem.objects.filter(media_type="tv").values('banner_url', 'notes')
    banners = []
    for tvshow in tvshows:
        banner_url = tvshow['banner_url']
        notes = tvshow['notes'] or ''
        if banner_url and not 'placeholder' in banner_url:
            banners.append({
                'bannerUrl': banner_url,
                'notes': notes if notes != 'None' else ''
            })
    return JsonResponse({'banners': banners})


@ensure_csrf_cookie
def anime(request):
    # Get current rating mode and theme from AppSettings
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else 'faces'
    theme_mode = settings.theme_mode if settings else 'dark'

    # Get status counts for sidebar
    status_counts = {
        'all': MediaItem.objects.filter(media_type="anime").count(),
        'ongoing': MediaItem.objects.filter(media_type="anime", status='ongoing').count(),
        'completed': MediaItem.objects.filter(media_type="anime", status='completed').count(),
        'on_hold': MediaItem.objects.filter(media_type="anime", status='on_hold').count(),
        'planned': MediaItem.objects.filter(media_type="anime", status='planned').count(),
        'dropped': MediaItem.objects.filter(media_type="anime", status='dropped').count(),
    }

    return render(request, 'core/anime.html', {
        'page_type': 'anime',
        'rating_mode': rating_mode,
        'theme_mode': theme_mode,
        'status_counts': status_counts,
    })

@require_GET
def anime_api(request):
    page = int(request.GET.get('page', 1))
    status = request.GET.get('status', 'all')
    search = request.GET.get('search', '').strip()
    sort_by = request.GET.get('sort_by', 'rating')
    sort_order = request.GET.get('sort_order', 'desc')
    page_size = 50
    
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
        When(personal_rating=None, then=Value(0)),
        default=F('personal_rating'),
        output_field=IntegerField(),
    )
    
    queryset = MediaItem.objects.filter(media_type="anime")
    
    if status != 'all':
        queryset = queryset.filter(status=status)
    
    if search:
        queryset = queryset.filter(title__icontains=search)
    
    queryset = queryset.annotate(
        status_order=status_ordering,
        rating_order=rating_ordering
    )
    
    # Apply sorting
    order_fields = ['status_order']
    if sort_by == 'title':
        order_fields.append('title' if sort_order == 'asc' else '-title')
    elif sort_by == 'rating':
        order_fields.append('-rating_order' if sort_order == 'desc' else 'rating_order')
        order_fields.append('title')  # Secondary sort by title
    elif sort_by == 'date':
        order_fields.append('-date_added' if sort_order == 'desc' else 'date_added')
    
    queryset = queryset.order_by(*order_fields)
    
    start = (page - 1) * page_size
    end = start + page_size
    items = queryset[start:end]
    
    has_more = queryset.count() > end
    
    items_data = []
    for item in items:
        items_data.append({
            'id': item.id,
            'title': item.title,
            'media_type': item.media_type,
            'status': item.status,
            'personal_rating': item.personal_rating,
            'cover_url': item.cover_url or '/static/core/img/placeholder.png',
            'banner_url': item.banner_url or '/static/core/img/placeholder.png',
            'notes': item.notes or '',
            'source_id': item.source_id,
            'get_status_display': item.get_status_display(),
            'progress_main': item.progress_main,
            'total_main': item.total_main,
            'repeats': item.repeats,
            'date_added': item.date_added.isoformat() if item.date_added else '',
        })
    
    return JsonResponse({
        'items': items_data,
        'has_more': has_more,
        'page': page
    })

@require_GET
def anime_banners_api(request):
    """Get all anime banners for the rotator"""
    anime = MediaItem.objects.filter(media_type="anime").values('banner_url', 'notes')
    banners = []
    for item in anime:
        banner_url = item['banner_url']
        notes = item['notes'] or ''
        if banner_url and not 'placeholder' in banner_url:
            banners.append({
                'bannerUrl': banner_url,
                'notes': notes if notes != 'None' else ''
            })
    return JsonResponse({'banners': banners})


@ensure_csrf_cookie
def games(request):
    # Get current rating mode and theme from AppSettings
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else 'faces'
    theme_mode = settings.theme_mode if settings else 'dark'

    # Get status counts for sidebar
    status_counts = {
        'all': MediaItem.objects.filter(media_type="game").count(),
        'ongoing': MediaItem.objects.filter(media_type="game", status='ongoing').count(),
        'completed': MediaItem.objects.filter(media_type="game", status='completed').count(),
        'on_hold': MediaItem.objects.filter(media_type="game", status='on_hold').count(),
        'planned': MediaItem.objects.filter(media_type="game", status='planned').count(),
        'dropped': MediaItem.objects.filter(media_type="game", status='dropped').count(),
    }

    return render(request, 'core/games.html', {
        'page_type': 'game',
        'rating_mode': rating_mode,
        'theme_mode': theme_mode,
        'status_counts': status_counts,
    })

@require_GET
def games_api(request):
    page = int(request.GET.get('page', 1))
    status = request.GET.get('status', 'all')
    search = request.GET.get('search', '').strip()
    sort_by = request.GET.get('sort_by', 'rating')
    sort_order = request.GET.get('sort_order', 'desc')
    page_size = 50
    
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
        When(personal_rating=None, then=Value(0)),
        default=F('personal_rating'),
        output_field=IntegerField(),
    )
    
    queryset = MediaItem.objects.filter(media_type="game")
    
    if status != 'all':
        queryset = queryset.filter(status=status)
    
    if search:
        queryset = queryset.filter(title__icontains=search)
    
    queryset = queryset.annotate(
        status_order=status_ordering,
        rating_order=rating_ordering
    )
    
    # Apply sorting
    order_fields = ['status_order']
    if sort_by == 'title':
        order_fields.append('title' if sort_order == 'asc' else '-title')
    elif sort_by == 'rating':
        order_fields.append('-rating_order' if sort_order == 'desc' else 'rating_order')
        order_fields.append('title')  # Secondary sort by title
    elif sort_by == 'date':
        order_fields.append('-date_added' if sort_order == 'desc' else 'date_added')
    elif sort_by == 'hours':
        order_fields.append('-progress_main' if sort_order == 'desc' else 'progress_main')
    
    queryset = queryset.order_by(*order_fields)
    
    start = (page - 1) * page_size
    end = start + page_size
    items = queryset[start:end]
    
    has_more = queryset.count() > end
    
    items_data = []
    for item in items:
        items_data.append({
            'id': item.id,
            'title': item.title,
            'media_type': item.media_type,
            'status': item.status,
            'personal_rating': item.personal_rating,
            'cover_url': item.cover_url or '/static/core/img/placeholder.png',
            'banner_url': item.banner_url or '/static/core/img/placeholder.png',
            'notes': item.notes or '',
            'source_id': item.source_id,
            'get_status_display': item.get_status_display(),
            'progress_main': item.progress_main,
            'total_main': item.total_main,
            'repeats': item.repeats,
            'date_added': item.date_added.isoformat() if item.date_added else '',
        })
    
    return JsonResponse({
        'items': items_data,
        'has_more': has_more,
        'page': page
    })

@require_GET
def games_banners_api(request):
    """Get all game banners for the rotator"""
    games = MediaItem.objects.filter(media_type="game").values('banner_url', 'notes')
    banners = []
    for game in games:
        banner_url = game['banner_url']
        notes = game['notes'] or ''
        if banner_url and not 'placeholder' in banner_url:
            banners.append({
                'bannerUrl': banner_url,
                'notes': notes if notes != 'None' else ''
            })
    return JsonResponse({'banners': banners})


@ensure_csrf_cookie
def manga(request):
    # Get current rating mode and theme from AppSettings
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else 'faces'
    theme_mode = settings.theme_mode if settings else 'dark'

    # Get status counts for sidebar
    status_counts = {
        'all': MediaItem.objects.filter(media_type="manga").count(),
        'ongoing': MediaItem.objects.filter(media_type="manga", status='ongoing').count(),
        'completed': MediaItem.objects.filter(media_type="manga", status='completed').count(),
        'on_hold': MediaItem.objects.filter(media_type="manga", status='on_hold').count(),
        'planned': MediaItem.objects.filter(media_type="manga", status='planned').count(),
        'dropped': MediaItem.objects.filter(media_type="manga", status='dropped').count(),
    }

    return render(request, 'core/manga.html', {
        'page_type': 'manga',
        'rating_mode': rating_mode,
        'theme_mode': theme_mode,
        'status_counts': status_counts,
    })

@require_GET
def manga_api(request):
    page = int(request.GET.get('page', 1))
    status = request.GET.get('status', 'all')
    search = request.GET.get('search', '').strip()
    sort_by = request.GET.get('sort_by', 'rating')
    sort_order = request.GET.get('sort_order', 'desc')
    page_size = 50
    
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
        When(personal_rating=None, then=Value(0)),
        default=F('personal_rating'),
        output_field=IntegerField(),
    )
    
    queryset = MediaItem.objects.filter(media_type="manga")
    
    if status != 'all':
        queryset = queryset.filter(status=status)
    
    if search:
        queryset = queryset.filter(title__icontains=search)
    
    queryset = queryset.annotate(
        status_order=status_ordering,
        rating_order=rating_ordering
    )
    
    # Apply sorting
    order_fields = ['status_order']
    if sort_by == 'title':
        order_fields.append('title' if sort_order == 'asc' else '-title')
    elif sort_by == 'rating':
        order_fields.append('-rating_order' if sort_order == 'desc' else 'rating_order')
        order_fields.append('title')  # Secondary sort by title
    elif sort_by == 'date':
        order_fields.append('-date_added' if sort_order == 'desc' else 'date_added')
    
    queryset = queryset.order_by(*order_fields)
    
    start = (page - 1) * page_size
    end = start + page_size
    items = queryset[start:end]
    
    has_more = queryset.count() > end
    
    items_data = []
    for item in items:
        items_data.append({
            'id': item.id,
            'title': item.title,
            'media_type': item.media_type,
            'status': item.status,
            'personal_rating': item.personal_rating,
            'cover_url': item.cover_url or '/static/core/img/placeholder.png',
            'banner_url': item.banner_url or '/static/core/img/placeholder.png',
            'notes': item.notes or '',
            'source_id': item.source_id,
            'get_status_display': item.get_status_display(),
            'progress_main': item.progress_main,
            'total_main': item.total_main,
            'progress_secondary': item.progress_secondary,
            'total_secondary': item.total_secondary,
            'repeats': item.repeats,
            'date_added': item.date_added.isoformat() if item.date_added else '',
        })
    
    return JsonResponse({
        'items': items_data,
        'has_more': has_more,
        'page': page
    })

@require_GET
def manga_banners_api(request):
    """Get all manga banners for the rotator"""
    manga = MediaItem.objects.filter(media_type="manga").values('banner_url', 'notes')
    banners = []
    for item in manga:
        banner_url = item['banner_url']
        notes = item['notes'] or ''
        if banner_url and not 'placeholder' in banner_url:
            banners.append({
                'bannerUrl': banner_url,
                'notes': notes if notes != 'None' else ''
            })
    return JsonResponse({'banners': banners})


@ensure_csrf_cookie
def music(request):
    # Get current rating mode and theme from AppSettings
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else 'faces'
    theme_mode = settings.theme_mode if settings else 'dark'

    # Get status counts for sidebar
    status_counts = {
        'all': MediaItem.objects.filter(media_type="music").count(),
        'ongoing': MediaItem.objects.filter(media_type="music", status='ongoing').count(),
        'completed': MediaItem.objects.filter(media_type="music", status='completed').count(),
        'on_hold': MediaItem.objects.filter(media_type="music", status='on_hold').count(),
        'planned': MediaItem.objects.filter(media_type="music", status='planned').count(),
        'dropped': MediaItem.objects.filter(media_type="music", status='dropped').count(),
    }

    return render(request, 'core/music.html', {
        'page_type': 'music',
        'rating_mode': rating_mode,
        'theme_mode': theme_mode,
        'status_counts': status_counts,
    })

@require_GET
def music_api(request):
    page = int(request.GET.get('page', 1))
    status = request.GET.get('status', 'all')
    search = request.GET.get('search', '').strip()
    sort_by = request.GET.get('sort_by', 'rating')
    sort_order = request.GET.get('sort_order', 'desc')
    page_size = 50
    
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
        When(personal_rating=None, then=Value(0)),
        default=F('personal_rating'),
        output_field=IntegerField(),
    )
    
    queryset = MediaItem.objects.filter(media_type="music")
    
    if status != 'all':
        queryset = queryset.filter(status=status)
    
    if search:
        queryset = queryset.filter(title__icontains=search)
    
    queryset = queryset.annotate(
        status_order=status_ordering,
        rating_order=rating_ordering
    )
    
    # Apply sorting
    order_fields = ['status_order']
    if sort_by == 'title':
        order_fields.append('title' if sort_order == 'asc' else '-title')
    elif sort_by == 'rating':
        order_fields.append('-rating_order' if sort_order == 'desc' else 'rating_order')
        order_fields.append('title')  # Secondary sort by title
    elif sort_by == 'date':
        order_fields.append('-date_added' if sort_order == 'desc' else 'date_added')
    
    queryset = queryset.order_by(*order_fields)
    
    start = (page - 1) * page_size
    end = start + page_size
    items = queryset[start:end]
    
    has_more = queryset.count() > end
    
    items_data = []
    for item in items:
        items_data.append({
            'id': item.id,
            'title': item.title,
            'media_type': item.media_type,
            'status': item.status,
            'personal_rating': item.personal_rating,
            'cover_url': item.cover_url or '/static/core/img/placeholder.png',
            'banner_url': item.banner_url or '/static/core/img/placeholder.png',
            'notes': item.notes or '',
            'source_id': item.source_id,
            'get_status_display': item.get_status_display(),
            'repeats': item.repeats,
            'date_added': item.date_added.isoformat() if item.date_added else '',
        })
    
    return JsonResponse({
        'items': items_data,
        'has_more': has_more,
        'page': page
    })

@require_GET
def music_banners_api(request):
    """Get all music banners for the rotator"""
    music = MediaItem.objects.filter(media_type="music").values('banner_url', 'notes')
    banners = []
    for item in music:
        banner_url = item['banner_url']
        notes = item['notes'] or ''
        if banner_url and not 'placeholder' in banner_url:
            banners.append({
                'bannerUrl': banner_url,
                'notes': notes if notes != 'None' else ''
            })
    return JsonResponse({'banners': banners})

@ensure_csrf_cookie
def books(request):
    # Get current rating mode and theme from AppSettings
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    rating_mode = settings.rating_mode if settings else 'faces'
    theme_mode = settings.theme_mode if settings else 'dark'

    # Get status counts for sidebar
    status_counts = {
        'all': MediaItem.objects.filter(media_type="book").count(),
        'ongoing': MediaItem.objects.filter(media_type="book", status='ongoing').count(),
        'completed': MediaItem.objects.filter(media_type="book", status='completed').count(),
        'on_hold': MediaItem.objects.filter(media_type="book", status='on_hold').count(),
        'planned': MediaItem.objects.filter(media_type="book", status='planned').count(),
        'dropped': MediaItem.objects.filter(media_type="book", status='dropped').count(),
    }

    return render(request, 'core/books.html', {
        'page_type': 'book',
        'rating_mode': rating_mode,
        'theme_mode': theme_mode,
        'status_counts': status_counts,
    })

@require_GET
def books_api(request):
    page = int(request.GET.get('page', 1))
    status = request.GET.get('status', 'all')
    search = request.GET.get('search', '').strip()
    sort_by = request.GET.get('sort_by', 'rating')
    sort_order = request.GET.get('sort_order', 'desc')
    page_size = 50
    
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
        When(personal_rating=None, then=Value(0)),
        default=F('personal_rating'),
        output_field=IntegerField(),
    )
    
    queryset = MediaItem.objects.filter(media_type="book")
    
    if status != 'all':
        queryset = queryset.filter(status=status)
    
    if search:
        queryset = queryset.filter(title__icontains=search)
    
    queryset = queryset.annotate(
        status_order=status_ordering,
        rating_order=rating_ordering
    )
    
    # Apply sorting
    order_fields = ['status_order']
    if sort_by == 'title':
        order_fields.append('title' if sort_order == 'asc' else '-title')
    elif sort_by == 'rating':
        order_fields.append('-rating_order' if sort_order == 'desc' else 'rating_order')
        order_fields.append('title')  # Secondary sort by title
    elif sort_by == 'date':
        order_fields.append('-date_added' if sort_order == 'desc' else 'date_added')
    elif sort_by == 'pages':
        order_fields.append('-progress_main' if sort_order == 'desc' else 'progress_main')
    
    queryset = queryset.order_by(*order_fields)
    
    start = (page - 1) * page_size
    end = start + page_size
    items = queryset[start:end]
    
    has_more = queryset.count() > end
    
    items_data = []
    for item in items:
        items_data.append({
            'id': item.id,
            'title': item.title,
            'media_type': item.media_type,
            'status': item.status,
            'personal_rating': item.personal_rating,
            'cover_url': item.cover_url or '/static/core/img/placeholder.png',
            'banner_url': item.banner_url or '/static/core/img/placeholder.png',
            'notes': item.notes or '',
            'source_id': item.source_id,
            'get_status_display': item.get_status_display(),
            'progress_main': item.progress_main,
            'total_main': item.total_main,
            'repeats': item.repeats,
            'date_added': item.date_added.isoformat() if item.date_added else '',
        })
    
    return JsonResponse({
        'items': items_data,
        'has_more': has_more,
        'page': page
    })

@require_GET
def books_banners_api(request):
    """Get all book banners for the rotator"""
    books = MediaItem.objects.filter(media_type="book").values('banner_url', 'notes')
    banners = []
    for book in books:
        banner_url = book['banner_url']
        notes = book['notes'] or ''
        if banner_url and not 'placeholder' in banner_url:
            banners.append({
                'bannerUrl': banner_url,
                'notes': notes if notes != 'None' else ''
            })
    return JsonResponse({'banners': banners})

@ensure_csrf_cookie
def history(request):
    # For sidebar: calculate latest 3 years dynamically
    current_year = timezone.now().year
    latest_years = [current_year - i for i in range(3)]  # e.g., 2025, 2024, 2023

    # Get theme mode from AppSettings
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else 'dark'

    return render(request, 'core/history.html', {
        'latest_years': latest_years,
        'theme_mode': theme_mode,
    })

@require_GET
def history_api(request):
    page = int(request.GET.get('page', 1))
    search = request.GET.get('search', '').strip()
    sort_order = request.GET.get('sort', 'desc')
    year = request.GET.get('year', '')
    month = request.GET.get('month', '')
    media_type = request.GET.get('type', '')
    status = request.GET.get('status', '')
    start_date = request.GET.get('start_date', '')
    end_date = request.GET.get('end_date', '')
    page_size = 50
    
    queryset = MediaItem.objects.all()
    
    if search:
        queryset = queryset.filter(title__icontains=search)
    
    if year:
        queryset = queryset.filter(date_added__year=year)
    
    if month and year:
        queryset = queryset.filter(date_added__month=month)
    
    if media_type:
        queryset = queryset.filter(media_type=media_type)
    
    if status:
        queryset = queryset.filter(status=status)
    
    if start_date:
        queryset = queryset.filter(date_added__date__gte=start_date)
    
    if end_date:
        queryset = queryset.filter(date_added__date__lte=end_date)
    
    # Sort by date_added
    if sort_order == 'asc':
        queryset = queryset.order_by('date_added')
    else:
        queryset = queryset.order_by('-date_added')
    
    start = (page - 1) * page_size
    end = start + page_size
    items = queryset[start:end]
    
    has_more = queryset.count() > end
    
    items_data = []
    for item in items:
        # Generate the detail URL
        if item.source == "tmdb" and item.media_type in ["movie", "tv"]:
            if "_s" in item.source_id:
                show_id = item.source_id.split("_s")[0]
                season_number = item.source_id.split("_s")[1]
                url = f"/tmdb/season/{show_id}/{season_number}/"
            else:
                url = f"/tmdb/{item.media_type}/{item.source_id}/"
        elif item.source == "mal" and item.media_type in ["anime", "manga"]:
            url = f"/mal/{item.media_type}/{item.source_id}/"
        elif item.source == "igdb" and item.media_type == "game":
            url = f"/igdb/game/{item.source_id}/"
        elif item.source == "openlib" and item.media_type == "book":
            url = f"/openlib/book/{item.source_id}/"
        elif item.source == "musicbrainz" and item.media_type == "music":
            url = f"/musicbrainz/music/{item.source_id}/"
        else:
            url = "#"
        
        items_data.append({
            'id': item.id,
            'title': item.title,
            'media_type': item.media_type,
            'status': item.status,
            'cover_url': item.cover_url or '/static/core/img/placeholder.png',
            'banner_url': item.banner_url or '/static/core/img/placeholder.png',
            'date_added': item.date_added.isoformat(),
            'date_formatted': item.date_added.strftime('%d %b %Y'),
            'url': url,
        })
    
    return JsonResponse({
        'items': items_data,
        'has_more': has_more,
        'page': page
    })

@ensure_csrf_cookie
def home(request):
    favorites = MediaItem.objects.filter(favorite=True).order_by('favorite_position', 'date_added')
    start_tmdb_background_loop()
    start_anilist_background_loop()

    favorite_sections = {
        "Movies": favorites.filter(media_type="movie"),
        "TV Shows": favorites.filter(media_type="tv"),
        "Anime": favorites.filter(media_type="anime"),
        "Manga": favorites.filter(media_type="manga"),
        "Games": favorites.filter(media_type="game"),
        "Books": favorites.filter(media_type="book"),
        "Music": favorites.filter(media_type="music"),
    }

    all_items = MediaItem.objects.all()
    media_counts = {
        "Movies": all_items.filter(media_type="movie").count(),
        "TV Shows": all_items.filter(media_type="tv").count(),
        "Anime": all_items.filter(media_type="anime").count(),
        "Games": all_items.filter(media_type="game").count(),
        "Books": all_items.filter(media_type="book").count(),
        "Manga": all_items.filter(media_type="manga").count(),
        "Music": all_items.filter(media_type="music").count(),
    }

    total_entries = sum(media_counts.values())

    media_colors = {
        "Movies": "#F4B400",     # Yellow
        "TV Shows": "#E53935",   # Red
        "Anime": "#42A5F5",      # Blue
        "Games": "#66BB6A",      # Green
        "Books": "#EC407A",      # Pink
        "Manga": "#AB47BC",      # Purple
        "Music": "#FF7043",      # Orange
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
    
    # Sort by count and mark top 5 as visible
    stats_blocks.sort(key=lambda x: x['count'], reverse=True)
    for i, block in enumerate(stats_blocks):
        block['visible'] = i < 5

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
            if "_s" in item.source_id:  # it's a season
                show_id = item.source_id.split("_s")[0]
                season_number = item.source_id.split("_s")[1]
                url = reverse('tmdb_season_detail', args=[show_id, season_number])
            else:
                url = reverse("tmdb_detail", args=[item.media_type, item.source_id])
        elif item.source == "mal" and item.media_type in ["anime", "manga"]:
            url = reverse("mal_detail", args=[item.media_type, item.source_id])
        elif item.source == "igdb" and item.media_type == "game":
            url = reverse("igdb_detail", args=[item.source_id])
        elif item.source == "openlib" and item.media_type == "book":
            url = reverse("openlib_detail", args=[item.source_id])
        elif item.source == "musicbrainz" and item.media_type == "music":
            url = reverse("musicbrainz_detail", args=[item.source_id])
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

    # Get theme mode
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else 'dark'

    return render(request, "core/home.html", {
        "favorite_sections": favorite_sections.items(),
        "favorite_sections_dict": favorite_sections,
        "favorite_characters": favorite_characters,
        "favorite_actors": favorite_actors,
        "stats": stats,
        "stats_blocks": stats_blocks,
        "extra_stats": extra_stats,
        "activity_data": activity_data,
        "activity_columns": columns,
        'notifications': notifications_list,
        "recent_activity": recent_activity,
        "theme_mode": theme_mode,
    })

@ensure_csrf_cookie
def favorites_page(request):
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else 'dark'

    # Fetch favorite media items
    favorite_media = MediaItem.objects.filter(favorite=True).order_by('favorite_position', 'date_added')
    
    # Fetch favorite people
    favorite_characters = FavoritePerson.objects.filter(type="character").order_by("position")
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
    requested_section = request.GET.get('section')
    if requested_section:
        # Find the index of the requested section
        index = next((i for i, s in enumerate(all_section_defs) if s[0] == requested_section), -1)
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
            if kind == 'media':
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
                
                if kind == 'media':
                    title = item.title
                    cover_url = item.cover_url or '/static/core/img/placeholder.png'
                    
                    if item.media_type in ['movie', 'tv']:
                        if '_s' in item.source_id:
                            parts = item.source_id.split('_s')
                            url = f"/tmdb/season/{parts[0]}/{parts[1]}/"
                        else:
                            url = reverse('tmdb_detail', args=[item.media_type, item.source_id])
                    elif item.media_type in ['anime', 'manga']:
                        url = reverse('mal_detail', args=[item.media_type, item.source_id])
                    elif item.media_type == 'game':
                        url = reverse('igdb_detail', args=[item.source_id])
                    elif item.media_type == 'book':
                        url = reverse('openlib_detail', args=[item.source_id])
                    elif item.media_type == 'music':
                        url = reverse('musicbrainz_detail', args=[item.source_id])
                else:
                    # Person
                    title = item.name
                    cover_url = item.image_url or '/static/core/img/placeholder.png'
                    if item.person_id:
                        url = f"/person/{item.type}/{item.person_id}/"
                
                items_data.append({
                    "id": item.id,
                    "title": title,
                    "cover_url": cover_url,
                    "url": url,
                    "media_type": key,
                })

            current_total += items_to_take

            sections.append({
                "category": display_name,
                "slug": slug,
                "type": kind,
                "items": items_data,
                "has_more": count > items_to_take,
                "page": items_to_take // 50,
            })

    return render(request, "core/favorites.html", {
        "theme_mode": theme_mode,
        "sections": sections,
    })

@require_GET
def favorites_api(request):
    category_slug = request.GET.get('category')
    page = int(request.GET.get('page', 1))
    offset = request.GET.get('offset')
    page_size = 50
    
    if offset is not None:
        start = int(offset)
    else:
        start = (page - 1) * page_size
        
    end = start + page_size

    items_data = []
    has_more = False
    
    # Map slug to media_type
    slug_map = {
        "movies": "movie", "tv-shows": "tv", "anime": "anime",
        "manga": "manga", "games": "game", "books": "book", "music": "music"
    }
    
    if category_slug in slug_map:
        media_type = slug_map[category_slug]
        qs = MediaItem.objects.filter(favorite=True, media_type=media_type).order_by('favorite_position', 'date_added')
        total = qs.count()
        items = qs[start:end]
        has_more = total > end
        
        for item in items:
            # Generate URL
            url = "#"
            if item.media_type in ['movie', 'tv']:
                if '_s' in item.source_id:
                    parts = item.source_id.split('_s')
                    url = f"/tmdb/season/{parts[0]}/{parts[1]}/"
                else:
                    url = reverse('tmdb_detail', args=[item.media_type, item.source_id])
            elif item.media_type in ['anime', 'manga']:
                url = reverse('mal_detail', args=[item.media_type, item.source_id])
            elif item.media_type == 'game':
                url = reverse('igdb_detail', args=[item.source_id])
            elif item.media_type == 'book':
                url = reverse('openlib_detail', args=[item.source_id])
            elif item.media_type == 'music':
                url = reverse('musicbrainz_detail', args=[item.source_id])

            items_data.append({
                "id": item.id,
                "title": item.title,
                "cover_url": item.cover_url or '/static/core/img/placeholder.png',
                "url": url,
                "type": "media",
                "media_type": media_type
            })
            
    elif category_slug in ["characters", "actors"]:
        p_type = "character" if category_slug == "characters" else "actor"
        qs = FavoritePerson.objects.filter(type=p_type).order_by("position")
        total = qs.count()
        items = qs[start:end]
        has_more = total > end
        
        for person in items:
            url = "#"
            if person.person_id:
                url = f"/person/{person.type}/{person.person_id}/"
            
            items_data.append({
                "id": person.id,
                "title": person.name,
                "cover_url": person.image_url or '/static/core/img/placeholder.png',
                "url": url,
                "type": "person",
                "media_type": category_slug
            })

    return JsonResponse({
        "items": items_data,
        "has_more": has_more,
        "page": page
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
@require_POST
def update_favorite_media_order(request):
    try:
        data = json.loads(request.body)
        new_order = data.get("order", [])
        
        if not isinstance(new_order, list):
            return JsonResponse({"error": "Invalid data format"}, status=400)
        
        with transaction.atomic():
            for position, media_id in enumerate(new_order, start=1):
                MediaItem.objects.filter(id=media_id).update(favorite_position=position)
        
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
        "theme_mode": settings.theme_mode,
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

@require_POST
def update_theme(request):
    data = json.loads(request.body.decode("utf-8"))
    theme_mode = data.get("theme_mode")
    
    if theme_mode not in ['light', 'dark', 'brown', 'green']:
        return JsonResponse({"error": "Invalid theme mode"}, status=400)
    
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    if not settings:
        settings = AppSettings.objects.create()
    
    settings.theme_mode = theme_mode
    settings.save()
    
    return JsonResponse({"success": True})

@require_POST
def save_username(request):
    data = json.loads(request.body.decode("utf-8"))
    username = data.get("username", "").strip()
    
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    if not settings:
        settings = AppSettings.objects.create()
    
    settings.username = username
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

@require_GET
def check_in_list(request):
    source = request.GET.get('source')
    source_id = request.GET.get('source_id')
    
    if not source or not source_id:
        return JsonResponse({"error": "Missing parameters"}, status=400)
    
    exists = MediaItem.objects.filter(source=source, source_id=str(source_id)).exists()
    return JsonResponse({"in_list": exists})


@ensure_csrf_cookie
def discover_view(request):
    # Get theme mode
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else 'dark'

    return render(request, "core/discover.html", {
        "theme_mode": theme_mode,
    })

@require_GET
def discover_api(request):
    media_type = request.GET.get('type', 'movie')
    page = int(request.GET.get('page', 1))
    query = request.GET.get('q', '').strip()
    
    # Get filters
    sort = request.GET.get('sort', '')
    season = request.GET.get('season', '')
    year = request.GET.get('year', '')
    format_filter = request.GET.get('format', '')
    status = request.GET.get('status', '')
    genre = request.GET.get('genre', '')
    platform = request.GET.get('platform', '')
    
    try:
        if media_type in ['anime', 'manga']:
            # Map "upcoming" to NOT_YET_RELEASED for AniList
            if status == 'upcoming':
                status = 'NOT_YET_RELEASED'
            data = get_anilist_discover(media_type, page, query, sort, season, year, format_filter, status)
            # Handle case where function returns [] instead of dict
            if isinstance(data, list):
                data = {"results": data, "hasMore": False}
            return JsonResponse(data)
        elif media_type in ['movie', 'tv']:
            results = get_tmdb_discover(media_type, page, query, sort, year)
        elif media_type == 'game':
            results = get_igdb_discover(page, query, sort, genre, platform, year)
        else:
            results = []
            
        return JsonResponse({'results': results})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@ensure_csrf_cookie
def community(request):
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

    # Get theme mode
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else 'dark'

    return render(request, "core/community.html", {
        "firebase_url": firebase_url,
        "items": list(items),
        "media_types": media_types,
        "theme_mode": theme_mode,
        "username": settings.username if settings and settings.username else '',
    })

@ensure_csrf_cookie
@require_GET
def person_detail(request, person_type, person_id):
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else 'dark'
    
    if person_type == 'actor':
        person_data = fetch_actor_data(person_id)
    elif person_type == 'character':
        person_data = fetch_character_data(person_id)
    else:
        person_data = None
    
    person_name = person_data.get('name') if person_data else f"{person_type.title()} #{person_id}"
    
    return render(request, "core/person_detail.html", {
        "person_type": person_type,
        "person_id": person_id,
        "person_name": person_name,
        "person_data": person_data,
        "theme_mode": theme_mode,
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
      Page(perPage: 20) {
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


# music search
@ensure_csrf_cookie
@require_GET
def musicbrainz_search(request):
    query = request.GET.get("q", "").strip()

    if not query:
        return JsonResponse({"error": "Query parameter 'q' is required."}, status=400)

    try:
        url = "https://musicbrainz.org/ws/2/recording"
        params = {
            "query": query,
            "limit": 20,
            "fmt": "json"
        }
        headers = {
            "User-Agent": "MediaJournal/1.0 (https://github.com/mihail-pop/media-journal)"
        }

        response = requests.get(url, params=params, headers=headers, timeout=10)
        if response.status_code != 200:
            return JsonResponse({"error": "Failed to fetch from MusicBrainz."}, status=500)

        data = response.json()
        entries = []

        # Process each recording
        for recording in data.get("recordings", []):
            title = recording.get("title", "Untitled")
            artists_list = [a.get("name", "") for a in recording.get("artist-credit", [])]
            recording_id = recording.get("id")

            for r in recording.get("releases", []):
                rg = r.get("release-group", {})
                primary_type = rg.get("primary-type", "").lower()
                secondary_types = [s.lower() for s in rg.get("secondary-types", [])]

                if not r.get("date"):
                    continue

                year = r.get("date")[:4] if len(r.get("date")) >= 4 else ""

                entries.append({
                    "id": recording_id,
                    "title": title,
                    "artists": artists_list,
                    "release_title": r.get("title", ""),
                    "release_type": primary_type,
                    "secondary_types": secondary_types,
                    "year": year,
                })

        # Group by song title + artists
        grouped = {}
        for e in entries:
            key = (e["title"].lower(), tuple([a.lower() for a in e["artists"]]))
            grouped.setdefault(key, []).append(e)

        # Filter: keep all albums, only show singles if no album
        filtered = []
        for recs in grouped.values():
            albums = [
                r for r in recs
                if r["release_type"] == "album" and not any(st in ["live","remix","compilation","ep"] for st in r["secondary_types"])
            ]
            if albums:
                filtered.append(albums[0])  # keep only the first album per title+artist
            else:
                filtered.append(recs[0])  # keep only the first single if no album

        # Format results
        results = []
        for r in filtered:
            display_title = r["title"]
            if r["artists"]:
                display_title += f" by {', '.join(r['artists'])}"
            if r["year"]:
                display_title += f" | {r['year']}"
            results.append({
                "id": r["id"],
                "title": display_title,
                "poster_path": None,
            })

        return JsonResponse({"results": results})

    except Exception as e:
        logger.error(f"MusicBrainz search error: {str(e)}")
        return JsonResponse({"error": f"Search failed: {str(e)}"}, status=500)



# Music Details
@ensure_csrf_cookie
@require_GET
def musicbrainz_detail(request, recording_id):
    item = None
    try:
        item = MediaItem.objects.get(source="musicbrainz", source_id=recording_id)
        
        # Get YouTube links from screenshots field
        youtube_links = item.screenshots or []
        
        # Format release date
        formatted_release_date = ""
        if item.release_date:
            try:
                parsed_date = datetime.datetime.strptime(item.release_date, "%Y-%m-%d")
                formatted_release_date = parsed_date.strftime("%d %B %Y")
            except ValueError:
                formatted_release_date = item.release_date
        
        AppSettings = apps.get_model('core', 'AppSettings')
        settings = AppSettings.objects.first()
        theme_mode = settings.theme_mode if settings else 'dark'
        
        # Extract artist and album IDs from cast field
        cast_data = item.cast or {}
        artist_id = cast_data.get("artists", [{}])[0].get("id", "") if cast_data.get("artists") else ""
        album_id = cast_data.get("album", {}).get("id", "") if cast_data.get("album") else ""
        
        return render(request, "core/detail.html", {
            "item": item,
            "item_id": item.id,
            "source": "musicbrainz",
            "source_id": recording_id,
            "in_my_list": True,
            "media_type": "music",
            "title": item.title,
            "overview": item.overview,
            "banner_url": item.banner_url,
            "poster_url": item.cover_url,
            "release_date": formatted_release_date,
            "cast": [],
            "recommendations": [],
            "seasons": None,
            "youtube_links": youtube_links,
            "page_type": "music",
            "theme_mode": theme_mode,
            "artist_id": artist_id,
            "album_id": album_id,
        })
    except MediaItem.DoesNotExist:
        pass
    
    # Fetch from MusicBrainz API
    headers = {"User-Agent": "MediaJournal/1.0 (https://github.com/mihail-pop/media-journal)"}
    
    # Get recording details
    time.sleep(1)  # MusicBrainz rate limit
    recording_url = f"https://musicbrainz.org/ws/2/recording/{recording_id}"
    recording_params = {"inc": "artists+releases+release-groups+isrcs+tags", "fmt": "json"}
    
    try:
        recording_response = requests.get(recording_url, params=recording_params, headers=headers, timeout=10)
    except requests.exceptions.RequestException as e:
        logger.error(f"MusicBrainz API error: {str(e)}")
        return JsonResponse({"error": "Failed to connect to MusicBrainz API."}, status=500)
    
    if recording_response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch recording details."}, status=500)
    
    recording_data = recording_response.json()
    
    # Get title and artist
    title = recording_data.get("title", "Untitled")
    artist_credits = recording_data.get("artist-credit", [])
    artists = ", ".join([a.get("name", "") for a in artist_credits])
    artist_label = "Artist" if len(artist_credits) == 1 else "Artists"
    
    # Get first release by date
    first_release = ""
    releases = recording_data.get("releases", [])
    if releases:
        sorted_releases = sorted([r for r in releases if r.get("date")], key=lambda x: x.get("date", ""))
        if sorted_releases:
            release = sorted_releases[0]
            release_title = release.get("title", "")
            release_type = release.get("release-group", {}).get("primary-type", "")
            first_release = f"{release_title} ({release_type})" if release_type else release_title
    
    # Get genres from tags
    genres = [tag.get("name", "") for tag in recording_data.get("tags", [])[:5]]
    
    # Build overview
    overview_parts = []
    if artists:
        overview_parts.append(f"{artist_label}: {artists}")
    if first_release:
        overview_parts.append(f"First released as: {first_release}")
    if genres:
        overview_parts.append(f"Genres: {', '.join(genres)}")
    overview = "\n".join(overview_parts)
    
    # Get ISRC for YouTube search
    isrcs = recording_data.get("isrcs", [])
    isrc = isrcs[0] if isrcs else None
    
    # Search YouTube
    youtube_link = None
    poster_url = None
    banner_url = None
    if isrc:
        search_query = isrc
    else:
        search_query = f"{artists} {title}"
    
    # Simple YouTube search via scraping (no API key needed)
    try:
        import urllib.parse
        import unicodedata
        
        def normalize_text(text):
            # Remove accents and convert to lowercase
            text = ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn').lower()
            # Keep only letters, numbers and spaces
            text = ''.join(c for c in text if c.isalnum() or c.isspace())
            # Normalize all whitespace to single spaces
            return ' '.join(text.split())
        
        yt_search_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(search_query)}"

        yt_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        yt_response = requests.get(yt_search_url, headers=yt_headers, timeout=10)

        if yt_response.status_code == 200:
            import re
            # Find video entries with their view counts nearby
            video_ids = re.findall(r'"videoId":"([^"]+)"', yt_response.text)
            
            # Get unique videos
            videos = []
            seen = set()
            for vid in video_ids:
                if vid not in seen and len(videos) < 10:
                    videos.append(vid)
                    seen.add(vid)
            

            
            # Match videos by title
            best_video = None
            title_normalized = normalize_text(title)

            
            video_titles = []
            for video_id in videos:
                video_pos = yt_response.text.find(f'"videoId":"{video_id}"')
                if video_pos == -1:
                    continue
                search_window = yt_response.text[video_pos:video_pos + 2000]
                title_pattern = r'"title":{"runs":\[{"text":"([^"]+)"}'
                title_match = re.search(title_pattern, search_window)
                
                if title_match:
                    video_title = title_match.group(1)
                    video_title_normalized = normalize_text(video_title)
                    video_titles.append((video_id, video_title, video_title_normalized))

                    
                    if title_normalized in video_title_normalized or video_title_normalized in title_normalized:
                        best_video = video_id
                        break
            
            # Fallback: try matching by artist names
            if not best_video and artists:
                artist_list = [normalize_text(a.strip()) for a in artists.split(',')]
                for artist_name in artist_list:
                    for video_id, video_title, video_title_normalized in video_titles:
                        if artist_name in video_title_normalized:
                            best_video = video_id
                            break
                    if best_video:
                        break

            if not best_video and isrc:
                # Retry search by title + artist
                search_query = f"{artists} {title}"
                yt_search_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(search_query)}"
                yt_response = requests.get(yt_search_url, headers=yt_headers, timeout=10)
    
                video_ids = re.findall(r'"videoId":"([^"]+)"', yt_response.text)
                videos = []
                seen = set()
                for vid in video_ids:
                    if vid not in seen and len(videos) < 10:
                        videos.append(vid)
                        seen.add(vid)

                video_titles = []
                for video_id in videos:
                    video_pos = yt_response.text.find(f'"videoId":"{video_id}"')
                    if video_pos == -1:
                        continue
                    search_window = yt_response.text[video_pos:video_pos + 2000]
                    title_pattern = r'"title":{"runs":\[{"text":"([^"]+)"}'
                    title_match = re.search(title_pattern, search_window)
                    if title_match:
                        video_title = title_match.group(1)
                        video_title_normalized = normalize_text(video_title)
                        video_titles.append((video_id, video_title, video_title_normalized))
                        if normalize_text(title) in video_title_normalized or video_title_normalized in normalize_text(title):
                            best_video = video_id
                            break

                # fallback by artist again
                if not best_video and artists:
                    artist_list = [normalize_text(a.strip()) for a in artists.split(',')]
                    for artist_name in artist_list:
                        for video_id, video_title, video_title_normalized in video_titles:
                            if artist_name in video_title_normalized:
                                best_video = video_id
                                break
                        if best_video:
                            break
            
            if best_video:
                youtube_link = f"https://www.youtube.com/watch?v={best_video}"
                # Try maxresdefault first, fallback to hqdefault if not available
                max_res_url = f"https://img.youtube.com/vi/{best_video}/maxresdefault.jpg"
                try:
                    img_check = requests.head(max_res_url, timeout=3)
                    if img_check.status_code == 200 and int(img_check.headers.get('content-length', 0)) > 5000:
                        poster_url = max_res_url
                    else:
                        poster_url = f"https://img.youtube.com/vi/{best_video}/hqdefault.jpg"
                except:
                    poster_url = f"https://img.youtube.com/vi/{best_video}/hqdefault.jpg"
                banner_url = poster_url
            else:
                print(f"No title match found, skipping YouTube link")
    except Exception as e:
        print(f"YouTube search error: {str(e)}")
        pass
    
    # Get release date
    release_date = ""
    releases = recording_data.get("releases", [])
    if releases:
        first_release = releases[0]
        release_date = first_release.get("date", "")
    
    # Format release date
    formatted_release_date = ""
    if release_date:
        try:
            if len(release_date) >= 10:
                parsed_date = datetime.datetime.strptime(release_date[:10], "%Y-%m-%d")
                formatted_release_date = parsed_date.strftime("%d %B %Y")
            elif len(release_date) >= 4:
                formatted_release_date = release_date[:4]
        except ValueError:
            formatted_release_date = release_date
    
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else 'dark'
    
    # Extract artist and album IDs
    artist_id = artist_credits[0].get("artist", {}).get("id", "") if artist_credits else ""
    first_release_id = releases[0].get("id", "") if releases else ""
    
    return render(request, "core/detail.html", {
        "item": None,
        "item_id": None,
        "source": "musicbrainz",
        "source_id": recording_id,
        "in_my_list": False,
        "media_type": "music",
        "title": title,
        "overview": overview,
        "banner_url": banner_url or "",
        "poster_url": poster_url or "",
        "release_date": formatted_release_date,
        "cast": [],
        "recommendations": [],
        "seasons": None,
        "youtube_links": [{"url": youtube_link, "position": 1}] if youtube_link else [],
        "page_type": "music",
        "theme_mode": theme_mode,
        "artist_id": artist_id,
        "album_id": first_release_id,
    })


def save_musicbrainz_item(recording_id):
    headers = {"User-Agent": "MediaJournal/1.0 (https://github.com/mihail-pop/media-journal)"}
    
    # Get recording details
    time.sleep(1)  # MusicBrainz rate limit
    recording_url = f"https://musicbrainz.org/ws/2/recording/{recording_id}"
    recording_params = {"inc": "artists+releases+release-groups+isrcs+tags", "fmt": "json"}
    
    try:
        recording_response = requests.get(recording_url, params=recording_params, headers=headers, timeout=10)
    except requests.exceptions.RequestException as e:
        raise Exception(f"Failed to connect to MusicBrainz API: {str(e)}")
    
    if recording_response.status_code != 200:
        raise Exception("Failed to fetch recording details.")
    
    recording_data = recording_response.json()
    
    # Get title and artist
    title = recording_data.get("title", "Untitled")
    artist_credits = recording_data.get("artist-credit", [])
    artists = ", ".join([a.get("name", "") for a in artist_credits])
    artist_label = "Artist" if len(artist_credits) == 1 else "Artists"
    
    # Get first release by date and ISRC
    first_release = ""
    first_release_id = ""
    first_release_type = ""
    releases = recording_data.get("releases", [])
    if releases:
        sorted_releases = sorted([r for r in releases if r.get("date")], key=lambda x: x.get("date", ""))
        if sorted_releases:
            release = sorted_releases[0]
            first_release = release.get("title", "")
            first_release_id = release.get("id", "")
            first_release_type = release.get("release-group", {}).get("primary-type", "")
    
    isrcs = recording_data.get("isrcs", [])
    isrc = isrcs[0] if isrcs else ""
    
    # Get genres from tags
    genres = [tag.get("name", "") for tag in recording_data.get("tags", [])[:5]]
    
    # Build overview
    overview_parts = []
    if artists:
        overview_parts.append(f"{artist_label}: {artists}")
    if first_release:
        release_display = f"{first_release} ({first_release_type})" if first_release_type else first_release
        overview_parts.append(f"First released as: {release_display}")
    if genres:
        overview_parts.append(f"Genres: {', '.join(genres)}")
    overview = "\n".join(overview_parts)
    
    # Store data in cast field
    cast_data = {
        "artists": [{"name": a.get("name", ""), "id": a.get("artist", {}).get("id", "")} for a in artist_credits],
        "genres": genres,
        "album": {"title": first_release, "id": first_release_id, "type": first_release_type} if first_release else None,
        "isrc": isrc
    }
    
    # Search YouTube
    youtube_links = []
    local_poster = ""
    if isrc:
        search_query = isrc
    else:
        search_query = f"{artists} {title}"
    
    # Simple YouTube search via scraping
    try:
        import urllib.parse
        import unicodedata
        
        def normalize_text(text):
            # Remove accents and convert to lowercase
            text = ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn').lower()
            # Keep only letters, numbers and spaces
            text = ''.join(c for c in text if c.isalnum() or c.isspace())
            # Normalize all whitespace to single spaces
            return ' '.join(text.split())
        
        yt_search_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(search_query)}"

        yt_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        yt_response = requests.get(yt_search_url, headers=yt_headers, timeout=10)

        if yt_response.status_code == 200:
            import re
            # Find video entries
            video_ids = re.findall(r'"videoId":"([^"]+)"', yt_response.text)
            
            # Get unique videos
            videos = []
            seen = set()
            for vid in video_ids:
                if vid not in seen and len(videos) < 10:
                    videos.append(vid)
                    seen.add(vid)
            
            # Match videos by title
            best_video = None
            title_normalized = normalize_text(title)
            
            video_titles = []
            for video_id in videos:
                video_pos = yt_response.text.find(f'"videoId":"{video_id}"')
                if video_pos == -1:
                    continue
                search_window = yt_response.text[video_pos:video_pos + 2000]
                title_pattern = r'"title":{"runs":\[{"text":"([^"]+)"}'
                title_match = re.search(title_pattern, search_window)
                
                if title_match:
                    video_title = title_match.group(1)
                    video_title_normalized = normalize_text(video_title)
                    video_titles.append((video_id, video_title, video_title_normalized))
                    
                    if title_normalized in video_title_normalized or video_title_normalized in title_normalized:
                        best_video = video_id
                        break
            
            # Fallback: try matching by artist names
            if not best_video and artists:
                artist_list = [normalize_text(a.strip()) for a in artists.split(',')]

                for artist_name in artist_list:
                    for video_id, video_title, video_title_normalized in video_titles:
                        if artist_name in video_title_normalized:
                            best_video = video_id
                            break
                    if best_video:
                        break
            
            if not best_video and isrc:
                # Retry search by title + artist
                search_query = f"{artists} {title}"
                yt_search_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(search_query)}"
                yt_response = requests.get(yt_search_url, headers=yt_headers, timeout=10)
    
                video_ids = re.findall(r'"videoId":"([^"]+)"', yt_response.text)
                videos = []
                seen = set()
                for vid in video_ids:
                    if vid not in seen and len(videos) < 10:
                        videos.append(vid)
                        seen.add(vid)

                video_titles = []
                for video_id in videos:
                    video_pos = yt_response.text.find(f'"videoId":"{video_id}"')
                    if video_pos == -1:
                        continue
                    search_window = yt_response.text[video_pos:video_pos + 2000]
                    title_pattern = r'"title":{"runs":\[{"text":"([^"]+)"}'
                    title_match = re.search(title_pattern, search_window)
                    if title_match:
                        video_title = title_match.group(1)
                        video_title_normalized = normalize_text(video_title)
                        video_titles.append((video_id, video_title, video_title_normalized))
                        if normalize_text(title) in video_title_normalized or video_title_normalized in normalize_text(title):
                            best_video = video_id
                            break

                # fallback by artist again
                if not best_video and artists:
                    artist_list = [normalize_text(a.strip()) for a in artists.split(',')]
                    for artist_name in artist_list:
                        for video_id, video_title, video_title_normalized in video_titles:
                            if artist_name in video_title_normalized:
                                best_video = video_id
                                break
                        if best_video:
                            break
            
            if best_video:
                youtube_links.append({"url": f"https://www.youtube.com/watch?v={best_video}", "position": 1})
                # Try maxresdefault first, fallback to hqdefault if not available
                max_res_url = f"https://img.youtube.com/vi/{best_video}/maxresdefault.jpg"
                try:
                    img_check = requests.head(max_res_url, timeout=3)
                    if img_check.status_code == 200 and int(img_check.headers.get('content-length', 0)) > 5000:
                        thumbnail_url = max_res_url
                    else:
                        thumbnail_url = f"https://img.youtube.com/vi/{best_video}/hqdefault.jpg"
                except:
                    thumbnail_url = f"https://img.youtube.com/vi/{best_video}/hqdefault.jpg"
                cache_bust = int(time.time() * 1000)
                local_poster = download_image(thumbnail_url, f"posters/musicbrainz_{recording_id}_{cache_bust}.jpg")
                local_banner = download_image(thumbnail_url, f"banners/musicbrainz_{recording_id}_{cache_bust}.jpg")
            else:
                print(f"[SAVE] No match found, saving without YouTube link")
    except Exception as e:
        print(f"[SAVE] YouTube search error: {str(e)}")
        pass
    
    # Get release date
    release_date = None
    releases = recording_data.get("releases", [])
    if releases:
        first_release = releases[0]
        release_date_str = first_release.get("date", "")
        
        # Format release date
        if release_date_str:
            try:
                if len(release_date_str) >= 10:
                    parsed_date = datetime.datetime.strptime(release_date_str[:10], "%Y-%m-%d")
                    release_date = parsed_date.strftime("%Y-%m-%d")
                elif len(release_date_str) >= 4:
                    release_date = f"{release_date_str[:4]}-01-01"
            except ValueError:
                pass
    
    # Save to database
    MediaItem.objects.create(
        title=title,
        media_type="music",
        source="musicbrainz",
        source_id=recording_id,
        cover_url=local_poster,
        banner_url=local_banner if 'local_banner' in locals() else "",
        overview=overview,
        release_date=release_date,
        cast=cast_data,
        seasons=None,
        related_titles=[],
        screenshots=youtube_links,
    )
    
    return JsonResponse({"success": True, "message": "Song added to list"})


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

    return JsonResponse({"results": results})


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

    return JsonResponse({"results": results})

# Movie and show details

@ensure_csrf_cookie
@require_GET
def tmdb_detail(request, media_type, tmdb_id):
    if media_type not in ("movie", "tv"):
        return JsonResponse({"error": "Invalid media type."}, status=400)

    item = None
    try:
        item = MediaItem.objects.get(source="tmdb", source_id=tmdb_id, media_type=media_type)

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
                "id": member.get("id"),
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

        # Get theme mode
        AppSettings = apps.get_model('core', 'AppSettings')
        settings = AppSettings.objects.first()
        theme_mode = settings.theme_mode if settings else 'dark'

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
            "genres": [],
            "cast": cast_data,
            "recommendations": [],
            "seasons": seasons,
            'page_type': media_type,
            "theme_mode": theme_mode,
        })

    except MediaItem.DoesNotExist:
        pass  # Fall through to live fetch

    # Fallback to TMDB API
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "TMDB API key not found."}, status=500)

    url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}"
    if media_type == "tv":
        params = {"api_key": api_key, "append_to_response": "aggregate_credits,recommendations"}
    else:
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
    if media_type == "tv":
        cast_list = data.get("aggregate_credits", {}).get("cast", [])[:8]
    else:
        cast_list = data.get("credits", {}).get("cast", [])[:8]
    
    for i, actor in enumerate(cast_list):
        if media_type == "tv":
            character_name = actor.get("roles", [{}])[0].get("character") if actor.get("roles") else ""
        else:
            character_name = actor.get("character")
        
        profile_url = f"https://image.tmdb.org/t/p/w185{actor.get('profile_path')}" if actor.get("profile_path") else ""
        cast_data.append({
            "name": actor.get("name"),
            "character": character_name,
            "profile_path": profile_url,
            "is_full_url": True,  # Because it's a complete URL
            "id": actor.get("id"),
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

    # Get theme mode
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else 'dark'

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
        "theme_mode": theme_mode,
    })

def save_tmdb_item(media_type, tmdb_id):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
        url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}"
        if media_type == "tv":
            params = {"api_key": api_key, "append_to_response": "aggregate_credits"}
        else:
            params = {"api_key": api_key, "append_to_response": "credits"}
        response = requests.get(url, params=params)

        if response.status_code != 200:
            return JsonResponse({"error": "Failed to fetch TMDB details."})

        data = response.json()

        # Poster and banner
        poster_url = f"https://image.tmdb.org/t/p/w500{data.get('poster_path')}" if data.get("poster_path") else ""
        banner_url = f"https://image.tmdb.org/t/p/original{data.get('backdrop_path')}" if data.get("backdrop_path") else ""

        cache_bust = int(time.time() * 1000)
        local_poster = download_image(poster_url, f"posters/tmdb_{media_type}_{tmdb_id}_{cache_bust}.jpg") if poster_url else ""
        local_banner = download_image(banner_url, f"banners/tmdb_{media_type}_{tmdb_id}_{cache_bust}.jpg") if banner_url else ""

        # Cast
        cast_data = []
        if media_type == "tv":
            cast_list = data.get("aggregate_credits", {}).get("cast", [])[:8]
        else:
            cast_list = data.get("credits", {}).get("cast", [])[:8]
        
        for actor in cast_list:
            if media_type == "tv":
                character_name = actor.get("roles", [{}])[0].get("character") if actor.get("roles") else ""
            else:
                character_name = actor.get("character")
            
            actor_id = actor.get("id", "unknown")
            profile_url = f"https://image.tmdb.org/t/p/w185{actor.get('profile_path')}" if actor.get("profile_path") else ""
            local_profile = ""
            if profile_url:
                # Use actor ID instead of index to prevent mismatches
                filename = f"cast/tmdb_{media_type}_{tmdb_id}_{actor_id}.jpg"
                local_profile = download_image(profile_url, filename)
            
            cast_data.append({
                "name": actor.get("name"),
                "character": character_name,
                "profile_path": local_profile,
                "id": actor_id,
            })

        # Seasons (only for TV shows)
        seasons = []
        if media_type == "tv":
            for i, season in enumerate(data.get("seasons", [])):
                season_poster_url = f"https://image.tmdb.org/t/p/w300{season.get('poster_path')}" if season.get("poster_path") else ""
                local_season_poster = download_image(season_poster_url, f"seasons/tmdb_tv_{tmdb_id}_s{i}.jpg") if season_poster_url else ""

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
def tmdb_season_detail(request, tmdb_id, season_number):
    # Check if season already exists in database
    season_source_id = f"{tmdb_id}_s{season_number}"
    item = None
    try:
        item = MediaItem.objects.get(source="tmdb", source_id=season_source_id, media_type="tv")
        
        # Format episode data for display
        episodes = item.episodes or []
        for episode in episodes:
            if episode.get('air_date'):
                try:
                    parsed_date = datetime.datetime.strptime(episode['air_date'], "%Y-%m-%d")
                    episode['formatted_air_date'] = parsed_date.strftime("%d %B %Y")
                except ValueError:
                    episode['formatted_air_date'] = episode['air_date']
        
        # Handle cast
        cast_data = []
        for member in item.cast or []:
            profile = member.get("profile_path")
            is_full_url = profile.startswith("http") or profile.startswith("/media/") if profile else False
            cast_data.append({
                "name": member.get("name"),
                "character": member.get("character"),
                "profile_path": profile,
                "is_full_url": is_full_url,
                "id": member.get("id"),
            })
        
        # Format release date from DB
        raw_date = item.release_date or ""
        formatted_release_date = ""
        try:
            if raw_date:
                parsed_date = datetime.datetime.strptime(raw_date, "%Y-%m-%d")
                formatted_release_date = parsed_date.strftime("%d %B %Y")
        except ValueError:
            formatted_release_date = raw_date
        
        # Get navigation data from main show
        try:
            main_show = MediaItem.objects.get(source="tmdb", source_id=tmdb_id, media_type="tv")
            all_seasons = main_show.seasons or []
            season_nav = get_season_navigation(all_seasons, int(season_number))
        except MediaItem.DoesNotExist:
            # Fallback: fetch seasons from TMDB API
            try:
                api_key = APIKey.objects.get(name="tmdb").key_1
                show_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}"
                show_params = {"api_key": api_key}
                show_response = requests.get(show_url, params=show_params)
                if show_response.status_code == 200:
                    show_data = show_response.json()
                    all_seasons = show_data.get('seasons', [])
                    season_nav = get_season_navigation(all_seasons, int(season_number))
                else:
                    season_nav = {}
            except (APIKey.DoesNotExist, Exception):
                season_nav = {}
        
        # Get theme mode
        AppSettings = apps.get_model('core', 'AppSettings')
        settings = AppSettings.objects.first()
        theme_mode = settings.theme_mode if settings else 'dark'

        return render(request, "core/season_detail.html", {
            "item": item,
            "item_id": item.id,
            "source": "tmdb",
            "source_id": season_source_id,
            "tmdb_id": tmdb_id,
            "season_number": season_number,
            "in_my_list": True,
            "media_type": "tv",
            "title": item.title,
            "overview": item.overview,
            "banner_url": item.banner_url,
            "poster_url": item.cover_url,
            "release_date": formatted_release_date,
            "cast": cast_data,
            "episodes": episodes,
            "page_type": "tv",
            "season_nav": season_nav,
            "theme_mode": theme_mode,
        })
    except MediaItem.DoesNotExist:
        pass
    
    # Fetch from TMDB API
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
    except APIKey.DoesNotExist:
        return JsonResponse({"error": "TMDB API key not found."}, status=500)
    
    # Get season details
    season_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{season_number}"
    season_params = {"api_key": api_key, "append_to_response": "aggregate_credits"}
    season_response = requests.get(season_url, params=season_params)
    
    if season_response.status_code != 200:
        return JsonResponse({"error": "Failed to fetch season details from TMDB."}, status=500)
    
    season_data = season_response.json()
    
    # Get main show details for context
    show_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}"
    show_params = {"api_key": api_key}
    show_response = requests.get(show_url, params=show_params)
    show_data = show_response.json() if show_response.status_code == 200 else {}
    
    # Format data
    poster_url = f"https://image.tmdb.org/t/p/w500{season_data.get('poster_path')}" if season_data.get('poster_path') else None
    banner_url = f"https://image.tmdb.org/t/p/original{show_data.get('backdrop_path')}" if show_data.get('backdrop_path') else None
    
    # Cast data
    cast_data = []
    for actor in season_data.get("aggregate_credits", {}).get("cast", [])[:8]:
        character_name = actor.get("roles", [{}])[0].get("character") if actor.get("roles") else ""
        profile_url = f"https://image.tmdb.org/t/p/w185{actor.get('profile_path')}" if actor.get('profile_path') else ""
        cast_data.append({
            "name": actor.get("name"),
            "character": character_name,
            "profile_path": profile_url,
            "is_full_url": True,
            "id": actor.get("id"),
        })
    
    # Episodes data
    episodes = []
    for episode in season_data.get("episodes", []):
        air_date = episode.get("air_date", "")
        formatted_air_date = ""
        if air_date:
            try:
                parsed_date = datetime.datetime.strptime(air_date, "%Y-%m-%d")
                formatted_air_date = parsed_date.strftime("%d %B %Y")
            except ValueError:
                formatted_air_date = air_date
        
        episodes.append({
            "episode_number": episode.get("episode_number"),
            "name": episode.get("name"),
            "overview": episode.get("overview", ""),
            "air_date": air_date,
            "formatted_air_date": formatted_air_date,
            "still_path": f"https://image.tmdb.org/t/p/w1280{episode.get('still_path')}" if episode.get('still_path') else None,
        })
    
    # Format release date
    raw_date = season_data.get("air_date", "")
    formatted_release_date = ""
    if raw_date:
        try:
            parsed_date = datetime.datetime.strptime(raw_date, "%Y-%m-%d")
            formatted_release_date = parsed_date.strftime("%d %B %Y")
        except ValueError:
            formatted_release_date = raw_date
    
    season_title = f"{show_data.get('name', 'Unknown Show')} {season_data.get('name', f'Season {season_number}')}"
    
    # Get season navigation data
    all_seasons = show_data.get('seasons', [])
    season_nav = get_season_navigation(all_seasons, int(season_number))
    
    # Get theme mode
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else 'dark'

    return render(request, "core/season_detail.html", {
        "item": None,
        "item_id": None,
        "source": "tmdb",
        "source_id": season_source_id,
        "tmdb_id": tmdb_id,
        "season_number": season_number,
        "in_my_list": False,
        "media_type": "tv",
        "title": season_title,
        "overview": season_data.get("overview", ""),
        "banner_url": banner_url,
        "poster_url": poster_url,
        "release_date": formatted_release_date,
        "cast": cast_data,
        "episodes": episodes,
        "page_type": "tv",
        "season_nav": season_nav,
        "theme_mode": theme_mode,
    })


def save_tmdb_season(tmdb_id, season_number):
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
        
        # Get season details
        season_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{season_number}"
        season_params = {"api_key": api_key, "append_to_response": "aggregate_credits"}
        season_response = requests.get(season_url, params=season_params)
        
        if season_response.status_code != 200:
            return JsonResponse({"error": "Failed to fetch season details."})
        
        season_data = season_response.json()
        
        # Get main show details
        show_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}"
        show_params = {"api_key": api_key}
        show_response = requests.get(show_url, params=show_params)
        show_data = show_response.json() if show_response.status_code == 200 else {}
        
        # Download images
        poster_url = f"https://image.tmdb.org/t/p/w500{season_data.get('poster_path')}" if season_data.get('poster_path') else ""
        banner_url = f"https://image.tmdb.org/t/p/original{show_data.get('backdrop_path')}" if show_data.get('backdrop_path') else ""
        
        season_source_id = f"{tmdb_id}_s{season_number}"
        cache_bust = int(time.time() * 1000)
        local_poster = download_image(poster_url, f"posters/tmdb_tv_{season_source_id}_{cache_bust}.jpg") if poster_url else ""
        local_banner = download_image(banner_url, f"banners/tmdb_tv_{season_source_id}_{cache_bust}.jpg") if banner_url else ""
        
        # Cast data
        cast_data = []
        for actor in season_data.get("aggregate_credits", {}).get("cast", [])[:8]:
            character_name = actor.get("roles", [{}])[0].get("character") if actor.get("roles") else ""
            actor_id = actor.get("id", "unknown")
            profile_url = f"https://image.tmdb.org/t/p/w185{actor.get('profile_path')}" if actor.get('profile_path') else ""
            local_profile = ""
            if profile_url:
                # Use actor ID instead of index to prevent mismatches
                filename = f"cast/tmdb_{season_source_id}_{actor_id}.jpg"
                local_profile = download_image(profile_url, filename)
            
            cast_data.append({
                "name": actor.get("name"),
                "character": character_name,
                "profile_path": local_profile,
                "id": actor_id,
            })
        
        # Episodes data
        episodes_data = []
        for episode in season_data.get("episodes", []):
            still_url = f"https://image.tmdb.org/t/p/w1280{episode.get('still_path')}" if episode.get('still_path') else ""
            local_still = download_image(still_url, f"episodes/tmdb_{season_source_id}_e{episode.get('episode_number', 0)}.jpg") if still_url else ""
            
            episodes_data.append({
                "episode_number": episode.get("episode_number"),
                "name": episode.get("name"),
                "overview": episode.get("overview", ""),
                "air_date": episode.get("air_date", ""),
                "still_path": local_still,
            })
        
        season_title = f"{show_data.get('name', 'Unknown Show')} {season_data.get('name', f'Season {season_number}')}"
        
        MediaItem.objects.create(
            title=season_title,
            media_type="tv",
            source="tmdb",
            source_id=season_source_id,
            cover_url=local_poster,
            banner_url=local_banner,
            overview=season_data.get("overview", ""),
            release_date=season_data.get("air_date", ""),
            cast=cast_data,
            episodes=episodes_data,
            total_main=len(episodes_data),
            total_secondary=1,
        )
        
        return JsonResponse({"message": "Season added to your list."})
    
    except Exception as e:
        return JsonResponse({"error": f"Failed to save season: {str(e)}"})


@ensure_csrf_cookie
@require_POST
def add_season_to_list(request):
    try:
        data = json.loads(request.body)
        tmdb_id = data.get('tmdb_id')
        season_number = data.get('season_number')
        
        if not tmdb_id or season_number is None:
            return JsonResponse({"error": "Missing tmdb_id or season_number"}, status=400)
        
        return save_tmdb_season(tmdb_id, season_number)
    
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


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
        item = MediaItem.objects.get(source="mal", source_id=mal_id, media_type=media_type)
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
                "id": member.get("id"),
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

    # Get theme mode
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else 'dark'

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
        "theme_mode": theme_mode,
    }

    return render(request, "core/detail.html", context)

def save_mal_item(media_type, mal_id):
    try:
        anilist_data = fetch_anilist_data(mal_id, media_type)

        cache_bust = int(time.time() * 1000)
        # --- Download images
        local_poster = download_image(
            anilist_data["poster_url"], f"posters/mal_{media_type}_{mal_id}_{cache_bust}.jpg"
        ) if anilist_data["poster_url"] else ""

        local_banner = download_image(
            anilist_data["banner_url"], f"banners/mal_{media_type}_{mal_id}_{cache_bust}.jpg"
        ) if anilist_data["banner_url"] else ""

        cast = []
        for member in anilist_data["cast"][:8]:
            profile_url = member.get("profile_path")
            character_id = member.get("id", "unknown")
            local_path = ""
            if profile_url:
                # Use character ID instead of index to prevent mismatches
                filename = f"cast/mal_{media_type}_{mal_id}_{character_id}.jpg"
                local_path = download_image(profile_url, filename)
            
            cast.append({
                "name": member["name"],
                "character": member["character"],
                "profile_path": local_path,
                "id": character_id,
            })

        related_titles = []
        for related in anilist_data["related_titles"]:
            r_id = related["mal_id"]
            poster_path = related["poster_path"]
            local_related_poster = download_image(poster_path, f"related/mal_{media_type}_{r_id}.jpg") if poster_path else ""

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

        # Get theme mode
        AppSettings = apps.get_model('core', 'AppSettings')
        settings = AppSettings.objects.first()
        theme_mode = settings.theme_mode if settings else 'dark'

        return render(request, "core/detail.html", {
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

    # Get theme mode
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else 'dark'

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
        "genres": [],
        "cast": [{"name": name, "character": ""} for name in author_names],
        "recommendations": recommendations,
        "seasons": None,
        "page_type": "book",
        "theme_mode": theme_mode,
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
    
    cache_bust = int(time.time() * 1000)
    local_poster = download_image(poster_url, f"posters/openlib_{work_id}_{cache_bust}.jpg") if poster_url else ""

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
    query = f'fields screenshots.url; where id = {igdb_id};'
    try:
        response = requests.post("https://api.igdb.com/v4/games", headers=headers, data=query)
        if response.status_code == 200:
            data = response.json()
            if data and "screenshots" in data[0]:
                screenshots = []
                for ss in data[0]["screenshots"]:
                    if ss and "url" in ss:
                        url = "https:" + ss["url"].replace("t_thumb", "t_1080p")
                        screenshots.append({
                            "url": url,
                            "is_full_url": True
                        })
                return screenshots
    except:
        pass
    return []

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

        # Slice screenshots for initial load
        total_screenshots = len(screenshots)
        initial_screenshots = screenshots[:40]

        # Get theme mode
        AppSettings = apps.get_model('core', 'AppSettings')
        settings = AppSettings.objects.first()
        theme_mode = settings.theme_mode if settings else 'dark'

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
            "screenshots": initial_screenshots,
            "total_screenshots": total_screenshots,
            "in_my_list": True,
            'page_type': "game",
            "theme_mode": theme_mode,
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
        poster_url = "https:" + game["cover"]["url"].replace("t_thumb", "t_cover_big_2x")

    screenshots = []
    for ss in game.get("screenshots", []):
        if ss and "url" in ss:
            url = "https:" + ss["url"].replace("t_thumb", "t_1080p")
            screenshots.append({
                "url": url,
                "is_full_url": True
            })
    
    banner_url = None

    if "artworks" in game and game["artworks"]:
        first_artwork = game["artworks"][0]
        if first_artwork and "url" in first_artwork:
            banner_url = "https:" + first_artwork["url"].replace("t_thumb", "t_1080p")

    #Fallback to screenshot if no artwork is present
    if not banner_url and screenshots:
        banner_url = "https:" + screenshots[0]["url"].replace("t_thumb", "t_1080p")
        screenshots = screenshots[1:] if len(screenshots) > 1 else []

    # Slice screenshots for initial load
    total_screenshots = len(screenshots)
    initial_screenshots = screenshots[:40]

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

    # Get theme mode
    AppSettings = apps.get_model('core', 'AppSettings')
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else 'dark'

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
        "screenshots": initial_screenshots,
        "total_screenshots": total_screenshots,
        "genres": genres,
        "platforms": platforms,
        "in_my_list": False,
        'page_type': "game",
        "theme_mode": theme_mode,
    }

    return render(request, "core/detail.html", context)

@require_GET
def game_screenshots_api(request):
    igdb_id = request.GET.get('igdb_id')
    page = int(request.GET.get('page', 1))
    page_size = 40
    
    if not igdb_id:
        return JsonResponse({'error': 'Missing igdb_id'}, status=400)
        
    all_screenshots = get_game_screenshots_data(igdb_id)
    
    start = (page - 1) * page_size
    end = start + page_size
    items = all_screenshots[start:end]
    
    return JsonResponse({
        'screenshots': items,
        'has_more': end < len(all_screenshots),
        'page': page
    })


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
      first_release_date, screenshots.url, artworks.url;
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
    cache_bust = int(time.time() * 1000)
    poster_url = None
    if "cover" in game and game["cover"]:
        poster_url = "https:" + game["cover"]["url"].replace("t_thumb", "t_cover_big_2x")
    local_poster = download_image(poster_url, f"posters/igdb_{igdb_id}_{cache_bust}.jpg") if poster_url else ""

    # Strip media/ prefix
    if local_poster.startswith("media/"):
        local_poster = local_poster[len("media/"):]

    # Get artworks and screenshots
    artworks = game.get("artworks", [])
    screenshots = game.get("screenshots", [])

    banner_url = None

    # 1. Try artwork banner first
    if artworks:
        first_art = artworks[0]
        if first_art and "url" in first_art:
            banner_url = "https:" + first_art["url"].replace("t_thumb", "t_4k")

    # 2. Fallback: banner from first screenshot
    used_screenshot_for_banner = False
    if not banner_url and screenshots:
        banner_raw = screenshots[0].get("url")
        if banner_raw:
            banner_url = "https:" + banner_raw.replace("t_thumb", "t_1080p")
            used_screenshot_for_banner = True

    # Save banner  
    local_banner = download_image(banner_url, f"banners/igdb_{igdb_id}_{cache_bust}.jpg") if banner_url else ""
    if local_banner.startswith("media/"):
        local_banner = local_banner[len("media/"):]

    # 3. Save screenshots
    local_screenshots = []

    # If screenshot was used as banner → skip the first screenshot
    start_index = 1 if used_screenshot_for_banner else 0

    for i, ss in enumerate(screenshots[start_index:], start=start_index):
        if ss and "url" in ss:
            url = "https:" + ss["url"].replace("t_thumb", "t_1080p")
            local_path = download_image(url, f"screenshots/igdb_{igdb_id}_{i}_{cache_bust}.jpg")
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

# Delete, Swap, Add actions
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

    action = request.headers.get("X-Action", "replace")  # default to replace

    def generate_unique_filename(index, ext):
        timestamp = int(time.time() * 1000)
        return f"screenshots/igdb_{igdb_id}_{index}_{timestamp}{ext}"

    # DELETE action
    if action == "delete":
        screenshot_url = request.POST.get("screenshot_url")
        if not screenshot_url:
            return JsonResponse({"success": False, "message": "Missing screenshot_url."}, status=400)

        screenshots = media_item.screenshots or []
        new_screenshots = [s for s in screenshots if s.get("url") != screenshot_url]

        # Remove actual file from disk
        filename = screenshot_url.replace("/media/", "")
        file_path = os.path.join(settings.MEDIA_ROOT, filename)
        if os.path.exists(file_path):
            os.remove(file_path)

        media_item.screenshots = new_screenshots
        media_item.save()
        return JsonResponse({"success": True, "message": "Screenshot deleted.", "screenshots": new_screenshots})

    # ADD / REPLACE actions
    files = request.FILES.getlist("screenshots[]")
    if not files:
        return JsonResponse({"success": False, "message": "No files uploaded."}, status=400)

    if action == "replace":
        # Remove old screenshots from disk
        pattern = os.path.join(settings.MEDIA_ROOT, f"screenshots/igdb_{igdb_id}_*.*")
        for path in glob.glob(pattern):
            os.remove(path)
        start_index = 1
        old_screenshots = []

    elif action == "add":
        old_screenshots = media_item.screenshots or []
        
        # Find the highest index in existing screenshots to avoid collisions
        max_index = 0
        prefix = f"igdb_{igdb_id}_"
        
        for s in old_screenshots:
            try:
                url = s.get("url", "")
                filename = url.split('/')[-1]
                if filename.startswith(prefix):
                    # Format: igdb_{id}_{index}_{timestamp}.ext OR igdb_{id}_{index}.ext
                    suffix = filename[len(prefix):]
                    name_body = os.path.splitext(suffix)[0]
                    parts = name_body.split('_')
                    if len(parts) >= 1 and parts[0].isdigit():
                        idx = int(parts[0])
                        if idx > max_index:
                            max_index = idx
            except (ValueError, IndexError, AttributeError):
                continue
        
        start_index = max_index + 1

    else:
        return JsonResponse({"success": False, "message": "Invalid action."}, status=400)

    new_screenshots = list(old_screenshots)
    for i, file in enumerate(files, start=start_index):
        ext = os.path.splitext(file.name)[1].lower()
        if ext not in [".jpg", ".jpeg", ".png"]:
            continue
        filename = generate_unique_filename(i, ext)
        default_storage.save(filename, file)
        url = f"/media/{filename}"
        new_screenshots.append({"url": url, "is_full_url": False})

    media_item.screenshots = new_screenshots
    media_item.save()

    return JsonResponse({"success": True, "message": "Screenshots updated.", "screenshots": new_screenshots})

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
    if MediaItem.objects.filter(source=source, source_id=source_id, media_type=media_type).exists():
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
    
    if source == "musicbrainz":
        return save_musicbrainz_item(source_id)

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

            # --- Handle date_added ---
            status_changed = new_status != old_status
            user_date = data.get("date_added")
            
            if user_date:
                try:
                    year, month, day = map(int, user_date.split("-"))
                    user_date_obj = datetime.date(year, month, day)
                    current_date = item.date_added.date() if item.date_added else None
                    
                    if current_date and current_date != user_date_obj:
                        # User changed date - set to current time on that date
                        now = dt.datetime.now()
                        item.date_added = dt.datetime.combine(user_date_obj, now.time())
                    elif status_changed:
                        item.date_added = dt.datetime.now()
                except Exception:
                    if status_changed:
                        item.date_added = dt.datetime.now()
            elif status_changed:
                item.date_added = dt.datetime.now()

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

            # Build a minimal serialized item to return to the client for UI updates
            AppSettings = apps.get_model('core', 'AppSettings')
            try:
                settings = AppSettings.objects.first()
                rating_mode = settings.rating_mode if settings else 'faces'
            except Exception:
                rating_mode = 'faces'

            display_rating = rating_to_display(item.personal_rating, rating_mode)

            return JsonResponse({
                "success": True,
                "item": {
                    "id": item.id,
                    "title": item.title,
                    "media_type": item.media_type,
                    "source_id": item.source_id,
                    "status": item.status,
                    "personal_rating": display_rating,
                    "notes": item.notes,
                    "progress_main": item.progress_main if item.progress_main else None,
                    "total_main": item.total_main,
                    "progress_secondary": item.progress_secondary,
                    "total_secondary": item.total_secondary,
                    "favorite": item.favorite,
                    "repeats": item.repeats or 0,
                    "date_added": item.date_added.isoformat() if item.date_added else None,
                    "cover_url": getattr(item, 'cover_url', None),
                    "banner_url": getattr(item, 'banner_url', None),
                }
            })

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

        # Skip cast processing for music (different structure)
        if item.media_type != 'music':
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

        for episode in item.episodes or []:
            p = episode.get("still_path", "")
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
        # Skip API calls for season entries (source_id contains '_s')
        if item.source == "tmdb" and item.media_type == "tv" and "_s" not in item.source_id:
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
                "title": item.title,
                "media_type": item.media_type,
                "source_id": item.source_id,
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

# Global dictionary to store backup tasks (in-memory for simplicity)
BACKUP_TASKS = {}

class BackupTask(threading.Thread):
    def __init__(self, task_id, task_type, upload_path=None):
        super().__init__()
        self.task_id = task_id
        self.task_type = task_type
        self.upload_path = upload_path
        self.progress = 0
        self.status = 'pending'  # pending, running, completed, error, cancelled
        self.message = 'Initializing...'
        self.details = ''
        self.result_path = None
        self.error = None
        self._cancel_event = threading.Event()
        self.daemon = True
        self.created_at = time.time()
        self.start_processing_time = None

    def cancel(self):
        self._cancel_event.set()
        self.status = 'cancelled'
        self.message = 'Cancelling...'

    def run(self):
        self.status = 'running'
        self.start_processing_time = time.time()
        try:
            if self.task_type == 'export':
                self.do_export()
            elif self.task_type == 'import':
                self.do_import()
        except Exception as e:
            self.status = 'error'
            self.error = str(e)
            logger.error(f"Backup task error: {e}")
        finally:
            # Cleanup upload file if import
            if self.upload_path and os.path.exists(self.upload_path):
                try:
                    os.remove(self.upload_path)
                except:
                    pass
            
            if self.status == 'running':
                self.status = 'completed'
                self.progress = 100
                self.message = 'Done!'
            elif self.status == 'cancelled':
                self.message = 'Cancelled.'
                # Cleanup result if export cancelled
                if self.result_path and os.path.exists(self.result_path):
                    try:
                        os.remove(self.result_path)
                    except:
                        pass

    def update_progress(self, processed, total, message):
        self.progress = int((processed / total) * 100)
        self.message = message
        
        if self.start_processing_time:
            elapsed = time.time() - self.start_processing_time
            if elapsed > 0 and processed > 0:
                rate = processed / elapsed
                remaining_items = total - processed
                seconds_left = int(remaining_items / rate)
                
                if seconds_left < 60:
                    time_str = f"{seconds_left} sec left"
                else:
                    time_str = f"{seconds_left // 60} min {seconds_left % 60} sec left"
                
                self.details = f"{processed}/{total} ({time_str})"
            else:
                self.details = f"{processed}/{total}"

    def do_export(self):
        self.message = 'Gathering database data'
        
        # 1. Serialize Data (Include all relevant models)
        models_to_backup = [
            MediaItem.objects.all(),
            FavoritePerson.objects.all(),
            APIKey.objects.all(),
            NavItem.objects.all(),
            AppSettings.objects.all()
        ]
        
        all_objects = []
        for qs in models_to_backup:
            all_objects.extend(list(qs))
            
        json_data = serialize("json", all_objects)
        
        if self._cancel_event.is_set(): return

        # 2. Prepare Zip
        self.message = 'Scanning files'
        temp_dir = tempfile.gettempdir()
        zip_filename = f"media_journal_backup_{uuid.uuid4().hex}.zip"
        zip_path = os.path.join(temp_dir, zip_filename)
        self.result_path = zip_path

        media_root = settings.MEDIA_ROOT
        files_to_zip = []
        
        # Folders to include
        include_folders = ["posters", "banners", "cast", "related", "screenshots", "seasons", "episodes", "favorites"]
        
        for folder in include_folders:
            folder_path = os.path.join(media_root, folder)
            if os.path.exists(folder_path):
                for root, dirs, files in os.walk(folder_path):
                    for file in files:
                        abs_path = os.path.join(root, file)
                        rel_path = os.path.relpath(abs_path, media_root)
                        files_to_zip.append((abs_path, rel_path))
        
        total_items = len(files_to_zip) + 1 # +1 for json
        processed = 0
        
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_STORED) as zipf:
            # Write JSON
            zipf.writestr("backup_data.json", json_data)
            
            processed += 1
            self.update_progress(processed, total_items, 'Archiving')
            
            # Write Files directly (efficient)
            for abs_path, rel_path in files_to_zip:
                if self._cancel_event.is_set():
                    return
                
                try:
                    zipf.write(abs_path, arcname=rel_path)
                except Exception as e:
                    logger.warning(f"Could not zip {abs_path}: {e}")
                
                processed += 1
                if processed % 100 == 0: # Update progress periodically
                    self.update_progress(processed, total_items, 'Archiving')

    def do_import(self):
        self.message = 'Reading backup file'
        if not self.upload_path or not os.path.exists(self.upload_path):
            raise Exception("Upload file not found")

        with zipfile.ZipFile(self.upload_path, 'r') as zipf:
            all_files = zipf.namelist()
            
            # 1. Restore DB
            json_filename = "backup_data.json"
            if "media_items.json" in all_files and json_filename not in all_files:
                json_filename = "media_items.json" # Legacy support
            
            # Initialize variables to avoid UnboundLocalError
            files_to_extract = [f for f in all_files if not f.endswith('.json')]
            processed = 0
            total_items = len(files_to_extract)

            if json_filename in all_files:
                self.message = 'Restoring database'
                json_data = zipf.read(json_filename)
                
                # Deserialize to list first to get count for progress
                objects = list(deserialize("json", json_data))
                del json_data # Free memory: Raw JSON bytes no longer needed
                total_items += len(objects)
                
                if total_items == 0: total_items = 1 # Avoid division by zero
                
                for deserialized_object in objects:
                    if self._cancel_event.is_set(): return
                    obj = deserialized_object.object
                    
                    try:
                        # Smart Merge Logic
                        if isinstance(obj, MediaItem):
                            MediaItem.objects.update_or_create(
                                source=obj.source,
                                source_id=obj.source_id,
                                media_type=obj.media_type,
                                defaults={field.name: getattr(obj, field.name) for field in MediaItem._meta.fields if field.name != 'id'}
                            )
                        elif isinstance(obj, FavoritePerson):
                            # Try to find existing by name and type to avoid duplicates
                            existing = FavoritePerson.objects.filter(name=obj.name, type=obj.type).first()
                            if existing:
                                for field in FavoritePerson._meta.fields:
                                    if field.name != 'id':
                                        setattr(existing, field.name, getattr(obj, field.name))
                                existing.save()
                            else:
                                obj.save()
                        elif isinstance(obj, APIKey):
                            APIKey.objects.update_or_create(
                                name=obj.name,
                                defaults={'key_1': obj.key_1, 'key_2': obj.key_2}
                            )
                        elif isinstance(obj, NavItem):
                            NavItem.objects.update_or_create(
                                name=obj.name,
                                defaults={'visible': obj.visible, 'position': obj.position}
                            )
                        elif isinstance(obj, AppSettings):
                            if not AppSettings.objects.exists():
                                obj.save()
                            else:
                                current = AppSettings.objects.first()
                                for field in AppSettings._meta.fields:
                                    if field.name != 'id':
                                        setattr(current, field.name, getattr(obj, field.name))
                                current.save()
                        else:
                            obj.save()
                    except Exception as e:
                        logger.warning(f"Error restoring object {obj}: {e}")
                    
                    processed += 1
                    if processed % 100 == 0:
                        self.update_progress(processed, total_items, 'Restoring database')

            # 2. Restore Files
            self.message = 'Restoring media files'
            media_root = settings.MEDIA_ROOT
            
            if total_items == 0: total_items = 1
            
            for file_name in files_to_extract:
                if self._cancel_event.is_set(): return
                
                # Security check
                if '..' in file_name or file_name.startswith('/') or file_name.startswith('\\'):
                    continue
                
                # Extract
                target_path = os.path.join(media_root, file_name)
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                
                with open(target_path, "wb") as f:
                    f.write(zipf.read(file_name))
                
                processed += 1
                if processed % 100 == 0:
                    self.update_progress(processed, total_items, 'Restoring media files')

def cleanup_old_tasks():
    """Remove backup tasks older than 1 hour"""
    now = time.time()
    to_remove = []
    for tid, task in list(BACKUP_TASKS.items()):
        if now - task.created_at > 3600:  # 1 hour
            to_remove.append(tid)
            # Clean up files
            if task.result_path and os.path.exists(task.result_path):
                try:
                    os.remove(task.result_path)
                except:
                    pass
            if task.upload_path and os.path.exists(task.upload_path):
                try:
                    os.remove(task.upload_path)
                except:
                    pass
    
    for tid in to_remove:
        del BACKUP_TASKS[tid]

@ensure_csrf_cookie
@require_GET
def create_backup(request):
    cleanup_old_tasks()
    task_id = uuid.uuid4().hex
    task = BackupTask(task_id, 'export')
    BACKUP_TASKS[task_id] = task
    task.start()
    return JsonResponse({'task_id': task_id})

@ensure_csrf_cookie
@require_POST
def restore_backup(request):
    cleanup_old_tasks()
    uploaded_file = request.FILES.get("backup_file")
    if not uploaded_file:
        return JsonResponse({"error": "No file uploaded"}, status=400)

    # Save to temp file first
    temp_fd, temp_path = tempfile.mkstemp(suffix='.zip')
    os.close(temp_fd)
    
    with open(temp_path, 'wb') as f:
        for chunk in uploaded_file.chunks():
            f.write(chunk)
            
    task_id = uuid.uuid4().hex
    task = BackupTask(task_id, 'import', upload_path=temp_path)
    BACKUP_TASKS[task_id] = task
    task.start()
    
    return JsonResponse({'task_id': task_id})

@require_GET
def backup_status(request, task_id):
    task = BACKUP_TASKS.get(task_id)
    if not task:
        return JsonResponse({'error': 'Task not found'}, status=404)
    
    return JsonResponse({
        'status': task.status,
        'progress': task.progress,
        'message': task.message,
        'details': task.details,
        'error': task.error
    })

@require_GET
def backup_cancel(request, task_id):
    task = BACKUP_TASKS.get(task_id)
    if task:
        task.cancel()
    return JsonResponse({'success': True})

@require_GET
def backup_download(request, task_id):
    task = BACKUP_TASKS.get(task_id)
    if not task or task.status != 'completed' or not task.result_path:
        return HttpResponseBadRequest("Backup not ready or not found")
    
    return FileResponse(
        open(task.result_path, "rb"), 
        as_attachment=True, 
        filename=f"media_journal_backup_{datetime.datetime.now().strftime('%Y%m%d')}.zip"
    )

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
    

def fetch_actor_data(actor_id):
    """Fetch actor data from database or TMDB API"""
    try:
        # Check if actor exists in database
        actor = FavoritePerson.objects.get(person_id=str(actor_id), type='actor')
        # Ensure database stored media has the required fields
        related_media = actor.related_media or []
        for media in related_media:
            if 'url' not in media and media.get('id') and media.get('media_type'):
                media['url'] = f'/tmdb/{media["media_type"]}/{media["id"]}/'
            if 'type_display' not in media:
                media['type_display'] = 'Movie' if media.get('media_type') == 'movie' else 'TV Show'
            if 'formatted_date' not in media and media.get('release_date'):
                try:
                    parsed_date = datetime.datetime.strptime(media['release_date'], '%Y-%m-%d')
                    media['formatted_date'] = parsed_date.strftime('%b %Y')
                except ValueError:
                    media['formatted_date'] = media['release_date']
            if 'character' not in media:
                media['character'] = ''
        
        # Format dates
        formatted_birthday = ''
        if actor.birthday:
            try:
                parsed = datetime.datetime.strptime(actor.birthday, '%Y-%m-%d')
                formatted_birthday = parsed.strftime('%d %B %Y')
            except ValueError:
                formatted_birthday = actor.birthday
        
        formatted_deathday = ''
        if actor.deathday:
            try:
                parsed = datetime.datetime.strptime(actor.deathday, '%Y-%m-%d')
                formatted_deathday = parsed.strftime('%d %B %Y')
            except ValueError:
                formatted_deathday = actor.deathday
        
        return {
            'id': actor.person_id,
            'name': actor.name,
            'birthday': formatted_birthday,
            'deathday': formatted_deathday,
            'biography': actor.biography,
            'image': actor.image_url,
            'related_media': related_media
        }
    except FavoritePerson.DoesNotExist:
        pass
    
    # Fetch from TMDB API
    try:
        api_key = APIKey.objects.get(name="tmdb").key_1
        
        # Get person details
        person_url = f"https://api.themoviedb.org/3/person/{actor_id}"
        person_response = requests.get(person_url, params={'api_key': api_key})
        
        if person_response.status_code != 200:
            return None
            
        person_data = person_response.json()
        
        # Get combined credits
        credits_url = f"https://api.themoviedb.org/3/person/{actor_id}/combined_credits"
        credits_response = requests.get(credits_url, params={'api_key': api_key})
        
        related_media = []
        if credits_response.status_code == 200:
            credits_data = credits_response.json()
            for credit in credits_data.get('cast', []):  # Limit to 20 entries
                media_type = credit.get('media_type')
                if media_type in ['movie', 'tv']:
                    release_date = credit.get('release_date') or credit.get('first_air_date')
                    formatted_date = ''
                    if release_date:
                        try:
                            parsed_date = datetime.datetime.strptime(release_date, '%Y-%m-%d')
                            formatted_date = parsed_date.strftime('%b %Y')
                        except ValueError:
                            formatted_date = release_date
                    
                    related_media.append({
                        'id': credit.get('id'),
                        'title': credit.get('title') or credit.get('name'),
                        'media_type': media_type,
                        'type_display': 'Movie' if media_type == 'movie' else 'TV Show',
                        'release_date': release_date,
                        'formatted_date': formatted_date,
                        'poster_path': f"https://image.tmdb.org/t/p/original{credit.get('poster_path')}" if credit.get('poster_path') else None,
                        'character': credit.get('character') or '',
                        'url': f'/tmdb/{media_type}/{credit.get("id")}/'
                    })
            
            # Sort by release date (latest first)
            related_media.sort(key=lambda x: x.get('release_date') or '0000-00-00', reverse=True)
        
        # Format dates
        formatted_birthday = ''
        if person_data.get('birthday'):
            try:
                parsed = datetime.datetime.strptime(person_data.get('birthday'), '%Y-%m-%d')
                formatted_birthday = parsed.strftime('%d %B %Y')
            except ValueError:
                formatted_birthday = person_data.get('birthday')
        
        formatted_deathday = ''
        if person_data.get('deathday'):
            try:
                parsed = datetime.datetime.strptime(person_data.get('deathday'), '%Y-%m-%d')
                formatted_deathday = parsed.strftime('%d %B %Y')
            except ValueError:
                formatted_deathday = person_data.get('deathday')
        
        return {
            'id': str(person_data.get('id')),
            'name': person_data.get('name'),
            'birthday': formatted_birthday,
            'deathday': formatted_deathday,
            'biography': person_data.get('biography'),
            'image': f"https://image.tmdb.org/t/p/original{person_data.get('profile_path')}" if person_data.get('profile_path') else None,
            'related_media': related_media
        }
        
    except Exception as e:
        logger.error(f"Error fetching actor data for {actor_id}: {str(e)}")
        return None

def fetch_character_data(character_id):
    """Fetch character data from database or AniList API"""
    logger.info(f"fetch_character_data called with character_id: {character_id} (type: {type(character_id)})")
    
    if character_id is None:
        logger.error("character_id is None")
        return None
    
    # Debug: Print the exact value and type
    logger.info(f"DEBUG: character_id value = '{character_id}', type = {type(character_id)}, repr = {repr(character_id)}")
    
    # Convert to string and validate
    try:
        character_id_str = str(character_id)
        logger.info(f"DEBUG: character_id_str = '{character_id_str}'")
        if not character_id_str or character_id_str == 'None':
            logger.error(f"Invalid character_id: {character_id}")
            return None
    except Exception as e:
        logger.error(f"Error converting character_id to string: {character_id} - {str(e)}")
        return None
        
    try:
        # Check if character exists in database
        character = FavoritePerson.objects.get(person_id=character_id_str, type='character')
        # Ensure database stored media has the required fields
        media_appearances = character.media_appearances or []
        for media in media_appearances:
            if 'url' not in media:
                media_type = media.get('type', '').lower()
                if media_type in ['anime', 'manga'] and media.get('id'):
                    # For AniList data, we need to find the MAL ID or use AniList ID
                    media['url'] = f'/mal/{media_type}/{media.get("id")}/'
                else:
                    media['url'] = '#'
            if 'type_display' not in media:
                media['type_display'] = media.get('format') or media.get('type', '').title()
            if 'formatted_date' not in media and media.get('release_date'):
                try:
                    parsed_date = datetime.datetime.strptime(media['release_date'], '%Y-%m-%d')
                    media['formatted_date'] = parsed_date.strftime('%b %Y')
                except ValueError:
                    media['formatted_date'] = media['release_date']
        
        return {
            'id': character.person_id,
            'name': character.name,
            'image': character.image_url,
            'description': character.description,
            'age': character.age,
            'media_appearances': media_appearances,
            'voice_actors': character.voice_actors or []
        }
    except FavoritePerson.DoesNotExist:
        pass
    
    # Fetch from AniList API
    try:
        query = '''
        query ($id: Int) {
          Character(id: $id) {
            id
            name {
              full
            }
            image {
              large
            }
            description
            age
            media {
              edges {
                characterRole
                node {
                  id
                  idMal
                  title {
                    romaji
                    english
                  }
                  type
                  format
                  startDate {
                    year
                    month
                    day
                  }
                  coverImage {
                    large
                  }
                }
                voiceActors {
                  id
                  name {
                    full
                  }
                  language
                  image {
                    large
                  }
                }
              }
            }
          }
        }
        '''
        
        try:
            # Use the validated character_id_str and convert to int
            if not character_id_str or character_id_str == 'None':
                logger.error(f"Character ID is None or empty: {character_id}")
                return None
            character_id_int = int(character_id_str)
            if character_id_int <= 0:
                logger.error(f"Character ID must be positive: {character_id_int}")
                return None
            variables = {'id': character_id_int}
        except (ValueError, TypeError) as e:
            logger.error(f"Invalid character_id cannot be converted to int: {character_id} - {str(e)}")
            return None
        
        logger.info(f"Making AniList request for character {character_id} with variables: {variables}")
        
        response = requests.post(
            'https://graphql.anilist.co',
            json={'query': query, 'variables': variables},
            headers={'Content-Type': 'application/json'}
        )
        
        logger.info(f"AniList response status: {response.status_code}")
        
        if response.status_code != 200:
            logger.error(f"AniList API error for character {character_id}: {response.status_code} - {response.text}")
            return None
            
        data = response.json()
        logger.info(f"AniList response data: {data}")
        
        # Check for GraphQL errors
        if 'errors' in data:
            logger.error(f"GraphQL errors for character {character_id}: {data['errors']}")
            return None
            
        character_data = data.get('data', {}).get('Character')
        logger.info(f"Character data extracted: {character_data}")
        
        if not character_data:
            logger.error(f"No character data found for character {character_id}. Full response: {data}")
            return None
        
        # Process media appearances
        media_appearances = []
        voice_actors = []
        
        for edge in character_data.get('media', {}).get('edges', [])[:24]:  # Limit to 10
            node = edge.get('node', {})
            
            # Get start date and format it
            start_date = node.get('startDate', {})
            release_date = ''
            formatted_date = ''
            if start_date and start_date.get('year'):
                year = start_date.get('year')
                month = start_date.get('month') or 1
                day = start_date.get('day') or 1
                try:
                    date_obj = datetime.datetime(year, month, day)
                    release_date = date_obj.strftime('%Y-%m-%d')
                    formatted_date = date_obj.strftime('%b %Y')
                except ValueError:
                    formatted_date = str(year)
            
            media_type = node.get('type', '').lower()
            media_format = node.get('format', '')
            
            # Create URL based on media type
            url = '#'
            if media_type in ['anime', 'manga'] and node.get('idMal'):
                url = f'/mal/{media_type}/{node.get("idMal")}/'
            
            media_appearances.append({
                'id': node.get('id'),
                'title': node.get('title', {}).get('english') or node.get('title', {}).get('romaji'),
                'type': node.get('type'),
                'format': media_format,
                'type_display': media_format or media_type.title(),
                'image': node.get('coverImage', {}).get('large'),
                'character_role': edge.get('characterRole'),
                'release_date': release_date,
                'formatted_date': formatted_date,
                'url': url
            })
            
            # Add voice actors from this media
            for va in edge.get('voiceActors', []):
                va_id = va.get('id')
                if not any(existing_va.get('id') == va_id for existing_va in voice_actors):
                    voice_actors.append({
                        'id': va_id,
                        'name': va.get('name', {}).get('full'),
                        'language': va.get('language'),
                        'image': va.get('image', {}).get('large')
                    })
        
        # Sort by release date (latest first)
        media_appearances.sort(key=lambda x: x.get('release_date') or '0000-00-00', reverse=True)
        
        # Process description to format markdown-style text
        description = character_data.get('description', '')
        if description:
            # Convert __text__ to <strong>text</strong> (first occurrence without br, rest with br)
            parts = description.split('__')
            result = []
            for i, part in enumerate(parts):
                if i % 2 == 1:  # This is inside __ __
                    if i == 1:  # First bold text
                        result.append(f'<strong>{part}</strong> ')
                    else:
                        result.append(f'<br><strong>{part}</strong> ')
                else:
                    result.append(part)
            description = ''.join(result)
            # Convert spoiler tags ~!text!~ to spoiler spans
            description = re.sub(r'~!([^!]+)!~', r'<span class="spoiler">\1</span>', description)
            # Convert markdown links [text](url) to HTML links
            description = re.sub(r'\[([^\]]+)\]\(([^\)]+)\)', r'<a href="\2" target="_blank">\1</a>', description)
        
        # Process age to remove trailing dash if single age
        age = character_data.get('age')
        if age and isinstance(age, str) and age.endswith('-') and '-' not in age[:-1]:
            age = age[:-1]  # Remove trailing dash for single ages
        
        return {
            'id': str(character_data.get('id')),
            'name': character_data.get('name', {}).get('full'),
            'image': character_data.get('image', {}).get('large'),
            'description': description,
            'age': age,
            'media_appearances': media_appearances,
            'voice_actors': voice_actors
        }
        
    except Exception as e:
        logger.error(f"Error fetching character data for {character_id}: {str(e)}")
        return None

def save_favorite_actor_character(name, image_url, type, person_id=None):
    existing_count = FavoritePerson.objects.filter(type=type).count()
    position = existing_count + 1

    # Prepare local path
    slug_name = slugify(name)
    ext = image_url.split('.')[-1].split('?')[0]  # crude extension extract, e.g. jpg, png
    relative_path = f'favorites/{type}s/{slug_name}.{ext}'

    local_url = download_image(image_url, relative_path)
    # fallback to original url if download failed
    final_image_url = local_url if local_url else image_url
    
    # Fetch additional data based on type
    additional_data = {}
    if type == 'actor' and person_id:
        actor_data = fetch_actor_data(person_id)
        if actor_data:
            additional_data = {
                'birthday': actor_data.get('birthday'),
                'deathday': actor_data.get('deathday'),
                'biography': actor_data.get('biography'),
                'related_media': actor_data.get('related_media')
            }
    elif type == 'character' and person_id:
        character_data = fetch_character_data(person_id)
        if character_data:
            additional_data = {
                'description': character_data.get('description'),
                'age': character_data.get('age'),
                'media_appearances': character_data.get('media_appearances'),
                'voice_actors': character_data.get('voice_actors')
            }

    person = FavoritePerson.objects.create(
        name=name,
        image_url=final_image_url,
        type=type,
        position=position,
        person_id=person_id,
        **additional_data
    )
    return person

def delete_favorite_person_and_reorder(person_id):
    try:
        person = FavoritePerson.objects.get(id=person_id)
        person_type = person.type

        # Only delete image files that are in the favorites directory
        if person.image_url and person.image_url.startswith(settings.MEDIA_URL):
            # Convert URL to file system path
            relative_path = person.image_url.replace(settings.MEDIA_URL, '').lstrip('/')
            # Only delete if it's in the favorites directory
            if relative_path.startswith('favorites/'):
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

def refresh_favorite_person(person_id):
    try:
        person = FavoritePerson.objects.get(id=person_id)
        old_position = person.position
        person_type = person.type
        name = person.name
        api_person_id = person.person_id  # The actual API ID (TMDB/AniList)
        
        # Delete old image if it's in favorites directory
        if person.image_url and person.image_url.startswith(settings.MEDIA_URL):
            relative_path = person.image_url.replace(settings.MEDIA_URL, '').lstrip('/')
            if relative_path.startswith('favorites/'):
                old_path = os.path.join(settings.MEDIA_ROOT, relative_path)
                if os.path.exists(old_path):
                    try:
                        os.remove(old_path)
                    except Exception as e:
                        print(f"Failed to delete image file {old_path}: {e}")
        
        # Delete person without reordering
        person.delete()
        
        # Fetch fresh data from API
        additional_data = {}
        fresh_image_url = None
        
        if person_type == 'actor' and api_person_id:
            actor_data = fetch_actor_data(api_person_id)
            if actor_data:
                fresh_image_url = actor_data.get('image')
                additional_data = {
                    'birthday': actor_data.get('birthday'),
                    'deathday': actor_data.get('deathday'),
                    'biography': actor_data.get('biography'),
                    'related_media': actor_data.get('related_media')
                }
        elif person_type == 'character' and api_person_id:
            character_data = fetch_character_data(api_person_id)
            if character_data:
                fresh_image_url = character_data.get('image')
                additional_data = {
                    'description': character_data.get('description'),
                    'age': character_data.get('age'),
                    'media_appearances': character_data.get('media_appearances'),
                    'voice_actors': character_data.get('voice_actors')
                }
        
        # Download fresh image
        if fresh_image_url:
            slug_name = slugify(name)
            ext = fresh_image_url.split('.')[-1].split('?')[0]
            relative_path = f'favorites/{person_type}s/{slug_name}.{ext}'
            local_url = download_image(fresh_image_url, relative_path)
            final_image_url = local_url if local_url else fresh_image_url
        else:
            final_image_url = fresh_image_url
        
        # Recreate with old position and fresh data
        FavoritePerson.objects.create(
            name=name,
            image_url=final_image_url,
            type=person_type,
            position=old_position,
            person_id=api_person_id,
            **additional_data
        )
        return True
    except FavoritePerson.DoesNotExist:
        return False

@ensure_csrf_cookie
def delete_favorite_person(request, person_id):
    success = delete_favorite_person_and_reorder(person_id)
    return JsonResponse({"success": success})

@ensure_csrf_cookie
@require_POST
def refresh_favorite_person_view(request):
    data = json.loads(request.body)
    api_person_id = data.get('person_id')  # This is the API ID (TMDB/AniList)
    person_type = data.get('person_type')
    
    if not api_person_id or not person_type:
        return JsonResponse({'error': 'Missing parameters'}, status=400)
    
    # Find the database record using API ID and type
    try:
        person = FavoritePerson.objects.get(person_id=api_person_id, type=person_type)
        success = refresh_favorite_person(person.id)  # Pass database ID
        return JsonResponse({'success': success})
    except FavoritePerson.DoesNotExist:
        return JsonResponse({'error': 'Person not found'}, status=404)

@ensure_csrf_cookie
@require_POST
def upload_person_image(request):
    uploaded_file = request.FILES.get('image')
    person_id = request.POST.get('person_id')
    person_type = request.POST.get('person_type')
    
    if not uploaded_file or not person_id or not person_type:
        return JsonResponse({'error': 'Missing required data.'}, status=400)
    
    ext = os.path.splitext(uploaded_file.name)[1].lower()
    if ext not in ['.jpg', '.jpeg', '.png', '.webp', '.gif']:
        return JsonResponse({'error': 'Unsupported file type.'}, status=400)
    
    try:
        person = FavoritePerson.objects.get(person_id=person_id, type=person_type)
        
        favorites_dir = os.path.join(settings.MEDIA_ROOT, f'favorites/{person_type}s')
        os.makedirs(favorites_dir, exist_ok=True)
        
        # Generate cache-busting filename
        timestamp = int(time.time() * 1000)
        slug_name = slugify(person.name)
        base_name = f'{slug_name}_{timestamp}'
        new_path = os.path.join(favorites_dir, base_name + ext)
        
        # Remove old image if it's in favorites directory
        if person.image_url and person.image_url.startswith(settings.MEDIA_URL):
            relative_path = person.image_url.replace(settings.MEDIA_URL, '').lstrip('/')
            if relative_path.startswith('favorites/'):
                old_path = os.path.join(settings.MEDIA_ROOT, relative_path)
                if os.path.exists(old_path):
                    os.remove(old_path)
        
        # Save new file
        with open(new_path, 'wb+') as destination:
            for chunk in uploaded_file.chunks():
                destination.write(chunk)
        
        relative_url = f'/media/favorites/{person_type}s/{base_name}{ext}'
        person.image_url = relative_url
        person.save(update_fields=['image_url'])
        
        return JsonResponse({'success': True, 'url': relative_url})
        
    except FavoritePerson.DoesNotExist:
        return JsonResponse({'error': 'Person not found.'}, status=404)

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
@require_POST
def toggle_music_favorite(request):
    try:
        data = json.loads(request.body)
        item_id = data.get('item_id')
        favorite = data.get('favorite')
        
        item = MediaItem.objects.get(id=item_id)
        item.favorite = favorite
        item.save()
        
        return JsonResponse({'success': True})
    except MediaItem.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Item not found'}, status=404)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

def check_favorite_person_view(request):
    name = request.GET.get('name')
    person_type = request.GET.get('type')
    
    if not name or not person_type:
        return JsonResponse({'error': 'Missing parameters'}, status=400)
    
    is_favorited = FavoritePerson.objects.filter(name=name, type=person_type).exists()
    return JsonResponse({'is_favorited': is_favorited})

@ensure_csrf_cookie
def toggle_favorite_person_view(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST request required.'}, status=400)

    data = json.loads(request.body)
    name = data.get('name')
    image_url = data.get('image_url')
    person_type = data.get('type')
    person_id = data.get('person_id')  # New parameter for ID

    # Check if already favorited
    existing = FavoritePerson.objects.filter(name=name, type=person_type).first()
    if existing:
        # Delete favorite and reorder positions
        delete_favorite_person_and_reorder(existing.id)
        return JsonResponse({'status': 'removed'})
    else:
        save_favorite_actor_character(name, image_url, person_type, person_id)
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

    banner_dir = os.path.join(settings.MEDIA_ROOT, "banners")
    os.makedirs(banner_dir, exist_ok=True)

    # Generate cache-busting filename
    timestamp = int(time.time() * 1000)
    media_type = request.POST.get("media_type", "")
    if media_type and source in ['tmdb', 'mal']:
        base_name = f"{source}_{media_type}_{source_id}_{timestamp}"
    else:
        base_name = f"{source}_{source_id}_{timestamp}"
    new_path = os.path.join(banner_dir, base_name + ext)

    # Remove any old banner files for this source/source_id
    for old_file in glob.glob(os.path.join(banner_dir, f"{source}_*")):
        if os.path.isfile(old_file):
            filename = os.path.splitext(os.path.basename(old_file))[0]
            # For tmdb/mal: match source_mediatype_id or source_mediatype_id_timestamp
            if media_type and source in ['tmdb', 'mal']:
                if filename == f"{source}_{media_type}_{source_id}" or \
                   filename.startswith(f"{source}_{media_type}_{source_id}_"):
                    os.remove(old_file)
            # For others: match source_id or source_id_timestamp
            else:
                if filename == f"{source}_{source_id}" or \
                   filename.startswith(f"{source}_{source_id}_"):
                    os.remove(old_file)

    # Save the new file
    with open(new_path, "wb+") as destination:
        for chunk in uploaded_file.chunks():
            destination.write(chunk)

    relative_url = f"/media/banners/{base_name}{ext}"

    # Update MediaItem
    try:
        item = MediaItem.objects.get(source=source, source_id=source_id)
        item.banner_url = relative_url
        item.save(update_fields=["banner_url"])
    except MediaItem.DoesNotExist:
        pass

    return JsonResponse({"success": True, "url": relative_url})

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

    # Generate cache-busting filename
    timestamp = int(time.time() * 1000)
    media_type = request.POST.get("media_type", "")
    if media_type and source in ['tmdb', 'mal']:
        base_name = f"{source}_{media_type}_{source_id}_{timestamp}"
    else:
        base_name = f"{source}_{source_id}_{timestamp}"
    new_path = os.path.join(poster_dir, base_name + ext)

    # Remove old cover files for this source/source_id
    for old_file in glob.glob(os.path.join(poster_dir, f"{source}_*")):
        if os.path.isfile(old_file):
            filename = os.path.splitext(os.path.basename(old_file))[0]
            # For tmdb/mal: match source_mediatype_id or source_mediatype_id_timestamp
            if media_type and source in ['tmdb', 'mal']:
                if filename == f"{source}_{media_type}_{source_id}" or \
                   filename.startswith(f"{source}_{media_type}_{source_id}_"):
                    os.remove(old_file)
            # For others: match source_id or source_id_timestamp
            else:
                if filename == f"{source}_{source_id}" or \
                   filename.startswith(f"{source}_{source_id}_"):
                    os.remove(old_file)

    # Save the new file
    with open(new_path, "wb+") as destination:
        for chunk in uploaded_file.chunks():
            destination.write(chunk)

    relative_url = f"/media/posters/{base_name}{ext}"

    # Update MediaItem
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
        refresh_type = data.get("refresh_type", "all")
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
            'favorite_position': item.favorite_position,
        }

        # Backup images based on refresh_type
        banner_backup = None
        cover_backup = None
        
        if refresh_type in ['data', 'cover']:
            if item.banner_url and item.banner_url.startswith('/media/'):
                file_path = os.path.join(settings.MEDIA_ROOT, item.banner_url.replace('/media/', ''))
                if os.path.exists(file_path):
                    with open(file_path, 'rb') as f:
                        banner_backup = {'url': item.banner_url, 'data': f.read()}
        
        if refresh_type in ['data', 'banner']:
            if item.cover_url and item.cover_url.startswith('/media/'):
                file_path = os.path.join(settings.MEDIA_ROOT, item.cover_url.replace('/media/', ''))
                if os.path.exists(file_path):
                    with open(file_path, 'rb') as f:
                        cover_backup = {'url': item.cover_url, 'data': f.read()}

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
            if "_s" in source_id:  # It's a season
                tmdb_id, season_number = source_id.split("_s")
                save_tmdb_season(tmdb_id, season_number)
            else:
                save_tmdb_item(media_type, source_id)
        elif source == "mal":
            save_mal_item(media_type, source_id)
        elif source == "igdb":
            save_igdb_item(source_id)
        elif source == "openlib":
            save_openlib_item(source_id)
        elif source == "musicbrainz":
            save_musicbrainz_item(source_id)
        else:
            return JsonResponse({"error": "Unsupported source."}, status=400)

        # Restore user data
        new_item = MediaItem.objects.get(source=source, source_id=source_id, media_type=media_type)
        for field, value in user_data.items():
            setattr(new_item, field, value)
        
        # Restore backed up images
        if banner_backup:
            file_path = os.path.join(settings.MEDIA_ROOT, banner_backup['url'].replace('/media/', ''))
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, 'wb') as f:
                f.write(banner_backup['data'])
            new_item.banner_url = banner_backup['url']
        
        if cover_backup:
            file_path = os.path.join(settings.MEDIA_ROOT, cover_backup['url'].replace('/media/', ''))
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, 'wb') as f:
                f.write(cover_backup['data'])
            new_item.cover_url = cover_backup['url']
        
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

    if media_type != "music":
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
    elif media_type == "music":
        artist_id = request.GET.get("artist_id", "")
        album_id = request.GET.get("album_id", "")
        data = get_music_extra_info(item_id, artist_id, album_id)
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
    from core.context_processors import version_context
    current_version = version_context(request)['version']
    
    try:
        response = requests.get("https://api.github.com/repos/mihail-pop/media-journal/releases/latest", timeout=5)
        latest_version = response.json().get("tag_name", "Unknown")
    except:
        latest_version = "Unable to check"
    
    return JsonResponse({
        "current_version": current_version,
        "latest_version": latest_version
    })

@ensure_csrf_cookie
@require_GET
def actor_detail_api(request, actor_id):
    """API endpoint for actor details"""
    data = fetch_actor_data(actor_id)
    if data:
        return JsonResponse(data)
    return JsonResponse({'error': 'Actor not found'}, status=404)

@ensure_csrf_cookie
@require_GET
def character_detail_api(request, character_id):
    """API endpoint for character details"""
    logger.info(f"character_detail_api called with character_id: {character_id} (type: {type(character_id)})")
    
    # Validate character_id
    if not character_id or character_id == 'None':
        logger.error(f"Invalid character_id received: {character_id}")
        return JsonResponse({'error': 'Invalid character ID'}, status=400)
    
    # Try to convert to int to validate it's a valid ID
    try:
        int(character_id)
    except (ValueError, TypeError):
        logger.error(f"Character ID cannot be converted to integer: {character_id}")
        return JsonResponse({'error': 'Invalid character ID format'}, status=400)
    
    try:
        data = fetch_character_data(character_id)
        if data:
            return JsonResponse(data)
        logger.error(f"No data returned for character_id: {character_id}")
        return JsonResponse({'error': 'Character not found'}, status=404)
    except Exception as e:
        logger.error(f"Error in character_detail_api for character_id {character_id}: {str(e)}")
        return JsonResponse({'error': 'Internal server error'}, status=500)

@ensure_csrf_cookie
@require_GET
def load_more_cast(request):
    source = request.GET.get('source')
    source_id = request.GET.get('source_id')
    media_type = request.GET.get('media_type')
    page = int(request.GET.get('page', 1))
    
    if not all([source, source_id, media_type]):
        return JsonResponse({'error': 'Missing parameters'}, status=400)
    
    try:
        if source == 'tmdb':
            api_key = APIKey.objects.get(name="tmdb").key_1
            if media_type == 'tv':
                url = f"https://api.themoviedb.org/3/tv/{source_id}/aggregate_credits"
            else:
                url = f"https://api.themoviedb.org/3/movie/{source_id}/credits"
            
            response = requests.get(url, params={'api_key': api_key})
            if response.status_code != 200:
                return JsonResponse({'error': 'Failed to fetch cast'}, status=500)
            
            data = response.json()
            all_cast = data.get('cast', [])
            
            # Paginate: page 1 = next 24 after first 8, page 2+ = 32 each
            if page == 1:
                start_idx = 8
                end_idx = 32
            else:
                start_idx = 32 + (page - 2) * 32
                end_idx = start_idx + 32
            cast_page = all_cast[start_idx:end_idx]
            
            cast_data = []
            for actor in cast_page:
                if media_type == 'tv':
                    character_name = actor.get("roles", [{}])[0].get("character") if actor.get("roles") else ""
                else:
                    character_name = actor.get("character")
                
                profile_url = f"https://image.tmdb.org/t/p/w185{actor.get('profile_path')}" if actor.get('profile_path') else ""
                cast_data.append({
                    'name': actor.get('name'),
                    'character': character_name,
                    'profile_path': profile_url,
                    'id': actor.get('id'),
                    'is_full_url': True
                })
            
            has_more = end_idx < len(all_cast)
            
        elif source == 'mal':
            # For anime/manga, use AniList API
            query = '''
            query ($id: Int, $type: MediaType, $page: Int) {
              Media(idMal: $id, type: $type) {
                characters(sort: [ROLE, RELEVANCE], page: $page, perPage: 25) {
                  pageInfo {
                    hasNextPage
                  }
                  nodes {
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
            }
            '''
            
            # For AniList: page 1 gets remaining 17 from first page, page 2+ gets full pages
            if page == 1:
                anilist_page = 1
                per_page = 25
            else:
                anilist_page = page
                per_page = 25
            
            variables = {
                'id': int(source_id),
                'type': media_type.upper(),
                'page': anilist_page
            }
            
            response = requests.post(
                'https://graphql.anilist.co',
                json={'query': query, 'variables': variables},
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code != 200:
                return JsonResponse({'error': 'Failed to fetch characters'}, status=500)
            
            data = response.json()
            characters_data = data.get('data', {}).get('Media', {}).get('characters', {})
            characters = characters_data.get('nodes', [])
            has_more = characters_data.get('pageInfo', {}).get('hasNextPage', False)
            
            cast_data = []
            # For page 1, skip first 8 characters (already shown)
            start_idx = 8 if page == 1 else 0
            for char in characters[start_idx:]:
                cast_data.append({
                    'name': char.get('name', {}).get('full', ''),
                    'character': 'Character',
                    'profile_path': char.get('image', {}).get('large', ''),
                    'id': char.get('id'),
                    'is_full_url': True
                })
        
        else:
            return JsonResponse({'error': 'Unsupported source'}, status=400)
        
        return JsonResponse({
            'cast': cast_data,
            'has_more': has_more,
            'page': page
        })
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@require_POST
def add_music_video(request):
    try:
        data = json.loads(request.body)
        source_id = data.get('source_id')
        url = data.get('url')
        
        if not source_id or not url:
            return JsonResponse({'success': False, 'error': 'Missing data'})
        
        # Validate YouTube URL
        if 'youtube.com/watch?v=' not in url and 'youtu.be/' not in url:
            return JsonResponse({'success': False, 'error': 'Invalid YouTube URL'})
        
        # Normalize URL to standard format
        if 'youtu.be/' in url:
            video_id = url.split('youtu.be/')[1].split('?')[0]
            url = f'https://www.youtube.com/watch?v={video_id}'
        
        item = MediaItem.objects.get(source_id=source_id, media_type='music')
        
        # Get current screenshots/youtube_links
        screenshots = item.screenshots or []
        
        # Find next position
        max_position = 0
        if screenshots:
            max_position = max([link.get('position', 0) for link in screenshots])
        
        new_position = max_position + 1
        
        # Add new video
        screenshots.append({'url': url, 'position': new_position})
        
        item.screenshots = screenshots
        item.save()
        
        return JsonResponse({'success': True})
    except MediaItem.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Item not found'})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})

@require_POST
def delete_music_video(request):
    try:
        data = json.loads(request.body)
        source_id = data.get('source_id')
        position = data.get('position')
        
        if not source_id or position is None:
            return JsonResponse({'success': False, 'error': 'Missing data'})
        
        item = MediaItem.objects.get(source_id=source_id, media_type='music')
        
        # Get current screenshots/youtube_links
        screenshots = item.screenshots or []
        
        # Remove the video at the specified position
        screenshots = [link for link in screenshots if link.get('position') != position]
        
        # Reorder positions
        screenshots.sort(key=lambda x: x.get('position', 0))
        for i, link in enumerate(screenshots, start=1):
            link['position'] = i
        
        item.screenshots = screenshots
        item.save()
        
        return JsonResponse({'success': True})
    except MediaItem.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Item not found'})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


@require_GET
def favorite_music_videos(request):
    try:
        # Get all favorited music items
        mode = request.GET.get('mode', 'favorites')
        status = request.GET.get('status', 'all')
        
        if mode == 'all':
            music_items = MediaItem.objects.filter(media_type='music')
        elif mode == 'status':
            if status == 'all':
                music_items = MediaItem.objects.filter(media_type='music')
            else:
                music_items = MediaItem.objects.filter(media_type='music', status=status)
        else:
            music_items = MediaItem.objects.filter(media_type='music', favorite=True)
        
        videos = []
        for item in music_items:
            if item.screenshots:
                for link in item.screenshots:
                    if link.get('position') != 1:
                        continue
                    url = link.get('url', '')
                    if 'youtube.com/watch?v=' in url:
                        video_id = url.split('watch?v=')[1].split('&')[0]
                        videos.append({
                            'video_id': video_id,
                            'item_id': item.id,
                            'is_favorite': item.favorite,
                            'source_id': item.source_id
                        })
        
        return JsonResponse({'videos': videos})
    except Exception as e:
        return JsonResponse({'videos': [], 'error': str(e)})


@ensure_csrf_cookie
@require_POST
def reorder_music_videos(request):
    try:
        data = json.loads(request.body)
        source_id = data.get('source_id')
        new_order = data.get('order')  # List of positions in new order
        
        item = MediaItem.objects.get(source='musicbrainz', source_id=source_id)
        youtube_links = item.screenshots or []
        
        # Reorder based on new_order list
        reordered = []
        for new_pos, old_pos in enumerate(new_order, start=1):
            for link in youtube_links:
                if link.get('position') == old_pos:
                    link['position'] = new_pos
                    reordered.append(link)
                    break
        
        item.screenshots = reordered
        item.save()
        
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@ensure_csrf_cookie
@require_POST
def set_video_as_cover(request):
    try:
        data = json.loads(request.body)
        source_id = data.get('source_id')
        position = data.get('position')
        
        item = MediaItem.objects.get(source='musicbrainz', source_id=source_id)
        youtube_links = item.screenshots or []
        
        # Find video at position
        video_url = None
        for link in youtube_links:
            if link.get('position') == position:
                video_url = link.get('url')
                break
        
        if not video_url or 'youtube.com/watch?v=' not in video_url:
            return JsonResponse({'error': 'Video not found'}, status=404)
        
        # Extract video ID and get thumbnail
        video_id = video_url.split('v=')[1].split('&')[0]
        max_res_url = f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"
        
        try:
            img_check = requests.head(max_res_url, timeout=3)
            if img_check.status_code == 200 and int(img_check.headers.get('content-length', 0)) > 5000:
                thumbnail_url = max_res_url
            else:
                thumbnail_url = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
        except:
            thumbnail_url = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
        
        # Download and save
        cache_bust = int(time.time() * 1000)
        local_poster = download_image(thumbnail_url, f"posters/musicbrainz_{source_id}_{cache_bust}.jpg")
        local_banner = download_image(thumbnail_url, f"banners/musicbrainz_{source_id}_{cache_bust}.jpg")
        
        item.cover_url = local_poster
        item.banner_url = local_banner
        item.save()
        
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
