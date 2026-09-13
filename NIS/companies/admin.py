from django.contrib import admin

from .models import Company, CompanyRating


class CompanyRatingInline(admin.TabularInline):
    model = CompanyRating
    extra = 0


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ('username', 'name', 'verification_status', 'city', 'created_at')
    list_filter = ('verification_status', 'industry')
    search_fields = ('username', 'name', 'contact_email')
    ordering = ('-created_at',)
    inlines = [CompanyRatingInline]


@admin.register(CompanyRating)
class CompanyRatingAdmin(admin.ModelAdmin):
    list_display = ('company', 'user_username', 'rating')
    list_filter = ('rating',)
    search_fields = ('user_username',)
