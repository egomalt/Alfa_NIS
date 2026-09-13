from django.contrib import admin

from .models import UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('username', 'created_at', 'updated_at')
    search_fields = ('username', 'bio')
    ordering = ('-created_at',)
