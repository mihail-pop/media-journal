import logging

from django.http import JsonResponse
from django.urls import reverse
from django.db.models import F, Case, When, Value, IntegerField
from django.views.decorators.http import require_GET

from core.models import MediaItem, FavoritePerson
from core.services.g_api import get_game_screenshots_data
from core.services.m_games import get_igdb_discover
from core.services.m_anime_manga import get_anilist_discover
from core.services.m_movies_tvshows import get_tmdb_discover

logger = logging.getLogger(__name__)

@require_GET
def movies_api(request):
    page = int(request.GET.get("page", 1))
    status = request.GET.get("status", "all")
    search = request.GET.get("search", "").strip()
    sort_by = request.GET.get("sort_by", "rating")
    sort_order = request.GET.get("sort_order", "desc")
    page_size = 50

    status_ordering = Case(
        When(status="ongoing", then=Value(1)),
        When(status="completed", then=Value(2)),
        When(status="on_hold", then=Value(3)),
        When(status="planned", then=Value(4)),
        When(status="dropped", then=Value(5)),
        default=Value(6),
        output_field=IntegerField(),
    )

    rating_ordering = Case(
        When(personal_rating=None, then=Value(0)),
        default=F("personal_rating"),
        output_field=IntegerField(),
    )

    queryset = MediaItem.objects.filter(media_type="movie")

    if status != "all":
        queryset = queryset.filter(status=status)

    if search:
        queryset = queryset.filter(title__icontains=search)

    queryset = queryset.annotate(
        status_order=status_ordering, rating_order=rating_ordering
    )

    # Apply sorting
    order_fields = ["status_order"]
    if sort_by == "title":
        order_fields.append("title" if sort_order == "asc" else "-title")
    elif sort_by == "rating":
        order_fields.append("-rating_order" if sort_order == "desc" else "rating_order")
        order_fields.append("title")  # Secondary sort by title
    elif sort_by == "date":
        order_fields.append("-date_added" if sort_order == "desc" else "date_added")

    queryset = queryset.order_by(*order_fields)

    start = (page - 1) * page_size
    end = start + page_size
    items = queryset[start:end]

    has_more = queryset.count() > end

    items_data = []
    for item in items:
        items_data.append(
            {
                "id": item.id,
                "title": item.title,
                "media_type": item.media_type,
                "status": item.status,
                "personal_rating": item.personal_rating,
                "cover_url": item.cover_url or "/static/core/img/placeholder.png",
                "banner_url": item.banner_url or "/static/core/img/placeholder.png",
                "notes": item.notes or "",
                "source_id": item.source_id,
                "get_status_display": item.get_status_display(),
                "repeats": item.repeats,
                "date_added": item.date_added.isoformat() if item.date_added else "",
            }
        )

    return JsonResponse({"items": items_data, "has_more": has_more, "page": page})


@require_GET
def movies_banners_api(request):
    """Get all movie banners for the rotator"""
    movies = MediaItem.objects.filter(media_type="movie").values("banner_url", "notes")
    banners = []
    for movie in movies:
        banner_url = movie["banner_url"]
        notes = movie["notes"] or ""
        if banner_url and "placeholder" not in banner_url:
            banners.append(
                {"bannerUrl": banner_url, "notes": notes if notes != "None" else ""}
            )
    return JsonResponse({"banners": banners})

