"""Модераторские действия над контентом: удаление материалов и зачистка контента автора."""
import json

from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET, require_POST

from administration.dashboard.views import moderator_required
from articles.constructor.models import Article
from authorization.models import Account, ROLE_COMPANY, ROLE_USER
from contests.contests_cabinet.models import Contest
from tests.constructor.models import Test

# Автор материала → аккаунт, который можно заблокировать
#   статья  → author_username (кандидат)
#   конкурс → company_username (компания)


def _account_brief(username):
    acc = Account.objects.filter(username=username).first()
    if not acc:
        return {'username': username, 'name': username, 'role': None}
    return {'username': acc.username, 'name': acc.name, 'role': acc.role}


@require_POST
@moderator_required
def api_delete_article(request, article_id):
    article = get_object_or_404(Article, id=article_id)
    author = article.author_username
    title = article.title or ('Статья #%d' % article.id)
    article.delete()
    return JsonResponse({'ok': True, 'deleted': 'article', 'title': title, 'author': author})


@require_POST
@moderator_required
def api_delete_contest(request, contest_id):
    contest = get_object_or_404(Contest, id=contest_id)
    author = contest.company_username
    title = contest.title or ('Конкурс #%d' % contest.id)
    contest.delete()
    return JsonResponse({'ok': True, 'deleted': 'contest', 'title': title, 'author': author})


def _content_counts(username):
    return {
        'articles': Article.objects.filter(author_username=username).count(),
        'contests': Contest.objects.filter(company_username=username).count(),
        'tests': Test.objects.filter(owner_username=username).count(),
    }


@require_GET
@moderator_required
def api_user_content(request, username):
    """Счётчики контента автора — чтобы модератор видел, что удалит по категориям."""
    brief = _account_brief(username)
    return JsonResponse({'ok': True, 'user': brief, 'counts': _content_counts(username)})


@require_POST
@moderator_required
def api_user_purge(request, username):
    """Удаляет выбранные категории контента автора: {"categories": ["articles","contests","tests"]}."""
    try:
        data = json.loads(request.body or '{}')
    except (ValueError, TypeError):
        data = {}
    categories = data.get('categories') or []
    valid = {'articles', 'contests', 'tests'}
    categories = [c for c in categories if c in valid]

    removed = {}
    if 'articles' in categories:
        removed['articles'] = Article.objects.filter(author_username=username).delete()[0]
    if 'contests' in categories:
        removed['contests'] = Contest.objects.filter(company_username=username).delete()[0]
    if 'tests' in categories:
        removed['tests'] = Test.objects.filter(owner_username=username).delete()[0]

    return JsonResponse({'ok': True, 'removed': removed, 'counts': _content_counts(username)})
