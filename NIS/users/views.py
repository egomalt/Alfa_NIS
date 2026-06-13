import json

from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from authorization.models import Account, ROLE_USER
from authorization.views import get_current_account
from .models import UserProfile, Article


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


def _serialize_article(a):
    return {
        'id': a.id,
        'title': a.title,
        'excerpt': a.excerpt,
        'tags': a.tags or [],
        'status': a.status,
        'cover_index': a.cover_index,
        'read_time': a.read_time,
        'views': a.views,
        'likes': a.likes,
        'created_at': a.created_at.isoformat(),
        'updated_at': a.updated_at.isoformat(),
        'published_at': a.published_at.isoformat() if a.published_at else None,
    }


@require_GET
def api_my_articles(request):
    current = get_current_account(request)
    if not current:
        return JsonResponse({'ok': False, 'message': 'Нет доступа'}, status=401)
    articles = Article.objects.filter(author_username=current.username)
    return JsonResponse({'ok': True, 'articles': [_serialize_article(a) for a in articles]})


@require_http_methods(['POST'])
def api_article_publish(request, article_id):
    current = get_current_account(request)
    if not current:
        return JsonResponse({'ok': False, 'message': 'Нет доступа'}, status=401)
    article = Article.objects.filter(id=article_id, author_username=current.username).first()
    if not article:
        return JsonResponse({'ok': False, 'message': 'Статья не найдена'}, status=404)
    from django.utils import timezone
    article.status = Article.STATUS_PUBLISHED
    article.published_at = article.published_at or timezone.now()
    article.save(update_fields=['status', 'published_at'])
    return JsonResponse({'ok': True, 'article': _serialize_article(article)})
