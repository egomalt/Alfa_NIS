from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('constructor', '0002_testpage_page_meta'),
    ]

    operations = [
        migrations.RenameField(
            model_name='test',
            old_name='company_username',
            new_name='owner_username',
        ),
    ]
