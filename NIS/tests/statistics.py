"""Статистика одного теста: как его проходят.

Всё считается по TestAttempt. До появления этой таблицы у теста был только
счётчик прохождений, по которому нельзя было сказать ни сколько набирают,
ни сколько человек бросает на середине.

Сравнение со средним по площадке нужно, чтобы автор понимал, его тест
сложный или обычный: 30% справившихся сами по себе ни о чём не говорят.
"""
from django.db.models import Avg, Count, ExpressionWrapper, F, FloatField, Q
from django.db.models.fields.json import KeyTextTransform
from django.utils import timezone

from tests.attempts import ABANDON_AFTER, PASS_PERCENT
from tests.constructor.models import Test, TestAttempt

# Границы столбиков гистограммы результатов, в процентах
BUCKETS = [(0, 20), (21, 40), (41, 60), (61, 80), (81, 100)]

# Активность по дням и серии считает users.activity: там события со всей
# площадки, а не только прохождения тестов

# Сколько последних прохождений показывать списком. Это не история попыток,
# а срез «как идёт сейчас»: длинный список только оттесняет остальные блоки.
RECENT_ATTEMPTS = 5


def _percent():
    """Результат попытки в процентах — выражение для запроса."""
    return ExpressionWrapper(F('score') * 100.0 / F('max_score'), output_field=FloatField())


def _scored(queryset):
    """Завершённые попытки, по которым вообще есть что считать.

    max_score = 0 бывает у теста без единого вопроса: делить на ноль нельзя,
    и в среднем балле такие попытки участвовать не должны.
    """
    return queryset.filter(finished_at__isnull=False, max_score__gt=0)


def _summary(queryset):
    """Средний результат и доля справившихся по набору попыток."""
    agg = _scored(queryset).aggregate(
        total=Count('id'),
        average=Avg(_percent()),
        passed=Count('id', filter=Q(score__gte=F('max_score') * PASS_PERCENT / 100.0)),
    )
    total = agg['total'] or 0
    return {
        'scored': total,
        'avg_percent': round(agg['average']) if agg['average'] is not None else None,
        'pass_rate': round(agg['passed'] / total * 100) if total else None,
    }


def _distribution(queryset):
    """Гистограмма результатов: по сколько человек в каждом диапазоне."""
    scored = _scored(queryset)
    filters = {
        f'b{low}': Count('id', filter=Q(
            score__gte=F('max_score') * low / 100.0,
            score__lte=F('max_score') * high / 100.0,
        ))
        for low, high in BUCKETS
    }
    row = scored.aggregate(**filters)
    return [
        {'label': f'{low}–{high}%', 'count': row[f'b{low}']}
        for low, high in BUCKETS
    ]


def platform_summary():
    """Средние по всем опубликованным тестам площадки."""
    across = TestAttempt.objects.filter(test__status=Test.STATUS_PUBLISHED)
    summary = _summary(across)
    summary['tests'] = Test.objects.filter(status=Test.STATUS_PUBLISHED).count()
    return summary


# Подписи тем. Такой же словарь лежит в четырёх скриптах каталогов —
# здесь он нужен, чтобы публичный профиль не заводил пятую копию.
CATEGORY_LABELS = {
    'frontend': 'Frontend',
    'backend': 'Backend',
    'devops': 'DevOps',
    'analytics': 'Аналитика',
    'other': 'Другое',
}

# Тема засчитывается в сильные стороны от такого числа пройденных тестов:
# по одному результату судить не о чем
MIN_TOPIC_ATTEMPTS = 2
TOP_TOPICS = 6


def strengths(username, limit=TOP_TOPICS, min_attempts=MIN_TOPIC_ATTEMPTS):
    """По каким темам кандидат показывает результат.

    Это единственное на публичном профиле, что подтверждается делом, а не
    вписано руками: навыки в профиле человек указывает сам, а тут результат
    чужих тестов. Тема лежит внутри JSON-поля Test.stats, поэтому
    группируем по ключу, а не по колонке.
    """
    rows = (_scored(TestAttempt.objects.filter(candidate_username=username))
            .annotate(topic=KeyTextTransform('category', 'test__stats'))
            .values('topic')
            .annotate(attempts=Count('id'), average=Avg(_percent()))
            .filter(attempts__gte=min_attempts)
            .order_by('-average'))

    result = []
    for row in rows:
        topic = row['topic'] or ''
        # Тест без темы в сильные стороны записать нельзя: непонятно, в чём
        if not topic:
            continue
        result.append({
            'topic': topic,
            'label': CATEGORY_LABELS.get(topic, topic),
            'attempts': row['attempts'],
            'avg_percent': round(row['average']),
        })
        if len(result) == limit:
            break
    return result


def for_candidate(username, recent=RECENT_ATTEMPTS):
    """Как кандидат проходит чужие тесты.

    В кабинете кандидата этого не было вовсе: статистика показывала только
    то, что он создал сам, хотя прохождение тестов — его основное занятие
    на площадке.
    """
    attempts_qs = TestAttempt.objects.filter(candidate_username=username)
    started = attempts_qs.count()
    finished = attempts_qs.filter(finished_at__isnull=False).count()
    summary = _summary(attempts_qs)
    passed = _scored(attempts_qs).filter(
        score__gte=F('max_score') * PASS_PERCENT / 100.0).count()

    rows = (attempts_qs
            .filter(finished_at__isnull=False)
            .select_related('test')
            .order_by('-finished_at')[:recent])

    return {
        'started': started,
        'finished': finished,
        'passed': passed,
        'avg_percent': summary['avg_percent'],
        'pass_rate': summary['pass_rate'],
        'pass_percent': PASS_PERCENT,
        'recent': [{
            'test_id': attempt.test_id,
            'title': attempt.test.title,
            'score': attempt.score,
            'max_score': attempt.max_score,
            # max_score = 0 у теста без вопросов: делить на ноль нельзя
            'percent': round(attempt.score * 100 / attempt.max_score) if attempt.max_score else None,
            'finished_at': attempt.finished_at.isoformat(),
        } for attempt in rows],
    }


def collect(test):
    all_attempts = test.attempts.all()
    started = all_attempts.count()
    finished = all_attempts.filter(finished_at__isnull=False).count()
    # Попытку считаем брошенной, только когда она давно висит открытой:
    # иначе в брошенные попадёт каждый, кто прямо сейчас решает тест
    abandoned = all_attempts.filter(
        finished_at__isnull=True,
        started_at__lt=timezone.now() - ABANDON_AFTER,
    ).count()
    in_progress = started - finished - abandoned

    own = _summary(all_attempts)

    return {
        'test': {
            'id': test.id,
            'title': test.title,
            'status': test.status,
            'level': (test.stats or {}).get('level', ''),
            'category': (test.stats or {}).get('category', ''),
            'page_count': test.pages.count(),
        },
        'attempts': {
            'started': started,
            'finished': finished,
            'abandoned': abandoned,
            'in_progress': max(in_progress, 0),
            'abandon_rate': round(abandoned / started * 100) if started else 0,
            **own,
        },
        'platform': platform_summary(),
        'distribution': _distribution(all_attempts),
        'pass_percent': PASS_PERCENT,
    }
