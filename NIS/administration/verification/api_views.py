import json

from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from administration.dashboard.views import moderator_required
from companies.models import Company

VALID_STATUSES = [Company.VERIF_PENDING, Company.VERIF_APPROVED, Company.VERIF_REJECTED]


def serialize_verification(company):
    return {
        'username': company.username,
        'name': company.name,
        'letter': (company.name or '?').strip()[:1].upper(),
        'industry': company.industry,
        'city': company.city,
        'document_url': company.registration_document.url if company.registration_document else '',
        'document_name': company.registration_document.name.split('/')[-1] if company.registration_document else '',
        'status': company.verification_status,
        'reason': company.verification_reason,
        'submitted_at': company.submitted_at.isoformat() if company.submitted_at else None,
    }


@require_GET
@moderator_required
def api_verifications(request):
    status = request.GET.get('status', Company.VERIF_PENDING)
    if status not in VALID_STATUSES:
        status = Company.VERIF_PENDING
    companies = Company.objects.filter(verification_status=status).order_by('submitted_at')
    return JsonResponse({'ok': True, 'verifications': [serialize_verification(c) for c in companies]})


@require_POST
@moderator_required
def api_verification_approve(request, username):
    company = get_object_or_404(Company, username=username)
    company.verification_status = Company.VERIF_APPROVED
    company.verification_reason = ''
    company.verified_at = timezone.now()
    company.save(update_fields=['verification_status', 'verification_reason', 'verified_at'])
    return JsonResponse({'ok': True, 'verification': serialize_verification(company)})


@require_POST
@moderator_required
def api_verification_reject(request, username):
    try:
        data = json.loads(request.body or '{}')
    except (ValueError, TypeError):
        data = {}
    reason = (data.get('reason') or '').strip()
    company = get_object_or_404(Company, username=username)
    company.verification_status = Company.VERIF_REJECTED
    company.verification_reason = reason or 'Причина не указана'
    company.verified_at = None
    company.save(update_fields=['verification_status', 'verification_reason', 'verified_at'])
    return JsonResponse({'ok': True, 'verification': serialize_verification(company)})
