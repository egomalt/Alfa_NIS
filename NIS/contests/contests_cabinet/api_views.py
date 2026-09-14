from django.core.exceptions import ValidationError
from django.core.validators import URLValidator
from django.db import transaction
from django.db.models import Count
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.http import require_http_methods

from authorization.models import Account, ROLE_COMPANY, ROLE_USER
from authorization.views import get_current_account
from companies.models import Company
from core.auth import api_login_required
from core.pagination import paginate
from core.uploads import UploadError, human_size, validate_attachment
from core.utils import load_json_body
from users.models import UserProfile
from .models import Contest, ContestAttachment, ContestSubmission

MAX_ATTACHMENTS = 10
CATALOG_PER_PAGE = 100
MAX_SUBMISSION_ATTEMPTS = 1   # столько же показывает страница конкурса
MAX_TEXT_LENGTH = 20000
MAX_COMMENT_LENGTH = 2000


def _parse_deadline(raw_value):
    """Дата из запроса. parse_datetime кидает ValueError на «2024-13-45» — ловим."""
    if not raw_value:
        return None
    try:
        return parse_datetime(raw_value)
    except ValueError:
        return None


def _attachment_to_dict(attachment):
    return {
        'id': attachment.id,
        'name': attachment.name,
        'size': attachment.size,
        'size_display': human_size(attachment.size),
        'url': attachment.file.url if attachment.file else '',
    }


def _contest_to_dict(c, full=False, submissions_count=None):
    """Карточка конкурса.

    submissions_count интерфейс читает в трёх местах, а сервер его не отдавал —
    везде показывался ноль. Считаем одним запросом на список, а не в цикле.
    """
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
        'submissions_count': (
            submissions_count if submissions_count is not None else c.submissions.count()
        ),
    }
    if full:
        d['case_text'] = c.case_text
        d['rules'] = c.rules
        d['submission_hint'] = c.submission_hint
        d['attachments'] = [_attachment_to_dict(a) for a in c.attachments.all()]
    return d


def _candidate_cards(usernames):
    """Карточки кандидатов одним запросом на модель.

    Раньше _sub_to_dict ходил в базу дважды на каждую заявку: 50 работ — 101 запрос.
    """
    usernames = list({u for u in usernames if u})
    emails = dict(Account.objects.filter(username__in=usernames).values_list('username', 'email'))
    profiles = {
        p.username: p for p in UserProfile.objects.filter(username__in=usernames)
    }
    cards = {}
    for username in usernames:
        profile = profiles.get(username)
        cards[username] = {
            'email': emails.get(username) or '',
            'phone': (profile.phone if profile else None) or '',
            'skills': (profile.skills if profile else None) or [],
            'bio': (profile.bio if profile else None) or '',
        }
    return cards


