from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from authorization import bans
from authorization.models import Account, ROLE_COMPANY, ROLE_USER
from authorization.views import get_current_account
from companies.models import Company
from core.auth import api_login_required
from core.utils import load_json_body
from core.uploads import UploadError, validate_image
from tests import statistics

from . import activity, links
from .models import UserProfile

# Столько же навыков показывает редактор в настройках кабинета
MAX_SKILLS = 20


def _sees_contacts(viewer, account):
    """Контакты видит владелец и подтверждённая компания — больше никто."""
    if viewer is None:
        return False
    if viewer.username == account.username:
        return True
    if viewer.role != ROLE_COMPANY:
        return False
    company = Company.objects.filter(username=viewer.username).first()
    return bool(company and company.is_verified)


def _candidate_or_error(username):
    account = Account.objects.filter(username__iexact=username, role=ROLE_USER).first()
    if account is None:
        return None, JsonResponse({'ok': False, 'message': 'Кандидат не найден'}, status=404)
    return account, None


def _own_candidate_or_error(request, username):
    if request.account.username != username:
        return None, JsonResponse({'ok': False, 'message': 'Нет доступа.'}, status=403)
    return _candidate_or_error(username)


@require_GET
def api_candidate_detail(request, username):
    account, error = _candidate_or_error(username)
    if error:
        return error

    current = get_current_account(request)
    # Заблокированный виден только себе и модератору — как и его страница
    if not bans.visible_to(current, account.username):
        return JsonResponse({'ok': False, 'message': 'Кандидат не найден'}, status=404)

    profile = UserProfile.objects.filter(username=account.username).first()
    is_owner = current is not None and current.username == account.username

    candidate = _serialize_candidate(
        account, profile, include_private=_sees_contacts(current, account))
    candidate['strengths'] = statistics.strengths(account.username)
    candidate['streak'] = activity.streaks(activity.daily(account.username))

    return JsonResponse({
        'ok': True,
        'candidate': candidate,
        'is_owner': is_owner,
    })


@require_http_methods(['PATCH'])
@api_login_required()
def api_candidate_update(request, username):
    account, error = _own_candidate_or_error(request, username)
    if error:
        return error

    body = load_json_body(request)

    name = (body.get('name') or '').strip()
    email = (body.get('email') or '').strip()
    bio = body.get('bio', '')
    phone = body.get('phone', None)
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

    # Меняем только присланное: запрос на удаление фото не должен заодно
    # стирать «О себе» просто потому, что этого поля в нём нет
    profile, _ = UserProfile.objects.get_or_create(username=username)
    updated = []
    if 'bio' in body:
        profile.bio = bio
        updated.append('bio')
    if phone is not None:
        profile.phone = str(phone).strip()[:32]
        updated.append('phone')
    if isinstance(skills_raw, list):
        profile.skills = [s.strip() for s in skills_raw if isinstance(s, str) and s.strip()][:MAX_SKILLS]
        updated.append('skills')
    if 'links' in body:
        profile.links = links.clean(body['links'])
        updated.append('links')
    if body.get('remove_avatar'):
        profile.avatar.delete(save=False)
        updated.append('avatar')
    if updated:
        profile.save(update_fields=updated)

    return JsonResponse({'ok': True, 'candidate': _serialize_candidate(account, profile, include_private=True)})


@require_POST
@api_login_required()
def api_candidate_avatar(request, username):
    account, error = _own_candidate_or_error(request, username)
    if error:
        return error

    # Файл кладётся в поле напрямую, минуя форму, поэтому проверяем сами
    try:
        avatar = validate_image(request.FILES.get('avatar'))
    except UploadError as upload_error:
        return JsonResponse({'ok': False, 'message': str(upload_error)}, status=400)

    profile, _ = UserProfile.objects.get_or_create(username=username)
    # Прежнее фото убираем с диска, иначе оно останется лежать навсегда
    profile.avatar.delete(save=False)
    profile.avatar = avatar
    profile.save(update_fields=['avatar'])

    return JsonResponse({'ok': True, 'candidate': _serialize_candidate(account, profile, include_private=True)})


def _serialize_candidate(account, profile, include_private=False):
    """Карточка кандидата для профиля и кабинета."""
    data = {
        'username': account.username,
        'name': account.name,
        'bio': profile.bio if profile else '',
        'skills': profile.skills if profile else [],
        'links': links.as_list(profile.links if profile else {}),
        'avatar': profile.avatar.url if profile and profile.avatar else None,
        'created_at': account.created_at.isoformat(),
    }
    data['contacts_visible'] = include_private
    if include_private:
        data['email'] = account.email
        data['phone'] = profile.phone if profile else ''
    return data
