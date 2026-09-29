/* Раздел «Конкурсы» кабинета компании: сводка, фильтр по статусу, таблица. */
import { api, byId, confirmDialog, CONTEST_STATUSES, esc, formatDate, statusPill, toast } from 'alfa/core';

const URGENT_DAYS = 10;
const ICONS = {
  submissions:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  edit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>',
  delete:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
};

const state = { contests: [], filter: 'all' };

const isUrgent = ({ deadline, status }) =>
  status === 'active' && deadline && (new Date(deadline) - Date.now()) / 86400000 <= URGENT_DAYS;

const emptyHtml = (title, text) =>
  `<div class="cc-empty"><div class="cc-empty-title">${esc(title)}</div><div class="cc-empty-sub">${esc(text)}</div></div>`;

function renderStats() {
  const { contests } = state;
  const sum = (key) => contests.reduce((total, contest) => total + (contest[key] || 0), 0);
  byId('cc-stats-row').innerHTML = [
    [contests.length, 'Всего конкурсов'],
    [contests.filter((contest) => contest.status === 'active').length, 'Сейчас активны'],
    [sum('participants_count'), 'Участников'],
    [sum('submissions_count'), 'Решений прислано'],
  ]
    .map(
      ([value, label]) => `
    <div class="cp-stat-card"><div class="cp-stat-value">${value}</div><div class="cp-stat-label">${label}</div></div>`,
    )
    .join('');
}

/* Строка ведёт на страницу конкурса, кнопки справа — на свои разделы */
const row = (contest) => `
  <div class="cc-trow" data-href="/contests/${contest.id}/">
    <div>
      <div class="cc-title">${esc(contest.title || 'Без названия')}</div>
      <div class="cc-sub">${esc(contest.category)}</div>
    </div>
    <div class="cc-deadline ${isUrgent(contest) ? 'urgent' : ''}">${formatDate(contest.deadline) || '—'}</div>
    <div class="cc-num">${contest.participants_count || 0}</div>
    <div class="cc-num">${contest.submissions_count || 0}</div>
    <div>${statusPill(CONTEST_STATUSES, contest.status)}</div>
    <div class="cc-actions">
      <a class="cc-icon-btn" href="/cabinet/company/contests/${contest.id}/submissions/" title="Решения">${ICONS.submissions}</a>
      <a class="cc-icon-btn" href="/cabinet/company/contests/${contest.id}/edit/" title="Редактировать">${ICONS.edit}</a>
      <button type="button" class="cc-icon-btn danger" data-delete="${contest.id}" title="Удалить">${ICONS.delete}</button>
    </div>
  </div>`;

function renderTable() {
  const { contests, filter } = state;
  const shown = filter === 'all' ? contests : contests.filter((contest) => contest.status === filter);
  byId('cc-filter-count').textContent = `${shown.length} из ${contests.length}`;
  byId('cc-table-wrap').innerHTML = shown.length
    ? `<div class="list-card">
        <div class="list-card-header"><h2>Обзор конкурсов</h2></div>
        <div class="cc-scroll">
          <div class="cc-thead"><span>Название</span><span>Дедлайн</span><span>Участники</span><span>Решения</span><span>Статус</span><span></span></div>
          ${shown.map(row).join('')}
        </div>
      </div>`
    : emptyHtml('Конкурсов не найдено', 'Попробуйте другой фильтр или создайте новый конкурс');
}

async function deleteContest(id) {
  const confirmed = await confirmDialog({
    title: 'Удалить конкурс?',
    text: 'Конкурс и присланные решения будут удалены. Это действие нельзя отменить.',
    confirmLabel: 'Удалить',
  });
  if (!confirmed) return;
  try {
    await api.delete(`/api/v1/contests/${id}/`);
    state.contests = state.contests.filter((contest) => contest.id !== id);
    renderStats();
    renderTable();
    toast('Конкурс удалён', 'ok');
  } catch (error) {
    toast(error.message);
  }
}

// Один обработчик на контейнер: таблица перерисовывается целиком
byId('cc-table-wrap').addEventListener('click', (event) => {
  const deleteButton = event.target.closest('[data-delete]');
  if (deleteButton) {
    deleteContest(Number(deleteButton.dataset.delete));
    return;
  }
  if (event.target.closest('a')) return;
  const rowElement = event.target.closest('[data-href]');
  if (rowElement) location.href = rowElement.dataset.href;
});

document.querySelectorAll('.cr-chip[data-f]').forEach((chip, _, chips) =>
  chip.addEventListener('click', () => {
    state.filter = chip.dataset.f;
    chips.forEach((item) => item.classList.toggle('active', item === chip));
    renderTable();
  }),
);

try {
  ({ contests: state.contests = [] } = await api.get('/api/v1/contests/company/'));
  renderStats();
  renderTable();
} catch (error) {
  byId('cc-table-wrap').innerHTML = emptyHtml('Ошибка загрузки', error.message);
}
