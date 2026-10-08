/* Главная: популярные компании, свежие тесты и поиск по тестам. */
import { api, byId, countOf, esc, initial, TEST_CATEGORIES, WORDS } from 'alfa/core';

const CHECK_ICON =
  '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>';
const ARROW_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>';

const placeholder = (text) => `<div class="cr-list-empty">${esc(text)}</div>`;

function companyRow(company) {
  const avatar = company.avatar_url ? `<img src="${esc(company.avatar_url)}" alt="">` : esc(initial(company.name));
  const meta = [company.industry, company.city].filter(Boolean).join(' · ');
  const verified = company.is_verified ? `<span class="cr-verified-dot">${CHECK_ICON}</span>` : '';
  const tests = company.tests_count ? countOf(company.tests_count, WORDS.tests) : 'Нет тестов';
  return `
    <a href="${esc(company.profile_url)}" class="cr-company-row">
      <span class="cr-company-initial">${avatar}</span>
      <div class="cr-company-main">
        <div class="cr-company-name">${esc(company.name)}${verified}</div>
        <div class="cr-company-meta">${esc(meta)}</div>
      </div>
      <span class="cr-tests-count">${esc(tests)}</span>
      <span class="cr-row-arrow">${ARROW_ICON}</span>
    </a>`;
}

function testCard(test) {
  const category = TEST_CATEGORIES[test.category] || 'Тест';
  return `
    <a href="${esc(test.url)}" class="cr-test-card">
      <span class="cr-test-card-tag">${esc(category)}</span>
      <div class="cr-test-card-title">${esc(test.title)}</div>
      <div class="cr-test-card-meta">${esc(test.owner_name || test.owner_username)} · ${esc(countOf(test.page_count, WORDS.questions))}</div>
      <span class="cr-btn-secondary cr-test-card-action">Начать тест</span>
    </a>`;
}

async function loadList(container, url, key, limit, render, emptyText, errorText) {
  if (!container) return;
  try {
    const items = (await api.get(url))[key].slice(0, limit);
    container.innerHTML = items.length ? items.map(render).join('') : placeholder(emptyText);
  } catch {
    container.innerHTML = placeholder(errorText);
  }
}

loadList(
  byId('home-companies'),
  '/api/v1/companies/?per_page=5',
  'companies',
  5,
  companyRow,
  'Компаний пока нет',
  'Не удалось загрузить компании',
);
loadList(
  byId('home-tests'),
  '/api/v1/tests/catalog/?per_page=3',
  'tests',
  3,
  testCard,
  'Тестов пока нет',
  'Не удалось загрузить тесты',
);

const searchInput = byId('hero-search');
const runSearch = () => {
  const query = searchInput.value.trim();
  location.href = query ? `/tests/?q=${encodeURIComponent(query)}` : '/tests/';
};
byId('hero-search-btn')?.addEventListener('click', runSearch);
searchInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') runSearch();
});
