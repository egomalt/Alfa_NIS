from django.urls import path

import authorization.views as auth_views
import companies.views as company_views
import tests.constructor.views as constructor_views
import tests.tests_app.views as test_views
import tests.tests_catalog.views as tests_catalog_views
import articles.constructor.views as article_constructor_views
import articles.articles_cabinet.views as article_cabinet_views
import articles.articles_catalog.views as article_catalog_views
import articles.articles_app.views as article_read_views
import users.views as user_views
import contests.contests_cabinet.api_views as contest_views

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
    path('articles/catalog/',                   article_catalog_views.api_articles_catalog),
    path('articles/<int:article_id>/vote/',     article_read_views.api_article_vote),
    path('articles/my/',                       article_cabinet_views.api_my_articles),
    path('articles/create/',                   article_constructor_views.api_article_create),
    path('articles/<int:article_id>/',         article_constructor_views.api_article_update),
    path('articles/<int:article_id>/publish/', article_constructor_views.api_article_publish),
    path('articles/<int:article_id>/delete/', article_constructor_views.api_article_delete),

    # Companies
    path('companies/',                              company_views.api_companies_list),
    path('companies/my-ratings/',                   company_views.api_my_company_ratings),
    path('companies/<slug:username>/',              company_views.api_company_detail),
    path('companies/<slug:username>/profile/',      company_views.api_company_profile),
    path('companies/<slug:username>/verification/', company_views.api_company_verification),
    path('companies/<slug:username>/tests/',        company_views.api_company_tests),
    path('companies/<slug:username>/rate/',         company_views.api_company_rate),

    # Tests — constructor (CRUD)
    path('tests/',                              constructor_views.api_tests_list),
    path('tests/create/',                       constructor_views.api_tests_create),
    path('tests/catalog/',                      tests_catalog_views.api_tests_catalog),
    path('tests/<int:test_id>/',                constructor_views.api_test_detail),
    path('tests/<int:test_id>/publish/',        constructor_views.api_test_publish),
    path('tests/pages/<int:page_id>/run/',      constructor_views.api_code_run),

    # Tests — taking (view & submit)
    path('tests/<int:test_id>/view/',           test_views.api_test_view),
    path('tests/<int:test_id>/submit/',         test_views.api_test_submit),

    # Contests — company cabinet
    path('contests/company/',                                         contest_views.api_company_contests),
    path('contests/',                                                 contest_views.api_contest_create),
    path('contests/catalog/',                                         contest_views.api_contests_catalog),
    path('contests/user-history/',                                    contest_views.api_user_contest_history),
    path('contests/<int:contest_id>/',                                contest_views.api_contest_detail),
    path('contests/<int:contest_id>/publish/',                        contest_views.api_contest_publish),
    path('contests/<int:contest_id>/submissions/',                    contest_views.api_contest_submissions),
    path('contests/<int:contest_id>/submissions/<int:sub_id>/',       contest_views.api_submission_update),
    path('contests/<int:contest_id>/submissions/<int:sub_id>/like/',  contest_views.api_submission_like),
    path('contests/<int:contest_id>/submissions/<int:sub_id>/winner/', contest_views.api_submission_winner),
    # Contests — public / candidate
    path('contests/<int:contest_id>/submit/',                         contest_views.api_contest_submit),
    path('contests/<int:contest_id>/my-submissions/',                 contest_views.api_my_submissions),
]
