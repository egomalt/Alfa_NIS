import json

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from authorization.models import ROLE_COMPANY
from authorization.views import get_current_account
from .models import Contest, ContestSubmission


def _get_company(request):
    account = get_current_account(request)
    if account is None or account.role != ROLE_COMPANY:
        return None, JsonResponse({'ok': False, 'message': 'Требуется авторизация'}, status=401)
    return account, None


def _contest_to_dict(c, full=False):
    d = {
        'id': c.id,
        'title': c.title,
        'excerpt': c.excerpt,
        'category': c.category,
        'level': c.level,
        'status': c.status,
        'deadline': c.deadline.isoformat() if c.deadline else None,
        'prize': c.prize,
        'submission_type': c.submission_type,
        'participants_count': c.participants_count,
        'created_at': c.created_at.isoformat(),
        'company_username': c.company_username,
    }
    if full:
        d['case_text'] = c.case_text
        d['rules'] = c.rules
        d['submission_hint'] = c.submission_hint
        d['attachments'] = [
            {'id': a.id, 'name': a.name, 'size': a.size, 'url': a.file.url}
            for a in c.attachments.all()
        ]
    return d


def _sub_to_dict(s):
    from authorization.models import Account
    from users.models import UserProfile
    email = ''
    skills = []
    bio = ''
    try:
        acc = Account.objects.get(username=s.candidate_username)
        email = acc.email or ''
    except Account.DoesNotExist:
        pass
    try:
        profile = UserProfile.objects.get(username=s.candidate_username)
        skills = profile.skills or []
        bio = profile.bio or ''
    except UserProfile.DoesNotExist:
        pass
    return {
        'id': s.id,
        'candidate_username': s.candidate_username,
        'candidate_name': s.candidate_name,
        'candidate_email': email,
        'candidate_skills': skills,
        'candidate_bio': bio,
        'file_url': s.file.url if s.file else None,
        'file_name': s.file.name.split('/')[-1] if s.file else None,
        'link': s.link,
        'text': s.text,
        'comment': s.comment,
        'status': s.status,
        'liked': s.liked,
        'winner': s.winner,
        'attempt': s.attempt,
        'submitted_at': s.created_at.strftime('%d.%m.%Y %H:%M'),
    }


@require_http_methods(['GET'])
def api_company_contests(request):
    account, err = _get_company(request)
    if err:
        return err
    qs = Contest.objects.filter(company_username=account.username)
    stats = {
        'total': qs.count(),
        'active': qs.filter(status='active').count(),
        'review': qs.filter(status='review').count(),
        'finished': qs.filter(status='finished').count(),
        'draft': qs.filter(status='draft').count(),
    }
    return JsonResponse({'ok': True, 'contests': [_contest_to_dict(c) for c in qs], 'stats': stats})


@require_http_methods(['POST'])
def api_contest_create(request):
    account, err = _get_company(request)
    if err:
        return err
    try:
        body = json.loads(request.body)
    except Exception:
        return JsonResponse({'ok': False, 'message': 'Неверный JSON'}, status=400)

    c = Contest(company_username=account.username)
    for field in ('title', 'excerpt', 'case_text', 'rules', 'category', 'level', 'prize', 'submission_type', 'submission_hint'):
        if field in body:
            setattr(c, field, body[field])
    if body.get('deadline'):
        from django.utils.dateparse import parse_datetime
        c.deadline = parse_datetime(body['deadline'])
    c.save()
    return JsonResponse({'ok': True, 'contest': _contest_to_dict(c)}, status=201)


@require_http_methods(['GET', 'PUT', 'DELETE'])
def api_contest_detail(request, contest_id):
    try:
        c = Contest.objects.get(id=contest_id)
    except Contest.DoesNotExist:
        return JsonResponse({'ok': False, 'message': 'Конкурс не найден'}, status=404)

    if request.method == 'GET':
        from companies.models import Company
        data = _contest_to_dict(c, full=True)
        try:
            co = Company.objects.get(username=c.company_username)
            data['company_name'] = co.name or c.company_username
        except Company.DoesNotExist:
            data['company_name'] = c.company_username
        return JsonResponse({'ok': True, 'contest': data})

    account, err = _get_company(request)
    if err:
        return err
    if c.company_username != account.username:
        return JsonResponse({'ok': False, 'message': 'Нет доступа'}, status=403)

    if request.method == 'DELETE':
        c.delete()
        return JsonResponse({'ok': True})

    try:
        body = json.loads(request.body)
    except Exception:
        return JsonResponse({'ok': False, 'message': 'Неверный JSON'}, status=400)

    for field in ('title', 'excerpt', 'case_text', 'rules', 'category', 'level', 'prize', 'submission_type', 'submission_hint'):
        if field in body:
            setattr(c, field, body[field])
    if 'deadline' in body:
        from django.utils.dateparse import parse_datetime
        c.deadline = parse_datetime(body['deadline']) if body['deadline'] else None
    c.save()
    return JsonResponse({'ok': True, 'contest': _contest_to_dict(c)})


@require_http_methods(['POST'])
def api_contest_publish(request, contest_id):
    account, err = _get_company(request)
    if err:
        return err
    try:
        c = Contest.objects.get(id=contest_id, company_username=account.username)
    except Contest.DoesNotExist:
        return JsonResponse({'ok': False, 'message': 'Не найден'}, status=404)
    c.status = 'active'
    c.save()
    return JsonResponse({'ok': True, 'contest': _contest_to_dict(c)})


@require_http_methods(['GET'])
def api_contest_submissions(request, contest_id):
    account, err = _get_company(request)
    if err:
        return err
    try:
        c = Contest.objects.get(id=contest_id, company_username=account.username)
    except Contest.DoesNotExist:
        return JsonResponse({'ok': False, 'message': 'Не найден'}, status=404)
    return JsonResponse({'ok': True, 'submissions': [_sub_to_dict(s) for s in c.submissions.all()]})


