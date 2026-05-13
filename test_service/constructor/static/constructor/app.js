(() => {
    document.addEventListener('DOMContentLoaded', () => {
        document.dispatchEvent(new CustomEvent('alfa:render'));
    });
})();
