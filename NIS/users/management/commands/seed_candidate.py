"""Демонстрационное наполнение кабинета кандидата.

Команды seed_articles и seed_contests наполняют каталоги и кабинет компании,
но кабинет кандидата оставался пустым: проверить свои тесты, статьи и участия
в конкурсах было не на чем. Здесь всё три раздела сразу, для конкретного логина.

Набор нарочно неровный: опубликованное и черновики, тест с полусотней
прохождений и тест с четырьмя, принятое решение, отклонённое и ждущее
проверки — чтобы каждое состояние было видно на экране.

    manage.py seed_candidate                 # для пользователя egor
    manage.py seed_candidate --user kandidat
    manage.py seed_candidate --clear         # удалить созданное этой командой
"""
import random
import re
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from articles.constructor.models import Article
from articles.sanitize import clean_article_html
from authorization.models import Account, ROLE_USER
from companies.models import Company, CompanyRating
from contests.contests_cabinet.models import Contest, ContestSubmission
from core.demo import MARK, build_pages, make_attempts
from tests.constructor.models import Test, TestAttempt
from users.models import UserProfile

DEFAULT_USER = 'egor'

SKILLS = ['Python', 'Django', 'SQL', 'PostgreSQL', 'Docker', 'Git']
BIO = ('Учусь на разработчика, собираю тесты и пишу про подготовку '
       'к техническим собеседованиям.')

# (название, уровень, категория, опубликован, завершённых прохождений, вопросы)
TESTS = [
    ('Алгоритмы: сложность и структуры данных', 'middle', 'backend', True, 34, [
        ('quiz', 'Какая сложность у поиска в сбалансированном бинарном дереве?',
         [('O(log n)', True), ('O(1)', False), ('O(n)', False), ('O(n log n)', False)]),
        ('quiz', 'Что быстрее для проверки вхождения элемента?',
         [('Множество', True), ('Список', False), ('Кортеж', False), ('Строка', False)]),
        ('input', 'Как называется обход графа в ширину тремя буквами?',
         [('BFS', True), ('bfs', True)]),
        ('quiz', 'Какая структура нужна для отмены последнего действия?',
         [('Стек', True), ('Очередь', False), ('Куча', False), ('Дерево', False)]),
    ]),
    ('JavaScript: промисы и event loop', 'junior', 'frontend', True, 16, [
        ('quiz', 'Что выполнится раньше — setTimeout(…, 0) или промис?',
         [('Промис: микрозадачи идут первыми', True), ('setTimeout', False),
          ('Одновременно', False), ('Зависит от браузера', False)]),
        ('input', 'Каким ключевым словом помечают функцию, чтобы использовать await?',
         [('async', True)]),
        ('quiz', 'Что вернёт Promise.all, если один промис отклонён?',
         [('Отклонится с первой ошибкой', True), ('Массив с undefined', False),
          ('Дождётся остальных', False), ('Бросит исключение синхронно', False)]),
    ]),
    ('Git: ветки, ребейз и конфликты', 'junior', 'other', True, 4, [
        ('quiz', 'Чем rebase отличается от merge?',
         [('Переписывает историю, накладывая коммиты заново', True),
          ('Ничем', False), ('Работает только с тегами', False),
          ('Удаляет ветку', False)]),
        ('input', 'Какой командой посмотреть историю одной строкой на коммит?',
         [('git log --oneline', True)]),
    ]),
    # Черновик: в кабинете должно быть видно оба состояния, и у черновика
    # не должно быть ни статистики, ни публичной страницы
    ('Django ORM: N+1 и оптимизация запросов', 'middle', 'backend', False, 0, [
        ('quiz', 'Что чинит select_related?',
         [('Лишние запросы по ForeignKey', True), ('Дубли строк', False),
          ('Медленные миграции', False), ('Ничего', False)]),
    ]),
]

