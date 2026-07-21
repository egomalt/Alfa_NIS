/* Раздел «Жалобы»: разбор обращений, действия с материалом и автором. */
(function () {
  'use strict';
  var A = window.AdminPanel;
  var filter = 'new';
  var expandedId = null;
  var threshold = 3;

  function detailHtml(r) {
    var isUserReport = r.target_type === 'user' || r.target_type === 'company';
    var isNew = r.status === 'new';

    var contentActions = (isNew && !isUserReport)
      ? '<div class="ap-action-group"><div class="ap-action-group-title">Материал</div><div class="ap-report-actions">'
        + (r.target_url ? '<a class="ap-btn-secondary" href="' + A.esc(r.target_url) + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;text-decoration:none;" data-stop="1">Открыть материал</a>' : '')
        + '<button class="ap-btn-accept" data-act="takedown" data-id="' + r.id + '">Снять материал</button>'
        + '<button class="ap-btn-reject" data-act="keep" data-id="' + r.id + '">Оставить как есть</button>'
        + '</div></div>'
      : '';

    var authorLink = r.author_username ? '/' + A.esc(r.author_username) + '/' : '';
    var authorActions = isNew
      ? '<div class="ap-action-group"><div class="ap-action-group-title">' + (isUserReport ? 'Пользователь' : 'Автор') + '</div><div class="ap-report-actions">'
        + (authorLink ? '<a class="ap-btn-secondary" href="' + authorLink + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;text-decoration:none;" data-stop="1">Открыть профиль</a>' : '')
        + '<button class="ap-btn-mini" data-act="warn-author" data-id="' + r.id + '" data-user="' + A.esc(r.author_username) + '">Предупредить</button>'
        + '<button class="ap-btn-mini ap-danger" data-act="ban-author" data-id="' + r.id + '" data-user="' + A.esc(r.author_username) + '">Забанить</button>'
        + '</div></div>'
      : '';

    var dismiss = isNew
      ? '<div class="ap-report-actions" style="margin-top:14px;"><button class="ap-btn-reject" data-act="dismiss" data-id="' + r.id + '">Отклонить жалобу целиком</button></div>'
      : '<div class="ap-decided-note" style="margin-top:12px;">' + (r.status === 'resolved' ? 'Меры приняты' : 'Жалоба отклонена') + '</div>';

    var targetRow = r.target_url
      ? '<span class="ap-detail-link" data-act="open-target" data-url="' + A.esc(r.target_url) + '">' + A.esc(r.target_title) + ' →</span>'
      : '<span>' + A.esc(r.target_title) + '</span>';
    var authorRow = authorLink
      ? '<span class="ap-detail-link" data-act="open-author" data-user="' + A.esc(r.author_username) + '">' + A.esc(r.author_username) + ' →</span>'
      : '<span>—</span>';

    return '<div class="ap-report-detail">'
      + '<div class="ap-detail-row"><span class="ap-detail-label">Материал</span>' + targetRow + '</div>'
      + '<div class="ap-detail-row"><span class="ap-detail-label">Автор</span>' + authorRow + '</div>'
      + '<div class="ap-detail-row"><span class="ap-detail-label">Заявитель</span><span>' + A.esc(r.reporter_username || '—') + '</span></div>'
      + (r.evidence ? '<div class="ap-detail-row"><span class="ap-detail-label">Подробности</span><span>' + A.esc(r.evidence) + '</span></div>' : '')
      + (isUserReport ? authorActions : contentActions + authorActions)
      + dismiss
      + '</div>';
  }

  function cardHtml(r) {
    var isOpen = expandedId === r.id;
    var escPill = r.escalated ? '<span class="ap-escalation-pill">⚠ ' + r.total_reports + ' жалоб — приоритет</span>' : '';
    return '<div class="ap-report-card' + (isOpen ? ' ap-open' : '') + (r.escalated ? ' ap-escalated' : '') + '" data-id="' + r.id + '">'
      + '<div class="ap-report-top">'
      + '<span class="ap-report-type">' + A.esc(r.target_type_label) + '</span>'
      + '<span class="ap-report-target">' + A.esc(r.target_title) + '</span>'
      + escPill
      + A.pill(r.status)
      + '<svg class="ap-report-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>'
      + '</div>'
      + '<div class="ap-report-reason">' + A.esc(r.reason) + '</div>'
      + '<div class="ap-report-meta">от ' + A.esc(r.reporter_username || '—') + ' · ' + A.esc(A.fmtDate(r.created_at)) + '</div>'
      + (isOpen ? detailHtml(r) : '')
      + '</div>';
  }

  function render(list) {
    var countEl = A.el('ap-r-count');
    if (countEl) countEl.textContent = list.length;
    var wrap = A.el('ap-reports-list');
    if (!list.length) {
      wrap.innerHTML = '<div class="ap-empty"><div class="ap-empty-title">Пусто</div><div class="ap-empty-sub">Жалоб в этой категории нет</div></div>';
      return;
    }
    wrap.innerHTML = list.map(cardHtml).join('');
  }

  function load() {
    A.apiGet('/api/v1/admin/reports/?status=' + filter)
      .then(function (d) {
        if (typeof d.threshold === 'number') threshold = d.threshold;
        render(d.reports || []);
      })
      .catch(function (e) {
        A.el('ap-reports-list').innerHTML = '<div class="ap-empty"><div class="ap-empty-title">Ошибка</div><div class="ap-empty-sub">' + A.esc(e.message) + '</div></div>';
      });
  }

  function afterAction() {
    expandedId = null;
    load();
    A.reloadOverview();
  }

  function init() {
    A.el('ap-reports-filters').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-rf]');
      if (!btn) return;
      filter = btn.dataset.rf;
      expandedId = null;
      this.querySelectorAll('[data-rf]').forEach(function (b) { b.classList.toggle('active', b.dataset.rf === filter); });
      load();
    });

    A.el('ap-reports-list').addEventListener('click', function (e) {
      // Ссылки-переходы не должны сворачивать карточку
      if (e.target.closest('[data-stop]')) { e.stopPropagation(); return; }

      var actEl = e.target.closest('[data-act]');
      if (actEl) {
        e.stopPropagation();
        var act = actEl.dataset.act;
        var id = actEl.dataset.id;
        if (act === 'open-target') { window.open(actEl.dataset.url, '_blank'); return; }
        if (act === 'open-author') { window.open('/' + actEl.dataset.user + '/', '_blank'); return; }
        if (act === 'takedown') { A.apiPost('/api/v1/admin/reports/' + id + '/resolve/', {}).then(afterAction).catch(function (err) { alert(err.message); }); return; }
        if (act === 'keep' || act === 'dismiss') { A.apiPost('/api/v1/admin/reports/' + id + '/dismiss/', {}).then(afterAction).catch(function (err) { alert(err.message); }); return; }
        if (act === 'warn-author') {
          var wu = actEl.dataset.user;
          A.openReasonModal('Причина предупреждения — ' + wu, function (reason) {
            A.apiPost('/api/v1/admin/users/' + wu + '/warn/', { reason: reason })
              .then(function () { return A.apiPost('/api/v1/admin/reports/' + id + '/resolve/', {}); })
              .then(afterAction).catch(function (err) { alert(err.message); });
          });
          return;
        }
        if (act === 'ban-author') {
          var bu = actEl.dataset.user;
          A.openReasonModal('Причина и срок бана — ' + bu, function (reason, duration) {
            A.apiPost('/api/v1/admin/users/' + bu + '/ban/', { reason: reason, duration: duration })
              .then(function () { return A.apiPost('/api/v1/admin/reports/' + id + '/resolve/', {}); })
              .then(afterAction).catch(function (err) { alert(err.message); });
          }, true);
          return;
        }
        return;
      }

      // Клик по карточке — раскрыть/свернуть
      var card = e.target.closest('.ap-report-card');
      if (card) {
        var cid = parseInt(card.dataset.id, 10);
        expandedId = (expandedId === cid) ? null : cid;
        load();
      }
    });
  }

  A.registerSection('reports', { init: init, load: load });
})();
