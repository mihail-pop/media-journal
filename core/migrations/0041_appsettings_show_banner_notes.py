from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0040_favoriteperson_source')]

    operations = [
        migrations.AddField(
            model_name='appsettings',
            name='show_banner_notes',
            field=models.BooleanField(default=True),
        ),
    ]
