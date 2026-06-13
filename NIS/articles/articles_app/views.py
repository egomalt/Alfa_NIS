from django.http import Http404
from django.shortcuts import render

from articles.constructor.models import Article


def article_read(request, article_id):
    article = Article.objects.filter(id=article_id, status=Article.STATUS_PUBLISHED).first()
    if not article:
        raise Http404
    return render(request, 'articles_app/read.html', {'article': article, 'article_id': article_id})
