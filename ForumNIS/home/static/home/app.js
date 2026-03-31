(function () {
    function getThemeLabel() {
        return document.documentElement.getAttribute("data-theme") === "dark" ? "Светлая тема" : "Тёмная тема";
    }

    function renderHomePage() {
        return '' +
            '<div class="home-shell">' +
                '<header class="home-topbar">' +
                    '<a href="/" class="landing-brand home-brand"><span class="brand-mark"></span><span>Alfa Career</span></a>' +
                    '<nav class="home-nav">' +
                        '<a href="/authorization/signup/" class="mini-link-button">Регистрация</a>' +
                        '<a href="/authorization/signin/" class="mini-link-button">Вход</a>' +
                        '<button type="button" class="theme-toggle" data-theme-toggle>' + getThemeLabel() + "</button>" +
                    "</nav>" +
                "</header>" +
                '<main class="home-placeholder">' +
                    '<div class="home-placeholder-card">' +
                        '<div class="eyebrow-text">Главная</div>' +
                        '<h1>Это главная страница</h1>' +
                        '<p>Бла бла бла бла Бла бла бла блаБла бла бла блаБла бла бла блаБла бла бла бла</p>' +
                    "</div>" +
                "</main>" +
            "</div>";
    }

    document.addEventListener("DOMContentLoaded", function () {
        var appRoot = document.getElementById("app");
        if (!appRoot) {
            return;
        }

        appRoot.innerHTML = renderHomePage();
        document.dispatchEvent(new CustomEvent("alfa:render"));
    });
})();
