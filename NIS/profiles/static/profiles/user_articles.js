/* Все публикации кандидата — публичный список с фильтром по тегам. */
import { api, byId, countOf, esc, formatDateShort, initial, pageData, WORDS } from 'alfa/core';

const { username = '' } = pageData();

const ICONS = {
  lines:
    '<svg class="ua-card-cover-icon" viewBox="0 0 48 48" fill="none"><path d="M8 10h32M8 18h24M8 26h20M8 34h16" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>',
  clock:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  eye: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  // Стрелка, а не сердце: у статей голосование «за/против», рейтинг бывает отрицательным
  arrow:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>',
};

let articles = [];
let activeTag = 'all';

function card(article) {
  const date = formatDateShort(article.published_at);
  const tags = (article.tags ?? []).map((tag) => `<span class="ua-card-tag">${esc(tag)}</span>`).join('');
  const meta = [
    article.read_time && `<span class="ua-card-mono">${ICONS.clock}${article.read_time} мин</span>`,
    date && `<span class="ua-card-meta">${esc(date)}</span>`,
  ]
    .filter(Boolean)
    .join('<span class="ua-card-dot">·</span>');
  return `
    <a class="ua-card" href="/articles/${esc(article.id)}/">
      <div class="ua-card-cover ${article.cover ? '' : 'is-empty'}" ${article.cover ? `style="background:${esc(article.cover)}"` : ''}>${ICONS.lines}</div>
      <div class="ua-card-body">
        ${tags ? `<div class="ua-card-tags">${tags}</div>` : ''}
        <div class="ua-card-title">${esc(article.title)}</div>
        ${article.excerpt ? `<div class="ua-card-excerpt">${esc(article.excerpt)}</div>` : ''}
        <div class="ua-card-footer">
          ${meta}
          <div class="ua-card-footer-right">
            <span class="ua-stat-pill">${ICONS.eye}${article.views || 0}</span>
            <span class="ua-stat-pill" title="Рейтинг статьи">${ICONS.arrow}${article.likes || 0}</span>
          </div>
        </div>
      </div>
    </a>`;
}

function render() {
  const tags = [...new Set(articles.flatMap((article) => article.tags ?? []))];
  const visible = activeTag === 'all' ? articles : articles.filter((article) => article.tags?.includes(activeTag));
  const chip = (value, label) =>
    `<button class="ua-filter-btn ${activeTag === value ? 'active' : ''}" data-tag="${esc(value)}">${esc(label)}</button>`;

  byId('ua-filters').innerHTML = `${chip('all', 'Все')}${tags.map((tag) => chip(tag, tag)).join('')}
    <span class="ua-filter-count">${visible.length} из ${articles.length}</span>`;
  byId('ua-grid').innerHTML = visible.length
    ? visible.map(card).join('')
    : '<div class="cr-list-empty">Нет статей.</div>';
}

byId('ua-filters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-tag]');
  if (!button) return;
  activeTag = button.dataset.tag;
  render();
});

try {
  const [candidateData, articlesData] = await Promise.all([
    api.get(`/api/v1/candidates/${username}/`),
    api.get(`/api/v1/candidates/${username}/articles/`),
  ]);
  const candidate = candidateData.candidate;
  articles = articlesData.articles ?? [];

  const avatar = byId('ua-author-av');
  if (candidate.avatar) avatar.innerHTML = `<img src="${esc(candidate.avatar)}" alt="">`;
  else avatar.textContent = initial(candidate.name);
  byId('ua-page-title').textContent = `Публикации ${candidate.name || username}`;
  byId('ua-page-sub').textContent = `${countOf(articles.length, WORDS.articles)} опубликовано`;
  byId('ua-back-link').href = `/${username}/`;
  render();
} catch (error) {
  byId('ua-page-sub').textContent = '';
  byId('ua-grid').innerHTML = `<div class="cr-list-empty">${esc(error.message)}</div>`;
}
