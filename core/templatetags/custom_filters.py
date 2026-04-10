import re
import html
from html.parser import HTMLParser

from django import template
from django.utils.timezone import now
from django.utils.safestring import mark_safe

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
def split(value, delimiter):
    """Split a string by delimiter and return a list"""
    try:
        return str(value).split(str(delimiter))
    except (AttributeError, TypeError):
        return []

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

class SecureHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.allowed_tags = {'br', 'strong', 'b', 'em', 'i', 'u', 'p', 'span', 'div'}
        self.result = []
        self.in_script = 0  # Counter to completely ignore content inside <script> or <style>

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in ['script', 'style']:
            self.in_script += 1
        elif not self.in_script and tag in self.allowed_tags:
            
            # Allow spoiler class on spans
            if tag == 'span':
                for attr_name, attr_value in attrs:
                    if attr_name == 'class' and attr_value and 'spoiler' in attr_value.lower():
                        self.result.append('<span class="spoiler">')
                        return

            # Rebuild the tag with zero attributes. 
            self.result.append(f"<{tag}>")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in ['script', 'style']:
            self.in_script = max(0, self.in_script - 1)
        elif not self.in_script and tag in self.allowed_tags:
            self.result.append(f"</{tag}>")

    def handle_data(self, data):
        if not self.in_script:
            # Safely escape any random text (e.g. converting < and > to &lt; and &gt;)
            self.result.append(html.escape(data))

    # Handle special characters like &amp; 
    def handle_entityref(self, name):
        if not self.in_script:
            self.result.append(f"&{name};")

    def handle_charref(self, name):
        if not self.in_script:
            self.result.append(f"&#{name};")

    def get_clean_html(self):
        return "".join(self.result)


@register.filter
def safe_html(value):
    """
    Whitelist safe HTML tags, strip ALL attributes, remove scripts,
    convert Markdown bold to HTML, and smartly convert text newlines.
    """
    if not value:
        return ''
    
    # Convert markdown to html
    value = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', value)
    value = re.sub(r'\*(.+?)\*', r'<em>\1</em>', value)
    value = re.sub(r'\_(.+?)\_', r'<em>\1</em>', value)

    # Parse and sanitize the HTML
    parser = SecureHTMLParser()
    parser.feed(value)
    clean_text = parser.get_clean_html()
    
    # Normalize Windows/Mac newlines to standard \n
    text = clean_text.replace('\r\n', '\n').replace('\r', '\n')
    
    # Fix double spacing
    text = re.sub(r'(\n[ \t]*)+<br>', '<br>', text)  # Removes \n before <br>
    text = re.sub(r'<br>([ \t]*\n)+', '<br>', text)  # Removes \n after <br>
    
    # Convert all remaining, meaningful newlines into <br> tags
    formatted_text = text.replace('\n', '<br>')
    
    # Mark safe for django so it renders the html
    return mark_safe(formatted_text)