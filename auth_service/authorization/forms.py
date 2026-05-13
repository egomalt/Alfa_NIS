import re

from django import forms

from .models import Account


def validate_account_username(raw_value):
    value = (raw_value or '').strip().lower()
    reserved = {'admin', 'api', 'authorization', 'companies', 'constructor', 'tests', 'static', 'media'}
    format_message = 'Имя пользователя может содержать только буквы, цифры, дефисы и символы подчёркивания.'

    if not value:
        raise forms.ValidationError('Введите имя пользователя.')

    if ' ' in value or len(value) < 3 or len(value) > 50 or not re.fullmatch(r'[a-z0-9_-]+', value):
        raise forms.ValidationError(format_message)

    if not value[0].isalnum() or not value[-1].isalnum():
        raise forms.ValidationError('Имя пользователя должно начинаться и заканчиваться буквой или цифрой.')

    if value in reserved:
        raise forms.ValidationError('Это имя пользователя уже занято.')

    return value


class AccountRegistrationForm(forms.ModelForm):
    class Meta:
        model = Account
        fields = ['name', 'username', 'email']

    def clean_username(self):
        return validate_account_username(self.cleaned_data.get('username'))


class AccountLoginForm(forms.Form):
    username = forms.CharField(label='Имя пользователя')
