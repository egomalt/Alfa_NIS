from django.db import models


class Article(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_PUBLISHED = 'published'

    author_username = models.SlugField(max_length=50, db_index=True)
    title = models.CharField(max_length=255, blank=True)
    excerpt = models.TextField(blank=True)
    # Тело статьи — HTML-строка из редактора. Раньше поле было объявлено как
    # JSONField(default=list), хотя списка там никогда не было: из-за этого
    # значения хранились JSON-закодированными, а проверки принимали поле за список.
    content = models.TextField(blank=True)
    tags = models.JSONField(default=list)
    status = models.CharField(max_length=20, default=STATUS_DRAFT)
    cover_index = models.IntegerField(default=0)
    read_time = models.IntegerField(default=0)
    views = models.IntegerField(default=0)
    likes = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        # Каталоги и профили фильтруют парой «автор + статус», отсюда составной индекс
        indexes = [
            models.Index(fields=['status', '-published_at'], name='article_status_pub_idx'),
            models.Index(fields=['author_username', 'status'], name='article_author_status_idx'),
        ]
        db_table = 'articles'
        ordering = ['-created_at']

    def __str__(self):
        return self.title or f'Article #{self.id}'


class ArticleVote(models.Model):
    article = models.ForeignKey(Article, on_delete=models.CASCADE, related_name='article_votes')
    voter_username = models.SlugField(max_length=50)
    direction = models.SmallIntegerField()  # 1 = up, -1 = down

    class Meta:
        db_table = 'article_votes'
        unique_together = ('article', 'voter_username')
