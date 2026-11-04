import core.models
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0041_appsettings_show_banner_notes')]

    operations = [
        migrations.AddField(
            model_name='appsettings',
            name='list_card_overlay_settings',
            field=models.JSONField(blank=True, default=core.models.default_list_card_overlay_settings),
        ),
    ]
