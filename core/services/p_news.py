"""Fetch the latest videos from selected YouTube channels, without caching."""

import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html import unescape
from urllib.parse import quote, unquote, urlsplit
from xml.etree import ElementTree

import requests

logger = logging.getLogger(__name__)

YOUTUBE_FEED_URL = 'https://www.youtube.com/feeds/videos.xml'
MAX_FEED_BYTES = 2 * 1024 * 1024
NEWS_SORTS = ('date', 'views')
NEWS_ORDERS = ('asc', 'desc')

# Keep the experimental channel selection here, rather than in the database.
NEWS_CHANNELS = {
    'movie': (
        {'id': 'UC7v3-2K1N84V67IF-WTRG-Q', 'name': 'Jeremy Jahns'},
        {'id': 'UCbiOAho0h23IMInURiESx1w', 'name': 'Dan Murrell'},
        {'id': 'UCCqEeDAUf4Mg0GgEN658tkA', 'name': 'Chris Stuckmann'},
    ),
    'tv': (
        {'id': 'UCQhHCq1Xyj3pVEx1ebf49HQ', 'name': 'Movies And Munchies'},
        {'id': 'UC8zAiZUuUXe-touFVopBbZw', 'name': 'Pete Peppers'},
        {'id': 'UCGaE6BmH_h2eOo12binZ2Tg', 'name': 'BrainPilot'},
    ),
    'anime': (
        {'id': 'UCBs2Y3i14e1NWQxOGliatmg', 'name': "Mother's Basement"},
        {'id': 'UCmEbe0XH51CI09gm_9Fcn8Q', 'name': 'Glass Reflection'},
        {'id': 'UC7dF9qfBMXrSlaaFFDvV_Yg', 'name': 'Gigguk'},
    ),
    'manga': (
        {'id': 'UCj8mAcR6Mu1dvaXQ6BdShRQ', 'name': 'The Masked Man'},
        {'id': 'UCbXBnHUfiuZJYfjmocDfhEQ', 'name': 'lines in motion'},
    ),
    'game': (
        {'id': 'UCNvzD7Z-g64bPXxGzaQaa4g', 'name': 'gameranx'},
        {'id': 'UCoIXnB865l9Ex9zs4OIXTdQ', 'name': 'Spawn Wave'},
        {'id': 'UCZ7AeeVbyslLM_8-nVy2B8Q', 'name': 'Skill Up'},
    ),
    'book': (
        {'id': 'UCkSMDOtrKr43OGSSmKnx6tQ', 'name': 'The Book Leo'},
        {'id': 'UCiflcKnh5cZiRWK7jlYKwxA', 'name': 'Elliot Brooks'},
    ),
    'music': (
        {'id': 'UCt7fwAhXDy3oNFTAzF2o8Pw', 'name': 'The Needle Drop'},
    ),
}

