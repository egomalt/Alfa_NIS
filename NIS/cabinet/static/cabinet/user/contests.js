/* Кабинет кандидата — раздел «Конкурсы»: история участий и вердикты компаний. */
import { esc, formatDate, formatDateMedium, statusPill, SUBMISSION_STATUSES } from 'alfa/core';
import { ICONS, listPanel, registerPanel, setText, state } from 'alfa/cabinet-user';

const row = (entry) => `<tr>
  <td><a href="/contests/${entry.contest_id}/">${esc(entry.contest_title || 'Конкурс')}</a></td>
  <td data-label="Компания">${esc(entry.company_name || entry.company_username)}</td>
  <td data-label="Вердикт">${statusPill(SUBMISSION_STATUSES, entry.winner ? 'winner' : entry.status)}</td>
  <td data-label="Подано">${formatDateMedium(entry.submitted_at) || '—'}</td>
  <td data-label="Дедлайн">${formatDate(entry.deadline) || '—'}</td>
  <td><div class="action-row">
    <a class="action-icon-btn" href="/cabinet/user/contests/${entry.id}/" title="Моё решение и вердикт">${ICONS.open}</a>
  </div></td>
</tr>`;

const renderTable = listPanel({
  key: 'contests',
  source: 'contestHistory',
  items: () => state.contestHistory,
  matches: (entry, filter) => (filter === 'winner' ? entry.winner : entry.status === filter),
  row,
  empty: {
    filtered: ['Ничего не найдено', 'Под выбранный фильтр не подходит ни одно решение'],
    none: ['Участий пока нет', 'Выберите конкурс в каталоге и пришлите решение до дедлайна'],
  },
});

function render() {
  const history = state.contestHistory;
  setText('cstat-total', history.length);
  setText('cstat-wins', history.filter((entry) => entry.winner).length);
  setText('cstat-pending', history.filter((entry) => entry.status === 'pending').length);
  setText('cstat-accepted', history.filter((entry) => entry.status === 'accepted').length);
  renderTable();
}

registerPanel({ render, needs: ['contestHistory'] });
