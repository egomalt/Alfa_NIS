from django.shortcuts import redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie

from authorization.models import ROLE_COMPANY, ROLE_USER
from core.auth import page_login_required
from companies.models import ensure_company


@page_login_required()
def cabinet_root(request):
    if request.account.role == ROLE_COMPANY:
        return redirect('/cabinet/company/')
    if request.account.role == ROLE_USER:
        return redirect('/cabinet/user/')
    return redirect('/')


_COMPANY_TEMPLATES = {
    'profile': 'cabinet/company_profile.html',
    'stats': 'cabinet/company_statistics.html',
    'settings': 'cabinet/company_settings.html',
}


def _company_cabinet_page(request, page):
    account = request.account
    ensure_company(account)
    return render(request, _COMPANY_TEMPLATES[page], {'username': account.username, 'page': page})


@ensure_csrf_cookie
@page_login_required(ROLE_COMPANY)
def company_cabinet(request):
    return _company_cabinet_page(request, 'profile')


@ensure_csrf_cookie
@page_login_required(ROLE_COMPANY)
def company_statistics(request):
    return _company_cabinet_page(request, 'stats')


@ensure_csrf_cookie
@page_login_required(ROLE_COMPANY)
def company_settings(request):
    return _company_cabinet_page(request, 'settings')


_USER_TEMPLATES = {
    'profile': 'cabinet/user_profile.html',
    'stats': 'cabinet/user_statistics.html',
    'settings': 'cabinet/user_settings.html',
}


@ensure_csrf_cookie
@page_login_required(ROLE_USER)
def user_cabinet(request, page='profile'):
    template = _USER_TEMPLATES.get(page, _USER_TEMPLATES['profile'])
    return render(request, template, {'username': request.account.username, 'page': page})