# Channel metadata for the built-in selection. These small images need no
# channel-page lookups on visits; custom avatars are resolved when added.
_DEFAULT_AVATARS = {
    'UC7v3-2K1N84V67IF-WTRG-Q': 'https://yt3.googleusercontent.com/ytc/AIdro_kyPT4GF3MmoXldDs8Hm-sCG8hcQpbSJpJyrp1LD0Am36o=s88-c-k-c0x00ffffff-no-rj',
    'UCbiOAho0h23IMInURiESx1w': 'https://yt3.googleusercontent.com/K-lmt8KzrylumGEBjfkpaEumuqy4RVJTbd3zVr-eOfUHQufflSEhW9xXLxCHKE8eJuvrkULiKw=s88-c-k-c0x00ffffff-no-rj',
    'UCCqEeDAUf4Mg0GgEN658tkA': 'https://yt3.googleusercontent.com/ytc/AIdro_nUsWH_xUL8Vx_BmlIIvIX5ng5qfeMV8D_Z7lQj8f23Aw=s88-c-k-c0x00ffffff-no-rj',
    'UCQhHCq1Xyj3pVEx1ebf49HQ': 'https://yt3.googleusercontent.com/osXDcYE-BSwIYX_QR4cRPznRjnKXwp-pmZRk5fnvEKxbsFamZuUp3dpii7jsq-ITX0LNPCHaUw=s88-c-k-c0x00ffffff-no-rj',
    'UC8zAiZUuUXe-touFVopBbZw': 'https://yt3.googleusercontent.com/ytc/AIdro_nXdRu64gEOJkH_qu58gloj37hl1JzR4IL_szWBAaLfBVg=s88-c-k-c0x00ffffff-no-rj',
    'UCGaE6BmH_h2eOo12binZ2Tg': 'https://yt3.googleusercontent.com/ytc/AIdro_lrKq0I87GeJzWbuO9Bc7Wjt6dmPY3eCEjLnpRuN9mKM7E=s88-c-k-c0x00ffffff-no-rj',
    'UCBs2Y3i14e1NWQxOGliatmg': 'https://yt3.googleusercontent.com/ytc/AIdro_mf9reSjYm5GJHCk_cfF6KUHlw978Qt1aKVnp0eMCScaA4=s88-c-k-c0x00ffffff-no-rj',
    'UCmEbe0XH51CI09gm_9Fcn8Q': 'https://yt3.googleusercontent.com/ytc/AIdro_nbw5H-NYzcnJsvLVzPb-NaZhCHeQroNSla7U79iLb7jCw=s88-c-k-c0x00ffffff-no-rj',
    'UC7dF9qfBMXrSlaaFFDvV_Yg': 'https://yt3.googleusercontent.com/ex06TVdD67trgeP-PKsnz48deASh64ktURCTVJ1i4eIq_U4Px0c0ATNRxCSyiV9jJEyWdH6gtw=s88-c-k-c0x00ffffff-no-rj',
    'UCj8mAcR6Mu1dvaXQ6BdShRQ': 'https://yt3.googleusercontent.com/mlB93O1XYyZQhxBbCWHcCJuL7iyqAMWs8ssAiCCujguDOoo-KxF10eLpL5GvyTyVXZa0n9h7Dg=s88-c-k-c0x00ffffff-no-rj',
    'UCbXBnHUfiuZJYfjmocDfhEQ': 'https://yt3.googleusercontent.com/gG5r7Pz2n7ZUg1nbLkUhNOqSqKNh6Np9WX648azXGGfHL5WKy-DllH8y37xQaO2BlEyvHIMkr9I=s88-c-k-c0x00ffffff-no-rj',
    'UCNvzD7Z-g64bPXxGzaQaa4g': 'https://yt3.googleusercontent.com/ytc/AIdro_mT3hsjvr0yyS6bW4inz3956572zV_j4t7TLsEOkK0G1VM=s88-c-k-c0x00ffffff-no-rj',
    'UCoIXnB865l9Ex9zs4OIXTdQ': 'https://yt3.googleusercontent.com/ytc/AIdro_nvgowMqGES97295ca-kcFDlupckJyBceBP9X_7IDv5JkE=s88-c-k-c0x00ffffff-no-rj',
    'UCZ7AeeVbyslLM_8-nVy2B8Q': 'https://yt3.googleusercontent.com/CcyQzLCpV1rVfUWeaEgRut_FZGTkOfM7VFc0dG80dm6UraKtid4Tbetka8elQPn-4AABg3k-8A=s88-c-k-c0x00ffffff-no-rj',
    'UCkSMDOtrKr43OGSSmKnx6tQ': 'https://yt3.googleusercontent.com/ytc/AIdro_nFd8eqxaXAG-xNsctpHeY4HPmq0aRcp8s-KBEdR8e6NMM=s88-c-k-c0x00ffffff-no-rj',
    'UCiflcKnh5cZiRWK7jlYKwxA': 'https://yt3.googleusercontent.com/MuTpUEpwJ357CyGqIDQS6AjE7Ot6CzLwo4VpmQ_479kE3F3w722_FWlUCk4Q0iDgIoaPTd-2isg=s88-c-k-c0x00ffffff-no-rj',
    'UCt7fwAhXDy3oNFTAzF2o8Pw': 'https://yt3.googleusercontent.com/p60m-2Z8bPTuhMaU4yfsOIpTz3NfrUbrcUx7gUko3vvoUU-MTB3Ra_PUEtPPg0D7dnKwjQB-Fw=s88-c-k-c0x00ffffff-no-rj',
}

