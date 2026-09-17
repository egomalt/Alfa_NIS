"""Активность кандидата по дням: что он делал на площадке и когда.

Считается в одном месте, потому что читается в двух: тепловая карта с серией
в кабинете и огонёк в публичном профиле. Раньше набор событий собирал браузер,
а серию считал он же — при второй витрине правило пришлось бы повторить.

Событием считается завершённое прохождение теста, отправленное решение
конкурса и созданный материал (тест или статья). Открыть тест и уйти —
не то, чем стоит закрашивать день.
"""
from datetime import timedelta

from django.db.models import Count
from django.db.models.functions import TruncDate
from django.utils import timezone

from articles.constructor.models import Article
from contests.contests_cabinet.models import ContestSubmission
from tests.constructor.models import Test, TestAttempt

# Глубина карты в кабинете — 26 недель
WINDOW_DAYS = 182


def _add(counts, queryset, field):
    rows = (queryset
            .annotate(day=TruncDate(field))
            .values('day')
            .annotate(n=Count('id'))
            .values_list('day', 'n'))
    for day, n in rows:
        if day is not None:
            key = day.isoformat()
            counts[key] = counts.get(key, 0) + n


def daily(username, days=WINDOW_DAYS):
    """{'2026-09-17': 3, …} — сколько событий в каждый день окна."""
    since = timezone.now() - timedelta(days=days)
    counts = {}
    _add(counts, TestAttempt.objects.filter(
        candidate_username=username, finished_at__gte=since), 'finished_at')
    _add(counts, ContestSubmission.objects.filter(
        candidate_username=username, created_at__gte=since), 'created_at')
    _add(counts, Article.objects.filter(
        author_username=username, created_at__gte=since), 'created_at')
    _add(counts, Test.objects.filter(
        owner_username=username, created_at__gte=since), 'created_at')
    return counts


def streaks(counts):
    """Серии по дням: сколько подряд идёт сейчас и какая была лучшей.

    Отсутствие активности сегодня серию не обрывает: день ещё не кончился,
    и обнулять счётчик в полночь было бы враньём. Серия гаснет, когда целые
    сутки прошли без событий.
    """
    today = timezone.localdate()
    days = [
        counts.get((today - timedelta(days=back)).isoformat(), 0)
        for back in range(WINDOW_DAYS - 1, -1, -1)
    ]

    best = run = 0
    for n in days:
        run = run + 1 if n else 0
        best = max(best, run)

    index = len(days) - 1
    if days[index] == 0:
        index -= 1
    current = 0
    while index >= 0 and days[index] > 0:
        current += 1
        index -= 1

    return {'current': current, 'best': best, 'today': days[-1]}
