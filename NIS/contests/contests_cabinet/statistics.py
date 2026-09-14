"""Статистика одного конкурса.

Метрики здесь про конкретный кейс, а не про компанию: воронка и подача решений
по дням имеют смысл только в привязке к одному дедлайну. Сводка по компании
целиком живёт в companies/statistics.py.
"""
from datetime import timedelta

from django.conf import settings
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.utils import timezone

from .models import ContestSubmission

# Глубина графика подачи: интересен разгон перед дедлайном, а не весь срок
WINDOW_DAYS = 14


def _daily(contest):
    """Решения по дням — окно, которое заканчивается днём дедлайна.

    Если дедлайн ещё не наступил, хвост окна остаётся нулевым: так видно,
    сколько времени у участников осталось.
    """
    if contest.deadline is None:
        return [], 0

    last = (timezone.localtime(contest.deadline) if settings.USE_TZ else contest.deadline).date()
    first = last - timedelta(days=WINDOW_DAYS - 1)

    rows = (contest.submissions
            .annotate(day=TruncDate('created_at'))
            .values('day')
            .annotate(n=Count('id'))
            .values_list('day', 'n'))
    by_day = {day: n for day, n in rows if day is not None}

    series = [
        {'day': (first + timedelta(days=offset)).isoformat(),
         'count': by_day.get(first + timedelta(days=offset), 0)}
        for offset in range(WINDOW_DAYS)
    ]
    # Решения, присланные раньше окна, — чтобы сумма на графике не врала
    before = sum(n for day, n in by_day.items() if day < first)
    return series, before


def collect(contest):
    counts = contest.submissions.aggregate(
        submitted=Count('id'),
        accepted=Count('id', filter=Q(status=ContestSubmission.STATUS_ACCEPTED)),
        rejected=Count('id', filter=Q(status=ContestSubmission.STATUS_REJECTED)),
        pending=Count('id', filter=Q(status=ContestSubmission.STATUS_PENDING)),
        winners=Count('id', filter=Q(winner=True)),
    )
    participants = contest.participants_count or 0
    submitted = counts['submitted']
    reviewed = counts['accepted'] + counts['rejected']

    daily, before_window = _daily(contest)

    return {
        # Просмотры страницы конкурса нигде не считаются, поэтому воронка
        # начинается с регистрации, а не с показа
        'funnel': {
            'participants': participants,
            'submitted': submitted,
            'reviewed': reviewed,
            'accepted': counts['accepted'],
            'submit_rate': round(submitted / participants * 100) if participants else 0,
            'review_rate': round(reviewed / submitted * 100) if submitted else 0,
        },
        'statuses': {
            'accepted': counts['accepted'],
            'rejected': counts['rejected'],
            'pending': counts['pending'],
            'winners': counts['winners'],
        },
        'daily': daily,
        'before_window': before_window,
        'window_days': WINDOW_DAYS,
        'deadline': contest.deadline.isoformat() if contest.deadline else None,
    }
