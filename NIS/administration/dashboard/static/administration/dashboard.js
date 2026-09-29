/* Ядро админ-панели (модуль alfa/admin): вкладки, модалки причины и документа, реестр разделов.
   Каждый раздел — отдельный модуль, он регистрируется через registerSection(),
   а панель запускается, когда загружены все модули страницы. */
import { api, byId as el, esc, toast } from 'alfa/core';

const STATUSES = {
  pending: ['На проверке', 'amber'],
  approved: ['Одобрено', 'green'],
  rejected: ['Отклонено', 'red'],
  active: ['Активен', 'green'],
  banned: ['Забанен', 'red'],
  new: ['Новая', 'amber'],
  resolved: ['Рассмотрена', 'green'],
  dismissed: ['Отклонена', 'muted'],
};

export function pill(status, labelOverride) {
  const [label, tone] = STATUSES[status] ?? [status, 'muted'];
  return `<span class="cr-pill ap-status-pill cr-tone-${tone}">${esc(labelOverride || label)}</span>`;
}

export const emptyState = (title, text) =>
  `<div class="ap-empty"><div class="ap-empty-title">${esc(title)}</div><div class="ap-empty-sub">${esc(text)}</div></div>`;

/* Ошибка запроса — одинаково во всех разделах */
export const fail = (error) => toast(error.message || 'Не удалось выполнить действие.');

/* Последний ответ побеждает: при быстрой смене фильтра или вводе в поиск
   ответ на старый запрос может прийти позже нового и затереть его */
export function latestOnly() {
  let current = 0;
  return async (promise) => {
    const ticket = ++current;
    const result = await promise;
    if (ticket !== current) throw Object.assign(new Error('Ответ устарел'), { stale: true });
    return result;
  };
}

const sections = {};
const TABS = ['overview', 'verify', 'users', 'reports'];
let currentTab = 'overview';

export function registerSection(name, section) {
  sections[name] = section;
}

export const reloadOverview = () => sections.overview?.load();

const tabFromHash = () => (TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview');

export function showTab(requested, { updateHash = true } = {}) {
  const name = TABS.includes(requested) ? requested : 'overview';
  currentTab = name;
  document
    .querySelectorAll('.ap-tab-panel')
    .forEach((panel) => panel.classList.toggle('active', panel.id === `ap-panel-${name}`));
  document
    .querySelectorAll('.ap-side-link[data-tab]')
    .forEach((link) => link.classList.toggle('active', link.dataset.tab === name));
  // Раздел держим в адресе: после F5 и по «назад» панель остаётся там же
  if (updateHash && location.hash.slice(1) !== name) location.hash = name;
  scrollTo(0, 0);
  sections[name]?.load();
}

export function refreshBadges(stats) {
  for (const [id, value] of [
    ['ap-badge-verify', stats.verify_pending],
    ['ap-badge-reports', stats.reports_new],
  ]) {
    const badge = el(id);
    if (!badge) continue;
    badge.textContent = value || '';
    badge.hidden = !value;
  }
}

const reasonModal = {
  callback: null,
  needsDuration: false,
  permanent: false,
};

export function openReasonModal(title, callback, { needsDuration = false } = {}) {
  el('ap-reason-modal-title').textContent = title;
  el('ap-reason-text').value = '';
  Object.assign(reasonModal, { callback, needsDuration, permanent: false });
  el('ap-duration-days').value = 7;
  el('ap-duration-days').disabled = false;
  el('ap-duration-perm-btn').classList.remove('active');
  el('ap-modal-duration-field').hidden = !needsDuration;
  el('ap-reason-modal').classList.add('ap-open');
}

function closeReasonModal() {
  el('ap-reason-modal').classList.remove('ap-open');
  reasonModal.callback = null;
}

function setupReasonModal() {
  el('ap-reason-cancel').addEventListener('click', closeReasonModal);
  el('ap-reason-confirm').addEventListener('click', () => {
    const reason = el('ap-reason-text').value.trim();
    const duration = reasonModal.needsDuration
      ? reasonModal.permanent
        ? 'perm'
        : el('ap-duration-days').value || '7'
      : null;
    const { callback } = reasonModal;
    closeReasonModal();
    callback?.(reason, duration);
  });
  el('ap-duration-perm-btn').addEventListener('click', (event) => {
    reasonModal.permanent = !reasonModal.permanent;
    event.currentTarget.classList.toggle('active', reasonModal.permanent);
    el('ap-duration-days').disabled = reasonModal.permanent;
  });
  el('ap-reason-modal').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeReasonModal();
  });
}

/* Фрейм каждый раз создаётся заново: смена src у существующего фрейма пишет
   запись в историю, и «назад» в браузере листал бы документ, а не разделы */
function replaceDocFrame(url) {
  const frame = el('ap-doc-frame');
  const fresh = frame.cloneNode(false);
  fresh.removeAttribute('src');
  if (url) fresh.src = url;
  fresh.hidden = !url;
  frame.replaceWith(fresh);
}

export function openDocModal(name, url) {
  el('ap-doc-modal-name').textContent = name || 'Документ';
  const openLink = el('ap-doc-open');
  openLink.hidden = !url;
  if (url) openLink.href = url;
  el('ap-doc-missing').hidden = Boolean(url);
  replaceDocFrame(url);
  el('ap-doc-modal').classList.add('ap-open');
}

function closeDocModal() {
  el('ap-doc-modal').classList.remove('ap-open');
  // Пустой фрейм освобождает память, которую держал открытый PDF
  replaceDocFrame(null);
}

function setupDocModal() {
  el('ap-doc-close').addEventListener('click', closeDocModal);
  el('ap-doc-modal').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeDocModal();
  });
}

function setupNavigation() {
  document
    .querySelectorAll('.ap-side-link[data-tab]')
    .forEach((link) => link.addEventListener('click', () => showTab(link.dataset.tab)));
  document
    .querySelectorAll('[data-goto]')
    .forEach((link) => link.addEventListener('click', () => showTab(link.dataset.goto)));
  addEventListener('hashchange', () => {
    const name = tabFromHash();
    if (name !== currentTab) showTab(name, { updateHash: false });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeDocModal();
    closeReasonModal();
  });

  el('ap-logout')?.addEventListener('click', async () => {
    await api.post('/api/v1/auth/signout/').catch(() => null);
    location.href = '/';
  });

  const layout = document.querySelector('.ap-layout');
  const closeSidebar = () => layout?.classList.remove('sidebar-open');
  el('ap-sidebar-burger')?.addEventListener('click', (event) => {
    event.stopPropagation();
    layout.classList.toggle('sidebar-open');
  });
  el('ap-scrim')?.addEventListener('click', closeSidebar);
  document.querySelectorAll('.ap-side-link').forEach((link) => link.addEventListener('click', closeSidebar));
}

// Модули разделов выполняются раньше DOMContentLoaded, так что к старту все зарегистрированы
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupReasonModal();
  setupDocModal();
  Object.values(sections).forEach((section) => section.init?.());

  const start = tabFromHash();
  showTab(start, { updateHash: false });
  // Бейджи сайдбара живут в данных обзора — подтягиваем их и с другого раздела
  if (start !== 'overview') reloadOverview();
});
