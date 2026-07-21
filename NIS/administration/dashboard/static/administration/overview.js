/* Раздел «Обзор»: сводные счётчики и последние элементы очередей. */
(function () {
  'use strict';
  var A = window.AdminPanel;

  function verifyRow(v) {
    var parts = [];
    if (v.industry) parts.push(v.industry);
    if (v.city) parts.push(v.city);
    var line = parts.join(' · ');
    if (v.submitted_at) line += (line ? ' · ' : '') + 'подано ' + A.fmtDate(v.submitted_at);
    return '<div class="ap-verify-card">'
      + '<span class="ap-company-avatar">' + A.esc(v.letter) + '</span>'
      + '<div class="ap-verify-main"><div class="ap-verify-title">' + A.esc(v.name) + '</div><div class="ap-verify-meta">' + A.esc(line) + '</div></div>'
      + A.pill(v.status)
      + '</div>';
  }

  function reportRow(r) {
    var escPill = r.escalated ? '<span class="ap-escalation-pill">⚠ ' + r.total_reports + ' жалоб</span>' : '';
    return '<div class="ap-report-card' + (r.escalated ? ' ap-escalated' : '') + '" style="cursor:default;">'
      + '<div class="ap-report-top"><span class="ap-report-type">' + A.esc(r.target_type_label) + '</span><span class="ap-report-target">' + A.esc(r.target_title) + '</span>' + escPill + '</div>'
      + '<div class="ap-report-reason">' + A.esc(r.reason) + '</div>'
      + '<div class="ap-report-meta">от ' + A.esc(r.reporter_username || '—') + ' · ' + A.esc(A.fmtDate(r.created_at)) + '</div>'
      + '</div>';
  }

  function render(data) {
    var s = data.stats || {};
    A.el('ap-ov-verify').textContent = s.verify_pending || 0;
    A.el('ap-ov-reports').textContent = s.reports_new || 0;
    A.el('ap-ov-escalated').textContent = s.reports_escalated || 0;
    A.el('ap-ov-users').textContent = s.users_total || 0;
    A.el('ap-ov-banned').textContent = s.banned || 0;
    A.refreshBadges(s);

    var vWrap = A.el('ap-overview-verify');
    var verifs = data.recent_verifications || [];
    vWrap.innerHTML = verifs.length
      ? verifs.map(verifyRow).join('')
      : '<div class="ap-empty"><div class="ap-empty-title">Нет заявок</div><div class="ap-empty-sub">Очередь верификации пуста</div></div>';

    var rWrap = A.el('ap-overview-reports');
    var reps = data.recent_reports || [];
    rWrap.innerHTML = reps.length
      ? reps.map(reportRow).join('')
      : '<div class="ap-empty"><div class="ap-empty-title">Нет новых жалоб</div><div class="ap-empty-sub">Очередь жалоб пуста</div></div>';
  }

  function load() {
    A.apiGet('/api/v1/admin/overview/')
      .then(render)
      .catch(function (e) {
        var vWrap = A.el('ap-overview-verify');
        if (vWrap) vWrap.innerHTML = '<div class="ap-empty"><div class="ap-empty-title">Ошибка</div><div class="ap-empty-sub">' + A.esc(e.message) + '</div></div>';
      });
  }

  function init() {}

  A.registerSection('overview', { init: init, load: load });
})();
