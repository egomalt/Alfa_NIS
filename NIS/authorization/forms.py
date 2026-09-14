from django import forms
from django.contrib.auth.password_validation import validate_password

from core.utils import validate_username
from .models import Account


class AccountRegistrationForm(forms.ModelForm):
    password = forms.CharField(
        label='Пароль', strip=False, widget=forms.PasswordInput,
        error_messages={'required': 'Придумайте пароль.'},
    )
    password_confirm = forms.CharField(
        label='Повторите пароль', strip=False, widget=forms.PasswordInput,
        error_messages={'required': 'Повторите пароль.'},
    )

    class Meta:
        model = Account
        fields = ['name', 'username', 'email']
        # Без этого Django собирает сообщение из английских имён модели и поля:
        # «Account с таким Username уже существует».
        error_messages = {
            'name': {'required': 'Укажите отображаемое имя.'},
            'username': {
                'required': 'Придумайте имя пользователя.',
                'unique': 'Это имя пользователя уже занято.',
            },
            'email': {'required': 'Укажите email.', 'invalid': 'Некорректный email.'},
        }

    def clean_username(self):
        return validate_username(self.cleaned_data.get('username'))

    def clean_password(self):
        password = self.cleaned_data.get('password') or ''
        validate_password(password)
        return password

    def clean(self):
        cleaned_data = super().clean()
        password = cleaned_data.get('password')
        password_confirm = cleaned_data.get('password_confirm')

        if password and password_confirm and password != password_confirm:
            self.add_error('password_confirm', 'Пароли не совпадают.')

        return cleaned_data

    def save(self, commit=True):
        account = super().save(commit=False)
        account.set_password(self.cleaned_data['password'])
        if commit:
            account.save()
        return account


class AccountLoginForm(forms.Form):
    username = forms.CharField(
        label='Имя пользователя',
        error_messages={'required': 'Введите имя пользователя.'},
    )
    password = forms.CharField(
        label='Пароль', strip=False, widget=forms.PasswordInput,
        error_messages={'required': 'Введите пароль.'},
    )
