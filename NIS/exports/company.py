"""Сбор статистики компании и сборка PDF-отчёта.

Отчёт повторяет страницу «Статистика» в кабинете: те же плашки, тот же график
за 12 недель, тот же портрет участников и то же распределение оценок. Числа
приходят из companies.statistics — единственного места, где они считаются.
"""
from datetime import date

from django.db.models import Avg, Count, ExpressionWrapper, F, FloatField, Q

from companies import statistics
from contests.contests_cabinet.models import Contest
from tests import attempts
from tests.constructor.models import Test

from .pdf import AMBER, BRAND, GREEN, ReportBuilder, fmt_date, plural

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

# Сколько строк оставляем в таблицах. Отчёт — сводка, а не выгрузка:
# полные списки и так лежат в разделах кабинета
TOP_CONTESTS = 5
TOP_TESTS = 10


def _week_label(iso):
    """Понедельник недели как «08.09» — подпись под столбиком."""
    day = date.fromisoformat(iso)
    return '%02d.%02d' % (day.day, day.month)


def contest_rows(username, limit=TOP_CONTESTS):
    """Самые активные конкурсы: сортировка по числу присланных решений.

    Полный список жил в отчёте и повторял раздел «Конкурсы» кабинета —
    на десятке конкурсов он занимал страницу, ничего не объясняя.
    """
    return list(
        Contest.objects
        .filter(company_username=username)
        .annotate(submission_total=Count('submissions'))
        .order_by('-submission_total', '-created_at')[:limit]
    )


def test_rows(username, limit=TOP_TESTS):
    """Самые проходимые тесты с числом прохождений и средним результатом.

    Обе агрегации идут по одной связи attempts, поэтому строки не множатся;
    distinct в счётчике всё равно нужен — так же считает кабинет.
    """
    percent = ExpressionWrapper(
        F('attempts__score') * 100.0 / F('attempts__max_score'), output_field=FloatField())
    return list(
        Test.objects
        .filter(owner_username=username)
        .annotate(
            finished_attempts=attempts.finished_count(),
            # max_score = 0 бывает у теста без вопросов: такие попытки
            # в среднем участвовать не должны, иначе деление на ноль
            avg_percent=Avg(percent, filter=Q(
                attempts__finished_at__isnull=False, attempts__max_score__gt=0)),
        )
        .order_by('-finished_attempts', '-created_at')[:limit]
    )


def _shown_of(total, limit):
    """Приписка под таблицей, если в отчёт попали не все записи."""
    if total <= limit:
        return None
    return 'Показаны %d из %d — полный список в кабинете.' % (limit, total)


def _activity(r, weekly):
    """График активности за 12 недель — тот же, что на странице кабинета."""
    subs = [w['submissions'] for w in weekly]
    atts = [w['attempts'] for w in weekly]
    if not any(subs) and not any(atts):
        r.section('Активность за 12 недель')
        r.empty_note('За последние 12 недель активности не было.')
        return
    total = 'Всего за период: %d %s и %d %s.' % (
        sum(subs), plural(sum(subs), ('решение', 'решения', 'решений')),
        sum(atts), plural(sum(atts), ('прохождение', 'прохождения', 'прохождений')),
    )
    r.columns(
        [_week_label(w['week']) for w in weekly],
        [('решения на конкурсы', BRAND, subs), ('прохождения тестов', AMBER, atts)],
        title='Активность за 12 недель',
    )
    r.note(total)


def _skills(r, skills):
    """Портрет участников: какие навыки чаще всего у тех, кто присылал решения."""
    if not skills:
        return
    peak = max(s['count'] for s in skills)
    r.bars(
        [(s['name'], str(s['count']), s['count'] / peak) for s in skills],
        title='Кто к вам приходит',
        note='Навыки из профилей тех, кто присылал решения на ваши конкурсы.',
        label_w=150, color=GREEN,
    )


def _rating(r, totals, dist):
    if totals['avg_rating'] is None:
        return
    count = totals['rating_count']
    r.bars(
        [('%d ★' % star, '%d%%' % dist.get(star, 0), dist.get(star, 0) / 100)
         for star in (5, 4, 3, 2, 1)],
        title='Рейтинг компании',
        note='%.1f из 5 — средняя оценка по %d %s кандидатов.' % (
            totals['avg_rating'], count, plural(count, ('отзыву', 'отзывам', 'отзывам'))),
        label_w=40,
    )


def build_company_pdf(company):
    data = statistics.collect(company)
    totals = data['totals']
    avg = totals['avg_rating']
    rating_str = ('%.1f ★' % avg) if avg is not None else '—'

    r = ReportBuilder('Статистика компании', company.name or company.username)
    r.note('@%s · отчёт за всё время работы на платформе' % company.username)
    r.spacer(6)

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

    _activity(r, data['weekly'])
    _skills(r, data['skills'])
    _rating(r, totals, data['rating_dist'])

    r.section('Конкурсы с наибольшим откликом')
    contests = contest_rows(company.username)
    if contests:
        rows = [[
            c.title or ('Конкурс #%d' % c.id),
            c.category or '—',
            CONTEST_STATUS.get(c.status, c.status),
            c.participants_count or 0,
            c.submission_total,
            fmt_date(c.deadline),
        ] for c in contests]
        r.table(['Название', 'Категория', 'Статус', 'Участники', 'Решения', 'Дедлайн'], rows,
                col_ratios=[3.0, 1.6, 1.4, 1.1, 1.0, 1.3])
        more = _shown_of(totals['contests'], TOP_CONTESTS)
        if more:
            r.note(more)
    else:
        r.empty_note('Конкурсы ещё не создавались.')

    r.section('Самые проходимые тесты')
    tests = test_rows(company.username)
    if tests:
        rows = [[
            t.title or ('Тест #%d' % t.id),
            TEST_STATUS.get(t.status, t.status),
            attempts.count_for(t),
            '%d%%' % round(t.avg_percent) if t.avg_percent is not None else '—',
            fmt_date(t.created_at),
        ] for t in tests]
        r.table(['Название', 'Статус', 'Прохождения', 'Средний результат', 'Создан'], rows,
                col_ratios=[3.0, 1.4, 1.2, 1.5, 1.2])
        more = _shown_of(totals['tests'], TOP_TESTS)
        if more:
            r.note(more)
    else:
        r.empty_note('Тесты ещё не создавались.')

    return r.build()


def company_filename(company):
    return 'career-company-%s.pdf' % company.username
