/* Публичный профиль компании. */
import {
  api,
  byId,
  CONTEST_STATUSES,
  countOf,
  esc,
  formatDate,
  initial,
  monthYearOf,
  pageData,
  statusPill,
  WORDS,
} from 'alfa/core';

const { username = '' } = pageData();

const star = (filled) =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="${filled ? 'var(--amber-text)' : 'none'}" stroke="var(--amber-text)" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8-6.1-3.6-6.1 3.6 1.5-6.8-5.2-4.7 6.9-.7z"/></svg>`;

const sectionHtml = (title, body, link = '') => `
  <div class="pc-section">
    <div class="pc-section-head"><div class="pc-section-title">${title}</div>${link}</div>
    ${body}
  </div>`;

const contestRow = (contest) => {
  const meta = [contest.category, contest.deadline && `дедлайн ${formatDate(contest.deadline)}`]
    .filter(Boolean)
    .join(' · ');
  return `
    <a class="pc-row" href="/contests/${esc(contest.id)}/">
      <div class="pc-row-main"><div class="pc-row-title">${esc(contest.title)}</div><div class="pc-row-meta">${esc(meta)}</div></div>
      <span class="pc-mono">${countOf(contest.participants_count, WORDS.participants)}</span>
      ${statusPill(CONTEST_STATUSES, contest.status)}
    </a>`;
};

const testRow = (test) => `
  <a class="pc-row" href="${esc(test.url)}">
    <div class="pc-row-main"><div class="pc-row-title">${esc(test.title)}</div><div class="pc-row-meta">${countOf(test.submissions, WORDS.attempts)}</div></div>
  </a>`;

function ratingHtml(company) {
  if (!company.avg_rating) return '';
  const filled = Math.round(company.avg_rating);
  const distribution = company.rating_dist ?? {};
  const rows = [5, 4, 3, 2, 1]
    .map((stars) => {
      const percent = distribution[stars] || 0;
      return `
      <div class="pc-dist-row">
        <div class="pc-dist-label">${stars} ★</div>
        <div class="pc-dist-track"><div class="pc-dist-fill" style="width:${percent}%"></div></div>
        <div class="pc-dist-val">${percent}%</div>
      </div>`;
    })
    .join('');
  return sectionHtml(
    'Рейтинг компании',
    `
    <div class="pc-rating-hero">
      <div>
        <div class="pc-rating-score">${company.avg_rating}</div>
        <div class="pc-rating-stars">${[1, 2, 3, 4, 5].map((i) => star(i <= filled)).join('')}</div>
        <div class="pc-rating-count">${countOf(company.rating_count, WORDS.ratings)} от кандидатов</div>
      </div>
      <div class="pc-rating-dist">${rows}</div>
    </div>`,
  );
}

function render(container, company, contests, tests) {
  const avatar = company.avatar_url ? `<img src="${esc(company.avatar_url)}" alt="">` : esc(initial(company.name));
  const since = monthYearOf(company.created_at);
  const meta = [
    esc(company.industry),
    esc(company.city),
    company.avg_rating && `<span class="pc-rating-inline">★ ${esc(company.avg_rating)}</span>`,
    since && `на платформе с ${since}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const tags = (company.directions ?? []).map((tag) => `<span class="pc-tag">${esc(tag)}</span>`).join('');

  const active = contests.filter((contest) => contest.status === 'active');
  const published = tests.filter((test) => test.status === 'published');
  const participants = contests.reduce((sum, contest) => sum + (contest.participants_count || 0), 0);

  container.innerHTML = `
    <div class="pc-hero-card">
      <div class="pc-cover"><svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice"><circle cx="340" cy="20" r="80" fill="rgba(255,255,255,.08)"/><circle cx="60" cy="130" r="100" fill="rgba(255,255,255,.05)"/></svg></div>
      <div class="pc-hero-body">
        <div class="pc-hero-av">${avatar}</div>
        <div class="pc-hero-name">${esc(company.name)}${company.is_verified ? '<span class="pc-verified">✓</span>' : ''}</div>
        ${meta ? `<div class="pc-hero-meta">${meta}</div>` : ''}
        ${company.description ? `<div class="pc-hero-bio">${esc(company.description)}</div>` : ''}
        ${tags ? `<div class="pc-tag-row">${tags}</div>` : ''}
      </div>
    </div>
    <div class="pc-stats-row">
      <div class="pc-stat-card"><div class="pc-stat-label">Активных конкурсов</div><div class="pc-stat-value">${active.length}</div></div>
      <div class="pc-stat-card"><div class="pc-stat-label">Тестов</div><div class="pc-stat-value">${published.length}</div></div>
      <div class="pc-stat-card"><div class="pc-stat-label">Участников привлечено</div><div class="pc-stat-value">${participants}</div></div>
    </div>
    ${sectionHtml(
      'Активные конкурсы',
      active.length
        ? active.slice(0, 2).map(contestRow).join('')
        : '<div class="pc-empty">Активных конкурсов нет.</div>',
      contests.length ? `<a class="pc-link-more" href="/${esc(username)}/contests/">Все конкурсы компании →</a>` : '',
    )}
    ${sectionHtml(
      'Тесты компании',
      published.length ? published.slice(0, 3).map(testRow).join('') : '<div class="pc-empty">Тестов пока нет.</div>',
      published.length ? `<a class="pc-link-more" href="/${esc(username)}/tests/">Все тесты компании →</a>` : '',
    )}
    ${ratingHtml(company)}`;
}

const container = byId('profile-content');
try {
  const [companyData, contestsData, testsData] = await Promise.all([
    api.get(`/api/v1/companies/${username}/`),
    api.get(`/api/v1/companies/${username}/contests/`),
    api.get(`/api/v1/companies/${username}/tests/`).catch(() => ({ tests: [] })),
  ]);
  render(container, companyData.company, contestsData.contests ?? [], testsData.tests ?? []);
} catch (error) {
  container.innerHTML = `<div class="cr-list-empty">${esc(error.message)}</div>`;
}
