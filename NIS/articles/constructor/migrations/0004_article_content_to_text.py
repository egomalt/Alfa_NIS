"""Перевод тела статьи из JSONField в TextField.

Поле было объявлено как JSONField(default=list), но редактор всегда клал туда
HTML-строку. Из-за этого значения хранились JSON-закодированными: в кавычках
и с экранированной кириллицей (`"<h2>\\u0421 \\u0447..."`).

Простая смена типа оставила бы эти кавычки и escape-последовательности прямо
в тексте статьи, поэтому переносим данные через временное поле:
добавить → скопировать значения → удалить старое → переименовать.
"""
from django.db import migrations, models


def copy_to_text(apps, schema_editor):
    """JSON-значение → обычная строка. Не-строки (старый default=list) → пусто."""
    Article = apps.get_model('articles_constructor', 'Article')
    for article in Article.objects.all().iterator():
        value = article.content
        article.content_text = value if isinstance(value, str) else ''
        article.save(update_fields=['content_text'])


def copy_back_to_json(apps, schema_editor):
    """Обратный перенос — на случай отката миграции."""
    Article = apps.get_model('articles_constructor', 'Article')
    for article in Article.objects.all().iterator():
        article.content = article.content_text or ''
        article.save(update_fields=['content'])


class Migration(migrations.Migration):

    dependencies = [
        ('articles_constructor', '0003_article_article_status_pub_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='article',
            name='content_text',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.RunPython(copy_to_text, copy_back_to_json),
        migrations.RemoveField(model_name='article', name='content'),
        migrations.RenameField(model_name='article', old_name='content_text', new_name='content'),
        migrations.AlterField(
            model_name='article',
            name='content',
            field=models.TextField(blank=True),
        ),
    ]
