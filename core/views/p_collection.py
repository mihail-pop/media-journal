import json

from django.http import JsonResponse
from django.db.models import Case, F, IntegerField, Max, Q, Value, When
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET, require_http_methods

from core.models import MediaItem, Collection, CollectionItem, FavoritePerson
from core.services.g_collections import collection_ids, collection_targets, save_collection_order
from core.services.g_utils import normalize_search_text


@require_GET
def search_local_items(request, collection_id):
    query = normalize_search_text(request.GET.get('q', '').strip())
    media_type = request.GET.get('type', 'all')
    try:
        page = max(1, int(request.GET.get('page', 1)))
    except ValueError:
        return JsonResponse({'error': 'Invalid page.'}, status=400)
    page_size = 50
    start = (page - 1) * page_size
    end = start + page_size

    group = request.GET.get('group', 'media')
    if group == 'people':
        existing_ids = CollectionItem.objects.filter(collection_id=collection_id, person__isnull=False).values_list('person_id', flat=True)
        people = FavoritePerson.objects.exclude(pk__in=existing_ids)
        if media_type in ('actor', 'character'):
            people = people.filter(type=media_type)
        elif media_type != 'all':
            return JsonResponse({'error': 'Invalid person type.'}, status=400)
        if query:
            matching_ids = [pk for pk, name in people.values_list('pk', 'name') if query in normalize_search_text(name)]
            people = people.filter(pk__in=matching_ids)
        people = people.annotate(
            type_order=Case(When(type='actor', then=Value(0)), default=Value(1), output_field=IntegerField()),
        ).only('id', 'name', 'image_url', 'type', 'person_id', 'source').order_by('type_order', 'position', 'pk')
        total = people.count()
        data = [{
            'id': person.pk, 'kind': 'person', 'title': person.name, 'media_type': person.type,
            'cover_url': person.image_url or '/static/core/img/placeholder.png',
            'banner_url': '', 'url': person.get_absolute_url(),
        } for person in people[start:end]]
        return JsonResponse({'items': data, 'has_more': total > end, 'page': page})
    if group != 'media':
        return JsonResponse({'error': 'Invalid item group.'}, status=400)
    
    # Exclude items already in this collection
    existing_ids = CollectionItem.objects.filter(collection_id=collection_id, item__isnull=False).values_list('item_id', flat=True)
    qs = MediaItem.objects.exclude(id__in=existing_ids)
    
    if media_type != 'all':
        qs = qs.filter(media_type=media_type)
        
    if query:
        matching_ids = []
        for item_id, title, creators in qs.values_list('id', 'title', 'creators'):
            target = normalize_search_text(title)
            if isinstance(creators, list):
                target += ' ' + normalize_search_text(' '.join(map(str, creators)))
            elif isinstance(creators, str):
                target += ' ' + normalize_search_text(creators)
            if query in target:
                matching_ids.append(item_id)
        qs = qs.filter(id__in=matching_ids)
        
    qs = qs.only('id', 'title', 'media_type', 'cover_url', 'banner_url').order_by('-date_added', 'pk')
    total = qs.count()
    has_more = total > end
    
    data = []
    for item in qs[start:end]:
        data.append({
            "id": item.id,
            "kind": "media",
            "title": item.title,
            "media_type": item.media_type,
            "cover_url": item.cover_url or "/static/core/img/placeholder.png",
            "banner_url": item.banner_url,
        })
        
    return JsonResponse({"items": data, "has_more": has_more, "page": page})

@require_http_methods(["POST"])
def collection_add_items(request, collection_id):
    get_object_or_404(Collection, pk=collection_id)
    try:
        targets = collection_targets(json.loads(request.body))
    except (ValueError, TypeError, AttributeError) as e:
        return JsonResponse({'error': str(e)}, status=400)
    if not targets:
        return JsonResponse({'success': True})
    media_ids = [pk for kind, pk in targets if kind == 'media']
    person_ids = [pk for kind, pk in targets if kind == 'person']
    valid_media = set(MediaItem.objects.filter(pk__in=media_ids).values_list('pk', flat=True))
    valid_people = set(FavoritePerson.objects.filter(pk__in=person_ids).values_list('pk', flat=True))
    if len(valid_media) != len(media_ids) or len(valid_people) != len(person_ids):
        return JsonResponse({'error': 'Some selected items no longer exist. Search again and retry.'}, status=400)

    with transaction.atomic():
        # Take the write lock before reading positions, including on SQLite.
        Collection.objects.filter(pk=collection_id).update(last_updated=F('last_updated'))
        max_pos = CollectionItem.objects.filter(collection_id=collection_id).aggregate(Max('position'))['position__max'] or 0
        existing = set(CollectionItem.objects.filter(collection_id=collection_id).filter(
            Q(item_id__in=media_ids) | Q(person_id__in=person_ids),
        ).values_list('item_id', 'person_id'))
        new_items = []
        for kind, pk in targets:
            item_id, person_id = (pk, None) if kind == 'media' else (None, pk)
            if (item_id, person_id) not in existing:
                new_items.append(CollectionItem(
                    collection_id=collection_id, item_id=item_id, person_id=person_id,
                    position=max_pos + len(new_items) + 1,
                ))
        CollectionItem.objects.bulk_create(new_items, ignore_conflicts=True)
        
    return JsonResponse({"success": True})

@require_http_methods(["POST"])
def collection_remove_items(request, collection_id):
    get_object_or_404(Collection, pk=collection_id)
    try:
        data = json.loads(request.body)
        by_entry = 'entry_ids' in data
        ids = collection_ids(data, 'entry_ids' if by_entry else 'item_ids')
    except (ValueError, TypeError, AttributeError) as e:
        return JsonResponse({'error': str(e)}, status=400)
    links = CollectionItem.objects.filter(collection_id=collection_id)
    if not by_entry and links.filter(person__isnull=False).exists():
        return JsonResponse({'error': 'Reload this page before changing a collection with people.'}, status=400)
    if ids:
        links.filter(**{'pk__in' if by_entry else 'item_id__in': ids}).delete()
    return JsonResponse({"success": True})

@require_http_methods(["POST"])
def collection_reorder_items(request, collection_id):
    try:
        data = json.loads(request.body)
        by_entry = 'entry_ids' in data
        order = collection_ids(data, 'entry_ids' if by_entry else 'order')
        links = CollectionItem.objects.filter(collection_id=collection_id)
        if not by_entry and links.filter(person__isnull=False).exists():
            raise ValueError('Reload this page before changing a collection with people.')
        save_collection_order(links, order, key='pk' if by_entry else 'item_id')
    except (ValueError, TypeError, AttributeError) as e:
        return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({"success": True})