@require_GET
def tvshows_api(request):
    page = int(request.GET.get("page", 1))
    status = request.GET.get("status", "all")
    search = request.GET.get("search", "").strip()
    type_filter = request.GET.get("type", "both")
    sort_by = request.GET.get("sort_by", "rating")
    sort_order = request.GET.get("sort_order", "desc")
    page_size = 50

    status_ordering = Case(
        When(status="ongoing", then=Value(1)),
        When(status="completed", then=Value(2)),
        When(status="on_hold", then=Value(3)),
        When(status="planned", then=Value(4)),
        When(status="dropped", then=Value(5)),
        default=Value(6),
        output_field=IntegerField(),
    )

    rating_ordering = Case(
        When(personal_rating=None, then=Value(0)),
        default=F("personal_rating"),
        output_field=IntegerField(),
    )

    queryset = MediaItem.objects.filter(media_type="tv")

    if status != "all":
        queryset = queryset.filter(status=status)

    if search:
        queryset = queryset.filter(title__icontains=search)

    # Type filtering for TV shows vs seasons
    if type_filter == "shows":
        queryset = queryset.exclude(provider_ids__tmdb__contains="_s")
    elif type_filter == "seasons":
        queryset = queryset.exclude(provider_ids__tmdb__contains="_s")
    # 'both' shows everything

    queryset = queryset.annotate(
        status_order=status_ordering, rating_order=rating_ordering
    )

    # Apply sorting
    order_fields = ["status_order"]
    if sort_by == "title":
        order_fields.append("title" if sort_order == "asc" else "-title")
    elif sort_by == "rating":
        order_fields.append("-rating_order" if sort_order == "desc" else "rating_order")
        order_fields.append("title")  # Secondary sort by title
    elif sort_by == "date":
        order_fields.append("-date_added" if sort_order == "desc" else "date_added")

    queryset = queryset.order_by(*order_fields)

    start = (page - 1) * page_size
    end = start + page_size
    items = queryset[start:end]

    has_more = queryset.count() > end

    items_data = []
    for item in items:
        items_data.append(
            {
                "id": item.id,
                "title": item.title,
                "media_type": item.media_type,
                "status": item.status,
                "personal_rating": item.personal_rating,
                "cover_url": item.cover_url or "/static/core/img/placeholder.png",
                "banner_url": item.banner_url or "/static/core/img/placeholder.png",
                "notes": item.notes or "",
                "source_id": item.source_id,
                "get_status_display": item.get_status_display(),
                "progress_main": item.progress_main,
                "total_main": item.total_main,
                "progress_secondary": item.progress_secondary,
                "total_secondary": item.total_secondary,
                "repeats": item.repeats,
                "date_added": item.date_added.isoformat() if item.date_added else "",
            }
        )

    return JsonResponse({"items": items_data, "has_more": has_more, "page": page})


@require_GET
def tvshows_banners_api(request):
    """Get all TV show banners for the rotator"""
    tvshows = MediaItem.objects.filter(media_type="tv").values("banner_url", "notes")
    banners = []
    for tvshow in tvshows:
        banner_url = tvshow["banner_url"]
        notes = tvshow["notes"] or ""
        if banner_url and "placeholder" not in banner_url:
            banners.append(
                {"bannerUrl": banner_url, "notes": notes if notes != "None" else ""}
            )
    return JsonResponse({"banners": banners})

@require_GET
def anime_api(request):
    page = int(request.GET.get("page", 1))
    status = request.GET.get("status", "all")
    search = request.GET.get("search", "").strip()
    sort_by = request.GET.get("sort_by", "rating")
    sort_order = request.GET.get("sort_order", "desc")
    page_size = 50

    status_ordering = Case(
        When(status="ongoing", then=Value(1)),
        When(status="completed", then=Value(2)),
        When(status="on_hold", then=Value(3)),
        When(status="planned", then=Value(4)),
        When(status="dropped", then=Value(5)),
        default=Value(6),
        output_field=IntegerField(),
    )

    rating_ordering = Case(
        When(personal_rating=None, then=Value(0)),
        default=F("personal_rating"),
        output_field=IntegerField(),
    )

    queryset = MediaItem.objects.filter(media_type="anime")

    if status != "all":
        queryset = queryset.filter(status=status)

    if search:
        queryset = queryset.filter(title__icontains=search)

    queryset = queryset.annotate(
        status_order=status_ordering, rating_order=rating_ordering
    )

    # Apply sorting
    order_fields = ["status_order"]
    if sort_by == "title":
        order_fields.append("title" if sort_order == "asc" else "-title")
    elif sort_by == "rating":
        order_fields.append("-rating_order" if sort_order == "desc" else "rating_order")
        order_fields.append("title")  # Secondary sort by title
    elif sort_by == "date":
        order_fields.append("-date_added" if sort_order == "desc" else "date_added")

    queryset = queryset.order_by(*order_fields)

    start = (page - 1) * page_size
    end = start + page_size
    items = queryset[start:end]

    has_more = queryset.count() > end

    items_data = []
    for item in items:
        items_data.append(
            {
                "id": item.id,
                "title": item.title,
                "media_type": item.media_type,
                "status": item.status,
                "personal_rating": item.personal_rating,
                "cover_url": item.cover_url or "/static/core/img/placeholder.png",
                "banner_url": item.banner_url or "/static/core/img/placeholder.png",
                "notes": item.notes or "",
                "source": item.source,
                "source_id": item.source_id,
                "provider_ids": item.provider_ids,
                "get_status_display": item.get_status_display(),
                "progress_main": item.progress_main,
                "total_main": item.total_main,
                "repeats": item.repeats,
                "date_added": item.date_added.isoformat() if item.date_added else "",
            }
        )

    return JsonResponse({"items": items_data, "has_more": has_more, "page": page})


