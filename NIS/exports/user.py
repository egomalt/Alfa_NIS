"""Сбор статистики кандидата и сборка PDF-отчёта."""
from datetime import datetime

from django.db.models import Avg, Count
from django.utils import timezone

from articles.constructor.models import Article
from companies.models import CompanyRating
from contests.contests_cabinet.models import ContestSubmission
from tests import statistics as test_statistics
from users.models import UserProfile

from .pdf import ReportBuilder, fmt_date

ARTICLE_STATUS = {
    Article.STATUS_DRAFT: 'Черновик',
    Article.STATUS_PUBLISHED: 'Опубликована',
}
SUB_STATUS = {
    ContestSubmission.STATUS_PENDING: 'На проверке',
    ContestSubmission.STATUS_ACCEPTED: 'Принято',
    ContestSubmission.STATUS_REJECTED: 'Отклонено',
}


def build_user_pdf(account):
    username = account.username
    profile = UserProfile.objects.filter(username=username).first()

    articles = list(Article.objects.filter(author_username=username).order_by('-created_at'))
    published_articles = [a for a in articles if a.status == Article.STATUS_PUBLISHED]

    subs = list(
        ContestSubmission.objects.filter(candidate_username=username)
        .select_related('contest').order_by('-created_at')
    )
    wins = sum(1 for s in subs if s.winner)

    ratings = list(
        CompanyRating.objects.filter(user_username=username).select_related('company').order_by('-id')
    )
    agg = CompanyRating.objects.filter(user_username=username).aggregate(avg=Avg('rating'), cnt=Count('id'))
    avg_given = ('%.1f ★' % agg['avg']) if agg['avg'] is not None else '—'

    # Числа те же, что рисует кабинет: считаются в одном месте
    taking = test_statistics.for_candidate(username)

    days = (timezone.now() - account.created_at).days

    r = ReportBuilder('Личная статистика', account.name or username)

    # Профиль
    r.section('Профиль')
    r.note('Аккаунт: @%s · На платформе: %d дн. (с %s)' % (username, days, fmt_date(account.created_at)))
    if profile and profile.skills:
        r.note('Навыки: ' + ', '.join(profile.skills))
    if profile and profile.bio:
        r.note('О себе: ' + profile.bio)
    r.spacer(4)

    # KPI
    r.kpi([
        (taking['passed'], 'Тестов пройдено'),
        (len(published_articles), 'Статей опубликовано'),
        (len(subs), 'Участий в конкурсах'),
        (wins, 'Побед в конкурсах'),
    ])

    # Прохождение тестов — то же, что на странице статистики в кабинете
    r.section('Как вы проходите тесты')
    if taking['started']:
        r.note('Тест считается пройденным от %d%% верных ответов.' % taking['pass_percent'])
        r.kpi([
            (taking['started'], 'Начато'),
            (taking['finished'], 'Завершено'),
            ('%d%%' % taking['avg_percent'] if taking['avg_percent'] is not None else '—', 'Средний результат'),
            ('%d%%' % taking['pass_rate'] if taking['pass_rate'] is not None else '—', 'Доля пройденных'),
        ])
        if taking['recent']:
            rows = [[
                item['title'] or ('Тест #%d' % item['test_id']),
                '%d из %d' % (item['score'], item['max_score']),
                '%d%%' % item['percent'] if item['percent'] is not None else '—',
                fmt_date(datetime.fromisoformat(item['finished_at'])),
            ] for item in taking['recent']]
            r.table(['Тест', 'Баллы', 'Результат', 'Дата'], rows, col_ratios=[3.4, 1.2, 1.3, 1.3])
    else:
        r.empty_note('Вы ещё не проходили тесты.')

    # Статьи
    r.section('Публикации')
    if articles:
        rows = [[
            a.title or ('Статья #%d' % a.id),
            ARTICLE_STATUS.get(a.status, a.status),
            a.views,
            a.likes,
            fmt_date(a.published_at),
        ] for a in articles]
        r.table(['Название', 'Статус', 'Просмотры', 'Рейтинг', 'Дата'], rows,
                col_ratios=[3.2, 1.5, 1.2, 1.0, 1.3])
    else:
        r.empty_note('Публикаций пока нет.')

    # Участие в конкурсах
    r.section('Участие в конкурсах')
    if subs:
        rows = [[
            s.contest.title,
            s.contest.company_username,
            'Победитель' if s.winner else SUB_STATUS.get(s.status, s.status),
            fmt_date(s.created_at),
        ] for s in subs]
        r.table(['Конкурс', 'Компания', 'Результат', 'Дата'], rows,
                col_ratios=[3.0, 1.8, 1.5, 1.3])
    else:
        r.empty_note('Участий в конкурсах пока нет.')

    # Оценки компаниям
    if ratings:
        r.section('Оценки компаниям')
        rows = [[rt.company.name or rt.company.username, '%d ★' % rt.rating] for rt in ratings]
        r.table(['Компания', 'Оценка'], rows, col_ratios=[4.0, 1.2])

    return r.build()


def user_filename(account):
    return 'career-profile-%s.pdf' % account.username
