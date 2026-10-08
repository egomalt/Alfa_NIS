import getpass
import json
import re

from django import forms
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError

# Логин подставляется в адрес профиля (/<username>/), поэтому совпадать
# с разделом сайта он не может — иначе профиль окажется недоступен
RESERVED_USERNAMES = {
    'admin',
    'administration',
    'api',
    'articles',
    'auth',
    'authorization',
    'cabinet',
    'candidates',
    'companies',
    'constructor',
    'contests',
    'django-admin',
    'export',
    'healthz',
    'help',
    'media',
    'profiles',
    'reports',
    'static',
    'tests',
}


def validate_username(raw_value):
    value = (raw_value or '').strip().lower()

    if not value:
        raise forms.ValidationError('Введите имя пользователя.')

    if not 3 <= len(value) <= 50:
        raise forms.ValidationError('Имя пользователя должно быть от 3 до 50 символов.')

    if not re.fullmatch(r'[a-z0-9_-]+', value):
        raise forms.ValidationError('Используйте только латинские буквы, цифры, дефис и подчёркивание.')

    if not value[0].isalnum() or not value[-1].isalnum():
        raise forms.ValidationError('Имя пользователя должно начинаться и заканчиваться латинской буквой или цифрой.')

    if value in RESERVED_USERNAMES:
        raise forms.ValidationError('Это имя пользователя уже занято.')

    return value


def serialize_form_errors(form):
    return {field: errors.get_json_data() for field, errors in form.errors.items()}


def load_json_body(request):
    """Разбирает JSON-тело запроса. Всегда возвращает словарь."""
    try:
        data = json.loads(request.body or '{}')
    except (ValueError, TypeError):
        return {}
    return data if isinstance(data, dict) else {}


def check_password_strength(raw_password):
    """Проверяет пароль правилами AUTH_PASSWORD_VALIDATORS."""
    try:
        validate_password(raw_password)
    except ValidationError as error:
        raise ValueError(' '.join(error.messages)) from error


def resolve_new_password(provided=''):
    """Пароль для management-команд: проверенный переданный или скрытый ввод."""
    if provided:
        check_password_strength(provided)
        return provided

    raw_password = getpass.getpass('Пароль: ')
    if raw_password != getpass.getpass('Повторите пароль: '):
        raise ValueError('Пароли не совпадают.')
    check_password_strength(raw_password)
    return raw_password
