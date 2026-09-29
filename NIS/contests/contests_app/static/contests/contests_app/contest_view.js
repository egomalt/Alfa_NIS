/* Страница конкурса: кейс, правила, отсчёт до дедлайна и отправка решения. */
import {
  api,
  byId,
  CONTEST_STATUSES,
  countOf,
  esc,
  formatDateTime,
  initial,
  LEVELS,
  pageData,
  pluralForm,
  statusPill,
  SUBMISSION_STATUSES,
  toast,
} from 'alfa/core';
import { refreshReportButtons } from 'alfa/report';

const { contestId } = pageData();
// На конкурс принимается одна попытка — так же проверяет и сервер
const MAX_ATTEMPTS = 1;
const SUBMISSION_FORMATS = { file: 'Файл', link: 'Ссылка', text: 'Текст' };
const ICONS = {
  flag: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1Z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
  file: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  upload:
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 12v6M9 15l3 3 3-3"/></svg>',
  warning:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  done: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>',
  close:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};

const state = {
  contest: null,
  me: null,
  submissions: [],
  file: null,
};

const hasContact = () => Boolean(state.me?.email);

function setTab(key) {
  document.querySelectorAll('.cv-tab-btn').forEach((tab) => tab.classList.toggle('active', tab.dataset.p === key));
  document
    .querySelectorAll('.cv-panel')
    .forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === key));
}

function renderHero(contest) {
  const company = contest.company_name || contest.company_username || '';
  const tags = [contest.category, LEVELS[contest.level?.toLowerCase()] ?? contest.level].filter(Boolean);
  document.title = `${contest.title || 'Конкурс'} — Career`;
  byId('cv-hero-inner').innerHTML = `
    <div class="cv-hero-top">
      <div class="cv-hero-main">
        <div class="cv-hero-company">
          <span class="cv-hero-av">${esc(initial(company))}</span>
          <span class="cv-hero-comp">${esc(company)}</span>
          ${statusPill(CONTEST_STATUSES, contest.status)}
        </div>
        <h1 class="cv-hero-title">${esc(contest.title)}</h1>
        <p class="cv-hero-excerpt">${esc(contest.excerpt)}</p>
        <div class="cv-hero-tags">${tags.map((tag) => `<span class="cv-hero-tag">${esc(tag)}</span>`).join('')}</div>
      </div>
      <button type="button" class="cr-report-btn cv-hero-report" data-report-type="contest" data-report-id="${contest.id}"
              data-report-author="${esc(contest.company_username)}" data-report-title="${esc(contest.title)}">
        ${ICONS.flag} Пожаловаться
      </button>
    </div>
    <div class="cv-tabs">
      <button class="cv-tab-btn active" data-p="case">Описание кейса</button>
      <button class="cv-tab-btn" data-p="rules">Правила</button>
      <button class="cv-tab-btn" data-p="submit">Отправить решение</button>
    </div>`;
  byId('cv-hero-inner')
    .querySelectorAll('.cv-tab-btn')
    .forEach((tab) => tab.addEventListener('click', () => setTab(tab.dataset.p)));
  // Кнопка жалобы появилась только сейчас
  refreshReportButtons();
}

function renderAttachments({ attachments = [] }) {
  byId('cv-attach-box').hidden = !attachments.length;
  byId('cv-attach-list').innerHTML = attachments
    .map(
      (file) => `
    <div class="cv-attach-file-row">
      ${ICONS.file}
      <span class="cv-attach-name">${esc(file.name)}</span>
      <span class="cv-attach-size">${esc(file.size_display)}</span>
      <a class="cv-btn-dl" href="${esc(file.url)}" download>Скачать</a>
    </div>`,
    )
    .join('');
}

