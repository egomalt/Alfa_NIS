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

STATUS_ACTIVE = 'active'
STATUS_WARNED = 'warned'
STATUS_BANNED = 'banned'

STATUS_CHOICES = [
    (STATUS_ACTIVE, 'Активен'),
    (STATUS_WARNED, 'Предупреждён'),
    (STATUS_BANNED, 'Забанен'),
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
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE, db_index=True)
    ban_until = models.DateTimeField(null=True, blank=True)
    ban_reason = models.TextField(blank=True)
    warning_reason = models.TextField(blank=True)
    warned_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'accounts'
        ordering = ['-created_at']

    def __str__(self):
        return self.username

    @property
    def is_banned(self):
        """Активен ли бан прямо сейчас (с учётом истечения срока)."""
        if self.status != STATUS_BANNED:
            return False
        if self.ban_until is None:
            return True  # бессрочный бан
        from django.utils import timezone
        return timezone.now() < self.ban_until

    def refresh_ban_state(self):
        """Снимает бан, если срок истёк. Возвращает True, если что-то поменялось."""
        if self.status == STATUS_BANNED and self.ban_until is not None:
            from django.utils import timezone
            if timezone.now() >= self.ban_until:
                self.status = STATUS_ACTIVE
                self.ban_until = None
                self.ban_reason = ''
                self.save(update_fields=['status', 'ban_until', 'ban_reason'])
                return True
        return False
