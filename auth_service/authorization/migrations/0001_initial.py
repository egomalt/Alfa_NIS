import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Account',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                (
                    'username',
                    models.SlugField(
                        max_length=50,
                        unique=True,
                        validators=[
                            django.core.validators.RegexValidator(
                                message='Используйте только латинские буквы, цифры, дефис и подчёркивание.',
                                regex='^[a-zA-Z0-9_-]+$',
                            )
                        ],
                    ),
                ),
                ('name', models.CharField(max_length=255)),
                (
                    'role',
                    models.CharField(
                        choices=[
                            ('user', 'Пользователь'),
                            ('company', 'Компания'),
                            ('moderator', 'Модератор'),
                        ],
                        default='company',
                        max_length=32,
                    ),
                ),
                ('email', models.EmailField(blank=True, max_length=254)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'accounts',
                'ordering': ['-created_at'],
            },
        ),
    ]
