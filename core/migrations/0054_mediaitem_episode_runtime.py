from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0053_mediaitemactivity')]

    operations = [
        migrations.AddField(
            model_name='mediaitem',
            name='episode_runtime',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
