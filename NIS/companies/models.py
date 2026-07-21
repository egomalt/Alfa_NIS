from django.core.validators import FileExtensionValidator, RegexValidator
from django.db import models


class Company(models.Model):
    VERIF_NONE = 'none'
    VERIF_PENDING = 'pending'
    VERIF_APPROVED = 'approved'
    VERIF_REJECTED = 'rejected'
    VERIF_CHOICES = [
        (VERIF_NONE, 'Документ не загружен'),
        (VERIF_PENDING, 'На проверке'),
        (VERIF_APPROVED, 'Одобрено'),
        (VERIF_REJECTED, 'Отклонено'),
    ]

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
    verification_status = models.CharField(max_length=20, choices=VERIF_CHOICES, default=VERIF_NONE, db_index=True)
    verification_reason = models.TextField(blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    @property
    def is_verified(self):
        return self.verification_status == self.VERIF_APPROVED


class CompanyRating(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='ratings')
    user_username = models.SlugField(max_length=50)
    rating = models.SmallIntegerField()

    class Meta:
        unique_together = [('company', 'user_username')]
        db_table = 'company_ratings'

    def __str__(self):
        return f'{self.user_username} → {self.company.username}: {self.rating}'
