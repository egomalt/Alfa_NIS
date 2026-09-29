/* Перелистывание страниц для списков: renderPager(container, meta, (page) => { ... }).
   Блок сам прячется, когда страница всего одна. */

const pagerButton = (label, page, disabled, title) =>
  `<button type="button" class="cr-pager-btn" data-page="${page}" title="${title}" ${disabled ? 'disabled' : ''}>${label}</button>`;

export function renderPager(container, meta, onChange) {
  if (!container) return;
  const page = Number(meta?.page) || 1;
  const pages = Number(meta?.pages) || 1;
  const total = Number(meta?.total) || 0;

  container.classList.toggle('visible', pages > 1);
  if (pages <= 1) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    ${pagerButton('←', page - 1, page <= 1, 'Предыдущая')}
    <span class="cr-pager-info">${page} / ${pages} · всего ${total}</span>
    ${pagerButton('→', page + 1, page >= pages, 'Следующая')}`;

  container.onclick = (event) => {
    const button = event.target.closest('[data-page]');
    const target = Number(button?.dataset.page);
    if (target >= 1 && target <= pages) onChange(target);
  };
}
