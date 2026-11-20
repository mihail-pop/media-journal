"""Receive deferred music play batches without changing library entries."""

import json
import math
import re
from uuid import UUID

from django.conf import settings
from django.core.exceptions import RequestDataTooBig
from django.db import IntegrityError, OperationalError, transaction
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.http import require_POST

from core.models import MediaItem, MusicPlay


def _music_play(data):
    if not isinstance(data, dict):
        raise ValueError('Invalid play record.')
    identity = data.get('event_id')
    item_id = data.get('item_id')
    video_id = data.get('video_id')
    played_at = data.get('played_at')
    listened_seconds = data.get('listened_seconds')
    qualified = data.get('qualified', True)
    if not isinstance(identity, str) or len(identity) > 36:
        raise ValueError('Invalid play identifier.')
    identity = UUID(identity)
    if type(item_id) is not int or not 0 < item_id <= 9223372036854775807:
        raise ValueError('Invalid music item.')
    if not isinstance(video_id, str) or re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id) is None:
        raise ValueError('Invalid video identifier.')
    if not isinstance(qualified, bool):
        raise ValueError('Invalid play qualification.')
    if listened_seconds is not None:
        if (
            type(listened_seconds) not in (int, float)
            or not math.isfinite(listened_seconds)
            or not 0 <= listened_seconds <= 2147483647
        ):
            raise ValueError('Invalid listening duration.')
        listened_seconds = round(float(listened_seconds), 3)
    elif not qualified:
        raise ValueError('Unqualified listens must include their duration.')
    if not isinstance(played_at, str) or len(played_at) > 40:
        raise ValueError('Invalid playback date.')
    played_at = parse_datetime(played_at)
    if played_at is None or timezone.is_naive(played_at):
        raise ValueError('Playback dates must include a timezone.')
    if not settings.USE_TZ:
        # Match timezone.now() and the app's existing naive server-local dates.
        # On Windows the system timezone may differ from settings.TIME_ZONE.
        played_at = played_at.astimezone().replace(tzinfo=None)
    return identity, {
        'item_id': item_id, 'video_id': video_id, 'played_at': played_at,
        'listened_seconds': listened_seconds, 'qualified': qualified,
    }


def _merge_play(existing, incoming):
    """Merge cumulative observations without summing retries or lowering data."""
    if (existing['item_id'], existing['video_id']) != (incoming['item_id'], incoming['video_id']):
        raise ValueError('A play identifier cannot refer to different songs.')
    if incoming['qualified'] and not existing['qualified']:
        existing['played_at'] = incoming['played_at']
    existing['qualified'] = existing['qualified'] or incoming['qualified']
    seconds = incoming['listened_seconds']
    if seconds is not None:
        existing['listened_seconds'] = max(existing['listened_seconds'] or 0, seconds)


@require_POST
def record_music_plays(request):
    try:
        if len(request.body) > 65536:
            return JsonResponse({'success': False, 'error': 'Music play batch is too large.'}, status=413)
        data = json.loads(request.body)
        if not isinstance(data, dict) or not isinstance(data.get('plays'), list) or len(data['plays']) > 100:
            raise ValueError('Expected at most 100 music plays.')
        plays = {}
        for value in data['plays']:
            identity, values = _music_play(value)
            if identity in plays:
                _merge_play(plays[identity], values)
            else:
                plays[identity] = values
    except RequestDataTooBig:
        return JsonResponse({'success': False, 'error': 'Music play batch is too large.'}, status=413)
    except (ValueError, TypeError, OverflowError, UnicodeDecodeError):
        return JsonResponse({'success': False, 'error': 'Invalid music play batch.'}, status=400)

    if plays:
        try:
            with transaction.atomic():
                music_ids = set(MediaItem.objects.filter(
                    pk__in={values['item_id'] for values in plays.values()}, media_type='music',
                ).values_list('pk', flat=True))
                incoming = {identity: values for identity, values in plays.items() if values['item_id'] in music_ids}
                existing = {
                    play.event_id: play for play in MusicPlay.objects.select_for_update().filter(
                        event_id__in=incoming,
                    ).order_by('event_id')
                }
                pending = {identity: values for identity, values in incoming.items() if identity not in existing}
                if pending:
                    MusicPlay.objects.bulk_create([
                        MusicPlay(event_id=identity, **values) for identity, values in pending.items()
                    ], ignore_conflicts=True)
                    # A competing request may have inserted the same UUID while
                    # we waited. Read its current values before merging ours.
                    existing.update({
                        play.event_id: play for play in MusicPlay.objects.select_for_update().filter(
                            event_id__in=pending,
                        ).order_by('event_id')
                    })
                updates = []
                for identity, play in existing.items():
                    values = incoming[identity]
                    # Never move a saved UUID to another item/video after an
                    # old browser queue or a conflicting client request.
                    if (play.item_id, play.video_id) != (values['item_id'], values['video_id']):
                        continue
                    merged = {
                        'item_id': play.item_id, 'video_id': play.video_id, 'played_at': play.played_at,
                        'listened_seconds': play.listened_seconds, 'qualified': play.qualified,
                    }
                    _merge_play(merged, values)
                    if any(getattr(play, field) != merged[field] for field in ('listened_seconds', 'qualified', 'played_at')):
                        play.listened_seconds = merged['listened_seconds']
                        play.qualified = merged['qualified']
                        play.played_at = merged['played_at']
                        updates.append(play)
                if updates:
                    MusicPlay.objects.bulk_update(updates, ('listened_seconds', 'qualified', 'played_at'))
        except (OperationalError, IntegrityError):
            # Keep the browser queue for the next explicit close/start attempt.
            return JsonResponse({'success': False, 'error': 'Music history is temporarily busy.'}, status=503)

    # Missing/deleted items are acknowledged too, so they cannot block the queue.
    return JsonResponse({'success': True, 'acknowledged': [str(identity) for identity in plays]})
