import json

from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from authorization.models import Account, ROLE_USER
from authorization.views import get_current_account
from .models import UserProfile


@require_GET
def api_candidate_detail(request, username):
    account = Account.objects.filter(username__iexact=username, role=ROLE_USER).first()
    if not account:
        return JsonResponse({'ok': False, 'message': 'Кандидат не найден'}, status=404)

    profile = UserProfile.objects.filter(username=account.username).first()
    current = get_current_account(request)

    return JsonResponse({
        'ok': True,
        'candidate': _serialize_candidate(account, profile),
        'is_owner': current is not None and current.username == account.username,
    })


@require_http_methods(['PATCH'])
def api_candidate_update(request, username):
    current = get_current_account(request)
    if not current or current.username != username:
        return JsonResponse({'ok': False, 'message': 'Нет доступа'}, status=403)

    account = Account.objects.filter(username=username, role=ROLE_USER).first()
    if not account:
        return JsonResponse({'ok': False, 'message': 'Кандидат не найден'}, status=404)

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'ok': False, 'message': 'Неверный JSON'}, status=400)

    name = (body.get('name') or '').strip()
    bio = body.get('bio', '')
    skills_raw = body.get('skills', None)

    if name:
        account.name = name
        account.save(update_fields=['name'])

    profile, _ = UserProfile.objects.get_or_create(username=username)
    profile.bio = bio
    if skills_raw is not None:
        profile.skills = [s.strip() for s in skills_raw if isinstance(s, str) and s.strip()][:20]
    profile.save(update_fields=['bio', 'skills'])

    return JsonResponse({'ok': True, 'candidate': _serialize_candidate(account, profile)})


@require_POST
def api_candidate_avatar(request, username):
    current = get_current_account(request)
    if not current or current.username != username:
        return JsonResponse({'ok': False, 'message': 'Нет доступа'}, status=403)

    account = Account.objects.filter(username=username, role=ROLE_USER).first()
    if not account:
        return JsonResponse({'ok': False, 'message': 'Кандидат не найден'}, status=404)

    avatar = request.FILES.get('avatar')
    if not avatar:
        return JsonResponse({'ok': False, 'message': 'Файл не передан'}, status=400)

    profile, _ = UserProfile.objects.get_or_create(username=username)
    profile.avatar = avatar
    profile.save(update_fields=['avatar'])

    return JsonResponse({'ok': True, 'candidate': _serialize_candidate(account, profile)})


def _serialize_candidate(account, profile):
    return {
        'username': account.username,
        'name': account.name,
        'email': account.email,
        'bio': profile.bio if profile else '',
        'skills': profile.skills if profile else [],
        'avatar': profile.avatar.url if profile and profile.avatar else None,
        'created_at': account.created_at.isoformat(),
    }
