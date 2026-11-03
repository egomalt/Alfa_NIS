"""Активность кандидата по дням: что он делал на площадке и когда.

Считается в одном месте, потому что читается в двух: тепловая карта с серией
в кабинете и огонёк в публичном профиле.

Событием считается завершённое прохождение теста, отправленное решение
конкурса и созданный материал (тест или статья). Открыть тест и уйти —
не то, чем стоит закрашивать день.
"""

from datetime import date, timedelta

from django.db.models import Count
from django.db.models.functions import TruncDate
from django.utils import timezone

from articles.constructor.models import Article
from contests.contests_cabinet.models import ContestSubmission
from tests.constructor.models import Test, TestAttempt

# Глубина карты в кабинете — 26 недель
WINDOW_DAYS = 182


def _add(counts, queryset, field, since):
    if since is not None:
        queryset = queryset.filter(**{f'{field}__gte': since})
    rows = queryset.annotate(day=TruncDate(field)).values('day').annotate(n=Count('id')).values_list('day', 'n')
    for day, n in rows:
        if day is not None:
            key = day.isoformat()
            counts[key] = counts.get(key, 0) + n


def daily(username, days=WINDOW_DAYS):
    """События по дням. days=None возвращает всю историю."""
    since = None
    if days is not None:
        since = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1)
    counts = {}
    _add(counts, TestAttempt.objects.filter(candidate_username=username, finished_at__isnull=False), 'finished_at', since)
    _add(counts, ContestSubmission.objects.filter(candidate_username=username), 'created_at', since)
    _add(counts, Article.objects.filter(author_username=username), 'created_at', since)
    _add(counts, Test.objects.filter(owner_username=username), 'created_at', since)
    return counts


def streaks(counts):
    """Серии по дням: сколько подряд идёт сейчас и какая была лучшей.

    Отсутствие активности сегодня серию не обрывает: день ещё не кончился,
    и обнулять счётчик в полночь было бы враньём. Серия гаснет, когда целые
    сутки прошли без событий.
    """
    today = timezone.localdate()
    days = sorted(date.fromisoformat(day) for day, count in counts.items() if count > 0 and day <= today.isoformat())

    best = run = 0
    previous = None
    for day in days:
        run = run + 1 if previous is not None and (day - previous).days == 1 else 1
        best = max(best, run)
        previous = day

    current = run if previous in (today, today - timedelta(days=1)) else 0
    return {'current': current, 'best': best, 'today': counts.get(today.isoformat(), 0)}


def summary(username):
    counts = daily(username, days=None)
    today = timezone.localdate()
    first = (today - timedelta(days=WINDOW_DAYS - 1)).isoformat()
    return {
        'daily': {day: count for day, count in counts.items() if first <= day <= today.isoformat()},
        'streak': streaks(counts),
    }
