import re

from django import forms
from django.core.files.uploadedfile import UploadedFile

from core.uploads import UploadError, validate_image, validate_pdf

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


class CompanyProfileForm(forms.ModelForm):
    class Meta:
        model = Company
        # directions сюда не входит: список разбирает clean_directions() во вьюхе
        fields = [
            'name',
            'description',
            'contact_email',
            'phone',
            'website',
            'address',
            'city',
            'company_size',
            'industry',
            'avatar',
        ]

    def clean_avatar(self):
        avatar = self.cleaned_data.get('avatar')
        # Проверяем только новый файл: уже сохранённый логотип не перечитываем
        if avatar and hasattr(avatar, 'content_type'):
            try:
                validate_image(avatar)
            except UploadError as error:
                raise forms.ValidationError(str(error)) from None
        return avatar

    def clean_company_size(self):
        value = (self.cleaned_data.get('company_size') or '').strip()
        if not value:
            return value
        normalized = value.replace('–', '-').replace('—', '-')
        numbers = re.findall(r'\d+', normalized)
        if not numbers:
            return value
        formatted_numbers = [f'{int(n):,}'.replace(',', ' ') for n in numbers]
        if len(formatted_numbers) >= 2 and '-' in normalized:
            return f'{formatted_numbers[0]}-{formatted_numbers[1]} сотрудников'
        if len(formatted_numbers) == 1:
            return f'{formatted_numbers[0]} сотрудников'
        return ' - '.join(formatted_numbers) + ' сотрудников'

    def clean_website(self):
        value = (self.cleaned_data.get('website') or '').strip()
        if not value:
            return value
        if not value.startswith(('http://', 'https://')):
            value = f'https://{value}'
        return value


class CompanyVerificationForm(forms.ModelForm):
    class Meta:
        model = Company
        fields = ['registration_document']

    def clean_registration_document(self):
        document = self.cleaned_data.get('registration_document')
        if not isinstance(document, UploadedFile):
            raise forms.ValidationError('Выберите новый PDF-документ для проверки.')
        try:
            validate_pdf(document)
        except UploadError as error:
            raise forms.ValidationError(str(error)) from None
        return document
