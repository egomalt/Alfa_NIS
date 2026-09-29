/* Каталог статей: главная статья, фильтр по тегам, поиск, популярное. */
import { api, byId, countOf, esc, formatDateLong, WORDS } from 'alfa/core';

const PAGE_SIZE = 6;
const AVATAR_COLORS = [
  ['#FCE7E8', '#C81E2D'],
  ['#E2F3EA', '#15935A'],
  ['#EDF0F6', '#3C434F'],
  ['#FBEEDA', '#B7770C'],
  ['rgba(61,31,110,.15)', '#6b3fa0'],
];
const ICONS = {
  clock:
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  eye: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  pattern:
    '<svg class="card-cover-pattern" viewBox="0 0 360 180" preserveAspectRatio="xMidYMid slice"><circle cx="280" cy="30" r="100" fill="rgba(255,255,255,.08)"/><circle cx="310" cy="160" r="130" fill="rgba(255,255,255,.05)"/><circle cx="40" cy="160" r="70" fill="rgba(255,255,255,.04)"/></svg>',
};

const state = { articles: [], tag: 'all', query: '', shown: PAGE_SIZE };

/* Собирает строку «а · б · в», пропуская пустые части */
const joinMeta = (...parts) => parts.filter(Boolean).join(' · ');
const viewsLabel = (views) => countOf(views || 0, WORDS.views);
const dayMonth = (value) => formatDateLong(value).replace(/\s\d{4}.*$/, '');

function authorOf(article) {
  const name = article.author_name || article.author_username || '?';
  const key = article.author_username || name;
  const [background, color] = AVATAR_COLORS[key.charCodeAt(0) % AVATAR_COLORS.length];
  return { name, letter: name.trim()[0].toUpperCase(), style: `background:${background};color:${color}` };
}

function filtered() {
  const query = state.query.trim().toLowerCase();
  return state.articles.filter((article) => {
    const tags = article.tags ?? [];
    const tagMatches = state.tag === 'all' || tags.includes(state.tag);
    const queryMatches =
      !query ||
      (article.title ?? '').toLowerCase().includes(query) ||
      tags.some((tag) => tag.toLowerCase().includes(query));
    return tagMatches && queryMatches;
  });
}

function renderFeatured(top) {
  const link = byId('featured');
  link.href = `/articles/${top.id}/`;
  link.hidden = false;
  byId('featured-cover-bg').style.background = top.cover;
  byId('featured-tags').innerHTML = (top.tags ?? [])
    .map((tag) => `<span class="featured-tag">${esc(tag)}</span>`)
    .join('');
  byId('featured-title').textContent = top.title || 'Без названия';
  byId('featured-excerpt').textContent = top.excerpt ?? '';

  const author = authorOf(top);
  const avatar = byId('featured-author-av');
  avatar.textContent = author.letter;
  avatar.style.cssText = author.style;
  byId('featured-author-name').textContent = author.name;
  byId('featured-author-date').textContent = joinMeta(
    dayMonth(top.published_at),
    top.read_time && `${top.read_time} мин чтения`,
  );
  byId('featured-views-count').textContent = top.views || 0;
}

function renderFilters() {
  const counts = new Map();
  state.articles.flatMap((article) => article.tags ?? []).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
  const tags = [...counts].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  byId('cats').insertAdjacentHTML(
    'beforeend',
    tags.map((tag) => `<button class="cr-chip" data-cat="${esc(tag)}">${esc(tag)}</button>`).join(''),
  );
}

function renderTrending() {
  const top = [...state.articles].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
  byId('trending-list').innerHTML = top
    .map(
      (article, index) => `
    <a class="trending-item" href="/articles/${article.id}/">
      <div class="trending-num">0${index + 1}</div>
      <div class="trending-body">
        <div class="trending-title">${esc(article.title || 'Без названия')}</div>
        <div class="trending-meta">${esc(joinMeta(article.views && viewsLabel(article.views), article.read_time && `${article.read_time} мин`))}</div>
      </div>
    </a>`,
    )
    .join('');
}

function card(article) {
  const author = authorOf(article);
  const tags = article.tags ?? [];
  return `
    <a class="card" href="/articles/${article.id}/">
      <div class="card-cover"><div class="card-cover-bg" style="background:${esc(article.cover)}"></div>${ICONS.pattern}</div>
      <div class="card-body">
        ${tags.length ? `<div class="card-tags">${tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div>` : ''}
        <div class="card-title">${esc(article.title || 'Без названия')}</div>
        <div class="card-excerpt">${esc(article.excerpt)}</div>
        <div class="card-footer">
          <div class="card-author">
            <div class="card-av" style="${author.style}">${esc(author.letter)}</div>
            <div class="card-author-name">${esc(author.name)}</div>
          </div>
          <div class="card-meta">
            ${article.read_time ? `<span class="meta-mono" title="Время чтения">${ICONS.clock}${article.read_time} мин</span>` : ''}
            <span class="stat-pill" title="${esc(viewsLabel(article.views))}">${ICONS.eye}${article.views || 0}</span>
          </div>
        </div>
      </div>
    </a>`;
}

function renderGrid() {
  const list = filtered();
  byId('art-count').textContent = countOf(list.length, WORDS.articles);
  byId('art-grid').innerHTML = list.length
    ? list.slice(0, state.shown).map(card).join('')
    : '<div class="state-msg">Статей не найдено</div>';
  byId('load-more-row').hidden = state.shown >= list.length;
}

byId('cats').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-cat]');
  if (!chip) return;
  Object.assign(state, { tag: chip.dataset.cat, shown: PAGE_SIZE });
  document.querySelectorAll('#cats .cr-chip').forEach((item) => item.classList.toggle('active', item === chip));
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

// Писать статьи могут только кандидаты
api
  .get('/api/v1/auth/me/')
  .then(({ account }) => {
    byId('btn-write').hidden = account?.role !== 'user';
  })
  .catch(() => null);

try {
  const { articles = [] } = await api.get('/api/v1/articles/catalog/');
  state.articles = articles;
  if (articles.length) {
    renderFeatured(articles[0]);
    renderFilters();
    renderTrending();
  }
  renderGrid();
} catch {
  byId('art-grid').innerHTML = '<div class="state-msg">Не удалось загрузить статьи</div>';
}
