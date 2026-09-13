from django.db import transaction
from django.http import Http404, JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods

from core.utils import load_json_body

from authorization.views import get_current_account
from tests import code_results
from tests.constructor.models import Test, TestPage


def _get_visible_test(request, test_id):
    """Тест для прохождения и признак предпросмотра.

    Предпросмотр (?preview=1) показывает неопубликованный тест, поэтому доступен только
    владельцу: раньше по этому флагу любой желающий читал чужой черновик.
    Возвращает (None, False), если теста нет или он недоступен запрашивающему.
    """
    test = Test.objects.filter(id=test_id).first()
    if test is None:
        return None, False

    account = get_current_account(request)
    is_owner = account is not None and account.username == test.owner_username
    is_preview = request.GET.get('preview') == '1' and is_owner

    if not is_preview and test.status != Test.STATUS_PUBLISHED:
        return None, False
    return test, is_preview


@ensure_csrf_cookie
def test_view_shell(request, test_id):
    test, is_preview = _get_visible_test(request, test_id)
    if test is None:
        raise Http404

    return render(request, 'tests_app/test_view.html', {
        'app_path': request.path,
        'test_id': test_id,
        'test_title': test.title,
        'is_preview': is_preview,
    })


@require_GET
def api_test_view(request, test_id):
    test, is_preview = _get_visible_test(request, test_id)
    if test is None:
        return JsonResponse({'ok': False, 'message': 'Тест не найден.'}, status=404)

    pages = []
    for page in test.pages.prefetch_related('answers'):
        page_data = {
            'id': page.id,
            'order': page.order,
            'type': page.type,
            'title': page.title,
            'content': page.content,
        }
        if page.type == TestPage.TYPE_QUIZ:
            answers = list(page.answers.all())
            # Признак is_correct наружу не отдаём — иначе ответы видны до проверки
            page_data['multi_correct'] = sum(1 for a in answers if a.is_correct) > 1
            page_data['answers'] = [{'id': a.id, 'text': a.text, 'order': a.order} for a in answers]
        elif page.type == TestPage.TYPE_INPUT:
            page_data['answers'] = []
        pages.append(page_data)

    return JsonResponse({
        'ok': True,
        'test': {
            'id': test.id,
            'title': test.title,
            'description': test.description,
            'page_count': len(pages),
        },
        'pages': pages,
        'is_preview': is_preview,
    })


@require_http_methods(['POST'])
def api_test_submit(request, test_id):
    test, is_preview = _get_visible_test(request, test_id)
    if test is None:
        return JsonResponse({'ok': False, 'message': 'Тест не найден.'}, status=404)

    body = load_json_body(request)

    # answers: {page_id: значение}. Для quiz — список id ответов, для input — строка.
    submitted = body.get('answers')
    if not isinstance(submitted, dict):
        submitted = {}

    results = []
    score = 0
    total = 0

    scored_types = [TestPage.TYPE_QUIZ, TestPage.TYPE_INPUT, TestPage.TYPE_CODE]
    for page in test.pages.filter(type__in=scored_types).prefetch_related('answers'):
        user_answer = submitted.get(str(page.id))
        result = {'page_id': page.id, 'type': page.type}
        answers = list(page.answers.all())
        total += 1

        if page.type == TestPage.TYPE_QUIZ:
            correct_ids = {a.id for a in answers if a.is_correct}
            raw_selected = user_answer if isinstance(user_answer, list) else []
            selected_ids = {int(x) for x in raw_selected if str(x).isdigit()}
            is_correct = bool(correct_ids) and correct_ids == selected_ids
            result['correct_answer_ids'] = sorted(correct_ids)
            result['selected_answer_ids'] = sorted(selected_ids)

        elif page.type == TestPage.TYPE_INPUT:
            correct_answers = [a.text for a in answers if a.is_correct]
            user_text = user_answer.strip().lower() if isinstance(user_answer, str) else ''
            is_correct = bool(user_text) and any(user_text == a.strip().lower() for a in correct_answers)
            result['correct_text'] = correct_answers[0] if correct_answers else ''

        else:  # TestPage.TYPE_CODE
            # Баллы берём из вердикта сервера, а не из тела запроса
            passed_cases, total_cases = code_results.recall(request, page.id)
            is_correct = total_cases > 0 and passed_cases == total_cases
            result['passed_cases'] = passed_cases
            result['total_cases'] = total_cases

        result['correct'] = is_correct
        if is_correct:
            score += 1
        results.append(result)

    if not is_preview:
        with transaction.atomic():
            test.refresh_from_db(fields=['stats'])
            stats = test.stats or {}
            stats['submissions'] = stats.get('submissions', 0) + 1
            test.stats = stats
            test.save(update_fields=['stats'])

    return JsonResponse({
        'ok': True,
        'score': score,
        'total': total,
        'results': results,
    })