@require_GET
def anime_banners_api(request):
    """Get all anime banners for the rotator"""
    anime = MediaItem.objects.filter(media_type="anime").values("banner_url", "notes")
    banners = []
    for item in anime:
        banner_url = item["banner_url"]
        notes = item["notes"] or ""
        if banner_url and "placeholder" not in banner_url:
            banners.append(
                {"bannerUrl": banner_url, "notes": notes if notes != "None" else ""}
            )
    return JsonResponse({"banners": banners})

@require_GET
def manga_api(request):
    page = int(request.GET.get("page", 1))
    status = request.GET.get("status", "all")
    search = request.GET.get("search", "").strip()
    sort_by = request.GET.get("sort_by", "rating")
    sort_order = request.GET.get("sort_order", "desc")
    page_size = 50

    status_ordering = Case(
        When(status="ongoing", then=Value(1)),
        When(status="completed", then=Value(2)),
        When(status="on_hold", then=Value(3)),
        When(status="planned", then=Value(4)),
        When(status="dropped", then=Value(5)),
        default=Value(6),
        output_field=IntegerField(),
    )

    rating_ordering = Case(
        When(personal_rating=None, then=Value(0)),
        default=F("personal_rating"),
        output_field=IntegerField(),
    )

    queryset = MediaItem.objects.filter(media_type="manga")

    if status != "all":
        queryset = queryset.filter(status=status)

    if search:
        queryset = queryset.filter(title__icontains=search)

    queryset = queryset.annotate(
        status_order=status_ordering, rating_order=rating_ordering
    )

    # Apply sorting
    order_fields = ["status_order"]
    if sort_by == "title":
        order_fields.append("title" if sort_order == "asc" else "-title")
    elif sort_by == "rating":
        order_fields.append("-rating_order" if sort_order == "desc" else "rating_order")
        order_fields.append("title")  # Secondary sort by title
    elif sort_by == "date":
        order_fields.append("-date_added" if sort_order == "desc" else "date_added")

    queryset = queryset.order_by(*order_fields)

    start = (page - 1) * page_size
    end = start + page_size
    items = queryset[start:end]

    has_more = queryset.count() > end

    items_data = []
    for item in items:
        items_data.append(
            {
                "id": item.id,
                "title": item.title,
                "media_type": item.media_type,
                "status": item.status,
                "personal_rating": item.personal_rating,
                "cover_url": item.cover_url or "/static/core/img/placeholder.png",
                "banner_url": item.banner_url or "/static/core/img/placeholder.png",
                "notes": item.notes or "",
                "source": item.source,
                "source_id": item.source_id,
                "provider_ids": item.provider_ids,
                "get_status_display": item.get_status_display(),
                "progress_main": item.progress_main,
                "total_main": item.total_main,
                "progress_secondary": item.progress_secondary,
                "total_secondary": item.total_secondary,
                "repeats": item.repeats,
                "date_added": item.date_added.isoformat() if item.date_added else "",
            }
        )

    return JsonResponse({"items": items_data, "has_more": has_more, "page": page})


@require_GET
def manga_banners_api(request):
    """Get all manga banners for the rotator"""
    manga = MediaItem.objects.filter(media_type="manga").values("banner_url", "notes")
    banners = []
    for item in manga:
        banner_url = item["banner_url"]
        notes = item["notes"] or ""
        if banner_url and "placeholder" not in banner_url:
            banners.append(
                {"bannerUrl": banner_url, "notes": notes if notes != "None" else ""}
            )
    return JsonResponse({"banners": banners})

