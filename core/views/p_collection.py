import json

from django.http import JsonResponse
from django.db.models import F, Max
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET, require_http_methods

from core.models import MediaItem, Collection, CollectionItem
from core.services.g_collections import collection_ids, save_collection_order
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
    
    # Exclude items already in this collection
    existing_ids = CollectionItem.objects.filter(collection_id=collection_id).values_list('item_id', flat=True)
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
        item_ids = collection_ids(json.loads(request.body), 'item_ids')
    except (ValueError, TypeError, AttributeError) as e:
        return JsonResponse({'error': str(e)}, status=400)
    if not item_ids:
        return JsonResponse({'success': True})
    valid_ids = set(MediaItem.objects.filter(pk__in=item_ids).values_list('pk', flat=True))
    if len(valid_ids) != len(item_ids):
        return JsonResponse({'error': 'Some selected items no longer exist. Search again and retry.'}, status=400)

    with transaction.atomic():
        # Take the write lock before reading positions, including on SQLite.
        Collection.objects.filter(pk=collection_id).update(last_updated=F('last_updated'))
        max_pos = CollectionItem.objects.filter(collection_id=collection_id).aggregate(Max('position'))['position__max'] or 0
        existing = set(CollectionItem.objects.filter(collection_id=collection_id, item_id__in=item_ids).values_list('item_id', flat=True))
        new_items = []
        for i, item_id in enumerate(item_ids):
            if item_id not in existing:
                new_items.append(CollectionItem(collection_id=collection_id, item_id=item_id, position=max_pos + i + 1))
        CollectionItem.objects.bulk_create(new_items, ignore_conflicts=True)
        
    return JsonResponse({"success": True})

@require_http_methods(["POST"])
def collection_remove_items(request, collection_id):
    get_object_or_404(Collection, pk=collection_id)
    try:
        item_ids = collection_ids(json.loads(request.body), 'item_ids')
    except (ValueError, TypeError, AttributeError) as e:
        return JsonResponse({'error': str(e)}, status=400)
    if item_ids:
        CollectionItem.objects.filter(collection_id=collection_id, item_id__in=item_ids).delete()
    return JsonResponse({"success": True})

@require_http_methods(["POST"])
def collection_reorder_items(request, collection_id):
    try:
        order = collection_ids(json.loads(request.body), 'order')
        save_collection_order(CollectionItem.objects.filter(collection_id=collection_id), order, key='item_id')
    except (ValueError, TypeError, AttributeError) as e:
        return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({"success": True})
