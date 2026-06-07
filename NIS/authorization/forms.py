from django import forms

from core.utils import validate_username
from .models import Account


class AccountRegistrationForm(forms.ModelForm):
    class Meta:
        model = Account
        fields = ['name', 'username', 'email']

    def clean_username(self):
        return validate_username(self.cleaned_data.get('username'))


class AccountLoginForm(forms.Form):
    username = forms.CharField(label='Имя пользователя')