BODY_LONG = (
    '<h2>Зачем вообще собирать свои тесты</h2>'
    '<p>Когда готовишься к собеседованию, кажется, что достаточно прочитать '
    'конспект. На деле знание проверяется только попыткой объяснить материал '
    'кому-то ещё — или вопросом, на который нужно ответить без подсказок.</p>'
    '<h3>Как я составляю вопросы</h3>'
    '<ul><li>Беру задачу, на которой сам споткнулся</li>'
    '<li>Формулирую так, чтобы ответ нельзя было угадать</li>'
    '<li>Проверяю на друге: если он спорит с формулировкой — вопрос плохой</li></ul>'
    '<blockquote>Хороший вопрос проверяет понимание, а не память на термины.</blockquote>'
    '<p>За месяц набралось три теста, и по статистике прохождений видно, '
    'где формулировки всё ещё мутные: если больше половины отвечает неверно, '
    'дело обычно не в сложности, а в вопросе.</p>'
    '<h3>Что показала статистика</h3>'
    '<p>Первый тест прошли тридцать четыре человека, средний результат — '
    'чуть больше половины. Я ожидал, что провалятся на сложности алгоритмов, '
    'а сыпались на вопросе про структуру для отмены действия: формулировка '
    'допускала два прочтения, и половина отвечала «очередь», потому что '
    'думала про порядок событий, а не про последнее действие.</p>'
    '<p>Второй вывод неприятнее: каждый пятый открывает тест и не доходит '
    'до конца. Сначала я решил, что дело в длине, но брошенные попытки '
    'обрываются в среднем на втором вопросе — значит, отваливаются не от '
    'усталости, а сразу, как только видят формат. Буду сокращать вступление '
    'и выносить примеры вперёд.</p>'
    '<h3>Три формата вопросов и что с ними не так</h3>'
    '<p>Вопрос с одним верным вариантом проще всего составить и проще всего '
    'угадать. Если три варианта из четырёх звучат нелепо, человек выберет '
    'оставшийся, ничего не зная о теме. Поэтому неверные варианты я теперь '
    'беру из реальных ошибок: не выдумываю чушь, а вспоминаю, что отвечал '
    'сам, когда путался.</p>'
    '<p>Вопрос с несколькими верными ответами честнее, но требует '
    'аккуратной формулировки. «Какие методы идемпотентны» — нормально. '
    '«Что из перечисленного правильно» — плохо: непонятно, правильно с какой '
    'точки зрения и сколько вариантов ожидается.</p>'
    '<p>Вопрос со свободным вводом строже всех, и именно на нём видно '
    'разницу между «знаю» и «узнаю из списка». Но он же самый капризный: '
    'ответ «BFS» и «bfs» — это один ответ, а «поиск в ширину» — уже другой, '
    'и его надо предусмотреть заранее, иначе человек получит ноль за верный '
    'по сути ответ.</p>'
    '<h3>Что дальше</h3>'
    '<p>План такой: переписать три вопроса с самой низкой долей верных '
    'ответов, добавить по короткому пояснению после каждого и посмотреть, '
    'сдвинется ли средний балл. Если сдвинется — значит, проблема была '
    'в вопросах, а не в тех, кто отвечает. Если нет — тема действительно '
    'сложная, и тогда к тесту нужен разбор, а не новая формулировка.</p>'
    '<p>Отдельно хочу посмотреть, как меняется результат от порядка '
    'вопросов. Подозреваю, что если поставить самый сложный первым, '
    'брошенных попыток станет заметно больше — но это уже тема для '
    'следующего разбора.</p>'
)

