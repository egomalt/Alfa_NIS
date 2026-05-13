from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Test',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('company_username', models.SlugField(max_length=50)),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True)),
                ('status', models.CharField(
                    choices=[('draft', 'Черновик'), ('published', 'Опубликован')],
                    default='draft', max_length=16,
                )),
                ('stats', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='TestPage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('order', models.PositiveIntegerField(default=0)),
                ('type', models.CharField(max_length=16)),
                ('title', models.CharField(blank=True, max_length=500)),
                ('content', models.TextField(blank=True)),
                ('test', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='pages', to='constructor.test',
                )),
            ],
            options={'ordering': ['order']},
        ),
        migrations.CreateModel(
            name='TestAnswer',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('text', models.CharField(max_length=1000)),
                ('is_correct', models.BooleanField(default=False)),
                ('order', models.PositiveIntegerField(default=0)),
                ('page', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='answers', to='constructor.testpage',
                )),
            ],
            options={'ordering': ['order']},
        ),
    ]
