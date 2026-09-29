/* Общее для публичных списков компании и кандидата: шапка с аватаром и фильтруемый список. */
import { byId, esc, initial } from 'alfa/core';

export function renderOwnerHeader({ prefix, owner, username, title }) {
  const back = byId(`${prefix}-back-link`);
  if (back) back.href = `/${username}/`;
  const avatar = byId(`${prefix}-company-av`);
  if (avatar) {
    if (owner.avatar_url) avatar.innerHTML = `<img src="${esc(owner.avatar_url)}" alt="">`;
    else avatar.textContent = initial(owner.name || username);
  }
  const heading = byId(`${prefix}-page-title`);
  if (heading) {
    const badge = owner.is_verified ? ` <span class="${prefix}-verified">✓</span>` : '';
    heading.innerHTML = `${esc(title)}${badge}`;
  }
}

/* Список с чипами фильтров: возвращает функцию, которой отдают загруженные элементы */
export function filteredList({ prefix, matches, card, empty }) {
  let items = [];
  let active = 'all';
  const list = byId(`${prefix}-list`);

  const render = () => {
    const visible = active === 'all' ? items : items.filter((item) => matches(item, active));
    byId(`${prefix}-count`).textContent = `${visible.length} из ${items.length}`;
    list.innerHTML = visible.length ? visible.map(card).join('') : empty(items.length > 0);
  };

  document.querySelectorAll(`.${prefix}-filter-btn`).forEach((button) => {
    button.addEventListener('click', () => {
      active = button.dataset.f;
      document
        .querySelectorAll(`.${prefix}-filter-btn`)
        .forEach((other) => other.classList.toggle('active', other.dataset.f === active));
      render();
    });
  });

  return {
    show(loaded) {
      items = loaded;
      render();
    },
    fail(message) {
      list.innerHTML = `<div class="${prefix}-empty"><div class="${prefix}-empty-sub">${esc(message)}</div></div>`;
    },
  };
}
