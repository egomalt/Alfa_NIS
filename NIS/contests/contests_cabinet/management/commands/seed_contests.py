"""Демонстрационные конкурсы и тесты для одной компании.

Нужны, чтобы профиль компании и каталог конкурсов можно было посмотреть
заполненными, не заводя всё руками. Набор намеренно разный: три формата
решения, разная срочность дедлайна, конкурс без приза и завершённый конкурс —
чтобы сразу было видно, как ведёт себя вёрстка на краевых случаях.

    manage.py seed_contests                  # для компании alfa
    manage.py seed_contests --company vk-demo
    manage.py seed_contests --clear          # удалить созданное этой командой
"""
import random
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from authorization.models import Account, ROLE_USER
from companies.models import Company
from contests.contests_cabinet.models import Contest, ContestSubmission
from tests.constructor.models import Test, TestAnswer, TestAttempt, TestPage
from users.models import UserProfile

DEFAULT_COMPANY = 'alfa'

# Помечаем созданное, чтобы --clear не задел конкурсы, заведённые руками
MARK = '[demo]'

RULES = [
    'Решение принимается только до истечения дедлайна',
    'Один участник может отправить решение только один раз',
    'Работа должна быть выполнена самостоятельно',
    'Использование готовых библиотек разрешено, если это указано в решении',
]

# (заголовок, категория, уровень, дней до дедлайна, приз, формат, подсказка, описание, кейс)
CONTESTS = [
    (
        'Сервис коротких ссылок', 'Backend', 'Junior', 5,
        'Оффер на стажировку', 'link',
        'Ссылка на публичный репозиторий с README',
        'Спроектируйте и реализуйте сокращатель ссылок с ограничением частоты запросов.',
        'Нужен HTTP-сервис, который принимает длинный URL и возвращает короткий код.\n\n'
        'Обязательно:\n'
        '— POST /links создаёт короткий код, GET /{код} перенаправляет на исходный адрес;\n'
        '— один и тот же URL не должен порождать новый код;\n'
        '— не больше 10 запросов в минуту с одного адреса;\n'
        '— хранилище на выбор, но выбор нужно обосновать в README.\n\n'
        'Оцениваем: корректность, читаемость кода, покрытие тестами и то, '
        'как вы объясняете принятые решения.',
    ),
    (
        'Дашборд продаж за квартал', 'Аналитика', 'Middle', 21,
        '60 000 ₽', 'file',
        'PDF или архив с ноутбуком и выгрузкой',
        'По сырой выгрузке заказов соберите дашборд и найдите причину падения выручки.',
        'Во вложении — выгрузка заказов за четыре квартала.\n\n'
        'Задача:\n'
        '— посчитать выручку, средний чек и удержание по месяцам;\n'
        '— найти, в каком сегменте произошло падение в четвёртом квартале;\n'
        '— оформить результат так, чтобы его понял коммерческий директор, а не аналитик.\n\n'
        'Формат свободный: ноутбук, презентация или интерактивный дашборд. '
        'Важнее вывод, чем количество графиков.',
    ),
    (
        'Разбор инцидента в проде', 'DevOps', 'Senior', 2,
        '', 'text',
        'Текст разбора: что случилось, почему и что менять',
        'По логам и метрикам восстановите картину аварии и предложите меры.',
        'Ночью сервис оплаты отвечал ошибкой 503 в течение 40 минут.\n\n'
        'Дано: фрагменты логов балансировщика, графики нагрузки на базу '
        'и история деплоев за сутки.\n\n'
        'Напишите постмортем: хронология, непосредственная причина, корневая причина, '
        'что помогло бы заметить раньше и какие изменения вы бы внесли. '
        'Поиск виноватых не нужен — нужен разбор.',
    ),
    (
        'Редизайн формы отклика', 'Дизайн', 'Middle', -9,
        'Оффер на стажировку', 'file',
        'PDF или ссылка на макет',
        'Конкурс завершён. Участники предлагали, как сократить путь кандидата до отклика.',
        'Форма отклика состоит из четырёх экранов, до конца доходит меньше половины кандидатов.\n\n'
        'Нужно было предложить вариант, который сокращает путь, не теряя обязательные поля, '
        'и обосновать решение цифрами из приложенной воронки.',
    ),
]

DEMO_PASSWORD = 'Alfa-Dev-2026'
TAKER_PREFIX = 'demo-taker-'

