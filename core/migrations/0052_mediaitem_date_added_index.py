import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0051_appsettings_activity_date_mode')]

    operations = [
        migrations.AlterField(
            model_name='mediaitem',
            name='date_added',
            field=models.DateTimeField(default=django.utils.timezone.now, db_index=True),
        ),
    ]
