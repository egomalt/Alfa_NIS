/* Каталог конкурсов.
 *
 * Конструкция страницы общая с остальными каталогами: шапка → поиск → чипы
 * фильтров → сетка с боковой панелью. Оформление карточки своё: у конкурса
 * есть срок — то, чего нет больше нигде на сайте. Поэтому полоса слева
 * показывает срочность, а не тип, и вместо даты выводится обратный отсчёт:
 * «осталось 3 дня» понятнее, чем «до 17 сентября».
 */
const PER_PAGE = 9;

const STATUS_LABELS = { active: 'Активен', review: 'На проверке', finished: 'Завершён' };
const CAT_LABELS = {
  backend: 'Backend', frontend: 'Frontend', devops: 'DevOps',
  analytics: 'Аналитика', design: 'Дизайн',
};

const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const initial = name => (name || '?').trim()[0].toUpperCase();
const el = id => document.getElementById(id);

const ICON_CLOCK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
const ICON_PEOPLE = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>';
const ICON_CUP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4"/></svg>';
const ICON_ARROW = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

/* ── Срок и срочность ─────────────────────────────────────────────── */

function daysLeft(deadline) {
  if (!deadline) return null;
  const diff = new Date(deadline) - Date.now();
  return Math.ceil(diff / 86400000);
}

// Приём работ реально открыт: статус активен И срок ещё не вышел.
// Сервер отклоняет работы после дедлайна, поэтому карточка не должна
// предлагать участие, даже если статус остался «активен».
function isOpen(contest) {
  if (contest.status !== 'active') return false;
  const left = daysLeft(contest.deadline);
  return left === null || left >= 0;
}

function urgencyOf(contest) {
  if (!isOpen(contest)) return 'closed';
  const left = daysLeft(contest.deadline);
  if (left === null) return 'calm';
  if (left <= 3) return 'urgent';
  if (left <= 7) return 'soon';
  return 'calm';
}

function deadlineLabel(contest) {
  if (!contest.deadline) return 'без срока';
  if (contest.status !== 'active') {
    return 'закрыт ' + new Date(contest.deadline).toLocaleDateString('ru-RU',
      { day: 'numeric', month: 'short' });
  }

  const left = daysLeft(contest.deadline);
  if (left < 0) return 'срок вышел';
  if (left === 0) return 'последний день';

  const m10 = left % 10, m100 = left % 100;
  if (m100 >= 11 && m100 <= 19) return `осталось ${left} дней`;
  if (m10 === 1) return `остался ${left} день`;
  if (m10 >= 2 && m10 <= 4) return `осталось ${left} дня`;
  return `осталось ${left} дней`;
}

function contestsLabel(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 19) return `${n} конкурсов`;
  if (m10 === 1) return `${n} конкурс`;
  if (m10 >= 2 && m10 <= 4) return `${n} конкурса`;
  return `${n} конкурсов`;
}

function participantsLabel(n) {
  if (!n) return 'пока никого';
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 19) return `${n} участников`;
  if (m10 === 1) return `${n} участник`;
  if (m10 >= 2 && m10 <= 4) return `${n} участника`;
  return `${n} участников`;
}

/* ── Состояние ────────────────────────────────────────────────────── */

const params = new URLSearchParams(location.search);
let me = null;
let all = [];
let status = params.get('status') || 'all';
let category = params.get('cat') || 'all';
let query = (params.get('q') || '').trim().toLowerCase();
let shown = PER_PAGE;

function visible() {
  return all.filter(c => {
    if (status !== 'all' && c.status !== status) return false;
    if (category !== 'all' && (c.category || '').toLowerCase() !== category) return false;
    if (!query) return true;
    return `${c.title} ${c.excerpt} ${c.company_name} ${c.prize}`.toLowerCase().includes(query);
  });
}

/* ── Отрисовка ────────────────────────────────────────────────────── */

function cardHtml(contest) {
  const urgency = urgencyOf(contest);
  const statusKey = STATUS_LABELS[contest.status] ? contest.status : 'finished';
  const catLabel = CAT_LABELS[(contest.category || '').toLowerCase()] || contest.category || '';
  const excerpt = contest.excerpt || 'Компания не добавила краткое описание кейса.';
  const open = isOpen(contest);
  const action = open ? 'Участвовать' : 'Смотреть конкурс';

  return `
    <article class="card cn-card" data-urgency="${urgency}">
      <div class="cn-head">
        <span class="cn-company-av">${esc(initial(contest.company_name || contest.company_username))}</span>
        <span class="cn-company">${esc(contest.company_name || contest.company_username || '')}</span>
        <span class="cn-status cn-status-${statusKey}">${STATUS_LABELS[statusKey]}</span>
      </div>
      <div class="card-title">${esc(contest.title || 'Конкурс')}</div>
      <div class="card-excerpt">${esc(excerpt)}</div>
      ${contest.prize ? `<div class="cn-prize">${ICON_CUP}${esc(contest.prize)}</div>` : ''}
      <div class="cn-meta">
        <span class="cn-deadline${urgency === 'urgent' ? ' urgent' : ''}">${ICON_CLOCK}${esc(deadlineLabel(contest))}</span>
        <span class="cn-deadline">${ICON_PEOPLE}${esc(participantsLabel(contest.participants_count))}</span>
        ${catLabel ? `<span class="cn-cat">${esc(catLabel)}</span>` : ''}
      </div>
      <button class="cn-start" data-join="${contest.id}" data-open="${open ? '1' : '0'}">
        ${action}${ICON_ARROW}
      </button>
    </article>`;
}