# Навыки демо-кандидатов: из них собирается «портрет участников» в кабинете
SKILL_SETS = [
    ['Python', 'SQL', 'Django'],
    ['JavaScript', 'React', 'TypeScript'],
    ['Python', 'SQL', 'Pandas'],
    ['Go', 'Docker', 'PostgreSQL'],
    ['Python', 'Docker', 'Linux'],
    ['SQL', 'Excel', 'Tableau'],
    ['Java', 'Spring', 'SQL'],
    ['C++', 'Алгоритмы', 'Linux'],
]

# (название, уровень, категория, завершённых прохождений, вопросы)
TESTS = [
    ('Основы HTTP и REST', 'junior', 'backend', 48, [
        ('quiz', 'Какой код ответа вернуть, если ресурс не найден?',
         [('404 Not Found', True), ('204 No Content', False), ('400 Bad Request', False), ('500', False)]),
        ('quiz', 'Какие методы считаются идемпотентными?',
         [('GET', True), ('PUT', True), ('DELETE', True), ('POST', False)]),
        ('input', 'Каким заголовком клиент сообщает желаемый формат ответа?',
         [('Accept', True)]),
    ]),
    ('SQL: выборки и соединения', 'middle', 'analytics', 23, [
        ('quiz', 'Что вернёт LEFT JOIN, если справа нет совпадений?',
         [('Строку левой таблицы с NULL справа', True), ('Ничего', False),
          ('Ошибку', False), ('Строку правой таблицы', False)]),
        ('input', 'Какое ключевое слово убирает дубликаты в выборке?',
         [('DISTINCT', True)]),
        ('quiz', 'Чем HAVING отличается от WHERE?',
         [('Фильтрует уже сгруппированные строки', True),
          ('Работает быстрее', False), ('Ничем', False), ('Применим только к JOIN', False)]),
    ]),
    ('Python: коллекции и сложность', 'middle', 'backend', 7, [
        ('quiz', 'Какая сложность у проверки вхождения в set?',
         [('O(1) в среднем', True), ('O(n)', False), ('O(log n)', False), ('O(n log n)', False)]),
        ('input', 'Как называется структура из collections для очереди с двух концов?',
         [('deque', True), ('collections.deque', True)]),
    ]),
]


