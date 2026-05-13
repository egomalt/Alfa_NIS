from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .forms import CompanyProfileForm, CompanyVerificationForm
from .models import Company
from users.models import Account

ROLE_COMPANY = 'company'
ROLE_USER = 'user'


@ensure_csrf_cookie
def app_shell(request, username):
    try:
        account = Account.objects.using('user_profile').get(username=username)
    except Account.DoesNotExist:
        raise Http404

    if account.role == ROLE_USER:
        return render(request, 'users/dashboard.html', {
            'app_path': request.path,
            'username': username,
            'page': 'dashboard',
        })

    # Company view — auto-create profile if Account exists but Company record was lost
    company, _ = Company.objects.get_or_create(
        username=username,
        defaults={'name': account.name, 'contact_email': account.email},
    )

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


def _serialize_form_errors(form):
    return {field: errors.get_json_data() for field, errors in form.errors.items()}


@csrf_exempt
@require_POST
def api_create_company(request):
    username = request.POST.get('username', '').strip().lower()
    name = request.POST.get('name', '').strip()
    contact_email = request.POST.get('contact_email', '').strip()

    if not username or not name:
        return JsonResponse({'ok': False, 'error': 'Missing required fields'}, status=400)

    if Company.objects.filter(username=username).exists():
        return JsonResponse({'ok': False, 'error': 'Company already exists'}, status=409)

    company = Company.objects.create(username=username, name=name, contact_email=contact_email)
    return JsonResponse({'ok': True, 'id': company.id}, status=201)


@require_GET
def api_company_detail(request, username):
    company = get_object_or_404(Company, username=username)
    return JsonResponse({'ok': True, 'company': _serialize_company(company)})


@require_http_methods(['POST'])
def api_company_profile(request, username):
    company = get_object_or_404(Company, username=username)
    form = CompanyProfileForm(request.POST, request.FILES, instance=company)
    if not form.is_valid():
        return JsonResponse({'ok': False, 'errors': _serialize_form_errors(form)}, status=400)

    company = form.save()
    return JsonResponse({'ok': True, 'company': _serialize_company(company)})


@require_http_methods(['POST'])
def api_company_verification(request, username):
    company = get_object_or_404(Company, username=username)
    form = CompanyVerificationForm(request.POST, request.FILES, instance=company)
    if not form.is_valid():
        return JsonResponse({'ok': False, 'errors': _serialize_form_errors(form)}, status=400)

    company = form.save()
    return JsonResponse({'ok': True, 'company': _serialize_company(company), 'next_url': f'/{company.username}/'})


@require_GET
def api_company_tests(request, username):
    company = get_object_or_404(Company, username=username)
    if not company.is_verified:
        return JsonResponse(
            {
                'ok': False,
                'message': 'Сначала подтвердите компанию, чтобы открыть раздел тестов.',
                'next_url': f'/{company.username}/',
            },
            status=403,
        )

    return JsonResponse({
        'ok': True,
        'company': _serialize_company(company),
        'tests': [],
        'stats': {'total_tests': 0, 'active_tests': 0, 'submissions': 0, 'completion_rate': 0},
    })
