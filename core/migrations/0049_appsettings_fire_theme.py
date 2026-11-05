from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0048_appsettings_pink_theme')]

    operations = [
        migrations.AlterField(
            model_name='appsettings',
            name='theme_mode',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('light', 'Light'), ('dark', 'Dark'), ('brown', 'Brown'),
                    ('green', 'Green'), ('plum', 'Plum'), ('charcoal', 'Charcoal'),
                    ('teal', 'Teal'), ('pink', 'Pink'), ('fire', 'Fire'),
                ],
                default='dark',
            ),
        ),
    ]
