"""Проверка загружаемых файлов: расширение, размер и содержимое."""

import os

from PIL import Image, UnidentifiedImageError

MB = 1024 * 1024

MAX_AVATAR_SIZE = 5 * MB
MAX_DOCUMENT_SIZE = 25 * MB

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
DOCUMENT_EXTENSIONS = {
    '.pdf',
    '.zip',
    '.doc',
    '.docx',
    '.txt',
    '.md',
    '.csv',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.rar',
    '.7z',
}
ATTACHMENT_EXTENSIONS = DOCUMENT_EXTENSIONS | IMAGE_EXTENSIONS


class UploadError(ValueError):
    """Текст сообщения можно показывать пользователю."""


def human_size(size_bytes):
    """Размер файла в читаемом виде: «1.4 МБ»."""
    size = float(size_bytes or 0)
    for unit in ('Б', 'КБ', 'МБ', 'ГБ'):
        if size < 1024 or unit == 'ГБ':
            return f'{size:.0f} {unit}' if unit == 'Б' else f'{size:.1f} {unit}'
        size /= 1024
    return f'{size:.1f} ГБ'


def validate_upload(uploaded_file, allowed_extensions, max_size):
    """Бросает UploadError, если файл не подходит."""
    if uploaded_file is None:
        raise UploadError('Файл не передан.')

    extension = os.path.splitext(uploaded_file.name or '')[1].lower()
    if extension not in allowed_extensions:
        allowed = ', '.join(sorted(e.lstrip('.') for e in allowed_extensions))
        raise UploadError(f'Недопустимый тип файла. Разрешены: {allowed}.')

    if uploaded_file.size > max_size:
        raise UploadError(f'Файл больше {human_size(max_size)}.')

    return uploaded_file


# Что Pillow называет форматом — для сверки с расширением файла
IMAGE_FORMATS = {'JPEG', 'PNG', 'WEBP', 'GIF'}


def validate_image(uploaded_file, max_size=MAX_AVATAR_SIZE):
    """Картинка проверяется по содержимому: расширение .png у текстового
    файла или у чего похуже ещё не делает его изображением."""
    validate_upload(uploaded_file, IMAGE_EXTENSIONS, max_size)
    try:
        with Image.open(uploaded_file) as image:
            image_format = image.format
            image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise UploadError('Файл повреждён или не является изображением.') from None
    finally:
        uploaded_file.seek(0)
    if image_format not in IMAGE_FORMATS:
        raise UploadError('Загрузите изображение в формате JPG, PNG, WebP или GIF.')
    return uploaded_file


def validate_pdf(uploaded_file, max_size=MAX_DOCUMENT_SIZE):
    """PDF узнаётся по первым байтам: тип, присланный браузером, подделывается."""
    validate_upload(uploaded_file, {'.pdf'}, max_size)
    header = uploaded_file.read(5)
    uploaded_file.seek(0)
    if header != b'%PDF-':
        raise UploadError('Файл повреждён или не является PDF-документом.')
    return uploaded_file


def validate_attachment(uploaded_file, max_size=MAX_DOCUMENT_SIZE):
    return validate_upload(uploaded_file, ATTACHMENT_EXTENSIONS, max_size)
