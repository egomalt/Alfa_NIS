/* Каталог компаний. API отдаёт только одобренные, поэтому фильтра
   «только верифицированные» здесь нет. */
import { api, byId, countOf, esc, initial, WORDS } from 'alfa/core';

const PAGE_SIZE = 6;
const ICONS = {
  tests:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  star: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6.5 7 .9-5 4.8 1.2 7-6.2-3.4L5.8 21 7 14.2 2 9.4l7-.9L12 2z"/></svg>',
  check:
    '<svg class="co-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><title>Проверена</title><path d="M5 13l4 4L19 7"/></svg>',
};

const state = { companies: [], query: '', industry: 'all', shown: PAGE_SIZE };

const testsLabel = (count) => (count ? countOf(count, WORDS.tests) : 'Нет тестов');

function filtered() {
  const query = state.query.trim().toLowerCase();
  return state.companies.filter(
    (company) =>
      (state.industry === 'all' || company.industry === state.industry) &&
      (!query ||
        `${company.name} ${company.description} ${company.city} ${company.industry}`.toLowerCase().includes(query)),
  );
}

function card(company) {
  const meta = [company.industry, company.city].filter(Boolean).join(' · ');
  const logo = company.avatar_url ? `<img src="${esc(company.avatar_url)}" alt="">` : esc(initial(company.name));
  const rating =
    company.avg_rating != null ? `<span class="co-stat co-rating">${ICONS.star}${company.avg_rating}</span>` : '';
  return `
    <a class="card co-card" href="${esc(company.profile_url)}">
      <div class="card-body">
        <div class="co-head">
          <div class="co-logo">${logo}</div>
          <div class="co-head-text">
            <div class="co-name"><span>${esc(company.name)}</span>${ICONS.check}</div>
            ${meta ? `<div class="co-meta">${esc(meta)}</div>` : ''}
          </div>
        </div>
        <div class="card-excerpt">${esc(company.description || 'Компания пока не добавила описание.')}</div>
        <div class="card-footer">
          <span class="co-stat">${ICONS.tests}${testsLabel(company.tests_count)}</span>
          <div class="card-meta">${rating}</div>
        </div>
      </div>
    </a>`;
}

function renderGrid() {
  const list = filtered();
  byId('co-count').textContent = list.length ? countOf(list.length, WORDS.companies) : '';
  byId('co-grid').innerHTML = list.length
    ? list.slice(0, state.shown).map(card).join('')
    : `<div class="state-msg">${state.query ? `По запросу «${esc(state.query)}» ничего не нашлось` : 'Компаний пока нет'}</div>`;
  byId('load-more-row').hidden = state.shown >= list.length;
}

function renderIndustries() {
  const counts = new Map();
  state.companies
    .filter((company) => company.industry)
    .forEach(({ industry }) => counts.set(industry, (counts.get(industry) ?? 0) + 1));
  const names = [...counts].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const chip = (value, label) =>
    `<button class="cr-chip ${state.industry === value ? 'active' : ''}" data-industry="${esc(value)}">${esc(label)}</button>`;
  const container = byId('industries');
  container.querySelectorAll('.cr-chip').forEach((node) => node.remove());
  container.insertAdjacentHTML('beforeend', chip('all', 'Все') + names.map((name) => chip(name, name)).join(''));
}

function renderTrending() {
  const top = state.companies
    .filter((company) => company.tests_count > 0)
    .sort((a, b) => b.tests_count - a.tests_count)
    .slice(0, 5);
  byId('trending-list').innerHTML = top.length
    ? top
        .map(
          (company, index) => `
      <a class="trending-item" href="${esc(company.profile_url)}">
        <span class="trending-num">${index + 1}</span>
        <span class="trending-body">
          <span class="trending-title">${esc(company.name)}</span>
          <span class="trending-meta">${testsLabel(company.tests_count)}</span>
        </span>
      </a>`,
        )
        .join('')
    : '<div class="trending-empty">Пока никто не опубликовал тесты</div>';
}

byId('industries').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-industry]');
  if (!chip) return;
  Object.assign(state, { industry: chip.dataset.industry, shown: PAGE_SIZE });
  renderIndustries();
  renderGrid();
});

byId('search-input').addEventListener('input', (event) => {
  Object.assign(state, { query: event.target.value, shown: PAGE_SIZE });
  renderGrid();
});

byId('btn-load').addEventListener('click', () => {
  state.shown += PAGE_SIZE;
  renderGrid();
});

// Кнопку «Стать компанией» показываем только тем, кто ещё не вошёл
api
  .get('/api/v1/auth/me/')
  .then(({ account }) => {
    byId('btn-join').hidden = Boolean(account);
  })
  .catch(() => null);

try {
  ({ companies: state.companies = [] } = await api.get('/api/v1/companies/'));
  renderIndustries();
  renderTrending();
  renderGrid();
} catch {
  byId('co-grid').innerHTML = '<div class="state-msg">Не удалось загрузить компании</div>';
}