_NAMESPACES = {
    'atom': 'http://www.w3.org/2005/Atom',
    'yt': 'http://www.youtube.com/xml/schemas/2015',
    'media': 'http://search.yahoo.com/mrss/',
}
_VIDEO_ID = re.compile(r'[A-Za-z0-9_-]{11}')
_CHANNEL_ID = re.compile(r'UC[A-Za-z0-9_-]{22}')


class NewsFetchError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def _text(value):
    return ' '.join(unescape(value or '').split())


def get_news_channels(media_type):
    """Combine code defaults with saved preferences/custom sources, read-only."""
    from core.models import AppSettings, NewsChannel

    settings = AppSettings.objects.only('news_disabled_channels').first()
    preferences = settings.news_disabled_channels if settings else {}
    disabled = preferences.get(media_type, []) if isinstance(preferences, dict) else []
    if not isinstance(disabled, list):
        disabled = []
    sources = [{
        'key': f'default:{channel["id"]}',
        'channel_id': channel['id'],
        'name': channel['name'],
        'url': f'https://www.youtube.com/channel/{channel["id"]}',
        'avatar_url': _DEFAULT_AVATARS.get(channel['id'], ''),
        'enabled': channel['id'] not in disabled,
        'is_default': True,
    } for channel in NEWS_CHANNELS[media_type]]
    default_ids = {channel['id'] for channel in NEWS_CHANNELS[media_type]}
    sources.extend({
        'key': f'custom:{channel.pk}',
        'channel_id': channel.channel_id,
        'name': channel.name,
        'url': channel.url,
        'avatar_url': channel.avatar_url,
        'enabled': channel.enabled,
        'is_default': False,
    } for channel in NewsChannel.objects.filter(media_type=media_type).order_by('name', 'pk')
        if channel.channel_id not in default_ids)
    return sources


def _channel_page_url(value):
    value = (value or '').strip()
    if value.startswith('@'):
        value = 'https://www.youtube.com/' + value
    elif value.startswith(('youtube.com/', 'www.youtube.com/')):
        value = 'https://' + value
    try:
        parsed = urlsplit(value)
        if (parsed.scheme not in ('http', 'https')
                or parsed.hostname not in ('youtube.com', 'www.youtube.com', 'm.youtube.com')
                or parsed.username is not None or parsed.password is not None
                or parsed.port not in (None, 80, 443)):
            raise ValueError
    except ValueError:
        raise ValueError('Enter a YouTube channel link, such as https://www.youtube.com/@AppleTV.') from None
    parts = [unquote(part) for part in parsed.path.split('/') if part]
    if parts and parts[0].startswith('@'):
        path = parts[0]
        valid = 1 < len(path) <= 101
    elif len(parts) >= 2 and parts[0] in ('channel', 'c', 'user'):
        path = '/'.join(parts[:2])
        valid = bool(_CHANNEL_ID.fullmatch(parts[1])) if parts[0] == 'channel' else 0 < len(parts[1]) <= 100
    else:
        valid = False
        path = ''
    if not valid or any(ord(char) < 33 or char in '\\?#' for char in path) or any('/' in part for part in parts):
        raise ValueError('Enter a YouTube channel link, rather than a video or playlist link.')
    # Never request a user-supplied host, port, query or arbitrary YouTube path.
    return 'https://www.youtube.com/' + quote(path, safe='/@._-')


def _avatar_url(value):
    if not isinstance(value, str) or len(value) > 1000:
        return ''
    try:
        parsed = urlsplit(value)
        if (parsed.scheme != 'https' or parsed.hostname not in ('yt3.googleusercontent.com', 'yt3.ggpht.com')
                or parsed.username is not None or parsed.password is not None or parsed.port not in (None, 443)):
            return ''
    except ValueError:
        return ''
    return re.sub(r'=s\d+(?=-|$)', '=s88', value)


