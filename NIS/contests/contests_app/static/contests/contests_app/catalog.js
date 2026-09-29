/* Каталог конкурсов. Полоса слева показывает срочность,
   вместо даты выводится обратный отсчёт до дедлайна. */
import {
  api,
  byId,
  CONTEST_CATEGORIES,
  CONTEST_STATUSES,
  countOf,
  esc,
  formatDateShort,
  initial,
  pluralForm,
  statusPill,
  WORDS,
} from 'alfa/core';

const PAGE_SIZE = 9;
const DAY_MS = 86400000;
const ICONS = {
  clock:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  people:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>',
  cup: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4"/></svg>',
  arrow:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
};

const daysLeft = (deadline) => (deadline ? Math.ceil((new Date(deadline) - Date.now()) / DAY_MS) : null);

// Приём открыт, только если статус активен И срок не вышел: сервер отклоняет работы после дедлайна
function isOpen(contest) {
  const left = daysLeft(contest.deadline);
  return contest.status === 'active' && (left === null || left >= 0);
}

function urgencyOf(contest) {
  if (!isOpen(contest)) return 'closed';
  const left = daysLeft(contest.deadline);
  if (left === null || left > 7) return 'calm';
  return left <= 3 ? 'urgent' : 'soon';
}

function deadlineLabel(contest) {
  if (!contest.deadline) return 'без срока';
  if (contest.status !== 'active') return `закрыт ${formatDateShort(contest.deadline)}`;
  const left = daysLeft(contest.deadline);
  if (left < 0) return 'срок вышел';
  if (left === 0) return 'последний день';
  return `${pluralForm(left, ['остался', 'осталось', 'осталось'])} ${countOf(left, WORDS.days)}`;
}

/* Фильтры живут и в адресе, чтобы F5 и ссылка их сохраняли */

const params = new URLSearchParams(location.search);
const state = {
  me: null,
  contests: [],
  status: params.get('status') || 'all',
  category: params.get('cat') || 'all',
  query: params.get('q') || '',
  shown: PAGE_SIZE,
};

function syncUrl() {
  const next = new URLSearchParams();
  if (state.status !== 'all') next.set('status', state.status);
  if (state.category !== 'all') next.set('cat', state.category);
  if (state.query.trim()) next.set('q', state.query.trim());
  history.replaceState(null, '', `${location.pathname}${next.size ? `?${next}` : ''}`);
}

function filtered() {
  const query = state.query.trim().toLowerCase();
  return state.contests.filter(
    (contest) =>
      (state.status === 'all' || contest.status === state.status) &&
      (state.category === 'all' || (contest.category ?? '').toLowerCase() === state.category) &&
      (!query ||
        `${contest.title} ${contest.excerpt} ${contest.company_name} ${contest.prize}`.toLowerCase().includes(query)),
  );
}

function card(contest) {
  const urgency = urgencyOf(contest);
  const company = contest.company_name || contest.company_username || '';
  const category = CONTEST_CATEGORIES[(contest.category ?? '').toLowerCase()] ?? contest.category ?? '';
  const status = CONTEST_STATUSES[contest.status] ? contest.status : 'finished';
  const participants = contest.participants_count
    ? countOf(contest.participants_count, WORDS.participants)
    : 'пока никого';
  const open = isOpen(contest);
  return `
    <article class="card cn-card" data-urgency="${urgency}">
      <div class="cn-head">
        <span class="cn-company-av">${esc(initial(company))}</span>
        <span class="cn-company">${esc(company)}</span>
        ${statusPill(CONTEST_STATUSES, status, 'cn-status')}
      </div>
      <div class="card-title">${esc(contest.title || 'Конкурс')}</div>
      <div class="card-excerpt">${esc(contest.excerpt || 'Компания не добавила краткое описание кейса.')}</div>
      ${contest.prize ? `<div class="cn-prize">${ICONS.cup}${esc(contest.prize)}</div>` : ''}
      <div class="cn-meta">
        <span class="cn-deadline ${urgency === 'urgent' ? 'urgent' : ''}">${ICONS.clock}${esc(deadlineLabel(contest))}</span>
        <span class="cn-deadline">${ICONS.people}${participants}</span>
        ${category ? `<span class="cn-cat">${esc(category)}</span>` : ''}
      </div>
      <button class="cn-start" data-join="${contest.id}" data-open="${open}">
        ${open ? 'Участвовать' : 'Смотреть конкурс'}${ICONS.arrow}
      </button>
    </article>`;
}

