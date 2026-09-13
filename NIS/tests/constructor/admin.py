from django.contrib import admin

from .models import Test, TestAnswer, TestPage


class TestPageInline(admin.TabularInline):
    model = TestPage
    extra = 0


class TestAnswerInline(admin.TabularInline):
    model = TestAnswer
    extra = 0


@admin.register(Test)
class TestAdmin(admin.ModelAdmin):
    list_display = ('title', 'owner_username', 'status', 'created_at')
    list_filter = ('status',)
    search_fields = ('title', 'owner_username')
    ordering = ('-created_at',)
    inlines = [TestPageInline]


@admin.register(TestPage)
class TestPageAdmin(admin.ModelAdmin):
    list_display = ('test', 'order', 'type', 'title')
    list_filter = ('type',)
    inlines = [TestAnswerInline]
