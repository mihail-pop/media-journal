"""Read-only API bundles for the general details page's secondary tabs.

Overview uses saved metadata. These bundles are fetched on demand and cached in
the browser, never written over the user's local metadata or personal fields.
"""
from datetime import datetime
import re
from urllib.parse import urlsplit
from uuid import UUID

from core.models import APIKey
from core.services.g_api_errors import ApiClient, ApiError, require_api_data
from core.services.g_runtimes import positive_runtime, tmdb_episode_runtime, tmdb_season_runtime
from django.utils import timezone


def bundle():
    return {'information': [], 'score': None, 'cast': [], 'staff': [],
            'trailers': [], 'recommendations': [], 'relations': [], 'pagination': {}}


def overview_sections(order):
    """Expose the new preview without changing existing saved ordering/visibility."""
    sections = [dict(section) for section in order or [] if isinstance(section, dict)]
    if not any(section.get('id') == 'information' for section in sections):
        sections.insert(0, {'id': 'information', 'name': 'Information', 'visible': True})
    if not any(section.get('id') == 'movie_relations' for section in sections):
        position = next((i + 1 for i, section in enumerate(sections) if section.get('id') == 'prequels_sequels'), len(sections))
        sections.insert(position, {'id': 'movie_relations', 'name': 'Movie Relations', 'visible': True})
    return sections


def safe_url(value):
    if not isinstance(value, str):
        return ''
    if value.startswith('//'):
        value = 'https:' + value
    try:
        parsed = urlsplit(value)
        return value if parsed.scheme in ('http', 'https') and parsed.netloc and not parsed.username else ''
    except ValueError:
        return ''


def website_name(value):
    host = urlsplit(safe_url(value)).hostname or ''
    parts = host.split('.')
    if len(parts) < 2 or all(part.isdecimal() for part in parts):
        return host
    index = -3 if len(parts) > 2 and len(parts[-1]) == 2 and parts[-2] in ('co', 'com', 'org', 'net', 'ac', 'gov') else -2
    return parts[index].capitalize()


def display_date(value):
    # MusicBrainz can supply a full date, only a month, or only a year.
    for source, target in (('%Y-%m-%d', '%d %b %Y'), ('%Y-%m', '%b %Y'), ('%Y', '%Y')):
        try:
            parsed = datetime.strptime(value, source)
            return f'{parsed.day} {parsed:%b %Y}' if source == '%Y-%m-%d' else parsed.strftime(target)
        except (TypeError, ValueError):
            continue
    return value


def display_duration(minutes):
    hours, remaining = divmod(int(minutes), 60)
    parts = []
    if hours:
        parts.append(f'{hours} hour' + ('s' if hours != 1 else ''))
    if remaining:
        parts.append(f'{remaining} minute' + ('s' if remaining != 1 else ''))
    return ' '.join(parts)


def info(result, label, value=None, links=None, detail=None):
    values = None
    if isinstance(value, (list, tuple)):
        values, seen = [], set()
        for part in value:
            if part is None:
                continue
            text = str(part).strip()
            if text and text.casefold() not in seen:
                seen.add(text.casefold())
                values.append(text)
        value = ', '.join(values)
    if value not in (None, '', []):
        row = {'label': label, 'value': str(value)}
        if values:
            row['values'] = values
        if detail:
            row['detail'] = detail
        result['information'].append(row)
    elif links:
        valid = [{'title': str(link.get('title') or link.get('site') or 'Website'),
                  'url': safe_url(link.get('url'))} for link in links]
        valid = [link for link in valid if link['url']]
        if valid:
            result['information'].append({'label': label, 'links': valid})


