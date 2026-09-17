from django.contrib import admin

from .models import Account


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ('username', 'name', 'role', 'status', 'created_at', 'last_login')
    list_filter = ('role', 'status')
    search_fields = ('username', 'name', 'email')
    ordering = ('-created_at',)
    readonly_fields = ('password', 'last_login', 'created_at')
    fieldsets = (
        ('Аккаунт', {'fields': ('username', 'name', 'email', 'role')}),
        ('Модерация', {'fields': ('status', 'ban_until', 'ban_reason')}),
        ('Служебное', {'fields': ('password', 'last_login', 'created_at')}),
    )
