from django.core.validators import RegexValidator
from django.db import models

ROLE_USER = 'user'
ROLE_COMPANY = 'company'
ROLE_MODERATOR = 'moderator'

ROLE_CHOICES = [
    (ROLE_USER, 'Пользователь'),
    (ROLE_COMPANY, 'Компания'),
    (ROLE_MODERATOR, 'Модератор'),
]


class Account(models.Model):
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
    role = models.CharField(max_length=32, choices=ROLE_CHOICES, default=ROLE_COMPANY)
    email = models.EmailField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'accounts'
        ordering = ['-created_at']

    def __str__(self):
        return self.username
