import urllib.parse
import urllib.request

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST

from .forms import AccountLoginForm, AccountRegistrationForm
from .models import Account, ROLE_COMPANY


@ensure_csrf_cookie
def accounts_shell(request):
    if request.path.endswith('/signin/'):
        template_name = 'authorization/signin.html'
        page = 'signin'
    else:
        template_name = 'authorization/signup.html'
        page = 'signup'

    return render(request, template_name, {'app_path': request.path, 'page': page})


def _serialize_form_errors(form):
    return {field: errors.get_json_data() for field, errors in form.errors.items()}


def _create_company_profile(username, name, email):
    url = 'http://cabinet_service:8001/api/companies/create/'
    data = urllib.parse.urlencode({'username': username, 'name': name, 'contact_email': email}).encode()
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    req.add_header('Host', 'localhost')
    urllib.request.urlopen(req, timeout=5)


@require_POST
def api_register_company(request):
    form = AccountRegistrationForm(request.POST)
    if not form.is_valid():
        return JsonResponse({'ok': False, 'errors': _serialize_form_errors(form)}, status=400)

    account = form.save(commit=False)
    account.role = ROLE_COMPANY
    account.save()

    try:
        _create_company_profile(account.username, account.name, account.email)
    except Exception:
        account.delete()
        return JsonResponse(
            {
                'ok': False,
                'errors': {
                    '__all__': [{'message': 'Не удалось создать профиль. Попробуйте позже.', 'code': 'profile_error'}]
                },
            },
            status=500,
        )

    return JsonResponse({'ok': True, 'next_url': f'/{account.username}/'}, status=201)


@require_POST
def api_login_company(request):
    form = AccountLoginForm(request.POST)
    if not form.is_valid():
        return JsonResponse({'ok': False, 'errors': _serialize_form_errors(form)}, status=400)

    username = form.cleaned_data['username'].strip().lower()
    account = Account.objects.filter(username__iexact=username).first()

    if not account:
        return JsonResponse(
            {
                'ok': False,
                'errors': {
                    'username': [{'message': 'Аккаунт с таким именем не найден.', 'code': 'not_found'}]
                },
            },
            status=404,
        )

    if account.role != ROLE_COMPANY:
        return JsonResponse(
            {
                'ok': False,
                'errors': {
                    'username': [{'message': 'У этого аккаунта нет роли компании.', 'code': 'wrong_role'}]
                },
            },
            status=403,
        )

    return JsonResponse({'ok': True, 'next_url': f'/{account.username}/'})
