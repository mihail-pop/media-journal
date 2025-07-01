from django import template

register = template.Library()

@register.filter
def underscore_to_space(value):
    return value.replace('_', ' ')


@register.filter
def chunk(value, chunk_size):
    # Convert dict_items or any iterable to list first
    value = list(value)
    chunk_size = int(chunk_size)
    return [value[i:i + chunk_size] for i in range(0, len(value), chunk_size)]

@register.filter
def filter_by_media_type(items, media_type):
    return [item for item in items if item.get("media_type") == media_type]