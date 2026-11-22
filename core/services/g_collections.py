from django.db import transaction


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
