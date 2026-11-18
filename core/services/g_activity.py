"""Record explicit item edits without observing imports, restores or refreshes."""

from core.models import MediaItemActivity


def item_activity_state(item):
    """Capture the live baseline before editing, not a previous history row."""
    return {
        'progress_main': item.progress_main if item.media_type in ('tv', 'anime', 'manga', 'game', 'book') else None,
        'progress_secondary': item.progress_secondary if item.media_type in ('tv', 'manga') else None,
        'status': item.status,
        'repeats': item.repeats,
    }


def record_item_activity(item, before, *, origin='edit'):
    """Call after the final save, inside the same transaction as the item edit.

    No row is needed for unchanged values or an empty secondary counter becoming
    zero. Completion fills are observed once, and secondary changes never
    synthesize primary progress. No signals: creation/restore/refresh are baselines.
    """
    after = item_activity_state(item)
    if all(
        before[field] == after[field] if field == 'status'
        else (before[field] or 0) == (after[field] or 0)
        for field in before
    ):
        return None

    values = {}
    for field in before:
        values[f'{field}_before'] = before[field]
        values[f'{field}_after'] = after[field]
    return MediaItemActivity.objects.create(
        item=item, media_type=item.media_type, origin=origin, **values,
    )
