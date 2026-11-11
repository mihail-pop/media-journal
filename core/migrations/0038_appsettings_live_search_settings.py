import core.models
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0037_optional_navigation_items')]

    operations = [
        migrations.AddField(
            model_name='appsettings',
            name='live_search_settings',
            field=models.JSONField(blank=True, default=core.models.default_live_search_settings),
        ),
    ]