function renderGrid() {
  const list = visible();
  const grid = el('cat-grid');

  el('cat-count').textContent = list.length ? contestsLabel(list.length) : '';

  if (!list.length) {
    grid.innerHTML = `<div class="state-msg">${
      query ? `По запросу «${esc(query)}» ничего не нашлось` : 'Под выбранные фильтры ничего не подходит'
    }</div>`;
    el('load-more-row').style.display = 'none';
    return;
  }

  grid.innerHTML = list.slice(0, shown).map(cardHtml).join('');
  el('load-more-row').style.display = list.length > shown ? '' : 'none';
}

function renderClosing() {
  const soon = all
    .filter(c => isOpen(c) && c.deadline)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 5);
  const list = el('closing-list');

  if (!soon.length) {
    list.innerHTML = '<div style="font-size:13px;color:var(--muted);">Активных конкурсов со сроком нет</div>';
    return;
  }

  list.innerHTML = soon.map((c, i) => `
    <a class="trending-item" href="/contests/${c.id}/" style="text-decoration:none;color:inherit;">
      <span class="trending-num">${i + 1}</span>
      <span style="min-width:0;">
        <div class="trending-title">${esc(c.title || 'Конкурс')}</div>
        <div class="trending-meta">${esc(deadlineLabel(c))}</div>
      </span>
    </a>`).join('');
}

function syncChips() {
  document.querySelectorAll('[data-status]').forEach(b => {
    if (b.dataset.status !== undefined && b.classList.contains('cr-chip')) {
      b.classList.toggle('active', b.dataset.status === status);
    }
  });
  document.querySelectorAll('[data-cat]').forEach(b =>
    b.classList.toggle('active', b.dataset.cat === category));
  const input = el('search-input');
  if (input && !input.value) input.value = params.get('q') || '';
}

/* ── Обработчики ──────────────────────────────────────────────────── */

document.querySelectorAll('.cr-chip[data-status]').forEach(button => {
  button.addEventListener('click', () => {
    status = button.dataset.status;
    shown = PER_PAGE;
    syncChips();
    renderGrid();
  });
});

document.querySelectorAll('.cr-chip[data-cat]').forEach(button => {
  button.addEventListener('click', () => {
    category = button.dataset.cat;
    shown = PER_PAGE;
    syncChips();
    renderGrid();
  });
});

el('search-input').addEventListener('input', event => {
  query = event.target.value.trim().toLowerCase();
  shown = PER_PAGE;
  renderGrid();
});

el('btn-load').addEventListener('click', () => {
  shown += PER_PAGE;
  renderGrid();
});

// Участие требует входа — анониму показываем окно с предложением войти
el('cat-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-join]');
  if (!button) return;
  const id = button.dataset.join;
  if (button.dataset.open === '1' && !me) {
    el('cat-auth-modal').classList.add('open');
    return;
  }
  location.href = `/contests/${id}/`;
});

// Закрытие окна: кнопка «Не сейчас», клик по затемнению и Esc
el('cat-modal-close').addEventListener('click', closeAuthModal);
el('cat-auth-modal').addEventListener('click', event => {
  if (event.target.id === 'cat-auth-modal') closeAuthModal();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeAuthModal();
});

function closeAuthModal() {
  el('cat-auth-modal').classList.remove('open');
}

/* ── Запуск ───────────────────────────────────────────────────────── */

fetch('/api/v1/auth/me/')
  .then(r => r.json())
  .then(data => {
    me = data.ok ? data.account : null;
    // Создавать конкурсы могут только компании
    if (me && me.role === 'company') el('btn-create').style.display = '';
  })
  .catch(() => {});

fetch('/api/v1/contests/catalog/')
  .then(r => r.json())
  .then(data => {
    if (!data.ok) throw new Error();
    all = data.contests || [];
    syncChips();
    renderClosing();
    renderGrid();
  })
  .catch(() => {
    el('cat-grid').innerHTML = '<div class="state-msg">Не удалось загрузить конкурсы</div>';
  });
