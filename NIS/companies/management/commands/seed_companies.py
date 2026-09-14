"""Демонстрационные компании для локального просмотра каталога.

Набор специально неровный: длинные и пустые описания, длинное название,
компании без индустрии и без оценок — чтобы сразу было видно, как вёрстка
ведёт себя на краевых случаях, а не только на аккуратных данных.

    manage.py seed_companies            # создать
    manage.py seed_companies --clear    # удалить созданные этой командой
"""
import random

from django.core.management.base import BaseCommand
from django.db import transaction

from authorization.models import Account, ROLE_COMPANY, ROLE_USER
from companies.models import Company, CompanyRating
from tests.constructor.models import Test, TestAnswer, TestPage

DEMO_PASSWORD = 'Alfa-Dev-2026'
RATER_PREFIX = 'demo-rater-'

LONG_DESCRIPTION = (
    'Международная технологическая компания с офисами в двенадцати странах. '
    'Разрабатываем поисковые технологии, картографические сервисы, облачную '
    'инфраструктуру и решения для бизнеса на основе машинного обучения. '
    'В команде более четырёх тысяч инженеров, а внутренняя школа разработки '
    'ежегодно выпускает несколько сотен специалистов. Мы верим, что сильная '
    'инженерная культура рождается из открытого обмена знаниями, поэтому '
    'публикуем тестовые задания и проводим открытые конкурсы для студентов.'
)

COMPANIES = [
    # (логин, название, описание, индустрия, город, тестов, оценки)
    ('yandex-demo', 'Яндекс', LONG_DESCRIPTION, 'IT', 'Москва', 7, [5, 5, 4, 5]),
    ('sbertech-demo', 'СберТех', 'Финансовые платформы, процессинг и внутренние сервисы банка.',
     'Финтех', 'Москва', 4, [4, 4, 5]),
    ('vk-demo', 'VK', 'Социальные сети, музыка, игры и образовательные сервисы.',
     'IT', 'Санкт-Петербург', 3, [4, 3, 4]),
    ('ozon-demo', 'Ozon Tech', 'Высоконагруженные системы электронной коммерции: логистика, склады, платежи.',
     'E-commerce', 'Москва', 5, [5, 5]),
    ('avito-demo', 'Авито', 'Крупнейший классифайд страны: поиск, рекомендации, антифрод.',
     'E-commerce', 'Москва', 2, [4, 4, 4, 3]),
    ('tbank-demo', 'Т-Технологии', 'Банк, брокер, мобильный оператор и экосистема сервисов в одном приложении.',
     'Финтех', 'Москва', 6, []),
    ('kaspersky-demo', 'Лаборатория Касперского',
     'Защита от киберугроз: антивирусные решения, промышленная безопасность, исследования угроз.',
     'Безопасность', 'Москва', 1, [5, 4]),
    ('2gis-demo', '2ГИС', 'Картографические сервисы и справочник организаций.',
     'IT', 'Новосибирск', 0, [4, 5]),
    ('wildberries-demo', 'Wildberries', '', 'E-commerce', 'Москва', 3, [3, 2, 3]),
    ('positive-demo', 'Positive Technologies',
     'Продукты для защиты корпоративных сетей и расследования инцидентов.',
     'Безопасность', 'Москва', 2, [5]),
    ('gazprom-demo', 'Газпром нефть — Цифровые решения',
     'Цифровизация добычи и переработки: промышленная аналитика, предиктивное обслуживание.',
     'Промышленность', 'Санкт-Петербург', 1, [4, 4]),
    ('nolabel-demo', 'Компания без описания и индустрии', '', '', '', 0, []),
]


class Command(BaseCommand):
    help = 'Создаёт демонстрационные компании для просмотра каталога (только для локальной работы).'

    def add_arguments(self, parser):
        parser.add_argument('--clear', action='store_true',
                            help='Удалить компании и аккаунты, созданные этой командой')

    def handle(self, *args, **options):
        if options['clear']:
            return self._clear()

        raters = self._ensure_raters()

        created = skipped = 0
        for username, name, description, industry, city, tests_count, ratings in COMPANIES:
            if Account.objects.filter(username=username).exists():
                skipped += 1
                continue
            with transaction.atomic():
                Account.objects.create_user(username, name=name, password=DEMO_PASSWORD, role=ROLE_COMPANY)
                company = Company.objects.create(
                    username=username, name=name, description=description,
                    industry=industry, city=city, contact_email=f'{username}@example.ru',
                    verification_status=Company.VERIF_APPROVED,
                )
                self._make_tests(username, tests_count)
                for rater, value in zip(raters, ratings):
                    CompanyRating.objects.create(company=company, user_username=rater, rating=value)
            created += 1

        self.stdout.write(self.style.SUCCESS(f'Создано компаний: {created}, пропущено (уже есть): {skipped}'))
        self.stdout.write(f'Пароль у всех демо-аккаунтов: {DEMO_PASSWORD}')
        self.stdout.write('Каталог: /companies/   Удалить: manage.py seed_companies --clear')

    def _ensure_raters(self):
        """Отдельные аккаунты-кандидаты: оценка компании привязана к пользователю."""
        raters = []
        for i in range(4):
            username = f'{RATER_PREFIX}{i}'
            if not Account.objects.filter(username=username).exists():
                Account.objects.create_user(username, name=f'Кандидат {i + 1}',
                                            password=DEMO_PASSWORD, role=ROLE_USER)
            raters.append(username)
        return raters

    def _make_tests(self, owner, count):
        for i in range(count):
            test = Test.objects.create(
                owner_username=owner,
                title=f'Тестовое задание №{i + 1}',
                description='Демонстрационный тест для наполнения каталога.',
                status=Test.STATUS_PUBLISHED,
                stats={'level': random.choice(['junior', 'middle', 'senior']),
                       'category': random.choice(['frontend', 'backend', 'devops', 'analytics']),
                       'submissions': random.randint(0, 120)},
            )
            page = TestPage.objects.create(test=test, order=0, type=TestPage.TYPE_QUIZ,
                                           title='Пример вопроса')
            TestAnswer.objects.create(page=page, text='Верный ответ', is_correct=True, order=0)
            TestAnswer.objects.create(page=page, text='Неверный ответ', is_correct=False, order=1)

    def _clear(self):
        usernames = [c[0] for c in COMPANIES]
        Test.objects.filter(owner_username__in=usernames).delete()
        CompanyRating.objects.filter(user_username__startswith=RATER_PREFIX).delete()
        companies = Company.objects.filter(username__in=usernames).delete()[0]
        accounts = Account.objects.filter(username__in=usernames).delete()[0]
        Account.objects.filter(username__startswith=RATER_PREFIX).delete()
        self.stdout.write(self.style.SUCCESS(
            f'Удалено: компаний {companies}, аккаунтов {accounts}, плюс демо-оценщики.'))
