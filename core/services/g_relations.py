"""Read legacy relation lists and relation metadata without rewriting old rows."""


def related_entries(value):
    entries = value.get('items') if isinstance(value, dict) else value
    return entries if isinstance(entries, list) else []


def extra_relations_available(value):
    flag = value.get('has_extra_relations') if isinstance(value, dict) else None
    return flag if isinstance(flag, bool) else None


def pack_relations(entries, has_extra_relations):
    if not isinstance(has_extra_relations, bool):
        return entries
    return {'items': entries, 'has_extra_relations': has_extra_relations}
