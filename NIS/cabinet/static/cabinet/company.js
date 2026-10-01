/* Кабинет компании: профиль и проверка документа, статистика, настройки. */
import {
  api,
  byId as el,
  confirmDialog,
  countOf,
  esc,
  formatDateLong,
  formatDateShort,
  initial,
  pageData,
  toast,
  WORDS,
} from 'alfa/core';

const { username = '', page = 'profile', panel = page } = pageData();
const state = { company: null, contests: [], tests: [] };

// Разделы, которые рисует этот скрипт. У «Тестов» и «Конкурсов» свои скрипты:
// им отсюда нужны только сайдбар, замки и выход, поэтому они передают panel='none'
const OWN_PANELS = ['profile', 'stats', 'settings'];

const ICONS = {
  pending:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  rejected:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  none: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>',
  trophy:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4"/></svg>',
  draft:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  file: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
};

const setText = (id, value) => {
  const node = el(id);
  if (node) node.textContent = value;
};

const setAvatar = (node, company) => {
  if (!node) return;
  if (company.avatar_url) node.innerHTML = `<img src="${esc(company.avatar_url)}" alt="">`;
  else node.textContent = initial(company.name || company.username);
};

const formatRating = (value) => (value ? `${value.toFixed(1)} ★` : '—');

function renderSidebar(company) {
  setAvatar(el('cp-sidebar-av'), company);
  setText('cp-sidebar-name', company.name || username);
}

function renderHero(company) {
  const avatar = el('cp-hero-av');
  if (!avatar) return;
  setAvatar(avatar, company);
  setText('cp-hero-name', company.name || username);
  el('cp-verified-badge').hidden = !company.is_verified;

  const since = company.created_at ? `с ${new Date(company.created_at).getFullYear()} г.` : '';
  setText('cp-hero-role', [company.industry, company.city, since].filter(Boolean).join(' · ') || 'Компания');
  setText('cp-page-sub', company.contact_email || '');
}

function unlockSidebarLinks() {
  ['tests', 'contests'].forEach((section) => {
    el(`cp-link-${section}`)?.classList.remove('locked');
    const lock = el(`cp-lock-${section}`);
    if (lock) lock.hidden = true;
  });
}

function renderTimeline(contests) {
  const timeline = el('cp-timeline');
  if (!timeline) return;
  if (!contests.length) {
    timeline.innerHTML = '<div class="cp-tl-empty">Активность появится здесь по мере работы на платформе</div>';
    return;
  }
  timeline.innerHTML = contests
    .slice(0, 5)
    .map((contest) => {
      const active = contest.status === 'active';
      return `
      <div class="cp-tl-row">
        <span class="cp-tl-icon ${active ? 'is-active' : ''}">${active ? ICONS.trophy : ICONS.draft}</span>
        <span class="cp-tl-text">Конкурс «${esc(contest.title)}»</span>
        <span class="cp-tl-time">${esc(formatDateLong(contest.created_at).replace(/ \d{4}$/, ''))}</span>
      </div>`;
    })
    .join('');
}

function renderProfileContent(company) {
  if (!el('cpstat-contests')) return;
  const { contests, tests } = state;
  const participants = contests.reduce((sum, contest) => sum + (contest.participants_count || 0), 0);

  setText('cpstat-contests', contests.length);
  setText('cpstat-tests', tests.length);
  setText('cpstat-participants', participants);
  setText('cpstat-rating', formatRating(company.avg_rating));
  setText('cp-about-text', company.description || 'Описание не добавлено.');

  const tags = [...(company.directions || []), company.company_size].filter(Boolean);
  el('cp-tag-row').innerHTML = tags.map((tag) => `<span class="cp-tag">${esc(tag)}</span>`).join('');

  setText('sc-contests-sub', contests.length ? countOf(contests.length, WORDS.contests) : 'Нет конкурсов');
  setText('sc-tests-sub', tests.length ? countOf(tests.length, WORDS.tests) : 'Нет тестов');

  renderTimeline(contests);
}

function showProfileContent(company) {
  el('cp-verify-gate').hidden = true;
  el('cp-profile-content').hidden = false;
  const editButton = el('cp-edit-btn');
  if (editButton) editButton.hidden = false;
  unlockSidebarLinks();
  renderProfileContent(company);
}

