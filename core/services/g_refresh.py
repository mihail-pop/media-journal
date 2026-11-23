"""Prepare metadata off-database, then replace only the requested API fields."""
from django.db import transaction
from django.utils import timezone

from core.models import MediaItem
from core.services.g_api_errors import ApiError, as_api_error
from core.services.g_media_files import media_paths, remove_media_files


STRUCTURAL_FIELDS = ('cast', 'seasons', 'episodes', 'related_titles')
METADATA_FIELDS = STRUCTURAL_FIELDS + ('title', 'overview', 'release_date', 'genres',
                                      'creators', 'total_main', 'total_secondary')
FILE_FIELDS = STRUCTURAL_FIELDS + ('cover_url', 'banner_url')


class RefreshConflict(ValueError):
    def __init__(self):
        super().__init__('The item changed while refreshing. Please refresh it again.')


def prepared_data(result, provider):
    if not isinstance(result, dict):
        if hasattr(result, 'content'):
            import json
            message = json.loads(result.content).get('error', '')
            raise as_api_error(message, provider)
        raise ApiError(provider)
    data = result.get('item', result)
    if not isinstance(data, dict) or not isinstance(data.get('title'), str) or not data['title'].strip():
        raise ApiError(provider)
    return data


def prepare_full_refresh(item):
    from core.services.m_anime_manga import save_anilist_item
    from core.services.m_books import save_openlib_item
    from core.services.m_games import save_igdb_item
    from core.services.m_movies_tvshows import save_tmdb_item, save_tmdb_season
    from core.services.m_music import save_musicbrainz_item

    source, identity = item.source, str(item.source_id)
    kwargs = {'prepare_only': True}
    if source == 'tmdb':
        if '_s' in identity:
            show, season = identity.split('_s')
            result = save_tmdb_season(show, int(season), **kwargs)
        else:
            result = save_tmdb_item(item.media_type, identity, **kwargs)
    elif source in ('anilist', 'mal'):
        result = save_anilist_item(item.media_type, anilist_id=item.provider_ids.get('anilist'),
                                  mal_id=item.provider_ids.get('mal'), **kwargs)
    elif source == 'igdb':
        result = save_igdb_item(identity, **kwargs)
    elif source == 'openlib':
        result = save_openlib_item(identity, **kwargs)
    elif source == 'musicbrainz':
        result = save_musicbrainz_item(identity, **kwargs)
    else:
        raise ValueError('This item does not support metadata refresh.')
    return prepared_data(result, source)


def apply_refresh(item, data, fields, downloads, *, notify=False, refresh_runtime=True):
    if downloads.failure is not None:
        raise downloads.failure
    # Do not save the old in-memory instance: its personal fields may have been
    # edited while the provider was responding. Only API metadata is replaced.
    fields = [name for name in fields if name in METADATA_FIELDS + ('cover_url', 'banner_url') and name in data]
    runtime_changed = refresh_runtime and item.media_type in ('tv', 'anime') and data.get('episode_runtime') is not None
    guard_fields = set(fields) | set(FILE_FIELDS) | {'source', 'provider_ids', 'media_type', 'last_updated'}
    if runtime_changed:
        guard_fields.add('episode_runtime')
    with transaction.atomic():
        try:
            current = MediaItem.objects.select_for_update().get(pk=item.pk)
        except MediaItem.DoesNotExist as error:
            raise RefreshConflict() from error
        if any(getattr(current, name) != getattr(item, name) for name in guard_fields):
            raise RefreshConflict()
        before_files = media_paths([getattr(current, name, None) for name in FILE_FIELDS])
        changed = []
        for name in fields:
            value = data[name]
            # A missing image/runtime is not a replacement for a saved value.
            if name in ('cover_url', 'banner_url') and not value:
                continue
            setattr(current, name, value)
            changed.append(name)
        if runtime_changed:
            current.episode_runtime = data['episode_runtime']
            changed.append('episode_runtime')
        if notify and data.get('notification') and not current.notification:
            current.notification = True
            changed.append('notification')
        current.last_updated = timezone.now()
        changed.append('last_updated')
        current.save(update_fields=list(dict.fromkeys(changed)))
        retained_values = [getattr(current, name, None) for name in FILE_FIELDS]
        after_files = media_paths(retained_values)
        downloads.keep(after_files)
        transaction.on_commit(downloads.mark_committed)
        transaction.on_commit(lambda: remove_media_files(before_files - after_files), robust=True)
    return current
