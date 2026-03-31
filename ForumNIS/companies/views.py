from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods

from main.forms import CompanyProfileForm, CompanyVerificationForm
from main.models import Company


@ensure_csrf_cookie
def app_shell(request, username=None):
    if username:
        company = get_object_or_404(Company, username=username)
        tests_url = reverse("company_tests_page", args=[company.username])
        verification_url = reverse("company_verification_page", args=[company.username])

        if request.path == verification_url:
            return redirect("company_profile_page", username=company.username)

        if not company.is_verified and request.path == tests_url:
            return redirect("company_profile_page", username=company.username)

    return render(
        request,
        "companies/app.html",
        {
            "app_path": request.path,
            "company_username": username,
        },
    )


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
        "direction_1": company.direction_1,
        "direction_2": company.direction_2,
        "direction_3": company.direction_3,
        "direction_4": company.direction_4,
        "directions": [
            direction
            for direction in [
                company.direction_1,
                company.direction_2,
                company.direction_3,
                company.direction_4,
            ]
            if direction
        ],
        "created_at": company.created_at.isoformat(),
        "updated_at": company.updated_at.isoformat(),
        "is_verified": company.is_verified,
    }


def _serialize_form_errors(form):
    return {field: errors.get_json_data() for field, errors in form.errors.items()}


def _tests_payload():
    tests = []
    stats = {
        "total_tests": len(tests),
        "active_tests": len([test for test in tests if test["status"] == "Active"]),
        "submissions": sum(test["candidates"] for test in tests),
        "completion_rate": 0,
    }
    return {"tests": tests, "stats": stats}

@require_GET
def api_company_detail(request, username):
    company = get_object_or_404(Company, username=username)
    return JsonResponse({"ok": True, "company": _serialize_company(company)})


@require_http_methods(["POST"])
def api_company_profile(request, username):
    company = get_object_or_404(Company, username=username)
    form = CompanyProfileForm(request.POST, request.FILES, instance=company)
    if not form.is_valid():
        return JsonResponse({"ok": False, "errors": _serialize_form_errors(form)}, status=400)

    company = form.save()
    return JsonResponse({"ok": True, "company": _serialize_company(company)})


@require_http_methods(["POST"])
def api_company_verification(request, username):
    company = get_object_or_404(Company, username=username)
    form = CompanyVerificationForm(request.POST, request.FILES, instance=company)
    if not form.is_valid():
        return JsonResponse({"ok": False, "errors": _serialize_form_errors(form)}, status=400)

    company = form.save()
    return JsonResponse(
        {
            "ok": True,
            "company": _serialize_company(company),
            "next_url": reverse("company_profile_page", args=[company.username]),
        }
    )


@require_GET
def api_company_tests(request, username):
    company = get_object_or_404(Company, username=username)
    if not company.is_verified:
        return JsonResponse(
            {
                "ok": False,
                "message": "Сначала подтвердите компанию, чтобы открыть раздел тестов.",
                "next_url": reverse("company_profile_page", args=[company.username]),
            },
            status=403,
        )

    payload = _tests_payload()
    return JsonResponse(
        {
            "ok": True,
            "company": _serialize_company(company),
            "tests": payload["tests"],
            "stats": payload["stats"],
        }
    )
