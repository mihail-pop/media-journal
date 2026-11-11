import re
import html
from html.parser import HTMLParser
from urllib.parse import urlsplit

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

def _anilist_local_url(url):
    """Map known AniList entity paths to our source-aware routes, without requests."""
    if url.netloc:
        if url.scheme.lower() not in ('', 'http', 'https') or url.hostname not in ('anilist.co', 'www.anilist.co'):
            return None
    elif url.scheme:
        return None

    match = re.fullmatch(r'/(character|staff|anime|manga)/([1-9][0-9]*)(?:/.*)?', url.path)
    if match:
        kind, entity_id = match.groups()
        if kind == 'character':
            return f'/character/{entity_id}/'
        if kind == 'staff':
            return f'/person/anilist/{entity_id}/'
        return f'/anilist/{kind}/{entity_id}/'

    # Already-local links remain valid if content was edited or saved that way.
    if not url.netloc and re.fullmatch(r'/(?:person/anilist|anilist/anime|anilist/manga)/[1-9][0-9]*/?', url.path):
        return url.path.rstrip('/') + '/'
    return None


class SecureHTMLParser(HTMLParser):
    def __init__(self, allow_links=False):
        super().__init__()
        self.allow_links = allow_links
        self.link_stack = []
        self.allowed_tags = {'br', 'strong', 'b', 'em', 'i', 'u', 'p', 'span', 'div'}
        if allow_links:
            self.allowed_tags.add('a')
        self.result = []
        self.in_script = 0  # Counter to completely ignore content inside <script> or <style>

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in ['script', 'style']:
            self.in_script += 1
        elif not self.in_script and tag in self.allowed_tags:
            if self.allow_links and tag in ('p', 'div'):
                # Descriptions live inside an existing <p class="overview">.
                # Nested paragraphs would close that element in the browser,
                # putting text outside the app's five-line clamp and styling.
                self.result.append('<br><br>')
                return

            if tag == 'a':
                href = next((value for name, value in attrs if name == 'href'), '') or ''
                href = href.strip()
                local_url = None
                valid = False
                try:
                    if not any(ord(char) < 32 or ord(char) == 127 for char in href):
                        url = urlsplit(href)
                        local_url = _anilist_local_url(url)
                        valid = bool(local_url) or (
                            self.allow_links is True and url.scheme.lower() in ('https', 'http')
                            and bool(url.hostname)
                        )
                except ValueError:
                    valid = False
                self.link_stack.append(valid)
                if valid:
                    destination = html.escape(local_url or href, quote=True)
                    # Internal links navigate in this tab; external sites open separately.
                    attributes = '' if local_url else ' target="_blank" rel="noopener noreferrer"'
                    self.result.append(f'<a href="{destination}"{attributes}>')
                return

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
        # <br> is a void element. HTMLParser also calls this for <br />.
        if tag == 'br':
            return
        if tag in ['script', 'style']:
            self.in_script = max(0, self.in_script - 1)
        elif not self.in_script and tag in self.allowed_tags:
            if self.allow_links and tag in ('p', 'div'):
                self.result.append('<br><br>')
            elif tag == 'a':
                if self.link_stack and self.link_stack.pop():
                    self.result.append('</a>')
            else:
                self.result.append(f"</{tag}>")

    def handle_data(self, data):
        if not self.in_script:
            # Safely escape any random text (e.g. converting < and > to &lt; and &gt;)
            escaped = html.escape(data)
            if self.allow_links:
                # Format only text nodes, never underscores or asterisks inside URLs.
                escaped = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', escaped)
                escaped = re.sub(r'\*(.+?)\*', r'<em>\1</em>', escaped)
                escaped = re.sub(r'\_(.+?)\_', r'<em>\1</em>', escaped)
            self.result.append(escaped)

    # Handle special characters like &amp; 
    def handle_entityref(self, name):
        if not self.in_script:
            self.result.append(f"&{name};")

    def handle_charref(self, name):
        if not self.in_script:
            self.result.append(f"&#{name};")

    def get_clean_html(self):
        return "".join(self.result) + "</a>" * sum(self.link_stack)


@register.filter
def safe_html(value, allow_links=False):
    """
    Whitelist formatting tags, remove scripts and convert Markdown/newlines.
    True retains safe external links and rewrites AniList entity links locally.
    'anilist' retains only those internal links. Incoming attributes are stripped.
    """
    if not value:
        return ''
    
    # Link-enabled content formats text nodes in the parser to preserve URLs.
    if not allow_links:
        value = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', value)
        value = re.sub(r'\*(.+?)\*', r'<em>\1</em>', value)
        value = re.sub(r'\_(.+?)\_', r'<em>\1</em>', value)

    # Parse and sanitize the HTML
    parser = SecureHTMLParser(allow_links=allow_links)
    parser.feed(value)
    clean_text = parser.get_clean_html()
    
    # Normalize Windows/Mac newlines to standard \n
    text = clean_text.replace('\r\n', '\n').replace('\r', '\n')
    
    # Fix double spacing
    text = re.sub(r'(\n[ \t]*)+<br>', '<br>', text)  # Removes \n before <br>
    text = re.sub(r'<br>([ \t]*\n)+', '<br>', text)  # Removes \n after <br>
    
    # Convert all remaining, meaningful newlines into <br> tags
    formatted_text = text.replace('\n', '<br>')
    if allow_links:
        # AniList's block boundaries and HTML whitespace can otherwise add
        # several breaks for one paragraph. Keep the app's paragraph spacing.
        formatted_text = re.sub(r'(?:<br>\s*){3,}', '<br><br>', formatted_text)
        formatted_text = re.sub(r'^(?:\s|<br>)+|(?:\s|<br>)+$', '', formatted_text)
    
    # Mark safe for django so it renders the html
    return mark_safe(formatted_text)