const VERIFY_STATES = {
  none: {
    tone: 'amber',
    status: 'Профиль не подтверждён',
    title: 'Подтвердите, что компания реальна',
    text: 'Загрузите документ, подтверждающий деятельность компании (выписка ЕГРЮЛ, свидетельство о регистрации и т.п.), чтобы открыть создание тестов, конкурсов и другие функции.',
    upload: true,
    button: 'Отправить на проверку',
  },
  pending: {
    tone: 'amber',
    status: 'Документ на проверке',
    title: 'Документ отправлен на проверку',
    text: 'Модератор проверит документ и подтвердит компанию. Обычно это занимает до 1–2 рабочих дней. После одобрения откроются создание тестов, конкурсов и другие функции.',
    upload: false,
  },
  rejected: {
    tone: 'red',
    status: 'Заявка отклонена',
    title: 'Документ не прошёл проверку',
    text: 'Исправьте замечания и загрузите документ повторно.',
    upload: true,
    button: 'Отправить повторно',
  },
};

function renderVerifyGate(company) {
  const status = company.verification_status in VERIFY_STATES ? company.verification_status : 'none';
  const view = VERIFY_STATES[status];

  const badge = el('cp-verify-status');
  badge.textContent = view.status;
  badge.dataset.tone = view.tone;
  const icon = el('cp-verify-icon');
  icon.dataset.tone = view.tone;
  icon.innerHTML = ICONS[status];
  setText('cp-verify-title', view.title);
  setText('cp-verify-sub', view.text);

  el('cp-verify-reason').innerHTML =
    status === 'rejected' && company.verification_reason
      ? `<div class="cp-flash error cp-flash-spaced"><strong>Причина отклонения:</strong> ${esc(company.verification_reason)}</div>`
      : '';
  el('cp-verify-upload').hidden = !view.upload;
  if (view.button) setText('cp-submit-doc-btn', view.button);
}

function showVerifyGate(company) {
  el('cp-verify-gate').hidden = false;
  el('cp-profile-content').hidden = true;
  const editButton = el('cp-edit-btn');
  if (editButton) editButton.hidden = true;
  renderVerifyGate(company);
}

let chosenFile = null;

function renderChosenFile() {
  const wrap = el('cp-file-chosen-wrap');
  if (!wrap) return;
  el('cp-submit-doc-btn').disabled = !chosenFile;
  wrap.innerHTML = chosenFile
    ? `<div class="cp-file-chosen">${ICONS.file}<span>${esc(chosenFile.name)} (${Math.round(chosenFile.size / 1024)} КБ)</span></div>`
    : '';
}

function flashVerify(message, type) {
  const flash = el('cp-verify-flash');
  if (!flash) return;
  flash.innerHTML = `<div class="cp-flash ${type}">${esc(message)}</div>`;
}

async function submitDocument() {
  if (!chosenFile) return;
  const button = el('cp-submit-doc-btn');
  button.disabled = true;
  button.textContent = 'Отправка…';

  const form = new FormData();
  form.append('registration_document', chosenFile);
  try {
    const { company } = await api.post(`/api/v1/companies/${username}/verification/`, form);
    state.company = company;
    chosenFile = null;
    renderChosenFile();
    renderSidebar(company);
    renderHero(company);
    showVerifyGate(company);
  } catch (error) {
    flashVerify(error.message, 'error');
    button.disabled = false;
    button.textContent = VERIFY_STATES.none.button;
  }
}

function initVerifyDocument() {
  const input = el('cp-doc-input');
  if (!input) return;
  el('cp-doc-pick')?.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    chosenFile = input.files[0] ?? null;
    renderChosenFile();
  });

  const dropzone = el('cp-dropzone');
  dropzone?.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
  dropzone?.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragover');
    chosenFile = event.dataTransfer.files[0] ?? null;
    renderChosenFile();
  });

  el('cp-submit-doc-btn')?.addEventListener('click', submitDocument);
}

async function sendProfile(form) {
  const { company } = await api.post(`/api/v1/companies/${username}/profile/`, form);
  state.company = company;
  renderSidebar(company);
  renderHero(company);
  renderLogoBox(company);
  return company;
}

function initHeroAvatarUpload() {
  const avatar = el('cp-hero-av');
  const input = el('cp-avatar-input');
  if (!avatar || !input) return;
  avatar.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    const form = new FormData();
    form.append('avatar', file);
    try {
      await sendProfile(form);
    } catch (error) {
      toast(error.message);
    }
  });
}

/* Высота столбика — доля от самой активной недели: масштаб у компаний разный */
function renderActivity(weekly) {
  const chart = el('cp-activity-chart');
  if (!chart) return;
  const peak = Math.max(0, ...weekly.flatMap((week) => [week.submissions || 0, week.attempts || 0]));
  if (!peak) {
    chart.innerHTML = '<div class="cp-chart-empty">За последние 12 недель активности не было</div>';
    return;
  }
  const bar = (value, kind, title) =>
    `<div class="cp-chart-bar ${kind}" style="height:${(value / peak) * 100}%" title="${title}: ${value}"></div>`;
  chart.innerHTML = weekly
    .map(
      (week) => `
    <div class="cp-chart-col">
      <div class="cp-chart-bars">
        ${bar(week.submissions || 0, 'subs', 'Решения')}
        ${bar(week.attempts || 0, 'att', 'Прохождения')}
      </div>
      <div class="cp-chart-label">${esc(formatDateShort(`${week.week}T00:00:00`))}</div>
    </div>`,
    )
    .join('');
}

