from django.db import models


class Account(models.Model):
    """Read-only mirror of auth_service's accounts table in userProfile DB."""
    username = models.SlugField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    role = models.CharField(max_length=32)
    email = models.EmailField(blank=True)
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'accounts'
        app_label = 'users'

    def __str__(self):
        return self.username


class UserProfile(models.Model):
    username = models.SlugField(max_length=50, unique=True)
    bio = models.TextField(blank=True)
    avatar = models.ImageField(upload_to='user_avatars/', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_profiles'

    def __str__(self):
        return self.username
