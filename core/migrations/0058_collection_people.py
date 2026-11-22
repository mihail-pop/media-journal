import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0057_news_channels')]

    operations = [
        migrations.AlterField(
            model_name='collectionitem',
            name='item',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='core.mediaitem'),
        ),
        migrations.AddField(
            model_name='collectionitem',
            name='person',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='core.favoriteperson'),
        ),
        migrations.AddConstraint(
            model_name='collectionitem',
            constraint=models.UniqueConstraint(fields=('collection', 'person'), name='unique_collection_person'),
        ),
        migrations.AddConstraint(
            model_name='collectionitem',
            constraint=models.CheckConstraint(
                condition=(models.Q(item__isnull=False, person__isnull=True)
                           | models.Q(item__isnull=True, person__isnull=False)),
                name='collection_entry_one_target',
            ),
        ),
    ]
