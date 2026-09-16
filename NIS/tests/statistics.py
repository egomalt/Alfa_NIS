"""Статистика одного теста: как его проходят.

Всё считается по TestAttempt. До появления этой таблицы у теста был только
счётчик прохождений, по которому нельзя было сказать ни сколько набирают,
ни сколько человек бросает на середине.

Сравнение со средним по площадке нужно, чтобы автор понимал, его тест
сложный или обычный: 30% справившихся сами по себе ни о чём не говорят.
"""
from datetime import timedelta

from django.db.models import Avg, Count, ExpressionWrapper, F, FloatField, Q
from django.db.models.functions import TruncDate
from django.utils import timezone

from tests.attempts import ABANDON_AFTER, PASS_PERCENT
from tests.constructor.models import Test, TestAttempt

# Границы столбиков гистограммы результатов, в процентах
BUCKETS = [(0, 20), (21, 40), (41, 60), (61, 80), (81, 100)]

# Глубина тепловой карты в кабинете кандидата — 26 недель
HEAT_DAYS = 182

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


def _daily(queryset, days):
    """Сколько прохождений закрыто в каждый из последних дней.

    Нужно тепловой карте в кабинете: она рисовалась по созданным статьям,
    тестам и отправленным решениям, а прохождения тестов — самое частое
    действие кандидата — в ней не участвовали вовсе.

    Считаем именно завершённые: открыть тест и уйти — не то событие,
    которым стоит закрашивать день.
    """
    since = timezone.now() - timedelta(days=days)
    rows = (queryset
            .filter(finished_at__gte=since)
            .annotate(day=TruncDate('finished_at'))
            .values('day')
            .annotate(n=Count('id'))
            .values_list('day', 'n'))
    return {day.isoformat(): n for day, n in rows if day is not None}


def for_candidate(username, recent=RECENT_ATTEMPTS, days=HEAT_DAYS):
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
        'daily': _daily(attempts_qs, days),
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
