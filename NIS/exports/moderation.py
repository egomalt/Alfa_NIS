"""Сбор сводки модерации и сборка PDF-отчёта для админ-панели."""
from administration.reports.api_views import _new_counts_by_target
from administration.reports.models import ESCALATION_THRESHOLD, Report
from authorization.models import (
    Account, ROLE_COMPANY, ROLE_MODERATOR, ROLE_USER, STATUS_BANNED,
)
from companies.models import Company

from .pdf import ReportBuilder

ROLE_LABELS = {ROLE_USER: 'Кандидат', ROLE_COMPANY: 'Компания', ROLE_MODERATOR: 'Модератор'}
TARGET_LABELS = dict(Report.TARGET_CHOICES)


def _date(dt):
    return dt.strftime('%d.%m.%Y') if dt else '—'


def build_admin_pdf():
    pending = list(Company.objects.filter(verification_status=Company.VERIF_PENDING).order_by('submitted_at'))
    new_reports = list(Report.objects.filter(status=Report.STATUS_NEW))
    new_counts = _new_counts_by_target()
    escalated = sum(
        1 for r in new_reports
        if new_counts.get((r.target_type, r.target_id), 0) >= ESCALATION_THRESHOLD
    )
    banned = list(Account.objects.filter(status=STATUS_BANNED).order_by('-created_at'))

    r = ReportBuilder('Сводка модерации', 'Панель администратора')

    r.kpi([
        (len(pending), 'Заявок на верификацию'),
        (len(new_reports), 'Открытых жалоб'),
        (escalated, 'Эскалировано (3+)'),
        (Account.objects.count(), 'Всего пользователей'),
    ])
    r.kpi([(len(banned), 'Забанено')])

    # Заявки на верификацию
    r.section('Заявки на верификацию')
    if pending:
        rows = [[c.name or c.username, c.industry or '—', c.city or '—', _date(c.submitted_at)] for c in pending]
        r.table(['Компания', 'Индустрия', 'Город', 'Подано'], rows, col_ratios=[2.6, 2.0, 1.6, 1.4])
    else:
        r.empty_note('Очередь верификации пуста.')

    # Новые жалобы
    r.section('Новые жалобы')
    if new_reports:
        rows = []
        for rep in new_reports:
            total = new_counts.get((rep.target_type, rep.target_id), 0)
            mark = ' (эскалация)' if total >= ESCALATION_THRESHOLD else ''
            rows.append([
                TARGET_LABELS.get(rep.target_type, rep.target_type),
                rep.target_title + mark,
                rep.reporter_username or '—',
                _date(rep.created_at),
            ])
        r.table(['Тип', 'Цель', 'Заявитель', 'Дата'], rows, col_ratios=[1.4, 3.0, 1.8, 1.3])
    else:
        r.empty_note('Новых жалоб нет.')

    # Забаненные
    r.section('Забаненные пользователи')
    if banned:
        rows = [[
            u.name or u.username,
            ROLE_LABELS.get(u.role, u.role),
            _date(u.ban_until) if u.ban_until else 'навсегда',
            (u.ban_reason or '—')[:80],
        ] for u in banned]
        r.table(['Пользователь', 'Роль', 'Бан до', 'Причина'], rows, col_ratios=[2.0, 1.3, 1.4, 3.0])
    else:
        r.empty_note('Забаненных пользователей нет.')

    return r.build()


def admin_filename():
    from django.utils import timezone
    return 'career-moderation-%s.pdf' % timezone.localtime(timezone.now()).strftime('%Y%m%d')
