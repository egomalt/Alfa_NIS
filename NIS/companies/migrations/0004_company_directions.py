"""Четыре поля направлений → один список.

Порядок внутри миграции важен: сначала заводим новое поле, потом переносим
значения, и только затем убираем старые колонки.
"""
from django.db import migrations, models

OLD_FIELDS = ['direction_1', 'direction_2', 'direction_3', 'direction_4']


def to_list(apps, schema_editor):
    Company = apps.get_model('companies', 'Company')
    for company in Company.objects.all().iterator():
        values = [(getattr(company, name) or '').strip() for name in OLD_FIELDS]
        company.directions = [value for value in values if value]
        company.save(update_fields=['directions'])


def to_columns(apps, schema_editor):
    """Откат: первые четыре направления возвращаются в колонки, остальные теряются."""
    Company = apps.get_model('companies', 'Company')
    for company in Company.objects.all().iterator():
        values = list(company.directions or [])[:len(OLD_FIELDS)]
        for index, name in enumerate(OLD_FIELDS):
            setattr(company, name, values[index] if index < len(values) else '')
        company.save(update_fields=OLD_FIELDS)


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0003_company_submitted_at_company_verification_reason_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='company',
            name='directions',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(to_list, to_columns),
        migrations.RemoveField(model_name='company', name='direction_1'),
        migrations.RemoveField(model_name='company', name='direction_2'),
        migrations.RemoveField(model_name='company', name='direction_3'),
        migrations.RemoveField(model_name='company', name='direction_4'),
    ]
