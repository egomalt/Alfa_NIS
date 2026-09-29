/* Плашка модератора на публичных страницах.
   Страница объявляет цель в данных страницы ({% page_data %}):
     modType='article', modId, modAuthor, modTitle
     modType='contest', modId                    — автора и заголовок добираем из API
     modType='test', modId, modAuthor, modTitle  — страница прохождения теста
     modType='user' | 'company', modUsername     — профиль
   Панель и действия видит только аккаунт с ролью moderator. */
import { api, esc, pageData } from 'alfa/core';

const { modType: type, modId: id, modAuthor, modTitle, modUsername } = pageData();

const ROLE_LABEL = { user: 'Кандидат', company: 'Компания', moderator: 'Модератор' };
const TARGET_LABEL = { article: 'Статья', contest: 'Конкурс', test: 'Тест', user: 'Кандидат', company: 'Компания' };
const MATERIAL = {
  article: { noun: 'статью', button: 'Удалить статью', after: '/articles/' },
  contest: { noun: 'конкурс', button: 'Удалить конкурс', after: '/contests/' },
  test: { noun: 'тест', button: 'Удалить тест', after: '/tests/' },
};
const CLOSE_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

async function resolveTarget() {
  if (type === 'article') return { author: modAuthor, title: modTitle || 'статья' };
  if (type === 'test') return { author: modAuthor, title: modTitle || 'тест' };
  if (type === 'contest') {
    const { contest = {} } = await api.get(`/api/v1/contests/${id}/`);
    return { author: contest.company_username, title: contest.title || 'конкурс' };
  }
  // Профиль человека или компании: автор — он сам
  return { author: modUsername, title: '' };
}

function closeModal() {
  document.querySelector('.mb-overlay')?.remove();
}

function openModal(html) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'mb-overlay';
  overlay.innerHTML = `<div class="mb-modal">${html}</div>`;
  document.body.append(overlay);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.hasAttribute('data-close')) closeModal();
  });
  return overlay.querySelector('.mb-modal');
}

function flash(modal, message, ok = false) {
  const box = modal.querySelector('.mb-flash');
  box.textContent = message;
  box.classList.toggle('is-ok', ok);
}

/* Поля блокировки общие для двух модалок: причина, срок и «навсегда» */
const BAN_FIELDS = `
  <textarea class="mb-textarea" data-ban-reason placeholder="Причина (увидит пользователь)"></textarea>
  <div class="mb-row">
    <input type="number" class="mb-num" data-ban-days min="1" value="7"> дней
    <button class="mb-btn mb-mini" data-ban-perm type="button">Навсегда</button>
    <span class="mb-grow"></span>
    <button class="mb-btn mb-danger" data-ban-submit>Заблокировать</button>
  </div>`;

function setupBanFields(modal, username, onBanned) {
  let permanent = false;
  const days = modal.querySelector('[data-ban-days]');
  modal.querySelector('[data-ban-perm]').addEventListener('click', (event) => {
    permanent = !permanent;
    event.currentTarget.classList.toggle('mb-active', permanent);
    days.disabled = permanent;
  });
  modal.querySelector('[data-ban-submit]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await api.post(`/api/v1/admin/users/${username}/ban/`, {
        reason: modal.querySelector('[data-ban-reason]').value.trim(),
        duration: permanent ? 'perm' : days.value || '7',
      });
      onBanned();
    } catch (error) {
      flash(modal, error.message);
      button.disabled = false;
    }
  });
}

function confirmDeleteMaterial(context) {
  const { noun, after } = MATERIAL[type];
  const modal = openModal(`
    <div class="mb-modal-title">Удалить ${noun}?</div>
    <div class="mb-modal-text">Материал «${esc(context.title)}» будет удалён безвозвратно.${context.author ? ` Автор: <b>@${esc(context.author)}</b>.` : ''}</div>
    <label class="mb-check"><input type="checkbox" data-also-ban> Также заблокировать автора</label>
    <div class="mb-flash"></div>
    <div class="mb-actions">
      <button class="mb-btn" data-close>Отмена</button>
      <button class="mb-btn mb-danger" data-delete>Удалить</button>
      ${context.author ? '<button class="mb-btn" data-open-author>Другие действия</button>' : ''}
    </div>`);

  modal.querySelector('[data-open-author]')?.addEventListener('click', () => openAuthorActions(context.author));
  modal.querySelector('[data-delete]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const alsoBan = modal.querySelector('[data-also-ban]').checked;
    button.disabled = true;
    button.textContent = 'Удаление…';
    try {
      await api.post(`/api/v1/admin/content/${type}/${id}/delete/`, {});
    } catch (error) {
      flash(modal, error.message);
      button.disabled = false;
      button.textContent = 'Удалить';
      return;
    }
    const leave = () => {
      location.href = after;
    };
    // После удаления материала — сразу форма блокировки автора
    if (alsoBan && context.author) openBanModal(context.author, leave);
    else leave();
  });
}

function openBanModal(username, onDone) {
  const modal = openModal(`
    <div class="mb-modal-title">Заблокировать @${esc(username)}</div>
    ${BAN_FIELDS}
    <div class="mb-flash"></div>
    <div class="mb-actions"><button class="mb-btn" data-close>Пропустить</button></div>`);
  modal.querySelector('[data-close]').addEventListener('click', onDone);
  setupBanFields(modal, username, onDone);
}

