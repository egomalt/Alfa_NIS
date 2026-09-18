from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from core.auth import moderator_required
from core.pagination import paginate
from core.utils import load_json_body
from companies.models import Company

VALID_STATUSES = [Company.VERIF_PENDING, Company.VERIF_APPROVED, Company.VERIF_REJECTED]

VERIFICATIONS_PER_PAGE = 20


def serialize_verification(company):
    has_document = bool(company.registration_document)
    return {
        'username': company.username,
        'name': company.name,
        'letter': (company.name or '?').strip()[:1].upper(),
        'industry': company.industry,
        'city': company.city,
        # Ссылка ведёт на вьюху под проверкой роли, а не на путь в /media/
        'document_url': f'/administration/verification/{company.username}/document/' if has_document else '',
        'document_name': company.registration_document.name.split('/')[-1] if has_document else '',
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
    qs = Company.objects.filter(verification_status=status).order_by('submitted_at')
    companies, page_meta = paginate(request, qs, VERIFICATIONS_PER_PAGE)
    return JsonResponse({
        'ok': True,
        'verifications': [serialize_verification(c) for c in companies],
        **page_meta,
    })


def _pending_or_error(company):
    """Решение принимается только по заявке, которая ждёт проверки."""
    if company.verification_status != Company.VERIF_PENDING:
        return JsonResponse(
            {'ok': False, 'message': 'Заявка уже рассмотрена или документ не подан.'},
            status=400,
        )
    return None


@require_POST
@moderator_required
def api_verification_approve(request, username):
    company = get_object_or_404(Company, username=username)
    error = _pending_or_error(company)
    if error is not None:
        return error
    company.verification_status = Company.VERIF_APPROVED
    company.verification_reason = ''
    company.verified_at = timezone.now()
    company.save(update_fields=['verification_status', 'verification_reason', 'verified_at'])
    return JsonResponse({'ok': True, 'verification': serialize_verification(company)})


@require_POST
@moderator_required
def api_verification_reject(request, username):
    data = load_json_body(request)
    reason = (data.get('reason') or '').strip()
    company = get_object_or_404(Company, username=username)
    error = _pending_or_error(company)
    if error is not None:
        return error
    company.verification_status = Company.VERIF_REJECTED
    company.verification_reason = reason or 'Причина не указана'
    company.verified_at = None
    company.save(update_fields=['verification_status', 'verification_reason', 'verified_at'])
    return JsonResponse({'ok': True, 'verification': serialize_verification(company)})
