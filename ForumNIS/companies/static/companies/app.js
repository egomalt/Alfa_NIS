(function () {
    var appRoot = null;
    var bootstrap = window.ALFA_APP_BOOTSTRAP || {};
    var state = {
        route: parseRoute(window.location.pathname),
        company: null,
        tests: [],
        stats: null,
        loading: true,
        formErrors: {},
        flash: "",
        modalOpen: false,
    };

    function parseRoute(pathname) {
        var verificationMatch = pathname.match(/^\/([^/]+)\/verification\/$/);
        if (verificationMatch) {
            return { page: "verification", username: verificationMatch[1] };
        }

        var testsMatch = pathname.match(/^\/([^/]+)\/tests\/$/);
        if (testsMatch) {
            return { page: "tests", username: testsMatch[1] };
        }

        var profileMatch = pathname.match(/^\/([^/]+)\/$/);
        if (profileMatch) {
            return { page: "profile", username: profileMatch[1] };
        }

        return { page: "profile", username: bootstrap.companyUsername || null };
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function getCookie(name) {
        var prefix = name + "=";
        var cookies = document.cookie ? document.cookie.split(";") : [];
        for (var index = 0; index < cookies.length; index += 1) {
            var cookie = cookies[index].trim();
            if (cookie.indexOf(prefix) === 0) {
                return decodeURIComponent(cookie.slice(prefix.length));
            }
        }
        return "";
    }

    function getCsrfToken() {
        var cookieToken = getCookie("csrftoken");
        if (cookieToken) {
            return cookieToken;
        }

        var meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute("content") || "" : "";
    }

    function formatDate(value) {
        if (!value) {
            return "";
        }

        var date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "";
        }

        return new Intl.DateTimeFormat("ru-RU").format(date);
    }

    function getCompanyInitial(company) {
        return escapeHtml((company && company.name ? company.name.charAt(0) : "A").toUpperCase());
    }

    function getThemeLabel() {
        return document.documentElement.getAttribute("data-theme") === "dark" ? "Светлая тема" : "Тёмная тема";
    }

    async function fetchJson(url, options) {
        var response = await fetch(url, options || {});
        var payload = null;

        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }

        if (!response.ok) {
            var failure = new Error((payload && (payload.message || payload.detail)) || "Ошибка запроса.");
            failure.status = response.status;
            failure.payload = payload;
            throw failure;
        }

        return payload;
    }

    function formError(fieldName) {
        var errors = state.formErrors[fieldName] || [];
        if (!errors.length) {
            return "";
        }

        return '<ul class="errorlist">' + errors.map(function (item) {
            return "<li>" + escapeHtml(item.message || item) + "</li>";
        }).join("") + "</ul>";
    }

    function renderFlash() {
        return state.flash ? '<div class="app-alert">' + escapeHtml(state.flash) + "</div>" : "";
    }

    function inputField(id, name, label, type, value, placeholder) {
        return '' +
            '<div class="field">' +
                '<label for="' + id + '">' + label + "</label>" +
                '<input id="' + id + '" name="' + name + '" type="' + type + '" value="' + escapeHtml(value) + '" placeholder="' + escapeHtml(placeholder) + '">' +
                formError(name) +
            "</div>";
    }

    function textareaField(id, name, label, value, placeholder) {
        return '' +
            '<div class="field">' +
                '<label for="' + id + '">' + label + "</label>" +
                '<textarea id="' + id + '" name="' + name + '" rows="6" placeholder="' + escapeHtml(placeholder) + '">' + escapeHtml(value) + "</textarea>" +
                formError(name) +
            "</div>";
    }

    function fileField(id, name, label, accept, currentFileUrl, currentFileLabel) {
        return '' +
            '<div class="field">' +
                '<label for="' + id + '">' + label + "</label>" +
                (currentFileUrl
                    ? '<div class="current-file"><span>Текущий файл:</span><a href="' + escapeHtml(currentFileUrl) + '" target="_blank" rel="noopener noreferrer">' + currentFileLabel + "</a></div>"
                    : "") +
                '<label class="file-picker" for="' + id + '">' +
                    '<span class="file-picker-button">Выбрать файл</span>' +
                    '<span class="file-picker-name" data-file-name="' + id + '">Файл не выбран</span>' +
                '</label>' +
                '<input class="file-input-hidden" id="' + id + '" name="' + name + '" type="file" accept="' + escapeHtml(accept) + '">' +
                formError(name) +
            "</div>";
    }

    function commonTopbar(company) {
        return '' +
            '<header class="topbar">' +
                '<div class="search-shell"><div class="page-kicker">Кабинет компании</div></div>' +
                '<div class="topbar-actions">' +
                    '<button type="button" class="theme-toggle" data-theme-toggle>' + escapeHtml(getThemeLabel()) + "</button>" +
                    '<div class="topbar-company">' +
                        (company.avatar_url
                            ? '<img src="' + escapeHtml(company.avatar_url) + '" alt="' + escapeHtml(company.name) + '" class="topbar-avatar">'
                            : '<span class="topbar-avatar placeholder">' + getCompanyInitial(company) + "</span>") +
                        "<span>" + escapeHtml(company.name) + "</span>" +
                    "</div>" +
                "</div>" +
            "</header>";
    }

    function commonSidebar(company, activeTab) {
        var profileHref = "/" + company.username + "/";
        var testsHref = company.is_verified ? "/" + company.username + "/tests/" : "/" + company.username + "/";

        return '' +
            '<aside class="sidebar">' +
                '<a href="' + profileHref + '" class="brand"><span class="brand-mark"></span><span>Alfa Career</span></a>' +
                '<nav class="sidebar-nav">' +
                    '<a href="' + profileHref + '" class="nav-item ' + (activeTab === "profile" ? "active" : "") + '">Профиль компании</a>' +
                    '<a href="' + testsHref + '" class="nav-item ' + (activeTab === "tests" ? "active" : "") + " " + (!company.is_verified ? "locked" : "") + '">Активные тесты</a>' +
                "</nav>" +
                (!company.is_verified
                    ? '<div class="lock-card"><div class="lock-title">Доступ ограничен</div><p>Сначала загрузите PDF, чтобы открыть кабинет компании и раздел тестов.</p><a href="/' + company.username + '/#verification-section" class="dark-button">Добавить файл</a></div>'
                    : "") +
            "</aside>";
    }

    function renderVerificationPage(company) {
        return '' +
            '<section class="verification-shell" id="verification-section">' +
                '<div class="verification-card">' +
                    '<div class="eyebrow-text">Step 2</div>' +
                    '<h1>Подтвердите компанию перед доступом к кабинету</h1>' +
                    '<p>Загрузите подтверждающий документ, чтобы открыть полный доступ к кабинету компании и его разделам.</p>' +
                    '<form method="post" action="/api/companies/' + company.username + '/verification/" enctype="multipart/form-data" data-api-form="verification" class="verification-form">' +
                        '<div class="field"><label for="verification-file">PDF, подтверждающий существование компании</label><label class="file-picker" for="verification-file"><span class="file-picker-button">Выбрать файл</span><span class="file-picker-name" data-file-name="verification-file">Файл не выбран</span></label><input class="file-input-hidden" id="verification-file" name="registration_document" type="file" accept=".pdf,application/pdf" required><div class="field-note">Поддерживается только PDF.</div>' + formError("registration_document") + "</div>" +
                        '<button type="submit" class="dark-button">Добавить файл и открыть кабинет</button>' +
                    "</form>" +
                "</div>" +
                '<div class="verification-aside"><div class="content-card compact"><h2>Что откроется после подтверждения</h2><ul class="feature-list"><li>Редактирование профиля компании</li><li>Загрузка аватара и замена PDF</li><li>Контактные данные и адрес</li><li>Направления работы компании</li><li>Раздел активных тестов</li></ul></div></div>' +
            "</section>";
    }

    function renderProfileModal(company) {
        return '' +
            '<div class="modal-overlay ' + (state.modalOpen ? "" : "hidden") + '" id="profile-edit-modal" data-modal>' +
                '<div class="modal-card">' +
                    '<div class="modal-header"><div><h2>Изменение информации о компании</h2><p>Обновите основные данные, контакты, направления работы и прикреплённые файлы.</p></div><button type="button" class="modal-close" data-modal-close="profile-edit-modal" aria-label="Закрыть">×</button></div>' +
                    '<form method="post" action="/api/companies/' + company.username + '/profile/" enctype="multipart/form-data" data-api-form="profile" class="profile-form modal-form">' +
                        '<div class="form-grid two-col">' +
                            inputField("profile-username", "username", "Имя пользователя", "text", company.username, "alfa-career") +
                            inputField("profile-name", "name", "Отображаемое имя", "text", company.name, "Alfa Career") +
                            inputField("profile-industry", "industry", "Индустрия", "text", company.industry, "Software Development") +
                            inputField("profile-size", "company_size", "Размер компании", "text", company.company_size, "50-200 сотрудников") +
                            inputField("profile-city", "city", "Город", "text", company.city, "Москва") +
                        "</div>" +
                        textareaField("profile-description", "description", "Описание компании", company.description, "Кратко расскажите, чем занимается компания и какие команды вы развиваете.") +
                        '<div class="form-grid two-col">' +
                            inputField("profile-email", "contact_email", "Контактный email", "email", company.contact_email, "contact@company.com") +
                            inputField("profile-phone", "phone", "Телефон", "text", company.phone, "+7 (900) 000-00-00") +
                            inputField("profile-website", "website", "Сайт", "text", company.website, "https://company.com") +
                            inputField("profile-address", "address", "Адрес", "text", company.address, "ул. Пример, 10") +
                            fileField("profile-avatar", "avatar", "Аватар компании", ".jpg,.jpeg,.png,.webp", company.avatar_url, "Открыть текущий аватар") +
                            fileField("profile-document", "registration_document", "PDF для подтверждения", ".pdf,application/pdf", company.registration_document_url, "Открыть текущий PDF") +
                        "</div>" +
                        '<div class="directions-form-grid">' +
                            inputField("direction-1", "direction_1", "Направление 1", "text", company.direction_1, "Frontend Development") +
                            inputField("direction-2", "direction_2", "Направление 2", "text", company.direction_2, "Backend Development") +
                            inputField("direction-3", "direction_3", "Направление 3", "text", company.direction_3, "DevOps") +
                            inputField("direction-4", "direction_4", "Направление 4", "text", company.direction_4, "QA Engineering") +
                        "</div>" +
                        '<div class="modal-actions"><button type="button" class="outline-button" data-modal-close="profile-edit-modal">Отмена</button><button type="submit" class="dark-button">Сохранить изменения</button></div>' +
                    "</form>" +
                "</div>" +
            "</div>";
    }

    function renderProfilePage(company) {
        return '' +
            '<div class="dashboard-layout">' +
                commonSidebar(company, "profile") +
                '<div class="main-area">' +
                    commonTopbar(company) +
                    '<section class="page-header-card">' +
                        '<div class="company-hero">' +
                            '<div class="company-hero-media">' +
                                (company.avatar_url
                                    ? '<img src="' + escapeHtml(company.avatar_url) + '" alt="' + escapeHtml(company.name) + '" class="company-avatar">'
                                    : '<div class="company-avatar placeholder">' + getCompanyInitial(company) + "</div>") +
                            "</div>" +
                            '<div class="company-hero-copy"><div class="hero-title-row"><h1>' + escapeHtml(company.name) + '</h1></div><div class="company-meta-row">' +
                                (company.is_verified ? '<span class="verification-pill"><span class="verification-pill-icon">✓</span><span>Подтверждена</span></span>' : "") +
                                (company.industry ? "<span>" + escapeHtml(company.industry) + "</span>" : "") +
                                (company.company_size ? "<span>" + escapeHtml(company.company_size) + "</span>" : "") +
                                (company.city ? "<span>" + escapeHtml(company.city) + "</span>" : "") +
                            "</div></div>" +
                        "</div>" +
                        '<button type="button" class="outline-button" data-modal-open="profile-edit-modal">Изменить профиль</button>' +
                    "</section>" +
                    renderFlash() +
                    (company.is_verified
                        ? '<section class="content-grid">' +
                            '<div class="left-column">' +
                                (company.description
                                    ? '<div class="content-card"><h2>О компании</h2><p class="about-text">' + escapeHtml(company.description) + "</p></div>"
                                    : '<div class="content-card empty-profile-card"><div class="empty-profile-inner"><h2>Описание компании пока не заполнено</h2><p>Откройте форму редактирования и добавьте базовую информацию, чтобы профиль выглядел законченно.</p><button type="button" class="dark-button" data-modal-open="profile-edit-modal">Добавить информацию</button></div></div>') +
                                (company.directions.length
                                    ? '<div class="content-card"><h2>Направления работы</h2><div class="directions-grid">' + company.directions.map(function (direction) {
                                        return '<div class="direction-chip">' + escapeHtml(direction) + "</div>";
                                    }).join("") + "</div></div>"
                                    : "") +
                            "</div>" +
                            '<div class="right-column">' +
                                '<div class="content-card compact"><h2>Контакты</h2><div class="info-list">' +
                                    (company.contact_email ? "<div><span>Email</span><strong>" + escapeHtml(company.contact_email) + "</strong></div>" : "") +
                                    (company.phone ? "<div><span>Телефон</span><strong>" + escapeHtml(company.phone) + "</strong></div>" : "") +
                                    (company.website ? '<div><span>Сайт</span><strong><a href="' + escapeHtml(company.website) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(company.website) + "</a></strong></div>" : "") +
                                    (!company.contact_email && !company.phone && !company.website ? "<div><span>Контакты</span><strong>Пока не заполнены</strong></div>" : "") +
                                "</div></div>" +
                                '<div class="content-card compact"><h2>Проверка</h2><div class="info-list"><div><span>Статус</span><strong>Подтверждена</strong></div><div><span>Дата обновления</span><strong>' + escapeHtml(formatDate(company.updated_at)) + "</strong></div>" +
                                    (company.address ? "<div><span>Адрес</span><strong>" + escapeHtml(company.address) + "</strong></div>" : "") +
                                "</div>" +
                                    (company.registration_document_url
                                        ? '<a href="' + escapeHtml(company.registration_document_url) + '" target="_blank" class="verification-file-card">Подтверждающий файл</a>'
                                        : "") +
                                "</div>" +
                            "</div>" +
                        "</section>"
                        : renderVerificationPage(company)) +
                    renderProfileModal(company) +
                "</div>" +
            "</div>";
    }

    function statBox(value, label) {
        return '<div class="stat-box"><strong>' + escapeHtml(value) + "</strong><span>" + escapeHtml(label) + "</span></div>";
    }

    function renderTestsTable(tests) {
        return '' +
            '<div class="table-wrapper"><table class="tests-table"><thead><tr><th>Название</th><th>Тип</th><th>Статус</th><th>Доступ</th><th>Задания</th><th>Кандидаты</th><th>Дата</th></tr></thead><tbody>' +
            tests.map(function (test) {
                return '<tr><td>' + escapeHtml(test.title) + "</td><td>" + escapeHtml(test.type) + '</td><td><span class="status-pill ' + escapeHtml(String(test.status || "").toLowerCase()) + '">' + escapeHtml(test.status) + "</span></td><td>" + escapeHtml(test.access) + "</td><td>" + escapeHtml(test.tasks) + "</td><td>" + escapeHtml(test.candidates) + "</td><td>" + escapeHtml(test.date) + "</td></tr>";
            }).join("") +
            "</tbody></table></div>";
    }

    function renderTestsPage(company) {
        return '' +
            '<div class="dashboard-layout">' +
                commonSidebar(company, "tests") +
                '<div class="main-area">' +
                    commonTopbar(company) +
                    '<section class="tests-header"><div><h1>Тесты и оценки</h1><p>Здесь отображается краткая информация по активным тестам и основным показателям компании.</p></div></section>' +
                    renderFlash() +
                    '<section class="stats-grid">' +
                        statBox(state.stats ? state.stats.total_tests : 0, "Всего тестов") +
                        statBox(state.stats ? state.stats.active_tests : 0, "Активные тесты") +
                        statBox(state.stats ? state.stats.submissions : 0, "Всего прохождений") +
                        statBox((state.stats ? state.stats.completion_rate : 0) + "%", "Процент завершения") +
                    "</section>" +
                    '<section class="content-card section-card"><div class="tests-table-header"><h2>Обзор активных тестов</h2><span class="muted-note">Только просмотр</span></div>' +
                        (state.tests.length
                            ? renderTestsTable(state.tests)
                            : '<div class="empty-state"><h3>Активных тестов пока нет</h3><p>Когда вы добавите тестирования, здесь появится их краткий обзор и основные показатели.</p></div>') +
                    "</section>" +
                "</div>" +
            "</div>";
    }

    function renderLoading() {
        return '<div class="loading-shell"><div class="loading-card"><div class="loading-title">Загружаем страницу</div><p>Подождите немного, данные компании скоро появятся на экране.</p></div></div>';
    }

    function renderNotFound(message) {
        return '' +
            '<div class="landing-layout single-card-layout">' +
                '<section class="landing-form-card standalone-card"><div class="landing-form-inner"><div class="form-intro"><h2>Страница недоступна</h2><p>' + escapeHtml(message) + '</p></div><a href="/" class="dark-button full-width">Вернуться на главную</a></div></section>' +
            "</div>";
    }

    function render() {
        var html = "";

        if (!appRoot) {
            return;
        }

        if (state.loading) {
            html = renderLoading();
        } else if (!state.company) {
            html = renderNotFound("Не удалось загрузить данные компании.");
        } else if (state.route.page === "tests") {
            html = renderTestsPage(state.company);
        } else {
            html = renderProfilePage(state.company);
        }

        appRoot.innerHTML = html;
        document.dispatchEvent(new CustomEvent("alfa:render"));
    }

    async function loadInitialData() {
        state.loading = true;
        state.flash = "";
        state.formErrors = {};
        render();

        try {
            if (state.route.page === "tests") {
                var testsPayload = await fetchJson("/api/companies/" + state.route.username + "/tests/");
                state.company = testsPayload.company;
                state.tests = testsPayload.tests || [];
                state.stats = testsPayload.stats || null;
            } else {
                var companyPayload = await fetchJson("/api/companies/" + state.route.username + "/");
                state.company = companyPayload.company;
            }
        } catch (error) {
            state.flash = (error.payload && error.payload.message) || error.message;
            if (error.payload && error.payload.next_url) {
                window.location.assign(error.payload.next_url);
                return;
            }
        } finally {
            state.loading = false;
            render();
        }
    }

    function closeModal() {
        state.modalOpen = false;
        state.formErrors = {};
        render();
    }

    async function handleFormSubmit(event) {
        var form = event.target;
        if (!form.matches("[data-api-form]")) {
            return;
        }

        event.preventDefault();
        state.formErrors = {};
        state.flash = "";
        render();

        var action = form.getAttribute("action");
        var headers = {
            "X-CSRFToken": getCsrfToken(),
        };
        var body;

        if (form.enctype === "multipart/form-data") {
            body = new FormData(form);
        } else {
            body = new URLSearchParams(new FormData(form));
            headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
        }

        try {
            var payload = await fetchJson(action, {
                method: "POST",
                body: body,
                headers: headers,
                credentials: "same-origin",
            });

            if (payload.company) {
                state.company = payload.company;
            }

            state.formErrors = {};

            if (form.dataset.apiForm === "profile") {
                state.flash = "Профиль компании сохранён.";
                state.modalOpen = false;
                if (payload.company && payload.company.username && payload.company.username !== state.route.username) {
                    window.location.assign("/" + payload.company.username + "/");
                    return;
                }
                render();
                return;
            }

            if (payload.next_url) {
                window.location.assign(payload.next_url);
                return;
            }

            render();
        } catch (error) {
            state.formErrors = (error.payload && error.payload.errors) || {};
            state.flash = (error.payload && error.payload.message) || error.message;
            render();
        }
    }

    function handleClick(event) {
        var openButton = event.target.closest("[data-modal-open]");
        if (openButton) {
            state.modalOpen = true;
            render();
            return;
        }

        var closeButton = event.target.closest("[data-modal-close]");
        if (closeButton) {
            closeModal();
            return;
        }

        if (event.target.matches("[data-modal]")) {
            closeModal();
        }
    }

    function handleKeydown(event) {
        if (event.key === "Escape" && state.modalOpen) {
            closeModal();
        }
    }

    function handleFileInputChange(event) {
        var input = event.target.closest(".file-input-hidden");
        if (!input) {
            return;
        }

        var fileNameTarget = document.querySelector('[data-file-name="' + input.id + '"]');
        if (!fileNameTarget) {
            return;
        }

        fileNameTarget.textContent = input.files && input.files.length
            ? input.files[0].name
            : "Файл не выбран";
    }

    document.addEventListener("DOMContentLoaded", function () {
        appRoot = document.getElementById("app");
        document.body.addEventListener("submit", handleFormSubmit);
        document.body.addEventListener("click", handleClick);
        document.body.addEventListener("change", handleFileInputChange);
        document.addEventListener("keydown", handleKeydown);
        loadInitialData();
    });
})();
