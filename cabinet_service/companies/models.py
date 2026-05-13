from django.core.validators import FileExtensionValidator, RegexValidator
from django.db import models


class Company(models.Model):
    username = models.SlugField(
        max_length=50,
        unique=True,
        validators=[
            RegexValidator(
                regex=r'^[a-zA-Z0-9_-]+$',
                message='Используйте только латинские буквы, цифры, дефис и подчёркивание.',
            )
        ],
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    contact_email = models.EmailField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    website = models.URLField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=120, blank=True)
    company_size = models.CharField(max_length=120, blank=True)
    industry = models.CharField(max_length=120, blank=True)
    avatar = models.FileField(
        upload_to='company_avatars/',
        blank=True,
        validators=[FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp'])],
    )
    registration_document = models.FileField(
        upload_to='company_documents/',
        blank=True,
        validators=[FileExtensionValidator(['pdf'])],
    )
    direction_1 = models.CharField(max_length=120, blank=True)
    direction_2 = models.CharField(max_length=120, blank=True)
    direction_3 = models.CharField(max_length=120, blank=True)
    direction_4 = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    @property
    def is_verified(self):
        return bool(self.registration_document)
