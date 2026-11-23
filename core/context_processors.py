from .models import AppSettings, NavItem, default_live_search_settings, default_list_card_overlay_settings


def nav_items(request):
    items = list(NavItem.objects.filter(visible=True).order_by("position"))
    settings = AppSettings.objects.first()
    extra_search_options = {
        'person': settings.show_people_in_search if settings else True,
        'character': settings.show_characters_in_search if settings else False,
    }

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
        ] + [
            {"data_type": "person", "label": "People", "disabled": not extra_search_options['person']},
            {"data_type": "character", "label": "Characters", "disabled": not extra_search_options['character']},
        ],
        "extra_search_options": extra_search_options,
        "live_search_settings": settings.get_live_search_settings() if settings else default_live_search_settings(),
        "journal_rating_mode": settings.rating_mode if settings else "faces",
        "show_banner_notes": settings.show_banner_notes if settings else True,
        "allow_adult_content": settings.allow_adult_content if settings else True,
        "list_card_overlay_settings": settings.get_list_card_overlay_settings() if settings else default_list_card_overlay_settings(),
    }


def version_context(request):
    return {"version": "v1.32.0"}  # Update this with each release
