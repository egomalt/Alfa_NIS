from django.core.management.base import BaseCommand, CommandError

from authorization.models import Account
from core.utils import resolve_new_password


class Command(BaseCommand):
    help = 'Задаёт или меняет пароль существующего аккаунта.'

    def add_arguments(self, parser):
        parser.add_argument('username', help='Логин аккаунта')
        parser.add_argument(
            '--password',
            default='',
            help='Пароль. Без него будет запрошен скрытым вводом.',
        )

    def handle(self, *args, **options):
        username = options['username'].strip().lower()
        account = Account.objects.filter(username__iexact=username).first()
        if account is None:
            raise CommandError(f'Аккаунт «{username}» не найден.')

        try:
            raw_password = resolve_new_password(options['password'])
        except ValueError as error:
            raise CommandError(str(error)) from error

        account.set_password(raw_password)
        account.save(update_fields=['password'])
        self.stdout.write(self.style.SUCCESS(f'Пароль аккаунта «{account.username}» обновлён.'))
