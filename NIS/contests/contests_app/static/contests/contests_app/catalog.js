/* Каталог конкурсов. Карточка — билет: сверху приз, ниже кейс
   и шкала времени до дедлайна, цвет которой показывает срочность. */
import { catalog, syncUrl } from 'alfa/catalog';
import { api, byId, CONTEST_CATEGORIES, countOf, esc, formatDateShort, initial, pluralForm, WORDS } from 'alfa/core';

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
  status: params.get('status') || 'all',
  category: params.get('cat') || 'all',
  query: params.get('q') || '',
};

function timeline(contest) {
  if (contest.status === 'review') return { label: 'Идёт проверка решений', progress: 100 };
  if (contest.status !== 'active') {
    return { label: contest.deadline ? `Завершён ${formatDateShort(contest.deadline)}` : 'Завершён', progress: 100 };
  }
  if (!contest.deadline) return { label: 'Без срока', progress: null };
  const left = daysLeft(contest.deadline);
  if (left < 0) return { label: 'Приём решений закрыт', progress: 100 };
  const start = new Date(contest.created_at).getTime();
  const end = new Date(contest.deadline).getTime();
  const passed = end > start ? ((Date.now() - start) / (end - start)) * 100 : 100;
  return {
    label:
      left === 0
        ? 'Последний день'
        : `${pluralForm(left, ['Остался', 'Осталось', 'Осталось'])} ${countOf(left, WORDS.days)}`,
    progress: Math.min(100, Math.max(4, passed)),
  };
}

function card(contest) {
  const urgency = urgencyOf(contest);
  const company = contest.company_name || contest.company_username || '';
  const category = CONTEST_CATEGORIES[(contest.category ?? '').toLowerCase()] ?? contest.category ?? '';
  const participants = contest.participants_count
    ? countOf(contest.participants_count, WORDS.participants)
    : 'пока никого';
  const open = isOpen(contest);
  const time = timeline(contest);
  return `
    <article class="card cn-card" data-urgency="${urgency}">
      <div class="cn-prize${contest.prize ? '' : ' is-empty'}">
        <div class="cn-prize-top">
          <span class="cn-prize-label"><span class="cn-prize-icon">${ICONS.cup}</span>Приз</span>
          ${category ? `<span class="cn-cat">${esc(category)}</span>` : ''}
        </div>
        <div class="cn-prize-value">${esc(contest.prize || 'Не объявлен')}</div>
      </div>
      <div class="cn-cut"></div>
      <div class="cn-body">
        <div class="cn-company">
          <span class="cn-company-av">${esc(initial(company))}</span>
          <span class="cn-company-name">${esc(company)}</span>
        </div>
        <div class="card-title">${esc(contest.title || 'Конкурс')}</div>
        <div class="card-excerpt">${esc(contest.excerpt || 'Компания не добавила краткое описание кейса.')}</div>
        <div class="cn-time">
          <div class="cn-time-row">
            <span class="cn-time-label">${ICONS.clock}${esc(time.label)}</span>
            <span class="cn-people">${ICONS.people}${participants}</span>
          </div>
          ${time.progress === null ? '' : `<div class="cn-track"><span style="width: ${time.progress.toFixed(0)}%"></span></div>`}
        </div>
        <button class="cn-start${open ? ' is-open' : ''}" data-join="${contest.id}" data-open="${open}">
          ${open ? 'Участвовать' : 'Смотреть конкурс'}${ICONS.arrow}
        </button>
      </div>
    </article>`;
}

function renderClosing(soon) {
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

const list = catalog({
  url: '/api/v1/contests/catalog/',
  key: 'contests',
  perPage: PAGE_SIZE,
  gridId: 'cat-grid',
  card,
  empty: () =>
    state.query.trim()
      ? `По запросу «${state.query.trim()}» ничего не нашлось`
      : 'Под выбранные фильтры ничего не подходит',
  params: () => ({ q: state.query.trim(), status: state.status, category: state.category }),
  onTotal: (total) => {
    byId('cat-count').textContent = total ? countOf(total, WORDS.contests) : '';
  },
  onExtras: ({ closing }) => renderClosing(closing),
});

function applyFilters(changes, { typing = false } = {}) {
  Object.assign(state, changes);
  syncChips();
  syncUrl({ status: state.status, cat: state.category, q: state.query.trim() });
  if (typing) list.reloadSoon();
  else list.reload();
}

document
  .querySelectorAll('.cr-chip[data-status]')
  .forEach((chip) => chip.addEventListener('click', () => applyFilters({ status: chip.dataset.status })));
document
  .querySelectorAll('.cr-chip[data-cat]')
  .forEach((chip) => chip.addEventListener('click', () => applyFilters({ category: chip.dataset.cat })));

const searchInput = byId('search-input');
searchInput.value = state.query;
searchInput.addEventListener('input', () => applyFilters({ query: searchInput.value }, { typing: true }));

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
list.reload();
