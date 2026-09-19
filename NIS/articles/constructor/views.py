import json

from django.http import Http404, JsonResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods

from authorization.models import ROLE_USER
from articles.sanitize import clean_article_html
from articles.serializers import cover_gradient
from core.auth import api_login_required, page_login_required
from core.utils import load_json_body

from .models import Article

MAX_TITLE_LENGTH = 255
MAX_EXCERPT_LENGTH = 2000
MAX_TAGS = 10


@ensure_csrf_cookie
@page_login_required(ROLE_USER)
def article_constructor(request, article_id=None):
    account = request.account

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
@api_login_required(ROLE_USER)
def api_article_create(request):
    article = Article.objects.create(author_username=request.account.username)
    return JsonResponse({'ok': True, 'article_id': article.id})


def _own_article(request, article_id):
    return Article.objects.filter(id=article_id, author_username=request.account.username).first()


def _article_not_found():
    return JsonResponse({'ok': False, 'message': 'Статья не найдена'}, status=404)


@require_http_methods(['PATCH'])
@api_login_required()
def api_article_update(request, article_id):
    article = _own_article(request, article_id)
    if not article:
        return _article_not_found()

    body = load_json_body(request)

    fields = []
    for field, limit in (('title', MAX_TITLE_LENGTH), ('excerpt', MAX_EXCERPT_LENGTH)):
        if field in body:
            setattr(article, field, str(body[field] or '')[:limit])
            fields.append(field)

    # Шаблон выводит тело без экранирования, поэтому чистим его здесь
    if 'content' in body:
        article.content = clean_article_html(body['content'])
        fields.append('content')

    if 'tags' in body:
        value = body['tags']
        if not isinstance(value, list):
            return JsonResponse({'ok': False, 'message': 'Поле tags должно быть списком.'}, status=400)
        article.tags = [str(t)[:50] for t in value[:MAX_TAGS]]
        fields.append('tags')

    for field, maximum in (('cover_index', 999), ('read_time', 1000)):
        if field in body:
            try:
                setattr(article, field, max(0, min(int(body[field]), maximum)))
            except (TypeError, ValueError):
                return JsonResponse({'ok': False, 'message': f'Поле {field} должно быть числом.'}, status=400)
            fields.append(field)

    if fields:
        article.save(update_fields=fields)

    return JsonResponse({'ok': True})


@require_http_methods(['POST'])
@api_login_required()
def api_article_publish(request, article_id):
    article = _own_article(request, article_id)
    if not article:
        return _article_not_found()
    if not (article.title or '').strip():
        return JsonResponse({'ok': False, 'message': 'Укажите название статьи.'}, status=400)
    if not (article.content or '').strip():
        return JsonResponse({'ok': False, 'message': 'Статья пустая — нечего публиковать.'}, status=400)
    article.status = Article.STATUS_PUBLISHED
    article.published_at = article.published_at or timezone.now()
    article.save(update_fields=['status', 'published_at'])
    return JsonResponse({'ok': True})


@require_http_methods(['DELETE'])
@api_login_required()
def api_article_delete(request, article_id):
    article = _own_article(request, article_id)
    if not article:
        return _article_not_found()
    article.delete()
    return JsonResponse({'ok': True})


@ensure_csrf_cookie
@page_login_required(ROLE_USER)
def article_preview(request, article_id):
    article = _own_article(request, article_id)
    if not article:
        raise Http404
    return render(request, 'articles_constructor/preview.html', {
        'article': article,
        'article_id': article_id,
        'cover_gradient': cover_gradient(article.cover_index),
    })
