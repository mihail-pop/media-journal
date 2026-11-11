from django.db import migrations, models


def assign_existing_sources(apps, schema_editor):
    Person = apps.get_model('core', 'FavoritePerson')
    people = Person.objects.using(schema_editor.connection.alias)
    people.filter(type='actor').update(source='tmdb')
    people.filter(type='character').update(source='anilist')
    people.filter(person_id__startswith='custom_').update(source='custom')


class Migration(migrations.Migration):
    dependencies = [('core', '0039_appsettings_favorite_sections_order')]

    operations = [
        migrations.AddField(
            model_name='favoriteperson',
            name='source',
            field=models.CharField(blank=True, default='', max_length=32),
        ),
        migrations.RunPython(assign_existing_sources, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='favoriteperson',
            name='type',
            field=models.CharField(choices=[('character', 'Character'), ('actor', 'Person')], max_length=10),
        ),
    ]
