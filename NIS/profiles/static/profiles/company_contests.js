/* Все конкурсы компании — публичный список. */
import { api, CONTEST_STATUSES, countOf, esc, formatDate, pageData, statusPill, WORDS } from 'alfa/core';
import { filteredList, renderOwnerHeader } from 'alfa/profile-list';

const { username = '' } = pageData();

const card = (contest) => {
  const meta = [contest.category, contest.deadline && `дедлайн ${formatDate(contest.deadline)}`]
    .filter(Boolean)
    .join(' · ');
  return `
    <a class="cc-card" href="/contests/${esc(contest.id)}/">
      <div class="cc-card-main"><div class="cc-card-title">${esc(contest.title)}</div><div class="cc-card-meta">${esc(meta)}</div></div>
      <span class="cc-mono">${countOf(contest.participants_count, WORDS.participants)}</span>
      ${statusPill(CONTEST_STATUSES, contest.status)}
    </a>`;
};

const list = filteredList({
  prefix: 'cc',
  // «Завершённые» — и те, что ещё проверяются, и уже закрытые
  matches: (contest, filter) => (filter === 'active' ? contest.status === 'active' : contest.status !== 'active'),
  card,
  empty: () =>
    '<div class="cc-empty"><div class="cc-empty-title">Конкурсов не найдено</div><div class="cc-empty-sub">Попробуйте другой фильтр</div></div>',
});

try {
  const [{ company }, { contests = [] }] = await Promise.all([
    api.get(`/api/v1/companies/${username}/`),
    api.get(`/api/v1/companies/${username}/contests/`),
  ]);
  renderOwnerHeader({ prefix: 'cc', owner: company, username, title: `Конкурсы «${company.name}»` });
  list.show(contests);
} catch (error) {
  list.fail(error.message);
}
