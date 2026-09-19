"""Модераторские действия над контентом: удаление материалов и зачистка контента автора."""
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET, require_POST

from core.auth import moderator_required
from core.utils import load_json_body
from articles.constructor.models import Article
from authorization.models import Account
from contests.contests_cabinet.models import Contest
from tests.constructor.models import Test


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


@require_POST
@moderator_required
def api_delete_test(request, test_id):
    test = get_object_or_404(Test, id=test_id)
    author = test.owner_username
    title = test.title or ('Тест #%d' % test.id)
    test.delete()
    return JsonResponse({'ok': True, 'deleted': 'test', 'title': title, 'author': author})


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
    data = load_json_body(request)
    categories = data.get('categories') or []
    valid = {'articles', 'contests', 'tests'}
    categories = [c for c in categories if c in valid]

    # Считаем до удаления: delete() возвращает число всех задетых записей,
    # включая вопросы теста, решения и вложения, — в ответе это выглядело бы
    # завышенным («удалено 47 статей» вместо трёх)
    querysets = {
        'articles': Article.objects.filter(author_username=username),
        'contests': Contest.objects.filter(company_username=username),
        'tests': Test.objects.filter(owner_username=username),
    }
    removed = {}
    for name in categories:
        qs = querysets[name]
        removed[name] = qs.count()
        qs.delete()

    return JsonResponse({'ok': True, 'removed': removed, 'counts': _content_counts(username)})
