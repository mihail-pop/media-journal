import uuid

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0052_mediaitem_date_added_index')]

    operations = [
        migrations.CreateModel(
            name='MediaItemActivity',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_id', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('recorded_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('media_type', models.CharField(choices=[('movie', 'Movie'), ('tv', 'TV Series'), ('anime', 'Anime'), ('manga', 'Manga'), ('game', 'Game'), ('book', 'Book'), ('music', 'Music')], max_length=20)),
                ('origin', models.CharField(choices=[('edit', 'Edit'), ('metadata', 'Metadata')], max_length=20)),
                ('progress_main_before', models.PositiveIntegerField(blank=True, null=True)),
                ('progress_main_after', models.PositiveIntegerField(blank=True, null=True)),
                ('progress_secondary_before', models.PositiveIntegerField(blank=True, null=True)),
                ('progress_secondary_after', models.PositiveIntegerField(blank=True, null=True)),
                ('status_before', models.CharField(choices=[('ongoing', 'Ongoing'), ('completed', 'Completed'), ('planned', 'Planned'), ('dropped', 'Dropped'), ('on_hold', 'On Hold')], max_length=20)),
                ('status_after', models.CharField(choices=[('ongoing', 'Ongoing'), ('completed', 'Completed'), ('planned', 'Planned'), ('dropped', 'Dropped'), ('on_hold', 'On Hold')], max_length=20)),
                ('repeats_before', models.PositiveIntegerField()),
                ('repeats_after', models.PositiveIntegerField()),
                ('item', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='activity_records', to='core.mediaitem')),
            ],
        ),
    ]
