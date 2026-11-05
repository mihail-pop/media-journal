from django.db import migrations, models


def rename_fire_to_cake(apps, schema_editor):
    AppSettings = apps.get_model('core', 'AppSettings')
    AppSettings.objects.using(schema_editor.connection.alias).filter(theme_mode='fire').update(theme_mode='cake')


def rename_cake_to_fire(apps, schema_editor):
    AppSettings = apps.get_model('core', 'AppSettings')
    AppSettings.objects.using(schema_editor.connection.alias).filter(theme_mode='cake').update(theme_mode='fire')


class Migration(migrations.Migration):
    dependencies = [('core', '0049_appsettings_fire_theme')]

    operations = [
        migrations.RunPython(rename_fire_to_cake, rename_cake_to_fire),
        migrations.AlterField(
            model_name='appsettings',
            name='theme_mode',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('light', 'Light'), ('dark', 'Dark'), ('brown', 'Brown'),
                    ('green', 'Green'), ('plum', 'Plum'), ('charcoal', 'Charcoal'),
                    ('teal', 'Teal'), ('pink', 'Pink'), ('cake', 'Cake'),
                ],
                default='dark',
            ),
        ),
    ]
