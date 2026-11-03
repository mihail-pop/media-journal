from .models import NavItem


def nav_items(request):
    items = list(NavItem.objects.filter(visible=True).order_by("position"))

    # Add display name to each item (from choices)
    for item in items:
        item.display_name = item.get_name_display()

    return {
        "nav_items": items,
        "primary_nav_items": items[:5] if len(items) >= 7 else items,
        "overflow_nav_items": items[5:] if len(items) >= 7 else [],
    }


def version_context(request):
    return {"version": "v1.31.3"}  # Update this with each release
