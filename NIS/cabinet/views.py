from django.shortcuts import redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie

from authorization.models import ROLE_COMPANY, ROLE_USER
from authorization.views import get_current_account


def cabinet_root(request):
    account = get_current_account(request)
    if account is None:
        return redirect('/authorization/signup/')
    if account.role == ROLE_COMPANY:
        return redirect('/cabinet/company/')
    if account.role == ROLE_USER:
        return redirect('/cabinet/user/')
    return redirect('/')


_COMPANY_TEMPLATES = {
    'profile': 'cabinet/company_profile.html',
    'stats': 'cabinet/company_statistics.html',
    'settings': 'cabinet/company_settings.html',
}


def _company_cabinet_page(request, page):
    account = get_current_account(request)
    if account is None or account.role != ROLE_COMPANY:
        return redirect('/authorization/signup/')
    from companies.models import Company
    Company.objects.get_or_create(
        username=account.username,
        defaults={'name': account.name, 'contact_email': account.email},
    )
    return render(request, _COMPANY_TEMPLATES[page], {'username': account.username, 'page': page})


@ensure_csrf_cookie
def company_cabinet(request):
    return _company_cabinet_page(request, 'profile')


@ensure_csrf_cookie
def company_statistics(request):
    return _company_cabinet_page(request, 'stats')


@ensure_csrf_cookie
def company_settings(request):
    return _company_cabinet_page(request, 'settings')


_USER_TEMPLATES = {
    'profile': 'cabinet/user_profile.html',
    'stats': 'cabinet/user_statistics.html',
    'settings': 'cabinet/user_settings.html',
}


@ensure_csrf_cookie
def user_cabinet(request, page='profile'):
    account = get_current_account(request)
    if account is None or account.role != ROLE_USER:
        return redirect('/authorization/signup/')
    template = _USER_TEMPLATES.get(page, _USER_TEMPLATES['profile'])
    return render(request, template, {'username': account.username, 'page': page})
