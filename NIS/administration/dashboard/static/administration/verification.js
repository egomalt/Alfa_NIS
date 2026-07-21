/* Раздел «Верификация компаний». */
(function () {
  'use strict';
  var A = window.AdminPanel;
  var filter = 'pending';

  function metaLine(v) {
    var parts = [];
    if (v.industry) parts.push(v.industry);
    if (v.city) parts.push(v.city);
    var line = parts.join(' · ');
    if (v.submitted_at) line += (line ? ' · ' : '') + 'подано ' + A.fmtDate(v.submitted_at);
    return line;
  }

  function cardHtml(v) {
    var actions;
    if (v.status === 'pending') {
      actions = '<button class="ap-btn-accept" data-act="approve" data-user="' + A.esc(v.username) + '">Одобрить</button>'
        + '<button class="ap-btn-reject" data-act="reject" data-user="' + A.esc(v.username) + '">Отклонить</button>';
    } else if (v.status === 'rejected') {
      actions = '<span class="ap-decided-note">Отклонено: ' + A.esc(v.reason || 'без причины') + '</span>';
    } else {
      actions = '<span class="ap-decided-note">Компания подтверждена</span>';
    }
    var doc = v.document_name
      ? '<a class="ap-verify-doc" data-act="viewdoc" data-name="' + A.esc(v.document_name) + '" data-url="' + A.esc(v.document_url) + '">'
        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
        + A.esc(v.document_name) + '</a>'
      : '';
    return '<div class="ap-verify-card">'
      + '<span class="ap-company-avatar">' + A.esc(v.letter) + '</span>'
      + '<div class="ap-verify-main"><div class="ap-verify-title">' + A.esc(v.name) + '</div>'
      + '<div class="ap-verify-meta">' + A.esc(metaLine(v)) + '</div></div>'
      + doc
      + A.pill(v.status)
      + actions
      + '</div>';
  }

  function render(list) {
    var countEl = A.el('ap-vf-count');
    if (countEl) countEl.textContent = list.length;
    var wrap = A.el('ap-verify-list');
    if (!list.length) {
      wrap.innerHTML = '<div class="ap-empty"><div class="ap-empty-title">Пусто</div><div class="ap-empty-sub">Заявок в этой категории нет</div></div>';
      return;
    }
    wrap.innerHTML = list.map(cardHtml).join('');
  }

  function load() {
    A.apiGet('/api/v1/admin/verifications/?status=' + filter)
      .then(function (d) { render(d.verifications || []); })
      .catch(function (e) {
        A.el('ap-verify-list').innerHTML = '<div class="ap-empty"><div class="ap-empty-title">Ошибка</div><div class="ap-empty-sub">' + A.esc(e.message) + '</div></div>';
      });
  }

  function afterAction() {
    load();
    A.reloadOverview();
  }

  function init() {
    A.el('ap-verify-filters').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-vf]');
      if (!btn) return;
      filter = btn.dataset.vf;
      this.querySelectorAll('[data-vf]').forEach(function (b) { b.classList.toggle('active', b.dataset.vf === filter); });
      load();
    });

    A.el('ap-verify-list').addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]');
      if (!t) return;
      var act = t.dataset.act;
      if (act === 'viewdoc') {
        A.openDocModal(t.dataset.name, t.dataset.url);
      } else if (act === 'approve') {
        A.apiPost('/api/v1/admin/verifications/' + t.dataset.user + '/approve/', {}).then(afterAction).catch(function (err) { alert(err.message); });
      } else if (act === 'reject') {
        var username = t.dataset.user;
        A.openReasonModal('Причина отклонения заявки', function (reason) {
          A.apiPost('/api/v1/admin/verifications/' + username + '/reject/', { reason: reason }).then(afterAction).catch(function (err) { alert(err.message); });
        });
      }
    });
  }

  A.registerSection('verify', { init: init, load: load });
})();
