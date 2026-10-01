"""Тест-раннер проекта: загруженные в тестах файлы не попадают в настоящие папки.

Без него каждый прогон оставлял в media/ и private_media/ аватары, вложения
конкурсов и документы компаний — сотни файлов, на которые не ссылается база.
"""

import shutil
import tempfile

from django.test.runner import DiscoverRunner
from django.test.utils import override_settings


class TempMediaRunner(DiscoverRunner):
    def setup_test_environment(self, **kwargs):
        super().setup_test_environment(**kwargs)
        self._media_dir = tempfile.mkdtemp(prefix='nis-test-media-')
        # override_settings сообщает хранилищам о смене пути — прямое
        # присваивание в settings они бы не заметили
        self._media_override = override_settings(
            MEDIA_ROOT=f'{self._media_dir}/media',
            PRIVATE_MEDIA_ROOT=f'{self._media_dir}/private',
        )
        self._media_override.enable()

    def teardown_test_environment(self, **kwargs):
        self._media_override.disable()
        shutil.rmtree(self._media_dir, ignore_errors=True)
        super().teardown_test_environment(**kwargs)