BODY_SQL = (
    '<h2>Откуда этот список</h2>'
    '<p>За полгода я отсмотрел около сотни учебных решений с SQL и собрал '
    'ошибки, которые повторяются чаще всего. Ни одна из них не про экзотику: '
    'всё это пишут люди, которые язык в целом знают.</p>'
    '<h3>1. SELECT * в продакшен-запросе</h3>'
    '<p>Удобно, пока таблица маленькая. Потом в неё добавляют текстовое поле '
    'на пару килобайт, и запрос, которому нужны были два числа, начинает '
    'тащить по сети всё подряд. Хуже другое: запрос перестаёт быть '
    'самодокументируемым — по коду больше не видно, какие столбцы реально '
    'используются, и любой рефакторинг таблицы становится рискованным.</p>'
    '<h3>2. Фильтрация после группировки вместо WHERE</h3>'
    '<p>HAVING нужен для условий на агрегаты. Если условие относится '
    'к отдельной строке, ему место в WHERE — тогда база отбросит лишнее '
    '<em>до</em> группировки, а не после. Разница на большой таблице '
    'измеряется не процентами, а порядками.</p>'
    '<h3>3. Подзапрос там, где хватило бы соединения</h3>'
    '<p>Коррелированный подзапрос в SELECT выполняется для каждой строки '
    'результата. На десяти строках это незаметно, на десяти тысячах — это '
    'десять тысяч запросов. Обычно такой подзапрос разворачивается в '
    'обычный LEFT JOIN с группировкой, и план запроса становится плоским.</p>'
    '<h3>4. COUNT без DISTINCT после нескольких соединений</h3>'
    '<p>Моя любимая ошибка, потому что она не падает, а тихо врёт. Два '
    'соединения к разным таблицам перемножают строки: три страницы теста '
    'и два прохождения дают шесть строк, и COUNT честно возвращает шесть '
    'вместо трёх. Число выглядит правдоподобно, поэтому такое доезжает '
    'до продакшена и живёт там месяцами.</p>'
    '<h3>5. Отсутствие ORDER BY при выборке «первых N»</h3>'
    '<p>Без явной сортировки порядок строк не определён. Запрос может '
    'годами возвращать их «как надо», а потом база сменит план — и LIMIT 10 '
    'начнёт отдавать другие десять. Если важен порядок, его нужно написать, '
    'и желательно с однозначным тай-брейком по уникальному полю.</p>'
    '<blockquote>Почти все эти ошибки видны не в результате, а в плане '
    'запроса. EXPLAIN стоит открывать не когда «тормозит», а когда '
    'пишешь.</blockquote>'
    '<p>Последнее замечание: ни один из пунктов не значит «никогда так не '
    'делай». SELECT * в разовом запросе к небольшой таблице — нормально. '
    'Плохо, когда так написан код, который выполняется тысячу раз в минуту '
    'и который никто больше не перечитывает.</p>'
)

BODY_SHORT = (
    '<h2>Коротко</h2>'
    '<p>Собрал наблюдения за первые месяцы подготовки. Ничего нового, '
    'но мне самому помогло собрать это в одном месте.</p>'
    '<ul><li>Решать задачи вслух</li>'
    '<li>Разбирать не только свои ошибки</li>'
    '<li>Возвращаться к теме через неделю, а не на следующий день</li></ul>'
    '<p>Дальше — подробнее по каждому пункту.</p>'
)

# (заголовок, описание, теги, дней назад, просмотры, рейтинг, опубликована, тело)
ARTICLES = [
    ('Как я собрал свой первый тест и что о нём сказала статистика',
     'Три теста, сто прохождений и выводы о том, какие вопросы работают, '
     'а какие только путают.',
     ['Практика', 'Обучение'], 3, 412, 27, True, BODY_LONG),
    ('Пять ошибок в SQL-запросах, которые видно на код-ревью',
     'Джойны вместо подзапросов, SELECT * и фильтрация после группировки — '
     'разбираем на примерах.',
     ['SQL', 'Backend'], 11, 738, 51, True, BODY_SQL),
    ('Что спрашивают у джуна на собеседовании в 2026 году',
     'Собрал вопросы с девяти собеседований и разложил по темам.',
     ['Карьера', 'Собеседования'], 26, 265, 14, True, BODY_SHORT),
    ('Черновик: заметки про асинхронность в Python',
     '', ['Python'], 0, 0, 0, False, BODY_SHORT),
]

