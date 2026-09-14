from django.contrib.auth import authenticate, login, logout
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from core.utils import serialize_form_errors
from .forms import AccountLoginForm, AccountRegistrationForm
from .models import Account, ROLE_COMPANY, ROLE_MODERATOR, ROLE_USER
from companies.models import Company
from users.models import UserProfile


def get_current_account(request):
    """Текущий вошедший аккаунт или None.

    Единая точка входа для всех проверок в проекте — 36 мест по коду зовут именно её.
    Забаненных Django отсекает сам: `Account.is_active` завязан на состояние бана,
    и стандартный бэкенд сверяется с ним при каждом запросе.
    """
    if not request.user.is_authenticated:
        return None
    return request.user


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

    login(request, account, backend='django.contrib.auth.backends.ModelBackend')
    cabinet_url = '/cabinet/company/' if is_company else '/cabinet/user/'
    return JsonResponse({'ok': True, 'next_url': cabinet_url}, status=201)


def _ban_message(account):
    if account.ban_until is None:
        message = 'Аккаунт заблокирован навсегда.'
    else:
        message = f'Аккаунт заблокирован до {account.ban_until.strftime("%d.%m.%Y")}.'
    if account.ban_reason:
        message += f' Причина: {account.ban_reason}'
    return message


def _cabinet_url(account):
    if account.role == ROLE_MODERATOR:
        return '/administration/'
    if account.role == ROLE_COMPANY:
        return '/cabinet/company/'
    return '/cabinet/user/'


@require_POST
def api_login(request):
    form = AccountLoginForm(request.POST)
    if not form.is_valid():
        return JsonResponse({'ok': False, 'errors': serialize_form_errors(form)}, status=400)

    username = form.cleaned_data['username'].strip().lower()
    password = form.cleaned_data['password']

    account = Account.objects.filter(username__iexact=username).first()
    if account is not None:
        # Истёкший бан снимаем заранее, иначе Django сочтёт аккаунт неактивным и не пустит
        account.refresh_ban_state()

    # Забаненному authenticate откажет сам: Account.is_active завязан на состояние бана
    user = authenticate(request, username=account.username if account else username, password=password)

    if user is None:
        # Ошибки уровня формы отдаём как message, а не привязываем к полю: это
        # не «поле заполнено неверно», а состояние аккаунта или пары логин-пароль.
        if account is not None and account.is_banned and account.check_password(password):
            return JsonResponse({'ok': False, 'message': _ban_message(account), 'code': 'banned'}, status=403)
        # Один и тот же ответ на «нет такого аккаунта» и «неверный пароль»,
        # иначе по коду ответа можно перебором узнать, какие логины существуют.
        return JsonResponse(
            {'ok': False, 'message': 'Неверное имя пользователя или пароль.', 'code': 'invalid_credentials'},
            status=401,
        )

    # login() сам выдаёт новый идентификатор сессии — защита от session fixation
    login(request, user)
    return JsonResponse({'ok': True, 'next_url': _cabinet_url(user)})


@require_POST
def api_logout(request):
    logout(request)
    return JsonResponse({'ok': True})


@require_GET
def api_me(request):
    account = get_current_account(request)
    if not account:
        return JsonResponse({'ok': True, 'account': None})

    avatar = None
    if account.role == ROLE_USER:
        profile = UserProfile.objects.filter(username=account.username).first()
        if profile and profile.avatar:
            avatar = profile.avatar.url
    elif account.role == ROLE_COMPANY:
        company = Company.objects.filter(username=account.username).first()
        if company and company.avatar:
            avatar = company.avatar.url

    return JsonResponse({
        'ok': True,
        'account': {
            'username': account.username,
            'name': account.name,
            'role': account.role,
            'email': account.email or '',
            'avatar': avatar,
            'profile_url': _cabinet_url(account),
        },
    })
