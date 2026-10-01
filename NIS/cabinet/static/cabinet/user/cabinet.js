/* Ядро кабинета кандидата (модуль alfa/cabinet-user): данные, сайдбар, выход.
   Каждый раздел кабинета — отдельная страница со своим модулем. Модуль раздела
   регистрируется через registerPanel() и говорит, какие данные ему нужны:
   ядро запрашивает только их и после загрузки вызывает отрисовку. */
import { api, byId, countOf, esc, initial, pageData, toast } from 'alfa/core';

export const { username } = pageData();

export const state = {
  candidate: null,
  tests: [],
  articles: [],
  contestHistory: [],
  myRatings: [],
  attempts: null,
  // Источники, которые не загрузились: раздел пишет «не удалось», а не «пусто»
  failed: new Set(),
};

const SOURCES = {
  tests: ['/api/v1/tests/', 'тесты', (data) => (state.tests = data.tests ?? [])],
  articles: ['/api/v1/articles/my/', 'статьи', (data) => (state.articles = data.articles ?? [])],
  contestHistory: [
    '/api/v1/contests/user-history/',
    'конкурсы',
    (data) => (state.contestHistory = data.submissions ?? []),
  ],
  myRatings: ['/api/v1/companies/my-ratings/', 'оценки компаний', (data) => (state.myRatings = data.ratings ?? [])],
  attempts: ['/api/v1/tests/my-attempts/', 'прохождения тестов', (data) => (state.attempts = data)],
};

export const ICONS = {
  stats:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-4"/></svg>',
  edit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  delete:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  open: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>',
};

const panels = [];

/* needs — ключи SOURCES, без которых раздел не отрисовать.
   onCandidateChange — что обновить, когда поменялся профиль (фото, имя);
   по умолчанию раздел перерисовывается целиком */
export function registerPanel({ render, needs = [], onCandidateChange = render }) {
  panels.push({ render, needs, onCandidateChange });
}

export const renderPanels = () => panels.forEach((panel) => panel.render());

export function setText(id, value) {
  const element = byId(id);
  if (element) element.textContent = String(value);
}

/* 1200 → «1.2 тыс.» */
export const shortNumber = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')} тыс.` : String(n));

/* Число со словом; большие числа сокращаются: «1.2 тыс. просмотров» */
export const shortCount = (n, forms) => (n >= 1000 ? `${shortNumber(n)} ${forms[2]}` : countOf(n, forms));

export const sum = (items, key) => items.reduce((total, item) => total + (item[key] || 0), 0);

export const avatarHtml = (candidate) =>
  candidate.avatar ? `<img src="${esc(candidate.avatar)}" alt="">` : esc(initial(candidate.name || candidate.username));

/* Таблица раздела с фильтром-чипами и пустым состоянием — одинакова
   у тестов, статей и конкурсов. Плашки сверху раздел считает сам по всем
   записям: это сводка, а не срез под фильтром */
export function listPanel({ key, source, items, matches, row, empty }) {
  const body = byId(`ud-${key}-body`);
  let filter = 'all';

  function render() {
    const list = items();
    const shown = filter === 'all' ? list : list.filter((item) => matches(item, filter));
    setText(`ud-${key}-count`, list.length ? `${shown.length} из ${list.length}` : '');
    body.innerHTML = shown.map(row).join('');
    byId(`ud-${key}-wrapper`).hidden = !shown.length;
    byId('tests-empty').hidden = Boolean(shown.length);
    // Пусто из-за фильтра и пусто вообще — разные сообщения
    const failed = state.failed.has(source);
    const [title, sub] = failed
      ? ['Не удалось загрузить список', 'Обновите страницу. Если не поможет — попробуйте чуть позже.']
      : list.length
        ? empty.filtered
        : empty.none;
    setText('tests-empty-title', title);
    setText('tests-empty-sub', sub);
    byId('tests-empty-create').hidden = failed || Boolean(list.length);
  }

  byId(`panel-${key}`).addEventListener('click', (event) => {
    const chip = event.target.closest(`[data-${key}-filter]`);
    if (!chip) return;
    filter = chip.dataset[`${key}Filter`];
    byId(`panel-${key}`)
      .querySelectorAll(`[data-${key}-filter]`)
      .forEach((item) => item.classList.toggle('active', item === chip));
    render();
  });

  return render;
}

function renderSidebar() {
  const { candidate } = state;
  byId('ud-sidebar-av').innerHTML = avatarHtml(candidate);
  setText('ud-sidebar-name', candidate.name || candidate.username);
}

/* Профиль изменился (фото, имя) — обновляются сайдбар и открытый раздел */
export function updateCandidate(candidate) {
  state.candidate = candidate;
  renderSidebar();
  panels.forEach((panel) => panel.onCandidateChange());
}

export async function uploadAvatar(file) {
  const body = new FormData();
  body.append('avatar', file);
  const { candidate } = await api.post(`/api/v1/candidates/${username}/avatar/`, body);
  updateCandidate(candidate);
}

// Уходим на главную в любом случае: если сессии уже нет, выход всё равно
// должен увести со страницы кабинета
byId('ud-logout-btn')?.addEventListener('click', () => {
  api
    .post('/api/v1/auth/signout/')
    .catch(() => null)
    .finally(() => location.assign('/'));
});

async function start() {
  if (!username) return;
  try {
    state.candidate = (await api.get(`/api/v1/candidates/${username}/`)).candidate;
  } catch (error) {
    toast(error.message);
    return;
  }
  renderSidebar();

  // Каждый источник грузится независимо: сбой одного не гасит остальные
  const needed = [...new Set(panels.flatMap((panel) => panel.needs))];
  await Promise.all(
    needed.map(async (key) => {
      const [url, , apply] = SOURCES[key];
      try {
        apply(await api.get(url));
      } catch {
        state.failed.add(key);
      }
    }),
  );
  // Без уведомления пустой раздел выглядел бы как «у вас ничего нет»
  if (state.failed.size) {
    toast(`Не удалось загрузить: ${[...state.failed].map((key) => SOURCES[key][1]).join(', ')}. Обновите страницу.`);
  }
  renderPanels();
}

// Модули разделов выполняются раньше DOMContentLoaded — к старту все зарегистрированы
document.addEventListener('DOMContentLoaded', start);
