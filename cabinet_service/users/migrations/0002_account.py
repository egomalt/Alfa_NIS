from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Account',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('username', models.SlugField(max_length=50, unique=True)),
                ('name', models.CharField(max_length=255)),
                ('role', models.CharField(max_length=32)),
                ('email', models.EmailField(blank=True, max_length=254)),
                ('created_at', models.DateTimeField()),
            ],
            options={
                'db_table': 'accounts',
                'managed': False,
            },
        ),
    ]
