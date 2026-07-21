import json

from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET, require_POST

from administration.dashboard.views import moderator_required
from .models import ESCALATION_THRESHOLD, Report

VALID_STATUSES = [Report.STATUS_NEW, Report.STATUS_RESOLVED, Report.STATUS_DISMISSED]

TARGET_LABELS = dict(Report.TARGET_CHOICES)


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


@require_GET
@moderator_required
def api_reports(request):
    status = request.GET.get('status', Report.STATUS_NEW)
    if status not in VALID_STATUSES:
        status = Report.STATUS_NEW
    new_counts = _new_counts_by_target()
    reports = Report.objects.filter(status=status)
    data = [serialize_report(r, new_counts) for r in reports]
    # Эскалированные — выше
    data.sort(key=lambda r: (not r['escalated'],))
    return JsonResponse({'ok': True, 'reports': data, 'threshold': ESCALATION_THRESHOLD})


@require_POST
@moderator_required
def api_report_resolve(request, report_id):
    report = get_object_or_404(Report, id=report_id)
    report.status = Report.STATUS_RESOLVED
    report.save(update_fields=['status'])
    return JsonResponse({'ok': True})


@require_POST
@moderator_required
def api_report_dismiss(request, report_id):
    report = get_object_or_404(Report, id=report_id)
    report.status = Report.STATUS_DISMISSED
    report.save(update_fields=['status'])
    return JsonResponse({'ok': True})
