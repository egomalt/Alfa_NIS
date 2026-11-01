from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_safe

from authorization.models import ROLE_COMPANY, ROLE_MODERATOR, ROLE_USER
from companies.models import ensure_company
from core.auth import page_login_required
from core.uploads import MAX_DOCUMENT_SIZE

from .models import ContestSubmission


@require_safe
@page_login_required()
def submission_file(request, sub_id):
    submission = get_object_or_404(ContestSubmission.objects.select_related('contest'), id=sub_id)
    account = request.account
    is_author = account.role == ROLE_USER and account.username == submission.candidate_username
    is_company = account.role == ROLE_COMPANY and account.username == submission.contest.company_username
    if account.role != ROLE_MODERATOR and not is_author and not is_company:
        raise Http404
    if not submission.file:
        raise Http404
    try:
        document = submission.file.open('rb')
    except FileNotFoundError as error:
        raise Http404 from error
    response = FileResponse(
        document,
        as_attachment=True,
        content_type='application/octet-stream',
        filename=submission.file.name.split('/')[-1],
    )
    response['Cache-Control'] = 'private, no-store'
    return response


@ensure_csrf_cookie
@page_login_required(ROLE_USER)
def my_contests_user(request):
    """Раздел «Конкурсы» кабинета кандидата — история участия."""
    return render(
        request, 'contests/contests_cabinet/my_contests_user.html', {'username': request.account.username, 'page': 'contests'}
    )


@ensure_csrf_cookie
@page_login_required(ROLE_USER)
def my_contest_submission(request, sub_id):
    """Одно своё решение. Чужой адрес отдаёт 404 сразу, а не пустую оболочку."""
    submission = (
        ContestSubmission.objects.filter(id=sub_id, candidate_username=request.account.username).select_related('contest').first()
    )
    if submission is None:
        raise Http404
    return render(
        request,
        'contests/contests_cabinet/user_submission.html',
        {
            'username': request.account.username,
            'page': 'contests',
            'panel': 'none',
            'submission_id': submission.id,
            'contest_title': submission.contest.title,
        },
    )


@ensure_csrf_cookie
@page_login_required(ROLE_COMPANY)
def company_contests(request):
    # Неподтверждённой компании раздел закрыт — в сайдбаре на нём висит замок
    if not ensure_company(request.account).is_verified:
        return redirect('company_cabinet')
    return render(
        request,
        'contests/contests_cabinet/company_contests.html',
        {
            'username': request.account.username,
            # page подсвечивает пункт сайдбара, panel='none' — у страницы свой скрипт
            'page': 'contests',
            'panel': 'none',
        },
    )


@ensure_csrf_cookie
@page_login_required(ROLE_COMPANY)
def contest_constructor(request, contest_id=None):
    if not ensure_company(request.account).is_verified:
        return redirect('company_cabinet')
    return render(
        request,
        'contests/contests_cabinet/contest_constructor.html',
        {
            'username': request.account.username,
            'contest_id': contest_id,
            # Лимит берём оттуда же, где его проверяет сервер
            'max_attachment_mb': MAX_DOCUMENT_SIZE // (1024 * 1024),
        },
    )


@ensure_csrf_cookie
@page_login_required(ROLE_COMPANY)
def contest_submissions(request, contest_id):
    if not ensure_company(request.account).is_verified:
        return redirect('company_cabinet')
    return render(
        request,
        'contests/contests_cabinet/contest_submissions.html',
        {
            'username': request.account.username,
            'contest_id': contest_id,
            'page': 'contests',
            'panel': 'none',
        },
    )
