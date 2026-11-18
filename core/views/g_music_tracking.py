"""Receive deferred music play batches without changing library entries."""

import json
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
    if not isinstance(identity, str) or len(identity) > 36:
        raise ValueError('Invalid play identifier.')
    identity = UUID(identity)
    if type(item_id) is not int or not 0 < item_id <= 9223372036854775807:
        raise ValueError('Invalid music item.')
    if not isinstance(video_id, str) or re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id) is None:
        raise ValueError('Invalid video identifier.')
    if not isinstance(played_at, str) or len(played_at) > 40:
        raise ValueError('Invalid playback date.')
    played_at = parse_datetime(played_at)
    if played_at is None or timezone.is_naive(played_at):
        raise ValueError('Playback dates must include a timezone.')
    if not settings.USE_TZ:
        # Match timezone.now() and the app's existing naive server-local dates.
        # On Windows the system timezone may differ from settings.TIME_ZONE.
        played_at = played_at.astimezone().replace(tzinfo=None)
    return identity, {'item_id': item_id, 'video_id': video_id, 'played_at': played_at}


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
            plays.setdefault(identity, values)
    except RequestDataTooBig:
        return JsonResponse({'success': False, 'error': 'Music play batch is too large.'}, status=413)
    except (ValueError, TypeError, OverflowError, UnicodeDecodeError):
        return JsonResponse({'success': False, 'error': 'Invalid music play batch.'}, status=400)

    if plays:
        try:
            with transaction.atomic():
                existing = set(MusicPlay.objects.filter(event_id__in=plays).values_list('event_id', flat=True))
                pending = {identity: values for identity, values in plays.items() if identity not in existing}
                music_ids = set(MediaItem.objects.filter(
                    pk__in={values['item_id'] for values in pending.values()}, media_type='music',
                ).values_list('pk', flat=True))
                MusicPlay.objects.bulk_create([
                    MusicPlay(event_id=identity, **values)
                    for identity, values in pending.items() if values['item_id'] in music_ids
                ], ignore_conflicts=True)
        except (OperationalError, IntegrityError):
            # Keep the browser queue for the next explicit close/start attempt.
            return JsonResponse({'success': False, 'error': 'Music history is temporarily busy.'}, status=503)

    # Missing/deleted items are acknowledged too, so they cannot block the queue.
    return JsonResponse({'success': True, 'acknowledged': [str(identity) for identity in plays]})
