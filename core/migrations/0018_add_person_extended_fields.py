# Generated manually for person detail functionality

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0017_favoriteperson_person_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='favoriteperson',
            name='birthday',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='favoriteperson',
            name='deathday',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='favoriteperson',
            name='biography',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='favoriteperson',
            name='related_media',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='favoriteperson',
            name='description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='favoriteperson',
            name='age',
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
        migrations.AddField(
            model_name='favoriteperson',
            name='media_appearances',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='favoriteperson',
            name='voice_actors',
            field=models.JSONField(blank=True, null=True),
        ),
    ]