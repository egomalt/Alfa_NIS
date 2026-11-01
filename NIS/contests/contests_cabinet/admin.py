from dataclasses import dataclass

from django.contrib import admin
from django.contrib.admin.widgets import AdminFileWidget
from django.db import models
from django.urls import reverse

from .models import Contest, ContestAttachment, ContestSubmission


@dataclass
class SubmissionFileLink:
    name: str
    url: str

    def __str__(self):
        return self.name


class SubmissionFileWidget(AdminFileWidget):
    def get_context(self, name, value, attrs):
        if value:
            value = SubmissionFileLink(value.name, reverse('contest_submission_file', args=[value.instance.pk]))
        return super().get_context(name, value, attrs)


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
    formfield_overrides = {models.FileField: {'widget': SubmissionFileWidget}}
    list_display = ('contest', 'candidate_username', 'status', 'attempt', 'winner', 'created_at')
    list_filter = ('status', 'winner', 'liked')
    search_fields = ('candidate_username', 'candidate_name')
    ordering = ('-created_at',)
