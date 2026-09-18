from django.db.models import Case, IntegerField, Q, When
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from core.auth import moderator_required
from administration.reports.api_views import _new_counts_by_target, serialize_report
from administration.reports.models import ESCALATION_THRESHOLD, Report
from administration.verification.api_views import serialize_verification
from authorization import bans
from authorization.models import Account
from companies.models import Company

# Сколько строк показываем в блоках «последние» на обзоре
RECENT_LIMIT = 3


@require_GET
@moderator_required
def api_overview(request):
    pending_qs = Company.objects.filter(verification_status=Company.VERIF_PENDING).order_by('submitted_at')
    new_reports_qs = Report.objects.filter(status=Report.STATUS_NEW)

    new_counts = _new_counts_by_target()
    escalated_keys = [key for key, count in new_counts.items() if count >= ESCALATION_THRESHOLD]
    escalated_count = sum(new_counts[key] for key in escalated_keys)

    # Эскалированные жалобы поднимаем наверх в самом запросе, чтобы взять
    # три строки, а не тянуть в память всю очередь ради сортировки
    recent_qs = new_reports_qs
    if escalated_keys:
        priority = Q()
        for target_type, target_id in escalated_keys:
            priority |= Q(target_type=target_type, target_id=target_id)
        recent_qs = recent_qs.order_by(
            Case(When(priority, then=0), default=1, output_field=IntegerField()),
            '-created_at',
        )

    return JsonResponse({
        'ok': True,
        'stats': {
            'verify_pending': pending_qs.count(),
            'reports_new': new_reports_qs.count(),
            'reports_escalated': escalated_count,
            'users_total': Account.objects.count(),
            'banned': Account.objects.filter(bans.active_ban_q()).count(),
        },
        'recent_verifications': [serialize_verification(c) for c in pending_qs[:RECENT_LIMIT]],
        'recent_reports': [serialize_report(r, new_counts) for r in recent_qs[:RECENT_LIMIT]],
        'threshold': ESCALATION_THRESHOLD,
    })
