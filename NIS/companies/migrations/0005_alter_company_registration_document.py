"""Регистрационные документы переезжают из media/ в приватное хранилище.

Поле меняет storage, поэтому уже загруженные файлы надо перенести руками:
запись в базе хранит только относительный путь, и без переноса документ
окажется потерянным для вьюхи, которая ищет его в новом месте.
"""
import shutil
from pathlib import Path

import core.storage
import django.core.validators
from django.conf import settings
from django.db import migrations, models


def _move(old_root, new_root, apps):
    Company = apps.get_model('companies', 'Company')
    moved = 0
    for username, name in Company.objects.exclude(
            registration_document='').values_list('username', 'registration_document'):
        source = Path(old_root) / name
        target = Path(new_root) / name
        if not source.exists() or target.exists():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(target))
        moved += 1
    return moved


def to_private(apps, schema_editor):
    _move(settings.MEDIA_ROOT, settings.PRIVATE_MEDIA_ROOT, apps)


def to_public(apps, schema_editor):
    _move(settings.PRIVATE_MEDIA_ROOT, settings.MEDIA_ROOT, apps)


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0004_company_directions'),
    ]

    operations = [
        migrations.AlterField(
            model_name='company',
            name='registration_document',
            field=models.FileField(blank=True, storage=core.storage.private_storage, upload_to='company_documents/', validators=[django.core.validators.FileExtensionValidator(['pdf'])]),
        ),
        migrations.RunPython(to_private, to_public),
    ]