async function openAuthorActions(username) {
  if (!username) return;
  let data;
  try {
    data = await api.get(`/api/v1/admin/users/${username}/content/`);
  } catch {
    openModal(`
      <div class="mb-modal-title">Не удалось открыть</div>
      <div class="mb-modal-text">Данные автора не загрузились. Обновите страницу и попробуйте ещё раз.</div>
      <div class="mb-actions"><button class="mb-btn" data-close>Закрыть</button></div>`);
    return;
  }

  const counts = data.counts ?? {};
  const user = data.user ?? { username, name: username, role: null };
  const categories = [
    ['articles', 'Статьи', counts.articles || 0],
    ['contests', 'Конкурсы', counts.contests || 0],
    ['tests', 'Тесты', counts.tests || 0],
  ].filter(([, , count]) => count > 0);

  const categoryRows = categories.length
    ? categories
        .map(
          ([key, label, count]) =>
            `<label class="mb-check"><input type="checkbox" class="mb-cat" value="${key}"> ${label} <span class="mb-count">${count}</span></label>`,
        )
        .join('')
    : '<div class="mb-modal-text">Материалов нет.</div>';

  const modal = openModal(`
    <div class="mb-modal-title">@${esc(user.username)}</div>
    <div class="mb-modal-text">${esc(user.name)}${user.role ? ` · ${esc(ROLE_LABEL[user.role] ?? user.role)}` : ''}</div>
    <div class="mb-group-title">Блокировка</div>
    ${BAN_FIELDS}
    <div class="mb-group-title">Удалить контент автора</div>
    ${categoryRows}
    <div class="mb-flash"></div>
    <div class="mb-actions">
      <button class="mb-btn" data-close>Закрыть</button>
      ${categories.length ? '<button class="mb-btn mb-danger" data-purge>Удалить выбранное</button>' : ''}
    </div>`);

  setupBanFields(modal, username, () => flash(modal, 'Пользователь заблокирован.', true));
  modal.querySelector('[data-purge]')?.addEventListener('click', () => {
    const chosen = [...modal.querySelectorAll('.mb-cat:checked')].map((box) => box.value);
    if (!chosen.length) {
      flash(modal, 'Отметьте, что удалить.');
      return;
    }
    const names = categories
      .filter(([key]) => chosen.includes(key))
      .map(([, label, count]) => `${label.toLowerCase()} — ${count}`)
      .join(', ');
    confirmPurge(username, names, chosen);
  });
}

/* Отдельный шаг подтверждения показывает, что именно будет удалено.
   После удаления страница перезагружается */
function confirmPurge(username, names, chosen) {
  const modal = openModal(`
    <div class="mb-modal-title">Удалить контент автора?</div>
    <div class="mb-modal-text">Будет удалено безвозвратно: ${esc(names)}. Автор: <b>@${esc(username)}</b>.</div>
    <div class="mb-flash"></div>
    <div class="mb-actions">
      <button class="mb-btn" data-close>Отмена</button>
      <button class="mb-btn mb-danger" data-confirm>Удалить</button>
    </div>`);
  modal.querySelector('[data-confirm]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Удаление…';
    try {
      await api.post(`/api/v1/admin/users/${username}/purge/`, { categories: chosen });
      flash(modal, 'Контент удалён.', true);
      setTimeout(() => location.reload(), 900);
    } catch (error) {
      flash(modal, error.message);
      button.disabled = false;
      button.textContent = 'Удалить';
    }
  });
}

function buildBar(context) {
  // Кого модерируем — иначе на профиле непонятно, к кому относятся действия
  const who = [TARGET_LABEL[type], context.author && `@${context.author}`].filter(Boolean).join(' · ');
  const bar = document.createElement('div');
  bar.className = 'mb-bar';
  bar.innerHTML = `
    <span class="mb-badge"><span class="mb-dot"></span>Модератор</span>
    ${who ? `<span class="mb-target">${esc(who)}</span>` : ''}
    <span class="mb-sep"></span>
    ${MATERIAL[type] ? `<button class="mb-btn mb-danger" data-mb="delete">${MATERIAL[type].button}</button>` : ''}
    <button class="mb-btn" data-mb="author">Действия</button>
    <button class="mb-close" data-mb="hide" title="Скрыть панель" aria-label="Скрыть панель">${CLOSE_ICON}</button>`;
  document.body.append(bar);
  // Панель висит поверх страницы — освобождаем под неё место внизу
  document.body.style.paddingBottom = `${bar.offsetHeight + 34}px`;

  bar.addEventListener('click', (event) => {
    const action = event.target.closest('[data-mb]')?.dataset.mb;
    if (action === 'delete') confirmDeleteMaterial(context);
    else if (action === 'author') openAuthorActions(context.author);
    else if (action === 'hide') {
      bar.remove();
      document.body.style.paddingBottom = '';
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
});

if (type) {
  // Сначала роль — остальным посетителям ничего не рисуем и не запрашиваем
  const me = await api.get('/api/v1/auth/me/').catch(() => null);
  if (me?.account?.role === 'moderator') buildBar(await resolveTarget().catch(() => ({})));
}
