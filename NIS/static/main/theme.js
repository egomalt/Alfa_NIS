(() => {
    const STORAGE_KEY = 'forum_theme';
    const ROOT = document.documentElement;

    const getInitialTheme = () => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved === 'dark' || saved === 'light') {
                return saved;
            }
        } catch (_error) {
        }

        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };

    const updateThemeButtons = (theme) => {
        const label = theme === 'dark' ? 'Светлая тема' : 'Тёмная тема';
        document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
            button.textContent = label;
        });
    };

    const applyTheme = (theme) => {
        ROOT.setAttribute('data-theme', theme);
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch (_error) {
        }

        updateThemeButtons(theme);
    };

    if (!ROOT.getAttribute('data-theme')) {
        ROOT.setAttribute('data-theme', getInitialTheme());
    }

    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-theme-toggle]');
        if (!button) {
            return;
        }

        const current = ROOT.getAttribute('data-theme') || getInitialTheme();
        applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    document.addEventListener('alfa:render', () => {
        updateThemeButtons(ROOT.getAttribute('data-theme') || getInitialTheme());
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            updateThemeButtons(ROOT.getAttribute('data-theme') || getInitialTheme());
        });
    } else {
        updateThemeButtons(ROOT.getAttribute('data-theme') || getInitialTheme());
    }
})();
