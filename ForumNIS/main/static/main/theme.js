(function () {
    var storageKey = "forum_theme";
    var root = document.documentElement;

    function updateThemeButtons(theme) {
        document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
            button.textContent = theme === "dark" ? "Светлая тема" : "Тёмная тема";
        });
    }

    function applyTheme(theme) {
        root.setAttribute("data-theme", theme);
        try {
            localStorage.setItem(storageKey, theme);
        } catch (error) {
        }

        updateThemeButtons(theme);
    }

    function getInitialTheme() {
        try {
            var saved = localStorage.getItem(storageKey);
            if (saved === "dark" || saved === "light") {
                return saved;
            }
        } catch (error) {
        }

        return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
    }

    if (!root.getAttribute("data-theme")) {
        root.setAttribute("data-theme", getInitialTheme());
    }

    document.addEventListener("click", function (event) {
        var button = event.target.closest("[data-theme-toggle]");
        if (!button) {
            return;
        }

        var nextTheme = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        applyTheme(nextTheme);
    });

    document.addEventListener("alfa:render", function () {
        updateThemeButtons(root.getAttribute("data-theme") || getInitialTheme());
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            updateThemeButtons(root.getAttribute("data-theme") || getInitialTheme());
        });
    } else {
        updateThemeButtons(root.getAttribute("data-theme") || getInitialTheme());
    }
})();
