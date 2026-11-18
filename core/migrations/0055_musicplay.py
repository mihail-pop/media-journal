import uuid

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0054_mediaitem_episode_runtime')]

    operations = [
        migrations.CreateModel(
            name='MusicPlay',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_id', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('video_id', models.CharField(max_length=11)),
                ('played_at', models.DateTimeField(db_index=True)),
                ('recorded_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('item', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='music_plays', to='core.mediaitem')),
            ],
        ),
    ]
