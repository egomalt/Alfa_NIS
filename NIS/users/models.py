from django.db import models


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
