(() => {
    const STORAGE_KEY = 'alfa_theme';
    const ROOT = document.documentElement;

    // Подпись описывает действие кнопки, а не текущую тему:
    // светлая тема — «Тёмная тема» (переключить на тёмную), и наоборот.
    const LABELS = { light: 'Тёмная тема', dark: 'Светлая тема' };

    const getInitialTheme = () => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved === 'dark' || saved === 'light') return saved;
        } catch (_) {}
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };

    const syncToggles = (theme) => {
        const label = LABELS[theme] || LABELS.light;
        document.querySelectorAll('[data-theme-toggle]').forEach(button => {
            const labelEl = button.querySelector('[data-theme-label]');
            if (labelEl) labelEl.textContent = label;
            button.setAttribute('aria-label', label);
            button.setAttribute('title', label);
        });
    };

    const applyTheme = (theme) => {
        ROOT.setAttribute('data-theme', theme);
        try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
        syncToggles(theme);
    };

    if (!ROOT.getAttribute('data-theme')) {
        ROOT.setAttribute('data-theme', getInitialTheme());
    }

    const onReady = (fn) => {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    };
    onReady(() => syncToggles(ROOT.getAttribute('data-theme') || getInitialTheme()));

    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-theme-toggle]');
        if (!button) return;
        const current = ROOT.getAttribute('data-theme') || getInitialTheme();
        applyTheme(current === 'dark' ? 'light' : 'dark');
    });
})();
