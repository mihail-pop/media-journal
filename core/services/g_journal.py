"""Journal pagination and validation, separate from the item's own progress."""

import re
from datetime import date, datetime

from django.conf import settings
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone

from core.models import MediaItemLog
from core.services.g_utils import rating_from_edit

JOURNAL_PAGE_SIZE = 4
PROGRESS_UNITS = {
    'movie': ('hour', 'minute'), 'tv': ('episode', 'season'),
    'anime': ('episode',), 'manga': ('chapter', 'volume'),
    'book': ('page',), 'game': ('hour', 'version'), 'music': ('minute',),
}


def serialize_log(log):
    return {
        'id': log.pk, 'title': log.title or 'Log', 'content': log.content,
        'activity_date': log.activity_date.strftime('%d %b %Y'),
        'date': log.activity_date.strftime('%Y-%m-%d'),
        'score': log.score, 'is_spoiler': log.is_spoiler,
        'progress_unit': log.progress_unit,
        'progress_start': log.progress_start, 'progress_end': log.progress_end,
    }


def journal_page(item, *, query='', sort='activity_date', direction='desc', page=1):
    logs = item.logs.all()
    total_logs = logs.count()
    notes = item.notes or ''
    has_entries = bool(notes or total_logs)
    if query:
        logs = logs.filter(Q(title__icontains=query) | Q(content__icontains=query))
        if query.casefold() not in notes.casefold():
            notes = ''
    count = logs.count() if query else total_logs
    descending = direction != 'asc'
    if sort == 'title':
        title_order = Lower('title').desc() if descending else Lower('title').asc()
        logs = logs.order_by(title_order, '-activity_date', '-pk')
    elif sort == 'score':
        score_order = '-score' if descending else 'score'
        logs = logs.order_by(score_order, '-activity_date', '-pk')
    else:
        prefix = '-' if descending else ''
        logs = logs.order_by(f'{prefix}activity_date', f'{prefix}date_added', f'{prefix}pk')
    start = (page - 1) * JOURNAL_PAGE_SIZE
    entries = list(logs[start:start + JOURNAL_PAGE_SIZE])
    return {
        'logs': entries, 'notes': notes if page == 1 else '',
        'log_data': [serialize_log(log) for log in entries],
        'has_entries': has_entries, 'has_more': start + len(entries) < count,
        'remaining': max(0, count - start - len(entries)), 'page': page,
    }


def _optional_integer(value, label):
    if value in (None, ''):
        return None
    if isinstance(value, bool) or not re.fullmatch(r'\d+', str(value)):
        raise ValueError(f'{label} must be a whole number of 0 or more.')
    number = int(value)
    if number > 2147483647:
        raise ValueError(f'{label} is too large.')
    return number


def apply_log_changes(log, data, rating_mode):
    """Validate everything before saving. An unchanged day keeps its exact time."""
    original_title = log.title
    for field in ('title', 'content'):
        if field in data:
            value = data[field]
            if not isinstance(value, str):
                raise ValueError(f'{field.capitalize()} must be text.')
            if field == 'title' and len(value) > 255:
                raise ValueError('Keep the log title within 255 characters.')
            setattr(log, field, value)

    if log.pk and (not log.title or not log.title.strip()):
        log.title = original_title or 'Log'
    elif not log.title or not log.title.strip():
        # Count is not a sequence: deleting Log 2 must not create a second Log 3.
        numbers = (
            int(match.group(1))
            for title in MediaItemLog.objects.filter(item_id=log.item_id).values_list('title', flat=True)
            if (match := re.fullmatch(r'Log\s+(\d+)', title or '', re.IGNORECASE))
        )
        log.title = f'Log {max(numbers, default=0) + 1}'

    if 'activity_date' in data:
        value = data['activity_date']
        if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
            raise ValueError('Choose a valid activity date.')
        try:
            day = date.fromisoformat(value)
        except ValueError as error:
            raise ValueError('Choose a valid activity date.') from error
        current_day = timezone.localtime(log.activity_date).date() if timezone.is_aware(log.activity_date) else log.activity_date.date()
        if not log.pk or day != current_day:
            now = timezone.localtime() if settings.USE_TZ else timezone.now()
            activity_date = datetime.combine(day, now.time())
            log.activity_date = timezone.make_aware(activity_date) if settings.USE_TZ else activity_date

    if 'score' in data:
        score = _optional_integer(data['score'], 'Score')
        maximum = {'stars_5': 5, 'scale_10': 10}.get(rating_mode, 100)
        if score is not None and (not 1 <= score <= maximum or (rating_mode == 'faces' and score not in (1, 50, 100))):
            raise ValueError('Choose a score within the selected rating scale.')
        log.score = rating_from_edit(score, rating_mode, log.score)

    if 'is_spoiler' in data:
        if not isinstance(data['is_spoiler'], bool):
            raise ValueError('Choose a valid spoiler setting.')
        log.is_spoiler = data['is_spoiler']
    if 'progress_unit' in data:
        unit = data['progress_unit']
        allowed = PROGRESS_UNITS.get(log.item.media_type, ('unit',))
        if unit not in (None, '', log.progress_unit) and unit not in allowed:
            raise ValueError('Choose a valid progress unit for this media type.')
        log.progress_unit = unit or None
    for field, label in (('progress_start', 'Progress start'), ('progress_end', 'Progress end')):
        if field in data:
            setattr(log, field, _optional_integer(data[field], label))
    if log.progress_end is not None:
        if log.progress_start is None:
            raise ValueError('Enter a progress start before an end.')
        if log.progress_end < log.progress_start:
            raise ValueError('Progress end must be at least the start.')
    return log
