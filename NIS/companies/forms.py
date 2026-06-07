import re

from django import forms

from core.utils import validate_username
from .models import Company


class PDFValidationMixin:
    def clean_registration_document(self):
        document = self.cleaned_data.get('registration_document')
        if document and getattr(document, 'content_type', 'application/pdf') != 'application/pdf':
            raise forms.ValidationError('Загрузите файл в формате PDF.')
        return document


class CompanyProfileForm(PDFValidationMixin, forms.ModelForm):
    class Meta:
        model = Company
        fields = [
            'username', 'name', 'description', 'contact_email', 'phone', 'website',
            'address', 'city', 'company_size', 'industry', 'avatar', 'registration_document',
            'direction_1', 'direction_2', 'direction_3', 'direction_4',
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
