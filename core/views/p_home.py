import os
import shutil
import logging

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST

from core.models import MediaItem

logger = logging.getLogger(__name__)


@ensure_csrf_cookie
@require_POST
def dismiss_notification(request, item_id):
    try:
        item = MediaItem.objects.get(id=item_id)
        item.notification = False
        item.save()
        return JsonResponse({"success": True})
    except MediaItem.DoesNotExist:
        return JsonResponse({"error": "Item not found"}, status=404)
    


@ensure_csrf_cookie
@require_POST
def shard_existing_images_api(request):
    from core.models import FavoritePerson
    from core.services.g_utils import get_sharded_path
    
    def process_url(db_url):
        if not db_url or not db_url.startswith(settings.MEDIA_URL):
            return db_url
        
        relative_path = db_url.replace(settings.MEDIA_URL, "").lstrip('/')
        sharded_relative = get_sharded_path(relative_path)
        
        if relative_path == sharded_relative:
            return db_url
            
        old_full = os.path.join(settings.MEDIA_ROOT, relative_path)
        new_full = os.path.join(settings.MEDIA_ROOT, sharded_relative)
        
        if os.path.exists(old_full):
            try:
                os.makedirs(os.path.dirname(new_full), exist_ok=True)
                shutil.move(old_full, new_full)
            except Exception as e:
                print(f"Failed to move {old_full}: {e}")
                return db_url # Return original if failed
                
        return settings.MEDIA_URL + sharded_relative

    try:
        # Migrate Favorite Persons
        for person in FavoritePerson.objects.all():
            if person.image_url:
                new_url = process_url(person.image_url)
                if new_url != person.image_url:
                    person.image_url = new_url
                    person.save(update_fields=['image_url'])

        # Migrate Media Items
        for item in MediaItem.objects.all():
            needs_save = False
            
            if item.cover_url:
                new_cover = process_url(item.cover_url)
                if new_cover != item.cover_url:
                    item.cover_url = new_cover
                    needs_save = True
                    
            if item.banner_url:
                new_banner = process_url(item.banner_url)
                if new_banner != item.banner_url:
                    item.banner_url = new_banner
                    needs_save = True

            if item.cast:
                for member in item.cast:
                    if "profile_path" in member and member["profile_path"]:
                        new_prof = process_url(member["profile_path"])
                        if new_prof != member["profile_path"]:
                            member["profile_path"] = new_prof
                            needs_save = True

            if item.seasons:
                for season in item.seasons:
                    if "poster_path" in season and season["poster_path"]:
                        new_sp = process_url(season["poster_path"])
                        if new_sp != season["poster_path"]:
                            season["poster_path"] = new_sp
                            needs_save = True

            if item.episodes:
                for ep in item.episodes:
                    if "still_path" in ep and ep["still_path"]:
                        new_still = process_url(ep["still_path"])
                        if new_still != ep["still_path"]:
                            ep["still_path"] = new_still
                            needs_save = True

            if item.screenshots:
                for shot in item.screenshots:
                    if "url" in shot and shot["url"]:
                        new_shot = process_url(shot["url"])
                        if new_shot != shot["url"]:
                            shot["url"] = new_shot
                            needs_save = True

            if item.related_titles:
                for related in item.related_titles:
                    if "poster_path" in related and related["poster_path"]:
                        new_rel = process_url(related["poster_path"])
                        if new_rel != related["poster_path"]:
                            related["poster_path"] = new_rel
                            needs_save = True

            if needs_save:
                item.save()

        return JsonResponse({"success": True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({"error": str(e)}, status=500)    