def youtube(videos, *, tmdb=False):
    trailers, teasers, seen = [], [], set()
    for video in videos:
        if not isinstance(video, dict) or tmdb and video.get('site') != 'YouTube':
            continue
        identity = str(video.get('key') or video.get('video_id') or video.get('id') or '')
        if not re.fullmatch(r'[A-Za-z0-9_-]{11}', identity) or identity in seen:
            continue
        name = (video.get('name') or '').lower()
        video_type = (video.get('type') or '').lower()
        if video_type == 'teaser' or 'teaser' in name:
            target = teasers
        elif video_type == 'trailer' or not tmdb and 'trailer' in name:
            target = trailers
        else:
            continue
        seen.add(identity)
        # Main official trailers precede follow-ups and short promotional cuts,
        # even when the provider returns its videos newest-first.
        words = re.sub(r'[^a-z0-9]+', ' ', name).strip()
        promotional = bool(re.search(r'\b(?:tickets on sale|tickets available|get tickets|book now|now playing|in theaters|in cinemas|coming soon|tv spot)\b', words))
        followup = bool(re.search(r'\b(?:final|international|red band|trailer [2-9]|trailer ii)\b', words))
        importance = 4 if promotional else 2 if followup else 0 if 'official trailer' in words else 1 if 'trailer' in words else 3
        target.append({'youtube_id': identity, 'title': video.get('name') or video_type.title(),
                       'kind': 'Trailer' if target is trailers else 'Teaser',
                       '_priority': (importance, not bool(video.get('official')), video.get('iso_639_1') not in (None, 'en'))})
    chosen = sorted(trailers or teasers, key=lambda video: video['_priority'])[:9]
    for video in chosen:
        video.pop('_priority')
    return chosen


def rank_staff(entries, *, original_creator_first=False):
    """Use a person's most significant credit to choose their display group."""
    groups = (
        ('Directing', ('director',)),
        ('Story & Writing', ('original creator', 'creator', 'showrunner', 'story & art', 'screenplay', 'writer', 'story', 'novel', 'script')),
        ('Production', ('executive producer', 'producer', 'production manager')),
        ('Art & Animation', ('character design', 'animation', 'animator', 'art', 'design', 'layout', 'illustrat')),
        ('Camera & Lighting', ('cinematograph', 'photograph', 'camera', 'lighting', 'gaffer')),
        ('Sound & Music', ('composer', 'music', 'sound', 'audio', 'song')),
        ('Editing', ('editor', 'editing')),
    )
    for entry in entries:
        roles = (entry.get('subtitle') or '').casefold()
        entry.update(group='Other Crew', group_order=7, role_order=0)
        if original_creator_first and any(role in roles for role in ('original creator', 'original story', 'story & art')):
            entry.update(group='Original Creator', group_order=-1)
            continue
        for order, (group, keywords) in enumerate(groups):
            matches = [i for i, keyword in enumerate(keywords) if keyword in roles]
            if matches:
                entry.update(group=group, group_order=order, role_order=min(matches))
                if group == 'Directing':
                    entry['role_order'] = 0 if any(role.strip() in ('director', 'chief director', 'series director')
                        for role in re.split(r'[,·]', roles)) else 1
                break
        else:
            if 'thanks' in roles or 'acknowledg' in roles:
                entry.update(group='Thanks', group_order=8)
    return sorted(entries, key=lambda entry: (entry['group_order'], entry['role_order'], entry.get('title', '').casefold(), str(entry.get('id', ''))))


def tmdb_image(path):
    return f'https://image.tmdb.org/t/p/w342{path}' if isinstance(path, str) and path.startswith('/') else ''


def tmdb_recommendations(data, media_type):
    return [{'id': rec['id'], 'title': rec.get('title') or rec.get('name') or '',
             'image': tmdb_image(rec.get('poster_path')), 'subtitle': '',
             'href': f'/tmdb/{media_type}/{rec["id"]}/'}
            for rec in data.get('results', []) if isinstance(rec, dict) and rec.get('id')]


def tmdb_people(credits, *, crew=False):
    result, by_id = [], {}
    for member in credits.get('crew' if crew else 'cast', []):
        identity = member.get('id')
        if not identity or not member.get('name'):
            continue
        # Crew includes every production department; cast/acting credits stay
        # in Cast. Merge a person's several jobs rather than duplicate cards.
        if crew and (member.get('department') == 'Acting' or member.get('known_for_department') == 'Acting'
                     and member.get('job') in ('Actor', 'Actress', 'Self')):
            continue
        roles = member.get('jobs' if crew else 'roles') or []
        role = ', '.join(dict.fromkeys(str(role.get('job' if crew else 'character') or '')
                                      for role in roles if isinstance(role, dict)))
        role = role or member.get('job' if crew else 'character') or ''
        if identity in by_id:
            previous = by_id[identity]
            if role and role not in previous['roles']:
                previous['roles'].append(role)
                previous['subtitle'] = ', '.join(previous['roles'])
            continue
        entry = {'id': identity, 'title': member['name'], 'subtitle': role,
                 'roles': [role] if role else [], 'image': tmdb_image(member.get('profile_path')),
                 'href': f'/person/tmdb/{identity}/'}
        by_id[identity] = entry
        result.append(entry)
    return rank_staff(result) if crew else result


