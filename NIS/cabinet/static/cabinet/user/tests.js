/* Кабинет кандидата — раздел «Мои тесты». */
import { api, byId, confirmDialog, esc, formatDateMedium, statusPill, TEST_STATUSES, toast } from 'alfa/core';
import { ICONS, listPanel, registerPanel, setText, state, sum, username } from 'alfa/cabinet-user';

function row(test) {
  // Черновик по публичному адресу отдаёт 404 — владельцу открываем предпросмотр
  const viewUrl = test.status === 'published' ? test.url : `${test.url}?preview=1`;
  // Статистика есть только у опубликованного: черновик никто не проходил
  const statsLink =
    test.status === 'published'
      ? `<a class="action-icon-btn" href="${esc(test.edit_url)}stats/" title="Как проходят тест">${ICONS.stats}</a>`
      : '';
  return `<tr>
    <td><a href="${esc(viewUrl)}" target="_blank" rel="noopener">${esc(test.title || 'Без названия')}</a></td>
    <td data-label="Статус">${statusPill(TEST_STATUSES, test.status)}</td>
    <td data-label="Страниц">${test.page_count || 0}</td>
    <td data-label="Прохождений">${test.submissions || 0}</td>
    <td data-label="Создан">${formatDateMedium(test.created_at) || '—'}</td>
    <td><div class="action-row">
      ${statsLink}
      <a class="action-icon-btn" href="${esc(test.edit_url)}" title="Редактировать">${ICONS.edit}</a>
      <button type="button" class="action-icon-btn danger" data-delete="${test.id}" title="Удалить">${ICONS.delete}</button>
    </div></td>
  </tr>`;
}

const renderTable = listPanel({
  key: 'tests',
  items: () => state.tests,
  matches: (test, filter) => test.status === filter,
  row,
  empty: {
    filtered: ['Тестов не найдено', 'Под выбранный фильтр ничего не подходит'],
    none: ['Тестов пока нет', 'Соберите первый тест — его смогут пройти все желающие'],
  },
});

function render() {
  const { tests } = state;
  setText('tstat-total', tests.length);
  setText('tstat-published', tests.filter((test) => test.status === 'published').length);
  setText('tstat-subs', sum(tests, 'submissions'));
  setText('tstat-drafts', tests.filter((test) => test.status === 'draft').length);
  renderTable();
}

byId('ud-tests-body').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete]');
  if (!button) return;
  const confirmed = await confirmDialog({
    title: 'Удалить тест?',
    text: 'Это действие нельзя отменить.',
    confirmLabel: 'Удалить',
  });
  if (!confirmed) return;
  try {
    await api.delete(`/api/v1/tests/${button.dataset.delete}/`);
    state.tests = state.tests.filter((test) => String(test.id) !== button.dataset.delete);
    render();
  } catch (error) {
    toast(error.message);
  }
});

// Конструктор должен знать владельца: тест заводится на кандидата, а не на компанию
byId('ud-create-test-btn')?.addEventListener('click', (event) => {
  event.preventDefault();
  location.assign(`/constructor/?owner=${encodeURIComponent(username)}`);
});

registerPanel({ render, needs: ['tests'] });
