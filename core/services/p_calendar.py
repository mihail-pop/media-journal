import concurrent.futures
import datetime
import re
import threading
import time
from collections import OrderedDict, defaultdict
from email.utils import parsedate_to_datetime

import requests
from django.db import transaction

from core.models import APIKey, CalendarEvent
from core.services.g_calendar_dates import (
    all_day_datetime,
    calendar_now,
    normalize_calendar_datetime,
)
from core.services.m_games import get_igdb_token


# Home and Calendar share this lock; network workers never write to SQLite.
SYNC_LOCK = threading.Lock()
_RETRY_SECONDS = 15 * 60
_MAX_RETRIES = 10000
_retry_lock = threading.Lock()
_retry_until = OrderedDict()
_provider_retry_until = {}
_provider_last_request = {}
_TV_EPISODES = re.compile(r"^Episodes? (\d+(?:-\d+)?(?:,\s*\d+(?:-\d+)?)*) \(S(\d+)\)$")
_ANIME_EPISODE = re.compile(r"^Episode \d+$")


class _RequestFailure(Exception):
    pass


class _ProviderDeferred(_RequestFailure):
    pass


def retry_sync_allowed(item_id, now=None):
    """Avoid repeating a failed request on every Home/Calendar visit."""
    current = now.timestamp() if now is not None else time.time()
    with _retry_lock:
        until = _retry_until.get(item_id, 0)
        if until <= current:
            _retry_until.pop(item_id, None)
            return True
        return False


def _remember_failure(items, provider=None):
    now = time.time()
    with _retry_lock:
        until = max(now + _RETRY_SECONDS, _provider_retry_until.get(provider, 0))
        for item in items:
            _retry_until[item.pk] = until
            _retry_until.move_to_end(item.pk)
        while len(_retry_until) > _MAX_RETRIES:
            _retry_until.popitem(last=False)


def _failed(result, items, error, provider=None):
    items = list(items)
    result['skipped_count' if isinstance(error, _ProviderDeferred) else 'failed_count'] += len(items)
    _remember_failure(items, provider)
    if not isinstance(error, _ProviderDeferred):
        print(f"Calendar {provider or 'item'} synchronization failed: {error}")


def _request_json(provider, method, url, *, interval=0, **kwargs):
    now = time.time()
    with _retry_lock:
        if _provider_retry_until.get(provider, 0) > now:
            raise _ProviderDeferred(f"{provider} requests are temporarily paused.")
        wait = max(0, interval - (now - _provider_last_request.get(provider, 0)))
    if wait:
        time.sleep(wait)
    with _retry_lock:
        if _provider_retry_until.get(provider, 0) > time.time():
            raise _ProviderDeferred(f"{provider} requests are temporarily paused.")
        _provider_last_request[provider] = time.time()
    try:
        response = getattr(requests, method)(url, timeout=10, **kwargs)
    except requests.RequestException as error:
        raise _RequestFailure('The request timed out or could not connect.') from error
    if response.status_code == 429:
        retry_after = response.headers.get('Retry-After', '')
        try:
            seconds = float(retry_after)
        except (TypeError, ValueError):
            try:
                seconds = parsedate_to_datetime(retry_after).timestamp() - time.time()
            except (TypeError, ValueError, OverflowError):
                seconds = 60
        with _retry_lock:
            _provider_retry_until[provider] = time.time() + max(1, seconds)
        raise _RequestFailure('The provider rate limit was reached; remaining requests are deferred.')
    if response.status_code != 200:
        raise _RequestFailure(f"The provider returned HTTP {response.status_code}.")
    try:
        return response.json()
    except (TypeError, ValueError) as error:
        raise _RequestFailure('The provider returned an invalid response.') from error


def cleanup_old_events():
    """Preserve the existing 90-day retention for API and custom events."""
    cutoff = calendar_now() - datetime.timedelta(days=90)
    deleted, _ = CalendarEvent.objects.filter(date__lt=cutoff).exclude(title="__API_SYNC__").delete()
    return bool(deleted)


def sync_items_with_apis(items):
    result = {'synced_count': 0, 'failed_count': 0, 'skipped_count': 0,
              'changed': cleanup_old_events()}
    groups = defaultdict(list)
    for item in items:
        if str(item.source_id or '').startswith('custom_'):
            result['skipped_count'] += 1
        elif item.source == 'tmdb' and item.media_type in ('movie', 'tv'):
            groups[item.media_type].append(item)
        elif item.source in ('anilist', 'mal') and item.media_type in ('anime', 'manga'):
            groups['anilist'].append(item)
        elif item.source == 'igdb' and item.media_type == 'game':
            groups['igdb'].append(item)
        else:
            result['skipped_count'] += 1
    _sync_tmdb_movies(groups['movie'], result)
    _sync_tmdb_tv(groups['tv'], result)
    _sync_anilist(groups['anilist'], result)
    _sync_igdb(groups['igdb'], result)
    return result


