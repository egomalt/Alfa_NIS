/* Главная: рейтинг компаний и поиск по тестам. */
import { api, byId, esc, initial } from 'alfa/core';

const CHECK_ICON =
  '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>';
const ARROW_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>';
const STAR_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3 6.5 7 .9-5 4.8 1.2 7-6.2-3.4L5.8 21 7 14.2 2 9.4l7-.9L12 2z"/></svg>';

const placeholder = (text) => `<div class="cr-list-empty">${esc(text)}</div>`;

function companyRow(company) {
  const avatar = company.avatar_url ? `<img src="${esc(company.avatar_url)}" alt="">` : esc(initial(company.name));
  const meta = [company.industry, company.city].filter(Boolean).join(' · ');
  const verified = company.is_verified ? `<span class="cr-verified-dot">${CHECK_ICON}</span>` : '';
  const rating = Number(company.avg_rating).toFixed(1);
  return `
    <a href="${esc(company.profile_url)}" class="cr-company-row">
      <span class="cr-company-initial">${avatar}</span>
      <div class="cr-company-main">
        <div class="cr-company-name"><span class="cr-company-title" title="${esc(company.name)}">${esc(company.name)}</span>${verified}</div>
        <div class="cr-company-meta">${esc(meta)}</div>
      </div>
      <span class="cr-company-rating" aria-label="Рейтинг ${esc(rating)} из 5" title="Оценок: ${esc(company.rating_count)}">${STAR_ICON}${esc(rating)}</span>
      <span class="cr-row-arrow">${ARROW_ICON}</span>
    </a>`;
}

async function loadCompanies() {
  const container = byId('home-companies');
  if (!container) return;
  try {
    const { companies } = await api.get('/api/v1/companies/?sort=rating&per_page=5');
    container.innerHTML = companies.length
      ? companies.map(companyRow).join('')
      : placeholder('Пока нет компаний с оценками');
  } catch {
    container.innerHTML = placeholder('Не удалось загрузить компании');
  }
}

loadCompanies();

const searchInput = byId('hero-search');
const searchButton = byId('hero-search-btn');
const SEARCH_LABEL = searchButton?.textContent;
const runSearch = () => {
  if (searchButton.classList.contains('cr-busy')) return;
  searchButton.classList.add('cr-busy');
  searchButton.textContent = 'Ищем…';
  const query = searchInput.value.trim();
  location.href = query ? `/tests/?q=${encodeURIComponent(query)}` : '/tests/';
};
searchButton?.addEventListener('click', runSearch);
searchInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') runSearch();
});
document.querySelectorAll('.cr-hero .cr-chip').forEach((chip) => {
  chip.addEventListener('click', () => chip.classList.add('cr-busy'));
});
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  document.querySelectorAll('.cr-busy').forEach((node) => node.classList.remove('cr-busy'));
  if (searchButton) searchButton.textContent = SEARCH_LABEL;
});
