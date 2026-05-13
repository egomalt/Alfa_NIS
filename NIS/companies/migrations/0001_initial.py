import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Company',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('username', models.SlugField(
                    max_length=50,
                    unique=True,
                    validators=[
                        django.core.validators.RegexValidator(
                            regex='^[a-zA-Z0-9_-]+$',
                            message='Используйте только латинские буквы, цифры, дефис и подчёркивание.',
                        )
                    ],
                )),
                ('name', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True)),
                ('contact_email', models.EmailField(blank=True)),
                ('phone', models.CharField(blank=True, max_length=50)),
                ('website', models.URLField(blank=True)),
                ('address', models.CharField(blank=True, max_length=255)),
                ('city', models.CharField(blank=True, max_length=120)),
                ('company_size', models.CharField(blank=True, max_length=120)),
                ('industry', models.CharField(blank=True, max_length=120)),
                ('avatar', models.FileField(
                    blank=True,
                    upload_to='company_avatars/',
                    validators=[django.core.validators.FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp'])],
                )),
                ('registration_document', models.FileField(
                    blank=True,
                    upload_to='company_documents/',
                    validators=[django.core.validators.FileExtensionValidator(['pdf'])],
                )),
                ('direction_1', models.CharField(blank=True, max_length=120)),
                ('direction_2', models.CharField(blank=True, max_length=120)),
                ('direction_3', models.CharField(blank=True, max_length=120)),
                ('direction_4', models.CharField(blank=True, max_length=120)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
