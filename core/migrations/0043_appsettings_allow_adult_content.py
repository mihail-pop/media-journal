from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0042_appsettings_list_card_overlay_settings')]

    operations = [
        migrations.AddField(
            model_name='appsettings',
            name='allow_adult_content',
            field=models.BooleanField(default=True),
        ),
    ]
