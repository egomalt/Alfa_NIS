"""Демонстрационные статьи для локального просмотра каталога.

Как и у компаний, набор нарочно неровный: длинные и короткие описания, статьи
без тегов, разный возраст и разное число просмотров — чтобы сразу было видно,
как ведут себя обрезка текста, сортировка и блок «Популярное».

    manage.py seed_articles            # создать
    manage.py seed_articles --clear    # удалить созданные этой командой
"""
import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from articles.constructor.models import Article, ArticleVote
from articles.sanitize import clean_article_html
from authorization.models import Account, ROLE_USER
from users.models import UserProfile

DEMO_PASSWORD = 'Alfa-Dev-2026'
AUTHOR_PREFIX = 'demo-author-'

AUTHORS = [
    ('demo-author-1', 'Ирина Соколова', 'Фронтенд-разработчик, пишу про интерфейсы'),
    ('demo-author-2', 'Павел Родин', 'Бэкенд и распределённые системы'),
    ('demo-author-3', 'Марина Ким', 'Аналитик данных'),
    ('demo-author-4', 'Артём Волков', ''),
]

BODY = (
    '<h2>С чего всё началось</h2>'
    '<p>Первое техническое собеседование я провалил на второй минуте — не смог '
    'объяснить, чем <code>let</code> отличается от <code>var</code>. Тогда мне '
    'казалось, что это провал, а на деле это была лучшая обратная связь за год.</p>'
    '<h3>Что помогло подготовиться</h3>'
    '<ul><li>Разбирать чужой код вслух, объясняя каждое решение</li>'
    '<li>Решать задачи с таймером — на собеседовании времени всегда меньше</li>'
    '<li>Записывать вопросы, на которых сбился, и возвращаться к ним через неделю</li></ul>'
    '<blockquote>Главный навык на собеседовании — не знать всё, а честно '
    'говорить, чего не знаешь, и рассуждать вслух.</blockquote>'
    '<p>Через три месяца я прошёл в компанию мечты. Ниже — конспект того, что '
    'реально пригодилось, и список тем, которые спрашивают чаще всего.</p>'
)

ARTICLES = [
    # (заголовок, краткое описание, теги, дней назад, просмотры, голоса +/-)
    ('Как я готовился к собеседованию в крупную IT-компанию три месяца',
     'Подробный конспект: какие темы спрашивают, как отвечать на вопросы про алгоритмы '
     'и что делать, если растерялся прямо во время интервью.',
     ['Карьера', 'Собеседования'], 2, 1840, (12, 1)),
    ('Пять ошибок в резюме, из-за которых вас не позовут',
     'Разбираем реальные резюме джунов и объясняем, что рекрутер видит в первые семь секунд.',
     ['Карьера', 'Резюме'], 5, 1210, (9, 0)),
    ('Алгоритмы без паники: что действительно спрашивают',
     'Списки, хеш-таблицы, два указателя. Минимум теории — максимум разборов.',
     ['Алгоритмы', 'Собеседования'], 9, 2670, (21, 3)),
    ('Первый год в бэкенде: чему меня научили инциденты на проде',
     'Про мониторинг, откаты и то, почему «у меня локально работает» — не аргумент.',
     ['Backend', 'Опыт'], 14, 930, (7, 1)),
    ('Как читать чужой код и не сойти с ума',
     'Практика: заходим в незнакомый репозиторий и за час понимаем, как он устроен.',
     ['Практика'], 18, 1450, (15, 0)),
    ('Зачем джуну писать тесты, если никто не просит',
     '', ['Тестирование', 'Практика'], 23, 610, (5, 2)),
    ('SQL, который спрашивают на аналитических собеседованиях',
     'Оконные функции, джойны и три задачи, которые встречаются чаще всего.',
     ['Аналитика', 'SQL'], 30, 1980, (18, 1)),
    ('Стажировка или пет-проект: что весомее для первого оффера',
     'Сравниваем на примерах: что спрашивают про стажировку, а что — про свой проект.',
     ['Карьера'], 38, 780, (6, 0)),
    ('Как объяснять свои решения на доске и не сбиваться',
     'Простая схема рассуждения вслух, которая работает даже когда не знаешь ответа.',
     ['Собеседования'], 45, 1130, (11, 1)),
    ('Git без страха: что нужно знать к первому месту работы',
     'Ветки, ребейз, конфликты. Разбираем на реальных ситуациях из командной работы.',
     ['Практика', 'Git'], 52, 2240, (19, 2)),
    ('Статья без тегов и почти без описания', '', [], 60, 320, (2, 0)),
    ('Что почитать junior-разработчику за первый месяц',
     'Короткий список книг и статей, которые действительно меняют картину мира.',
     ['Обучение'], 75, 1670, (14, 0)),
]


