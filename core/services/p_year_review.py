"""Read-only yearly summaries from library dates and recorded activity."""

from calendar import month_name
from collections import Counter
from datetime import datetime

from django.conf import settings
from django.db.models import Count
from django.urls import NoReverseMatch, reverse
from django.utils import timezone

from core.models import AppSettings, MediaItem, MediaItemActivity, MusicPlay, default_favorite_sections_order
from core.services.g_utils import rating_to_display


MEDIA_LABELS = {
    'movie': 'Movie', 'tv': 'TV Show', 'anime': 'Anime', 'manga': 'Manga',
    'game': 'Game', 'book': 'Book', 'music': 'Music',
}
CARD_FIELDS = (
    'id', 'title', 'media_type', 'source', 'provider_ids', 'cover_url', 'status',
    'personal_rating', 'favorite', 'favorite_position', 'date_added', 'total_main',
)

# Fixed ten-year cycle: keep this order to preserve each year's decoration.
# Future collections should use a new version, rather than reshuffle this one.
YEAR_DECORATIONS = (
    ('tree', 'jolly-tree.png', 'Shake out a little Christmas magic'),
    ('party', 'celebration-popper.png', 'Launch a celebration'),
    ('gingerbread', 'jolly-gingerbread.png', 'Start a cookie shower'),
    ('champagne', 'celebration-champagne.png', 'Pop the cork'),
    ('stockings', 'jolly-stockings.png', 'Shake out a few surprises'),
    ('disco', 'celebration-disco.png', 'Light up the dance floor'),
    ('house', 'jolly-house.png', 'Let it snow'),
    ('toast', 'celebration-toast.png', 'Raise a toast to your year'),
    ('sleigh', 'jolly-sleigh.png', 'Send a little magic across the sky'),
    ('clock', 'celebration-clock.png', 'Count down to a celebration'),
)


def _year_decoration(year):
    key, filename, action = YEAR_DECORATIONS[year % 10]
    return {'key': key, 'image': f'core/img/year_review/{filename}', 'action': action}


def _local_date(value):
    return timezone.localtime(value) if timezone.is_aware(value) else value


def _year_start(year):
    value = datetime(year, 1, 1)
    return timezone.make_aware(value) if settings.USE_TZ else value


def year_bounds(year):
    return _year_start(year), _year_start(year + 1)


def _available_years():
    years = set()
    for model, field in (
        (MediaItem, 'date_added'), (MediaItemActivity, 'recorded_at'), (MusicPlay, 'played_at'),
    ):
        # Seek the first indexed timestamp in each occupied year. DISTINCT
        # year-truncation would scan every play in a large listening history.
        timestamps = model.objects.order_by(field).values_list(field, flat=True)
        first = timestamps.first()
        while first is not None:
            year = _local_date(first).year
            if year >= 9999:
                break
            years.add(year)
            first = timestamps.filter(**{f'{field}__gte': _year_start(year + 1)}).first()
    return years


def _url(name, *args):
    try:
        return reverse(name, args=args)
    except (NoReverseMatch, TypeError, ValueError):
        return '#'


def _item_url(row):
    ids = row['provider_ids'] if isinstance(row['provider_ids'], dict) else {}
    source = row['source']
    kind = row['media_type']
    source_id = ids.get(source)
    if kind in ('movie', 'tv'):
        source_id = source_id or ids.get('tmdb')
        if not source_id:
            return '#'
        if kind == 'tv' and '_s' in str(source_id):
            parts = str(source_id).split('_s', 1)
            if all(part.isdecimal() for part in parts):
                return _url('tmdb_season_detail', *parts)
        return _url('tmdb_detail', kind, source_id)
    if kind in ('anime', 'manga'):
        if not source_id:
            source = 'anilist' if ids.get('anilist') else 'mal'
            source_id = ids.get(source)
        return _url('anilist_detail', source, kind, source_id) if source_id else '#'
    route, provider = {
        'game': ('igdb_detail', 'igdb'), 'book': ('openlib_detail', 'openlib'),
        'music': ('musicbrainz_detail', 'musicbrainz'),
    }.get(kind, (None, None))
    source_id = source_id or ids.get(provider)
    return _url(route, source_id) if route and source_id else '#'


