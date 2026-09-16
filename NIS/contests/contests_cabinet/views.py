from django.http import Http404
from django.shortcuts import redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie

from authorization.models import ROLE_COMPANY, ROLE_USER
from companies.models import ensure_company
from core.auth import page_login_required
from core.uploads import MAX_DOCUMENT_SIZE

from .models import ContestSubmission


@ensure_csrf_cookie
@page_login_required(ROLE_USER)
def my_contests_user(request):
    """Раздел «Конкурсы» кабинета кандидата — история участия (единый сайдбарный вид)."""
    return render(request, 'contests/contests_cabinet/my_contests_user.html',
                  {'username': request.account.username, 'page': 'contests'})


@ensure_csrf_cookie
@page_login_required(ROLE_USER)
def my_contest_submission(request, sub_id):
    """Одно своё решение: что отправили и чем ответила компания.

    Страницу проверяем здесь же, а не только в API: чужой адрес должен
    отдавать 404 сразу, а не пустую оболочку с ошибкой внутри.
    """
    submission = (
        ContestSubmission.objects
        .filter(id=sub_id, candidate_username=request.account.username)
        .select_related('contest')
        .first()
    )
    if submission is None:
        raise Http404
    return render(request, 'contests/contests_cabinet/user_submission.html', {
        'username': request.account.username,
        'page': 'contests',
        # Панель рисует собственный скрипт страницы: четыре списочных
        # запроса кабинета здесь не нужны
        'panel': 'none',
        'submission_id': submission.id,
        'contest_title': submission.contest.title,
    })


@ensure_csrf_cookie
@page_login_required(ROLE_COMPANY)
def company_contests(request):
    # Как и раздел тестов: неподтверждённой компании тут делать нечего —
    # в сайдбаре на этом пункте висит замок, страница должна вести себя так же
    if not ensure_company(request.account).is_verified:
        return redirect('/cabinet/company/')
    return render(request, 'contests/contests_cabinet/company_contests.html', {
        'username': request.account.username,
        # page подсвечивает пункт сайдбара, panel='none' — у страницы свой скрипт,
        # профильную панель кабинета рисовать не нужно
        'page': 'contests',
        'panel': 'none',
    })


@ensure_csrf_cookie
@page_login_required(ROLE_COMPANY)
def contest_constructor(request, contest_id=None):
    return render(request, 'contests/contests_cabinet/contest_constructor.html', {
        'username': request.account.username,
        'contest_id': contest_id,
        # Лимит берём из того же места, где его проверяет сервер, — иначе
        # подсказка в интерфейсе снова разойдётся с реальным ограничением
        'max_attachment_mb': MAX_DOCUMENT_SIZE // (1024 * 1024),
    })


@ensure_csrf_cookie
@page_login_required(ROLE_COMPANY)
def contest_submissions(request, contest_id):
    if not ensure_company(request.account).is_verified:
        return redirect('/cabinet/company/')
    return render(request, 'contests/contests_cabinet/contest_submissions.html', {
        'username': request.account.username,
        'contest_id': contest_id,
        'page': 'contests',
        'panel': 'none',
    })
