"""Сбор статистики компании и сборка PDF-отчёта."""
from django.db.models import Avg, Count

from companies.models import Company, CompanyRating
from contests.contests_cabinet.models import Contest
from tests.constructor.models import Test

from .pdf import ReportBuilder

CONTEST_STATUS = {
    Contest.STATUS_DRAFT: 'Черновик',
    Contest.STATUS_ACTIVE: 'Активен',
    Contest.STATUS_REVIEW: 'На проверке',
    Contest.STATUS_FINISHED: 'Завершён',
}
TEST_STATUS = {
    Test.STATUS_DRAFT: 'Черновик',
    Test.STATUS_PUBLISHED: 'Опубликован',
}


def _date(dt):
    return dt.strftime('%d.%m.%Y') if dt else '—'


def build_company_pdf(company):
    contests = list(Contest.objects.filter(company_username=company.username).order_by('-created_at'))
    tests = list(Test.objects.filter(owner_username=company.username).order_by('-created_at'))

    published_tests = [t for t in tests if t.status == Test.STATUS_PUBLISHED]
    total_participants = sum(c.participants_count or 0 for c in contests)
    agg = CompanyRating.objects.filter(company=company).aggregate(avg=Avg('rating'), cnt=Count('id'))
    avg = agg['avg']
    rating_str = ('%.1f ★' % avg) if avg is not None else '—'

    r = ReportBuilder('Статистика компании', company.name or company.username)

    r.kpi([
        (len(contests), 'Конкурсов создано'),
        (len(published_tests), 'Тестов опубликовано'),
        (total_participants, 'Участников привлечено'),
        (rating_str, 'Оценка (%d отз.)' % (agg['cnt'] or 0)),
    ])

    # Конкурсы
    r.section('Конкурсы')
    if contests:
        rows = [[
            c.title,
            c.category or '—',
            CONTEST_STATUS.get(c.status, c.status),
            c.participants_count or 0,
            _date(c.deadline),
        ] for c in contests]
        r.table(['Название', 'Категория', 'Статус', 'Участники', 'Дедлайн'], rows,
                col_ratios=[3.2, 1.8, 1.4, 1.1, 1.3])
    else:
        r.empty_note('Конкурсы ещё не создавались.')

    # Тесты
    r.section('Тесты')
    if tests:
        rows = [[
            t.title,
            TEST_STATUS.get(t.status, t.status),
            (t.stats or {}).get('submissions', 0),
        ] for t in tests]
        r.table(['Название', 'Статус', 'Прохождения'], rows, col_ratios=[3.4, 1.4, 1.4])
    else:
        r.empty_note('Тесты ещё не создавались.')

    return r.build()


def company_filename(company):
    return 'career-company-%s.pdf' % company.username