def _complete(item, result, apply_events, provider):
    try:
        with transaction.atomic():
            changed = apply_events()
            item.calendar_last_sync = calendar_now()
            item.save(update_fields=['calendar_last_sync'])
    except Exception as error:
        _failed(result, [item], error, provider)
        return
    with _retry_lock:
        _retry_until.pop(item.pk, None)
    result['synced_count'] += 1
    result['changed'] = result['changed'] or changed


def _api_events(item):
    return CalendarEvent.objects.filter(item=item, is_custom=False).exclude(title="__API_SYNC__")


def _recent_date(date):
    if date is not None and date >= calendar_now() - datetime.timedelta(days=90):
        return date
    return None


def _update_release(item, title, date, *, notify=False):
    """An existing row survives a date change, preserving its notification toggle."""
    existing = list(_api_events(item).filter(title=title).order_by('id'))
    date = _recent_date(date)
    if date is None:
        if existing:
            _api_events(item).filter(pk__in=[event.pk for event in existing]).delete()
        return bool(existing)
    if not existing:
        CalendarEvent.objects.create(item=item, title=title, date=date,
                                     is_custom=False, notify=notify)
        return True
    primary = next((event for event in existing if event.date == date), existing[0])
    fields = []
    if primary.date != date:
        primary.date = date
        primary.notified = False
        fields.extend(['date', 'notified'])
    if any(event.notify for event in existing) and not primary.notify:
        primary.notify = True
        fields.append('notify')
    if fields:
        primary.save(update_fields=fields)
    duplicates = [event.pk for event in existing if event.pk != primary.pk]
    if duplicates:
        _api_events(item).filter(pk__in=duplicates).delete()
    return bool(fields or duplicates)


def _tmdb_key(items, result):
    try:
        key = APIKey.objects.get(name='tmdb').key_1
    except APIKey.DoesNotExist:
        key = None
    if not key:
        result['skipped_count'] += len(items)
    return key


def _sync_tmdb_movies(items, result):
    if not items:
        return
    api_key = _tmdb_key(items, result)
    if not api_key:
        return

    def fetch(item):
        try:
            data = _request_json('tmdb', 'get',
                f"https://api.themoviedb.org/3/movie/{item.source_id}", params={'api_key': api_key})
            if not isinstance(data, dict) or 'release_date' not in data:
                raise _RequestFailure('The movie response is incomplete.')
            release = data.get('release_date')
            date = all_day_datetime(datetime.date.fromisoformat(release)) if release else None
            return item, date, None
        except Exception as error:
            return item, None, error

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        responses = list(executor.map(fetch, items))
    for item, date, error in responses:
        if error is not None:
            _failed(result, [item], error, 'tmdb')
        else:
            _complete(item, result, lambda: _update_release(item, 'Global Release', date), 'tmdb')


def _parse_tv_episodes(title):
    match = _TV_EPISODES.fullmatch(title or '')
    if not match:
        return None
    episodes = set()
    for part in match[1].split(','):
        ends = part.strip().split('-')
        first, last = int(ends[0]), int(ends[-1])
        if last < first or last - first > 10000:
            return None
        episodes.update(range(first, last + 1))
    return int(match[2]), episodes


def _tv_episode_title(season, episodes):
    numbers = sorted(episodes)
    if len(numbers) == 1:
        return f"Episode {numbers[0]} (S{season})"
    ranges = []
    first = last = numbers[0]
    for number in numbers[1:]:
        if number == last + 1:
            last = number
        else:
            ranges.append(str(first) if first == last else f"{first}-{last}")
            first = last = number
    ranges.append(str(first) if first == last else f"{first}-{last}")
    return f"Episodes {', '.join(ranges)} (S{season})"


