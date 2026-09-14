from django.db import models


class Test(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_PUBLISHED = 'published'

    owner_username = models.SlugField(max_length=50, db_index=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=16,
        choices=[(STATUS_DRAFT, 'Черновик'), (STATUS_PUBLISHED, 'Опубликован')],
        default=STATUS_DRAFT,
    )
    # Уровень и категория теста. Средний балл, доля справившихся и число
    # прохождений здесь НЕ хранятся — они считаются по TestAttempt.
    stats = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['status'], name='test_status_idx'),
            models.Index(fields=['owner_username', 'status'], name='test_owner_status_idx'),
        ]
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


class TestAttempt(models.Model):
    """Одно прохождение теста: от открытия страницы до отправки ответов.

    Раньше существовал только счётчик в Test.stats, который увеличивался при
    отправке. По нему нельзя было посчитать ни средний балл, ни долю
    справившихся, ни брошенные попытки, а накручивался он перезагрузкой страницы.

    Незавершённая попытка (finished_at is NULL) — это либо человек, который
    сейчас проходит тест, либо тот, кто его бросил; различаются по давности.
    """

    test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name='attempts')
    # У анонимов пусто: тест открыт всем, различаем их по ключу сессии
    candidate_username = models.SlugField(max_length=50, blank=True, db_index=True)
    session_key = models.CharField(max_length=40, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    score = models.IntegerField(default=0)
    max_score = models.IntegerField(default=0)

    class Meta:
        indexes = [
            models.Index(fields=['test', 'finished_at'], name='attempt_test_finished_idx'),
            models.Index(fields=['test', '-started_at'], name='attempt_test_started_idx'),
        ]
        ordering = ['-started_at']

    def __str__(self):
        who = self.candidate_username or 'аноним'
        return f'{who} — {self.test_id} ({self.score}/{self.max_score})'

    @property
    def is_finished(self):
        return self.finished_at is not None

    @property
    def percent(self):
        return round(self.score / self.max_score * 100) if self.max_score else 0
