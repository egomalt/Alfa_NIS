/* Раздел «Пользователи»: поиск, бан и разбан. */
import { api, byId as el, esc, formatDate, toast } from 'alfa/core';
import { renderPager } from 'alfa/pager';
import { emptyState, fail, latestOnly, openReasonModal, pill, registerSection, reloadOverview } from 'alfa/admin';

const SEARCH_DELAY_MS = 300;

let filter = 'all';
let query = '';
let page = 1;
const latest = latestOnly();

// Коротко: слово «Забанен» дублирует и цвет плашки, и колонку «Статус»
const banLabel = (user) => {
  if (user.status !== 'banned') return null;
  return user.ban_until ? `Бан до ${formatDate(user.ban_until)}` : 'Бан навсегда';
};

function actionsHtml(user) {
  if (user.role === 'moderator') return '<span class="ap-u-meta">—</span>';
  if (user.status === 'banned') {
    return `<button class="ap-btn-mini" data-act="unban" data-user="${esc(user.username)}" data-name="${esc(user.name)}">Разбанить</button>`;
  }
  return `<button class="ap-btn-mini ap-danger" data-act="ban" data-user="${esc(user.username)}" data-name="${esc(user.name)}">Бан</button>`;
}

const rowHtml = (user) => `
  <div class="ap-trow ap-body">
    <div class="ap-u-cell">
      <span class="ap-company-avatar is-small">${esc(user.letter)}</span>
      <div class="ap-u-name">${esc(user.name)}</div>
    </div>
    <div class="ap-u-meta">${esc(user.role_label)}</div>
    <div class="ap-u-meta">${esc(formatDate(user.joined_at))}</div>
    <div>${pill(user.status, banLabel(user))}</div>
    <div class="ap-row-actions">${actionsHtml(user)}</div>
  </div>`;

const HEAD =
  '<div class="ap-trow ap-thead"><span>Пользователь</span><span>Роль</span><span>С нами</span><span>Статус</span><span></span></div>';

async function load() {
  const params = new URLSearchParams({ filter, page });
  if (query) params.set('q', query);
  try {
    const data = await latest(api.get(`/api/v1/admin/users/?${params}`));
    const users = data.users ?? [];
    el('ap-u-count').textContent = data.total ?? users.length;
    el('ap-users-table').innerHTML = users.length
      ? HEAD + users.map(rowHtml).join('')
      : emptyState('Никого не найдено', 'Измените фильтр или запрос');
    renderPager(el('ap-users-pager'), data, (next) => {
      page = next;
      load();
    });
  } catch (error) {
    if (!error.stale) el('ap-users-table').innerHTML = emptyState('Ошибка', error.message);
  }
}

async function act(url, payload, message) {
  try {
    const data = await api.post(url, payload);
    toast(typeof message === 'function' ? message(data) : message, 'ok');
    load();
    reloadOverview();
  } catch (error) {
    fail(error);
  }
}

function init() {
  el('ap-users-filters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-uf]');
    if (!button) return;
    filter = button.dataset.uf;
    page = 1;
    event.currentTarget
      .querySelectorAll('[data-uf]')
      .forEach((item) => item.classList.toggle('active', item.dataset.uf === filter));
    load();
  });

  // Запрос уходит, когда человек перестал печатать, а не на каждую букву
  let searchTimer;
  el('ap-user-search')?.addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      query = event.target.value.trim();
      page = 1;
      load();
    }, SEARCH_DELAY_MS);
  });

  el('ap-users-table').addEventListener('click', (event) => {
    const target = event.target.closest('[data-act]');
    if (!target) return;
    const { user } = target.dataset;
    const name = target.dataset.name || user;
    if (target.dataset.act === 'unban') {
      act(`/api/v1/admin/users/${user}/unban/`, {}, `Блокировка с ${name} снята.`);
    } else {
      openReasonModal(
        `Причина и срок бана — ${name}`,
        (reason, duration) =>
          act(
            `/api/v1/admin/users/${user}/ban/`,
            { reason, duration },
            (data) =>
              `${name} заблокирован.${data.contests_removed ? ` Удалено конкурсов: ${data.contests_removed}.` : ''}`,
          ),
        { needsDuration: true },
      );
    }
  });
}

registerSection('users', { init, load });
