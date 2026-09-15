"""Сводная статистика компании.

Одно место сбора на две витрины — страницу «Статистика» в кабинете и PDF-отчёт.
Раньше каждая считала числа сама, и они могли разойтись.

Всё считается запросами по факту: денормализованных счётчиков здесь нет,
кроме Contest.participants_count, который ведёт сам конкурс.
"""
from collections import Counter
from datetime import datetime, time, timedelta

from django.conf import settings
from django.db.models import Avg, Count, Q, Sum
from django.db.models.functions import TruncWeek
from django.utils import timezone

from companies.models import CompanyRating
from contests.contests_cabinet.models import Contest, ContestSubmission
from tests.constructor.models import Test, TestAttempt
from users.models import UserProfile

# Глубина графика активности
WEEKS = 12
# Сколько навыков показываем в «портрете участников»
TOP_SKILLS = 12
# Потолок на разбор профилей: у компании может накопиться много участников
MAX_PROFILES = 500


def _week_start(moment):
    """Понедельник недели — так же, как группирует TruncWeek."""
    local = timezone.localtime(moment)
    monday = local - timedelta(days=local.weekday())
    return monday.date()


def _weekly(username):
    """Активность по неделям: решения на конкурсы и завершённые прохождения тестов.

    Пустые недели заполняем нулями — иначе на графике получаются дыры,
    и он врёт о том, что происходило.
    """
    first = _week_start(timezone.now()) - timedelta(weeks=WEEKS - 1)
    since = datetime.combine(first, time.min)
    if settings.USE_TZ:
        since = timezone.make_aware(since)

    def by_week(queryset, field):
        rows = (queryset
                .annotate(week=TruncWeek(field))
                .values('week')
                .annotate(n=Count('id'))
                .values_list('week', 'n'))
        return {
            (timezone.localtime(week).date() if settings.USE_TZ else week.date()): n
            for week, n in rows if week is not None
        }

    submissions = by_week(
        ContestSubmission.objects.filter(contest__company_username=username, created_at__gte=since),
        'created_at')
    attempts = by_week(
        TestAttempt.objects.filter(test__owner_username=username, finished_at__gte=since),
        'finished_at')

    series = []
    for offset in range(WEEKS):
        week = first + timedelta(weeks=offset)
        series.append({
            'week': week.isoformat(),
            'submissions': submissions.get(week, 0),
            'attempts': attempts.get(week, 0),
        })
    return series


def _skills(username):
    """Навыки тех, кто присылал решения на конкурсы компании."""
    usernames = list(
        ContestSubmission.objects
        .filter(contest__company_username=username)
        .values_list('candidate_username', flat=True)
        .distinct()[:MAX_PROFILES]
    )
    if not usernames:
        return []

    counter = Counter()
    for skills in UserProfile.objects.filter(username__in=usernames).values_list('skills', flat=True):
        for skill in (skills or []):
            name = str(skill).strip()
            if name:
                counter[name] += 1
    return [{'name': name, 'count': count} for name, count in counter.most_common(TOP_SKILLS)]


def rating(company):
    """Средняя оценка, число отзывов и распределение по звёздам в процентах.

    Живёт здесь, а не во вьюхе, потому что то же распределение печатает
    PDF-отчёт: считать его в двух местах — верный способ разойтись.
    """
    agg = company.ratings.aggregate(avg=Avg('rating'), count=Count('id'))
    total = agg['count'] or 0
    dist = {}
    if total:
        for row in company.ratings.values('rating').annotate(n=Count('id')):
            dist[row['rating']] = round(row['n'] / total * 100)
    return {
        'avg': round(agg['avg'], 1) if agg['avg'] is not None else None,
        'count': total,
        'dist': dist,
    }


def collect(company):
    """Все числа для кабинета и отчёта одним набором."""
    username = company.username

    contests = Contest.objects.filter(company_username=username).aggregate(
        total=Count('id'),
        active=Count('id', filter=Q(status=Contest.STATUS_ACTIVE)),
        participants=Sum('participants_count'),
    )
    tests = Test.objects.filter(owner_username=username).aggregate(
        total=Count('id'),
        published=Count('id', filter=Q(status=Test.STATUS_PUBLISHED)),
    )
    submissions = ContestSubmission.objects.filter(contest__company_username=username).aggregate(
        total=Count('id'),
        winners=Count('id', filter=Q(winner=True)),
        pending=Count('id', filter=Q(status=ContestSubmission.STATUS_PENDING)),
    )
    finished_attempts = TestAttempt.objects.filter(
        test__owner_username=username, finished_at__isnull=False).count()
    stars = rating(company)

    return {
        'totals': {
            'contests': contests['total'],
            'active_contests': contests['active'],
            'tests': tests['total'],
            'published_tests': tests['published'],
            'participants': contests['participants'] or 0,
            'submissions': submissions['total'],
            'winners': submissions['winners'],
            'pending_submissions': submissions['pending'],
            'test_attempts': finished_attempts,
            'avg_rating': stars['avg'],
            'rating_count': stars['count'],
        },
        'rating_dist': stars['dist'],
        'weekly': _weekly(username),
        'skills': _skills(username),
    }
