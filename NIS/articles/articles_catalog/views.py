from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie

from articles.constructor.models import Article
from articles.serializers import author_names_for, serialize_article
from core.pagination import paginate

# Каталоги фильтруются на стороне браузера, поэтому страница крупная:
# ограничение защищает от выгрузки всей таблицы, но не режет текущий интерфейс.
CATALOG_PER_PAGE = 100


@ensure_csrf_cookie
def articles_catalog_shell(request):
    return render(request, 'articles_catalog/catalog.html')


def api_articles_catalog(request):
    articles_qs = Article.objects.filter(status=Article.STATUS_PUBLISHED).order_by('-published_at')
    articles, page_meta = paginate(request, articles_qs, CATALOG_PER_PAGE)
    names = author_names_for(articles)
    data = [serialize_article(a, author_names=names) for a in articles]
    return JsonResponse({'ok': True, 'articles': data, **page_meta})


def api_user_articles(request, username):
    articles_qs = Article.objects.filter(
        author_username=username,
        status=Article.STATUS_PUBLISHED,
    ).order_by('-published_at')
    articles, page_meta = paginate(request, articles_qs, CATALOG_PER_PAGE)
    names = author_names_for(articles)
    return JsonResponse({
        'ok': True,
        'articles': [serialize_article(a, author_names=names) for a in articles],
        **page_meta,
    })