function renderGrid() {
  const list = filtered();
  byId('cat-count').textContent = list.length ? countOf(list.length, WORDS.contests) : '';
  byId('cat-grid').innerHTML = list.length
    ? list.slice(0, state.shown).map(card).join('')
    : `<div class="state-msg">${
        state.query.trim()
          ? `По запросу «${esc(state.query.trim())}» ничего не нашлось`
          : 'Под выбранные фильтры ничего не подходит'
      }</div>`;
  byId('load-more-row').hidden = state.shown >= list.length;
}

function renderClosing() {
  const soon = state.contests
    .filter((contest) => isOpen(contest) && contest.deadline)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 5);
  byId('closing-list').innerHTML = soon.length
    ? soon
        .map(
          (contest, index) => `
      <a class="trending-item" href="/contests/${contest.id}/">
        <span class="trending-num">${index + 1}</span>
        <span class="trending-body">
          <span class="trending-title">${esc(contest.title || 'Конкурс')}</span>
          <span class="trending-meta">${esc(deadlineLabel(contest))}</span>
        </span>
      </a>`,
        )
        .join('')
    : '<div class="trending-empty">Активных конкурсов со сроком нет</div>';
}

function syncChips() {
  document
    .querySelectorAll('.cr-chip[data-status]')
    .forEach((chip) => chip.classList.toggle('active', chip.dataset.status === state.status));
  document
    .querySelectorAll('.cr-chip[data-cat]')
    .forEach((chip) => chip.classList.toggle('active', chip.dataset.cat === state.category));
}

function applyFilters(changes) {
  Object.assign(state, changes, { shown: PAGE_SIZE });
  syncChips();
  syncUrl();
  renderGrid();
}

document
  .querySelectorAll('.cr-chip[data-status]')
  .forEach((chip) => chip.addEventListener('click', () => applyFilters({ status: chip.dataset.status })));
document
  .querySelectorAll('.cr-chip[data-cat]')
  .forEach((chip) => chip.addEventListener('click', () => applyFilters({ category: chip.dataset.cat })));

const searchInput = byId('search-input');
searchInput.value = state.query;
searchInput.addEventListener('input', () => applyFilters({ query: searchInput.value }));

byId('btn-load').addEventListener('click', () => {
  state.shown += PAGE_SIZE;
  renderGrid();
});

const authModal = byId('cat-auth-modal');
const closeAuthModal = () => authModal.classList.remove('open');

// Участие требует входа — анониму предлагаем войти и вернуться к конкурсу
byId('cat-grid').addEventListener('click', (event) => {
  const button = event.target.closest('[data-join]');
  if (!button) return;
  const url = `/contests/${button.dataset.join}/`;
  if (button.dataset.open === 'true' && !state.me) {
    const next = `?next=${encodeURIComponent(url)}`;
    byId('cat-signin').search = next;
    byId('cat-signup').search = next;
    authModal.classList.add('open');
    return;
  }
  location.href = url;
});

// Закрытие окна: «Не сейчас», клик по затемнению и Esc
byId('cat-modal-close').addEventListener('click', closeAuthModal);
authModal.addEventListener('click', (event) => {
  if (event.target === authModal) closeAuthModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeAuthModal();
});

api
  .get('/api/v1/auth/me/')
  .then(({ account }) => {
    state.me = account;
    // Создавать конкурсы могут только компании
    byId('btn-create').hidden = account?.role !== 'company';
  })
  .catch(() => null);

syncChips();
try {
  ({ contests: state.contests = [] } = await api.get('/api/v1/contests/catalog/'));
  renderClosing();
  renderGrid();
} catch {
  byId('cat-grid').innerHTML = '<div class="state-msg">Не удалось загрузить конкурсы</div>';
}
