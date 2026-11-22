from django import template

from core.services.g_journal import journal_page

register = template.Library()


@register.simple_tag
def journal_data(item):
    return journal_page(item)
