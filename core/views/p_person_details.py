import os
import json
import time
import logging

from django.conf import settings
from django.http import JsonResponse
from django.utils.text import slugify
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from core.models import FavoritePerson, MediaItem, MediaPersonLink
from core.services.g_utils import normalize_search_text

from core.services.m_people import (
    fetch_actor_data,
    fetch_character_data,
    delete_favorite_person_and_reorder,
)
from core.services.p_person_details import refresh_favorite_person
from core.services.g_utils import get_sharded_path

logger = logging.getLogger(__name__)


@ensure_csrf_cookie
def delete_favorite_person(request, person_id):
    success = delete_favorite_person_and_reorder(person_id)
    return JsonResponse({"success": success})


@ensure_csrf_cookie
@require_POST
def refresh_favorite_person_view(request):
    data = json.loads(request.body)
    api_person_id = data.get("person_id")  # This is the API ID (TMDB/AniList)
    person_type = data.get("person_type")
    refresh_mode = data.get("refresh_mode", "data")

    if not api_person_id or not person_type:
        return JsonResponse({"error": "Missing parameters"}, status=400)

    # Find the database record using API ID and type
    try:
        person = FavoritePerson.objects.get(person_id=api_person_id, type=person_type)
        success = refresh_favorite_person(person.id, refresh_mode)  # Pass database ID and mode
        return JsonResponse({"success": success})
    except FavoritePerson.DoesNotExist:
        return JsonResponse({"error": "Person not found"}, status=404)


@ensure_csrf_cookie
@require_POST
def upload_person_image(request):
    uploaded_file = request.FILES.get("image")
    person_id = request.POST.get("person_id")
    person_type = request.POST.get("person_type")

    if not uploaded_file or not person_id or not person_type:
        return JsonResponse({"error": "Missing required data."}, status=400)

    ext = os.path.splitext(uploaded_file.name)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        return JsonResponse({"error": "Unsupported file type."}, status=400)

    try:
        person = FavoritePerson.objects.get(person_id=person_id, type=person_type)

        # Generate cache-busting filename
        timestamp = int(time.time() * 1000)
        slug_name = slugify(person.name)
        base_name = f"{slug_name}_{timestamp}"
        
        flat_relative_path = f"favorites/{person_type}s/{base_name}{ext}"
        sharded_relative_path = get_sharded_path(flat_relative_path)
        new_path = os.path.join(settings.MEDIA_ROOT, sharded_relative_path)
        
        os.makedirs(os.path.dirname(new_path), exist_ok=True)

        # Remove old image if it's in favorites directory
        if person.image_url and person.image_url.startswith(settings.MEDIA_URL):
            relative_path = person.image_url.replace(settings.MEDIA_URL, "").lstrip("/")
            if relative_path.startswith("favorites/"):
                old_path = os.path.join(settings.MEDIA_ROOT, relative_path)
                if os.path.exists(old_path):
                    os.remove(old_path)

        # Save new file
        with open(new_path, "wb+") as destination:
            for chunk in uploaded_file.chunks():
                destination.write(chunk)

        relative_url = f"{settings.MEDIA_URL}{sharded_relative_path}"
        person.image_url = relative_url
        person.save(update_fields=["image_url"])

        return JsonResponse({"success": True, "url": relative_url})

    except FavoritePerson.DoesNotExist:
        return JsonResponse({"error": "Person not found."}, status=404)


@ensure_csrf_cookie
@require_GET
def actor_detail_api(request, actor_id):
    """API endpoint for actor details"""
    data = fetch_actor_data(actor_id)
    if data:
        return JsonResponse(data)
    return JsonResponse({"error": "Actor not found"}, status=404)


@ensure_csrf_cookie
@require_GET
def character_detail_api(request, character_id):
    """API endpoint for character details"""
    logger.info(
        f"character_detail_api called with character_id: {character_id} (type: {type(character_id)})"
    )

    # Validate character_id
    if not character_id or character_id == "None":
        logger.error(f"Invalid character_id received: {character_id}")
        return JsonResponse({"error": "Invalid character ID"}, status=400)

    # Validate it's either a custom ID or a valid integer
    if not str(character_id).startswith("custom_"):
        try:
            int(character_id)
        except (ValueError, TypeError):
            logger.error(f"Character ID cannot be converted to integer: {character_id}")
            return JsonResponse({"error": "Invalid character ID format"}, status=400)

    try:
        data = fetch_character_data(character_id)
        if data:
            return JsonResponse(data)
        logger.error(f"No data returned for character_id: {character_id}")
        return JsonResponse({"error": "Character not found"}, status=404)
    except Exception as e:
        logger.error(
            f"Error in character_detail_api for character_id {character_id}: {str(e)}"
        )
        return JsonResponse({"error": "Internal server error"}, status=500)

@ensure_csrf_cookie
@require_GET
def search_local_media(request):
    try:
        query = request.GET.get('q', '').strip()
        if not query:
            return JsonResponse({'results': []})
            
        queryset = MediaItem.objects.all()
        normalized_query = normalize_search_text(query)
        search_data = queryset.values_list('id', 'title', 'creators')
        matching_ids = []
        
        for item_id, title, creators in search_data:
            target_text = normalize_search_text(title)
            if creators and isinstance(creators, list):
                target_text += " " + normalize_search_text(" ".join(creators))
            elif creators and isinstance(creators, str):
                target_text += " " + normalize_search_text(creators)
                
            if normalized_query in target_text:
                matching_ids.append(item_id)
        
        items = queryset.filter(id__in=matching_ids)[:15]
        
        results = []
        for i in items:
            year = i.release_date[:4] if i.release_date else ""
            results.append({
                'id': i.id, 
                'title': i.title, 
                'cover': i.cover_url or "/static/core/img/placeholder.png", 
                'year': year,
                'type': i.get_media_type_display()
            })
        return JsonResponse({'results': results})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)

@ensure_csrf_cookie
@require_POST
def assign_media_to_person(request):
    try:
        data = json.loads(request.body)
        person_id = data.get('person_id')
        person_type = data.get('person_type')
        media_ids = data.get('media_ids', [])
        
        person = FavoritePerson.objects.get(person_id=person_id, type=person_type)
        for m_id in media_ids:
            item = MediaItem.objects.get(id=m_id)
            MediaPersonLink.objects.get_or_create(item=item, person=person)
            
            # Automatically append the person's name to the media item's creators list
            if not isinstance(item.creators, list):
                item.creators = []
                
            if person.name not in item.creators:
                item.creators.append(person.name)
                item.save(update_fields=['creators'])
                
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)

@ensure_csrf_cookie
@require_POST
def remove_assigned_media(request):
    try:
        data = json.loads(request.body)
        link_id = data.get('link_id')
        
        # Get the link and related data before deleting it
        link = MediaPersonLink.objects.get(id=link_id)
        item = link.item
        person_name = link.person.name
        
        # Remove the person's name from the item's creators list if it exists
        if isinstance(item.creators, list) and person_name in item.creators:
            item.creators.remove(person_name)
            item.save(update_fields=['creators'])
            
        link.delete()
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)

@ensure_csrf_cookie
@require_POST
def update_assigned_role(request):
    try:
        data = json.loads(request.body)
        link_id = data.get('link_id')
        new_role = data.get('role', '')
        link = MediaPersonLink.objects.get(id=link_id)
        link.media_role = new_role
        link.save()
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)