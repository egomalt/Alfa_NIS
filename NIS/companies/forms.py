import re

from django import forms

from core.utils import validate_username
from .models import Company


MAX_DIRECTIONS = 10
DIRECTION_MAX_LEN = 60


def clean_directions(values):
    """Направления работы из формы: чистим, режем дубли и ограничиваем число.

    Повторы отсекаем без учёта регистра, но сохраняем написание как ввели:
    «Backend» и «backend» — одно направление, а не два.
    """
    result = []
    seen = set()
    for value in values:
        name = ' '.join(str(value).split())[:DIRECTION_MAX_LEN]
        key = name.casefold()
        if not name or key in seen:
            continue
        seen.add(key)
        result.append(name)
        if len(result) == MAX_DIRECTIONS:
            break
    return result


class PDFValidationMixin:
    def clean_registration_document(self):
        document = self.cleaned_data.get('registration_document')
        if document and getattr(document, 'content_type', 'application/pdf') != 'application/pdf':
            raise forms.ValidationError('Загрузите файл в формате PDF.')
        return document


class CompanyProfileForm(PDFValidationMixin, forms.ModelForm):
    class Meta:
        model = Company
        # directions сюда не входит: список разбирает clean_directions() во вьюхе
        fields = [
            'username', 'name', 'description', 'contact_email', 'phone', 'website',
            'address', 'city', 'company_size', 'industry', 'avatar', 'registration_document',
        ]

    def clean_username(self):
        return validate_username(self.cleaned_data.get('username'))

    def clean_company_size(self):
        value = (self.cleaned_data.get('company_size') or '').strip()
        if not value:
            return value
        normalized = value.replace('–', '-').replace('—', '-')
        numbers = re.findall(r'\d+', normalized)
        if not numbers:
            return value
        formatted_numbers = [f"{int(n):,}".replace(',', ' ') for n in numbers]
        if len(formatted_numbers) >= 2 and '-' in normalized:
            return f"{formatted_numbers[0]}-{formatted_numbers[1]} сотрудников"
        if len(formatted_numbers) == 1:
            return f"{formatted_numbers[0]} сотрудников"
        return ' - '.join(formatted_numbers) + ' сотрудников'

    def clean_website(self):
        value = (self.cleaned_data.get('website') or '').strip()
        if not value:
            return value
        if not value.startswith(('http://', 'https://')):
            value = f'https://{value}'
        return value


class CompanyVerificationForm(PDFValidationMixin, forms.ModelForm):
    class Meta:
        model = Company
        fields = ['registration_document']
