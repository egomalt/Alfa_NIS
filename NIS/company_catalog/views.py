from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie


@ensure_csrf_cookie
def companies_list_shell(request):
    return render(request, 'company_catalog/companies.html', {'app_path': request.path})
