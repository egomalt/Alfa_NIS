/* Кабинет кандидата — раздел «Мои статьи». */
import { api, ARTICLE_STATUSES, byId, confirmDialog, esc, formatDateMedium, statusPill, toast } from 'alfa/core';
import { ICONS, listPanel, registerPanel, setText, shortNumber, state, sum } from 'alfa/cabinet-user';

function row(article) {
  // Черновик по публичному адресу отдаёт 404 — владельцу открываем предпросмотр
  const viewUrl =
    article.status === 'published' ? `/articles/${article.id}/` : `/cabinet/user/articles/${article.id}/preview/`;
  // У опубликованной статьи важна дата публикации, у черновика её нет — показываем, когда его завели
  const date = article.published_at || article.created_at;
  return `<tr>
    <td><a href="${viewUrl}" target="_blank" rel="noopener">${esc(article.title || 'Без названия')}</a></td>
    <td data-label="Статус">${statusPill(ARTICLE_STATUSES, article.status)}</td>
    <td data-label="Просмотры">${shortNumber(article.views || 0)}</td>
    <td data-label="Рейтинг">${article.likes || 0}</td>
    <td data-label="Дата">${formatDateMedium(date) || '—'}</td>
    <td><div class="action-row">
      <a class="action-icon-btn" href="/cabinet/user/articles/${article.id}/edit/" title="Редактировать">${ICONS.edit}</a>
      <button type="button" class="action-icon-btn danger" data-delete="${article.id}" title="Удалить">${ICONS.delete}</button>
    </div></td>
  </tr>`;
}

const renderTable = listPanel({
  key: 'articles',
  source: 'articles',
  items: () => state.articles,
  matches: (article, filter) => article.status === filter,
  row,
  empty: {
    filtered: ['Статей не найдено', 'Под выбранный фильтр ничего не подходит'],
    none: ['Статей пока нет', 'Расскажите о своём опыте — статьи видят все кандидаты и компании'],
  },
});

function render() {
  const { articles } = state;
  setText('astat-published', articles.filter((article) => article.status === 'published').length);
  setText('astat-drafts', articles.filter((article) => article.status === 'draft').length);
  setText('astat-views', shortNumber(sum(articles, 'views')));
  setText('astat-likes', shortNumber(sum(articles, 'likes')));
  renderTable();
}

byId('ud-articles-body').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete]');
  if (!button) return;
  const confirmed = await confirmDialog({
    title: 'Удалить статью?',
    text: 'Это действие нельзя отменить.',
    confirmLabel: 'Удалить',
  });
  if (!confirmed) return;
  try {
    await api.delete(`/api/v1/articles/${button.dataset.delete}/delete/`);
    state.articles = state.articles.filter((article) => String(article.id) !== button.dataset.delete);
    render();
  } catch (error) {
    toast(error.message);
  }
});

registerPanel({ render, needs: ['articles'] });
