from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.db import migrations, models

import core.storage


def move_files(apps, schema_editor, source_root, target_root):
    Submission = apps.get_model('contests_cabinet', 'ContestSubmission')
    submissions = Submission.objects.using(schema_editor.connection.alias)
    source = FileSystemStorage(location=source_root)
    target = FileSystemStorage(location=target_root)
    files = {}
    for pk, name in submissions.exclude(file='').values_list('pk', 'file').iterator():
        files.setdefault(name, []).append(pk)
    for name, ids in files.items():
        if not source.exists(name):
            continue
        with source.open(name, 'rb') as document:
            target_name = target.save(name, document, max_length=Submission._meta.get_field('file').max_length)
        submissions.filter(pk__in=ids).update(file=target_name)
        source.delete(name)


def to_private(apps, schema_editor):
    move_files(apps, schema_editor, settings.MEDIA_ROOT, settings.PRIVATE_MEDIA_ROOT)


def to_public(apps, schema_editor):
    move_files(apps, schema_editor, settings.PRIVATE_MEDIA_ROOT, settings.MEDIA_ROOT)


class Migration(migrations.Migration):
    # Каждая запись сохраняется до удаления исходного файла.
    atomic = False

    dependencies = [
        ('contests_cabinet', '0002_contest_contest_status_idx_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='contestsubmission',
            name='file',
            field=models.FileField(blank=True, storage=core.storage.private_storage, upload_to='contest_submissions/'),
        ),
        migrations.RunPython(to_private, to_public),
    ]