function renderRules({ rules = [] }) {
  byId('cv-rules-list').innerHTML = rules.length
    ? rules
        .map(
          (rule, index) => `
      <div class="cv-rule-item">
        <span class="cv-rule-num">${index + 1}</span>
        <span class="cv-rule-text">${esc(rule)}</span>
      </div>`,
        )
        .join('')
    : '<div class="cv-rules-empty">Правила не заданы</div>';
}

function startCountdown(deadline) {
  const units = [
    [86400000, ['день', 'дня', 'дней']],
    [3600000, ['час', 'часа', 'часов']],
    [60000, ['минута', 'минуты', 'минут']],
  ];
  const tick = () => {
    let rest = Math.max(0, deadline - Date.now());
    byId('cv-countdown').innerHTML = units
      .map(([size, forms]) => {
        const value = Math.floor(rest / size);
        rest %= size;
        return `<div class="cv-cd-unit"><div class="cv-cd-num">${value}</div><div class="cv-cd-label">${pluralForm(value, forms)}</div></div>`;
      })
      .join('');
  };
  tick();
  setInterval(tick, 60000);
}

function renderSidebar(contest) {
  byId('cv-stats-rows').innerHTML = [
    ['Участников', contest.participants_count || 0],
    ['Решений прислано', contest.submissions_count || 0],
    ['Формат решения', SUBMISSION_FORMATS[contest.submission_type] ?? '—'],
  ]
    .map(
      ([label, value]) =>
        `<div class="cv-stat-row"><span class="k">${label}</span><span class="v">${value}</span></div>`,
    )
    .join('');

  byId('cv-prize-card').hidden = !contest.prize;
  byId('cv-prize-text').textContent = contest.prize ?? '';

  const deadline = contest.deadline && new Date(contest.deadline);
  if (contest.status !== 'active' || !deadline || deadline < Date.now()) return;
  byId('cv-countdown-card').hidden = false;
  // Срок задаётся по Москве — и показываем его по Москве, где бы ни был участник
  byId('cv-deadline-date').textContent = `${deadline.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  })} МСК`;
  startCountdown(deadline);
}

function renderMySubmissions() {
  byId('cv-my-submissions').hidden = !state.submissions.length;
  byId('cv-ms-list').innerHTML = state.submissions
    .map(
      (submission) => `
    <div class="cv-ms-item">
      <span class="cv-ms-date">${formatDateTime(submission.submitted_at)}</span>
      ${statusPill(SUBMISSION_STATUSES, submission.winner ? 'winner' : submission.status)}
    </div>`,
    )
    .join('');
}

function inputHtml(type, hint) {
  if (type === 'file') {
    return `
      <div class="cv-file-drop" id="cv-file-drop" role="button" tabindex="0">
        ${ICONS.upload}
        <div class="cv-file-drop-title">Нажмите или перетащите файл</div>
        <div class="cv-file-drop-hint">${esc(hint || 'PDF, ZIP, DOCX до 25 МБ')}</div>
      </div>
      <input type="file" id="cv-sub-file" hidden>
      <div id="cv-file-chip-wrap"></div>`;
  }
  if (type === 'link') {
    return `<div class="cv-submit-label">Ссылка на решение</div>
      <input class="cv-submit-input" id="cv-sub-answer" placeholder="${esc(hint || 'https://github.com/...')}" type="url">`;
  }
  return `<div class="cv-submit-label">Текст решения</div>
    <textarea class="cv-submit-input" id="cv-sub-answer" placeholder="${esc(hint || 'Опишите ваше решение…')}"></textarea>`;
}

function chooseFile(file) {
  state.file = file ?? null;
  byId('cv-file-drop').hidden = Boolean(file);
  byId('cv-file-drop').classList.remove('is-invalid');
  byId('cv-file-chip-wrap').innerHTML = file
    ? `
    <div class="cv-file-chip">
      ${ICONS.file}
      <span class="cv-file-name">${esc(file.name)}</span>
      <button type="button" class="cv-file-clear" data-clear-file aria-label="Убрать файл">${ICONS.close}</button>
    </div>`
    : '';
}

