from django.contrib import admin

from .models import Company


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = (
        "username",
        "name",
        "contact_email",
        "city",
        "industry",
        "company_size",
        "verification_status",
        "created_at",
        "updated_at",
    )
    list_filter = ("industry", "city", "created_at", "updated_at")
    search_fields = ("username", "name", "contact_email", "phone", "city", "industry", "website")
    readonly_fields = ("created_at", "updated_at", "verification_status")
    list_per_page = 20
    fieldsets = (
        (
            "Основное",
            {
                "fields": (
                    "name",
                    "username",
                    "description",
                    "industry",
                    "company_size",
                    "city",
                    "address",
                )
            },
        ),
        (
            "Контакты",
            {
                "fields": (
                    "contact_email",
                    "phone",
                    "website",
                )
            },
        ),
        (
            "Бренд и направления",
            {
                "fields": (
                    "avatar",
                    "direction_1",
                    "direction_2",
                    "direction_3",
                    "direction_4",
                )
            },
        ),
        (
            "Верификация",
            {
                "fields": (
                    "verification_status",
                    "registration_document",
                )
            },
        ),
        (
            "Системная информация",
            {
                "fields": ("created_at", "updated_at"),
            },
        ),
    )

    @admin.display(description="Статус")
    def verification_status(self, obj):
        return "Подтверждена" if obj.is_verified else "Не подтверждена"