# (название конкурса компании, статус решения, победитель, комментарий)
PARTICIPATIONS = [
    ('Сервис коротких ссылок', ContestSubmission.STATUS_ACCEPTED, False,
     'Сделал на FastAPI, хранилище — Redis с TTL. В README объяснил выбор.'),
    ('Разбор инцидента в проде', ContestSubmission.STATUS_PENDING, False,
     'Постмортем на две страницы: хронология, корневая причина и три меры.'),
    ('Редизайн формы отклика', ContestSubmission.STATUS_ACCEPTED, True,
     'Свёл четыре экрана в один с прогрессом. Обосновал цифрами из воронки.'),
    ('Дашборд продаж за квартал', ContestSubmission.STATUS_REJECTED, False,
     'Собрал дашборд, но не успел разобрать падение выручки в четвёртом квартале.'),
]

# Глубина, на которую разносим прохождения чужих тестов: полгода — ровно
# окно тепловой карты в кабинете
ATTEMPTS_DAYS = 182
# Вероятность позаниматься назавтра после занятия и после паузы. Разница
# между ними и даёт на карте полосы вместо равномерной ряби.
ACTIVE_AFTER_ACTIVE = 0.55
ACTIVE_AFTER_PAUSE = 0.22
# Доля брошенных попыток
ABANDON_SHARE = 0.17
# Проходим только тесты, где результат в процентах о чём-то говорит
MIN_TEST_PAGES = 2
# Сколько последних дней подряд заполняем, чтобы в кабинете была живая серия
STREAK_TAIL = 4

# Оценки компаниям: без них раздел «Оценки, которые вы поставили» пуст
RATINGS = [5, 4, 5, 3, 4]


def _read_time(html):
    """Время чтения по той же формуле, что считает редактор статей: 200 слов в минуту.

    Считать иначе нельзя: на карточке в каталоге стоит именно это число,
    и расхождение с редактором сразу видно при открытии статьи на правку.
    """
    words = len(re.sub(r'<[^>]+>', ' ', html).split())
    return max(1, round(words / 200))


