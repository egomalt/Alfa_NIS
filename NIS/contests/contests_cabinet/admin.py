from django.contrib import admin

from .models import Contest, ContestAttachment, ContestSubmission


class ContestAttachmentInline(admin.TabularInline):
    model = ContestAttachment
    extra = 0


@admin.register(Contest)
class ContestAdmin(admin.ModelAdmin):
    list_display = ('title', 'company_username', 'status', 'deadline', 'participants_count')
    list_filter = ('status', 'category', 'level')
    search_fields = ('title', 'company_username')
    ordering = ('-created_at',)
    inlines = [ContestAttachmentInline]


@admin.register(ContestSubmission)
class ContestSubmissionAdmin(admin.ModelAdmin):
    list_display = ('contest', 'candidate_username', 'status', 'attempt', 'winner', 'created_at')
    list_filter = ('status', 'winner', 'liked')
    search_fields = ('candidate_username', 'candidate_name')
    ordering = ('-created_at',)
