import core.models
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0038_appsettings_live_search_settings')]

    operations = [
        migrations.AddField(
            model_name='appsettings',
            name='favorite_sections_order',
            field=models.JSONField(blank=True, default=core.models.default_favorite_sections_order),
        ),
    ]
