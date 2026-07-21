from django.http import JsonResponse
from django.views.decorators.http import require_GET

from administration.dashboard.views import moderator_required
from administration.reports.api_views import _new_counts_by_target, serialize_report
from administration.reports.models import ESCALATION_THRESHOLD, Report
from administration.verification.api_views import serialize_verification
from authorization.models import Account, STATUS_BANNED
from companies.models import Company


@require_GET
@moderator_required
def api_overview(request):
    pending_qs = Company.objects.filter(verification_status=Company.VERIF_PENDING).order_by('submitted_at')
    new_counts = _new_counts_by_target()

    new_reports_qs = Report.objects.filter(status=Report.STATUS_NEW)
    escalated_count = sum(
        1 for r in new_reports_qs
        if new_counts.get((r.target_type, r.target_id), 0) >= ESCALATION_THRESHOLD
    )

    recent_verifications = [serialize_verification(c) for c in pending_qs[:3]]
    recent_reports = [serialize_report(r, new_counts) for r in new_reports_qs]
    recent_reports.sort(key=lambda r: (not r['escalated'],))

    return JsonResponse({
        'ok': True,
        'stats': {
            'verify_pending': pending_qs.count(),
            'reports_new': new_reports_qs.count(),
            'reports_escalated': escalated_count,
            'users_total': Account.objects.count(),
            'banned': Account.objects.filter(status=STATUS_BANNED).count(),
        },
        'recent_verifications': recent_verifications,
        'recent_reports': recent_reports[:3],
        'threshold': ESCALATION_THRESHOLD,
    })
