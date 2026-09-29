/* Общие помощники фронтенда: запросы к API, данные страницы, экранирование, даты и числительные. */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

export const byId = (id) => document.getElementById(id);

export const initial = (name) =>
  (
    String(name ?? '')
      .trim()
      .charAt(0) || '?'
  ).toUpperCase();

/* Данные страницы: шаблон кладёт их тегом {% page_data %}; блоков может быть несколько */
let cachedPageData;
export function pageData() {
  cachedPageData ??= Object.assign(
    {},
    ...Array.from(document.querySelectorAll('script[data-page-data]'), (node) => JSON.parse(node.textContent)),
  );
  return cachedPageData;
}

export function csrfToken() {
  const cookie = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  if (cookie) return decodeURIComponent(cookie[1]);
  return document.querySelector('meta[name="csrf-token"]')?.content ?? '';
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const firstFieldError = (errors) => {
  const first = errors && Object.values(errors)[0];
  return Array.isArray(first) ? (first[0]?.message ?? first[0]) : null;
};

async function request(method, url, data) {
  const headers = {};
  let body;
  if (data instanceof FormData || data instanceof URLSearchParams) {
    body = data;
  } else if (data !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(data);
  }
  if (method !== 'GET') headers['X-CSRFToken'] = csrfToken();

  const response = await fetch(url, { method, headers, body, credentials: 'same-origin' });
  // Сервер может ответить не JSON — например, страницей ошибки 500
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const message =
      payload.message ||
      firstFieldError(payload.errors) ||
      (response.status >= 500 ? 'Сервер временно недоступен' : 'Не удалось выполнить запрос');
    throw new ApiError(message, response.status, payload);
  }
  return payload;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, data) => request('POST', url, data),
  put: (url, data) => request('PUT', url, data),
  patch: (url, data) => request('PATCH', url, data),
  delete: (url) => request('DELETE', url),
};

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/* «28.09.2026» */
export const formatDate = (value) => toDate(value)?.toLocaleDateString('ru-RU') ?? '';

/* «28 сентября 2026» */
export const formatDateLong = (value) =>
  toDate(value)?.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) ?? '';

/* «28 сент.» */
export const formatDateShort = (value) =>
  toDate(value)?.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) ?? '';

/* «28.09.2026, 14:05» */
export const formatDateTime = (value) =>
  toDate(value)?.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) ?? '';

const MONTHS_OF = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/* «июля 2026» — для оборотов вида «на платформе с …» */
export const monthYearOf = (value) => {
  const date = toDate(value);
  return date ? `${MONTHS_OF[date.getMonth()]} ${date.getFullYear()}` : '';
};

