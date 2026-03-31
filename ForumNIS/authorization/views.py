from django.http import JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST

from main.forms import CompanyLoginForm, CompanyRegistrationForm
from main.models import Company


@ensure_csrf_cookie
def accounts_shell(request):
    return render(
        request,
        "authorization/app.html",
        {
            "app_path": request.path,
        },
    )


def _serialize_form_errors(form):
    return {field: errors.get_json_data() for field, errors in form.errors.items()}


def _serialize_company(company):
    return {
        "id": company.id,
        "username": company.username,
        "name": company.name,
        "description": company.description,
        "contact_email": company.contact_email,
        "phone": company.phone,
        "website": company.website,
        "address": company.address,
        "city": company.city,
        "company_size": company.company_size,
        "industry": company.industry,
        "avatar_url": company.avatar.url if company.avatar else "",
        "registration_document_url": (
            company.registration_document.url if company.registration_document else ""
        ),
        "is_verified": company.is_verified,
    }


@require_POST
def api_register_company(request):
    form = CompanyRegistrationForm(request.POST)
    if not form.is_valid():
        return JsonResponse({"ok": False, "errors": _serialize_form_errors(form)}, status=400)

    company = form.save()
    return JsonResponse(
        {
            "ok": True,
            "company": _serialize_company(company),
            "next_url": reverse("company_profile_page", args=[company.username]),
        },
        status=201,
    )


@require_POST
def api_login_company(request):
    form = CompanyLoginForm(request.POST)
    if not form.is_valid():
        return JsonResponse({"ok": False, "errors": _serialize_form_errors(form)}, status=400)

    username = form.cleaned_data["username"].strip().lower()
    company = Company.objects.filter(username__iexact=username).first()
    if not company:
        return JsonResponse(
            {
                "ok": False,
                "errors": {
                    "username": [
                        {
                            "message": "Компания с таким именем пользователя не найдена.",
                            "code": "not_found",
                        }
                    ]
                },
            },
            status=404,
        )

    next_url = (
        reverse("company_profile_page", args=[company.username])
        if company.is_verified
        else reverse("company_profile_page", args=[company.username])
    )
    return JsonResponse({"ok": True, "company": _serialize_company(company), "next_url": next_url})
