(function () {
    var appRoot = null;
    var bootstrap = window.ALFA_APP_BOOTSTRAP || {};
    var state = {
        route: parseRoute(bootstrap.path || window.location.pathname),
        formErrors: {},
        flash: "",
        formValues: {
            name: "",
            username: "",
            contact_email: "",
            login_username: "",
        },
    };

    function parseRoute(pathname) {
        if (pathname === "/authorization/signin/") {
            return { page: "login" };
        }

        return { page: "register" };
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
        return state.flash ? '<div class="app-alert app-alert-inline">' + escapeHtml(state.flash) + "</div>" : "";
    }

    function validateUsername(value) {
        var normalized = String(value || "").trim().toLowerCase();
        var formatMessage = "Имя пользователя может содержать только буквы, цифры, дефисы и символы подчёркивания.";

        if (!normalized) {
            return "Введите имя пользователя.";
        }

        if (normalized.indexOf(" ") !== -1) {
            return formatMessage;
        }

        if (normalized.length < 3) {
            return "Имя пользователя должно содержать минимум 3 символа.";
        }

        if (normalized.length > 50) {
            return "Имя пользователя не должно быть длиннее 50 символов.";
        }

        if (!/^[a-z0-9_-]+$/.test(normalized)) {
            return formatMessage;
        }

        if (!/^[a-z0-9].*[a-z0-9]$/.test(normalized) && normalized.length > 1) {
            return "Имя пользователя должно начинаться и заканчиваться буквой или цифрой.";
        }

        if (normalized.length === 1 && !/^[a-z0-9]$/.test(normalized)) {
            return "Имя пользователя должно начинаться и заканчиваться буквой или цифрой.";
        }

        return "";
    }

    function renderRegisterPage() {
        return '' +
            '<div class="landing-layout single-card-layout">' +
                '<section class="landing-form-card standalone-card">' +
                    '<div class="landing-form-inner">' +
                        '<div class="landing-form-topbar"><div class="landing-top-actions"><a href="/authorization/signin/" class="mini-link-button">Вход</a></div><button type="button" class="theme-toggle" data-theme-toggle>' + escapeHtml(getThemeLabel()) + "</button></div>" +
                        '<div class="form-intro"><h2>Регистрация компании</h2><p>Укажите отображаемое имя, имя пользователя для ссылки и рабочий email, чтобы создать кабинет.</p></div>' +
                        '<div class="company-only-chip">Компания</div>' +
                        renderFlash() +
                        '<form method="post" action="/api/companies/" data-api-form="register" class="company-signup-form">' +
                            '<div class="field"><label for="register-name">Отображаемое имя</label><input id="register-name" name="name" type="text" placeholder="Например, Alfa Career" value="' + escapeHtml(state.formValues.name) + '" required>' + formError("name") + "</div>" +
                            '<div class="field"><label for="register-username">Имя пользователя</label><input id="register-username" name="username" type="text" placeholder="Например, alfa-career" value="' + escapeHtml(state.formValues.username) + '" pattern="[a-z0-9_-]+" autocapitalize="off" autocomplete="off" spellcheck="false" required>' + formError("username") + "</div>" +
                            '<div class="field"><label for="register-email">Рабочий email</label><input id="register-email" name="contact_email" type="email" placeholder="team@company.com" value="' + escapeHtml(state.formValues.contact_email) + '" required>' + formError("contact_email") + "</div>" +
                            '<button type="submit" class="dark-button full-width">Создать кабинет компании</button>' +
                        "</form>" +
                    "</div>" +
                "</section>" +
            "</div>";
    }

    function renderLoginPage() {
        return '' +
            '<div class="landing-layout single-card-layout">' +
                '<section class="landing-form-card standalone-card">' +
                    '<div class="landing-form-inner">' +
                        '<div class="landing-form-topbar"><div class="landing-top-actions"><a href="/authorization/signup/" class="mini-link-button">Регистрация</a></div><button type="button" class="theme-toggle" data-theme-toggle>' + escapeHtml(getThemeLabel()) + "</button></div>" +
                        '<div class="form-intro"><h2>Вход по имени пользователя</h2><p>Введите имя пользователя компании, чтобы открыть кабинет и продолжить работу.</p></div>' +
                        renderFlash() +
                        '<form method="post" action="/api/login/" data-api-form="login" class="company-signup-form">' +
                            '<div class="field"><label for="login-username">Имя пользователя</label><input id="login-username" name="username" type="text" placeholder="alfa-career" value="' + escapeHtml(state.formValues.login_username) + '" required>' + formError("username") + "</div>" +
                            '<button type="submit" class="dark-button full-width">Войти</button>' +
                        "</form>" +
                    "</div>" +
                "</section>" +
            "</div>";
    }

    function render() {
        if (!appRoot) {
            return;
        }

        appRoot.innerHTML = state.route.page === "login" ? renderLoginPage() : renderRegisterPage();
        document.dispatchEvent(new CustomEvent("alfa:render"));
    }

    async function handleFormSubmit(event) {
        var form = event.target;
        if (!form.matches("[data-api-form]")) {
            return;
        }

        event.preventDefault();
        state.formErrors = {};
        state.flash = "";
        syncFormValues(form);

        if (form.dataset.apiForm === "register") {
            var username = state.formValues.username;
            var usernameError = validateUsername(username);
            if (usernameError) {
                state.formErrors.username = [{ message: usernameError }];
                render();
                return;
            }
        }

        render();

        try {
            var payload = await fetchJson(form.getAttribute("action"), {
                method: "POST",
                body: new URLSearchParams(new FormData(form)),
                headers: {
                    "X-CSRFToken": getCsrfToken(),
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                },
                credentials: "same-origin",
            });

            if (payload.next_url) {
                window.location.assign(payload.next_url);
                return;
            }
        } catch (error) {
            state.formErrors = (error.payload && error.payload.errors) || {};
            state.flash = (error.payload && error.payload.message) || error.message;
        }

        render();
    }

    function syncFormValues(form) {
        var data = new FormData(form);

        if (form.dataset.apiForm === "register") {
            state.formValues.name = (data.get("name") || "").toString();
            state.formValues.username = (data.get("username") || "").toString();
            state.formValues.contact_email = (data.get("contact_email") || "").toString();
        }

        if (form.dataset.apiForm === "login") {
            state.formValues.login_username = (data.get("username") || "").toString();
        }
    }

    function handleUsernameValidation(event) {
        var usernameInput = event.target.closest("#register-username");
        if (!usernameInput) {
            return;
        }

        state.formValues.username = usernameInput.value || "";
        var rawValue = state.formValues.username;
        if (!rawValue.trim()) {
            delete state.formErrors.username;
            render();
            return;
        }

        var usernameError = validateUsername(rawValue);
        if (usernameError) {
            state.formErrors.username = [{ message: usernameError }];
        } else {
            delete state.formErrors.username;
        }
        render();
    }

    document.addEventListener("DOMContentLoaded", function () {
        appRoot = document.getElementById("app");
        document.body.addEventListener("submit", handleFormSubmit);
        document.body.addEventListener("focusout", handleUsernameValidation);
        render();
    });
})();
