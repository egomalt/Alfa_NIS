from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie


@ensure_csrf_cookie
def test_view_shell(request, test_id=None):
    return render(request, 'tests_app/test_view.html', {
        'app_path': request.path,
        'test_id': test_id,
    })