function setupFileInput() {
  const drop = byId('cv-file-drop');
  const input = byId('cv-sub-file');
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') input.click();
  });
  drop.addEventListener('dragover', (event) => {
    event.preventDefault();
    drop.classList.add('is-dragover');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-dragover'));
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('is-dragover');
    chooseFile(event.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => chooseFile(input.files[0]));
  byId('cv-file-chip-wrap').addEventListener('click', (event) => {
    if (!event.target.closest('[data-clear-file]')) return;
    input.value = '';
    chooseFile(null);
  });
}

function renderSubmitArea() {
  const formWrap = byId('cv-form-wrap');
  if (!state.me) {
    const next = encodeURIComponent(location.pathname);
    formWrap.innerHTML = `
      <div class="cv-signin">
        <div class="cv-signin-title">Войдите, чтобы участвовать</div>
        <a class="cr-modal-btn-primary" href="/authorization/signin/?next=${next}">Войти</a>
      </div>`;
    return;
  }

  byId('cv-contact-banner-wrap').innerHTML = hasContact()
    ? ''
    : `
    <div class="cv-contact-banner">
      ${ICONS.warning}
      <div>
        <div class="cv-banner-title">Добавьте контактные данные</div>
        <div class="cv-banner-text">Для участия в конкурсе в профиле должен быть указан email.</div>
      </div>
      <button type="button" class="cv-banner-btn" data-open-contact>Добавить</button>
    </div>`;

  if (state.submissions.length >= MAX_ATTEMPTS) {
    formWrap.innerHTML = `
      <div class="cv-limit-note">${ICONS.done}
        Вы уже отправили решение. На этот конкурс действует лимит — ${countOf(MAX_ATTEMPTS, ['попытка', 'попытки', 'попыток'])} на участника.
      </div>`;
    return;
  }

  const type = state.contest.submission_type || 'file';
  formWrap.innerHTML = `
    ${inputHtml(type, state.contest.submission_hint)}
    <div class="cv-submit-label">Комментарий <span class="cv-optional">— необязательно</span></div>
    <textarea class="cv-submit-input" id="cv-sub-comment" placeholder="Кратко опишите подход"></textarea>
    <button type="button" class="cv-btn-submit" id="cv-btn-submit">Отправить решение</button>
    <div class="cv-submit-note">Отправить решение можно только один раз — отправляйте, когда будете готовы.</div>`;

  if (type === 'file') setupFileInput();
  byId('cv-btn-submit').addEventListener('click', submitSolution);
}

async function submitSolution(event) {
  if (!hasContact()) {
    openContactModal();
    return;
  }
  const type = state.contest.submission_type || 'file';
  const form = new FormData();
  form.append('contest', contestId);
  form.append('comment', byId('cv-sub-comment').value);
  if (type === 'file') {
    if (!state.file) {
      byId('cv-file-drop').classList.add('is-invalid');
      toast('Прикрепите файл с решением');
      return;
    }
    form.append('file', state.file);
  } else {
    const answer = byId('cv-sub-answer').value.trim();
    if (!answer) {
      byId('cv-sub-answer').focus();
      toast(type === 'link' ? 'Укажите ссылку на решение' : 'Напишите текст решения');
      return;
    }
    form.append(type, answer);
  }

  const button = event.currentTarget;
  button.disabled = true;
  try {
    const { submission } = await api.post(`/api/v1/contests/${contestId}/submit/`, form);
    state.submissions.unshift(submission);
    state.file = null;
  } catch (error) {
    toast(error.message);
    button.disabled = false;
    return;
  }
  renderMySubmissions();
  renderSubmitArea();
  if (state.contest.company_username) openRatingModal(state.contest.company_username);
}

function openRatingModal(companyUsername) {
  let selected = 0;
  const modal = document.createElement('div');
  modal.className = 'cr-modal open';
  modal.innerHTML = `
    <div class="cr-modal-card cv-rating-card" role="dialog" aria-modal="true">
      <div class="cr-modal-title">Решение отправлено</div>
      <div class="cr-modal-sub">Оцените организацию конкурса от 1 до 5 звёзд</div>
      <div class="cv-stars">${[1, 2, 3, 4, 5]
        .map(
          (star) =>
            `<button type="button" class="cv-star" data-star="${star}" aria-label="${countOf(star, ['звезда', 'звезды', 'звёзд'])}">★</button>`,
        )
        .join('')}
      </div>
      <div class="cr-modal-error"></div>
      <div class="cr-modal-actions">
        <button type="button" class="cr-modal-btn-cancel" data-skip>Пропустить</button>
        <button type="button" class="cr-modal-btn-primary" data-send disabled>Отправить</button>
      </div>
    </div>`;
  document.body.append(modal);

  const stars = [...modal.querySelectorAll('[data-star]')];
  const sendButton = modal.querySelector('[data-send]');
  const paint = (count) => stars.forEach((star) => star.classList.toggle('is-lit', Number(star.dataset.star) <= count));

  stars.forEach((star) => {
    star.addEventListener('mouseenter', () => paint(Number(star.dataset.star)));
    star.addEventListener('mouseleave', () => paint(selected));
    star.addEventListener('click', () => {
      selected = Number(star.dataset.star);
      paint(selected);
      sendButton.disabled = false;
    });
  });
  modal.querySelector('[data-skip]').addEventListener('click', () => modal.remove());
  sendButton.addEventListener('click', async () => {
    sendButton.disabled = true;
    try {
      await api.post(`/api/v1/companies/${companyUsername}/rate/`, { rating: selected });
      modal.remove();
      toast('Спасибо за оценку', 'ok');
    } catch (error) {
      // Молча закрывать окно нельзя: человек решит, что оценка учтена
      modal.querySelector('.cr-modal-error').textContent = error.message;
      sendButton.disabled = false;
    }
  });
}

const openContactModal = () => byId('cv-contact-modal').classList.add('open');
const closeContactModal = () => byId('cv-contact-modal').classList.remove('open');

async function saveContact() {
  const emailInput = byId('cv-contact-email');
  const email = emailInput.value.trim();
  const phone = byId('cv-contact-phone').value.trim();
  const error = byId('cv-contact-error');
  emailInput.classList.toggle('is-invalid', !email);
  if (!email) return;
  error.textContent = '';
  try {
    await api.patch(`/api/v1/candidates/${state.me.username}/update/`, { email, phone });
  } catch (err) {
    error.textContent = err.message;
    return;
  }
  state.me.email = email;
  closeContactModal();
  renderSubmitArea();
}

// Баннер перерисовывается, поэтому слушатель висит на документе
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-open-contact]')) openContactModal();
});
byId('cv-contact-cancel').addEventListener('click', closeContactModal);
byId('cv-contact-save').addEventListener('click', saveContact);
byId('cv-contact-modal').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeContactModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeContactModal();
});

state.me = await api
  .get('/api/v1/auth/me/')
  .then(({ account }) => account)
  .catch(() => null);
try {
  ({ contest: state.contest } = await api.get(`/api/v1/contests/${contestId}/`));
} catch {
  byId('cv-hero-inner').innerHTML = '<div class="cr-list-empty">Конкурс не найден</div>';
}

if (state.contest) {
  renderHero(state.contest);
  renderAttachments(state.contest);
  // Кейс — обычный текст: экранируем и сохраняем переносы строк
  byId('cv-case-content').innerHTML = esc(state.contest.case_text).replace(/\n/g, '<br>');
  renderRules(state.contest);
  renderSidebar(state.contest);
  if (state.me) {
    ({ submissions: state.submissions = [] } = await api
      .get(`/api/v1/contests/${contestId}/my-submissions/`)
      .catch(() => ({})));
  }
  renderMySubmissions();
  renderSubmitArea();
}
