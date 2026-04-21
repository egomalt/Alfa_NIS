from django.core.validators import FileExtensionValidator, RegexValidator
from django.db import models
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver


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


# Модель ролей и вспомогательные константы/функции
ROLE_GUEST = 'guest'
ROLE_USER = 'user'
ROLE_COMPANY = 'company'
ROLE_MODERATOR = 'moderator'

ROLE_CHOICES = [
    (ROLE_GUEST, 'Гость'),
    (ROLE_USER, 'Пользователь'),
    (ROLE_COMPANY, 'Компания'),
    (ROLE_MODERATOR, 'Модератор'),
]


class UserRole(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='userrole')
    role = models.CharField(max_length=32, choices=ROLE_CHOICES, default=ROLE_USER)

    class Meta:
        verbose_name = 'Роль пользователя'
        verbose_name_plural = 'Роли пользователей'

    def __str__(self):
        return f"{self.user.username}: {self.role}"


# Гарантируем создание записи UserRole для каждого нового пользователя (по умолчанию роль = user)
@receiver(post_save, sender=get_user_model())
def create_user_role(sender, instance, created, **kwargs):
    if created:
        UserRole.objects.create(user=instance)


def get_role_for_user(user):
    """Возвращает строковое имя роли для объекта пользователя. Неаутентифицированные пользователи -> ROLE_GUEST."""
    if not user or not getattr(user, 'is_authenticated', False):
        return ROLE_GUEST
    try:
        return user.userrole.role
    except UserRole.DoesNotExist:
        return ROLE_USER


# Добавляем удобное свойство `role` к модели User для доступа из шаблонов/кода
User = get_user_model()
if not hasattr(User, 'role'):
    @property
    def _role(self):
        return get_role_for_user(self)

    User.role = _role
