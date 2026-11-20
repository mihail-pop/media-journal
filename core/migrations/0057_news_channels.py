from django.db import migrations, models
from django.db.models import Max


def add_news_navigation(apps, schema_editor):
    NavItem = apps.get_model('core', 'NavItem')
    items = NavItem.objects.using(schema_editor.connection.alias)
    if not items.filter(name='news').exists():
        position = (items.aggregate(last=Max('position'))['last'] or 0) + 1
        items.create(name='news', visible=False, position=position)


def remove_news_navigation(apps, schema_editor):
    NavItem = apps.get_model('core', 'NavItem')
    NavItem.objects.using(schema_editor.connection.alias).filter(name='news').delete()


class Migration(migrations.Migration):
    dependencies = [('core', '0056_musicplay_listening_duration')]

    operations = [
        migrations.CreateModel(
            name='NewsChannel',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('media_type', models.CharField(max_length=10, choices=[
                    ('movie', 'Movie'), ('tv', 'TV Series'), ('anime', 'Anime'),
                    ('manga', 'Manga'), ('game', 'Game'), ('book', 'Book'), ('music', 'Music'),
                ])),
                ('channel_id', models.CharField(max_length=24)),
                ('name', models.CharField(max_length=200)),
                ('url', models.URLField(max_length=500)),
                ('enabled', models.BooleanField(default=True)),
                ('avatar_url', models.URLField(blank=True, default='', max_length=1000)),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('media_type', 'channel_id'), name='unique_news_channel_per_media')],
            },
        ),
        migrations.AddField(
            model_name='appsettings',
            name='news_disabled_channels',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AlterField(
            model_name='navitem',
            name='name',
            field=models.CharField(max_length=20, choices=[
                ('home', 'Home'), ('movies', 'Movies'), ('tvshows', 'TV Shows'),
                ('anime', 'Anime'), ('games', 'Games'), ('manga', 'Manga'),
                ('books', 'Books'), ('music', 'Music'), ('favorites', 'Favorites'),
                ('collections', 'Collections'), ('history', 'History'), ('calendar', 'Calendar'),
                ('discover', 'Discover'), ('community', 'Community'), ('news', 'News'),
            ]),
        ),
        migrations.RunPython(add_news_navigation, remove_news_navigation),
    ]