def resolve_news_channel(value):
    """Resolve a handle once on addition; channel metadata is saved, not videos."""
    url = _channel_page_url(value)
    try:
        with requests.get(url, timeout=(5, 20), stream=True, allow_redirects=False) as response:
            if response.status_code == 429:
                raise NewsFetchError('YouTube is receiving too many requests. Please try adding the channel later.', 429)
            if 300 <= response.status_code < 400:
                raise NewsFetchError('YouTube redirected this channel. Please paste its current channel link.', 400)
            response.raise_for_status()
            content = bytearray()
            for chunk in response.iter_content(chunk_size=16384):
                content.extend(chunk)
                if len(content) > 5 * 1024 * 1024:
                    raise NewsFetchError('Could not read this YouTube channel. Please try again later.')
    except requests.Timeout as error:
        raise NewsFetchError('YouTube took too long to respond. Please try adding the channel again.', 504) from error
    except requests.RequestException as error:
        raise NewsFetchError('Could not find this YouTube channel. Check its link and try again.', 400) from error
    html = content.decode('utf-8', errors='replace')
    for match in re.finditer(r'(?:\bvar\s+ytInitialData|\bytInitialData|window\["ytInitialData"\])\s*=\s*', html):
        try:
            data = json.JSONDecoder().raw_decode(html, match.end())[0]
            metadata = data.get('metadata', {}).get('channelMetadataRenderer', {})
            channel_id = metadata.get('externalId', '')
            name = _text(metadata.get('title'))
            if not _CHANNEL_ID.fullmatch(channel_id) or not name:
                continue
            avatars = metadata.get('avatar', {}).get('thumbnails', [])
            avatar = _avatar_url(avatars[0].get('url', '')) if avatars else ''
            return {
                'channel_id': channel_id, 'name': name[:200],
                'url': f'https://www.youtube.com/channel/{channel_id}', 'avatar_url': avatar,
            }
        except (ValueError, TypeError, AttributeError, IndexError):
            continue
    raise NewsFetchError('Could not read this YouTube channel. Please check the link and try again.', 400)


def parse_video_feed(content, channel):
    """Read Atom dates, thumbnails and Media RSS view counts; ignore feed HTML."""
    if len(content) > MAX_FEED_BYTES or b'<!DOCTYPE' in content.upper():
        raise NewsFetchError('YouTube returned an unreadable feed. Please try again later.')
    try:
        root = ElementTree.fromstring(content)
    except ElementTree.ParseError as error:
        raise NewsFetchError('YouTube returned an unreadable feed. Please try again later.') from error
    if root.tag != f'{{{_NAMESPACES["atom"]}}}feed':
        raise NewsFetchError('YouTube returned an unreadable feed. Please try again later.')
    feed_channel = root.findtext('yt:channelId', namespaces=_NAMESPACES)
    # YouTube omits the "UC" prefix in this feed field, despite using the full
    # identifier in channel URLs. Accept either representation of our channel.
    if feed_channel not in (channel['id'], channel['id'].removeprefix('UC')):
        raise NewsFetchError('YouTube returned an unreadable feed. Please try again later.')

    channel_name = _text(root.findtext('atom:author/atom:name', namespaces=_NAMESPACES)) or channel['name']
    videos = []
    for entry in root.findall('atom:entry', _NAMESPACES)[:15]:
        video_id = entry.findtext('yt:videoId', namespaces=_NAMESPACES) or ''
        title = _text(entry.findtext('atom:title', namespaces=_NAMESPACES))
        if not _VIDEO_ID.fullmatch(video_id) or not title:
            continue
        try:
            published = datetime.fromisoformat(entry.findtext('atom:published', namespaces=_NAMESPACES) or '')
            if published.tzinfo is None:
                published = published.replace(tzinfo=timezone.utc)
            published = published.astimezone(timezone.utc)
        except (ValueError, TypeError, OverflowError):
            continue

        statistics = entry.find('media:group/media:community/media:statistics', _NAMESPACES)
        raw_views = statistics.get('views', '') if statistics is not None else ''
        views = int(raw_views) if raw_views.isascii() and raw_views.isdecimal() and len(raw_views) <= 20 else None
        # Build only known YouTube URLs; RSS descriptions/HTML are never rendered.
        videos.append({
            'id': video_id,
            'title': title,
            'url': f'https://www.youtube.com/watch?v={video_id}',
            'thumbnail_url': f'https://i.ytimg.com/vi/{video_id}/hqdefault.jpg',
            'channel': channel_name,
            'channel_url': f'https://www.youtube.com/channel/{channel["id"]}',
            'avatar_url': channel.get('avatar_url', ''),
            'published_at': published.isoformat(),
            'views': views,
            # The public Atom feed does not supply duration or live status.
            'duration_seconds': None,
        })
    return videos


