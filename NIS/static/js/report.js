/* Кнопка «Пожаловаться». Разметка объявляет цель атрибутами:
   <button data-report-type="article" data-report-id="12" data-report-author="ivan">
   Кнопка видна только вошедшему и только на чужом материале. */
import { api, toast } from 'alfa/core';

let modal = null;
let current = null;

function buildModal() {
  const node = document.createElement('div');
  node.id = 'report-modal';
  node.className = 'cr-modal';
  node.innerHTML = `
    <div class="cr-modal-card" role="dialog" aria-modal="true">
      <div class="cr-modal-title">Пожаловаться на материал</div>
      <div class="cr-modal-sub" data-report-target></div>
      <div class="cr-modal-label">Причина</div>
      <textarea class="cr-modal-textarea" data-report-reason maxlength="2000"
                placeholder="Что не так с этим материалом?"></textarea>
      <div class="cr-modal-error" data-report-error></div>
      <div class="cr-modal-actions">
        <button type="button" class="cr-modal-btn-cancel" data-report-cancel>Отмена</button>
        <button type="button" class="cr-modal-btn-primary" data-report-send>Отправить</button>
      </div>
    </div>`;
  node.addEventListener('click', (event) => {
    if (event.target === node || event.target.closest('[data-report-cancel]')) close();
    else if (event.target.closest('[data-report-send]')) send();
  });
  document.body.append(node);
  return node;
}

const part = (name) => modal.querySelector(`[data-report-${name}]`);

function open(button) {
  modal ??= buildModal();
  current = button;
  part('target').textContent = button.dataset.reportTitle ?? '';
  part('reason').value = '';
  part('error').textContent = '';
  modal.classList.add('open');
  part('reason').focus();
}

function close() {
  modal?.classList.remove('open');
  current = null;
}

async function send() {
  const reason = part('reason').value.trim();
  if (!reason) {
    part('error').textContent = 'Опишите, что не так.';
    return;
  }
  const button = part('send');
  button.disabled = true;
  button.textContent = 'Отправка…';
  try {
    const data = await api.post('/api/v1/reports/', {
      target_type: current.dataset.reportType,
      target_id: current.dataset.reportId,
      reason,
    });
    close();
    toast(data.message || 'Жалоба отправлена модераторам.', 'ok');
  } catch (error) {
    part('error').textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Отправить';
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-report-type]');
  if (button) open(button);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') close();
});

let accountRequest = null;

/* Показывает кнопки на чужих материалах. Страницы, которые дорисовывают
   кнопку позже (конкурс), вызывают эту функцию сами. */
export async function refreshReportButtons() {
  const buttons = document.querySelectorAll('[data-report-type]');
  if (!buttons.length) return;
  accountRequest ??= api
    .get('/api/v1/auth/me/')
    .then((data) => data.account)
    .catch(() => null);
  const account = await accountRequest;
  if (!account) return;
  buttons.forEach((button) => {
    button.hidden = button.dataset.reportAuthor === account.username;
    button.classList.add('is-available');
  });
}

refreshReportButtons();