def _reconcile_tv(item, seasons, selected_season):
    existing = list(_api_events(item).order_by('date', 'id'))
    parsed = [(event, _parse_tv_episodes(event.title)) for event in existing]
    parsed = [(event, identity) for event, identity in parsed if identity is not None]
    default_notify = existing[-1].notify if existing else False
    desired = defaultdict(set)
    for season, episodes in seasons.items():
        for episode in episodes:
            air_date = episode.get('air_date')
            if not air_date:
                continue
            date = _recent_date(all_day_datetime(datetime.date.fromisoformat(air_date)))
            if date is not None:
                desired[season, date].add(int(episode['episode_number']))

    used = set()
    changed = False
    for (season, date), episodes in sorted(desired.items(), key=lambda entry: (entry[0][1], entry[0][0])):
        title = _tv_episode_title(season, episodes)
        # Original overlap is also used when a grouped event splits into rows on
        # different days: each new row inherits its old notification preference.
        overlap = [(event, identity) for event, identity in parsed
                   if identity[0] == season and identity[1] & episodes]
        candidates = [(event, identity) for event, identity in overlap if event.pk not in used]
        candidates.sort(key=lambda candidate: (
            candidate[1][1] != episodes,
            candidate[0].date != date,
            -len(candidate[1][1] & episodes), candidate[0].pk))
        notify = any(event.notify for event, _ in overlap) if overlap else default_notify
        if not candidates:
            CalendarEvent.objects.create(item=item, date=date, title=title,
                                         is_custom=False, notify=notify)
            changed = True
            continue
        event, identity = candidates[0]
        used.add(event.pk)
        fields = []
        if event.date != date:
            event.date = date
            fields.append('date')
        if event.title != title:
            event.title = title
            fields.append('title')
        if fields and event.notified:
            event.notified = False
            fields.append('notified')
        if event.notify != notify:
            event.notify = notify
            fields.append('notify')
        if fields:
            event.save(update_fields=fields)
            changed = True
    # Reconcile future predictions and duplicate/moved episode rows only after
    # complete season responses. Missing historical episodes remain available.
    desired_numbers = defaultdict(set)
    for (season, _), episodes in desired.items():
        desired_numbers[season].update(episodes)
    now = calendar_now()
    obsolete = [event.pk for event, identity in parsed if event.pk not in used and (
        (identity[0] in seasons and
         (event.date > now or identity[1] & desired_numbers[identity[0]])) or
        # These came from the old bug that attached other seasons to this entry.
        (selected_season is not None and identity[0] != selected_season)
    )]
    if obsolete:
        _api_events(item).filter(pk__in=obsolete).delete()
        changed = True
    return changed


def _sync_tmdb_tv(items, result):
    if not items:
        return
    api_key = _tmdb_key(items, result)
    if not api_key:
        return
    known_seasons = {}
    for item in items:
        known_seasons[item.pk] = {
            identity[0] for event in _api_events(item)
            if (identity := _parse_tv_episodes(event.title)) is not None
        }

    def fetch(item):
        try:
            match = re.fullmatch(r"(\d+)(?:_s(\d+))?", str(item.source_id or ''))
            if not match:
                raise _RequestFailure('The saved TV identifier is invalid.')
            base_id = match[1]
            selected = int(match[2]) if match[2] is not None else None
            if selected is not None:
                season_numbers = {selected}
            else:
                data = _request_json('tmdb', 'get', f"https://api.themoviedb.org/3/tv/{base_id}",
                                     params={'api_key': api_key})
                if not isinstance(data, dict) or 'seasons' not in data:
                    raise _RequestFailure('The TV response is incomplete.')
                season_numbers = set(known_seasons[item.pk])
                for name in ('last_episode_to_air', 'next_episode_to_air'):
                    episode = data.get(name)
                    if episode is not None:
                        season_numbers.add(int(episode['season_number']))
            seasons = {}
            for number in sorted(season_numbers):
                data = _request_json('tmdb', 'get',
                    f"https://api.themoviedb.org/3/tv/{base_id}/season/{number}",
                    params={'api_key': api_key})
                if not isinstance(data, dict) or not isinstance(data.get('episodes'), list):
                    raise _RequestFailure('The season response is incomplete.')
                seasons[number] = data['episodes']
            return item, seasons, selected, None
        except Exception as error:
            return item, None, None, error

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        responses = list(executor.map(fetch, items))
    for item, seasons, selected, error in responses:
        if error is not None:
            _failed(result, [item], error, 'tmdb')
        else:
            _complete(item, result, lambda: _reconcile_tv(item, seasons, selected), 'tmdb')


def _provider_batches(items, provider, result):
    mapped = defaultdict(list)
    for item in items:
        value = item.provider_ids.get('anilist') if provider == 'anilist' else item.source_id
        try:
            identifier = int(value)
            if identifier <= 0:
                raise ValueError
        except (TypeError, ValueError):
            result['skipped_count'] += 1
            continue
        mapped[identifier].append(item)
    identifiers = list(mapped)
    for offset in range(0, len(identifiers), 50):
        yield identifiers[offset:offset + 50], mapped


