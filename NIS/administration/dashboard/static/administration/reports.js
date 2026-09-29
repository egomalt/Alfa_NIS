/* Раздел «Жалобы»: разбор обращений, действия с материалом и автором. */
import { api, byId as el, confirmDialog, countOf, esc, formatDate, toast, WORDS } from 'alfa/core';
import { renderPager } from 'alfa/pager';
import { emptyState, fail, latestOnly, openReasonModal, pill, registerSection, reloadOverview } from 'alfa/admin';

const CHEVRON =
  '<svg class="ap-report-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>';

let filter = 'new';
let page = 1;
let expandedId = null;
let reports = [];
let total = 0;
const latest = latestOnly();

const linkButton = (href, label) =>
  `<a class="ap-btn-secondary ap-btn-link" href="${esc(href)}" target="_blank" rel="noopener" data-stop>${label}</a>`;

function detailHtml(report) {
  const aboutAccount = report.target_type === 'user' || report.target_type === 'company';
  const isNew = report.status === 'new';

  const materialActions =
    isNew && !aboutAccount
      ? `
    <div class="ap-action-group">
      <div class="ap-action-group-title">Материал</div>
      <div class="ap-report-actions">
        ${report.target_url ? linkButton(report.target_url, 'Открыть материал') : ''}
        <button class="ap-btn-accept" data-act="takedown" data-id="${report.id}" data-title="${esc(report.target_title)}">Снять материал</button>
      </div>
    </div>`
      : '';

  // Без автора бан не по кому выдавать
  const authorActions =
    isNew && report.author_username
      ? `
    <div class="ap-action-group">
      <div class="ap-action-group-title">${aboutAccount ? 'Пользователь' : 'Автор'}</div>
      <div class="ap-report-actions">
        ${linkButton(`/${report.author_username}/`, 'Открыть профиль')}
        <button class="ap-btn-mini ap-danger" data-act="ban-author" data-id="${report.id}" data-user="${esc(report.author_username)}">Забанить</button>
      </div>
    </div>`
      : '';

  const decision = isNew
    ? `<div class="ap-report-actions ap-report-decision"><button class="ap-btn-reject" data-act="dismiss" data-id="${report.id}">Отклонить жалобу</button></div>`
    : `<div class="ap-decided-note ap-report-decision">${report.status === 'resolved' ? 'Меры приняты' : 'Жалоба отклонена'}</div>`;

  const target = report.target_url
    ? `<a class="ap-detail-link" href="${esc(report.target_url)}" target="_blank" rel="noopener" data-stop>${esc(report.target_title)} →</a>`
    : `<span>${esc(report.target_title)}</span>`;
  const author = report.author_username
    ? `<a class="ap-detail-link" href="/${esc(report.author_username)}/" target="_blank" rel="noopener" data-stop>${esc(report.author_username)} →</a>`
    : '<span>—</span>';

  return `
    <div class="ap-report-detail">
      <div class="ap-detail-row"><span class="ap-detail-label">Материал</span>${target}</div>
      <div class="ap-detail-row"><span class="ap-detail-label">Автор</span>${author}</div>
      <div class="ap-detail-row"><span class="ap-detail-label">Заявитель</span><span>${esc(report.reporter_username || '—')}</span></div>
      ${report.evidence ? `<div class="ap-detail-row"><span class="ap-detail-label">Подробности</span><span>${esc(report.evidence)}</span></div>` : ''}
      ${materialActions}${authorActions}${decision}
    </div>`;
}

function cardHtml(report) {
  const open = expandedId === report.id;
  const escalation = report.escalated
    ? `<span class="ap-escalation-pill">⚠ ${esc(countOf(report.total_reports, WORDS.reports))} — приоритет</span>`
    : '';
  return `
    <div class="ap-report-card ${open ? 'ap-open' : ''} ${report.escalated ? 'ap-escalated' : ''}" data-id="${report.id}">
      <div class="ap-report-top">
        <span class="ap-report-type">${esc(report.target_type_label)}</span>
        <span class="ap-report-target">${esc(report.target_title)}</span>
        ${escalation}${pill(report.status)}${CHEVRON}
      </div>
      <div class="ap-report-reason">${esc(report.reason)}</div>
      <div class="ap-report-meta">от ${esc(report.reporter_username || '—')} · ${esc(formatDate(report.created_at))}</div>
      ${open ? detailHtml(report) : ''}
    </div>`;
}

function render() {
  el('ap-r-count').textContent = total;
  el('ap-reports-list').innerHTML = reports.length
    ? reports.map(cardHtml).join('')
    : emptyState('Пусто', 'Жалоб в этой категории нет');
}

async function load() {
  try {
    const data = await latest(api.get(`/api/v1/admin/reports/?status=${filter}&page=${page}`));
    reports = data.reports ?? [];
    total = data.total ?? reports.length;
    render();
    renderPager(el('ap-reports-pager'), data, (next) => {
      page = next;
      load();
    });
  } catch (error) {
    if (!error.stale) el('ap-reports-list').innerHTML = emptyState('Ошибка', error.message);
  }
}

async function run(request, message) {
  try {
    const data = await request();
    toast(message(data), 'ok');
    expandedId = null;
    load();
    reloadOverview();
  } catch (error) {
    fail(error);
  }
}

const closedLabel = (data, single, many) => ((data.closed || 1) > 1 ? `${many} ${data.closed}.` : single);

async function handleAction(target) {
  const { act, id, user } = target.dataset;
  if (act === 'takedown') {
    const confirmed = await confirmDialog({
      title: 'Снять материал?',
      text: `«${target.dataset.title || 'материал'}» будет удалён безвозвратно, а все жалобы на него — закрыты.`,
      confirmLabel: 'Удалить',
    });
    if (confirmed) {
      run(
        () => api.post(`/api/v1/admin/reports/${id}/takedown/`),
        (data) => `Материал удалён. Закрыто жалоб: ${data.closed || 1}.`,
      );
    }
  } else if (act === 'dismiss') {
    run(
      () => api.post(`/api/v1/admin/reports/${id}/dismiss/`),
      (data) => closedLabel(data, 'Жалоба отклонена.', 'Отклонено жалоб на этот материал:'),
    );
  } else if (act === 'ban-author') {
    openReasonModal(
      `Причина и срок бана — ${user}`,
      (reason, duration) =>
        run(
          async () => {
            await api.post(`/api/v1/admin/users/${user}/ban/`, { reason, duration });
            return api.post(`/api/v1/admin/reports/${id}/resolve/`);
          },
          () => `${user} заблокирован, жалоба закрыта.`,
        ),
      { needsDuration: true },
    );
  }
}

function init() {
  el('ap-reports-filters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-rf]');
    if (!button) return;
    filter = button.dataset.rf;
    expandedId = null;
    page = 1;
    event.currentTarget
      .querySelectorAll('[data-rf]')
      .forEach((item) => item.classList.toggle('active', item.dataset.rf === filter));
    load();
  });

  el('ap-reports-list').addEventListener('click', (event) => {
    // Ссылки открываются как обычно и не сворачивают карточку
    if (event.target.closest('[data-stop]')) return;
    const action = event.target.closest('[data-act]');
    if (action) {
      handleAction(action);
      return;
    }
    // Клик по карточке раскрывает её — данные уже есть, за ними не ходим
    const card = event.target.closest('.ap-report-card');
    if (!card) return;
    const id = Number(card.dataset.id);
    expandedId = expandedId === id ? null : id;
    render();
  });
}

registerSection('reports', { init, load });
