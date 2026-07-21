from django.db import models

ESCALATION_THRESHOLD = 3


class Report(models.Model):
    TARGET_ARTICLE = 'article'
    TARGET_USER = 'user'
    TARGET_COMPANY = 'company'
    TARGET_CONTEST = 'contest'
    TARGET_TEST = 'test'
    TARGET_CHOICES = [
        (TARGET_ARTICLE, 'Статья'),
        (TARGET_USER, 'Пользователь'),
        (TARGET_COMPANY, 'Компания'),
        (TARGET_CONTEST, 'Конкурс'),
        (TARGET_TEST, 'Тест'),
    ]

    STATUS_NEW = 'new'
    STATUS_RESOLVED = 'resolved'
    STATUS_DISMISSED = 'dismissed'
    STATUS_CHOICES = [
        (STATUS_NEW, 'Новая'),
        (STATUS_RESOLVED, 'Рассмотрена'),
        (STATUS_DISMISSED, 'Отклонена'),
    ]

    target_type = models.CharField(max_length=20, choices=TARGET_CHOICES)
    target_id = models.CharField(max_length=100)          # id материала или username пользователя/компании
    target_title = models.CharField(max_length=255)       # денормализовано для отображения
    target_url = models.CharField(max_length=255, blank=True)
    author_username = models.SlugField(max_length=50, blank=True)   # автор материала / нарушитель
    reporter_username = models.SlugField(max_length=50, blank=True)  # кто пожаловался
    reason = models.TextField()
    evidence = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_NEW, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'reports'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_target_type_display()}: {self.target_title}'