function renderSkills(skills) {
  const section = el('cp-skills-section');
  if (!section) return;
  section.hidden = !skills.length;
  el('cp-skills').innerHTML = skills
    .map(
      (skill) => `<span class="cp-skill">${esc(skill.name)}<span class="cp-skill-count">${skill.count}</span></span>`,
    )
    .join('');
}

function renderTotals(totals) {
  Object.entries({
    'cpst2-contests': totals.contests,
    'cpst2-tests': totals.published_tests,
    'cpst2-participants': totals.participants,
    'cpst2-submissions': totals.submissions,
    'cpst2-winners': totals.winners,
    'cpst2-pending': totals.pending_submissions,
    'cpst2-attempts': totals.test_attempts,
  }).forEach(([id, value]) => setText(id, value ?? 0));
  setText('cpst2-rating', formatRating(totals.avg_rating));
}

function renderRating(company) {
  const section = el('cp-stats-rating-section');
  section.hidden = !company.avg_rating;
  if (!company.avg_rating) return;
  setText('cp-rating-score', company.avg_rating.toFixed(1));
  setText('cp-rating-count', `${countOf(company.rating_count, WORDS.ratings)} от кандидатов`);
  const distribution = company.rating_dist || {};
  el('cp-rating-dist').innerHTML = [5, 4, 3, 2, 1]
    .map((star) => {
      const percent = distribution[star] || 0;
      return `
      <div class="cp-dist-row">
        <div class="cp-dist-label">${star} ★</div>
        <div class="cp-dist-track"><div class="cp-dist-fill" style="width:${percent}%"></div></div>
        <div class="cp-dist-val">${percent}%</div>
      </div>`;
    })
    .join('');
}

async function renderStatsTab() {
  renderRating(state.company);
  // Сводку считает сервер: числа должны совпадать с PDF-отчётом
  try {
    const data = await api.get(`/api/v1/companies/${username}/statistics/`);
    renderTotals(data.totals ?? {});
    renderActivity(data.weekly ?? []);
    renderSkills(data.skills ?? []);
  } catch {
    const chart = el('cp-activity-chart');
    if (chart) chart.innerHTML = '<div class="cp-chart-empty">Не удалось загрузить статистику</div>';
  }
}

// Столько же направлений принимает сервер (companies/forms.py)
const MAX_DIRECTIONS = 10;
let directions = [];

const TEXT_FIELDS = {
  'cp-f-name': 'name',
  'cp-f-desc': 'description',
  'cp-f-email': 'contact_email',
  'cp-f-phone': 'phone',
  'cp-f-website': 'website',
  'cp-f-city': 'city',
  'cp-f-address': 'address',
  'cp-f-industry': 'industry',
  'cp-f-size': 'company_size',
};

function renderLogoBox(company) {
  const preview = el('pic-preview');
  if (!preview) return;
  setAvatar(preview, company);
  el('cp-logo-remove').hidden = !company.avatar_url;
}

function renderDirections() {
  const box = el('cp-dir-chips');
  if (!box) return;
  box.innerHTML = directions
    .map(
      (name, index) => `
    <span class="chip-tag">${esc(name)}<button type="button" class="chip-x" data-index="${index}"
      title="Убрать" aria-label="Убрать направление ${esc(name)}">×</button></span>`,
    )
    .join('');

  const full = directions.length >= MAX_DIRECTIONS;
  el('cp-dir-input').disabled = full;
  el('cp-dir-add').disabled = full;
  setText(
    'cp-dir-count',
    full ? `— больше ${MAX_DIRECTIONS} не поместится` : `— ${directions.length} из ${MAX_DIRECTIONS}`,
  );
}

function addDirections(raw) {
  // Строку из другого места обычно вставляют целиком, через запятую
  for (const part of raw.split(',')) {
    const name = part.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name || directions.length >= MAX_DIRECTIONS) continue;
    if (!directions.some((existing) => existing.toLowerCase() === name.toLowerCase())) directions.push(name);
  }
  el('cp-dir-input').value = '';
  renderDirections();
}

function flashSettings(message, type) {
  el('cp-settings-flash').innerHTML = `<div class="cp-flash ${type}">${esc(message)}</div>`;
}

function fillSettingsForm() {
  const company = state.company;
  if (!company || !el('cp-f-name')) return;
  Object.entries(TEXT_FIELDS).forEach(([id, field]) => {
    el(id).value = company[field] || '';
  });
  directions = [...(company.directions || [])];
  renderDirections();
  renderLogoBox(company);
  el('cp-settings-flash').innerHTML = '';
}

