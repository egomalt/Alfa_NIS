from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods

from authorization.models import Account, ROLE_USER
from core.utils import serialize_form_errors

from .forms import CompanyProfileForm, CompanyVerificationForm
from .models import Company


@ensure_csrf_cookie
def app_shell(request, username):
    from authorization.views import get_current_account

    try:
        account = Account.objects.get(username=username)
    except Account.DoesNotExist:
        raise Http404

    if account.role == ROLE_USER:
        return render(request, 'users/dashboard.html', {
            'app_path': request.path,
            'username': username,
            'page': 'dashboard',
        })

    company, _ = Company.objects.get_or_create(
        username=username,
        defaults={'name': account.name, 'contact_email': account.email},
    )

    current = get_current_account(request)
    is_owner = current is not None and current.username == username

    # Unverified companies are only visible to their owner
    if not company.is_verified and not is_owner:
        raise Http404

    if request.path.endswith('/tests/') and not company.is_verified:
        return redirect('company_profile_page', username=username)

    template_name = 'companies/tests.html' if request.path.endswith('/tests/') else 'companies/profile.html'
    page = 'tests' if request.path.endswith('/tests/') else 'profile'

    return render(request, template_name, {
        'app_path': request.path,
        'company_username': username,
        'page': page,
    })


def _serialize_company(company):
    return {
        'id': company.id,
        'username': company.username,
        'name': company.name,
        'description': company.description,
        'contact_email': company.contact_email,
        'phone': company.phone,
        'website': company.website,
        'address': company.address,
        'city': company.city,
        'company_size': company.company_size,
        'industry': company.industry,
        'avatar_url': company.avatar.url if company.avatar else '',
        'registration_document_url': company.registration_document.url if company.registration_document else '',
        'direction_1': company.direction_1,
        'direction_2': company.direction_2,
        'direction_3': company.direction_3,
        'direction_4': company.direction_4,
        'directions': [d for d in [company.direction_1, company.direction_2, company.direction_3, company.direction_4] if d],
        'created_at': company.created_at.isoformat(),
        'updated_at': company.updated_at.isoformat(),
        'is_verified': company.is_verified,
    }



@require_GET
def api_companies_list(request):
    from django.db.models import Count
    from tests.constructor.models import Test

    companies = Company.objects.exclude(registration_document='').order_by('-created_at')
    counts = (
        Test.objects.filter(status=Test.STATUS_PUBLISHED)
        .values('company_username')
        .annotate(cnt=Count('id'))
    )
    published_counts = {row['company_username']: row['cnt'] for row in counts}

    result = [
        {
            'username': c.username,
            'name': c.name,
            'description': c.description,
            'avatar_url': c.avatar.url if c.avatar else '',
            'is_verified': c.is_verified,
            'industry': c.industry,
            'city': c.city,
            'tests_count': published_counts.get(c.username, 0),
            'profile_url': f'/{c.username}/',
        }
        for c in companies
    ]

    return JsonResponse({'ok': True, 'companies': result})


@require_GET
def api_company_detail(request, username):
    from authorization.views import get_current_account
    company = get_object_or_404(Company, username=username)
    current = get_current_account(request)
    is_owner = current is not None and current.username == username
    return JsonResponse({'ok': True, 'company': _serialize_company(company), 'is_owner': is_owner})


@require_http_methods(['POST'])
def api_company_profile(request, username):
    from authorization.views import get_current_account
    company = get_object_or_404(Company, username=username)
    current = get_current_account(request)
    if current is None or current.username != username:
        return JsonResponse({'ok': False, 'message': 'Нет доступа.'}, status=403)
    form = CompanyProfileForm(request.POST, request.FILES, instance=company)
    if not form.is_valid():
        return JsonResponse({'ok': False, 'errors': serialize_form_errors(form)}, status=400)
    company = form.save()
    return JsonResponse({'ok': True, 'company': _serialize_company(company)})


@require_http_methods(['POST'])
def api_company_verification(request, username):
    company = get_object_or_404(Company, username=username)
    form = CompanyVerificationForm(request.POST, request.FILES, instance=company)
    if not form.is_valid():
        return JsonResponse({'ok': False, 'errors': serialize_form_errors(form)}, status=400)
    company = form.save()
    return JsonResponse({'ok': True, 'company': _serialize_company(company), 'next_url': '/cabinet/company/'})


@require_GET
def api_company_tests(request, username):
    from tests.constructor.models import Test
    from authorization.views import get_current_account

    company = get_object_or_404(Company, username=username)
    current = get_current_account(request)
    is_owner = current is not None and current.username == username

    if not company.is_verified:
        return JsonResponse(
            {
                'ok': False,
                'message': 'Сначала подтвердите компанию, чтобы открыть раздел тестов.',
                'next_url': '/cabinet/company/',
            },
            status=403,
        )

    tests = Test.objects.filter(company_username=username)
    total = tests.count()
    active = tests.filter(status=Test.STATUS_PUBLISHED).count()
    submissions = sum(t.stats.get('submissions', 0) for t in tests)

    serialized = [
        {
            'id': t.id,
            'title': t.title,
            'status': t.status,
            'page_count': t.pages.count(),
            'submissions': t.stats.get('submissions', 0),
            'created_at': t.created_at.isoformat(),
            'url': f'/tests/{t.id}/' if t.status == t.STATUS_PUBLISHED else f'/constructor/{t.id}/?company={username}',
            'edit_url': f'/constructor/{t.id}/',
        }
        for t in tests
    ]

    return JsonResponse({
        'ok': True,
        'company': _serialize_company(company),
        'is_owner': is_owner,
        'tests': serialized,
        'stats': {
            'total_tests': total,
            'active_tests': active,
            'submissions': submissions,
            'completion_rate': round(active / total * 100) if total else 0,
        },
    })
