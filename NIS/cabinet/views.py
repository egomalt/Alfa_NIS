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


@ensure_csrf_cookie
def company_cabinet(request):
    account = get_current_account(request)
    if account is None or account.role != ROLE_COMPANY:
        return redirect('/authorization/signup/')
    from companies.models import Company
    Company.objects.get_or_create(
        username=account.username,
        defaults={'name': account.name, 'contact_email': account.email},
    )
    return render(request, 'cabinet/company.html', {'username': account.username, 'page': 'profile'})


@ensure_csrf_cookie
def company_tests_cabinet(request):
    account = get_current_account(request)
    if account is None or account.role != ROLE_COMPANY:
        return redirect('/authorization/signup/')
    from companies.models import Company
    company, _ = Company.objects.get_or_create(
        username=account.username,
        defaults={'name': account.name, 'contact_email': account.email},
    )
    if not company.is_verified:
        return redirect('/cabinet/company/')
    return render(request, 'cabinet/tests_page.html', {
        'username': account.username,
        'role': 'company',
        'page_bootstrap': 'tests',
        'page_title': 'Тесты компании',
        'page_heading': 'Тесты и оценки',
        'page_subheading': 'Управляйте тестами и следите за результатами кандидатов',
        'empty_text': 'Создайте первый тест, чтобы начать оценку кандидатов',
    })


@ensure_csrf_cookie
def user_cabinet(request):
    account = get_current_account(request)
    if account is None or account.role != ROLE_USER:
        return redirect('/authorization/signup/')
    return render(request, 'cabinet/user.html', {'username': account.username})


@ensure_csrf_cookie
def user_articles_cabinet(request):
    account = get_current_account(request)
    if account is None or account.role != ROLE_USER:
        return redirect('/authorization/signup/')
    return render(request, 'cabinet/user_articles.html', {'username': account.username})
