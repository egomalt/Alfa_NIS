from django.apps import AppConfig


class AdminModerationConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'administration.moderation'
    label = 'admin_moderation'
