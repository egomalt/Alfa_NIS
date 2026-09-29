/* Раздел «Обзор»: сводные счётчики и последние элементы очередей. */
import { api, byId as el, countOf, esc, formatDate, WORDS } from 'alfa/core';
import { emptyState, pill, refreshBadges, registerSection } from 'alfa/admin';

const metaLine = (item) =>
  [item.industry, item.city, item.submitted_at && `подано ${formatDate(item.submitted_at)}`]
    .filter(Boolean)
    .join(' · ');

const verifyRow = (item) => `
  <div class="ap-verify-card">
    <span class="ap-company-avatar">${esc(item.letter)}</span>
    <div class="ap-verify-main">
      <div class="ap-verify-title">${esc(item.name)}</div>
      <div class="ap-verify-meta">${esc(metaLine(item))}</div>
    </div>
    ${pill(item.status)}
  </div>`;

const reportRow = (report) => `
  <div class="ap-report-card ap-report-static ${report.escalated ? 'ap-escalated' : ''}">
    <div class="ap-report-top">
      <span class="ap-report-type">${esc(report.target_type_label)}</span>
      <span class="ap-report-target">${esc(report.target_title)}</span>
      ${report.escalated ? `<span class="ap-escalation-pill">⚠ ${esc(countOf(report.total_reports, WORDS.reports))}</span>` : ''}
    </div>
    <div class="ap-report-reason">${esc(report.reason)}</div>
    <div class="ap-report-meta">от ${esc(report.reporter_username || '—')} · ${esc(formatDate(report.created_at))}</div>
  </div>`;

function render({ stats = {}, recent_verifications: verifications = [], recent_reports: reports = [] }) {
  el('ap-ov-verify').textContent = stats.verify_pending || 0;
  el('ap-ov-reports').textContent = stats.reports_new || 0;
  el('ap-ov-escalated').textContent = stats.reports_escalated || 0;
  el('ap-ov-users').textContent = stats.users_total || 0;
  el('ap-ov-banned').textContent = stats.banned || 0;
  refreshBadges(stats);

  el('ap-overview-verify').innerHTML = verifications.length
    ? verifications.map(verifyRow).join('')
    : emptyState('Нет заявок', 'Очередь верификации пуста');
  el('ap-overview-reports').innerHTML = reports.length
    ? reports.map(reportRow).join('')
    : emptyState('Нет новых жалоб', 'Очередь жалоб пуста');
}

async function load() {
  try {
    render(await api.get('/api/v1/admin/overview/'));
  } catch (error) {
    el('ap-overview-verify').innerHTML = emptyState('Ошибка', error.message);
  }
}

registerSection('overview', { load });
