from django.contrib import admin

from .models import Article, ArticleVote


@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = ('title', 'author_username', 'status', 'views', 'likes', 'published_at')
    list_filter = ('status',)
    search_fields = ('title', 'author_username', 'excerpt')
    ordering = ('-created_at',)


@admin.register(ArticleVote)
class ArticleVoteAdmin(admin.ModelAdmin):
    list_display = ('article', 'voter_username', 'direction')
    search_fields = ('voter_username',)
