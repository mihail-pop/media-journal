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