async function saveSettings() {
  const button = el('cp-save-settings-btn');
  button.disabled = true;
  button.textContent = 'Сохранение…';

  const form = new FormData();
  Object.entries(TEXT_FIELDS).forEach(([id, field]) => form.append(field, el(id).value));
  // Незакоммиченный ввод не должен пропадать при сохранении
  const pending = el('cp-dir-input').value.trim();
  const toSend = pending && directions.length < MAX_DIRECTIONS ? [...directions, pending] : directions;
  // Пустое значение обязательно: по наличию ключа сервер понимает, что пустой список — это очистка
  if (!toSend.length) form.append('directions', '');
  toSend.forEach((name) => form.append('directions', name));

  try {
    const company = await sendProfile(form);
    directions = [...(company.directions || [])];
    renderDirections();
    el('cp-dir-input').value = '';
    flashSettings('Сохранено', 'success');
  } catch (error) {
    flashSettings(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Сохранить';
  }
}

async function updateLogo(form, successMessage) {
  try {
    await sendProfile(form);
    flashSettings(successMessage, 'success');
  } catch (error) {
    flashSettings(error.message, 'error');
  }
}

function initSettings() {
  const saveButton = el('cp-save-settings-btn');
  if (!saveButton) return;
  saveButton.addEventListener('click', saveSettings);
  el('cp-cancel-settings-btn')?.addEventListener('click', fillSettingsForm);

  const logoInput = el('cp-logo-input');
  el('cp-logo-pick').addEventListener('click', () => logoInput.click());
  logoInput.addEventListener('change', () => {
    const file = logoInput.files[0];
    logoInput.value = '';
    if (!file) return;
    const form = new FormData();
    form.append('avatar', file);
    updateLogo(form, 'Логотип обновлён');
  });
  el('cp-logo-remove').addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Удалить логотип компании?', confirmLabel: 'Удалить' }))) return;
    const form = new FormData();
    form.append('remove_avatar', '1');
    updateLogo(form, 'Логотип удалён');
  });

  const directionInput = el('cp-dir-input');
  el('cp-dir-add').addEventListener('click', () => addDirections(directionInput.value));
  directionInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ',') return;
    // Enter внутри формы иначе отправляет её, запятая — попадает в текст
    event.preventDefault();
    addDirections(directionInput.value);
  });
  el('cp-dir-chips').addEventListener('click', (event) => {
    const button = event.target.closest('.chip-x');
    if (!button) return;
    directions.splice(Number(button.dataset.index), 1);
    renderDirections();
  });
}

el('cp-logout-btn')?.addEventListener('click', async () => {
  // Уходим на главную в любом случае: без сессии кабинет всё равно не откроется
  await api.post('/api/v1/auth/signout/').catch(() => null);
  location.href = '/';
});

function renderPanel(company) {
  if (panel === 'stats') renderStatsTab();
  else if (panel === 'settings') fillSettingsForm();
  else {
    renderHero(company);
    if (company.is_verified) showProfileContent(company);
    else showVerifyGate(company);
  }
}

async function init() {
  const ownsPanel = OWN_PANELS.includes(panel);
  if (ownsPanel) {
    initVerifyDocument();
    initHeroAvatarUpload();
    initSettings();
  }

  // Списки конкурсов и тестов нужны только профилю: у остальных разделов свои запросы
  const needsLists = panel === 'profile';
  const failed = [];
  // Отказ в доступе здесь штатный: неподтверждённой компании тесты не положены.
  // Сообщаем только о настоящем сбое — нет связи или ошибка сервера
  const optional = (url, label, fallback) =>
    needsLists
      ? api.get(url).catch((error) => {
          if (error.status === 0 || error.status >= 500) failed.push(label);
          return fallback;
        })
      : fallback;
  try {
    const [companyData, contestsData, testsData] = await Promise.all([
      api.get(`/api/v1/companies/${username}/`),
      optional('/api/v1/contests/company/', 'конкурсы', { contests: [] }),
      optional(`/api/v1/companies/${username}/tests/`, 'тесты', { tests: [] }),
    ]);
    if (failed.length) toast(`Не удалось загрузить: ${failed.join(', ')}. Обновите страницу.`);
    state.company = companyData.company;
    state.contests = contestsData.contests ?? [];
    state.tests = testsData.tests ?? [];

    renderSidebar(state.company);
    if (state.company.is_verified) unlockSidebarLinks();
    if (ownsPanel) renderPanel(state.company);
  } catch (error) {
    setText('cp-page-sub', `Ошибка загрузки: ${error.message}`);
  }
}

init();
