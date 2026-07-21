/* Раздел «Пользователи»: бан / предупреждение / разбан. */
(function () {
  'use strict';
  var A = window.AdminPanel;
  var filter = 'all';
  var query = '';

  function banLabel(u) {
    if (u.status !== 'banned') return null;
    if (!u.ban_until) return 'Забанен навсегда';
    return 'Забанен до ' + A.fmtDate(u.ban_until);
  }

  function rowHtml(u) {
    var label = banLabel(u);
    var statusHtml = A.pill(u.status, label);
    var actions;
    if (u.role === 'moderator') {
      actions = '<span class="ap-u-meta">—</span>';
    } else if (u.status === 'banned') {
      actions = '<button class="ap-btn-mini" data-act="unban" data-user="' + A.esc(u.username) + '">Разбанить</button>';
    } else {
      actions = '<button class="ap-btn-mini" data-act="warn" data-user="' + A.esc(u.username) + '" data-name="' + A.esc(u.name) + '">Варн</button>'
        + '<button class="ap-btn-mini ap-danger" data-act="ban" data-user="' + A.esc(u.username) + '" data-name="' + A.esc(u.name) + '">Бан</button>';
    }
    return '<div class="ap-trow ap-body">'
      + '<div style="display:flex;align-items:center;gap:10px;"><span class="ap-company-avatar" style="width:30px;height:30px;font-size:13px;">' + A.esc(u.letter) + '</span><div class="ap-u-name">' + A.esc(u.name) + '</div></div>'
      + '<div class="ap-u-meta">' + A.esc(u.role_label) + '</div>'
      + '<div class="ap-u-meta">' + A.esc(A.fmtDate(u.joined_at)) + '</div>'
      + '<div>' + statusHtml + '</div>'
      + '<div class="ap-row-actions">' + actions + '</div>'
      + '</div>';
  }

  function render(list) {
    var countEl = A.el('ap-u-count');
    if (countEl) countEl.textContent = list.length;
    var wrap = A.el('ap-users-table');
    if (!list.length) {
      wrap.innerHTML = '<div class="ap-empty"><div class="ap-empty-title">Никого не найдено</div><div class="ap-empty-sub">Измените фильтр или запрос</div></div>';
      return;
    }
    var head = '<div class="ap-trow ap-thead"><span>Пользователь</span><span>Роль</span><span>С нами</span><span>Статус</span><span></span></div>';
    wrap.innerHTML = head + list.map(rowHtml).join('');
  }

  function load() {
    var url = '/api/v1/admin/users/?filter=' + encodeURIComponent(filter);
    if (query) url += '&q=' + encodeURIComponent(query);
    A.apiGet(url)
      .then(function (d) { render(d.users || []); })
      .catch(function (e) {
        A.el('ap-users-table').innerHTML = '<div class="ap-empty"><div class="ap-empty-title">Ошибка</div><div class="ap-empty-sub">' + A.esc(e.message) + '</div></div>';
      });
  }

  function afterAction() {
    load();
    A.reloadOverview();
  }

  function init() {
    A.el('ap-users-filters').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-uf]');
      if (!btn) return;
      filter = btn.dataset.uf;
      this.querySelectorAll('[data-uf]').forEach(function (b) { b.classList.toggle('active', b.dataset.uf === filter); });
      load();
    });

    var search = A.el('ap-user-search');
    if (search) {
      search.addEventListener('input', function () { query = this.value; load(); });
    }

    A.el('ap-users-table').addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]');
      if (!t) return;
      var act = t.dataset.act;
      var username = t.dataset.user;
      var name = t.dataset.name || username;
      if (act === 'unban') {
        A.apiPost('/api/v1/admin/users/' + username + '/unban/', {}).then(afterAction).catch(function (err) { alert(err.message); });
      } else if (act === 'warn') {
        A.openReasonModal('Причина предупреждения — ' + name, function (reason) {
          A.apiPost('/api/v1/admin/users/' + username + '/warn/', { reason: reason }).then(afterAction).catch(function (err) { alert(err.message); });
        });
      } else if (act === 'ban') {
        A.openReasonModal('Причина и срок бана — ' + name, function (reason, duration) {
          A.apiPost('/api/v1/admin/users/' + username + '/ban/', { reason: reason, duration: duration }).then(afterAction).catch(function (err) { alert(err.message); });
        }, true);
      }
    });
  }

  A.registerSection('users', { init: init, load: load });
})();
