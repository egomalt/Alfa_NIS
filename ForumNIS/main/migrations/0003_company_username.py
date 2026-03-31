from django.core.validators import RegexValidator
from django.db import migrations, models
from django.utils.text import slugify


def populate_company_usernames(apps, schema_editor):
    Company = apps.get_model("main", "Company")
    used = set(
        username
        for username in Company.objects.exclude(username="").values_list("username", flat=True)
    )

    for company in Company.objects.order_by("id"):
        if company.username:
            continue

        base = slugify(company.name or "", allow_unicode=False).replace("-", "_")
        if not base:
            base = f"company_{company.id}"

        candidate = base
        suffix = 2
        while candidate in used:
            candidate = f"{base}_{suffix}"
            suffix += 1

        company.username = candidate
        company.save(update_fields=["username"])
        used.add(candidate)


class Migration(migrations.Migration):
    dependencies = [
        ("main", "0002_company_profile_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="company",
            name="username",
            field=models.SlugField(
                blank=True,
                max_length=50,
                validators=[
                    RegexValidator(
                        message="Используйте только латинские буквы, цифры, дефис и подчёркивание.",
                        regex="^[a-zA-Z0-9_-]+$",
                    )
                ],
                verbose_name="Имя пользователя",
            ),
        ),
        migrations.RunPython(populate_company_usernames, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="company",
            name="username",
            field=models.SlugField(
                max_length=50,
                unique=True,
                validators=[
                    RegexValidator(
                        message="Используйте только латинские буквы, цифры, дефис и подчёркивание.",
                        regex="^[a-zA-Z0-9_-]+$",
                    )
                ],
                verbose_name="Имя пользователя",
            ),
        ),
    ]
