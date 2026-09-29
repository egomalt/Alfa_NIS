/* Все тесты компании — публичный список. Аноним получает только
   опубликованные, поэтому фильтр здесь по уровню, а не по статусу. */
import { api, countOf, esc, LEVELS, pageData, TEST_CATEGORIES, WORDS } from 'alfa/core';
import { filteredList, renderOwnerHeader } from 'alfa/profile-list';

const { username = '' } = pageData();

const card = (test) => {
  const meta = [TEST_CATEGORIES[test.category] ?? test.category, countOf(test.page_count, WORDS.questions)]
    .filter(Boolean)
    .join(' · ');
  const level = LEVELS[test.level] ? `<span class="ct-level ct-level-${test.level}">${LEVELS[test.level]}</span>` : '';
  return `
    <a class="ct-card" href="${esc(test.url)}">
      <div class="ct-card-main">
        <div class="ct-card-title">${esc(test.title || 'Без названия')}</div>
        <div class="ct-card-meta">${esc(meta)}</div>
      </div>
      <span class="ct-mono">${countOf(test.submissions, WORDS.attempts)}</span>
      ${level}
    </a>`;
};

const list = filteredList({
  prefix: 'ct',
  matches: (test, level) => test.level === level,
  card,
  empty: (hasAny) => `
    <div class="ct-empty">
      <div class="ct-empty-title">${hasAny ? 'Тестов не найдено' : 'Тестов пока нет'}</div>
      <div class="ct-empty-sub">${hasAny ? 'Попробуйте другой фильтр' : 'Компания ещё не опубликовала ни одного задания'}</div>
    </div>`,
});

try {
  const { company = {}, tests = [] } = await api.get(`/api/v1/companies/${username}/tests/`);
  renderOwnerHeader({ prefix: 'ct', owner: company, username, title: `Тесты «${company.name || username}»` });
  // Владелец видит здесь и свои черновики — на публичной странице они лишние
  list.show(tests.filter((test) => test.status === 'published'));
} catch (error) {
  list.fail(error.message);
}
