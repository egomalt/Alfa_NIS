from django.urls import path

import authorization.views as auth_views
import companies.views as company_views
import tests.constructor.views as constructor_views
import tests.tests_app.views as test_views
import articles.views as article_views
import users.views as user_views

urlpatterns = [
    # Auth
    path('auth/signup/',  auth_views.api_register, name='v1_api_signup'),
    path('auth/signin/',  auth_views.api_login,    name='v1_api_signin'),
    path('auth/signout/', auth_views.api_logout,   name='v1_api_signout'),
    path('auth/me/',      auth_views.api_me,        name='v1_api_me'),

    # Candidates
    path('candidates/<slug:username>/',        user_views.api_candidate_detail, name='v1_api_candidate_detail'),
    path('candidates/<slug:username>/update/', user_views.api_candidate_update, name='v1_api_candidate_update'),
    path('candidates/<slug:username>/avatar/', user_views.api_candidate_avatar, name='v1_api_candidate_avatar'),

    # Articles
    path('articles/my/',                      article_views.api_my_articles),
    path('articles/<int:article_id>/publish/', article_views.api_article_publish),

    # Companies
    path('companies/',                              company_views.api_companies_list),
    path('companies/<slug:username>/',              company_views.api_company_detail),
    path('companies/<slug:username>/profile/',      company_views.api_company_profile),
    path('companies/<slug:username>/verification/', company_views.api_company_verification),
    path('companies/<slug:username>/tests/',        company_views.api_company_tests),

    # Tests — constructor (CRUD)
    path('tests/',                              constructor_views.api_tests_list),
    path('tests/create/',                       constructor_views.api_tests_create),
    path('tests/catalog/',                      test_views.api_tests_catalog),
    path('tests/<int:test_id>/',                constructor_views.api_test_detail),
    path('tests/<int:test_id>/publish/',        constructor_views.api_test_publish),
    path('tests/pages/<int:page_id>/run/',      constructor_views.api_code_run),

    # Tests — taking (view & submit)
    path('tests/<int:test_id>/view/',           test_views.api_test_view),
    path('tests/<int:test_id>/submit/',         test_views.api_test_submit),
]
