import json

from django.http import Http404, JsonResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods

from authorization.models import ROLE_USER
from authorization.views import get_current_account

from .models import Article


@ensure_csrf_cookie
def article_constructor(request, article_id=None):
    account = get_current_account(request)
    if account is None or account.role != ROLE_USER:
        return redirect('/authorization/signup/')

    article_data = None
    if article_id is not None:
        article = Article.objects.filter(id=article_id, author_username=account.username).first()
        if not article:
            return redirect('/cabinet/user/articles/')
        article_data = {
            'id': article.id,
            'title': article.title,
            'excerpt': article.excerpt,
            'content': article.content,
            'tags': article.tags or [],
            'status': article.status,
            'cover_index': article.cover_index,
        }

    return render(request, 'articles_constructor/constructor.html', {
        'username': account.username,
        'article_id': article_id,
        'article_json': json.dumps(article_data),
    })


@require_http_methods(['POST'])
def api_article_create(request):
    current = get_current_account(request)
    if not current or current.role != ROLE_USER:
        return JsonResponse({'ok': False, 'message': 'Нет доступа'}, status=401)
    article = Article.objects.create(author_username=current.username)
    return JsonResponse({'ok': True, 'article_id': article.id})


@require_http_methods(['PATCH'])
def api_article_update(request, article_id):
    current = get_current_account(request)
    if not current:
        return JsonResponse({'ok': False, 'message': 'Нет доступа'}, status=401)
    article = Article.objects.filter(id=article_id, author_username=current.username).first()
    if not article:
        return JsonResponse({'ok': False, 'message': 'Статья не найдена'}, status=404)

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'ok': False, 'message': 'Неверный JSON'}, status=400)

    fields = []
    for field in ('title', 'excerpt', 'content', 'tags', 'cover_index', 'read_time'):
        if field in body:
            setattr(article, field, body[field])
            fields.append(field)
    if fields:
        article.save(update_fields=fields)

    return JsonResponse({'ok': True})


@require_http_methods(['POST'])
def api_article_publish(request, article_id):
    current = get_current_account(request)
    if not current:
        return JsonResponse({'ok': False, 'message': 'Нет доступа'}, status=401)
    article = Article.objects.filter(id=article_id, author_username=current.username).first()
    if not article:
        return JsonResponse({'ok': False, 'message': 'Статья не найдена'}, status=404)
    article.status = Article.STATUS_PUBLISHED
    article.published_at = article.published_at or timezone.now()
    article.save(update_fields=['status', 'published_at'])
    return JsonResponse({'ok': True})


@require_http_methods(['DELETE'])
def api_article_delete(request, article_id):
    current = get_current_account(request)
    if not current:
        return JsonResponse({'ok': False, 'message': 'Нет доступа'}, status=401)
    article = Article.objects.filter(id=article_id, author_username=current.username).first()
    if not article:
        return JsonResponse({'ok': False, 'message': 'Статья не найдена'}, status=404)
    article.delete()
    return JsonResponse({'ok': True})


COVERS = [
    'linear-gradient(135deg,#1e3a5f 0%,#2d6a9f 100%)',
    'linear-gradient(135deg,#D62839 0%,#7a1020 100%)',
    'linear-gradient(135deg,#134e5e 0%,#1a7a6e 100%)',
    'linear-gradient(135deg,#3d1f6e 0%,#6b3fa0 100%)',
    'linear-gradient(135deg,#2d3a1a 0%,#4a7a2d 100%)',
    'linear-gradient(135deg,#5c3d00 0%,#b07000 100%)',
]


@ensure_csrf_cookie
def article_preview(request, article_id):
    account = get_current_account(request)
    if account is None or account.role != ROLE_USER:
        return redirect('/authorization/signup/')
    article = Article.objects.filter(id=article_id, author_username=account.username).first()
    if not article:
        raise Http404
    cover_gradient = COVERS[article.cover_index % len(COVERS)] if article.cover_index >= 0 else None
    return render(request, 'articles_constructor/preview.html', {
        'article': article,
        'article_id': article_id,
        'cover_gradient': cover_gradient,
    })