@require_GET
def games_api(request):
    page = int(request.GET.get("page", 1))
    status = request.GET.get("status", "all")
    search = request.GET.get("search", "").strip()
    sort_by = request.GET.get("sort_by", "rating")
    sort_order = request.GET.get("sort_order", "desc")
    page_size = 50

    status_ordering = Case(
        When(status="ongoing", then=Value(1)),
        When(status="completed", then=Value(2)),
        When(status="on_hold", then=Value(3)),
        When(status="planned", then=Value(4)),
        When(status="dropped", then=Value(5)),
        default=Value(6),
        output_field=IntegerField(),
    )

    rating_ordering = Case(
        When(personal_rating=None, then=Value(0)),
        default=F("personal_rating"),
        output_field=IntegerField(),
    )

    queryset = MediaItem.objects.filter(media_type="game")

    if status != "all":
        queryset = queryset.filter(status=status)

    if search:
        queryset = queryset.filter(title__icontains=search)

    queryset = queryset.annotate(
        status_order=status_ordering, rating_order=rating_ordering
    )

    # Apply sorting
    order_fields = ["status_order"]
    if sort_by == "title":
        order_fields.append("title" if sort_order == "asc" else "-title")
    elif sort_by == "rating":
        order_fields.append("-rating_order" if sort_order == "desc" else "rating_order")
        order_fields.append("title")  # Secondary sort by title
    elif sort_by == "date":
        order_fields.append("-date_added" if sort_order == "desc" else "date_added")
    elif sort_by == "hours":
        order_fields.append(
            "-progress_main" if sort_order == "desc" else "progress_main"
        )

    queryset = queryset.order_by(*order_fields)

    start = (page - 1) * page_size
    end = start + page_size
    items = queryset[start:end]

    has_more = queryset.count() > end

    items_data = []
    for item in items:
        items_data.append(
            {
                "id": item.id,
                "title": item.title,
                "media_type": item.media_type,
                "status": item.status,
                "personal_rating": item.personal_rating,
                "cover_url": item.cover_url or "/static/core/img/placeholder.png",
                "banner_url": item.banner_url or "/static/core/img/placeholder.png",
                "notes": item.notes or "",
                "source_id": item.source_id,
                "get_status_display": item.get_status_display(),
                "progress_main": item.progress_main,
                "total_main": item.total_main,
                "repeats": item.repeats,
                "date_added": item.date_added.isoformat() if item.date_added else "",
            }
        )

    return JsonResponse({"items": items_data, "has_more": has_more, "page": page})


@require_GET
def games_banners_api(request):
    """Get all game banners for the rotator"""
    games = MediaItem.objects.filter(media_type="game").values("banner_url", "notes")
    banners = []
    for game in games:
        banner_url = game["banner_url"]
        notes = game["notes"] or ""
        if banner_url and "placeholder" not in banner_url:
            banners.append(
                {"bannerUrl": banner_url, "notes": notes if notes != "None" else ""}
            )
    return JsonResponse({"banners": banners})

@require_GET
def music_api(request):
    page = int(request.GET.get("page", 1))
    status = request.GET.get("status", "all")
    search = request.GET.get("search", "").strip()
    sort_by = request.GET.get("sort_by", "rating")
    sort_order = request.GET.get("sort_order", "desc")
    page_size = 50

    status_ordering = Case(
        When(status="ongoing", then=Value(1)),
        When(status="completed", then=Value(2)),
        When(status="on_hold", then=Value(3)),
        When(status="planned", then=Value(4)),
        When(status="dropped", then=Value(5)),
        default=Value(6),
        output_field=IntegerField(),
    )

    rating_ordering = Case(
        When(personal_rating=None, then=Value(0)),
        default=F("personal_rating"),
        output_field=IntegerField(),
    )

    queryset = MediaItem.objects.filter(media_type="music")

    if status != "all":
        queryset = queryset.filter(status=status)

    if search:
        queryset = queryset.filter(title__icontains=search)

    queryset = queryset.annotate(
        status_order=status_ordering, rating_order=rating_ordering
    )

    # Apply sorting
    order_fields = ["status_order"]
    if sort_by == "title":
        order_fields.append("title" if sort_order == "asc" else "-title")
    elif sort_by == "rating":
        order_fields.append("-rating_order" if sort_order == "desc" else "rating_order")
        order_fields.append("title")  # Secondary sort by title
    elif sort_by == "date":
        order_fields.append("-date_added" if sort_order == "desc" else "date_added")

    queryset = queryset.order_by(*order_fields)

    start = (page - 1) * page_size
    end = start + page_size
    items = queryset[start:end]

    has_more = queryset.count() > end

    items_data = []
    for item in items:
        items_data.append(
            {
                "id": item.id,
                "title": item.title,
                "media_type": item.media_type,
                "status": item.status,
                "personal_rating": item.personal_rating,
                "cover_url": item.cover_url or "/static/core/img/placeholder.png",
                "banner_url": item.banner_url or "/static/core/img/placeholder.png",
                "notes": item.notes or "",
                "source_id": item.source_id,
                "get_status_display": item.get_status_display(),
                "repeats": item.repeats,
                "date_added": item.date_added.isoformat() if item.date_added else "",
            }
        )

    return JsonResponse({"items": items_data, "has_more": has_more, "page": page})


