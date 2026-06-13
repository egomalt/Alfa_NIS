from django.shortcuts import redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie


@ensure_csrf_cookie
def tests_cabinet(request):
    from authorization.models import ROLE_COMPANY, ROLE_USER
    from authorization.views import get_current_account
    account = get_current_account(request)
    if account is None:
        return redirect('/authorization/signup/')

    if account.role == ROLE_COMPANY:
        from companies.models import Company
        company, _ = Company.objects.get_or_create(
            username=account.username,
            defaults={'name': account.name, 'contact_email': account.email},
        )
        if not company.is_verified:
            return redirect('/cabinet/company/')
        context = {
            'role': 'company',
            'page_bootstrap': 'tests',
            'page_title': 'Тесты компании',
            'page_heading': 'Тесты и оценки',
            'page_subheading': 'Управляйте тестами и следите за результатами кандидатов',
            'empty_text': 'Создайте первый тест, чтобы начать оценку кандидатов',
        }
    elif account.role == ROLE_USER:
        context = {
            'role': 'user',
            'page_bootstrap': 'user_tests',
            'page_title': 'Мои тесты',
            'page_heading': 'Мои тесты',
            'page_subheading': 'Управляйте тестами и следите за прохождениями',
            'empty_text': 'Создайте первый тест в конструкторе',
        }
    else:
        return redirect('/')

    return render(request, 'tests_cabinet/tests_page.html', {'username': account.username, **context})
