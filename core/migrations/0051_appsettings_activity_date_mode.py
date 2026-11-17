from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0050_rename_fire_theme_to_cake')]

    operations = [
        migrations.AddField(
            model_name='appsettings',
            name='activity_date_mode',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('manual', 'Manual Only'),
                    ('status', 'Any Status Change'),
                    ('status_score', 'Status + Score'),
                    ('combined', 'Combined'),
                ],
                default='combined',
            ),
        ),
    ]
