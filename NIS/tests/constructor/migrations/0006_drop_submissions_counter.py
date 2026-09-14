"""Удаление счётчика submissions из Test.stats.

Число прохождений теперь считается по таблице TestAttempt, а не хранится
числом в JSON-поле. Старое значение никем не читается, но остаётся в базе
и вводит в заблуждение, поэтому убираем его.

Синтетические попытки взамен не создаём: в stats лежали проставленные вручную
демо-числа, и превращать их в записи о прохождениях значило бы выдумать данные.
Демонстрационные прохождения заводят команды seed_contests и seed_companies.
"""
from django.db import migrations


def drop_counter(apps, schema_editor):
    Test = apps.get_model('constructor', 'Test')
    for test in Test.objects.all().iterator():
        stats = test.stats or {}
        if 'submissions' in stats:
            stats.pop('submissions')
            test.stats = stats
            test.save(update_fields=['stats'])


def restore_counter(apps, schema_editor):
    """Откат: вернуть можно только нули — исходные значения утрачены."""
    Test = apps.get_model('constructor', 'Test')
    for test in Test.objects.all().iterator():
        stats = test.stats or {}
        stats.setdefault('submissions', 0)
        test.stats = stats
        test.save(update_fields=['stats'])


class Migration(migrations.Migration):

    dependencies = [
        ('constructor', '0005_testattempt'),
    ]

    operations = [
        migrations.RunPython(drop_counter, restore_counter),
    ]
