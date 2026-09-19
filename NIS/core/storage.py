"""Хранилище вне MEDIA_ROOT: прямой ссылки на такие файлы нет."""
import os

from django.conf import settings
from django.core.files.storage import FileSystemStorage


class PrivateStorage(FileSystemStorage):
    """FileSystemStorage в PRIVATE_MEDIA_ROOT.

    Путь читается при каждом обращении, чтобы тесты могли его подменить.
    """

    @property
    def base_location(self):
        return settings.PRIVATE_MEDIA_ROOT

    @property
    def location(self):
        return os.path.abspath(self.base_location)

    @property
    def base_url(self):
        raise ValueError('У приватного файла нет публичной ссылки.')


def private_storage():
    return PrivateStorage()
