/* Решения участников конкурса: сводка, воронка, подача по дням и разбор работ. */
import {
  api,
  byId,
  CONTEST_STATUSES,
  esc,
  formatDate,
  formatDateShort,
  formatDateTime,
  initial,
  pageData,
  statusPill,
  toast,
} from 'alfa/core';

const { contestId } = pageData();
const BASE_URL = `/api/v1/contests/${contestId}`;
/* Компании «На проверке» подсвечено янтарным — «разбери работу».
   У кандидата то же состояние нейтральное (SUBMISSION_STATUSES в core.js) */
const REVIEW_STATUSES = {
  pending: ['На проверке', 'amber'],
  accepted: ['Принято', 'green'],
  rejected: ['Отклонено', 'red'],
};
const ICONS = {
  person:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  file: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  link: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  heart: (filled) =>
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>`,
  trophy:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4"/></svg>',
  mail: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
  phone:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>',
};

const state = { submissions: [], filter: 'all' };

const emptyHtml = (title, text) =>
  `<div class="cs-empty"><div class="cs-empty-title">${esc(title)}</div><div class="cs-empty-sub">${esc(text)}</div></div>`;
const nameOf = (submission) => submission.candidate_name || submission.candidate_username || '';
const find = (id) => state.submissions.find((submission) => submission.id === id);
// Ссылку участника открываем, только если это обычный веб-адрес
const isWebLink = (url) => /^https?:\/\//i.test(url ?? '');

async function loadContest() {
  const { contest } = await api.get(`${BASE_URL}/`);
  const title = `${contest.title || 'Конкурс'} — решения`;
  byId('cs-title').textContent = title;
  document.title = `${title} — Career`;
  byId('cs-status-chip').outerHTML = statusPill(CONTEST_STATUSES, contest.status);
  if (contest.deadline) byId('cs-deadline-text').textContent = `Дедлайн ${formatDate(contest.deadline)}`;
}

function renderStats() {
  const count = (status) => state.submissions.filter((submission) => submission.status === status).length;
  byId('cs-stats').innerHTML = [
    [state.submissions.length, 'Всего решений'],
    [count('pending'), 'На проверке'],
    [count('accepted'), 'Принято'],
    [count('rejected'), 'Отклонено'],
  ]
    .map(
      ([value, label]) => `
    <div class="cp-stat-card"><div class="cp-stat-value">${value}</div><div class="cp-stat-label">${label}</div></div>`,
    )
    .join('');
}

/* Воронка: сколько зарегистрировавшихся дошли до отправки и сколько работ
   разобрано. Ширина полосы — доля от первой ступени, а не от максимума:
   так видно, где теряются люди */
function renderFunnel(funnel) {
  const base = funnel.participants || 0;
  if (!base) {
    byId('cs-funnel').innerHTML = '<div class="cs-panel-empty">На конкурс ещё никто не зарегистрировался</div>';
    return;
  }
  const steps = [
    { name: 'Зарегистрировались', value: funnel.participants },
    { name: 'Прислали решение', value: funnel.submitted, percent: funnel.submit_rate },
    { name: 'Работа разобрана', value: funnel.reviewed, percent: funnel.review_rate, done: true },
  ];
  byId('cs-funnel').innerHTML = steps
    .map(
      (step) => `
    <div class="cs-step">
      <div class="cs-step-head">
        <span class="cs-step-name">${step.name}</span>
        ${step.percent !== undefined ? `<span class="cs-step-pct">${step.percent}% от предыдущего</span>` : ''}
        <span class="cs-step-val">${step.value || 0}</span>
      </div>
      <div class="cs-step-track">
        <div class="cs-step-fill ${step.done ? 'done' : ''}" style="width:${Math.round(((step.value || 0) / base) * 100)}%"></div>
      </div>
    </div>`,
    )
    .join('');
}

function renderDaily({ daily = [], window_days: windowDays, before_window: beforeWindow }) {
  const box = byId('cs-daily');
  const note = byId('cs-daily-note');
  if (!daily.length) {
    box.innerHTML = '<div class="cs-panel-empty">У конкурса не задан дедлайн</div>';
    note.textContent = '';
    return;
  }
  note.textContent = beforeWindow
    ? `Последние ${windowDays} дней срока. Ещё ${beforeWindow} прислали раньше.`
    : `Последние ${windowDays} дней срока, справа — день дедлайна.`;

  const peak = Math.max(...daily.map((day) => day.count));
  box.innerHTML = peak
    ? daily
        .map((day) => {
          const label = formatDateShort(`${day.day}T00:00:00`);
          return `
        <div class="cs-daily-col">
          <div class="cs-daily-bars"><div class="cs-daily-bar" style="height:${(day.count / peak) * 100}%" title="${label}: ${day.count}"></div></div>
          <div class="cs-daily-label">${label}</div>
        </div>`;
        })
        .join('')
    : '<div class="cs-panel-empty">В этом окне решений не было</div>';
}

async function loadStatistics() {
  try {
    const data = await api.get(`${BASE_URL}/statistics/`);
    renderFunnel(data.funnel ?? {});
    renderDaily(data);
  } catch {
    byId('cs-funnel').innerHTML = '<div class="cs-panel-empty">Не удалось загрузить статистику</div>';
  }
}

function answerHtml(submission) {
  const rows = [];
  if (submission.file_url) {
    rows.push(`
      <div class="cs-file-row">${ICONS.file}
        <span class="cs-file-name">${esc(submission.file_name || 'Файл')}</span>
        <a class="cs-btn-download" href="${esc(submission.file_url)}" download>Скачать</a>
      </div>`);
  }
  if (submission.link) {
    rows.push(`
      <div class="cs-file-row">${ICONS.link}
        ${
          isWebLink(submission.link)
            ? `<a class="cs-link" href="${esc(submission.link)}" target="_blank" rel="noopener nofollow">${esc(submission.link)}</a>`
            : `<span class="cs-link">${esc(submission.link)}</span>`
        }
      </div>`);
  }
  if (submission.text) rows.push(`<div class="cs-text">${esc(submission.text)}</div>`);
  if (submission.comment) rows.push(`<div class="cs-comment">${esc(submission.comment)}</div>`);
  return rows.join('');
}

function actionsHtml(submission) {
  const decision =
    submission.status === 'pending'
      ? `<button type="button" class="cs-btn-accept" data-action="accept" data-id="${submission.id}">Принять</button>
       <button type="button" class="cs-btn-reject" data-action="reject" data-id="${submission.id}">Отклонить</button>`
      : `<span class="cs-decided">${submission.status === 'accepted' ? 'Решение принято' : 'Решение отклонено'}</span>`;
  // Победителя выбирают из понравившихся
  const winner = submission.liked
    ? `<button type="button" class="cs-btn-winner ${submission.winner ? 'is-winner' : ''}" data-action="winner" data-id="${submission.id}">
        ${submission.winner ? `${ICONS.trophy}Победитель` : 'Сделать победителем'}</button>`
    : '';
  return `
    <button type="button" class="cs-btn-contact" data-action="contact" data-id="${submission.id}" title="Контакты кандидата">${ICONS.person}Контакты</button>
    ${decision}${winner}`;
}

const card = (submission) => `
  <div class="cs-sub-card ${submission.liked ? 'liked' : ''}">
    <div class="cs-sub-top">
      <span class="cs-cand-av">${esc(initial(nameOf(submission)))}</span>
      <div class="cs-cand-main">
        <div class="cs-cand-name">${esc(nameOf(submission))}
          ${submission.winner ? `<span class="cs-winner-badge">${ICONS.trophy}Победитель</span>` : ''}</div>
        <div class="cs-cand-meta">${formatDateTime(submission.submitted_at)} · Попытка ${submission.attempt || 1}</div>
      </div>
      <div class="cs-sub-status">
        ${statusPill(REVIEW_STATUSES, submission.status)}
        <button type="button" class="cs-btn-like ${submission.liked ? 'liked' : ''}" data-action="like" data-id="${submission.id}"
                aria-pressed="${submission.liked}" title="${submission.liked ? 'Убрать из понравившихся' : 'Понравилось'}">${ICONS.heart(submission.liked)}</button>
      </div>
    </div>
    <div class="cs-sub-body">
      ${answerHtml(submission)}
      <div class="cs-actions">${actionsHtml(submission)}</div>
    </div>
  </div>`;

function renderList() {
  const { submissions, filter } = state;
  const shown = submissions.filter((submission) => {
    if (filter === 'all') return true;
    if (filter === 'liked') return submission.liked;
    return submission.status === filter;
  });
  byId('cs-filter-count').textContent = `${shown.length} из ${submissions.length}`;
  byId('cs-sub-list').innerHTML = shown.length
    ? shown.map(card).join('')
    : emptyHtml(
        'Решений не найдено',
        filter === 'liked'
          ? 'Отмечайте ♥ у понравившихся решений, чтобы выбрать из них победителя'
          : 'Попробуйте другой фильтр',
      );
}

/* Состояние меняется только после успешного ответа:
   иначе при 403 или 500 карточка покажет то, чего на сервере не произошло */

const ACTIONS = {
  async like(submission) {
    await api.post(`${BASE_URL}/submissions/${submission.id}/like/`);
    submission.liked = !submission.liked;
  },
  async winner(submission) {
    await api.post(`${BASE_URL}/submissions/${submission.id}/winner/`);
    submission.winner = !submission.winner;
  },
  async accept(submission) {
    await api.patch(`${BASE_URL}/submissions/${submission.id}/`, { status: 'accepted' });
    submission.status = 'accepted';
    loadStatistics();
  },
  async reject(submission) {
    await api.patch(`${BASE_URL}/submissions/${submission.id}/`, { status: 'rejected' });
    submission.status = 'rejected';
    loadStatistics();
  },
};

const closeContactPopup = () => byId('cs-contact-popup')?.remove();

function showContactPopup(button, submission) {
  closeContactPopup();
  const skills = submission.candidate_skills ?? [];
  const popup = document.createElement('div');
  popup.id = 'cs-contact-popup';
  popup.innerHTML = `
    <div class="cs-popup-head">
      <span class="cs-popup-av">${esc(initial(nameOf(submission)))}</span>
      <div>
        <div class="cs-popup-name">${esc(nameOf(submission))}</div>
        ${
          submission.candidate_username
            ? `<a class="cs-popup-login" href="/${esc(submission.candidate_username)}/" target="_blank">@${esc(submission.candidate_username)}</a>`
            : ''
        }
      </div>
    </div>
    ${
      submission.candidate_email
        ? `<div class="cs-popup-row">${ICONS.mail}<a href="mailto:${esc(submission.candidate_email)}">${esc(submission.candidate_email)}</a></div>`
        : '<div class="cs-popup-muted">Email не указан</div>'
    }
    ${
      submission.candidate_phone
        ? `<div class="cs-popup-row">${ICONS.phone}<a href="tel:${esc(submission.candidate_phone.replace(/[^\d+]/g, ''))}">${esc(submission.candidate_phone)}</a></div>`
        : ''
    }
    ${submission.candidate_bio ? `<div class="cs-popup-bio">${esc(submission.candidate_bio)}</div>` : ''}
    ${skills.length ? `<div class="cs-popup-skills">${skills.map((skill) => `<span class="cs-popup-skill">${esc(skill)}</span>`).join('')}</div>` : ''}`;
  document.body.append(popup);

  // Ширину берём фактическую: в CSS она зажата под ширину экрана
  const rect = button.getBoundingClientRect();
  const maxLeft = innerWidth - popup.offsetWidth - 12;
  popup.style.left = `${Math.max(scrollX + 12, Math.min(rect.left + scrollX, maxLeft))}px`;
  popup.style.top = `${rect.bottom + scrollY + 6}px`;
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('#cs-contact-popup, [data-action="contact"]')) closeContactPopup();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeContactPopup();
});

byId('cs-sub-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  const submission = button && find(Number(button.dataset.id));
  if (!submission) return;
  const { action } = button.dataset;
  if (action === 'contact') {
    showContactPopup(button, submission);
    return;
  }
  button.disabled = true;
  try {
    await ACTIONS[action](submission);
    renderStats();
    renderList();
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
});

document.querySelectorAll('.cr-chip[data-f]').forEach((chip, _, chips) =>
  chip.addEventListener('click', () => {
    state.filter = chip.dataset.f;
    chips.forEach((item) => item.classList.toggle('active', item === chip));
    renderList();
  }),
);

loadContest().catch(() => {
  byId('cs-title').textContent = 'Решения конкурса';
});
loadStatistics();
try {
  ({ submissions: state.submissions = [] } = await api.get(`${BASE_URL}/submissions/`));
  renderStats();
  renderList();
} catch (error) {
  byId('cs-sub-list').innerHTML = emptyHtml('Ошибка загрузки', error.message);
}