def _reconcile_anilist(item, media):
    existing = list(_api_events(item).order_by('date', 'id'))
    notify = existing[-1].notify if existing else False
    next_episode = media.get('nextAiringEpisode')
    keep_title = None
    if next_episode is not None:
        date = normalize_calendar_datetime(datetime.datetime.fromtimestamp(
            next_episode['airingAt'], tz=datetime.timezone.utc))
        keep_title = f"Episode {int(next_episode['episode'])}"
        changed = _update_release(item, keep_title, date, notify=notify)
    else:
        start = media.get('startDate') or {}
        date = (all_day_datetime(datetime.date(start['year'], start['month'], start['day']))
                if all(start.get(part) for part in ('year', 'month', 'day')) else None)
        changed = _update_release(item, 'Release Date', date)
    # Keep past episode history. This still fetches only the next airing, not a
    # historical episode schedule, while removing obsolete future predictions.
    obsolete = [event.pk for event in existing if event.date > calendar_now() and
                event.title != keep_title and
                (_ANIME_EPISODE.fullmatch(event.title or '') or
                 (keep_title is not None and event.title == 'Release Date'))]
    if obsolete:
        _api_events(item).filter(pk__in=obsolete).delete()
        changed = True
    return changed


def _sync_anilist(items, result):
    query = """
    query ($ids: [Int]) {
      Page(perPage: 50) {
        media(id_in: $ids) {
          id
          nextAiringEpisode { airingAt episode }
          startDate { year month day }
        }
      }
    }
    """
    for identifiers, mapped in _provider_batches(items, 'anilist', result):
        batch = [item for identifier in identifiers for item in mapped[identifier]]
        try:
            data = _request_json('anilist', 'post', 'https://graphql.anilist.co', interval=2.1,
                                 json={'query': query, 'variables': {'ids': identifiers}})
            if not isinstance(data, dict) or data.get('errors'):
                raise _RequestFailure('AniList returned query errors.')
            media = data.get('data', {}).get('Page', {}).get('media')
            if not isinstance(media, list):
                raise _RequestFailure('The AniList response is incomplete.')
            found = {int(entry['id']): entry for entry in media}
        except Exception as error:
            _failed(result, batch, error, 'anilist')
            continue
        for identifier in identifiers:
            for item in mapped[identifier]:
                if identifier not in found:
                    _failed(result, [item], _RequestFailure('AniList did not return this item.'), 'anilist')
                else:
                    _complete(item, result,
                              lambda: _reconcile_anilist(item, found[identifier]), 'anilist')


class _TokenHTTP:
    @staticmethod
    def post(url, **kwargs):
        # The shared token helper accepts a transport but has no own timeout.
        kwargs.setdefault('timeout', 10)
        return requests.post(url, **kwargs)


def _sync_igdb(items, result):
    if not items:
        return
    try:
        keys = APIKey.objects.get(name='igdb')
    except APIKey.DoesNotExist:
        keys = None
    if keys is None or not keys.key_1 or not keys.key_2:
        result['skipped_count'] += len(items)
        return
    try:
        token = get_igdb_token(http=_TokenHTTP())
        if not token:
            raise _RequestFailure('IGDB authorization failed.')
    except Exception as error:
        _failed(result, items, error, 'igdb')
        return
    headers = {'Client-ID': keys.key_1, 'Authorization': f'Bearer {token}'}
    for identifiers, mapped in _provider_batches(items, 'igdb', result):
        batch = [item for identifier in identifiers for item in mapped[identifier]]
        query = f"fields id, first_release_date; where id = ({','.join(map(str, identifiers))}); limit 50;"
        try:
            games = _request_json('igdb', 'post', 'https://api.igdb.com/v4/games', interval=0.3,
                                  headers=headers, data=query)
            if not isinstance(games, list):
                raise _RequestFailure('The IGDB response is incomplete.')
            found = {int(game['id']): game for game in games}
        except Exception as error:
            _failed(result, batch, error, 'igdb')
            continue
        for identifier in identifiers:
            for item in mapped[identifier]:
                if identifier not in found:
                    _failed(result, [item], _RequestFailure('IGDB did not return this item.'), 'igdb')
                    continue

                def apply():
                    timestamp = found[identifier].get('first_release_date')
                    date = (all_day_datetime(datetime.datetime.fromtimestamp(
                        timestamp, tz=datetime.timezone.utc).date()) if timestamp else None)
                    return _update_release(item, 'Game Release', date)

                _complete(item, result, apply, 'igdb')