@require_GET
def music_banners_api(request):
    """Get all music banners for the rotator"""
    music = MediaItem.objects.filter(media_type="music").values("banner_url", "notes")
    banners = []
    for item in music:
        banner_url = item["banner_url"]
        notes = item["notes"] or ""
        if banner_url and "placeholder" not in banner_url:
            banners.append(
                {"bannerUrl": banner_url, "notes": notes if notes != "None" else ""}
            )
    return JsonResponse({"banners": banners})

@require_GET
def books_api(request):
    page = int(request.GET.get("page", 1))
    status = request.GET.get("status", "all")
    search = request.GET.get("search", "").strip()
    sort_by = request.GET.get("sort_by", "rating")
    sort_order = request.GET.get("sort_order", "desc")
    page_size = 50

    status_ordering = Case(
        When(status="ongoing", then=Value(1)),
        When(status="completed", then=Value(2)),
        When(status="on_hold", then=Value(3)),
        When(status="planned", then=Value(4)),
        When(status="dropped", then=Value(5)),
        default=Value(6),
        output_field=IntegerField(),
    )

    rating_ordering = Case(
        When(personal_rating=None, then=Value(0)),
        default=F("personal_rating"),
        output_field=IntegerField(),
    )

    queryset = MediaItem.objects.filter(media_type="book")

    if status != "all":
        queryset = queryset.filter(status=status)

    if search:
        queryset = queryset.filter(title__icontains=search)

    queryset = queryset.annotate(
        status_order=status_ordering, rating_order=rating_ordering
    )

    # Apply sorting
    order_fields = ["status_order"]
    if sort_by == "title":
        order_fields.append("title" if sort_order == "asc" else "-title")
    elif sort_by == "rating":
        order_fields.append("-rating_order" if sort_order == "desc" else "rating_order")
        order_fields.append("title")  # Secondary sort by title
    elif sort_by == "date":
        order_fields.append("-date_added" if sort_order == "desc" else "date_added")
    elif sort_by == "pages":
        order_fields.append(
            "-progress_main" if sort_order == "desc" else "progress_main"
        )

    queryset = queryset.order_by(*order_fields)

    start = (page - 1) * page_size
    end = start + page_size
    items = queryset[start:end]

    has_more = queryset.count() > end

    items_data = []
    for item in items:
        items_data.append(
            {
                "id": item.id,
                "title": item.title,
                "media_type": item.media_type,
                "status": item.status,
                "personal_rating": item.personal_rating,
                "cover_url": item.cover_url or "/static/core/img/placeholder.png",
                "banner_url": item.banner_url or "/static/core/img/placeholder.png",
                "notes": item.notes or "",
                "source_id": item.source_id,
                "get_status_display": item.get_status_display(),
                "progress_main": item.progress_main,
                "total_main": item.total_main,
                "repeats": item.repeats,
                "date_added": item.date_added.isoformat() if item.date_added else "",
            }
        )

    return JsonResponse({"items": items_data, "has_more": has_more, "page": page})


@require_GET
def books_banners_api(request):
    """Get all book banners for the rotator"""
    books = MediaItem.objects.filter(media_type="book").values("banner_url", "notes")
    banners = []
    for book in books:
        banner_url = book["banner_url"]
        notes = book["notes"] or ""
        if banner_url and "placeholder" not in banner_url:
            banners.append(
                {"bannerUrl": banner_url, "notes": notes if notes != "None" else ""}
            )
    return JsonResponse({"banners": banners})

@require_GET
def history_api(request):
    page = int(request.GET.get("page", 1))
    search = request.GET.get("search", "").strip()
    sort_order = request.GET.get("sort", "desc")
    year = request.GET.get("year", "")
    month = request.GET.get("month", "")
    media_type = request.GET.get("type", "")
    status = request.GET.get("status", "")
    start_date = request.GET.get("start_date", "")
    end_date = request.GET.get("end_date", "")
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
    if sort_order == "asc":
        queryset = queryset.order_by("date_added")
    else:
        queryset = queryset.order_by("-date_added")

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
        elif item.media_type in ["anime", "manga"]:
            url = f"/{item.source}/{item.media_type}/{item.source_id}/"
        elif item.source == "igdb" and item.media_type == "game":
            url = f"/igdb/game/{item.source_id}/"
        elif item.source == "openlib" and item.media_type == "book":
            url = f"/openlib/book/{item.source_id}/"
        elif item.source == "musicbrainz" and item.media_type == "music":
            url = f"/musicbrainz/music/{item.source_id}/"
        else:
            url = "#"

        items_data.append(
            {
                "id": item.id,
                "title": item.title,
                "media_type": item.media_type,
                "status": item.status,
                "cover_url": item.cover_url or "/static/core/img/placeholder.png",
                "banner_url": item.banner_url or "/static/core/img/placeholder.png",
                "date_added": item.date_added.isoformat(),
                "date_formatted": item.date_added.strftime("%d %b %Y"),
                "url": url,
            }
        )

    return JsonResponse({"items": items_data, "has_more": has_more, "page": page})

