import json

from django.http import JsonResponse
from django.db.models import Max
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods

from core.models import Collection
from core.services.g_collections import collection_ids, save_collection_order


@require_http_methods(["POST"])
def save_collection(request):
    try:
        data = json.loads(request.body)
        if not isinstance(data, dict):
            raise ValueError('Invalid collection.')
        col_id = data.get("id")
        title = data.get("title", "").strip()
        description = data.get("description", "").strip()
        if not title or len(title) > 200:
            raise ValueError('Enter a collection title with up to 200 characters.')
        
        if col_id:
            col = get_object_or_404(Collection, id=col_id)
            col.title = title
            col.description = description
            col.save(update_fields=['title', 'description', 'last_updated'])
        else:
            # New collection goes to the end of the list
            max_pos = Collection.objects.aggregate(Max('position'))['position__max'] or 0
            col = Collection.objects.create(title=title, description=description, position=max_pos + 1)
        
        covers = [
            {'url': row['item__cover_url'] or '/static/core/img/placeholder.png',
             'media_type': row['item__media_type']}
            for row in col.collectionitem_set.order_by('position', '-date_added', 'pk')
            .values('item__cover_url', 'item__media_type')[:5]
        ]
        
        return JsonResponse({"success": True, "collection": {
            "id": col.id,
            "title": col.title,
            "description": col.description or "",
            "item_count": col.items.count(),
            "covers": covers,
        }})
    except (ValueError, TypeError, AttributeError) as e:
        return JsonResponse({"success": False, "error": str(e)}, status=400)

@require_http_methods(["DELETE"])
def delete_collection(request, collection_id):
    Collection.objects.filter(id=collection_id).delete()
    return JsonResponse({"success": True})

@require_http_methods(["POST"])
def reorder_collections(request):
    try:
        data = json.loads(request.body)
        order = collection_ids(data, 'order')
        save_collection_order(Collection.objects.all(), order)
        return JsonResponse({"success": True})
    except (ValueError, TypeError, AttributeError) as e:
        return JsonResponse({"success": False, "error": str(e)}, status=400)
