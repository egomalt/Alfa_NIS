/* Перелистывание страниц для списков.
 *
 * Списочные эндпоинты отдают метаданные вместе с данными:
 *   {"ok": true, "users": [...], "page": 2, "per_page": 100, "total": 137, "pages": 2}
 *
 * Использование:
 *   AlfaPager.render(document.getElementById('users-pager'), meta, page => { ... });
 *
 * Блок сам прячется, когда страница всего одна.
 */
(() => {
  function button(label, page, disabled, title) {
    const attrs = [
      'type="button"',
      'class="cr-pager-btn"',
      `data-page="${page}"`,
      disabled ? 'disabled' : '',
      title ? `title="${title}"` : '',
    ].filter(Boolean).join(' ');
    return `<button ${attrs}>${label}</button>`;
  }

  function render(container, meta, onChange) {
    if (!container) return;

    const page = Number(meta?.page) || 1;
    const pages = Number(meta?.pages) || 1;
    const total = Number(meta?.total) || 0;

    if (pages <= 1) {
      container.className = 'cr-pager';
      container.innerHTML = '';
      return;
    }

    container.className = 'cr-pager visible';
    container.innerHTML = [
      button('←', page - 1, page <= 1, 'Предыдущая'),
      `<span class="cr-pager-info">${page} / ${pages} · всего ${total}</span>`,
      button('→', page + 1, page >= pages, 'Следующая'),
    ].join('');

    container.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = Number(btn.dataset.page);
        if (target >= 1 && target <= pages) onChange(target);
      });
    });
  }

  window.AlfaPager = { render };
})();
