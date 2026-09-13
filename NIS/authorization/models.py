from django.contrib.auth.models import AbstractBaseUser, BaseUserManager
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone

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


class AccountManager(BaseUserManager):
    def create_user(self, username, name='', password=None, **extra_fields):
        if not username:
            raise ValueError('Имя пользователя обязательно.')
        account = self.model(username=username, name=name or username, **extra_fields)
        account.set_password(password)
        account.save(using=self._db)
        return account

    def create_superuser(self, username, name='', password=None, **extra_fields):
        extra_fields.setdefault('role', ROLE_MODERATOR)
        return self.create_user(username, name=name, password=password, **extra_fields)


class Account(AbstractBaseUser):
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

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = []

    objects = AccountManager()

    class Meta:
        db_table = 'accounts'
        ordering = ['-created_at']

    def __str__(self):
        return self.username

    @property
    def is_active(self):
        """Django сверяется с этим полем на каждом запросе — забаненный теряет доступ сразу,
        не дожидаясь истечения своей сессии."""
        return not self.is_banned

    @property
    def is_staff(self):
        """Доступ в админку Django открыт только модераторам."""
        return self.role == ROLE_MODERATOR

    def has_perm(self, perm, obj=None):
        """Права выдаются по роли, а не через таблицы прав Django."""
        return self.role == ROLE_MODERATOR

    def has_module_perms(self, app_label):
        return self.role == ROLE_MODERATOR

    @property
    def is_banned(self):
        """Активен ли бан прямо сейчас (с учётом истечения срока)."""
        if self.status != STATUS_BANNED:
            return False
        if self.ban_until is None:
            return True  # бессрочный бан
        return timezone.now() < self.ban_until

    def refresh_ban_state(self):
        """Снимает бан, если срок истёк. Возвращает True, если что-то поменялось."""
        if self.status == STATUS_BANNED and self.ban_until is not None:
            if timezone.now() >= self.ban_until:
                self.status = STATUS_ACTIVE
                self.ban_until = None
                self.ban_reason = ''
                self.save(update_fields=['status', 'ban_until', 'ban_reason'])
                return True
        return False
