"""Валидаторы пароля с русскими текстами ошибок.

Логика проверок — стандартная джанговская (включая список из 20 000 самых частых паролей),
переопределены только сообщения: `django.contrib.auth` не подключён к проекту,
поэтому его переводы не загружаются и штатные тексты остались бы английскими.
"""
from django.contrib.auth import password_validation


class MinimumLengthValidator(password_validation.MinimumLengthValidator):
    def get_error_message(self):
        return f'Пароль слишком короткий: минимум {self.min_length} символов.'

    def get_help_text(self):
        return f'Пароль должен содержать минимум {self.min_length} символов.'


class CommonPasswordValidator(password_validation.CommonPasswordValidator):
    def get_error_message(self):
        return 'Этот пароль слишком простой и часто используется.'

    def get_help_text(self):
        return 'Не используйте распространённые пароли.'


class NumericPasswordValidator(password_validation.NumericPasswordValidator):
    def get_error_message(self):
        return 'Пароль не может состоять только из цифр.'

    def get_help_text(self):
        return 'Пароль не может состоять только из цифр.'