class Command(BaseCommand):
    help = 'Создаёт демонстрационные статьи для просмотра каталога (только для локальной работы).'

    def add_arguments(self, parser):
        parser.add_argument('--clear', action='store_true',
                            help='Удалить статьи и авторов, созданных этой командой')

    def handle(self, *args, **options):
        if options['clear']:
            return self._clear()

        authors = self._ensure_authors()
        body = clean_article_html(BODY)
        now = timezone.now()

        created = 0
        for i, (title, excerpt, tags, days_ago, views, votes) in enumerate(ARTICLES):
            author = authors[i % len(authors)]
            if Article.objects.filter(title=title, author_username=author).exists():
                continue

            published = now - timedelta(days=days_ago)
            with transaction.atomic():
                article = Article.objects.create(
                    author_username=author,
                    title=title,
                    excerpt=excerpt,
                    content=body,
                    tags=tags,
                    status=Article.STATUS_PUBLISHED,
                    cover_index=i % 6,
                    read_time=random.randint(3, 12),
                    views=views,
                )
                # published_at и created_at заполняются автоматически — правим запросом
                Article.objects.filter(id=article.id).update(published_at=published, created_at=published)
                self._add_votes(article, *votes)
            created += 1

        # Пара черновиков, чтобы в кабинете автора было видно оба состояния
        drafts = 0
        for title in ('Черновик: подборка задач по динамическому программированию',
                      'Черновик: как проходить системный дизайн'):
            if not Article.objects.filter(title=title).exists():
                Article.objects.create(author_username=authors[0], title=title,
                                       excerpt='', content=body, tags=['Черновик'],
                                       status=Article.STATUS_DRAFT, read_time=5)
                drafts += 1

        self.stdout.write(self.style.SUCCESS(
            f'Создано статей: {created} опубликованных, {drafts} черновиков'))
        self.stdout.write(f'Авторы: {", ".join(authors)} (пароль {DEMO_PASSWORD})')
        self.stdout.write('Каталог: /articles/   Удалить: manage.py seed_articles --clear')

    def _ensure_authors(self):
        usernames = []
        for username, name, bio in AUTHORS:
            if not Account.objects.filter(username=username).exists():
                Account.objects.create_user(username, name=name, password=DEMO_PASSWORD, role=ROLE_USER)
                UserProfile.objects.create(username=username, bio=bio,
                                           skills=['Python', 'SQL'] if bio else [])
            usernames.append(username)
        return usernames

    def _add_votes(self, article, up, down):
        """Голоса от отдельных аккаунтов: на статью действует ограничение «один голос от человека»."""
        for i in range(up + down):
            voter = f'{AUTHOR_PREFIX}voter-{i}'
            if not Account.objects.filter(username=voter).exists():
                Account.objects.create_user(voter, name=f'Читатель {i}',
                                            password=DEMO_PASSWORD, role=ROLE_USER)
            ArticleVote.objects.create(article=article, voter_username=voter,
                                       direction=1 if i < up else -1)
        Article.objects.filter(id=article.id).update(likes=up - down)

    def _clear(self):
        titles = [a[0] for a in ARTICLES] + [
            'Черновик: подборка задач по динамическому программированию',
            'Черновик: как проходить системный дизайн',
        ]
        removed = Article.objects.filter(title__in=titles).delete()[0]
        accounts = Account.objects.filter(username__startswith=AUTHOR_PREFIX).delete()[0]
        Account.objects.filter(username__startswith='demo-author-').delete()
        UserProfile.objects.filter(username__startswith='demo-author-').delete()
        self.stdout.write(self.style.SUCCESS(
            f'Удалено: записей статей и голосов {removed}, аккаунтов {accounts}.'))
