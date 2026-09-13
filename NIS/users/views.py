from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from authorization.models import Account, ROLE_USER
from authorization.views import get_current_account
from core.auth import api_login_required
from core.utils import load_json_body
from core.uploads import UploadError, validate_image
from .models import UserProfile


@require_GET
def api_candidate_detail(request, username):
    account = Account.objects.filter(username__iexact=username, role=ROLE_USER).first()
    if not account:
        return JsonResponse({'ok': False, 'message': 'Кандидат не найден'}, status=404)

    profile = UserProfile.objects.filter(username=account.username).first()
    current = get_current_account(request)
    is_owner = current is not None and current.username == account.username

    return JsonResponse({
        'ok': True,
        'candidate': _serialize_candidate(account, profile, include_private=is_owner),
        'is_owner': is_owner,
    })


@require_http_methods(['PATCH'])
@api_login_required()
def api_candidate_update(request, username):
    if request.account.username != username:
        return JsonResponse({'ok': False, 'message': 'Нет доступа.'}, status=403)

    account = Account.objects.filter(username=username, role=ROLE_USER).first()
    if not account:
        return JsonResponse({'ok': False, 'message': 'Кандидат не найден'}, status=404)

    body = load_json_body(request)

    name = (body.get('name') or '').strip()
    email = (body.get('email') or '').strip()
    bio = body.get('bio', '')
    skills_raw = body.get('skills', None)

    changed_fields = []
    if name:
        account.name = name[:255]
        changed_fields.append('name')
    if email:
        try:
            validate_email(email)
        except ValidationError:
            return JsonResponse({'ok': False, 'message': 'Некорректный email.'}, status=400)
        account.email = email
        changed_fields.append('email')
    if changed_fields:
        account.save(update_fields=changed_fields)

    profile, _ = UserProfile.objects.get_or_create(username=username)
    profile.bio = bio
    if skills_raw is not None:
        profile.skills = [s.strip() for s in skills_raw if isinstance(s, str) and s.strip()][:20]
    profile.save(update_fields=['bio', 'skills'])

    return JsonResponse({'ok': True, 'candidate': _serialize_candidate(account, profile, include_private=True)})


@require_POST
@api_login_required()
def api_candidate_avatar(request, username):
    if request.account.username != username:
        return JsonResponse({'ok': False, 'message': 'Нет доступа.'}, status=403)

    account = Account.objects.filter(username=username, role=ROLE_USER).first()
    if not account:
        return JsonResponse({'ok': False, 'message': 'Кандидат не найден'}, status=404)

    # Файл кладётся в поле напрямую, минуя форму, поэтому валидаторы ImageField
    # не срабатывают — проверяем сами
    try:
        avatar = validate_image(request.FILES.get('avatar'))
    except UploadError as error:
        return JsonResponse({'ok': False, 'message': str(error)}, status=400)

    profile, _ = UserProfile.objects.get_or_create(username=username)
    profile.avatar = avatar
    profile.save(update_fields=['avatar'])

    return JsonResponse({'ok': True, 'candidate': _serialize_candidate(account, profile, include_private=True)})


def _serialize_candidate(account, profile, include_private=False):
    """Карточка кандидата. Email отдаём только владельцу: раньше его мог собрать
    любой аноним, обойдя /api/v1/candidates/<username>/."""
    data = {
        'username': account.username,
        'name': account.name,
        'bio': profile.bio if profile else '',
        'skills': profile.skills if profile else [],
        'avatar': profile.avatar.url if profile and profile.avatar else None,
        'created_at': account.created_at.isoformat(),
    }
    if include_private:
        data['email'] = account.email
    return data