@require_http_methods(['PATCH'])
def api_submission_update(request, contest_id, sub_id):
    account, err = _get_company(request)
    if err:
        return err
    try:
        s = ContestSubmission.objects.get(
            id=sub_id, contest__id=contest_id, contest__company_username=account.username
        )
    except ContestSubmission.DoesNotExist:
        return JsonResponse({'ok': False, 'message': 'Не найдено'}, status=404)
    try:
        body = json.loads(request.body)
    except Exception:
        return JsonResponse({'ok': False, 'message': 'Неверный JSON'}, status=400)
    if body.get('status') in ('pending', 'accepted', 'rejected'):
        s.status = body['status']
        s.save()
    return JsonResponse({'ok': True, 'submission': _sub_to_dict(s)})


@require_http_methods(['POST'])
def api_submission_like(request, contest_id, sub_id):
    account, err = _get_company(request)
    if err:
        return err
    try:
        s = ContestSubmission.objects.get(
            id=sub_id, contest__id=contest_id, contest__company_username=account.username
        )
    except ContestSubmission.DoesNotExist:
        return JsonResponse({'ok': False, 'message': 'Не найдено'}, status=404)
    s.liked = not s.liked
    s.save()
    return JsonResponse({'ok': True, 'liked': s.liked})


@require_http_methods(['POST'])
def api_submission_winner(request, contest_id, sub_id):
    account, err = _get_company(request)
    if err:
        return err
    try:
        s = ContestSubmission.objects.get(
            id=sub_id, contest__id=contest_id, contest__company_username=account.username
        )
    except ContestSubmission.DoesNotExist:
        return JsonResponse({'ok': False, 'message': 'Не найдено'}, status=404)
    s.winner = not s.winner
    s.save()
    return JsonResponse({'ok': True, 'winner': s.winner})


@require_http_methods(['GET'])
def api_contests_catalog(request):
    qs = Contest.objects.filter(status__in=['active', 'finished', 'review'])
    if request.GET.get('status'):
        qs = qs.filter(status=request.GET['status'])
    if request.GET.get('category'):
        qs = qs.filter(category__iexact=request.GET['category'])

    from companies.models import Company
    company_names = {
        co.username: co.name or co.username
        for co in Company.objects.filter(username__in=qs.values_list('company_username', flat=True))
    }

    result = []
    for c in qs:
        d = _contest_to_dict(c)
        d['company_name'] = company_names.get(c.company_username, c.company_username)
        result.append(d)
    return JsonResponse({'ok': True, 'contests': result})


@require_http_methods(['POST'])
def api_contest_submit(request, contest_id):
    account = get_current_account(request)
    if account is None:
        return JsonResponse({'ok': False, 'message': 'Требуется авторизация'}, status=401)
    try:
        c = Contest.objects.get(id=contest_id, status='active')
    except Contest.DoesNotExist:
        return JsonResponse({'ok': False, 'message': 'Конкурс не найден или не активен'}, status=404)

    attempt = ContestSubmission.objects.filter(contest=c, candidate_username=account.username).count() + 1
    sub = ContestSubmission(
        contest=c,
        candidate_username=account.username,
        candidate_name=account.name or account.username,
        attempt=attempt,
    )

    if c.submission_type == 'file':
        f = request.FILES.get('file')
        if not f:
            return JsonResponse({'ok': False, 'message': 'Файл обязателен'}, status=400)
        sub.file = f
        sub.comment = request.POST.get('comment', '')
    elif c.submission_type == 'link':
        sub.link = request.POST.get('link', '')
        sub.comment = request.POST.get('comment', '')
    else:
        sub.text = request.POST.get('text', '')
        sub.comment = request.POST.get('comment', '')

    sub.save()
    c.participants_count = ContestSubmission.objects.filter(
        contest=c
    ).values('candidate_username').distinct().count()
    c.save(update_fields=['participants_count'])
    return JsonResponse({'ok': True, 'submission': _sub_to_dict(sub)}, status=201)


@require_http_methods(['GET'])
def api_my_submissions(request, contest_id):
    account = get_current_account(request)
    if account is None:
        return JsonResponse({'ok': True, 'submissions': []})
    subs = ContestSubmission.objects.filter(
        contest_id=contest_id, candidate_username=account.username
    )
    return JsonResponse({'ok': True, 'submissions': [_sub_to_dict(s) for s in subs]})


@require_http_methods(['GET'])
def api_user_contest_history(request):
    account = get_current_account(request)
    if account is None:
        return JsonResponse({'ok': True, 'submissions': []})
    subs = (
        ContestSubmission.objects
        .filter(candidate_username=account.username)
        .select_related('contest')
        .order_by('-created_at')
    )
    result = []
    for s in subs:
        c = s.contest
        result.append({
            'id': s.id,
            'contest_id': c.id,
            'contest_title': c.title,
            'company_username': c.company_username,
            'status': s.status,
            'winner': s.winner,
            'submitted_at': s.created_at.isoformat(),
        })
    return JsonResponse({'ok': True, 'submissions': result})


@require_http_methods(['GET'])
def api_user_public_contests(request, username):
    subs = (
        ContestSubmission.objects
        .filter(candidate_username=username)
        .select_related('contest')
        .order_by('-created_at')
    )
    result = []
    for s in subs:
        c = s.contest
        result.append({
            'id': s.id,
            'contest_id': c.id,
            'contest_title': c.title,
            'company_username': c.company_username,
            'status': s.status,
            'winner': s.winner,
            'submitted_at': s.created_at.isoformat(),
        })
    return JsonResponse({'ok': True, 'submissions': result})
