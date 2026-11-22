"""Calendar dates share Django's clock without changing global date settings."""

import datetime
from urllib.parse import unquote

from django.conf import settings
from django.utils import timezone


CALENDAR_MEDIA_TYPES = (
    ('movie', 'Movies'), ('tv', 'TV Shows'), ('anime', 'Anime'),
    ('manga', 'Manga'), ('game', 'Games'), ('book', 'Books'), ('music', 'Music'),
)


def parse_media_types(value):
    """One browser preference shared by Calendar, its exports and Home."""
    known = tuple(key for key, _ in CALENDAR_MEDIA_TYPES)
    if value is None or value == '':
        return known
    if isinstance(value, str):
        value = unquote(value)
        if value == '-':
            return ()
        values = {part.strip() for part in value.split(',')}
    elif isinstance(value, (list, tuple, set)):
        if not value:
            return ()
        values = {part for part in value if isinstance(part, str)}
    else:
        return known
    selected = tuple(key for key in known if key in values)
    return selected or known


def media_filter_label(types):
    if len(types) == len(CALENDAR_MEDIA_TYPES):
        return 'All Media'
    if not types:
        return 'No Media'
    if len(types) == 1:
        return dict(CALENDAR_MEDIA_TYPES)[types[0]]
    return f'{len(types)} Media Types'


def calendar_now():
    value = timezone.now()
    return timezone.localtime(value) if timezone.is_aware(value) else value


def normalize_calendar_datetime(value):
    if timezone.is_aware(value):
        if settings.USE_TZ:
            return value
        # With USE_TZ=False, timezone.now() uses the process's local clock.
        # In particular, Windows may have a different local zone from TIME_ZONE.
        return value.astimezone().replace(tzinfo=None)
    if settings.USE_TZ:
        return timezone.make_aware(value)
    return value


def all_day_datetime(value):
    if isinstance(value, datetime.datetime):
        value = value.date()
    return normalize_calendar_datetime(datetime.datetime.combine(value, datetime.time.min))


def display_calendar_datetime(value):
    value = normalize_calendar_datetime(value)
    return timezone.localtime(value) if timezone.is_aware(value) else value


def calendar_iso_datetime(value):
    value = display_calendar_datetime(value)
    if timezone.is_naive(value):
        value = value.astimezone()
    return value.isoformat()


def is_all_day_event(event):
    if not event.is_custom:
        source = event.item.source
        if source == 'tmdb' and event.item.media_type in ('movie', 'tv'):
            return True
        if source == 'igdb' and event.item.media_type == 'game':
            return True
        if source in ('anilist', 'mal') and event.title == 'Release Date':
            return True
        if source in ('anilist', 'mal') and (event.title or '').startswith('Episode '):
            return False
    # Custom events without a time have always been stored at midnight.
    return display_calendar_datetime(event.date).time().replace(tzinfo=None) == datetime.time.min
