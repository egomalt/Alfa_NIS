import io
import json
import math
import struct
import warnings
import zlib
from pathlib import Path

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from PIL import Image

from companies.models import Company
from core.uploads import UploadError, validate_image
from users.models import UserProfile

from .base import BaseCase


def image_file(format='PNG'):
    buffer = io.BytesIO()
    Image.new('RGB', (8, 8), 'red').save(buffer, format=format)
    extension = {'PNG': 'png', 'JPEG': 'jpg', 'WEBP': 'webp', 'GIF': 'gif'}[format]
    return SimpleUploadedFile(f'photo.{extension}', buffer.getvalue(), content_type=f'image/{format.lower()}')


def oversized_png(width, height):
    content = bytearray(image_file().read())
    content[16:24] = struct.pack('>II', width, height)
    content[29:33] = struct.pack('>I', zlib.crc32(content[12:29]) & 0xFFFFFFFF)
    return SimpleUploadedFile(f'image-{width}x{height}.png', bytes(content), content_type='image/png')


def image_above_pixel_limit(hard_error):
    edge = math.isqrt(Image.MAX_IMAGE_PIXELS) + 1
    return oversized_png(edge * (2 if hard_error else 1), edge)


class ImagePixelValidationTests(SimpleTestCase):
    def test_bomb_error_becomes_a_readable_upload_error(self):
        uploaded = image_above_pixel_limit(hard_error=True)
        with self.assertRaises(UploadError) as result:
            validate_image(uploaded)
        self.assertIn('разрешение', str(result.exception))
        self.assertEqual(uploaded.tell(), 0)

    def test_bomb_warning_is_rejected_too(self):
        uploaded = image_above_pixel_limit(hard_error=False)
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always')
            with self.assertRaises(UploadError) as result:
                validate_image(uploaded)
        self.assertIn('разрешение', str(result.exception))
        self.assertEqual(caught, [])
        self.assertEqual(uploaded.tell(), 0)

    def test_normal_formats_still_pass_after_a_rejection(self):
        filters = warnings.filters[:]
        pixel_limit = Image.MAX_IMAGE_PIXELS
        with self.assertRaises(UploadError):
            validate_image(image_above_pixel_limit(hard_error=False))
        self.assertEqual(warnings.filters, filters)
        self.assertEqual(Image.MAX_IMAGE_PIXELS, pixel_limit)
        for format in ('PNG', 'JPEG', 'WEBP', 'GIF'):
            with self.subTest(format=format):
                uploaded = image_file(format)
                self.assertIs(validate_image(uploaded), uploaded)
                self.assertEqual(uploaded.tell(), 0)


class ImageUploadApiTests(BaseCase):
    TARGETS = (
        ('kandidat', '/api/v1/candidates/kandidat/avatar/', UserProfile),
        ('firma', '/api/v1/companies/firma/profile/', Company),
    )

    def assert_rejected_without_changes(self, hard_error):
        for username, url, model in self.TARGETS:
            with self.subTest(username=username, hard_error=hard_error):
                client = self.login(username)
                self.assertEqual(client.post(url, {'avatar': image_file()}).status_code, 200)
                previous = model.objects.get(username=username).avatar.name
                files = {path for path in Path(settings.MEDIA_ROOT).rglob('*') if path.is_file()}
                response = client.post(url, {'avatar': image_above_pixel_limit(hard_error)})
                self.assertEqual(response.status_code, 400)
                self.assertFalse(response.json()['ok'])
                self.assertIn('разрешение', json.dumps(response.json(), ensure_ascii=False))
                current = model.objects.get(username=username).avatar
                self.assertEqual(current.name, previous)
                self.assertTrue(current.storage.exists(previous))
                self.assertEqual({path for path in Path(settings.MEDIA_ROOT).rglob('*') if path.is_file()}, files)

    def test_bomb_error_returns_400_and_preserves_existing_avatars(self):
        self.assert_rejected_without_changes(hard_error=True)

    def test_bomb_warning_returns_400_and_preserves_existing_avatars(self):
        self.assert_rejected_without_changes(hard_error=False)

    def test_regular_images_upload_for_candidates_and_companies(self):
        for username, url, model in self.TARGETS:
            client = self.login(username)
            for format in ('PNG', 'JPEG', 'WEBP'):
                with self.subTest(username=username, format=format):
                    response = client.post(url, {'avatar': image_file(format)})
                    self.assertEqual(response.status_code, 200)
                    self.assertTrue(response.json()['ok'])
                    current = model.objects.get(username=username).avatar
                    self.assertTrue(current.storage.exists(current.name))