def _card(row, year, rating_mode):
    activity_date = _local_date(row['date_added'])
    raw_rating = row['personal_rating']
    display_rating = rating_to_display(raw_rating, rating_mode) if raw_rating and 0 < raw_rating <= 100 else None
    rating_face = ''
    if rating_mode == 'faces':
        face = {1: ('bad', 'Disliked'), 50: ('neutral', 'Neutral'), 100: ('good', 'Liked')}.get(display_rating)
        rating = display_rating
        rating_face = face[0] if face else ''
        rating_label = face[1] if face else ''
    else:
        rating = display_rating
        maximum = {'stars_5': 5, 'scale_10': 10, 'scale_100': 100}[rating_mode]
        rating_label = f'{display_rating} / {maximum}' if display_rating is not None else ''
    return {
        'id': row['id'], 'title': row['title'], 'media_type': row['media_type'],
        'media_label': MEDIA_LABELS.get(row['media_type'], row['media_type']),
        'cover_url': row['cover_url'] or '', 'url': _item_url(row),
        'date_label': f'{activity_date.day} {month_name[activity_date.month]} {activity_date.year}',
        'month': activity_date.month, 'month_label': month_name[activity_date.month],
        'rating': rating, 'rating_label': rating_label, 'rating_face': rating_face, 'highlight': False,
        'favorite_position': row['favorite_position'],
        'export_image_url': _url('year_review_image', year, row['id']),
    }


def _media_order(app_settings):
    sections = app_settings.get_favorite_sections_order() if app_settings else default_favorite_sections_order()
    return [section['id'] for section in sections if section['id'] in MEDIA_LABELS]


def _group_cards(cards, media_order):
    """Use the saved media order without changing order inside each media type."""
    positions = {media_type: index for index, media_type in enumerate(media_order)}
    return sorted(cards, key=lambda card: positions.get(card['media_type'], len(positions)))


