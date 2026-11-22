from django.db import transaction
from django.urls import reverse


def collection_targets(data):
    """Typed picker keys keep media and person IDs separate, including selections across tabs."""
    if 'entries' not in data:
        return [('media', pk) for pk in collection_ids(data, 'item_ids')]
    values = data['entries']
    if not isinstance(values, list):
        raise ValueError('Invalid item selection.')
    targets = []
    for value in values:
        if not isinstance(value, str) or ':' not in value:
            raise ValueError('Invalid item selection.')
        kind, pk = value.split(':', 1)
        if kind not in ('media', 'person'):
            raise ValueError('Invalid item selection.')
        target_id = collection_ids({'ids': [pk]}, 'ids')[0]
        targets.append((kind, target_id))
    return list(dict.fromkeys(targets))


def collection_preview(entry):
    if entry.item_id is not None:
        return {'url': entry.item.cover_url or '/static/core/img/placeholder.png',
                'media_type': entry.item.media_type}
    return {'url': entry.person.image_url or '/static/core/img/placeholder.png',
            'media_type': entry.person.type}


def collection_entry_data(entry):
    preview = collection_preview(entry)
    if entry.item_id is None:
        person = entry.person
        return {
            'id': person.pk, 'entry_id': entry.pk, 'kind': 'person',
            'title': person.name, 'media_type': person.type, 'cover_url': preview['url'],
            'banner_url': '', 'position': entry.position, 'personal_rating': None,
            'date_added': person.date_added.isoformat(), 'release_date': '',
            'url': person.get_absolute_url(),
        }

    item = entry.item
    url = '#'
    if item.media_type in ('movie', 'tv'):
        if '_s' in str(item.source_id):
            show_id, season = str(item.source_id).split('_s', 1)
            url = reverse('tmdb_season_detail', args=[show_id, season])
        else:
            url = reverse('tmdb_detail', args=[item.media_type, item.source_id])
    elif item.media_type in ('anime', 'manga'):
        url = reverse('anilist_detail', args=[item.source, item.media_type, item.source_id])
    elif item.media_type == 'game':
        url = reverse('igdb_detail', args=[item.source_id])
    elif item.media_type == 'book':
        url = reverse('openlib_detail', args=[item.source_id])
    elif item.media_type == 'music':
        url = reverse('musicbrainz_detail', args=[item.source_id])
    return {
        'id': item.pk, 'entry_id': entry.pk, 'kind': 'media', 'title': item.title,
        'media_type': item.media_type, 'cover_url': preview['url'], 'banner_url': item.banner_url,
        'position': entry.position, 'personal_rating': item.personal_rating,
        'date_added': item.date_added.isoformat() if item.date_added else '',
        'release_date': item.release_date, 'url': url,
    }


def collection_ids(data, key):
    """Accept browser-supplied IDs without accepting duplicates or invalid values."""
    values = data.get(key, [])
    if not isinstance(values, list):
        raise ValueError('Invalid item selection.')
    ids = []
    for value in values:
        if isinstance(value, bool) or not str(value).isdigit() or int(value) < 1:
            raise ValueError('Invalid item selection.')
        ids.append(int(value))
    return list(dict.fromkeys(ids))


def save_collection_order(queryset, order, key='pk'):
    """Save a loaded prefix together; items beyond it retain their positions."""
    if not order:
        return
    rows = list(queryset.filter(**{f'{key}__in': order}).only('pk', key))
    by_id = {getattr(row, key): row for row in rows}
    if len(by_id) != len(order):
        raise ValueError('Some items no longer exist. Reload the page and try again.')
    for position, row_id in enumerate(order, 1):
        by_id[row_id].position = position
    with transaction.atomic():
        updated = queryset.bulk_update(rows, ['position'])
        if updated != len(rows):
            raise ValueError('Some items changed. Reload the page and try again.')
