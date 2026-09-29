/* Публичный профиль кандидата. */
import { api, byId, countOf, esc, formatDateShort, initial, pageData, WORDS } from 'alfa/core';

const { username = '' } = pageData();

const ICONS = {
  flame:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M13.6 1.5c.4 3-1.1 4.7-2.5 6.1C9.5 9.2 8 10.8 8.2 13.6c-.9-.6-1.6-1.7-1.9-2.9C4.8 12.2 4 14.1 4 16c0 4.2 3.6 6.9 8 6.9s8-3 8-7.3c0-3.9-2.3-6.4-4-8.2-1.7-1.8-2.4-3.8-2.4-5.9z"/></svg>',
  github:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.93.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg>',
  telegram:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.3 18.9 19c-.2 1-.8 1.3-1.7.8l-4.6-3.4-2.2 2.1c-.2.2-.5.5-1 .5l.3-4.7 8.5-7.7c.4-.3-.1-.5-.6-.2L6.9 13.1l-4.5-1.4c-1-.3-1-1 .2-1.5l17.6-6.8c.8-.3 1.5.2 1.2 1z"/></svg>',
  site: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg>',
  mail: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>',
  phone:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.3a2 2 0 0 1 2.1-.5c.9.4 1.8.6 2.7.8a2 2 0 0 1 1.7 2z"/></svg>',
  trophy:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4"/></svg>',
  pen: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
};

const section = (title, body, extra = '') => `
  <div class="pu-section">
    ${
      extra
        ? `<div class="pu-section-header"><div class="pu-section-title">${title}</div>${extra}</div>`
        : `<div class="pu-section-title">${title}</div>`
    }
    ${body}
  </div>`;

/* Огонёк серии: значок и число дней. Холодный — человек давно не заходил */
const streakHtml = (streak) =>
  streak
    ? `
  <span class="pu-streak ${streak.current ? '' : 'cold'}" title="Дней подряд с активностью на площадке">${ICONS.flame}${streak.current}</span>`
    : '';

const linksHtml = (links = []) =>
  links.length
    ? `
  <div class="pu-links">${links
    .map(
      (link) => `
    <a class="pu-link" href="${esc(link.url)}" target="_blank" rel="noopener nofollow">${ICONS[link.kind] ?? ''}${esc(link.label)}</a>`,
    )
    .join('')}
  </div>`
    : '';

/* Сильные стороны — темы, подтверждённые результатами чужих тестов */
const strengthsHtml = (strengths = []) =>
  strengths.length
    ? section(
        'Сильные стороны',
        `
  <div class="pu-topics">${strengths
    .map(
      (topic) => `
    <div>
      <div class="pu-topic-head">
        <span class="pu-topic-name">${esc(topic.label)}</span>
        <span class="pu-topic-count">${countOf(topic.attempts, WORDS.tests)}</span>
        <span class="pu-topic-val">${topic.avg_percent}%</span>
      </div>
      <div class="pu-topic-track"><div class="pu-topic-fill" style="width:${topic.avg_percent}%"></div></div>
    </div>`,
    )
    .join('')}
  </div>`,
      )
    : '';

/* Контакты сервер отдаёт только владельцу и подтверждённой компании */
function contactsHtml(candidate) {
  if (!candidate.contacts_visible) return '';
  const rows = [
    candidate.email &&
      `<a class="pu-contact" href="mailto:${esc(candidate.email)}">${ICONS.mail}${esc(candidate.email)}</a>`,
    candidate.phone &&
      `<a class="pu-contact" href="tel:${esc(candidate.phone.replace(/[^\d+]/g, ''))}">${ICONS.phone}${esc(candidate.phone)}</a>`,
  ].filter(Boolean);
  return rows.length ? section('Как связаться', `<div class="pu-contacts">${rows.join('')}</div>`) : '';
}

function articleRow(article) {
  const date = formatDateShort(article.published_at);
  const meta = [date, `${article.views || 0} просм.`, `рейтинг ${article.likes || 0}`].filter(Boolean).join(' · ');
  return `
    <a class="pu-article-row" href="/articles/${esc(article.id)}/">
      <div class="pu-article-cover ${article.cover ? '' : 'is-empty'}" ${article.cover ? `style="background:${esc(article.cover)}"` : ''}></div>
      <div><div class="pu-article-title">${esc(article.title)}</div><div class="pu-article-meta">${esc(meta)}</div></div>
    </a>`;
}

