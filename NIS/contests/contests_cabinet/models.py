from django.db import models


class Contest(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_ACTIVE = 'active'
    STATUS_REVIEW = 'review'
    STATUS_FINISHED = 'finished'

    SUB_FILE = 'file'
    SUB_LINK = 'link'
    SUB_TEXT = 'text'

    company_username = models.SlugField(max_length=50, db_index=True)
    title = models.CharField(max_length=255, blank=True)
    excerpt = models.TextField(blank=True)
    case_text = models.TextField(blank=True)
    rules = models.JSONField(default=list)
    category = models.CharField(max_length=50, blank=True)
    level = models.CharField(max_length=50, blank=True)
    deadline = models.DateTimeField(null=True, blank=True)
    prize = models.CharField(max_length=255, blank=True)
    submission_type = models.CharField(max_length=10, default=SUB_FILE)
    submission_hint = models.TextField(blank=True)
    status = models.CharField(max_length=20, default=STATUS_DRAFT)
    participants_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'contests_cabinet'
        db_table = 'contests'
        ordering = ['-created_at']

    def __str__(self):
        return self.title or f'Contest #{self.id}'


class ContestAttachment(models.Model):
    contest = models.ForeignKey(Contest, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='contest_attachments/')
    name = models.CharField(max_length=255)
    size = models.IntegerField(default=0)

    class Meta:
        app_label = 'contests_cabinet'
        db_table = 'contest_attachments'

    def __str__(self):
        return self.name


class ContestSubmission(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_ACCEPTED = 'accepted'
    STATUS_REJECTED = 'rejected'

    contest = models.ForeignKey(Contest, on_delete=models.CASCADE, related_name='submissions')
    candidate_username = models.SlugField(max_length=50, db_index=True)
    candidate_name = models.CharField(max_length=100, blank=True)
    file = models.FileField(upload_to='contest_submissions/', blank=True)
    link = models.URLField(blank=True)
    text = models.TextField(blank=True)
    comment = models.TextField(blank=True)
    status = models.CharField(max_length=20, default=STATUS_PENDING)
    liked = models.BooleanField(default=False)
    winner = models.BooleanField(default=False)
    attempt = models.IntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'contests_cabinet'
        db_table = 'contest_submissions'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.candidate_username} → {self.contest_id}'