def tmdb_bundle(data, media_type, collection=None):
    result = bundle()
    score = data.get('vote_average')
    if isinstance(score, (int, float)) and data.get('vote_count', 1):
        result['score'] = {'provider': 'TMDB', 'value': round(score, 1), 'maximum': 10}
    info(result, 'Status', data.get('status'))
    info(result, 'Genres', [genre.get('name') for genre in data.get('genres', [])])
    if media_type == 'movie':
        info(result, 'Runtime', display_duration(data['runtime']) if data.get('runtime') else None)
    else:
        parts = []
        if data.get('number_of_episodes'):
            parts.append(f'{data["number_of_episodes"]} episodes')
        runtime = tmdb_episode_runtime(data)
        if runtime:
            parts.append(f'{runtime} minutes')
        count = data.get('number_of_episodes')
        info(result, 'Format', ' × '.join(parts), detail=display_duration(count * runtime) if count and runtime else None)
        info(result, 'Networks', [network.get('name') for network in data.get('networks', [])])
        for field, label in (('next_episode_to_air', 'Next episode'), ('last_episode_to_air', 'Last episode')):
            episode = data.get(field) or {}
            if episode.get('air_date'):
                info(result, label, f'S{episode.get("season_number", "")} · Episode '
                     f'{episode.get("episode_number", "")} · {display_date(episode["air_date"])}')
    info(result, 'Official site', links=[{'url': data.get('homepage'), 'title': website_name(data.get('homepage'))}])
    credits = data.get('aggregate_credits') or data.get('credits') or {}
    result['cast'] = tmdb_people(credits)
    result['staff'] = tmdb_people(credits, crew=True)
    result['trailers'] = youtube((data.get('videos') or {}).get('results', []), tmdb=True)
    recommendations = data.get('recommendations') or {}
    result['recommendations'] = tmdb_recommendations(recommendations, media_type)
    result['pagination']['recommendations'] = {
        'page': 1, 'has_more': recommendations.get('total_pages', 1) > 1}
    if collection:
        result['relations'] = [{'id': part['id'], 'title': part.get('title') or '',
                                'image': tmdb_image(part.get('poster_path')),
                                'subtitle': part.get('release_date') or '',
                                'href': f'/tmdb/movie/{part["id"]}/'}
                               for part in sorted(collection.get('parts', []), key=lambda part: part.get('release_date') or '')
                               if part.get('id') and part['id'] != data.get('id')]
    return result


def season_navigation(seasons, current_season):
    """One next-season link, with a short menu of nearby seasons and the last."""
    numbers = sorted({season['season_number'] for season in seasons or []
                      if isinstance(season, dict) and isinstance(season.get('season_number'), int)
                      and not isinstance(season['season_number'], bool) and season['season_number'] >= 0})
    previous = [number for number in numbers if number < current_season]
    following = [number for number in numbers if number > current_season]
    primary = following[0] if following else previous[-1] if previous else None
    choices = []
    if following:
        if previous:
            choices.append(previous[-1])
        choices.extend(following[1:3])
        choices.append(numbers[-1])
    elif previous:
        choices.extend(reversed(previous[:-1][-2:]))
        choices.append(numbers[0])

    def entry(number):
        return {'number': number, 'label': 'Specials' if number == 0 else f'Season {number}'}

    choices = list(dict.fromkeys(number for number in choices if number not in (primary, current_season)))
    return {'known': True, 'primary': entry(primary) if primary is not None else None,
            'options': [entry(number) for number in choices]}