function achievementsHtml(wins, articleCount) {
  const cards = wins.slice(0, 3).map(
    (submission) => `
    <div class="pu-badge-card">
      <span class="pu-badge-medal">${ICONS.trophy}</span>
      <div><div class="pu-badge-title">1 место</div><div class="pu-badge-sub">«${esc(submission.contest_title)}»</div></div>
    </div>`,
  );
  if (articleCount) {
    cards.push(`
      <div class="pu-badge-card">
        <span class="pu-badge-medal is-green">${ICONS.pen}</span>
        <div><div class="pu-badge-title">${countOf(articleCount, WORDS.articles)}</div><div class="pu-badge-sub">опубликовано</div></div>
      </div>`);
  }
  return cards.length ? section('Достижения', `<div class="pu-badge-grid">${cards.join('')}</div>`) : '';
}

function render(container, candidate, articles, submissions) {
  const joinYear = candidate.created_at ? new Date(candidate.created_at).getFullYear() : '';
  const avatar = candidate.avatar
    ? `<img src="${esc(candidate.avatar)}" alt="${esc(candidate.name)}">`
    : `<span>${esc(initial(candidate.name))}</span>`;
  const skills = (candidate.skills ?? []).map((skill) => `<span class="pu-tag">${esc(skill)}</span>`).join('');
  const wins = submissions.filter((submission) => submission.winner);

  const articlesBody = articles.length
    ? articles.slice(0, 2).map(articleRow).join('')
    : '<div class="pu-empty">Публикаций пока нет.</div>';

  container.innerHTML = `
    <div class="pu-hero-card">
      <div class="pu-cover"><svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice"><circle cx="340" cy="20" r="80" fill="rgba(255,255,255,.08)"/><circle cx="60" cy="130" r="100" fill="rgba(255,255,255,.05)"/></svg></div>
      <div class="pu-hero-body">
        <div class="pu-hero-av">${avatar}</div>
        <div class="pu-name-row"><div class="pu-hero-name">${esc(candidate.name)}</div>${streakHtml(candidate.streak)}</div>
        <div class="pu-hero-meta">Кандидат${joinYear ? ` · на платформе с ${joinYear} г.` : ''}</div>
        ${candidate.bio ? `<div class="pu-hero-bio">${esc(candidate.bio)}</div>` : ''}
        ${skills ? `<div class="pu-tag-row">${skills}</div>` : ''}
        ${linksHtml(candidate.links)}
      </div>
    </div>
    <div class="pu-stats-row">
      <div class="pu-stat-card"><div class="pu-stat-label">Статей опубликовано</div><div class="pu-stat-value">${articles.length}</div></div>
      <div class="pu-stat-card"><div class="pu-stat-label">Конкурсов</div><div class="pu-stat-value">${submissions.length}</div></div>
      <div class="pu-stat-card"><div class="pu-stat-label">Побед</div><div class="pu-stat-value">${wins.length}</div></div>
      <div class="pu-stat-card"><div class="pu-stat-label">На платформе с</div><div class="pu-stat-value pu-stat-value-sm">${joinYear || '—'}</div></div>
    </div>
    ${strengthsHtml(candidate.strengths)}
    ${achievementsHtml(wins, articles.length)}
    ${section(
      'Публикации',
      `<div class="pu-article-list">${articlesBody}</div>`,
      `<a class="pu-all-link" href="/${esc(username)}/articles/">Все публикации →</a>`,
    )}
    ${contactsHtml(candidate)}`;
}

const container = byId('profile-content');
try {
  const [candidateData, articlesData, contestsData] = await Promise.all([
    api.get(`/api/v1/candidates/${username}/`),
    api.get(`/api/v1/candidates/${username}/articles/`),
    api.get(`/api/v1/candidates/${username}/contests/`),
  ]);
  render(container, candidateData.candidate, articlesData.articles ?? [], contestsData.submissions ?? []);
} catch (error) {
  container.innerHTML = `<div class="cr-list-empty">${esc(error.message)}</div>`;
}
