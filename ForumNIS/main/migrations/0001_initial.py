from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Company",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=255, verbose_name="Название компании")),
                ("description", models.TextField(blank=True, verbose_name="Описание")),
                (
                    "registration_document",
                    models.FileField(
                        upload_to="company_documents/",
                        validators=[django.core.validators.FileExtensionValidator(["pdf"])],
                        verbose_name="Подтверждающий PDF",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Компания",
                "verbose_name_plural": "Компании",
                "ordering": ["-created_at"],
            },
        ),
    ]
