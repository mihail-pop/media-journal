import json

from django.http import JsonResponse
from django.urls import reverse
from django.db.models import Max
from django.views.decorators.http import require_GET, require_http_methods

from core.models import MediaItem, CollectionItem


@require_GET
def collection_items_api(request, collection_id):
    # Get items in the collection, ordered by position
    items = CollectionItem.objects.filter(collection_id=collection_id).select_related('item').order_by('position', '-date_added')
    
    data =[]
    for ci in items:
        item = ci.item
        
        # Generate the detail URL
        url = "#"
        if item.media_type in ["movie", "tv"]:
            if "_s" in str(item.source_id):
                parts = str(item.source_id).split("_s")
                url = reverse("tmdb_season_detail", args=[parts[0], parts[1]])
            else:
                url = reverse("tmdb_detail", args=[item.media_type, item.source_id])
        elif item.media_type in ["anime", "manga"]:
            url = reverse("anilist_detail", args=[item.source, item.media_type, item.source_id])
        elif item.media_type == "game":
            url = reverse("igdb_detail", args=[item.source_id])
        elif item.media_type == "book":
            url = reverse("openlib_detail", args=[item.source_id])
        elif item.media_type == "music":
            url = reverse("musicbrainz_detail", args=[item.source_id])

        data.append({
            "id": item.id,
            "title": item.title,
            "media_type": item.media_type,
            "cover_url": item.cover_url or "/static/core/img/placeholder.png",
            "banner_url": item.banner_url,
            "position": ci.position,
            "url": url  # Pass the URL here!
        })
        
    return JsonResponse({"items": data})

@require_GET
def search_local_items(request, collection_id):
    query = request.GET.get('q', '').strip()
    media_type = request.GET.get('type', 'all')
    page = int(request.GET.get('page', 1))
    page_size = 50
    start = (page - 1) * page_size
    end = start + page_size
    
    # Exclude items already in this collection
    existing_ids = CollectionItem.objects.filter(collection_id=collection_id).values_list('item_id', flat=True)
    qs = MediaItem.objects.exclude(id__in=existing_ids)
    
    if media_type != 'all':
        qs = qs.filter(media_type=media_type)
        
    if query:
        qs = qs.filter(title__icontains=query)
        
    qs = qs.order_by('-date_added')
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
    data = json.loads(request.body)
    item_ids = data.get("item_ids",[])
    
    if item_ids:
        max_pos = CollectionItem.objects.filter(collection_id=collection_id).aggregate(Max('position'))['position__max'] or 0
        
        new_items =[]
        for i, item_id in enumerate(item_ids):
            new_items.append(
                CollectionItem(collection_id=collection_id, item_id=item_id, position=max_pos + i + 1)
            )
        # Bulk create ignores unique constraint failures gracefully if using ignore_conflicts (SQLite 3.24+)
        CollectionItem.objects.bulk_create(new_items, ignore_conflicts=True)
        
    return JsonResponse({"success": True})

@require_http_methods(["POST"])
def collection_remove_items(request, collection_id):
    data = json.loads(request.body)
    item_ids = data.get("item_ids",[])
    if item_ids:
        CollectionItem.objects.filter(collection_id=collection_id, item_id__in=item_ids).delete()
    return JsonResponse({"success": True})

@require_http_methods(["POST"])
def collection_reorder_items(request, collection_id):
    data = json.loads(request.body)
    order = data.get("order",[])
    
    for index, item_id in enumerate(order):
        # Update based on item_id, not CollectionItem id
        CollectionItem.objects.filter(collection_id=collection_id, item_id=item_id).update(position=index+1)
        
    return JsonResponse({"success": True})