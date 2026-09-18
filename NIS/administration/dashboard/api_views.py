from django.http import JsonResponse
from django.views.decorators.http import require_GET

from core.auth import moderator_required
from administration.reports.api_views import (
    _new_counts_by_target, escalated_first, escalated_keys, serialize_report,
)
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
    escalated_count = sum(new_counts[key] for key in escalated_keys(new_counts))
    # Три строки берём из запроса, а не из всей очереди, вытянутой в память
    recent_qs = escalated_first(new_reports_qs, new_counts)

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
