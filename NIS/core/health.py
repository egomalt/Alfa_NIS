"""Проверка живости для Docker: сайт отвечает и база доступна."""

from django.db import connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET


@require_GET
def healthz(request):
    try:
        connection.ensure_connection()
    except Exception:
        return JsonResponse({'ok': False, 'database': 'unavailable'}, status=503)
    return JsonResponse({'ok': True})
