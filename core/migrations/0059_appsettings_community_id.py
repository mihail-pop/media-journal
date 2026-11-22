import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0058_collection_people')]

    operations = [
        migrations.AddField(
            model_name='appsettings',
            name='community_id',
            field=models.UUIDField(default=uuid.uuid4, editable=False),
        ),
    ]
