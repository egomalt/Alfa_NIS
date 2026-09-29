/* Раздел «Верификация компаний». */
import { api, byId as el, esc, formatDate, toast } from 'alfa/core';
import { renderPager } from 'alfa/pager';
import {
  emptyState,
  fail,
  latestOnly,
  openDocModal,
  openReasonModal,
  pill,
  registerSection,
  reloadOverview,
} from 'alfa/admin';

const DOC_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

let filter = 'pending';
let page = 1;
const latest = latestOnly();

const metaLine = (item) =>
  [item.industry, item.city, item.submitted_at && `подано ${formatDate(item.submitted_at)}`]
    .filter(Boolean)
    .join(' · ');

function actionsHtml(item) {
  if (item.status === 'pending') {
    return `
      <button class="ap-btn-accept" data-act="approve" data-user="${esc(item.username)}">Одобрить</button>
      <button class="ap-btn-reject" data-act="reject" data-user="${esc(item.username)}">Отклонить</button>`;
  }
  if (item.status === 'rejected') {
    return `<span class="ap-decided-note">Отклонено: ${esc(item.reason || 'без причины')}</span>`;
  }
  return '<span class="ap-decided-note">Компания подтверждена</span>';
}

const cardHtml = (item) => `
  <div class="ap-verify-card">
    <span class="ap-company-avatar">${esc(item.letter)}</span>
    <div class="ap-verify-main">
      <div class="ap-verify-title">${esc(item.name)}</div>
      <div class="ap-verify-meta">${esc(metaLine(item))}</div>
    </div>
    ${
      item.document_name
        ? `<a class="ap-verify-doc" data-act="viewdoc" data-name="${esc(item.document_name)}"
        data-url="${esc(item.document_url)}">${DOC_ICON}${esc(item.document_name)}</a>`
        : ''
    }
    ${pill(item.status)}
    ${actionsHtml(item)}
  </div>`;

async function load() {
  try {
    const data = await latest(api.get(`/api/v1/admin/verifications/?status=${filter}&page=${page}`));
    const list = data.verifications ?? [];
    el('ap-vf-count').textContent = data.total ?? list.length;
    el('ap-verify-list').innerHTML = list.length
      ? list.map(cardHtml).join('')
      : emptyState('Пусто', 'Заявок в этой категории нет');
    renderPager(el('ap-verify-pager'), data, (next) => {
      page = next;
      load();
    });
  } catch (error) {
    if (!error.stale) el('ap-verify-list').innerHTML = emptyState('Ошибка', error.message);
  }
}

async function decide(username, action, payload, message) {
  try {
    await api.post(`/api/v1/admin/verifications/${username}/${action}/`, payload);
    toast(message, 'ok');
    load();
    reloadOverview();
  } catch (error) {
    fail(error);
  }
}

function init() {
  el('ap-verify-filters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-vf]');
    if (!button) return;
    filter = button.dataset.vf;
    page = 1;
    event.currentTarget
      .querySelectorAll('[data-vf]')
      .forEach((item) => item.classList.toggle('active', item.dataset.vf === filter));
    load();
  });

  el('ap-verify-list').addEventListener('click', (event) => {
    const target = event.target.closest('[data-act]');
    if (!target) return;
    const { act, user } = target.dataset;
    if (act === 'viewdoc') openDocModal(target.dataset.name, target.dataset.url);
    else if (act === 'approve') decide(user, 'approve', {}, 'Компания подтверждена.');
    else if (act === 'reject') {
      openReasonModal('Причина отклонения заявки', (reason) =>
        decide(user, 'reject', { reason }, 'Заявка отклонена, компания увидит причину.'),
      );
    }
  });
}

registerSection('verify', { init, load });
