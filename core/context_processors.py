from .models import NavItem

def nav_items(request):
    items = NavItem.objects.filter(visible=True).order_by('position')
    return {"nav_items": items}