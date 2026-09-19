"""Разворачивает все демонстрационные данные одной командой.

Наполнение разбито по приложениям, и запускать пять команд подряд, помня
порядок, неудобно: конкурсы ждут компанию, кабинет кандидата — конкурсы,
очередь модерации — материалы, на которые можно пожаловаться.

    manage.py seed_all
    manage.py seed_all --user egor --company alfa
    manage.py seed_all --clear     # снять всё в обратном порядке
"""
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from authorization.models import Account, ROLE_COMPANY, ROLE_USER
from companies.models import Company
from core.demo import DEMO_PASSWORD
from users.models import UserProfile

# Порядок важен: каждая следующая команда опирается на данные предыдущих
STEPS = [
    ('seed_companies', {}),
    ('seed_articles', {}),
    ('seed_contests', {'company': 'company'}),
    ('seed_code_tests', {'owner': 'company'}),
    ('seed_candidate', {'user': 'user'}),
    ('seed_moderation', {}),
]


class Command(BaseCommand):
    help = 'Наполняет базу демонстрационными данными (или удаляет их с --clear).'

    def add_arguments(self, parser):
        parser.add_argument('--user', default='egor', help='Логин кандидата')
        parser.add_argument('--company', default='alfa', help='Логин компании')
        parser.add_argument('--clear', action='store_true',
                            help='Удалить всё созданное командами seed_*')

    def handle(self, *args, **options):
        names = {'user': options['user'], 'company': options['company']}
        clear = options['clear']

        if not clear:
            self._ensure_accounts(names['user'], names['company'])

        # Снимаем в обратном порядке: жалобы ссылаются на материалы
        steps = list(reversed(STEPS)) if clear else STEPS
        failed = []

        for command, arg_map in steps:
            kwargs = {arg: names[key] for arg, key in arg_map.items()}
            if clear:
                kwargs['clear'] = True
            self.stdout.write(self.style.MIGRATE_HEADING(f'→ {command}'))
            try:
                # Вывод вложенных команд уводим туда же, куда пишет эта:
                # иначе он минует подменённый поток и всплывёт в тестах
                call_command(command, stdout=self.stdout, stderr=self.stderr, **kwargs)
            except CommandError as error:
                failed.append((command, str(error)))
                self.stdout.write(self.style.WARNING(f'  пропущено: {error}'))

        if failed:
            self.stdout.write(self.style.WARNING(
                f'Команд пропущено: {len(failed)} из {len(steps)}.'))
        else:
            self.stdout.write(self.style.SUCCESS('Готово: все наборы данных обработаны.'))

    def _ensure_accounts(self, user, company):
        """Заводит кандидата и компанию, на которых держатся остальные шаги.

        Существующие аккаунты не трогаем — ни имя, ни пароль.
        """
        created = []
        if not Account.objects.filter(username=user).exists():
            Account.objects.create_user(user, name=user.capitalize(),
                                        password=DEMO_PASSWORD, role=ROLE_USER)
            UserProfile.objects.get_or_create(username=user)
            created.append(f'кандидат {user}')

        if not Account.objects.filter(username=company).exists():
            Account.objects.create_user(company, name=company.capitalize(),
                                        password=DEMO_PASSWORD, role=ROLE_COMPANY)
            created.append(f'компания {company}')
        Company.objects.get_or_create(
            username=company,
            defaults={'name': company.capitalize(),
                      'verification_status': Company.VERIF_APPROVED},
        )

        if created:
            self.stdout.write(self.style.SUCCESS(
                'Заведены аккаунты: ' + ', '.join(created) + f' (пароль {DEMO_PASSWORD})'))
