"""Перевод Account на стандартную модель пользователя Django (AbstractBaseUser).

Поле password_hash переименовывается в password (так его называет Django) — именно
переименование, а не пересоздание, чтобы уже заданные пароли сохранились.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('authorization', '0003_account_password_hash'),
    ]

    operations = [
        migrations.RenameField(
            model_name='account',
            old_name='password_hash',
            new_name='password',
        ),
        migrations.AlterField(
            model_name='account',
            name='password',
            field=models.CharField(max_length=128, verbose_name='password'),
        ),
        migrations.AddField(
            model_name='account',
            name='last_login',
            field=models.DateTimeField(blank=True, null=True, verbose_name='last login'),
        ),
    ]
