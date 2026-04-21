from django.db.backends.signals import connection_created
from django.dispatch import receiver


@receiver(connection_created)
def configure_postgresql_connection(sender, connection, **kwargs):
    if connection.vendor != 'postgresql':
        return

    # Keep DB connection timezone aligned with Django settings.
    with connection.cursor() as cursor:
        cursor.execute("SET TIME ZONE 'Europe/Moscow';")