def tmdb_season_bundle(season, show):
    """Season-specific credits/episodes, alongside the parent show's facts."""
    result = bundle()
    score = season.get('vote_average')
    if isinstance(score, (int, float)) and score > 0:
        result['score'] = {'provider': 'TMDB', 'value': round(score, 1), 'maximum': 10}
    info(result, 'Status', show.get('status'))
    info(result, 'Genres', [genre.get('name') for genre in show.get('genres', [])])
    episodes = season.get('episodes') or []
    count = len(episodes)
    runtime = tmdb_season_runtime(season, show)
    parts = [f'{count} episode' + ('s' if count != 1 else '')]
    if runtime:
        parts.append(f'{runtime} minutes')
    total = sum(positive_runtime(episode.get('runtime')) or runtime or 0 for episode in episodes)
    info(result, 'Format', ' × '.join(parts), detail=display_duration(total) if total else None)
    info(result, 'Networks', [network.get('name') for network in season.get('networks') or show.get('networks') or []])
    now = timezone.now()
    today = (timezone.localtime(now) if timezone.is_aware(now) else now).date().isoformat()
    dated = sorted((episode for episode in episodes if re.fullmatch(r'\d{4}-\d{2}-\d{2}', episode.get('air_date') or '')),
                   key=lambda episode: (episode['air_date'], episode.get('episode_number') or 0))
    aired = [episode for episode in dated if episode['air_date'] <= today]
    upcoming = [episode for episode in dated if episode['air_date'] > today]
    for label, episode in (('Next episode', upcoming[0] if upcoming else None), ('Last episode', aired[-1] if aired else None)):
        if episode:
            info(result, label, f'S{season.get("season_number", "")} · Episode {episode.get("episode_number", "")} · {display_date(episode["air_date"])}')
    info(result, 'Official site', links=[{'url': show.get('homepage'), 'title': website_name(show.get('homepage'))}])
    credits = season.get('aggregate_credits') or {}
    result['cast'] = tmdb_people(credits)
    result['staff'] = tmdb_people(credits, crew=True)
    result['season_navigation'] = season_navigation(show.get('seasons'), season.get('season_number', 0))
    return result


def anilist_query(identity_field='id', section=None):
    """Nested AniList connections allow at most 25 entries per page."""
    card = 'id idMal title { romaji english } coverImage { large } type format status'
    connections = {
        'cast': '''characters(sort: [ROLE, RELEVANCE], page: $page, perPage: 25) {
            pageInfo { hasNextPage } edges { role node { id name { full } image { medium large } } } }''',
        'staff': '''staff(sort: RELEVANCE, page: $page, perPage: 25) {
            pageInfo { hasNextPage } edges { role node { id name { full } image { large } } } }''',
        'recommendations': '''recommendations(sort: RATING_DESC, page: $page, perPage: 25) {
            pageInfo { hasNextPage } edges { node { mediaRecommendation { ''' + card + ''' } } } }''',
    }
    metadata = '''id idMal title { romaji english } description(asHtml: true)
        startDate { year month day } bannerImage coverImage { extraLarge }
        status averageScore format episodes duration chapters volumes genres
        nextAiringEpisode { episode airingAt }
        studios(isMain: true) { nodes { name } }
        externalLinks { site url language } trailer { id site }
        relations { edges { relationType node { ''' + card + ''' } } }'''
    fields = connections[section] if section else metadata + '\n' + '\n'.join(connections.values())
    return ('query ($id: Int, $type: MediaType, $page: Int) { Media('
            + identity_field + ': $id, type: $type) { ' + fields + ' } }')


def anilist_card(node, subtitle=''):
    media_type = (node.get('type') or 'ANIME').lower()
    identity = node.get('id') or node.get('idMal')
    source = 'anilist' if node.get('id') else 'mal'
    return {'id': identity, 'title': (node.get('title') or {}).get('english')
            or (node.get('title') or {}).get('romaji') or '',
            'image': safe_url((node.get('coverImage') or {}).get('large')),
            'subtitle': subtitle, 'href': f'/{source}/{media_type}/{identity}/'}


def anilist_format(value):
    return {'TV': 'TV', 'TV_SHORT': 'TV Short', 'OVA': 'OVA', 'ONA': 'ONA'}.get(value, (value or '').replace('_', ' ').title())


