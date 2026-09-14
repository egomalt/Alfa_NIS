"""Сбор статистики компании и сборка PDF-отчёта."""
from companies import statistics
from contests.contests_cabinet.models import Contest
from tests import attempts
from tests.constructor.models import Test

from .pdf import ReportBuilder, fmt_date

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


def build_company_pdf(company):
    contests = list(Contest.objects.filter(company_username=company.username).order_by('-created_at'))
    tests = list(Test.objects.filter(owner_username=company.username).order_by('-created_at'))

    # Числа берём там же, где их берёт кабинет, — иначе отчёт и страница расходятся
    totals = statistics.collect(company)['totals']
    avg = totals['avg_rating']
    rating_str = ('%.1f ★' % avg) if avg is not None else '—'

    r = ReportBuilder('Статистика компании', company.name or company.username)

    r.kpi([
        (totals['contests'], 'Конкурсов создано'),
        (totals['published_tests'], 'Тестов опубликовано'),
        (totals['participants'], 'Участников привлечено'),
        (rating_str, 'Оценка (%d отз.)' % totals['rating_count']),
    ])
    r.kpi([
        (totals['submissions'], 'Решений прислано'),
        (totals['winners'], 'Победителей выбрано'),
        (totals['pending_submissions'], 'Ждут проверки'),
        (totals['test_attempts'], 'Прохождений тестов'),
    ])

    # Конкурсы
    r.section('Конкурсы')
    if contests:
        rows = [[
            c.title,
            c.category or '—',
            CONTEST_STATUS.get(c.status, c.status),
            c.participants_count or 0,
            fmt_date(c.deadline),
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
            attempts.count_for(t),
        ] for t in tests]
        r.table(['Название', 'Статус', 'Прохождения'], rows, col_ratios=[3.4, 1.4, 1.4])
    else:
        r.empty_note('Тесты ещё не создавались.')

    return r.build()


def company_filename(company):
    return 'career-company-%s.pdf' % company.username
