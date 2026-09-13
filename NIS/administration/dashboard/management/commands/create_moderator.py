from django.core.management.base import BaseCommand, CommandError

from authorization.models import Account, ROLE_MODERATOR
from core.utils import resolve_new_password


class Command(BaseCommand):
    help = 'Создаёт аккаунт модератора или повышает существующий аккаунт до модератора.'

    def add_arguments(self, parser):
        parser.add_argument('username', help='Логин модератора (латиница, цифры, дефис, подчёркивание)')
        parser.add_argument('--name', default='', help='Отображаемое имя (по умолчанию = username)')
        parser.add_argument(
            '--password',
            default='',
            help='Пароль. Если не указан — будет запрошен скрытым вводом (безопаснее: не попадёт в историю команд).',
        )

    def handle(self, *args, **options):
        username = options['username'].strip().lower()
        name = (options['name'] or username).strip()

        existing = Account.objects.filter(username__iexact=username).first()
        if existing:
            if existing.role == ROLE_MODERATOR:
                raise CommandError(f'Модератор «{username}» уже существует.')
            existing.role = ROLE_MODERATOR
            existing.save(update_fields=['role'])
            self.stdout.write(self.style.SUCCESS(
                f'Аккаунт «{existing.username}» повышен до модератора. Вход: /authorization/signin/'
            ))
            if not existing.password_hash:
                self.stdout.write(self.style.WARNING(
                    'У аккаунта не задан пароль — войти не получится. '
                    f'Задайте его: manage.py set_password {existing.username}'
                ))
            return

        try:
            raw_password = resolve_new_password(options['password'])
        except ValueError as error:
            raise CommandError(str(error)) from error

        account = Account(username=username, name=name, role=ROLE_MODERATOR)
        account.set_password(raw_password)
        account.full_clean()
        account.save()
        self.stdout.write(self.style.SUCCESS(
            f'Модератор «{username}» создан. Вход: /authorization/signin/ → /administration/'
        ))