def anilist_bundle(data, media_type, *, page=1, section=None):
    result = bundle()
    if data.get('averageScore') is not None:
        result['score'] = {'provider': 'AniList', 'value': round(data['averageScore'] / 10, 1), 'maximum': 10}
    info(result, 'Status', (data.get('status') or '').replace('_', ' ').capitalize())
    format_name = anilist_format(data.get('format'))
    parts = []
    for key, label in ((('episodes', 'episodes'), ('duration', 'minutes')) if media_type == 'anime'
                       else (('chapters', 'chapters'), ('volumes', 'volumes'))):
        if data.get(key):
            parts.append(f'{data[key]} {label}')
    total = data.get('episodes') and data.get('duration') if media_type == 'anime' else None
    info(result, 'Format', format_name + (' (' + ' × '.join(parts) + ')' if parts else ''),
         detail=display_duration(data['episodes'] * data['duration']) if total else None)
    info(result, 'Genres', data.get('genres'))
    info(result, 'Romaji', (data.get('title') or {}).get('romaji'))
    info(result, 'Studio', [studio.get('name') for studio in (data.get('studios') or {}).get('nodes', [])])
    info(result, 'External links', links=data.get('externalLinks'))
    airing = data.get('nextAiringEpisode') or {}
    if airing.get('airingAt'):
        info(result, 'Next episode', f'Episode {airing.get("episode")} · '
             + datetime.fromtimestamp(airing['airingAt']).strftime('%d %b %Y, %H:%M'))
    trailer = data.get('trailer') or {}
    if trailer.get('site', '').lower() == 'youtube':
        # AniList supplies one designated trailer, without a title/type field.
        result['trailers'] = youtube([{**trailer, 'type': 'Trailer'}])
    for target, field in (('cast', 'characters'), ('staff', 'staff'), ('recommendations', 'recommendations')):
        connection = data.get(field) or {}
        if section and target != section:
            continue
        entries = []
        for edge in connection.get('edges', []):
            node = edge.get('node') or {}
            if target == 'recommendations':
                node = node.get('mediaRecommendation') or {}
                if node.get('id') or node.get('idMal'):
                    entries.append(anilist_card(node))
            elif node.get('id'):
                identity = node['id']
                entries.append({'id': identity, 'title': (node.get('name') or {}).get('full') or '',
                                'subtitle': (edge.get('role') or '').replace('_', ' ').title(),
                                'image': safe_url((node.get('image') or {}).get('large')
                                                  or (node.get('image') or {}).get('medium')),
                                'href': f'/character/{identity}/' if target == 'cast' else f'/person/anilist/{identity}/'})
        # Staff can have several roles in a single production.
        by_id = {}
        for entry in entries:
            if entry['id'] in by_id:
                previous = by_id[entry['id']]
                if entry['subtitle'] and entry['subtitle'] not in previous['subtitle'].split(' · '):
                    previous['subtitle'] += ' · ' + entry['subtitle']
            else:
                by_id[entry['id']] = entry
        result[target] = rank_staff(list(by_id.values()), original_creator_first=True) if target == 'staff' else list(by_id.values())
        result['pagination'][target] = {'page': page, 'has_more': bool((connection.get('pageInfo') or {}).get('hasNextPage'))}
    for edge in (data.get('relations') or {}).get('edges', []):
        node = edge.get('node') or {}
        relation = edge.get('relationType') or ''
        if relation in ('SEQUEL', 'PREQUEL') or not (node.get('id') or node.get('idMal')):
            continue
        group = {'ADAPTATION': 'Source', 'ALTERNATIVE': 'Alternative', 'SIDE_STORY': 'Side Story',
                 'SPIN_OFF': 'Spin Off', 'SUMMARY': 'Summary', 'CHARACTER': 'Character'}.get(relation, 'Other')
        groups = ('Source', 'Alternative', 'Side Story', 'Spin Off', 'Summary', 'Character', 'Other')
        entry = anilist_card(node, anilist_format(node.get('format') or node.get('type')))
        entry.update(group=group, group_order=groups.index(group))
        result['relations'].append(entry)
    result['relations'].sort(key=lambda entry: entry['group_order'])
    return result


IGDB_FIELDS = '''id,name,summary,storyline,cover.url,artworks.url,screenshots.url,
    first_release_date,platforms.name,genres.name,involved_companies.company.name,
    involved_companies.developer,status,rating,websites.url,videos.video_id,videos.name,
    expansions.name,expansions.cover.url,dlcs.name,dlcs.cover.url,
    similar_games.name,similar_games.cover.url'''


def igdb_card(game, subtitle=''):
    image = safe_url((game.get('cover') or {}).get('url')).replace('t_thumb', 't_cover_big_2x')
    return {'id': game['id'], 'title': game.get('name') or '', 'image': image,
            'subtitle': subtitle, 'href': f'/igdb/game/{game["id"]}/'}


