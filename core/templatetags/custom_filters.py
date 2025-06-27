from django import template

register = template.Library()

@register.filter
def underscore_to_space(value):
    return value.replace('_', ' ')