def _fetch_channel(channel):
    try:
        with requests.get(
            YOUTUBE_FEED_URL, params={'channel_id': channel['id']},
            timeout=(5, 20), stream=True,
            headers={'Accept': 'application/atom+xml, application/xml', 'Cache-Control': 'no-cache'},
        ) as response:
            if response.status_code == 429:
                raise NewsFetchError('YouTube is receiving too many requests. Please wait a little and try again.', 429)
            response.raise_for_status()
            content = bytearray()
            for chunk in response.iter_content(chunk_size=16384):
                content.extend(chunk)
                if len(content) > MAX_FEED_BYTES:
                    raise NewsFetchError('YouTube returned an unreadable feed. Please try again later.')
    except requests.Timeout as error:
        raise NewsFetchError('YouTube took too long to respond. Please try again.', 504) from error
    except requests.RequestException as error:
        logger.warning('Unable to fetch YouTube channel %s: %s', channel['id'], type(error).__name__)
        raise NewsFetchError('Could not reach YouTube. Please try again in a moment.', 503) from error
    return parse_video_feed(bytes(content), channel)


def fetch_news(media_type, sort='views', order='desc', channels=None):
    """Fetch selected channels concurrently, merge their videos, then sort."""
    sources = channels if channels is not None else [{
        'channel_id': channel['id'], 'name': channel['name'],
        'avatar_url': _DEFAULT_AVATARS.get(channel['id'], ''), 'enabled': True,
    } for channel in NEWS_CHANNELS[media_type]]
    channels = [{'id': source['channel_id'], 'name': source['name'],
                 'avatar_url': source.get('avatar_url', '')} for source in sources if source['enabled']]
    videos_by_id = {}
    unavailable = []
    errors = []
    if not channels:
        return {'media_type': media_type, 'sort': sort, 'order': order, 'videos': [],
                'channels': sources, 'unavailable_channels': [], 'fetched_at': datetime.now(timezone.utc).isoformat()}
    with ThreadPoolExecutor(max_workers=min(3, len(channels))) as executor:
        futures = {executor.submit(_fetch_channel, channel): channel for channel in channels}
        for future in as_completed(futures):
            channel = futures[future]
            try:
                videos = future.result()
            except NewsFetchError as error:
                unavailable.append(channel['name'])
                errors.append(error)
                continue
            for video in videos:
                previous = videos_by_id.get(video['id'])
                views = video['views'] if video['views'] is not None else -1
                previous_views = previous['views'] if previous and previous['views'] is not None else -1
                if previous is None or views > previous_views:
                    videos_by_id[video['id']] = video
    if len(errors) == len(channels):
        raise errors[0]

    # Stable ties match the page's local sort. For views, newer uploads break
    # ties in either direction, and unknown counts always appear at the end.
    ordered = sorted(videos_by_id.values(), key=lambda video: video['id'])
    ordered.sort(key=lambda video: video['published_at'], reverse=sort == 'views' or order == 'desc')
    if sort == 'views':
        known = [video for video in ordered if video['views'] is not None]
        known.sort(key=lambda video: video['views'], reverse=order == 'desc')
        ordered = known + [video for video in ordered if video['views'] is None]

    return {
        'media_type': media_type,
        'sort': sort,
        'order': order,
        'videos': ordered,
        'channels': sources,
        'unavailable_channels': sorted(unavailable),
        'fetched_at': datetime.now(timezone.utc).isoformat(),
    }
