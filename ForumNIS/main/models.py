from django.core.validators import FileExtensionValidator, RegexValidator
from django.db import models


class Company(models.Model):
    username = models.SlugField(
        max_length=50,
        unique=True,
        validators=[
            RegexValidator(
                regex=r"^[a-zA-Z0-9_-]+$",
                message="Используйте только латинские буквы, цифры, дефис и подчёркивание.",
            )
        ],
        verbose_name="Имя пользователя",
    )
    name = models.CharField(max_length=255, verbose_name="Отображаемое имя")
    description = models.TextField(blank=True, verbose_name="Описание")
    contact_email = models.EmailField(blank=True, verbose_name="Контактный email")
    phone = models.CharField(max_length=50, blank=True, verbose_name="Телефон")
    website = models.URLField(blank=True, verbose_name="Сайт")
    address = models.CharField(max_length=255, blank=True, verbose_name="Адрес")
    city = models.CharField(max_length=120, blank=True, verbose_name="Город")
    company_size = models.CharField(max_length=120, blank=True, verbose_name="Размер компании")
    industry = models.CharField(max_length=120, blank=True, verbose_name="Индустрия")
    avatar = models.FileField(
        upload_to="company_avatars/",
        blank=True,
        validators=[FileExtensionValidator(["jpg", "jpeg", "png", "webp"])],
        verbose_name="Аватар",
    )
    registration_document = models.FileField(
        upload_to="company_documents/",
        blank=True,
        validators=[FileExtensionValidator(["pdf"])],
        verbose_name="Подтверждающий PDF",
    )
    direction_1 = models.CharField(max_length=120, blank=True, verbose_name="Направление 1")
    direction_2 = models.CharField(max_length=120, blank=True, verbose_name="Направление 2")
    direction_3 = models.CharField(max_length=120, blank=True, verbose_name="Направление 3")
    direction_4 = models.CharField(max_length=120, blank=True, verbose_name="Направление 4")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Компания"
        verbose_name_plural = "Компании"

    def __str__(self):
        return self.name

    @property
    def is_verified(self):
        return bool(self.registration_document)
