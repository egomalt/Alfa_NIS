from django.http import Http404
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie

from authorization.models import Account, ROLE_COMPANY, ROLE_USER
from companies.models import Company


@ensure_csrf_cookie
def profile_view(request, username):
    try:
        account = Account.objects.get(username=username)
    except Account.DoesNotExist:
        raise Http404

    if account.role == ROLE_COMPANY:
        try:
            company = Company.objects.get(username=username)
        except Company.DoesNotExist:
            raise Http404
        if not company.is_verified:
            raise Http404
        return render(request, 'profiles/company.html', {'username': username})

    if account.role == ROLE_USER:
        return render(request, 'profiles/user.html', {'username': username})

    raise Http404


@ensure_csrf_cookie
def company_contests_view(request, username):
    try:
        company = Company.objects.get(username=username)
    except Company.DoesNotExist:
        raise Http404
    if not company.is_verified:
        raise Http404
    return render(request, 'profiles/company_contests.html', {'username': username})


@ensure_csrf_cookie
def company_tests_view(request, username):
    """Все опубликованные тесты компании — публичный аналог списка конкурсов."""
    try:
        company = Company.objects.get(username=username)
    except Company.DoesNotExist:
        raise Http404
    if not company.is_verified:
        raise Http404
    return render(request, 'profiles/company_tests.html', {'username': username})


@ensure_csrf_cookie
def user_articles_view(request, username):
    if not Account.objects.filter(username=username, role=ROLE_USER).exists():
        raise Http404
    return render(request, 'profiles/user_articles.html', {'username': username})
