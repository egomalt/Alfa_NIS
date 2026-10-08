/* Каталог тренировочных тестов.
   Фильтры читаются из адреса (?q=, ?cat=, ?level=) — по таким ссылкам
   сюда ведут поиск и чипы с главной страницы. */
import { catalog, syncUrl } from 'alfa/catalog';
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
  level: params.get('level') || 'all',
  category: params.get('cat') || 'all',
  query: params.get('q') || '',
};

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

function renderTrending(top) {
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

const list = catalog({
  url: '/api/v1/tests/catalog/',
  key: 'tests',
  perPage: PAGE_SIZE,
  gridId: 'grid',
  card,
  empty: () =>
    state.query.trim()
      ? `По запросу «${state.query.trim()}» ничего не нашлось`
      : 'Под выбранные фильтры ничего не подходит',
  params: () => ({ q: state.query.trim(), level: state.level, category: state.category }),
  onTotal: (total) => {
    byId('count').textContent = total ? countOf(total, WORDS.tests) : '';
  },
  onExtras: ({ trending }) => renderTrending(trending),
});

function applyFilters(changes, { typing = false } = {}) {
  Object.assign(state, changes);
  syncChips();
  syncUrl({ q: state.query.trim(), cat: state.category, level: state.level });
  if (typing) list.reloadSoon();
  else list.reload();
}

document
  .querySelectorAll('.cr-chip[data-level]')
  .forEach((chip) => chip.addEventListener('click', () => applyFilters({ level: chip.dataset.level })));
document
  .querySelectorAll('.cr-chip[data-cat]')
  .forEach((chip) => chip.addEventListener('click', () => applyFilters({ category: chip.dataset.cat })));

const searchInput = byId('search-input');
searchInput.value = state.query;
searchInput.addEventListener('input', () => applyFilters({ query: searchInput.value }, { typing: true }));

// Кнопку «Создать тест» видят только те, кто может завести тест
api
  .get('/api/v1/auth/me/')
  .then(({ account }) => {
    byId('btn-create').hidden = !['company', 'user'].includes(account?.role);
  })
  .catch(() => null);

syncChips();
list.reload();
