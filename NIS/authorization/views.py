from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from core.utils import serialize_form_errors
from .forms import AccountLoginForm, AccountRegistrationForm
from .models import Account, ROLE_COMPANY, ROLE_USER

SESSION_KEY = 'account_username'


def get_current_account(request):
    username = request.session.get(SESSION_KEY)
    if not username:
        return None
    return Account.objects.filter(username=username).first()


@ensure_csrf_cookie
def accounts_shell(request):
    if request.path.endswith('/signin/'):
        template_name = 'authorization/signin.html'
        page = 'signin'
    else:
        template_name = 'authorization/signup.html'
        page = 'signup'
    return render(request, template_name, {'app_path': request.path, 'page': page})


@require_POST
def api_register(request):
    from companies.models import Company
    from users.models import UserProfile

    form = AccountRegistrationForm(request.POST)
    if not form.is_valid():
        return JsonResponse({'ok': False, 'errors': serialize_form_errors(form)}, status=400)

    role = request.POST.get('role', 'candidate')
    is_company = role == 'company'

    with transaction.atomic():
        account = form.save(commit=False)
        account.role = ROLE_COMPANY if is_company else ROLE_USER
        account.save()

        if is_company:
            Company.objects.create(
                username=account.username,
                name=account.name,
                contact_email=account.email,
            )
        else:
            UserProfile.objects.create(username=account.username)

    request.session[SESSION_KEY] = account.username
    cabinet_url = '/cabinet/company/' if is_company else '/cabinet/user/'
    return JsonResponse({'ok': True, 'next_url': cabinet_url}, status=201)


def _cabinet_url(account):
    if account.role == ROLE_COMPANY:
        return '/cabinet/company/'
    return '/cabinet/user/'


@require_POST
def api_login(request):
    form = AccountLoginForm(request.POST)
    if not form.is_valid():
        return JsonResponse({'ok': False, 'errors': serialize_form_errors(form)}, status=400)

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

    request.session[SESSION_KEY] = account.username
    return JsonResponse({'ok': True, 'next_url': _cabinet_url(account)})


@require_POST
def api_logout(request):
    request.session.flush()
    return JsonResponse({'ok': True})


@require_GET
def api_me(request):
    account = get_current_account(request)
    if not account:
        return JsonResponse({'ok': True, 'account': None})

    avatar = None
    if account.role == ROLE_USER:
        from users.models import UserProfile
        profile = UserProfile.objects.filter(username=account.username).first()
        if profile and profile.avatar:
            avatar = profile.avatar.url
    elif account.role == ROLE_COMPANY:
        from companies.models import Company
        company = Company.objects.filter(username=account.username).first()
        if company and company.avatar:
            avatar = company.avatar.url

    return JsonResponse({
        'ok': True,
        'account': {
            'username': account.username,
            'name': account.name,
            'role': account.role,
            'avatar': avatar,
            'profile_url': _cabinet_url(account),
        },
    })
