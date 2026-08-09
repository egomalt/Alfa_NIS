"""Сбор статистики кандидата и сборка PDF-отчёта."""
from django.db.models import Avg, Count
from django.utils import timezone

from articles.constructor.models import Article
from companies.models import CompanyRating
from contests.contests_cabinet.models import ContestSubmission
from users.models import UserProfile

from .pdf import ReportBuilder

ARTICLE_STATUS = {
    Article.STATUS_DRAFT: 'Черновик',
    Article.STATUS_PUBLISHED: 'Опубликована',
}
SUB_STATUS = {
    ContestSubmission.STATUS_PENDING: 'На проверке',
    ContestSubmission.STATUS_ACCEPTED: 'Принято',
    ContestSubmission.STATUS_REJECTED: 'Отклонено',
}


def _date(dt):
    return dt.strftime('%d.%m.%Y') if dt else '—'


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

    days = (timezone.now() - account.created_at).days

    r = ReportBuilder('Личная статистика', account.name or username)

    # Профиль
    r.section('Профиль')
    r.note('Аккаунт: @%s · На платформе: %d дн. (с %s)' % (username, days, _date(account.created_at)))
    if profile and profile.skills:
        r.note('Навыки: ' + ', '.join(profile.skills))
    if profile and profile.bio:
        r.note('О себе: ' + profile.bio)
    r.spacer(4)

    # KPI
    r.kpi([
        (len(published_articles), 'Статей опубликовано'),
        (len(subs), 'Участий в конкурсах'),
        (wins, 'Побед в конкурсах'),
        (avg_given, 'Средняя оценка компаниям'),
    ])

    # Статьи
    r.section('Публикации')
    if articles:
        rows = [[
            a.title or ('Статья #%d' % a.id),
            ARTICLE_STATUS.get(a.status, a.status),
            a.views,
            a.likes,
            _date(a.published_at),
        ] for a in articles]
        r.table(['Название', 'Статус', 'Просмотры', 'Лайки', 'Дата'], rows,
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
            _date(s.created_at),
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
