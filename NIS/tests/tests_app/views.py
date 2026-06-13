import json

from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods

from tests.constructor.models import Test, TestPage


@ensure_csrf_cookie
def tests_catalog_shell(request):
    return render(request, 'tests_app/tests_catalog.html')


@ensure_csrf_cookie
def user_tests_cabinet(request):
    from authorization.models import ROLE_USER
    from authorization.views import get_current_account
    account = get_current_account(request)
    if account is None or account.role != ROLE_USER:
        return redirect('/authorization/signup/')
    return render(request, 'tests_app/user_tests.html', {'username': account.username})


@ensure_csrf_cookie
def test_view_shell(request, test_id):
    is_preview = request.GET.get('preview') == '1'
    try:
        if is_preview:
            test = Test.objects.get(id=test_id)
        else:
            test = Test.objects.get(id=test_id, status=Test.STATUS_PUBLISHED)
    except Test.DoesNotExist:
        from django.http import Http404
        raise Http404

    return render(request, 'tests_app/test_view.html', {
        'app_path': request.path,
        'test_id': test_id,
        'test_title': test.title,
        'is_preview': is_preview,
    })


@require_GET
def api_test_view(request, test_id):
    is_preview = request.GET.get('preview') == '1'
    try:
        if is_preview:
            test = Test.objects.get(id=test_id)
        else:
            test = Test.objects.get(id=test_id, status=Test.STATUS_PUBLISHED)
    except Test.DoesNotExist:
        return JsonResponse({'ok': False, 'message': 'Not found'}, status=404)

    pages = []
    for page in test.pages.all():
        page_data = {
            'id': page.id,
            'order': page.order,
            'type': page.type,
            'title': page.title,
            'content': page.content,
        }
        if page.type == TestPage.TYPE_QUIZ:
            correct_count = page.answers.filter(is_correct=True).count()
            page_data['multi_correct'] = correct_count > 1
            page_data['answers'] = [
                {'id': a.id, 'text': a.text, 'order': a.order}
                for a in page.answers.all()
            ]
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
    is_preview = request.GET.get('preview') == '1'
    try:
        if is_preview:
            test = Test.objects.get(id=test_id)
        else:
            test = Test.objects.get(id=test_id, status=Test.STATUS_PUBLISHED)
    except Test.DoesNotExist:
        return JsonResponse({'ok': False, 'message': 'Not found'}, status=404)

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'ok': False, 'message': 'Invalid JSON'}, status=400)

    # answers: {page_id: answer_value}
    # For quiz: answer_value is list of answer ids
    # For input: answer_value is string
    submitted = body.get('answers', {})

    results = []
    score = 0
    total = 0

    for page in test.pages.filter(type__in=[TestPage.TYPE_QUIZ, TestPage.TYPE_INPUT, TestPage.TYPE_CODE]):
        page_id_str = str(page.id)
        user_answer = submitted.get(page_id_str)
        result = {'page_id': page.id, 'type': page.type}

        if page.type == TestPage.TYPE_QUIZ:
            total += 1
            correct_ids = set(
                page.answers.filter(is_correct=True).values_list('id', flat=True)
            )
            selected_ids = set(int(x) for x in (user_answer or []) if str(x).isdigit())
            is_correct = correct_ids == selected_ids
            if is_correct:
                score += 1
            result['correct'] = is_correct
            result['correct_answer_ids'] = list(correct_ids)
            result['selected_answer_ids'] = list(selected_ids)

        elif page.type == TestPage.TYPE_INPUT:
            total += 1
            correct_answers = list(
                page.answers.filter(is_correct=True).values_list('text', flat=True)
            )
            user_text = (user_answer or '').strip().lower()
            is_correct = any(user_text == ans.strip().lower() for ans in correct_answers)
            if is_correct:
                score += 1
            result['correct'] = is_correct
            result['correct_text'] = correct_answers[0] if correct_answers else ''

        elif page.type == TestPage.TYPE_CODE:
            total += 1
            code_answer = user_answer if isinstance(user_answer, dict) else {}
            passed_cases = code_answer.get('passed', 0)
            total_cases = code_answer.get('total', 0)
            is_correct = total_cases > 0 and passed_cases == total_cases
            if is_correct:
                score += 1
            result['correct'] = is_correct
            result['passed_cases'] = passed_cases
            result['total_cases'] = total_cases

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


@require_GET
def api_tests_catalog(request):
    from companies.models import Company
    company_names = {c.username: c.name for c in Company.objects.all()}
    tests = Test.objects.filter(status=Test.STATUS_PUBLISHED).prefetch_related('pages')
    result = []
    for test in tests:
        stats = test.stats or {}
        result.append({
            'id': test.id,
            'title': test.title,
            'description': test.description,
            'company_username': test.company_username,
            'company_name': company_names.get(test.company_username, test.company_username),
            'level': stats.get('level', ''),
            'category': stats.get('category', ''),
            'page_count': test.pages.count(),
            'url': f'/tests/{test.id}/',
        })
    return JsonResponse({'ok': True, 'tests': result})
