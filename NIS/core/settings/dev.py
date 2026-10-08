"""Разработка: отладка включена, база — SQLite, если не задан PostgreSQL."""

from .base import *  # noqa: F403

DEBUG = True
SECRET_KEY = 'dev-secret-key-only-for-local-run'