def _histogram_bins(scores, rating_mode):
    """Keep occupied scores and enough empty bins to make a useful scale."""
    counts = Counter((score - 1) // 10 + 1 if rating_mode == 'scale_100' else score for score in scores)
    if rating_mode == 'stars_5':
        selected = set(range(1, 6))
    else:
        selected = set(counts)
        if not selected:
            selected = {1, 3, 5, 8, 10}
        while len(selected) < 5:
            # Fill the largest gaps across the whole scale. On midpoint ties,
            # prefer the outer candidate to spread empty labels over both ends.
            candidates = set(range(1, 11)) - selected
            selected.add(max(candidates, key=lambda value: (
                min(abs(value - other) for other in selected),
                abs(value - 5.5), value,
            )))
    highest_count = max(counts.values(), default=1)
    bins = []
    for value in sorted(selected):
        label = f'{(value - 1) * 10 + 1}–{value * 10}' if rating_mode == 'scale_100' else str(value)
        bins.append({
            'key': value, 'label': label, 'count': counts[value],
            'percent': round(counts[value] * 100 / highest_count, 2),
        })
    return bins


def _rating_stats(cards, completed_rows, rating_mode):
    rated = [card for card in cards if card['rating'] is not None]
    rating = {
        'mode': rating_mode, 'count': len(rated), 'average': None,
        'maximum': 10 if rating_mode == 'faces' else {'stars_5': 5, 'scale_10': 10, 'scale_100': 100}[rating_mode],
        'faces': [], 'bins': [],
    }
    if rating_mode == 'faces':
        face_counts = Counter(card['rating_face'] for card in rated)
        rating['faces'] = [
            {'key': key, 'label': label, 'count': face_counts[key]}
            for key, label in (('good', 'Liked'), ('neutral', 'Neutral'), ('bad', 'Disliked'))
        ]
        scores = [
            rating_to_display(row['personal_rating'], 'scale_10') for row in completed_rows
            if row['personal_rating'] and 0 < row['personal_rating'] <= 100
        ]
    else:
        scores = [card['rating'] for card in rated]
        rating['bins'] = _histogram_bins(scores, rating_mode)
    if scores:
        rating['average'] = round(sum(scores) / len(scores), 1)
    return rating


def _duration_label(minutes):
    hours, remainder = divmod(max(0, round(minutes)), 60)
    return f'{hours:,} h {remainder} m' if hours else f'{remainder} m'


class _ProgressCredits:
    """Attribute increases to their recording year; decreases correct the latest.

    Initial totals and excess decreases are baselines. A discontinuity between
    records means a restore/baseline adjustment, not new consumption. Only the
    current segment can be corrected; completed segments retain their credits.
    """

    def __init__(self, selected_year):
        self.year = selected_year
        self.previous = None
        self.stack = []
        self.closed = 0

    def value(self):
        return self.closed + sum(amount for year, amount in self.stack if year == self.year)

    def observe(self, before, after, year):
        before, after = before or 0, after or 0
        if self.previous is not None and self.previous != before:
            self.closed = self.value()
            self.stack.clear()
        change = after - before
        if change > 0:
            if self.stack and self.stack[-1][0] == year:
                self.stack[-1][1] += change
            else:
                self.stack.append([year, change])
        elif change < 0:
            correction = -change
            while correction and self.stack:
                amount = min(correction, self.stack[-1][1])
                correction -= amount
                self.stack[-1][1] -= amount
                if self.stack[-1][1] == 0:
                    self.stack.pop()
        self.previous = after


def _tracked_stats(year, start, end):
    selected = MediaItemActivity.objects.filter(recorded_at__gte=start, recorded_at__lt=end)
    history = MediaItemActivity.objects.filter(item_id__in=selected.values('item_id')).order_by(
        'item_id', 'recorded_at', 'id',
    ).values(
        'item_id', 'media_type', 'recorded_at', 'item__episode_runtime',
        'progress_main_before', 'progress_main_after',
        'progress_secondary_before', 'progress_secondary_after', 'repeats_before', 'repeats_after',
    )
    totals = Counter()
    watch_minutes = 0
    missing_runtime = 0
    current_id = None
    counters = None
    kind = None
    runtime = None

    def finish():
        nonlocal watch_minutes, missing_runtime
        if counters is None:
            return
        primary, secondary, repeats = (counter.value() for counter in counters)
        totals[(kind, 'main')] += primary
        totals[(kind, 'secondary')] += secondary
        totals[('all', 'repeats')] += repeats
        if kind in ('tv', 'anime'):
            if runtime and runtime > 0:
                watch_minutes += primary * runtime
            else:
                missing_runtime += primary

    for row in history.iterator(chunk_size=500):
        if row['item_id'] != current_id:
            finish()
            current_id = row['item_id']
            kind = row['media_type']
            runtime = row['item__episode_runtime']
            counters = [_ProgressCredits(year) for _ in range(3)]
        recorded_year = _local_date(row['recorded_at']).year
        for field, counter in zip(('progress_main', 'progress_secondary', 'repeats'), counters):
            counter.observe(row[f'{field}_before'], row[f'{field}_after'], recorded_year)
    finish()
    metric_definitions = (
        ('tv', 'main', 'TV episodes', 'episodes'), ('tv', 'secondary', 'TV seasons', 'seasons'),
        ('anime', 'main', 'Anime episodes', 'episodes'), ('game', 'main', 'Game time', 'hours'),
        ('manga', 'main', 'Manga chapters', 'chapters'), ('manga', 'secondary', 'Manga volumes', 'volumes'),
        ('book', 'main', 'Book pages', 'pages'), ('all', 'repeats', 'Revisits', 'revisits'),
    )
    first = MediaItemActivity.objects.order_by('recorded_at').values_list('recorded_at', flat=True).first()
    return {
        'has_activity': counters is not None,
        'first_recorded': _local_date(first).strftime('%d %B %Y').lstrip('0') if first else '',
        'metrics': [
            {'key': f'{media}_{field}', 'label': label, 'value': totals[(media, field)], 'unit': unit}
            for media, field, label, unit in metric_definitions if totals[(media, field)] > 0
        ],
        'watch_minutes': watch_minutes, 'game_hours': totals[('game', 'main')],
        'repeats': totals[('all', 'repeats')], 'unestimated_episodes': missing_runtime,
    }


def _music_stats(year, start, end, rating_mode):
    plays = MusicPlay.objects.filter(played_at__gte=start, played_at__lt=end)
    counts = plays.aggregate(plays=Count('id'), unique_items=Count('item_id', distinct=True))
    leaders = list(plays.values('item_id').annotate(plays=Count('id')).order_by('-plays', 'item_id')[:5])
    rows = {
        row['id']: row for row in MediaItem.objects.filter(pk__in=[item['item_id'] for item in leaders]).values(*CARD_FIELDS)
    }
    counts['top_items'] = [
        {**_card(rows[item['item_id']], year, rating_mode), 'plays': item['plays']}
        for item in leaders if item['item_id'] in rows
    ]
    return counts


def build_year_review(year=None, app_settings=None):
    years = _available_years()
    current_year = _local_date(timezone.now()).year
    if year is None:
        past_years = [value for value in years if value <= current_year]
        year = current_year if current_year in years else max(past_years, default=current_year)
    year = int(year)
    if not 1 <= year <= 9998:
        raise ValueError('Invalid review year.')
    years.add(year)
    start, end = year_bounds(year)
    if app_settings is None:
        app_settings = AppSettings.objects.first()
    rating_mode = app_settings.rating_mode if app_settings else 'faces'
    if rating_mode not in ('faces', 'stars_5', 'scale_10', 'scale_100'):
        rating_mode = 'faces'

    rows = list(MediaItem.objects.filter(
        date_added__gte=start, date_added__lt=end, status__in=('completed', 'dropped'),
    ).order_by('-date_added', '-id').values(*CARD_FIELDS))
    completed_rows = [row for row in rows if row['status'] == 'completed']
    media_order = _media_order(app_settings)
    completed = _group_cards([_card(row, year, rating_mode) for row in completed_rows], media_order)
    dropped = _group_cards([_card(row, year, rating_mode) for row in rows if row['status'] == 'dropped'], media_order)
    favorite_ids = {row['id'] for row in completed_rows if row['favorite']}
    favorites = _group_cards(sorted(
        (card for card in completed if card['id'] in favorite_ids),
        key=lambda card: (card['favorite_position'] is None, card['favorite_position'] or 0, card['id']),
    ), media_order)

    rated = [card for card in completed if card['rating'] is not None]
    rating = _rating_stats(completed, completed_rows, rating_mode)
    if rating_mode != 'faces':
        groups = {}
        for card in rated:
            groups.setdefault(card['rating'], []).append(card)
        highlights = []
        if len(groups) > 1:
            for score in sorted(groups, reverse=True):
                if len(highlights) + len(groups[score]) > 5:
                    break
                highlights.extend(groups[score])
            if len(highlights) >= 3:
                for card in highlights:
                    card['highlight'] = True

    media_counts = Counter(card['media_type'] for card in completed)
    month_counts = Counter(card['month'] for card in completed)
    movies = [row for row in completed_rows if row['media_type'] == 'movie']
    known_movies = [row for row in movies if row['total_main'] and row['total_main'] > 0]
    movie_minutes = sum(row['total_main'] for row in known_movies)
    tracked = _tracked_stats(year, start, end)
    tracked['estimated_minutes'] = movie_minutes + tracked['watch_minutes'] + tracked['game_hours'] * 60
    tracked['estimated_time_label'] = _duration_label(tracked['estimated_minutes'])
    music = _music_stats(year, start, end, rating_mode)

    hero_items = []
    used_ids, used_types = set(), set()
    candidates = favorites + completed
    if not candidates:
        candidates = dropped + music['top_items']
    for varied_only in (True, False):
        for card in candidates:
            if card['id'] in used_ids or (varied_only and card['media_type'] in used_types):
                continue
            hero_items.append(card)
            used_ids.add(card['id'])
            used_types.add(card['media_type'])
            if len(hero_items) == 6:
                break
        if len(hero_items) == 6:
            break
    editions = (('winter', 'Winter lights'), ('midnight', 'Midnight celebration'), ('confetti', 'Paper confetti'))
    edition_key, edition_label = editions[year % len(editions)]
    return {
        'year': year, 'years': sorted(years, reverse=True),
        'edition': {'key': edition_key, 'label': edition_label},
        'decoration': _year_decoration(year),
        'completed': completed, 'favorites': favorites, 'dropped': dropped, 'hero_items': hero_items,
        'counts': {'completed': len(completed), 'favorites': len(favorites), 'dropped': len(dropped)},
        'months': [
            {'number': month, 'label': month_name[month], 'short': month_name[month][:3], 'count': month_counts[month]}
            for month in range(1, 13)
        ],
        'stats': {
            'movie_minutes': movie_minutes, 'movie_hours_label': _duration_label(movie_minutes),
            'movie_count': len(movies), 'movie_runtime_count': len(known_movies),
            'media_counts': [
                {'key': key, 'label': label, 'count': media_counts[key],
                 'percent': round(media_counts[key] * 100 / len(completed), 2)}
                for key, label in MEDIA_LABELS.items() if media_counts[key]
            ],
            'rating': rating, 'tracked': tracked, 'music': music,
        },
    }
