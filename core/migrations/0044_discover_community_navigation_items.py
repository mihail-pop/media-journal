from django.db import migrations, models
from django.db.models import Max


OPTIONAL_LINKS = ('discover', 'community')


def add_optional_links(apps, schema_editor):
    NavItem = apps.get_model('core', 'NavItem')
    items = NavItem.objects.using(schema_editor.connection.alias)
    position = items.aggregate(last=Max('position'))['last'] or 0
    for name in OPTIONAL_LINKS:
        if not items.filter(name=name).exists():
            position += 1
            items.create(name=name, visible=False, position=position)


def remove_optional_links(apps, schema_editor):
    NavItem = apps.get_model('core', 'NavItem')
    NavItem.objects.using(schema_editor.connection.alias).filter(name__in=OPTIONAL_LINKS).delete()


class Migration(migrations.Migration):
    dependencies = [('core', '0043_appsettings_allow_adult_content')]

    operations = [
        migrations.AlterField(
            model_name='navitem',
            name='name',
            field=models.CharField(max_length=20, choices=[
                ('home', 'Home'), ('movies', 'Movies'), ('tvshows', 'TV Shows'),
                ('anime', 'Anime'), ('games', 'Games'), ('manga', 'Manga'),
                ('books', 'Books'), ('music', 'Music'), ('favorites', 'Favorites'),
                ('collections', 'Collections'), ('history', 'History'), ('calendar', 'Calendar'),
                ('discover', 'Discover'), ('community', 'Community'),
            ]),
        ),
        migrations.RunPython(add_optional_links, remove_optional_links),
    ]