def igdb_bundle(game, time_to_beat=None):
    result = bundle()
    if game.get('rating') is not None:
        result['score'] = {'provider': 'IGDB', 'value': round(game['rating'] / 10, 1), 'maximum': 10}
    status = {0: 'Released', 2: 'Alpha', 3: 'Beta', 4: 'Early Access', 5: 'Offline',
              6: 'Cancelled', 7: 'Rumored', 8: 'Delisted'}.get(game.get('status'))
    if not status:
        release = game.get('first_release_date')
        status = 'Released' if release and release <= datetime.now().timestamp() else 'In development'
    info(result, 'Status', status)
    info(result, 'Platforms', [platform.get('name') for platform in game.get('platforms', [])])
    info(result, 'Genres', [genre.get('name') for genre in game.get('genres', [])])
    info(result, 'Developers', [(company.get('company') or {}).get('name') for company in game.get('involved_companies', []) if company.get('developer')])
    info(result, 'External links', links=[{'url': site.get('url'), 'title': website_name(site.get('url'))}
                                        for site in game.get('websites', [])])
    for key, label in (('hastily', 'Main story'), ('normally', 'Main story & extras'), ('completely', 'Completionist')):
        seconds = (time_to_beat or {}).get(key)
        if seconds and 0 < seconds < 3600000:
            info(result, label, f'{round(seconds / 3600)} hours')
    result['trailers'] = youtube(game.get('videos', []))
    result['recommendations'] = [igdb_card(rec) for rec in game.get('similar_games', []) if rec.get('id')]
    for key, label in (('expansions', 'Expansion'), ('dlcs', 'DLC')):
        result['relations'].extend(igdb_card(game, label) for game in game.get(key, []) if game.get('id'))
    return result


def tmdb_collection(data):
    collection = data.get('belongs_to_collection') or {}
    if not collection.get('id'):
        return None
    key = APIKey.objects.get(name='tmdb').key_1
    result = ApiClient('tmdb').get(f'https://api.themoviedb.org/3/collection/{collection["id"]}', params={'api_key': key}).json()
    require_api_data(isinstance(result, dict) and isinstance(result.get('parts'), list), 'tmdb')
    return result


def initial_tmdb_bundle(data, media_type):
    # A supplemental collection failure must not prevent the already-fetched
    # title, cast and overview from opening. Its tab offers the normal retry.
    collection, failure = None, None
    if media_type == 'movie':
        try:
            collection = tmdb_collection(data)
        except ApiError as error:
            failure = error.payload()
    result = tmdb_bundle(data, media_type, collection)
    if failure:
        result['errors'] = {'relations': failure}
    return result


def igdb_times(identity, headers):
    data = ApiClient('igdb').post('https://api.igdb.com/v4/game_time_to_beats', headers=headers,
                                 data=f'fields hastily,normally,completely; where game_id = {identity};').json()
    require_api_data(isinstance(data, list), 'igdb')
    return data[0] if data else None


def initial_igdb_bundle(game, headers):
    times, failure = None, None
    try:
        times = igdb_times(game['id'], headers)
    except ApiError as error:
        failure = error.payload()
    result = igdb_bundle(game, times)
    if failure:
        result['errors'] = {'information': failure}
    return result