@require_GET
def favorites_api(request):
    category_slug = request.GET.get("category")
    page = int(request.GET.get("page", 1))
    offset = request.GET.get("offset")
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
        "movies": "movie",
        "tv-shows": "tv",
        "anime": "anime",
        "manga": "manga",
        "games": "game",
        "books": "book",
        "music": "music",
    }

    if category_slug in slug_map:
        media_type = slug_map[category_slug]
        qs = MediaItem.objects.filter(favorite=True, media_type=media_type).order_by(
            "favorite_position", "date_added"
        )
        total = qs.count()
        items = qs[start:end]
        has_more = total > end

        for item in items:
            # Generate URL
            url = "#"
            if item.media_type in ["movie", "tv"]:
                if "_s" in item.source_id:
                    parts = item.source_id.split("_s")
                    url = f"/tmdb/season/{parts[0]}/{parts[1]}/"
                else:
                    url = reverse("tmdb_detail", args=[item.media_type, item.source_id])
            elif item.media_type in ["anime", "manga"]:
                url = reverse("anilist_detail", args=[item.source, item.media_type, item.source_id])
            elif item.media_type == "game":
                url = reverse("igdb_detail", args=[item.source_id])
            elif item.media_type == "book":
                url = reverse("openlib_detail", args=[item.source_id])
            elif item.media_type == "music":
                url = reverse("musicbrainz_detail", args=[item.source_id])

            items_data.append(
                {
                    "id": item.id,
                    "title": item.title,
                    "cover_url": item.cover_url or "/static/core/img/placeholder.png",
                    "url": url,
                    "type": "media",
                    "media_type": media_type,
                }
            )

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

            items_data.append(
                {
                    "id": person.id,
                    "title": person.name,
                    "cover_url": person.image_url or "/static/core/img/placeholder.png",
                    "url": url,
                    "type": "person",
                    "media_type": category_slug,
                }
            )

    return JsonResponse({"items": items_data, "has_more": has_more, "page": page})

@require_GET
def discover_api(request):
    media_type = request.GET.get("type", "movie")
    page = int(request.GET.get("page", 1))
    query = request.GET.get("q", "").strip()

    # Get filters
    sort = request.GET.get("sort", "")
    season = request.GET.get("season", "")
    year = request.GET.get("year", "")
    format_filter = request.GET.get("format", "")
    status = request.GET.get("status", "")
    genre = request.GET.get("genre", "")
    platform = request.GET.get("platform", "")

    try:
        if media_type in ["anime", "manga"]:
            # Map "upcoming" to NOT_YET_RELEASED for AniList
            if status == "upcoming":
                status = "NOT_YET_RELEASED"
            data = get_anilist_discover(
                media_type, page, query, sort, season, year, format_filter, status
            )
            # Handle case where function returns [] instead of dict
            if isinstance(data, list):
                data = {"results": data, "hasMore": False}
            return JsonResponse(data)
        elif media_type in ["movie", "tv"]:
            results = get_tmdb_discover(media_type, page, query, sort, year)
        elif media_type == "game":
            results = get_igdb_discover(page, query, sort, genre, platform)
        else:
            results = []

        return JsonResponse({"results": results})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
    
@require_GET
def game_screenshots_api(request):
    igdb_id = request.GET.get("igdb_id")
    page = int(request.GET.get("page", 1))
    page_size = 40

    if not igdb_id:
        return JsonResponse({"error": "Missing igdb_id"}, status=400)

    all_screenshots = get_game_screenshots_data(igdb_id)

    start = (page - 1) * page_size
    end = start + page_size
    items = all_screenshots[start:end]

    return JsonResponse(
        {"screenshots": items, "has_more": end < len(all_screenshots), "page": page}
    )
