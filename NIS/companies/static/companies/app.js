/* Раздел «Тесты» кабинета компании.
   Профиль компании живёт отдельно — в cabinet/static/cabinet/company.js. */
import { api, byId, confirmDialog, esc, formatDateMedium, pageData, statusPill, TEST_STATUSES, toast } from 'alfa/core';

const { username = '' } = pageData();
const ICONS = {
  stats:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-4"/></svg>',
  edit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  delete:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
};

const state = { loaded: false, tests: [], filter: 'all' };

function row(test) {
  // Черновик по публичному адресу отдаёт 404 даже владельцу — ему открываем предпросмотр
  const openUrl = test.status === 'published' ? test.url : `${test.url}?preview=1`;
  // data-label подхватывает CSS на телефоне: шапка таблицы там скрыта
  return `
    <tr>
      <td><a href="${esc(openUrl)}" target="_blank">${esc(test.title || '—')}</a></td>
      <td data-label="Статус">${statusPill(TEST_STATUSES, test.status)}</td>
      <td data-label="Страниц">${test.page_count ?? 0}</td>
      <td data-label="Прохождений">${test.submissions ?? 0}</td>
      <td data-label="Создан">${formatDateMedium(test.created_at) || '—'}</td>
      <td>
        <div class="action-row">
          ${test.status === 'published' ? `<a class="action-icon-btn" href="${esc(test.edit_url)}stats/" title="Как проходят тест">${ICONS.stats}</a>` : ''}
          <a class="action-icon-btn" href="${esc(test.edit_url)}" title="Редактировать">${ICONS.edit}</a>
          <button type="button" class="action-icon-btn danger" data-delete="${test.id}" title="Удалить">${ICONS.delete}</button>
        </div>
      </td>
    </tr>`;
}

/* Плашки сверху считают по всем тестам — это сводка; таблица — под фильтром */
function renderTable() {
  if (!state.loaded) return;
  const { tests, filter } = state;
  const shown = filter === 'all' ? tests : tests.filter((test) => test.status === filter);
  byId('tests-filter-count').textContent = tests.length ? `${shown.length} из ${tests.length}` : '';
  byId('tests-table-body').innerHTML = shown.map(row).join('');
  byId('tests-table-wrapper').hidden = !shown.length;
  byId('tests-empty').hidden = Boolean(shown.length);
  // Пусто из-за фильтра и пусто вообще — разные сообщения
  byId('tests-empty-title').textContent = tests.length ? 'Тестов не найдено' : 'Тестов пока нет';
  byId('tests-empty-sub').textContent = tests.length
    ? 'Под выбранный фильтр ничего не подходит'
    : 'Создайте первый тест, чтобы начать оценку кандидатов';
  byId('tests-empty-create').hidden = Boolean(tests.length);
}

async function loadTests() {
  const { tests = [], stats = {} } = await api.get(`/api/v1/companies/${username}/tests/`);
  Object.assign(state, { loaded: true, tests });
  byId('stat-total-tests').textContent = stats.total_tests ?? 0;
  byId('stat-active-tests').textContent = stats.active_tests ?? 0;
  byId('stat-submissions').textContent = stats.submissions ?? 0;
  byId('stat-completion-rate').textContent = `${stats.active_rate ?? 0}%`;
  renderTable();
}

document.querySelectorAll('.cr-chip[data-f]').forEach((chip, _, chips) =>
  chip.addEventListener('click', () => {
    state.filter = chip.dataset.f;
    chips.forEach((item) => item.classList.toggle('active', item === chip));
    renderTable();
  }),
);

byId('tests-table-body').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete]');
  if (!button) return;
  const confirmed = await confirmDialog({
    title: 'Удалить тест?',
    text: 'Тест будет удалён. Это действие нельзя отменить.',
    confirmLabel: 'Удалить',
  });
  if (!confirmed) return;
  try {
    await api.delete(`/api/v1/tests/${button.dataset.delete}/`);
    toast('Тест удалён', 'ok');
    await loadTests();
  } catch (error) {
    toast(error.message);
  }
});

try {
  await loadTests();
} catch (error) {
  const flash = byId('company-flash');
  flash.textContent = error.message;
  flash.hidden = false;
}
