from django import forms
import re

from .models import Company


def validate_company_username(raw_value):
    value = (raw_value or "").strip().lower()
    reserved = {"admin", "api", "authorization", "companies"}
    format_message = "Имя пользователя может содержать только буквы, цифры, дефисы и символы подчёркивания"

    if not value:
        raise forms.ValidationError("Введите имя пользователя")

    if " " in value or len(value) < 3 or len(value) > 50 or not re.fullmatch(r"[a-z0-9_-]+", value):
        raise forms.ValidationError(format_message)

    if not value[0].isalnum() or not value[-1].isalnum():
        raise forms.ValidationError("Имя пользователя должно начинаться и заканчиваться буквой или цифрой")

    if value in reserved:
        raise forms.ValidationError("Это имя пользователя уже занято")

    return value


class CompanyRegistrationForm(forms.ModelForm):
    class Meta:
        model = Company
        fields = ["name", "username", "contact_email"]
        labels = {
            "name": "Отображаемое имя",
            "username": "Имя пользователя",
            "contact_email": "Рабочий email",
        }
        widgets = {
            "name": forms.TextInput(attrs={"placeholder": "Например, Alfa Career"}),
            "username": forms.TextInput(
                attrs={
                    "placeholder": "Например, alfa-career",
                    "pattern": "[a-z0-9_-]+",
                    "autocapitalize": "off",
                    "autocomplete": "off",
                    "spellcheck": "false",
                }
            ),
            "contact_email": forms.EmailInput(attrs={"placeholder": "team@company.com"}),
        }

    def clean_username(self):
        return validate_company_username(self.cleaned_data.get("username"))


class CompanyLoginForm(forms.Form):
    username = forms.CharField(
        label="Имя пользователя",
        widget=forms.TextInput(attrs={"placeholder": "alfa-career"}),
    )


class CompanyProfileForm(forms.ModelForm):
    class Meta:
        model = Company
        fields = [
            "username",
            "name",
            "description",
            "contact_email",
            "phone",
            "website",
            "address",
            "city",
            "company_size",
            "industry",
            "avatar",
            "registration_document",
            "direction_1",
            "direction_2",
            "direction_3",
            "direction_4",
        ]
        labels = {
            "username": "Имя пользователя",
            "name": "Отображаемое имя",
            "description": "Описание компании",
            "contact_email": "Контактный email",
            "phone": "Телефон",
            "website": "Сайт",
            "address": "Адрес",
            "city": "Город",
            "company_size": "Размер компании",
            "industry": "Индустрия",
            "avatar": "Аватар компании",
            "registration_document": "PDF для подтверждения",
            "direction_1": "Направление 1",
            "direction_2": "Направление 2",
            "direction_3": "Направление 3",
            "direction_4": "Направление 4",
        }
        widgets = {
            "username": forms.TextInput(
                attrs={
                    "placeholder": "alfa-career",
                    "pattern": "[a-z0-9_-]+",
                    "autocapitalize": "off",
                    "autocomplete": "off",
                    "spellcheck": "false",
                }
            ),
            "name": forms.TextInput(attrs={"placeholder": "Alfa Career"}),
            "description": forms.Textarea(attrs={"rows": 6, "placeholder": "Кратко расскажите, чем занимается компания и какие команды вы развиваете."}),
            "contact_email": forms.EmailInput(attrs={"placeholder": "contact@company.com"}),
            "phone": forms.TextInput(attrs={"placeholder": "+7 (900) 000-00-00"}),
            "website": forms.URLInput(attrs={"placeholder": "https://company.com"}),
            "address": forms.TextInput(attrs={"placeholder": "ул. Пример, 10"}),
            "city": forms.TextInput(attrs={"placeholder": "Москва"}),
            "company_size": forms.TextInput(attrs={"placeholder": "50-200 сотрудников"}),
            "industry": forms.TextInput(attrs={"placeholder": "Software Development"}),
            "avatar": forms.FileInput(attrs={"accept": ".jpg,.jpeg,.png,.webp"}),
            "registration_document": forms.FileInput(attrs={"accept": ".pdf"}),
            "direction_1": forms.TextInput(attrs={"placeholder": "Frontend Development"}),
            "direction_2": forms.TextInput(attrs={"placeholder": "Backend Development"}),
            "direction_3": forms.TextInput(attrs={"placeholder": "DevOps"}),
            "direction_4": forms.TextInput(attrs={"placeholder": "QA Engineering"}),
        }

    def clean_username(self):
        return validate_company_username(self.cleaned_data.get("username"))

    def clean_registration_document(self):
        document = self.cleaned_data.get("registration_document")
        if document and getattr(document, "content_type", "application/pdf") != "application/pdf":
            raise forms.ValidationError("Загрузите файл в формате PDF.")
        return document

    def clean_company_size(self):
        value = (self.cleaned_data.get("company_size") or "").strip()
        if not value:
            return value

        normalized = value.replace("\u2013", "-").replace("\u2014", "-")
        numbers = re.findall(r"\d+", normalized)

        if not numbers:
            return value

        formatted_numbers = [f"{int(number):,}".replace(",", " ") for number in numbers]

        if len(formatted_numbers) >= 2 and "-" in normalized:
            return f"{formatted_numbers[0]}-{formatted_numbers[1]} сотрудников"

        if len(formatted_numbers) == 1:
            return f"{formatted_numbers[0]} сотрудников"

        return " - ".join(formatted_numbers) + " сотрудников"

    def clean_website(self):
        value = (self.cleaned_data.get("website") or "").strip()
        if not value:
            return value

        if not value.startswith(("http://", "https://")):
            value = f"https://{value}"

        return value


class CompanyVerificationForm(forms.ModelForm):
    class Meta:
        model = Company
        fields = ["registration_document"]
        labels = {
            "registration_document": "PDF, подтверждающий существование компании",
        }

    def clean_registration_document(self):
        document = self.cleaned_data["registration_document"]
        if document.content_type != "application/pdf":
            raise forms.ValidationError("Загрузите файл в формате PDF.")
        return document
