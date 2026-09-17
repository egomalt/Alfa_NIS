from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST, require_http_methods

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
    """Кому показывать почту и телефон кандидата.

    Владельцу — всегда. Подтверждённой компании — потому что иначе профиль
    не работает как профиль: посмотреть человека можно, а позвать нельзя.
    Всем остальным, включая анонимов и неподтверждённые компании, — нет:
    иначе адреса собираются обходом каталога.
    """
    if viewer is None:
        return False
    if viewer.username == account.username:
        return True
    if viewer.role != ROLE_COMPANY:
        return False
    company = Company.objects.filter(username=viewer.username).first()
    return bool(company and company.is_verified)


@require_GET
def api_candidate_detail(request, username):
    account = Account.objects.filter(username__iexact=username, role=ROLE_USER).first()
    if not account:
        return JsonResponse({'ok': False, 'message': 'Кандидат не найден'}, status=404)

    profile = UserProfile.objects.filter(username=account.username).first()
    current = get_current_account(request)
    is_owner = current is not None and current.username == account.username

    candidate = _serialize_candidate(
        account, profile, include_private=_sees_contacts(current, account))
    # Подтверждение навыков делом и признак живого профиля — то, ради чего
    # компания вообще открывает страницу
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
    if request.account.username != username:
        return JsonResponse({'ok': False, 'message': 'Нет доступа.'}, status=403)

    account = Account.objects.filter(username=username, role=ROLE_USER).first()
    if not account:
        return JsonResponse({'ok': False, 'message': 'Кандидат не найден'}, status=404)

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

    profile, _ = UserProfile.objects.get_or_create(username=username)
    # Меняем только присланное: запрос на удаление фото не должен заодно
    # стирать «О себе» просто потому, что это поле в него не положили
    updated = []
    if 'bio' in body:
        profile.bio = bio
        updated.append('bio')
    if phone is not None:
        profile.phone = str(phone).strip()[:32]
        updated.append('phone')
    if skills_raw is not None:
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
    """Карточка кандидата. Контакты — только владельцу и подтверждённой
    компании: раньше почту мог собрать любой аноним, обойдя
    /api/v1/candidates/<username>/."""
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
