from .models import NavItem

def nav_items(request):
    items = NavItem.objects.filter(visible=True).order_by('position')

    # Add display name to each item (from choices)
    for item in items:
        item.display_name = item.get_name_display()

    return {"nav_items": items}