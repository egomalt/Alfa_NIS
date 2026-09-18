"""Хранилище для файлов, которые нельзя раздавать напрямую.

MEDIA_ROOT отдаётся веб-сервером как есть: всё, что туда попало, открывается
по прямой ссылке любым, кто угадает имя файла. Для аватарок это и нужно,
а регистрационный документ компании — коммерческая бумага с ОГРН, ИНН и
адресом, и попасть в неё должны только модератор и сама компания.

Файлы отсюда лежат вне MEDIA_ROOT, маршрута к ним у сервера нет, и отдаёт
их вьюха, которая сначала проверяет права.
"""
import os

from django.conf import settings
from django.core.files.storage import FileSystemStorage


class PrivateStorage(FileSystemStorage):
    """FileSystemStorage, живущий в PRIVATE_MEDIA_ROOT.

    Путь читается при каждом обращении, а не фиксируется при загрузке
    моделей: иначе тесты не смогли бы подменить его на временную папку
    и писали бы файлы в рабочий каталог проекта.
    """

    @property
    def base_location(self):
        return settings.PRIVATE_MEDIA_ROOT

    @property
    def location(self):
        return os.path.abspath(self.base_location)

    @property
    def base_url(self):
        # Прямой ссылки у файла нет — .url должен падать, а не выдавать путь
        raise ValueError('У приватного файла нет публичной ссылки.')


def private_storage():
    return PrivateStorage()