/* pluralForm(5, ['участник', 'участника', 'участников']) → «участников» */
export function pluralForm(count, [one, few, many]) {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

/* countOf(5, WORDS.participants) → «5 участников» */
export const countOf = (count, forms) => `${count || 0} ${pluralForm(count || 0, forms)}`;

export const WORDS = {
  participants: ['участник', 'участника', 'участников'],
  attempts: ['прохождение', 'прохождения', 'прохождений'],
  ratings: ['оценка', 'оценки', 'оценок'],
  articles: ['статья', 'статьи', 'статей'],
  companies: ['компания', 'компании', 'компаний'],
  contests: ['конкурс', 'конкурса', 'конкурсов'],
  tests: ['тест', 'теста', 'тестов'],
  pages: ['страница', 'страницы', 'страниц'],
  days: ['день', 'дня', 'дней'],
  submissions: ['решение', 'решения', 'решений'],
  reports: ['жалоба', 'жалобы', 'жалоб'],
  views: ['просмотр', 'просмотра', 'просмотров'],
  questions: ['вопрос', 'вопроса', 'вопросов'],
};

export const TEST_CATEGORIES = {
  frontend: 'Frontend',
  backend: 'Backend',
  devops: 'DevOps',
  analytics: 'Аналитика',
  other: 'Другое',
};

export const CONTEST_CATEGORIES = {
  backend: 'Backend',
  frontend: 'Frontend',
  devops: 'DevOps',
  analytics: 'Аналитика',
  design: 'Дизайн',
};

export const LEVELS = { junior: 'Junior', middle: 'Middle', senior: 'Senior' };

/* Статус конкурса: подпись и тон плашки (классы .cr-tone-* в career.css) */
export const CONTEST_STATUSES = {
  active: ['Активен', 'green'],
  review: ['На проверке', 'amber'],
  finished: ['Завершён', 'muted'],
  draft: ['Черновик', 'amber'],
};

export const TEST_STATUSES = {
  published: ['Опубликован', 'green'],
  draft: ['Черновик', 'amber'],
};

export const ARTICLE_STATUSES = {
  published: ['Опубликована', 'green'],
  draft: ['Черновик', 'amber'],
};

/* Решение конкурса глазами кандидата. «На проверке» нейтральное:
   кандидату это «решения пока нет», а не призыв что-то сделать.
   Победа золотая с обводкой — красным она читалась бы как отказ */
export const SUBMISSION_STATUSES = {
  pending: ['На проверке', 'muted'],
  accepted: ['Принято', 'green'],
  rejected: ['Отклонено', 'red'],
  winner: ['Победа', 'amber is-outlined'],
};

export function statusPill(statuses, status, extraClass = '') {
  const [label, tone] = statuses[status] ?? [status, 'muted'];
  return `<span class="cr-pill cr-tone-${tone} ${extraClass}">${esc(label)}</span>`;
}

/* Всплывающее сообщение в углу экрана вместо системного alert() */
export function toast(message, tone = 'error') {
  let host = document.querySelector('.cr-toasts');
  if (!host) {
    host = document.createElement('div');
    host.className = 'cr-toasts';
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const item = document.createElement('div');
  item.className = `cr-toast cr-toast-${tone}`;
  item.textContent = message;
  item.addEventListener('click', () => item.remove());
  host.append(item);
  setTimeout(() => item.remove(), 5000);
}

/* Модальное окно в оформлении сайта. Возвращает Promise с ответом:
   для подтверждения — true/false, для ввода — строку или null */
function openDialog({ title, text, confirmLabel, field }) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'cr-modal open';
    modal.innerHTML = `
      <form class="cr-modal-card" role="dialog" aria-modal="true" method="dialog">
        <div class="cr-modal-title">${esc(title)}</div>
        ${text ? `<div class="cr-modal-sub">${esc(text)}</div>` : ''}
        ${field ? `<input class="cr-modal-input" type="${field.type ?? 'text'}" placeholder="${esc(field.placeholder ?? '')}" value="${esc(field.value ?? '')}">` : ''}
        <div class="cr-modal-actions">
          <button type="button" class="cr-modal-btn-cancel" data-cancel>Отмена</button>
          <button type="submit" class="cr-modal-btn-primary">${esc(confirmLabel)}</button>
        </div>
      </form>`;
    const input = modal.querySelector('input');

    const close = (answer) => {
      modal.remove();
      document.removeEventListener('keydown', onKey);
      resolve(answer);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') close(field ? null : false);
    };
    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.closest('[data-cancel]')) close(field ? null : false);
    });
    modal.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      close(field ? input.value.trim() || null : true);
    });
    document.addEventListener('keydown', onKey);
    document.body.append(modal);
    (input ?? modal.querySelector('[type="submit"]')).focus();
  });
}

/* Подтверждение вместо системного confirm() */
export const confirmDialog = ({ title = 'Подтвердите действие', text = '', confirmLabel = 'Подтвердить' } = {}) =>
  openDialog({ title, text, confirmLabel });

/* Ввод одной строки вместо системного prompt() */
export const promptDialog = ({
  title,
  text = '',
  placeholder = '',
  value = '',
  type = 'text',
  confirmLabel = 'Готово',
}) => openDialog({ title, text, confirmLabel, field: { placeholder, value, type } });
