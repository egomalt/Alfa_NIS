from django.core.management.base import BaseCommand, CommandError

from authorization.models import Account, ROLE_MODERATOR


class Command(BaseCommand):
    help = 'Создаёт аккаунт модератора (вход в систему беспарольный, по username).'

    def add_arguments(self, parser):
        parser.add_argument('username', help='Логин модератора (латиница, цифры, дефис, подчёркивание)')
        parser.add_argument('--name', default='', help='Отображаемое имя (по умолчанию = username)')

    def handle(self, *args, **options):
        username = options['username'].strip()
        name = (options['name'] or username).strip()

        existing = Account.objects.filter(username__iexact=username).first()
        if existing:
            if existing.role == ROLE_MODERATOR:
                raise CommandError(f'Модератор «{username}» уже существует.')
            existing.role = ROLE_MODERATOR
            existing.save(update_fields=['role'])
            self.stdout.write(self.style.SUCCESS(
                f'Аккаунт «{username}» повышен до модератора. Вход: /authorization/signin/'
            ))
            return

        account = Account(username=username, name=name, role=ROLE_MODERATOR)
        account.full_clean()
        account.save()
        self.stdout.write(self.style.SUCCESS(
            f'Модератор «{username}» создан. Вход: /authorization/signin/ → /administration/'
        ))
