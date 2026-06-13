from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('users', '0003_article'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name='Article',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('author_username', models.SlugField()),
                        ('title', models.CharField(blank=True, max_length=255)),
                        ('excerpt', models.TextField(blank=True)),
                        ('content', models.JSONField(default=list)),
                        ('tags', models.JSONField(default=list)),
                        ('status', models.CharField(default='draft', max_length=20)),
                        ('cover_index', models.IntegerField(default=0)),
                        ('read_time', models.IntegerField(default=0)),
                        ('views', models.IntegerField(default=0)),
                        ('likes', models.IntegerField(default=0)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                        ('published_at', models.DateTimeField(blank=True, null=True)),
                    ],
                    options={
                        'db_table': 'articles',
                        'ordering': ['-created_at'],
                    },
                ),
            ],
        ),
    ]
