"""Create a portable iCalendar snapshot without contacting another service."""

import datetime
import hashlib

from core.services.g_calendar_dates import (
    display_calendar_datetime,
    is_all_day_event,
    normalize_calendar_datetime,
)


_GENERIC_TITLES = {'Global Release', 'Release Date', 'Game Release'}
_CATEGORIES = {
    'movie': 'Movies', 'tv': 'TV Shows', 'anime': 'Anime', 'manga': 'Manga',
    'game': 'Games', 'book': 'Books', 'music': 'Music',
}


def _escape_text(value):
    text = str(value or '').replace('\r\n', '\n').replace('\r', '\n')
    # Keep literal notes, but prevent control characters from becoming invalid
    # content lines. Escaped newlines cannot introduce extra ICS properties.
    text = ''.join(character for character in text if (
        character in '\n\t' or
        (ord(character) >= 32 and ord(character) != 127 and
         not 0xD800 <= ord(character) <= 0xDFFF)
    ))
    return (text.replace('\\', '\\\\').replace(';', '\\;')
            .replace(',', '\\,').replace('\n', '\\n'))


def _fold_line(value):
    """RFC 5545 limits physical lines to 75 octets, including continuation space."""
    parts = []
    line = ''
    size = 0
    for character in value:
        width = len(character.encode('utf-8'))
        if size + width > 75:
            parts.append(line)
            line = ' '
            size = 1
        line += character
        size += width
    parts.append(line)
    return '\r\n'.join(parts)


def _date_string(value):
    return f'{value.year:04d}{value.month:02d}{value.day:02d}'


def _utc_string(value):
    value = normalize_calendar_datetime(value).astimezone(datetime.timezone.utc)
    return (f'{_date_string(value)}T{value.hour:02d}{value.minute:02d}'
            f'{value.second:02d}Z')


def _event_uid(event):
    # Neither the scheduled date nor title is part of the identity, so moving
    # or renaming an event keeps its UID. Creation time distinguishes reused IDs.
    identity = f'{event.pk}|{event.date_added.isoformat(timespec="microseconds")}'
    digest = hashlib.sha256(identity.encode('utf-8')).hexdigest()[:32]
    return f'media-journal-{digest}@media-journal.local'


def build_calendar_export(events):
    """Return saved events as UTF-8 ICS bytes; an empty selection raises ValueError.

    Callers should select_related('item') and include date_added when deferring
    fields. This is a one-time export, rather than a subscription or invitation.
    """
    stamp = _utc_string(datetime.datetime.now(datetime.timezone.utc))
    lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Media Journal//Calendar Export//EN',
        'CALSCALE:GREGORIAN',
    ]
    count = 0
    for event in events:
        count += 1
        summary = str(event.item.title or 'Release')
        if event.title and (event.is_custom or event.title not in _GENERIC_TITLES):
            summary += f' - {event.title}'
        lines.extend([
            'BEGIN:VEVENT',
            f'UID:{_event_uid(event)}',
            f'DTSTAMP:{stamp}',
        ])
        if is_all_day_event(event):
            date = display_calendar_datetime(event.date).date()
            lines.append(f'DTSTART;VALUE=DATE:{_date_string(date)}')
            # DTEND is exclusive. The maximum representable date can use the
            # RFC's implicit one-day duration instead of overflowing the year.
            if date < datetime.date.max:
                end = date + datetime.timedelta(days=1)
                lines.append(f'DTEND;VALUE=DATE:{_date_string(end)}')
        else:
            # A release marks a point in time; its viewing duration is unknown.
            lines.append(f'DTSTART:{_utc_string(event.date)}')
        lines.append(f'SUMMARY:{_escape_text(summary)}')
        if event.notes:
            lines.append(f'DESCRIPTION:{_escape_text(event.notes)}')
        category = _CATEGORIES.get(event.item.media_type, event.item.media_type)
        lines.extend([
            f'CATEGORIES:{_escape_text(category)}',
            'TRANSP:TRANSPARENT',
            'END:VEVENT',
        ])
    if not count:
        raise ValueError('There are no releases to export.')
    lines.append('END:VCALENDAR')
    return ('\r\n'.join(_fold_line(line) for line in lines) + '\r\n').encode('utf-8')
