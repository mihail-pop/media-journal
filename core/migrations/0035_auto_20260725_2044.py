from django.db import migrations

def migrate_screenshots_and_music(apps, schema_editor):
    MediaItem = apps.get_model('core', 'MediaItem')
    Screenshot = apps.get_model('core', 'Screenshot')
    MusicVideo = apps.get_model('core', 'MusicVideo')

    # 1. Migrate Games
    game_items = MediaItem.objects.filter(media_type='game')
    for item in game_items:
        if item.screenshots and isinstance(item.screenshots, list):
            screenshot_objs = []
            for idx, s in enumerate(item.screenshots):
                # Handle standard dict format
                if isinstance(s, dict):
                    url = s.get('url', '')
                    is_full_url = s.get('is_full_url', False)
                # Handle edge case if some are just string URLs
                elif isinstance(s, str):
                    url = s
                    is_full_url = url.startswith('http')
                else:
                    continue

                if url:
                    screenshot_objs.append(
                        Screenshot(
                            item=item,
                            url=url,
                            is_full_url=is_full_url,
                            position=idx + 1  # Manually set position
                        )
                    )
            # bulk_create is much faster than saving one by one
            if screenshot_objs:
                Screenshot.objects.bulk_create(screenshot_objs)

    # 2. Migrate Music
    music_items = MediaItem.objects.filter(media_type='music')
    for item in music_items:
        if item.screenshots and isinstance(item.screenshots, list):
            video_objs = []
            for idx, v in enumerate(item.screenshots):
                # Handle standard dict format
                if isinstance(v, dict):
                    url = v.get('url', '')
                    position = v.get('position', idx + 1)
                # Handle edge case if some are just string URLs
                elif isinstance(v, str):
                    url = v
                    position = idx + 1
                else:
                    continue
                
                if url:
                    video_objs.append(
                        MusicVideo(
                            item=item,
                            url=url,
                            position=position
                        )
                    )
            if video_objs:
                MusicVideo.objects.bulk_create(video_objs)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0034_musicvideo_screenshot'),
    ]

    operations = [
        migrations.RunPython(migrate_screenshots_and_music, reverse_code=migrations.RunPython.noop),
    ]