class Command(BaseCommand):
    help = 'Создаёт демонстрационные конкурсы и тесты для компании (для локальной работы).'

    def add_arguments(self, parser):
        parser.add_argument('--company', default=DEFAULT_COMPANY,
                            help=f'Логин компании (по умолчанию {DEFAULT_COMPANY})')
        parser.add_argument('--clear', action='store_true',
                            help='Удалить конкурсы и тесты, созданные этой командой')

    def handle(self, *args, **options):
        username = options['company']
        company = Company.objects.filter(username=username).first()
        if company is None:
            raise CommandError(f'Компания «{username}» не найдена. Список: manage.py shell')

        if options['clear']:
            return self._clear(username)

        now = timezone.now()
        contests = tests = 0

        with transaction.atomic():
            for title, category, level, days, prize, sub_type, hint, excerpt, case in CONTESTS:
                if Contest.objects.filter(company_username=username, title=title).exists():
                    continue
                # Дедлайн в прошлом означает завершённый конкурс: активный конкурс
                # с истёкшим сроком — состояние, которого в бою быть не должно
                finished = days < 0
                contest = Contest.objects.create(
                    company_username=username,
                    title=title,
                    excerpt=excerpt,
                    case_text=f'{case}\n\n{MARK}',
                    rules=RULES[:3] if finished else RULES,
                    category=category,
                    level=level,
                    deadline=now + timedelta(days=days),
                    prize=prize,
                    submission_type=sub_type,
                    submission_hint=hint,
                    status=Contest.STATUS_FINISHED if finished else Contest.STATUS_ACTIVE,
                    # У завершённого конкурса участники тоже были — просто приём закрыт
                    participants_count=(abs(days) % 7) + 2,
                )
                self._make_submissions(contest, finished)
                contests += 1

            for title, level, category, submissions, questions in TESTS:
                if Test.objects.filter(owner_username=username, title=title).exists():
                    continue
                test = Test.objects.create(
                    owner_username=username,
                    title=title,
                    description=f'Демонстрационный тест компании. {MARK}',
                    status=Test.STATUS_PUBLISHED,
                    stats={'level': level, 'category': category},
                )
                self._make_attempts(test, submissions, len(questions))
                for order, (page_type, question, answers) in enumerate(questions):
                    page = TestPage.objects.create(
                        test=test, order=order,
                        type=TestPage.TYPE_QUIZ if page_type == 'quiz' else TestPage.TYPE_INPUT,
                        title=question,
                    )
                    for answer_order, (text, is_correct) in enumerate(answers):
                        TestAnswer.objects.create(page=page, text=text,
                                                  is_correct=is_correct, order=answer_order)
                tests += 1

        self.stdout.write(self.style.SUCCESS(
            f'Компания «{company.name}»: создано конкурсов {contests}, тестов {tests}.'))
        self.stdout.write(f'Профиль: /{username}/   Удалить: manage.py seed_contests --company {username} --clear')

    def _make_attempts(self, test, finished, max_score):
        """Прохождения теста: завершённые с разбросом баллов плюс брошенные.

        Раньше число прохождений было просто числом в Test.stats. Теперь это
        настоящие записи — иначе новая статистика (средний балл, доля
        справившихся, брошенные попытки) считалась бы по пустой таблице.
        """
        if not finished or not max_score:
            return

        takers = self._ensure_takers()
        now = timezone.now()
        rng = random.Random(test.id)  # один и тот же тест — одни и те же числа

        def add(index, started, finished_at, score):
            attempt = TestAttempt.objects.create(
                test=test,
                candidate_username=takers[index % len(takers)],
                finished_at=finished_at,
                score=score,
                max_score=max_score,
            )
            # started_at объявлено как auto_now_add, поэтому в create() не задаётся:
            # разносим попытки по времени отдельным обновлением
            TestAttempt.objects.filter(pk=attempt.pk).update(started_at=started)

        for i in range(finished):
            started = now - timedelta(days=rng.randint(0, 60), minutes=rng.randint(0, 600))
            add(i, started, started + timedelta(minutes=rng.randint(3, 25)), rng.randint(0, max_score))

        # Примерно каждый пятый открывает тест и не доходит до конца
        for i in range(max(1, finished // 5)):
            add(finished + i, now - timedelta(days=rng.randint(1, 45)), None, 0)

    def _ensure_takers(self):
        """Кандидаты, от чьего имени записаны прохождения и решения.

        У каждого свой профиль с навыками — без него «портрет участников»
        в кабинете компании остаётся пустым.
        """
        takers = []
        for i, skills in enumerate(SKILL_SETS):
            username = f'{TAKER_PREFIX}{i}'
            if not Account.objects.filter(username=username).exists():
                Account.objects.create_user(username, name=f'Кандидат {i + 1}',
                                            password=DEMO_PASSWORD, role=ROLE_USER)
            UserProfile.objects.get_or_create(
                username=username,
                defaults={'bio': 'Демонстрационный профиль участника.', 'skills': skills},
            )
            takers.append(username)
        return takers

    def _make_submissions(self, contest, finished):
        """Решения на конкурс: часть проверена, часть ждёт, у завершённого — победитель."""
        takers = self._ensure_takers()
        rng = random.Random(contest.id)
        # До отправки решения доходят не все зарегистрировавшиеся — иначе
        # воронка «зарегистрировался → прислал» всегда показывала бы 100%
        reached = round(contest.participants_count * rng.uniform(0.45, 0.8))
        count = min(max(reached, 1), len(takers))
        if not count:
            return

        for i in range(count):
            # Завершённый конкурс уже разобран, активный — частично
            if finished:
                status = ContestSubmission.STATUS_ACCEPTED if i == 0 else ContestSubmission.STATUS_REJECTED
            else:
                status = rng.choice([ContestSubmission.STATUS_PENDING,
                                     ContestSubmission.STATUS_PENDING,
                                     ContestSubmission.STATUS_ACCEPTED])
            submission = ContestSubmission.objects.create(
                contest=contest,
                candidate_username=takers[i],
                candidate_name=f'Кандидат {i + 1}',
                text='Демонстрационное решение.',
                status=status,
                winner=finished and i == 0,
            )
            # Решения кучнее к дедлайну — так это и выглядит в жизни,
            # и график подачи по дням показывает разгон, а не пустое поле
            days_before = int(rng.triangular(0, 12, 1))
            sent = contest.deadline - timedelta(days=days_before, hours=rng.randint(0, 23))
            ContestSubmission.objects.filter(pk=submission.pk).update(created_at=sent)

    def _clear(self, username):
        contests = Contest.objects.filter(company_username=username, case_text__contains=MARK).delete()[0]
        # Прохождения уходят каскадом вместе с тестами
        tests = Test.objects.filter(owner_username=username, description__contains=MARK).delete()[0]
        takers = 0
        if not Test.objects.filter(description__contains=MARK).exists():
            UserProfile.objects.filter(username__startswith=TAKER_PREFIX).delete()
            takers = Account.objects.filter(username__startswith=TAKER_PREFIX).delete()[0]
        self.stdout.write(self.style.SUCCESS(
            f'Удалено записей: конкурсов {contests}, тестов {tests} '
            f'(со страницами и прохождениями), демо-кандидатов {takers}.'))
