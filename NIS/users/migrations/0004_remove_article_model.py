from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0003_article'),
        ('articles_constructor', '0001_initial'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.DeleteModel(name='Article'),
            ],
        ),
    ]
