from django.db import models


class Test(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_PUBLISHED = 'published'

    company_username = models.SlugField(max_length=50, db_index=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=16,
        choices=[(STATUS_DRAFT, 'Черновик'), (STATUS_PUBLISHED, 'Опубликован')],
        default=STATUS_DRAFT,
    )
    # TODO: добавить avg_score, pass_rate, avg_time когда будет детальное логирование прохождений
    stats = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class TestPage(models.Model):
    TYPE_TEXT = 'text'
    TYPE_QUIZ = 'quiz'
    TYPE_INPUT = 'input'
    TYPE_CODE = 'code'

    test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name='pages')
    order = models.PositiveIntegerField(default=0)
    type = models.CharField(max_length=16)
    title = models.CharField(max_length=500, blank=True)
    content = models.TextField(blank=True)
    page_meta = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['order']


class TestAnswer(models.Model):
    page = models.ForeignKey(TestPage, on_delete=models.CASCADE, related_name='answers')
    text = models.CharField(max_length=1000)
    is_correct = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']
