import re

from django import forms


def validate_username(raw_value):
    value = (raw_value or '').strip().lower()
    reserved = {'admin', 'api', 'authorization', 'companies', 'constructor', 'tests', 'static', 'media'}

    if not value:
        raise forms.ValidationError('Введите имя пользователя.')

    if ' ' in value or len(value) < 3 or len(value) > 50 or not re.fullmatch(r'[a-z0-9_-]+', value):
        raise forms.ValidationError(
            'Имя пользователя может содержать только буквы, цифры, дефисы и символы подчёркивания.'
        )

    if not value[0].isalnum() or not value[-1].isalnum():
        raise forms.ValidationError('Имя пользователя должно начинаться и заканчиваться буквой или цифрой.')

    if value in reserved:
        raise forms.ValidationError('Это имя пользователя уже занято.')

    return value


def serialize_form_errors(form):
    return {field: errors.get_json_data() for field, errors in form.errors.items()}
