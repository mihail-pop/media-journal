from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0055_musicplay')]

    operations = [
        migrations.AddField(
            model_name='musicplay',
            name='listened_seconds',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='musicplay',
            name='qualified',
            field=models.BooleanField(default=True),
        ),
    ]
