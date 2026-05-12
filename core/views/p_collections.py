import json

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from core.models import Collection


@require_http_methods(["POST"])
def save_collection(request):
    try:
        data = json.loads(request.body)
        col_id = data.get("id")
        title = data.get("title", "").strip()
        description = data.get("description", "").strip()
        
        if col_id:
            col = Collection.objects.get(id=col_id)
            col.title = title
            col.description = description
            col.save()
        else:
            # New collection goes to the end of the list
            from django.db.models import Max
            max_pos = Collection.objects.aggregate(Max('position'))['position__max'] or 0
            col = Collection.objects.create(title=title, description=description, position=max_pos + 1)
        
        covers = [item.cover_url for item in col.items.all() if item.cover_url][:3]
        
        return JsonResponse({"success": True, "collection": {
            "id": col.id,
            "title": col.title,
            "description": col.description or "",
            "item_count": col.items.count(),
            "covers": covers,
        }})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=400)

@require_http_methods(["DELETE"])
def delete_collection(request, collection_id):
    Collection.objects.filter(id=collection_id).delete()
    return JsonResponse({"success": True})

@require_http_methods(["POST"])
def reorder_collections(request):
    try:
        data = json.loads(request.body)
        order = data.get("order",[])
        for index, col_id in enumerate(order):
            Collection.objects.filter(id=col_id).update(position=index+1)
        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=400)