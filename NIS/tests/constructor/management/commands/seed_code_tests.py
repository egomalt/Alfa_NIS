"""Демонстрационные тесты с задачами на код.

Задача на код — единственная страница, которую проверяет не сравнение строк,
а запуск решения в контейнере: сервер прогоняет его по тест-кейсам автора
и запоминает вердикт у себя, не доверяя числам от браузера.

Заводит по тесту на каждый поддерживаемый язык, чтобы видно было все три
ветки исполнителя, и один смешанный тест — вопрос, ввод и задача рядом.

    manage.py seed_code_tests                 # тесты заводит компания alfa
    manage.py seed_code_tests --owner egor
    manage.py seed_code_tests --clear

Образы для запуска решений качаются заранее, иначе первый прогон уйдёт
в долгую загрузку:

    docker pull python:3.11-alpine node:20-alpine gcc:12
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from authorization.models import Account
from core.demo import MARK, build_pages, make_attempts
from tests.constructor.executor import LANGUAGES
from tests.constructor.models import Test

DEFAULT_OWNER = 'alfa'

SUM_CASES = [
    {'input': '2 3', 'expected': '5', 'is_sample': True},
    {'input': '10 -4', 'expected': '6', 'is_sample': True},
    {'input': '0 0', 'expected': '0', 'is_sample': False},
    {'input': '-7 -8', 'expected': '-15', 'is_sample': False},
    {'input': '1000000 1000000', 'expected': '2000000', 'is_sample': False},
]

REVERSE_CASES = [
    {'input': 'привет', 'expected': 'тевирп', 'is_sample': True},
    {'input': 'a', 'expected': 'a', 'is_sample': True},
    {'input': 'abcdef', 'expected': 'fedcba', 'is_sample': False},
    {'input': 'шалаш', 'expected': 'шалаш', 'is_sample': False},
]

COUNT_CASES = [
    {'input': '5\n1 2 2 3 2', 'expected': '3', 'is_sample': True},
    {'input': '3\n7 7 7', 'expected': '3', 'is_sample': True},
    {'input': '4\n1 2 3 4', 'expected': '1', 'is_sample': False},
    {'input': '1\n42', 'expected': '1', 'is_sample': False},
]

MAX_CASES = [
    {'input': '4\n3 9 2 7', 'expected': '9', 'is_sample': True},
    {'input': '1\n-5', 'expected': '-5', 'is_sample': True},
    {'input': '5\n-1 -2 -3 -4 -5', 'expected': '-1', 'is_sample': False},
]

# (название, уровень, категория, завершённых прохождений, страницы)
TESTS = [
    ('Python: разбор ввода и вывода', 'junior', 'backend', 12, [
        ('text', 'Как устроен раздел',
         {'content': 'Решение запускается в контейнере и проверяется тест-кейсами. '
                     'Часть из них видна как примеры, остальные скрыты.'}),
        ('code', 'Сумма двух чисел', {
            'language': 'python',
            'time_limit': 5,
            'content': 'В одной строке через пробел заданы два целых числа. '
                       'Выведите их сумму.',
            'test_cases': SUM_CASES,
        }),
        ('code', 'Сколько раз встречается самое частое число', {
            'language': 'python',
            'time_limit': 5,
            'content': 'В первой строке число N, во второй — N целых чисел через пробел. '
                       'Выведите, сколько раз встречается самое частое из них.',
            'test_cases': COUNT_CASES,
        }),
    ]),
    ('JavaScript: работа со строками', 'junior', 'frontend', 7, [
        ('code', 'Перевернуть строку', {
            'language': 'javascript',
            'time_limit': 5,
            'content': 'На вход подаётся одна строка. Выведите её задом наперёд.',
            'test_cases': REVERSE_CASES,
        }),
    ]),
    ('C++: базовые алгоритмы', 'middle', 'backend', 5, [
        ('code', 'Максимум в массиве', {
            'language': 'cpp',
            'time_limit': 5,
            'content': 'В первой строке число N, во второй — N целых чисел. '
                       'Выведите наибольшее из них.',
            'test_cases': MAX_CASES,
        }),
    ]),
    ('Смешанный формат: теория и практика', 'junior', 'backend', 9, [
        ('quiz', 'Какая сложность у поиска максимума в неотсортированном массиве?',
         [('O(n)', True), ('O(log n)', False), ('O(1)', False), ('O(n log n)', False)]),
        ('input', 'Какой структурой данных удобнее всего считать частоты?',
         [('словарь', True), ('словарём', True), ('хеш-таблица', True)]),
        ('code', 'Сумма двух чисел', {
            'language': 'python',
            'time_limit': 5,
            'content': 'В одной строке через пробел заданы два целых числа. '
                       'Выведите их сумму.',
            'test_cases': SUM_CASES,
        }),
    ]),
]


class Command(BaseCommand):
    help = 'Заводит демонстрационные тесты с задачами на код (Python, JavaScript, C++).'

    def add_arguments(self, parser):
        parser.add_argument('--owner', default=DEFAULT_OWNER,
                            help=f'Логин автора тестов (по умолчанию {DEFAULT_OWNER})')
        parser.add_argument('--clear', action='store_true',
                            help='Удалить тесты, созданные этой командой')

    def handle(self, *args, **options):
        owner = options['owner'].strip().lower()
        if not Account.objects.filter(username=owner).exists():
            raise CommandError(f'Аккаунт «{owner}» не найден.')

        if options['clear']:
            removed = Test.objects.filter(owner_username=owner, description__endswith=MARK).delete()[0]
            self.stdout.write(self.style.SUCCESS(f'Удалено записей: {removed}.'))
            return

        with transaction.atomic():
            created = self._make_tests(owner)

        self.stdout.write(self.style.SUCCESS(f'Тестов с задачами на код: {created}.'))
        self.stdout.write('Языки: ' + ', '.join(cfg['label'] for cfg in LANGUAGES.values()))
        self.stdout.write('Образы: docker pull ' + ' '.join(cfg['image'] for cfg in LANGUAGES.values()))
        self.stdout.write('Каталог: /tests/   Удалить: manage.py seed_code_tests --clear')

    def _make_tests(self, owner):
        created = 0
        for title, level, category, finished, pages in TESTS:
            if Test.objects.filter(owner_username=owner, title=title).exists():
                continue
            test = Test.objects.create(
                owner_username=owner,
                title=title,
                description='Задачи проверяются запуском решения в контейнере. ' + MARK,
                status=Test.STATUS_PUBLISHED,
                stats={'level': level, 'category': category},
            )
            build_pages(test, pages)
            make_attempts(test, finished, max_score=len(pages))
            created += 1
        return created
