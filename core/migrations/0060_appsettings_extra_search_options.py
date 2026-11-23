from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0059_appsettings_community_id')]

    operations = [
        migrations.AddField(
            model_name='appsettings',
            name='show_people_in_search',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='appsettings',
            name='show_characters_in_search',
            field=models.BooleanField(default=False),
        ),
    ]
