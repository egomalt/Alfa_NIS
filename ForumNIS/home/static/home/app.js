(() => {
    // Home page is server-rendered via Django templates.
    document.addEventListener('DOMContentLoaded', () => {
        document.dispatchEvent(new CustomEvent('alfa:render'));
    });
})();

