(() => {
    const STORAGE_KEY = 'alfa_theme';
    const ROOT = document.documentElement;

    const getInitialTheme = () => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved === 'dark' || saved === 'light') return saved;
        } catch (_) {}
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };

    const applyTheme = (theme) => {
        ROOT.setAttribute('data-theme', theme);
        try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
    };

    if (!ROOT.getAttribute('data-theme')) {
        ROOT.setAttribute('data-theme', getInitialTheme());
    }

    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-theme-toggle]');
        if (!button) return;
        const current = ROOT.getAttribute('data-theme') || getInitialTheme();
        applyTheme(current === 'dark' ? 'light' : 'dark');
    });
})();
