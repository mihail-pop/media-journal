from django import template
from django.utils.timezone import now

register = template.Library()

@register.filter
def to_int(value):
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return 0

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

@register.filter
def divide(value, divisor):
    try:
        val = float(value)
        div = float(divisor)
        if div == 0:
            return ''
        result = round(val / div)
        # Ensure minimum of 1 for any nonzero input
        if val != 0 and result < 1:
            return 1
        return result
    except (ValueError, ZeroDivisionError, TypeError):
        return ''
    
@register.filter
def timesince_one_unit(value):
    """
    Returns the time since `value` as a single unit, e.g.:
    - "5 minutes ago"
    - "3 hours ago"
    - "2 days ago"
    """
    if not value:
        return ""

    delta = now() - value

    minutes = int(delta.total_seconds() // 60)
    hours = int(delta.total_seconds() // 3600)
    days = delta.days
    weeks = days // 7
    months = days // 30
    years = days // 365

    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
    elif hours < 24:
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    elif days < 7:
        return f"{days} day{'s' if days != 1 else ''} ago"
    elif weeks < 4:
        return f"{weeks} week{'s' if weeks != 1 else ''} ago"
    elif months < 12:
        return f"{months} month{'s' if months != 1 else ''} ago"
    else:
        return f"{years} year{'s' if years != 1 else ''} ago"