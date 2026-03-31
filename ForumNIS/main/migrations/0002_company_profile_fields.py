from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="company",
            name="address",
            field=models.CharField(blank=True, max_length=255, verbose_name="Адрес"),
        ),
        migrations.AddField(
            model_name="company",
            name="avatar",
            field=models.FileField(
                blank=True,
                upload_to="company_avatars/",
                validators=[django.core.validators.FileExtensionValidator(["jpg", "jpeg", "png", "webp"])],
                verbose_name="Аватар",
            ),
        ),
        migrations.AddField(
            model_name="company",
            name="city",
            field=models.CharField(blank=True, max_length=120, verbose_name="Город"),
        ),
        migrations.AddField(
            model_name="company",
            name="company_size",
            field=models.CharField(blank=True, max_length=120, verbose_name="Размер компании"),
        ),
        migrations.AddField(
            model_name="company",
            name="contact_email",
            field=models.EmailField(blank=True, max_length=254, verbose_name="Контактный email"),
        ),
        migrations.AddField(
            model_name="company",
            name="direction_1",
            field=models.CharField(blank=True, max_length=120, verbose_name="Направление 1"),
        ),
        migrations.AddField(
            model_name="company",
            name="direction_2",
            field=models.CharField(blank=True, max_length=120, verbose_name="Направление 2"),
        ),
        migrations.AddField(
            model_name="company",
            name="direction_3",
            field=models.CharField(blank=True, max_length=120, verbose_name="Направление 3"),
        ),
        migrations.AddField(
            model_name="company",
            name="direction_4",
            field=models.CharField(blank=True, max_length=120, verbose_name="Направление 4"),
        ),
        migrations.AddField(
            model_name="company",
            name="industry",
            field=models.CharField(blank=True, max_length=120, verbose_name="Индустрия"),
        ),
        migrations.AddField(
            model_name="company",
            name="phone",
            field=models.CharField(blank=True, max_length=50, verbose_name="Телефон"),
        ),
        migrations.AddField(
            model_name="company",
            name="website",
            field=models.URLField(blank=True, verbose_name="Сайт"),
        ),
        migrations.AlterField(
            model_name="company",
            name="registration_document",
            field=models.FileField(
                blank=True,
                upload_to="company_documents/",
                validators=[django.core.validators.FileExtensionValidator(["pdf"])],
                verbose_name="Подтверждающий PDF",
            ),
        ),
    ]
