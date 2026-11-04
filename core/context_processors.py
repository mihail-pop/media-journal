from .models import AppSettings, NavItem, default_live_search_settings, default_list_card_overlay_settings


def nav_items(request):
    items = list(NavItem.objects.filter(visible=True).order_by("position"))
    settings = AppSettings.objects.first()

    # Add display name to each item (from choices)
    for item in items:
        item.display_name = item.get_name_display()

    media_types = {
        'movies': 'movie', 'tvshows': 'tv', 'anime': 'anime',
        'games': 'game', 'manga': 'manga', 'books': 'book', 'music': 'music',
    }

    return {
        "nav_items": items,
        "primary_nav_items": items[:5] if len(items) >= 7 else items,
        "overflow_nav_items": items[5:] if len(items) >= 7 else [],
        "search_media_types": [
            {"data_type": media_types[item.name], "label": item.display_name}
            for item in items if item.name in media_types
        ],
        "live_search_settings": settings.get_live_search_settings() if settings else default_live_search_settings(),
        "show_banner_notes": settings.show_banner_notes if settings else True,
        "allow_adult_content": settings.allow_adult_content if settings else True,
        "list_card_overlay_settings": settings.get_list_card_overlay_settings() if settings else default_list_card_overlay_settings(),
    }


def version_context(request):
    return {"version": "v1.31.3"}  # Update this with each release
