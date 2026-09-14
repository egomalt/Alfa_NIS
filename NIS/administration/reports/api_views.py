from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET, require_POST

from articles.constructor.models import Article
from authorization.models import Account, ROLE_USER
from companies.models import Company
from contests.contests_cabinet.models import Contest
from core.auth import api_login_required, moderator_required
from core.pagination import paginate
from core.utils import load_json_body
from tests.constructor.models import Test
from .models import ESCALATION_THRESHOLD, Report, TARGET_LABELS

VALID_STATUSES = [Report.STATUS_NEW, Report.STATUS_RESOLVED, Report.STATUS_DISMISSED]

MAX_REASON_LENGTH = 2000
REPORTS_PER_PAGE = 100


def _new_counts_by_target():
    """Число НОВЫХ жалоб на каждую цель — для расчёта эскалации."""
    counts = {}
    for r in Report.objects.filter(status=Report.STATUS_NEW).values('target_type', 'target_id'):
        key = (r['target_type'], r['target_id'])
        counts[key] = counts.get(key, 0) + 1
    return counts


def serialize_report(report, new_counts):
    total = new_counts.get((report.target_type, report.target_id), 0)
    return {
        'id': report.id,
        'target_type': report.target_type,
        'target_id': report.target_id,
        'target_type_label': TARGET_LABELS.get(report.target_type, report.target_type),
        'target_title': report.target_title,
        'target_url': report.target_url,
        'author_username': report.author_username,
        'reporter_username': report.reporter_username,
        'reason': report.reason,
        'evidence': report.evidence,
        'status': report.status,
        'created_at': report.created_at.isoformat(),
        'total_reports': total,
        'escalated': total >= ESCALATION_THRESHOLD,
    }


def _resolve_target(target_type, target_id):
    """Находит объект жалобы и возвращает (заголовок, ссылка, автор) или None.

    Заголовок, ссылку и автора определяет сервер, а не клиент: иначе в очередь
    модерации можно было бы подсунуть произвольный текст и чужое имя.
    """

    if target_type in (Report.TARGET_ARTICLE, Report.TARGET_CONTEST, Report.TARGET_TEST):
        if not target_id.isdigit():
            return None
        obj_id = int(target_id)
        if target_type == Report.TARGET_ARTICLE:
            obj = Article.objects.filter(id=obj_id, status=Article.STATUS_PUBLISHED).first()
            return obj and (obj.title or f'Статья #{obj.id}', f'/articles/{obj.id}/', obj.author_username)
        if target_type == Report.TARGET_CONTEST:
            obj = Contest.objects.filter(id=obj_id).exclude(status='draft').first()
            return obj and (obj.title or f'Конкурс #{obj.id}', f'/contests/{obj.id}/', obj.company_username)
        obj = Test.objects.filter(id=obj_id, status=Test.STATUS_PUBLISHED).first()
        return obj and (obj.title or f'Тест #{obj.id}', f'/tests/{obj.id}/', obj.owner_username)

    if target_type == Report.TARGET_USER:
        obj = Account.objects.filter(username=target_id, role=ROLE_USER).first()
        return obj and (obj.name or obj.username, f'/{obj.username}/', obj.username)

    if target_type == Report.TARGET_COMPANY:
        obj = Company.objects.filter(username=target_id).first()
        return obj and (obj.name or obj.username, f'/{obj.username}/', obj.username)

    return None


@require_POST
@api_login_required()
def api_report_create(request):
    """Создание жалобы любым вошедшим пользователем."""
    body = load_json_body(request)

    target_type = (body.get('target_type') or '').strip()
    target_id = str(body.get('target_id') or '').strip()
    reason = (body.get('reason') or '').strip()

    if target_type not in TARGET_LABELS:
        return JsonResponse({'ok': False, 'message': 'Неизвестный тип материала.'}, status=400)
    if not reason:
        return JsonResponse({'ok': False, 'message': 'Опишите причину жалобы.'}, status=400)

    resolved = _resolve_target(target_type, target_id)
    if not resolved:
        return JsonResponse({'ok': False, 'message': 'Материал не найден.'}, status=404)

    title, url, author_username = resolved
    if author_username == request.account.username:
        return JsonResponse({'ok': False, 'message': 'Нельзя пожаловаться на свой материал.'}, status=400)

    try:
        # Вставку оборачиваем в свой atomic: иначе пойманная IntegrityError оставляет
        # внешнюю транзакцию в сломанном состоянии, и следующий запрос к БД падает.
        with transaction.atomic():
            Report.objects.create(
                target_type=target_type,
                target_id=target_id,
                target_title=title[:255],
                target_url=url,
                author_username=author_username,
                reporter_username=request.account.username,
                reason=reason[:MAX_REASON_LENGTH],
            )
    except IntegrityError:
        return JsonResponse({'ok': False, 'message': 'Вы уже жаловались на этот материал.'}, status=409)

    return JsonResponse({'ok': True, 'message': 'Жалоба отправлена модераторам.'}, status=201)


@require_GET
@moderator_required
def api_reports(request):
    status = request.GET.get('status', Report.STATUS_NEW)
    if status not in VALID_STATUSES:
        status = Report.STATUS_NEW
    new_counts = _new_counts_by_target()
    reports, page_meta = paginate(request, Report.objects.filter(status=status), REPORTS_PER_PAGE)
    data = [serialize_report(r, new_counts) for r in reports]
    # Эскалированные — выше
    data.sort(key=lambda r: (not r['escalated'],))
    return JsonResponse({'ok': True, 'reports': data, 'threshold': ESCALATION_THRESHOLD, **page_meta})


@require_POST
@moderator_required
def api_report_resolve(request, report_id):
    report = get_object_or_404(Report, id=report_id)
    report.status = Report.STATUS_RESOLVED
    report.save(update_fields=['status'])
    return JsonResponse({'ok': True})


@require_POST
@moderator_required
def api_report_takedown(request, report_id):
    """Снимает материал и закрывает жалобу.

    Раньше кнопка «Снять материал» только меняла статус жалобы — материал
    оставался опубликованным, а модератор считал вопрос закрытым.
    """
    report = get_object_or_404(Report, id=report_id)

    models_by_type = {
        Report.TARGET_ARTICLE: Article,
        Report.TARGET_CONTEST: Contest,
        Report.TARGET_TEST: Test,
    }
    model = models_by_type.get(report.target_type)
    if model is None:
        return JsonResponse(
            {'ok': False, 'message': 'Снять можно только материал — для аккаунтов используйте бан.'},
            status=400,
        )
    if not report.target_id.isdigit():
        return JsonResponse({'ok': False, 'message': 'Некорректная ссылка на материал.'}, status=400)

    deleted, _ = model.objects.filter(id=int(report.target_id)).delete()

    # Закрываем все жалобы на этот материал, а не только текущую
    Report.objects.filter(
        target_type=report.target_type, target_id=report.target_id, status=Report.STATUS_NEW
    ).update(status=Report.STATUS_RESOLVED)

    return JsonResponse({'ok': True, 'deleted': bool(deleted)})


@require_POST
@moderator_required
def api_report_dismiss(request, report_id):
    report = get_object_or_404(Report, id=report_id)
    report.status = Report.STATUS_DISMISSED
    report.save(update_fields=['status'])
    return JsonResponse({'ok': True})
