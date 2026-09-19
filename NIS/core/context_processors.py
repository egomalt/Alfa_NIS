"""Переменные, доступные во всех шаблонах."""
from django.conf import settings


def asset_version(request):
    """Версия статики для сброса кэша браузера."""
    return {'ASSET_V': settings.ASSET_VERSION}