def fetch_sections(media_type, identity, source, *, section=None, page=1, artist_id='', album_id=''):
    """One bundle on first demand; subsequent requests fetch a connection page."""
    if media_type in ('movie', 'tv') and source == 'tmdb':
        season_id = re.fullmatch(r'([0-9]+)_s([0-9]+)', str(identity)) if media_type == 'tv' else None
        if season_id:
            if section:
                raise ValueError('Season sections do not use pagination.')
            show_id, number = season_id.groups()
            key = APIKey.objects.get(name='tmdb').key_1
            client = ApiClient('tmdb')
            season = client.get(f'https://api.themoviedb.org/3/tv/{show_id}/season/{number}',
                                params={'api_key': key, 'append_to_response': 'aggregate_credits'}).json()
            require_api_data(isinstance(season, dict) and season.get('id') and isinstance(season.get('episodes'), list)
                             and isinstance((season.get('aggregate_credits') or {}).get('cast'), list)
                             and isinstance((season.get('aggregate_credits') or {}).get('crew'), list), source)
            show = client.get(f'https://api.themoviedb.org/3/tv/{show_id}', params={'api_key': key}).json()
            require_api_data(isinstance(show, dict) and show.get('id') and show.get('name'), source)
            return tmdb_season_bundle(season, show)
        if not str(identity).isdecimal():
            raise ValueError('Invalid media ID.')
        key = APIKey.objects.get(name='tmdb').key_1
        if section:
            if section != 'recommendations':
                raise ValueError('This section does not use pagination.')
            data = ApiClient(source).get(f'https://api.themoviedb.org/3/{media_type}/{identity}/recommendations',
                                        params={'api_key': key, 'page': page}).json()
            require_api_data(isinstance(data, dict) and isinstance(data.get('results'), list), source)
            return {'recommendations': tmdb_recommendations(data, media_type),
                    'pagination': {'recommendations': {'page': page, 'has_more': page < data.get('total_pages', page)}}}
        credit = 'aggregate_credits' if media_type == 'tv' else 'credits'
        data = ApiClient(source).get(f'https://api.themoviedb.org/3/{media_type}/{identity}',
                                    params={'api_key': key, 'append_to_response': f'{credit},videos,recommendations'}).json()
        require_api_data(isinstance(data, dict) and data.get('id') and (data.get('title') or data.get('name')), source)
        require_api_data(isinstance((data.get(credit) or {}).get('cast'), list)
                         and isinstance((data.get(credit) or {}).get('crew'), list)
                         and isinstance((data.get('videos') or {}).get('results'), list)
                         and isinstance((data.get('recommendations') or {}).get('results'), list), source)
        return tmdb_bundle(data, media_type)
    if media_type in ('anime', 'manga') and source in ('anilist', 'mal'):
        if not str(identity).isdecimal() or section not in (None, 'cast', 'staff', 'recommendations'):
            raise ValueError('Invalid media ID or section.')
        query = anilist_query('id' if source == 'anilist' else 'idMal', section)
        payload = ApiClient('anilist').post('https://graphql.anilist.co',
                    json={'query': query, 'variables': {'id': int(identity), 'type': media_type.upper(), 'page': page}}).json()
        require_api_data(isinstance(payload, dict) and isinstance(payload.get('data'), dict)
                         and 'Media' in payload['data'], 'anilist')
        data = payload['data']['Media']
        if not data:
            raise ApiError('anilist', 'not_found')
        require_api_data(isinstance(data, dict), 'anilist')
        for target, field in (('cast', 'characters'), ('staff', 'staff'), ('recommendations', 'recommendations')):
            if not section or section == target:
                connection = data.get(field) or {}
                require_api_data(isinstance(connection, dict) and isinstance(connection.get('edges'), list)
                                 and isinstance(connection.get('pageInfo'), dict), 'anilist')
        return anilist_bundle(data, media_type, page=page, section=section)
    if media_type == 'game' and source == 'igdb' and not section:
        from core.services.m_games import get_igdb_token
        if not str(identity).isdecimal():
            raise ValueError('Invalid media ID.')
        token = get_igdb_token()
        keys = APIKey.objects.get(name='igdb')
        headers = {'Client-ID': keys.key_1, 'Authorization': f'Bearer {token}'}
        client = ApiClient('igdb')
        data = client.post('https://api.igdb.com/v4/games', headers=headers,
                           data=f'fields {IGDB_FIELDS}; where id = {identity};').json()
        require_api_data(isinstance(data, list), source)
        if not data:
            raise ApiError(source, 'not_found')
        require_api_data(isinstance(data[0], dict) and data[0].get('id') and data[0].get('name'), source)
        return igdb_bundle(data[0], igdb_times(identity, headers))
    if media_type == 'music' and source == 'musicbrainz' and not section:
        from core.services.m_music import get_music_extra_info
        UUID(str(identity))
        for value in (artist_id, album_id):
            if value:
                UUID(value)
        data = get_music_extra_info(str(identity), artist_id, album_id)
        result = bundle()
        result['tracks'] = [{'id': track['id'], 'title': track['title'], 'subtitle': '',
                             'href': f'/musicbrainz/music/{track["id"]}/'} for track in data.get('album_tracks', [])]
        result['singles'] = [{'title': track['title'], 'subtitle': display_date(track.get('date') or '')}
                            for track in data.get('artist_singles', [])]
        result['album_title'] = data.get('album_title') or ''
        return result
    raise ValueError('This media type does not support this section.')