def _sub_to_dict(s, cards=None):
    card = (cards or {}).get(s.candidate_username)
    if card is None:
        card = _candidate_cards([s.candidate_username])[s.candidate_username]
    email, skills, bio = card['email'], card['skills'], card['bio']
    return {
        'id': s.id,
        'candidate_username': s.candidate_username,
        'candidate_name': s.candidate_name,
        'candidate_email': email,
        'candidate_phone': card['phone'],
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
@api_login_required(ROLE_COMPANY)
def api_company_contests(request):
    account = request.account
    qs = Contest.objects.filter(company_username=account.username)

    # Пять счётчиков одним запросом вместо пяти отдельных COUNT(*)
    by_status = dict(qs.values_list('status').annotate(n=Count('id')))
    stats = {
        'total': sum(by_status.values()),
        'active': by_status.get(Contest.STATUS_ACTIVE, 0),
        'review': by_status.get(Contest.STATUS_REVIEW, 0),
        'finished': by_status.get(Contest.STATUS_FINISHED, 0),
        'draft': by_status.get(Contest.STATUS_DRAFT, 0),
    }

    contests = qs.annotate(subs=Count('submissions'))
    return JsonResponse({
        'ok': True,
        'contests': [_contest_to_dict(c, submissions_count=c.subs) for c in contests],
        'stats': stats,
    })


@require_http_methods(['POST'])
@api_login_required(ROLE_COMPANY)
def api_contest_create(request):
    account = request.account
    body = load_json_body(request)

    c = Contest(company_username=account.username)
    for field in ('title', 'excerpt', 'case_text', 'rules', 'category', 'level', 'prize', 'submission_type', 'submission_hint'):
        if field in body:
            setattr(c, field, body[field])
    if body.get('deadline'):
        c.deadline = _parse_deadline(body['deadline'])
    c.save()
    return JsonResponse({'ok': True, 'contest': _contest_to_dict(c)}, status=201)


@require_http_methods(['GET', 'PUT', 'DELETE'])
def api_contest_detail(request, contest_id):
    try:
        c = Contest.objects.get(id=contest_id)
    except Contest.DoesNotExist:
        return JsonResponse({'ok': False, 'message': 'Конкурс не найден'}, status=404)

    if request.method == 'GET':
        # Черновик виден только владельцу: иначе перебором id читаются условия
        # ещё не стартовавших конкурсов
        if c.status == 'draft':
            account = get_current_account(request)
            if account is None or account.username != c.company_username:
                return JsonResponse({'ok': False, 'message': 'Конкурс не найден'}, status=404)
        data = _contest_to_dict(c, full=True)
        try:
            co = Company.objects.get(username=c.company_username)
            data['company_name'] = co.name or c.company_username
        except Company.DoesNotExist:
            data['company_name'] = c.company_username
        return JsonResponse({'ok': True, 'contest': data})

    account = get_current_account(request)
    if account is None or account.role != ROLE_COMPANY:
        return JsonResponse({'ok': False, 'message': 'Требуется вход.'}, status=401)
    if c.company_username != account.username:
        return JsonResponse({'ok': False, 'message': 'Нет доступа'}, status=403)

    if request.method == 'DELETE':
        c.delete()
        return JsonResponse({'ok': True})

    body = load_json_body(request)

    for field in ('title', 'excerpt', 'case_text', 'rules', 'category', 'level', 'prize', 'submission_type', 'submission_hint'):
        if field in body:
            setattr(c, field, body[field])
    if 'deadline' in body:
        c.deadline = _parse_deadline(body['deadline'])
    c.save()
    return JsonResponse({'ok': True, 'contest': _contest_to_dict(c)})


def _own_contest_or_none(request, contest_id):
    return Contest.objects.filter(id=contest_id, company_username=request.account.username).first()


@require_http_methods(['POST'])
@api_login_required(ROLE_COMPANY)
def api_contest_attachment_upload(request, contest_id):
    """Загрузка стартового файла конкурса.

    Раньше интерфейс собирал файлы в список на странице, но отправлял конкурс
    JSON-ом, поэтому файлы не доходили до сервера вообще.
    """
    contest = _own_contest_or_none(request, contest_id)
    if contest is None:
        return JsonResponse({'ok': False, 'message': 'Конкурс не найден'}, status=404)

    if contest.attachments.count() >= MAX_ATTACHMENTS:
        return JsonResponse(
            {'ok': False, 'message': f'Можно приложить не больше {MAX_ATTACHMENTS} файлов.'}, status=400
        )

    try:
        uploaded = validate_attachment(request.FILES.get('file'))
    except UploadError as error:
        return JsonResponse({'ok': False, 'message': str(error)}, status=400)

    attachment = ContestAttachment.objects.create(
        contest=contest,
        file=uploaded,
        name=uploaded.name[:255],
        size=uploaded.size,
    )
    return JsonResponse({'ok': True, 'attachment': _attachment_to_dict(attachment)}, status=201)


@require_http_methods(['DELETE'])
@api_login_required(ROLE_COMPANY)
def api_contest_attachment_delete(request, contest_id, attachment_id):
    contest = _own_contest_or_none(request, contest_id)
    if contest is None:
        return JsonResponse({'ok': False, 'message': 'Конкурс не найден'}, status=404)

    attachment = contest.attachments.filter(id=attachment_id).first()
    if attachment is None:
        return JsonResponse({'ok': False, 'message': 'Файл не найден'}, status=404)

    attachment.file.delete(save=False)
    attachment.delete()
    return JsonResponse({'ok': True})


@require_http_methods(['POST'])
@api_login_required(ROLE_COMPANY)
def api_contest_publish(request, contest_id):
    c = _own_contest_or_none(request, contest_id)
    if c is None:
        return JsonResponse({'ok': False, 'message': 'Конкурс не найден'}, status=404)

    # Завершённый конкурс не воскрешаем: иначе он снова начнёт принимать работы
    if c.status == Contest.STATUS_FINISHED:
        return JsonResponse({'ok': False, 'message': 'Завершённый конкурс нельзя опубликовать заново.'}, status=400)

    # Раньше публиковалось что угодно — хоть пустой конкурс без срока
    missing = []
    if not (c.title or '').strip():
        missing.append('название')
    if not (c.case_text or '').strip():
        missing.append('описание кейса')
    if not c.deadline:
        missing.append('срок приёма работ')
    if missing:
        return JsonResponse(
            {'ok': False, 'message': 'Заполните перед публикацией: ' + ', '.join(missing) + '.'}, status=400
        )
    if c.deadline <= timezone.now():
        return JsonResponse({'ok': False, 'message': 'Срок приёма работ должен быть в будущем.'}, status=400)

    c.status = Contest.STATUS_ACTIVE
    c.save(update_fields=['status', 'updated_at'])
    return JsonResponse({'ok': True, 'contest': _contest_to_dict(c)})


@require_http_methods(['GET'])
@api_login_required(ROLE_COMPANY)
def api_contest_submissions(request, contest_id):
    account = request.account
    try:
        c = Contest.objects.get(id=contest_id, company_username=account.username)
    except Contest.DoesNotExist:
        return JsonResponse({'ok': False, 'message': 'Не найден'}, status=404)
    subs = list(c.submissions.all())
    cards = _candidate_cards(s.candidate_username for s in subs)
    return JsonResponse({'ok': True, 'submissions': [_sub_to_dict(s, cards) for s in subs]})


@require_http_methods(['PATCH'])
@api_login_required(ROLE_COMPANY)
def api_submission_update(request, contest_id, sub_id):
    account = request.account
    try:
        s = ContestSubmission.objects.get(
            id=sub_id, contest__id=contest_id, contest__company_username=account.username
        )
    except ContestSubmission.DoesNotExist:
        return JsonResponse({'ok': False, 'message': 'Не найдено'}, status=404)
    body = load_json_body(request)
    if body.get('status') in ('pending', 'accepted', 'rejected'):
        s.status = body['status']
        s.save()
    return JsonResponse({'ok': True, 'submission': _sub_to_dict(s)})


@require_http_methods(['POST'])
@api_login_required(ROLE_COMPANY)
def api_submission_like(request, contest_id, sub_id):
    account = request.account
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
@api_login_required(ROLE_COMPANY)
def api_submission_winner(request, contest_id, sub_id):
    account = request.account
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

    qs = qs.order_by('-created_at')
    contests, page_meta = paginate(request, qs, CATALOG_PER_PAGE)

    company_names = {
        co.username: co.name or co.username
        for co in Company.objects.filter(username__in=[c.company_username for c in contests])
    }

    result = []
    for c in contests:
        d = _contest_to_dict(c)
        d['company_name'] = company_names.get(c.company_username, c.company_username)
        result.append(d)
    return JsonResponse({'ok': True, 'contests': result, **page_meta})


@require_http_methods(['POST'])
@api_login_required(ROLE_USER)
def api_contest_submit(request, contest_id):
    account = request.account
    try:
        c = Contest.objects.get(id=contest_id, status=Contest.STATUS_ACTIVE)
    except Contest.DoesNotExist:
        return JsonResponse({'ok': False, 'message': 'Конкурс не найден или не активен'}, status=404)

    # Дедлайн раньше не проверялся нигде — работу можно было сдать хоть через год
    if c.deadline and timezone.now() > c.deadline:
        return JsonResponse({'ok': False, 'message': 'Приём работ завершён: срок вышел.'}, status=400)

    comment = (request.POST.get('comment') or '')[:MAX_COMMENT_LENGTH]
    sub = ContestSubmission(
        contest=c,
        candidate_username=account.username,
        candidate_name=account.name or account.username,
        comment=comment,
    )

    if c.submission_type == Contest.SUB_FILE:
        try:
            sub.file = validate_attachment(request.FILES.get('file'))
        except UploadError as error:
            return JsonResponse({'ok': False, 'message': str(error)}, status=400)
    elif c.submission_type == Contest.SUB_LINK:
        link = (request.POST.get('link') or '').strip()
        try:
            URLValidator()(link)
        except ValidationError:
            return JsonResponse({'ok': False, 'message': 'Укажите корректную ссылку.'}, status=400)
        sub.link = link
    else:
        text = (request.POST.get('text') or '').strip()
        if not text:
            return JsonResponse({'ok': False, 'message': 'Текст решения обязателен.'}, status=400)
        sub.text = text[:MAX_TEXT_LENGTH]

    # Номер попытки и лимит считаем под блокировкой конкурса: иначе два
    # одновременных запроса получат одинаковый номер и обойдут лимит
    with transaction.atomic():
        locked = Contest.objects.select_for_update().get(id=c.id)
        used = ContestSubmission.objects.filter(contest=locked, candidate_username=account.username).count()
        if used >= MAX_SUBMISSION_ATTEMPTS:
            return JsonResponse(
                {'ok': False, 'message': 'Вы уже отправили решение на этот конкурс.'}, status=409
            )
        sub.attempt = used + 1
        sub.save()
        locked.participants_count = (
            ContestSubmission.objects.filter(contest=locked)
            .values('candidate_username').distinct().count()
        )
        locked.save(update_fields=['participants_count'])

    return JsonResponse({'ok': True, 'submission': _sub_to_dict(sub)}, status=201)


@require_http_methods(['GET'])
@api_login_required()
def api_my_submissions(request, contest_id):
    account = request.account
    subs = list(ContestSubmission.objects.filter(
        contest_id=contest_id, candidate_username=account.username
    ))
    cards = _candidate_cards(s.candidate_username for s in subs)
    return JsonResponse({'ok': True, 'submissions': [_sub_to_dict(s, cards) for s in subs]})


@require_http_methods(['GET'])
@api_login_required()
def api_user_contest_history(request):
    account = request.account
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


@require_http_methods(['GET'])
def api_company_public_contests(request, username):
    qs = Contest.objects.filter(
        company_username=username,
        status__in=[Contest.STATUS_ACTIVE, Contest.STATUS_FINISHED, Contest.STATUS_REVIEW],
    ).order_by('-created_at')
    return JsonResponse({'ok': True, 'contests': [_contest_to_dict(c) for c in qs]})
