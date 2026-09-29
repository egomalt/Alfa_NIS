/* Каталог тренировочных тестов.
   Фильтры читаются из адреса (?q=, ?cat=, ?level=) — по таким ссылкам
   сюда ведут поиск и чипы с главной страницы. */
import { api, byId, countOf, esc, initial, LEVELS, TEST_CATEGORIES, WORDS } from 'alfa/core';

const PAGE_SIZE = 9;
const ICONS = {
  questions:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  people:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>',
  arrow:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
};

const passedLabel = (count) => {
  if (!count) return 'ещё никто не проходил';
  const verb = count % 10 === 1 && count % 100 !== 11 ? 'прошёл' : 'прошли';
  return `${count} ${verb}`;
};

/* Фильтры живут и в адресе, чтобы F5 и ссылка их сохраняли */

const params = new URLSearchParams(location.search);
const state = {
  tests: [],
  level: params.get('level') || 'all',
  category: params.get('cat') || 'all',
  query: params.get('q') || '',
  shown: PAGE_SIZE,
};

function syncUrl() {
  const next = new URLSearchParams();
  if (state.query.trim()) next.set('q', state.query.trim());
  if (state.category !== 'all') next.set('cat', state.category);
  if (state.level !== 'all') next.set('level', state.level);
  history.replaceState(null, '', `${location.pathname}${next.size ? `?${next}` : ''}`);
}

function filtered() {
  const query = state.query.trim().toLowerCase();
  return state.tests.filter(
    (test) =>
      (state.level === 'all' || test.level === state.level) &&
      (state.category === 'all' || test.category === state.category) &&
      (!query ||
        `${test.title} ${test.description} ${test.owner_name} ${test.owner_username}`.toLowerCase().includes(query)),
  );
}

function card(test) {
  const level = LEVELS[test.level] ? test.level : '';
  const author = test.owner_name || test.owner_username;
  const category = TEST_CATEGORIES[test.category] ?? test.category ?? '';
  return `
    <article class="card te-card" ${level ? `data-card-level="${level}"` : ''}>
      <div class="te-head">
        <span class="te-author-av">${esc(initial(author))}</span>
        <span class="te-author">${esc(author)}</span>
        ${level ? `<span class="te-level te-level-${level}">${LEVELS[level]}</span>` : ''}
      </div>
      <div class="card-title">${esc(test.title || 'Без названия')}</div>
      <div class="card-excerpt">${esc(test.description || 'Автор не добавил описание к заданию.')}</div>
      <div class="te-meta">
        <span class="co-stat">${ICONS.questions}${countOf(test.page_count, WORDS.questions)}</span>
        <span class="co-stat">${ICONS.people}${passedLabel(test.submissions)}</span>
        ${category ? `<span class="te-cat">${esc(category)}</span>` : ''}
      </div>
      <a class="te-start" href="${esc(test.url)}">Начать тест${ICONS.arrow}</a>
    </article>`;
}

function renderGrid() {
  const list = filtered();
  byId('count').textContent = list.length ? countOf(list.length, WORDS.tests) : '';
  byId('grid').innerHTML = list.length
    ? list.slice(0, state.shown).map(card).join('')
    : `<div class="state-msg">${
        state.query.trim()
          ? `По запросу «${esc(state.query.trim())}» ничего не нашлось`
          : 'Под выбранные фильтры ничего не подходит'
      }</div>`;
  byId('load-more-row').hidden = state.shown >= list.length;
}

function renderTrending() {
  const top = state.tests
    .filter((test) => test.submissions > 0)
    .sort((a, b) => b.submissions - a.submissions)
    .slice(0, 5);
  byId('trending-list').innerHTML = top.length
    ? top
        .map(
          (test, index) => `
      <a class="trending-item" href="${esc(test.url)}">
        <span class="trending-num">${index + 1}</span>
        <span class="trending-body">
          <span class="trending-title">${esc(test.title || 'Без названия')}</span>
          <span class="trending-meta">${passedLabel(test.submissions)}</span>
        </span>
      </a>`,
        )
        .join('')
    : '<div class="trending-empty">Эти задания ещё никто не проходил</div>';
}

function syncChips() {
  document
    .querySelectorAll('.cr-chip[data-level]')
    .forEach((chip) => chip.classList.toggle('active', chip.dataset.level === state.level));
  document
    .querySelectorAll('.cr-chip[data-cat]')
    .forEach((chip) => chip.classList.toggle('active', chip.dataset.cat === state.category));
}

function applyFilters(changes) {
  Object.assign(state, changes, { shown: PAGE_SIZE });
  syncChips();
  syncUrl();
  renderGrid();
}

document
  .querySelectorAll('.cr-chip[data-level]')
  .forEach((chip) => chip.addEventListener('click', () => applyFilters({ level: chip.dataset.level })));
document
  .querySelectorAll('.cr-chip[data-cat]')
  .forEach((chip) => chip.addEventListener('click', () => applyFilters({ category: chip.dataset.cat })));

const searchInput = byId('search-input');
searchInput.value = state.query;
searchInput.addEventListener('input', () => applyFilters({ query: searchInput.value }));

byId('btn-load').addEventListener('click', () => {
  state.shown += PAGE_SIZE;
  renderGrid();
});

// Кнопку «Создать тест» видят только те, кто может завести тест
api
  .get('/api/v1/auth/me/')
  .then(({ account }) => {
    byId('btn-create').hidden = !['company', 'user'].includes(account?.role);
  })
  .catch(() => null);

syncChips();
try {
  ({ tests: state.tests = [] } = await api.get('/api/v1/tests/catalog/'));
  renderTrending();
  renderGrid();
} catch {
  byId('grid').innerHTML = '<div class="state-msg">Не удалось загрузить тесты</div>';
}
