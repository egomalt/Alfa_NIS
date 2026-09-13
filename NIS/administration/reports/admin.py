from django.contrib import admin

from .models import Report


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ('target_title', 'target_type', 'author_username', 'reporter_username', 'status', 'created_at')
    list_filter = ('status', 'target_type')
    search_fields = ('target_title', 'author_username', 'reporter_username', 'reason')
    ordering = ('-created_at',)