class Command(BaseCommand):
    help = 'Наполняет кабинет кандидата тестами, статьями и участиями в конкурсах.'

    def add_arguments(self, parser):
        parser.add_argument('--user', default=DEFAULT_USER,
                            help=f'Логин кандидата (по умолчанию {DEFAULT_USER})')
        parser.add_argument('--clear', action='store_true',
                            help='Удалить записи, созданные этой командой')

    def handle(self, *args, **options):
        username = options['user']
        account = Account.objects.filter(username=username).first()
        if account is None:
            raise CommandError(f'Пользователь «{username}» не найден.')
        if account.role != ROLE_USER:
            raise CommandError(f'«{username}» — не кандидат (роль {account.role}).')

        if options['clear']:
            return self._clear(username)

        with transaction.atomic():
            self._fill_profile(account)
            tests = self._make_tests(username)
            articles = self._make_articles(username)
            entries = self._make_participations(account)
            attempts = self._take_tests(username)
            ratings = self._rate_companies(username)

        self.stdout.write(self.style.SUCCESS(
            f'«{account.name or username}»: тестов {tests}, статей {articles}, '
            f'участий {entries}, прохождений {attempts}, оценок компаниям {ratings}.'))
        self.stdout.write(f'Кабинет: /cabinet/user/   Профиль: /{username}/')
        self.stdout.write(f'Удалить: manage.py seed_candidate --user {username} --clear')

    def _fill_profile(self, account):
        """Пустой профиль портит и публичную страницу, и портрет участников."""
        profile, _ = UserProfile.objects.get_or_create(username=account.username)
        if not profile.skills:
            profile.skills = SKILLS
        if not profile.bio:
            profile.bio = BIO
        profile.save()

    def _make_tests(self, username):
        created = 0
        for title, level, category, published, finished, questions in TESTS:
            if Test.objects.filter(owner_username=username, title=title).exists():
                continue
            test = Test.objects.create(
                owner_username=username,
                title=title,
                description=f'Тест собран для тренировки. {MARK}',
                status=Test.STATUS_PUBLISHED if published else Test.STATUS_DRAFT,
                stats={'level': level, 'category': category},
            )
            build_pages(test, questions)
            make_attempts(test, finished, len(questions))
            created += 1
        return created

    def _make_articles(self, username):
        created = 0
        now = timezone.now()
        for title, excerpt, tags, days_ago, views, likes, published, body in ARTICLES:
            if Article.objects.filter(author_username=username, title=title).exists():
                continue
            # Метка живёт в HTML-комментарии: на странице её не видно,
            # а --clear по ней находит свои записи
            content = clean_article_html(body) + f'<!-- {MARK} -->'
            article = Article.objects.create(
                author_username=username,
                title=title,
                excerpt=excerpt,
                content=content,
                tags=tags,
                status=Article.STATUS_PUBLISHED if published else Article.STATUS_DRAFT,
                cover_index=created % 6,
                read_time=_read_time(body),
                views=views,
                likes=likes,
            )
            # created_at и published_at проставляются автоматически — правим запросом
            written = now - timedelta(days=days_ago)
            Article.objects.filter(id=article.id).update(
                created_at=written,
                published_at=written if published else None,
            )
            created += 1
        return created

    def _make_participations(self, account):
        created = 0
        for title, status, winner, comment in PARTICIPATIONS:
            contest = Contest.objects.filter(title=title).order_by('-created_at').first()
            if contest is None:
                self.stdout.write(self.style.WARNING(
                    f'Конкурс «{title}» не найден — сначала manage.py seed_contests'))
                continue
            if ContestSubmission.objects.filter(
                    contest=contest, candidate_username=account.username).exists():
                continue

            submission = ContestSubmission.objects.create(
                contest=contest,
                candidate_username=account.username,
                candidate_name=account.name or account.username,
                # Формат решения задаёт конкурс: ссылку в файловый конкурс
                # прикрепить нельзя, и карточка решения показала бы пустоту
                link=('https://github.com/example/short-links'
                      if contest.submission_type == Contest.SUB_LINK else ''),
                text=f'{comment} {MARK}',
                status=status,
                winner=winner,
                liked=winner,
            )
            # Решение прислано до дедлайна, а не «только что»
            sent = (contest.deadline or timezone.now()) - timedelta(days=2, hours=3)
            ContestSubmission.objects.filter(pk=submission.pk).update(created_at=sent)
            # Иначе в воронке конкурса решений окажется больше, чем участников
            Contest.objects.filter(pk=contest.pk).update(
                participants_count=contest.participants_count + 1)
            created += 1
        return created

    def _take_tests(self, username):
        """Прохождения чужих тестов — то, ради чего кандидат сюда и приходит.

        Метку кладём в session_key: у вошедшего пользователя он всегда пуст
        (см. attempts._identity), поэтому --clear не заденет настоящие попытки,
        а start() не переиспользует эти записи как незакрытые.
        """
        if TestAttempt.objects.filter(candidate_username=username, session_key=MARK).exists():
            return 0

        # Тест из одного вопроса даёт только 0% или 100%, а таких в базе
        # полно от ручных проб — по ним ни средний балл, ни гистограмма
        # ничего не покажут
        tests = list(
            Test.objects
            .filter(status=Test.STATUS_PUBLISHED)
            .exclude(owner_username=username)
            .annotate(pages_total=Count('pages'))
            .filter(pages_total__gte=MIN_TEST_PAGES)
            .order_by('id')
        )
        if not tests:
            self.stdout.write(self.style.WARNING(
                f'Нет чужих опубликованных тестов от {MIN_TEST_PAGES} вопросов — '
                'сначала manage.py seed_contests'))
            return 0

        rng = random.Random(f'attempts:{username}')
        now = timezone.now()
        local_now = timezone.localtime(now)
        created = 0
        was_active = False

        # Идём по дням, а не по попыткам: карта активности рисует день, и ей
        # нужны и пустые недели, и дни с несколькими событиями — иначе все
        # клетки выходят одной насыщенности, а серии не складываются.
        for days_ago in range(ATTEMPTS_DAYS - 1, -1, -1):
            # Последние дни закрываем подряд, иначе текущая серия всегда нулевая
            if days_ago < STREAK_TAIL:
                per_day = rng.randint(1, 3)
            else:
                # Занятия идут полосами: назавтра после занятия сесть проще,
                # чем начать с нуля. Отсюда и живые серии на карте.
                chance = ACTIVE_AFTER_ACTIVE if was_active else ACTIVE_AFTER_PAUSE
                if rng.random() > chance:
                    was_active = False
                    continue
                per_day = rng.choices([1, 2, 3, 5], weights=[50, 26, 15, 9])[0]
            was_active = True

            # Результат растёт со временем — иначе средний балл ни о чём
            # не говорит, а в списке последних попыток не видно прогресса
            progress = 1 - days_ago / ATTEMPTS_DAYS

            # Время внутри суток отсчитываем от полуночи, а не вычитаем часы
            # из «сейчас»: иначе попытка с большим сдвигом уезжала во вчера,
            # и день, который мы только что назначили активным, оставался пуст
            day_start = (local_now - timedelta(days=days_ago)).replace(
                hour=0, minute=0, second=0, microsecond=0)
            latest = int(min(now - day_start, timedelta(hours=23)).total_seconds() // 60)

            for number in range(per_day):
                test = rng.choice(tests)
                max_score = test.pages_total
                started = day_start + timedelta(minutes=rng.randint(0, max(latest - 40, 1)))
                # Часть попыток брошена: без них доля завершённых была бы 100%,
                # и метрика ничего бы не значила. Но на днях серии первая
                # попытка всегда доводится до конца: карта активности считает
                # завершённые прохождения, и день из одних брошенных попыток
                # остался бы на ней пустым, разорвав серию.
                guaranteed = days_ago < STREAK_TAIL and number == 0
                abandoned = not guaranteed and rng.random() < ABANDON_SHARE
                share = min(max(rng.gauss(0.35 + progress * 0.45, 0.18), 0), 1)

                attempt = TestAttempt.objects.create(
                    test=test,
                    candidate_username=username,
                    session_key=MARK,
                    finished_at=None if abandoned else started + timedelta(minutes=rng.randint(4, 30)),
                    score=0 if abandoned else round(max_score * share),
                    max_score=0 if abandoned else max_score,
                )
                # started_at объявлено как auto_now_add — задаём отдельным запросом
                TestAttempt.objects.filter(pk=attempt.pk).update(started_at=started)
                created += 1
        return created

    def _rate_companies(self, username):
        """Оценки компаниям: раздел «Оценки, которые вы поставили» иначе пуст."""
        companies = list(
            Company.objects
            .filter(verification_status=Company.VERIF_APPROVED)
            .exclude(username=username)
            .order_by('id')[:len(RATINGS)]
        )
        created = 0
        for company, rating in zip(companies, RATINGS):
            _, is_new = CompanyRating.objects.get_or_create(
                company=company, user_username=username, defaults={'rating': rating})
            created += int(is_new)
        return created

    def _clear(self, username):
        tests = Test.objects.filter(owner_username=username,
                                    description__contains=MARK).delete()[0]
        articles = Article.objects.filter(author_username=username,
                                          content__contains=MARK).delete()[0]
        entries = ContestSubmission.objects.filter(candidate_username=username,
                                                   text__contains=MARK).delete()[0]
        # Настоящие попытки пользователя идут с пустым session_key — их не трогаем
        attempts = TestAttempt.objects.filter(candidate_username=username,
                                              session_key=MARK).delete()[0]
        self.stdout.write(self.style.SUCCESS(
            f'Удалено: тестов {tests} (со страницами и прохождениями), '
            f'статей {articles}, участий {entries}, прохождений {attempts}. '
            f'Оценки компаниям оставлены.'))
