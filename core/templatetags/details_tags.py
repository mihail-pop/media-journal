from django import template
from html import unescape
import re

from core.services.g_details_sections import bundle, display_duration, info, overview_sections, tmdb_season_bundle


register = template.Library()


@register.filter
def information_values(row):
    # A missing dictionary key named "values" otherwise resolves to dict.values
    # in Django templates, instead of meaning there are no tag pills.
    return row.get('values') or []


def preview_information(data, local):
    source = data if data.get('information') else local
    return {'score': data.get('score'), 'information': sorted(source.get('information') or [],
            key=lambda row: bool(row.get('values') or row.get('links')))}


@register.simple_tag(takes_context=True)
def season_details_tabs_state(context):
    state = details_tabs_state(context)
    item = context.get('item')
    number = int(context.get('season_number', 0))
    local = tmdb_season_bundle({'season_number': number, 'episodes': context.get('episodes') or []}, {
        'genres': [{'name': genre} for genre in (item.genres or [])] if item else [],
        'episode_run_time': [item.episode_runtime] if item and item.episode_runtime else [],
    })
    tabs = [{'id': key, 'label': label} for key, label in
            (('overview', 'Overview'), ('information', 'Information'), ('cast', 'Cast'), ('staff', 'Staff'))]
    seed = context.get('details_bundle')
    if not state['saved'] and seed is not None:
        tabs = [tab for tab in tabs if tab_has_content(tab['id'], seed, 'tv')]
    state.update(tabs=tabs, local=local, seed=seed, season_number=number,
                 preview_information=preview_information(seed or local, local),
                 show_id=str(context.get('tmdb_id')), season_navigation=context.get('season_nav') or {'known': False})
    return state


def tab_has_content(tab, data, media_type):
    if tab == 'overview' or data.get('errors', {}).get(tab):
        return True
    if tab == 'information':
        if media_type == 'music':
            return bool(data.get('tracks') or data.get('singles'))
        return bool(data.get('information') or data.get('score'))
    return bool(data.get(tab) or data.get('pagination', {}).get(tab, {}).get('has_more'))


@register.simple_tag(takes_context=True)
def details_tabs_state(context):
    """Build local tab state without fetching or modifying provider metadata."""
    media_type = context.get('media_type')
    source_id = str(context.get('source_id') or '')
    saved = bool(context.get('in_my_list'))
    item = context.get('item')
    seed = context.get('details_bundle')
    movie_relations = []
    if media_type == 'movie':
        if item:
            movie_relations = [{'id': relation['id'], 'title': relation.get('title') or '',
                                'image': relation.get('poster_path') or '', 'subtitle': relation.get('release_date') or ''}
                               for relation in item.related_entries if isinstance(relation, dict) and relation.get('id')]
        elif seed:
            movie_relations = seed.get('relations') or []
    api_enabled = not source_id.startswith('custom_') and media_type != 'book'
    local = bundle()
    header = bundle()
    music_generated = False
    genres = item.genres if item else context.get('genres')
    creators = item.creators if item else context.get('creators')
    if not creators and media_type == 'book':
        creators = [person.get('name') for person in context.get('cast') or []]
    if media_type == 'book':
        info(local, 'Authors', creators)
    elif media_type == 'music':
        metadata = item.cast if item and isinstance(item.cast, dict) else {}
        if not creators:
            creators = [artist.get('name') for artist in metadata.get('artists') or []]
        creators = creators if isinstance(creators, list) else [creators] if creators else []
        album = metadata.get('album') or {}
        first_release = context.get('music_first_release') or album.get('title') or ''
        if album.get('title') and album.get('type'):
            first_release = f'{album["title"]} ({album["type"]})'
        lines = [line.strip() for line in re.split(r'\r?\n|<br\s*/?>', context.get('overview') or '') if line.strip()]
        parsed = {}
        for line in lines:
            match = re.match(r'^(Artists?|First released as|Genres):\s*(.*)$', line, re.I)
            if match:
                parsed[match[1].casefold()] = unescape(match[2])
        music_generated = not lines or len(parsed) == len(lines)
        if music_generated:
            artist_text = parsed.get('artist') or parsed.get('artists')
            if artist_text and ', '.join(creators) != artist_text:
                creators = [artist_text] if 'artist' in parsed else artist_text.split(', ')
            first_release = parsed.get('first released as') or first_release
            if parsed.get('genres'):
                genres = parsed['genres'].split(', ')
        info(header, 'Artist' if len(creators) == 1 else 'Artists', creators)
        info(header, 'First released as', first_release)
        info(header, 'Genres', genres)
        info(header, 'Release date', context.get('release_date'))
    else:
        info(local, 'Genres', genres)
        info(local, 'Studio' if media_type == 'anime' else 'Creators', creators)
        total = item.total_main if item else context.get('total_main')
        runtime = item.episode_runtime if item else context.get('episode_runtime')
        if total:
            info(local, {'movie': 'Runtime', 'manga': 'Chapters'}.get(media_type, 'Episodes'),
                 display_duration(total) if media_type == 'movie' else str(total) if media_type in ('tv', 'anime', 'manga') else None)
        if runtime:
            info(local, 'Episode runtime', f'{runtime} minutes')
        info(local, 'Release date', context.get('release_date'))
    tabs = [{'id': 'overview', 'label': 'Overview'}, {'id': 'information', 'label': 'Information'}]
    if api_enabled:
        if media_type in ('movie', 'tv', 'anime', 'manga'):
            tabs.append({'id': 'cast', 'label': 'Characters' if media_type in ('anime', 'manga') else 'Cast'})
            tabs.append({'id': 'staff', 'label': 'Staff'})
        if media_type in ('movie', 'tv', 'anime', 'manga', 'game'):
            tabs.append({'id': 'trailers', 'label': 'Trailers'})
        if media_type in ('anime', 'manga', 'game'):
            tabs.append({'id': 'relations', 'label': 'Relations'})
        if media_type != 'music':
            tabs.append({'id': 'recommendations', 'label': 'Recommendations'})
    elif media_type == 'book' and context.get('recommendations'):
        local['recommendations'] = [{'id': rec['id'], 'title': rec.get('title') or '', 'subtitle': '',
                                    'image': rec.get('poster_path') or '', 'href': f'/openlib/book/{rec["id"]}/'}
                                   for rec in context['recommendations'] if rec.get('id')]
        tabs.append({'id': 'recommendations', 'label': 'Recommendations'})
    available = seed if seed is not None else local if not api_enabled else None
    if not saved and available is not None:
        tabs = [tab for tab in tabs if tab_has_content(tab['id'], available, media_type)]
    if saved and item and item.has_extra_relations is False:
        tabs = [tab for tab in tabs if tab['id'] != 'relations']
    return {'tabs': tabs, 'api_enabled': api_enabled, 'saved': saved,
            'preview_information': preview_information(seed or local, local),
            'header_information': header, 'music_generated_overview': music_generated,
            'show_overview_information': not saved and media_type != 'music'
                and tab_has_content('information', available or local, media_type),
            'movie_relations': movie_relations,
            'movie_relations_error': (seed or {}).get('errors', {}).get('relations') if media_type == 'movie' else None,
            'overview_order': overview_sections(context.get('details_sections_order')),
            'seed': seed if seed else local if not api_enabled else None,
            'local': local, 'source': context.get('source'), 'id': source_id,
            'media_type': media_type, 'artist_id': context.get('artist_id') or '',
            'album_id': context.get('album_id') or ''}
