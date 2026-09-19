"""Общие детали демонстрационных данных для команд seed_*.

Отсюда берутся демо-кандидаты, от чьего имени записаны прохождения тестов
и решения конкурсов, и сами прохождения.
"""
import random
from datetime import timedelta

from django.utils import timezone

from authorization.models import Account, ROLE_USER
from tests.constructor.models import TestAnswer, TestAttempt, TestPage
from users.models import UserProfile

# Помечаем созданное, чтобы --clear не задел записи, заведённые руками
MARK = '[demo]'

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


def ensure_takers():
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


def make_attempts(test, finished, max_score):
    """Прохождения теста: завершённые с разбросом баллов плюс брошенные.

    Записи настоящие, иначе статистика теста считалась бы по пустой таблице.
    """
    if not finished or not max_score:
        return

    takers = ensure_takers()
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


PAGE_TYPES = {
    'quiz': TestPage.TYPE_QUIZ,
    'input': TestPage.TYPE_INPUT,
    'code': TestPage.TYPE_CODE,
    'text': TestPage.TYPE_TEXT,
}


def build_pages(test, questions):
    """Страницы теста из компактного описания (тип, заголовок, содержимое).

    Для quiz и input содержимое — список вариантов [(текст, верный)].
    Для code — словарь: условие, язык, лимит времени и тест-кейсы.
    """
    for order, (page_type, title, payload) in enumerate(questions):
        page = TestPage.objects.create(
            test=test, order=order,
            type=PAGE_TYPES.get(page_type, TestPage.TYPE_TEXT),
            title=title,
            content=payload.get('content', '') if isinstance(payload, dict) else '',
            page_meta=_code_meta(payload) if page_type == 'code' else {},
        )
        if isinstance(payload, list):
            for answer_order, (text, is_correct) in enumerate(payload):
                TestAnswer.objects.create(page=page, text=text,
                                          is_correct=is_correct, order=answer_order)


def _code_meta(payload):
    """page_meta задачи на код в том же виде, в каком его пишет конструктор."""
    return {
        'language': payload.get('language', 'python'),
        'time_limit': payload.get('time_limit', 5),
        'test_cases': [
            {'input': case['input'], 'expected': case['expected'],
             'is_sample': bool(case.get('is_sample'))}
            for case in payload.get('test_cases', [])
        ],
    }
