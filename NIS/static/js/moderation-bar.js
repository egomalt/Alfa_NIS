/* Плашка модератора на публичных страницах.
   Страница объявляет цель через window.ALFA_MOD_TARGET:
     { type:'article', id, author, title }
     { type:'contest', id }                     // автора/заголовок добираем из API
     { type:'user', username }                  // публичный профиль
   Панель и действия показываются только аккаунту с ролью moderator. */
(function () {
  'use strict';

  var target = window.ALFA_MOD_TARGET;
  if (!target || !target.type) return;

  var CSRF = (function () {
    var m = document.cookie.match(/csrftoken=([^;]+)/);
    if (m) return m[1];
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : '';
  })();

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function jget(url) { return fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.json(); }); }
  function jpost(url, body) {
    return fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
      body: JSON.stringify(body || {}),
    }).then(function (r) { return r.json().then(function (d) { if (!d.ok) throw new Error(d.message || 'Ошибка'); return d; }); });
  }

  var ROLE_LABEL = { user: 'Кандидат', company: 'Компания', moderator: 'Модератор' };

  // Проверяем роль и только потом что-то рисуем
  jget('/api/v1/auth/me/').then(function (me) {
    var acc = me && me.account;
    if (!acc || acc.role !== 'moderator') return;
    injectStyles();
    resolveTarget().then(buildBar).catch(function () { buildBar({}); });
  }).catch(function () {});

  // ── Данные цели ──────────────────────────────────────────────
  function resolveTarget() {
    if (target.type === 'article') {
      return Promise.resolve({ author: target.author, authorRole: 'user', title: target.title || 'статья' });
    }
    if (target.type === 'contest') {
      return jget('/api/v1/contests/' + target.id + '/').then(function (d) {
        var c = (d && (d.contest || d)) || {};
        return { author: c.company_username, authorRole: 'company', title: c.title || 'конкурс' };
      });
    }
    // user
    return Promise.resolve({ author: target.username, authorRole: 'user', title: '' });
  }

  // ── Панель ───────────────────────────────────────────────────
  function buildBar(ctx) {
    var bar = document.createElement('div');
    bar.className = 'mb-bar';
    var buttons = '';
    if (target.type === 'article') {
      buttons = '<button class="mb-btn mb-danger" data-mb="del-article">Удалить статью</button>'
        + '<button class="mb-btn" data-mb="author">Действия с автором</button>';
    } else if (target.type === 'contest') {
      buttons = '<button class="mb-btn mb-danger" data-mb="del-contest">Удалить конкурс</button>'
        + '<button class="mb-btn" data-mb="author">Действия с автором</button>';
    } else {
      buttons = '<button class="mb-btn" data-mb="author">Действия модератора</button>';
    }
    bar.innerHTML = '<span class="mb-badge"><span class="mb-dot"></span>Модератор</span>' + buttons;
    document.body.appendChild(bar);

    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mb]');
      if (!b) return;
      var act = b.getAttribute('data-mb');
      if (act === 'del-article') confirmDeleteMaterial(ctx, 'article');
      else if (act === 'del-contest') confirmDeleteMaterial(ctx, 'contest');
      else if (act === 'author') openAuthorActions(ctx.author);
    });
  }

  // ── Модалка удаления материала ───────────────────────────────
  function confirmDeleteMaterial(ctx, kind) {
    var noun = kind === 'article' ? 'статью' : 'конкурс';
    var body = '<div class="mb-modal-title">Удалить ' + noun + '?</div>'
      + '<div class="mb-modal-text">Материал «' + esc(ctx.title) + '» будет удалён безвозвратно.'
      + (ctx.author ? ' Автор: <b>@' + esc(ctx.author) + '</b>.' : '') + '</div>'
      + '<label class="mb-check"><input type="checkbox" id="mb-also-ban"> Также заблокировать автора</label>'
      + '<div class="mb-flash" id="mb-flash"></div>'
      + '<div class="mb-actions">'
      + '<button class="mb-btn" data-close>Отмена</button>'
      + '<button class="mb-btn mb-danger" id="mb-do-del">Удалить</button>'
      + (ctx.author ? '<button class="mb-btn" data-open-author>Другие действия с автором</button>' : '')
      + '</div>';
    var m = openModal(body);
    m.querySelector('[data-open-author]') && m.querySelector('[data-open-author]').addEventListener('click', function () {
      closeModal(); openAuthorActions(ctx.author);
    });
    m.querySelector('#mb-do-del').addEventListener('click', function () {
      var alsoBan = m.querySelector('#mb-also-ban').checked;
      var url = '/api/v1/admin/content/' + kind + '/' + target.id + '/delete/';
      var btn = this; btn.disabled = true; btn.textContent = 'Удаление…';
      jpost(url, {}).then(function () {
        if (alsoBan && ctx.author) {
          // после удаления материала — сразу форма блокировки автора
          closeModal(); openBanModal(ctx.author, function () { gotoAfterDelete(kind); });
        } else {
          gotoAfterDelete(kind);
        }
      }).catch(function (err) {
        flash(m, err.message); btn.disabled = false; btn.textContent = 'Удалить';
      });
    });
  }

  function gotoAfterDelete(kind) {
    window.location.href = kind === 'article' ? '/articles/' : '/contests/';
  }

  // ── Модалка действий с автором (бан / варн / удаление контента) ─
  function openAuthorActions(username) {
    if (!username) return;
    jget('/api/v1/admin/users/' + username + '/content/').then(function (d) {
      var counts = d.counts || {};
      var u = d.user || { username: username, name: username, role: null };
      var cats = [
        ['articles', 'Статьи', counts.articles || 0],
        ['contests', 'Конкурсы', counts.contests || 0],
        ['tests', 'Тесты', counts.tests || 0],
      ].filter(function (c) { return c[2] > 0; });

      var catRows = cats.length
        ? cats.map(function (c) {
            return '<label class="mb-check"><input type="checkbox" class="mb-cat" value="' + c[0] + '"> ' + c[1] + ' <span class="mb-count">' + c[2] + '</span></label>';
          }).join('')
        : '<div class="mb-modal-text">Материалов нет.</div>';

      var body = '<div class="mb-modal-title">Автор @' + esc(u.username) + '</div>'
        + '<div class="mb-modal-text">' + esc(u.name || '') + (u.role ? ' · ' + esc(ROLE_LABEL[u.role] || u.role) : '') + '</div>'

        + '<div class="mb-group-title">Блокировка</div>'
        + '<textarea class="mb-textarea" id="mb-ban-reason" placeholder="Причина (увидит пользователь)"></textarea>'
        + '<div class="mb-row"><input type="number" class="mb-num" id="mb-ban-days" min="1" value="7"> дней '
        + '<button class="mb-btn mb-mini" id="mb-ban-perm" type="button">Навсегда</button>'
        + '<span class="mb-grow"></span>'
        + '<button class="mb-btn" id="mb-do-warn">Предупредить</button>'
        + '<button class="mb-btn mb-danger" id="mb-do-ban">Заблокировать</button></div>'

        + '<div class="mb-group-title">Удалить контент автора</div>'
        + catRows
        + '<div class="mb-flash" id="mb-flash"></div>'
        + '<div class="mb-actions">'
        + '<button class="mb-btn" data-close>Закрыть</button>'
        + (cats.length ? '<button class="mb-btn mb-danger" id="mb-do-purge">Удалить выбранное</button>' : '')
        + '</div>';

      var m = openModal(body);
      var perm = false;
      m.querySelector('#mb-ban-perm').addEventListener('click', function () {
        perm = !perm; this.classList.toggle('mb-active', perm);
        m.querySelector('#mb-ban-days').disabled = perm;
      });
      m.querySelector('#mb-do-ban').addEventListener('click', function () {
        var reason = m.querySelector('#mb-ban-reason').value.trim();
        var duration = perm ? 'perm' : (m.querySelector('#mb-ban-days').value || '7');
        this.disabled = true;
        jpost('/api/v1/admin/users/' + username + '/ban/', { reason: reason, duration: duration })
          .then(function () { flash(m, 'Пользователь заблокирован.', true); })
          .catch(function (err) { flash(m, err.message); this && (this.disabled = false); }.bind(this));
      });
      m.querySelector('#mb-do-warn').addEventListener('click', function () {
        var reason = m.querySelector('#mb-ban-reason').value.trim();
        this.disabled = true;
        jpost('/api/v1/admin/users/' + username + '/warn/', { reason: reason })
          .then(function () { flash(m, 'Предупреждение отправлено.', true); })
          .catch(function (err) { flash(m, err.message); });
      });
      var purgeBtn = m.querySelector('#mb-do-purge');
      if (purgeBtn) purgeBtn.addEventListener('click', function () {
        var chosen = Array.prototype.map.call(m.querySelectorAll('.mb-cat:checked'), function (c) { return c.value; });
        if (!chosen.length) { flash(m, 'Отметьте, что удалить.'); return; }
        if (!window.confirm('Удалить выбранный контент автора безвозвратно?')) return;
        this.disabled = true; this.textContent = 'Удаление…';
        jpost('/api/v1/admin/users/' + username + '/purge/', { categories: chosen })
          .then(function () { flash(m, 'Контент удалён.', true); setTimeout(function () { window.location.reload(); }, 900); })
          .catch(function (err) { flash(m, err.message); });
      });
    }).catch(function () { alert('Не удалось загрузить данные автора.'); });
  }

  // Отдельная форма блокировки (для потока «удалить + заблокировать»)
  function openBanModal(username, onDone) {
    var body = '<div class="mb-modal-title">Заблокировать @' + esc(username) + '</div>'
      + '<textarea class="mb-textarea" id="mb-ban-reason" placeholder="Причина (увидит пользователь)"></textarea>'
      + '<div class="mb-row"><input type="number" class="mb-num" id="mb-ban-days" min="1" value="7"> дней '
      + '<button class="mb-btn mb-mini" id="mb-ban-perm" type="button">Навсегда</button></div>'
      + '<div class="mb-flash" id="mb-flash"></div>'
      + '<div class="mb-actions"><button class="mb-btn" data-close>Пропустить</button>'
      + '<button class="mb-btn mb-danger" id="mb-do-ban">Заблокировать</button></div>';
    var m = openModal(body);
    var perm = false;
    m.querySelector('#mb-ban-perm').addEventListener('click', function () {
      perm = !perm; this.classList.toggle('mb-active', perm); m.querySelector('#mb-ban-days').disabled = perm;
    });
    m.querySelector('[data-close]').addEventListener('click', function () { if (onDone) onDone(); });
    m.querySelector('#mb-do-ban').addEventListener('click', function () {
      var reason = m.querySelector('#mb-ban-reason').value.trim();
      var duration = perm ? 'perm' : (m.querySelector('#mb-ban-days').value || '7');
      this.disabled = true;
      jpost('/api/v1/admin/users/' + username + '/ban/', { reason: reason, duration: duration })
        .then(function () { if (onDone) onDone(); }).catch(function (err) { flash(m, err.message); this.disabled = false; }.bind(this));
    });
  }

  // ── Модалка (общая) ──────────────────────────────────────────
  function openModal(html) {
    closeModal();
    var ov = document.createElement('div');
    ov.className = 'mb-overlay';
    ov.innerHTML = '<div class="mb-modal">' + html + '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.hasAttribute('data-close')) closeModal();
    });
    return ov.querySelector('.mb-modal');
  }
  function closeModal() {
    var ex = document.querySelector('.mb-overlay');
    if (ex) ex.remove();
  }
  function flash(m, msg, ok) {
    var f = m.querySelector('#mb-flash');
    if (f) f.innerHTML = '<div class="mb-flash-box ' + (ok ? 'ok' : 'err') + '">' + esc(msg) + '</div>';
  }

  // ── Стили ────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('mb-styles')) return;
    var css = ''
      + '.mb-bar{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9000;display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface,#fff);border:1px solid var(--line,#e2e7f0);border-radius:14px;box-shadow:0 8px 30px rgba(16,24,40,.18);}'
      + '.mb-badge{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--brand-text,#c81e2d);padding:0 6px;}'
      + '.mb-dot{width:7px;height:7px;border-radius:50%;background:var(--brand,#d62839);box-shadow:0 0 0 3px rgba(214,40,57,.18);}'
      + '.mb-btn{height:34px;padding:0 14px;border:1px solid var(--line-2,#d2d9e6);border-radius:9px;background:var(--surface,#fff);color:var(--text,#161a22);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .12s;}'
      + '.mb-btn:hover{border-color:var(--brand,#d62839);color:var(--brand-text,#c81e2d);}'
      + '.mb-btn.mb-danger{background:var(--brand,#d62839);border-color:var(--brand,#d62839);color:#fff;}'
      + '.mb-btn.mb-danger:hover{opacity:.9;color:#fff;}'
      + '.mb-btn.mb-mini{height:30px;padding:0 10px;font-size:12px;}'
      + '.mb-btn.mb-active{background:var(--brand,#d62839);color:#fff;border-color:var(--brand,#d62839);}'
      + '.mb-overlay{position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px;}'
      + '.mb-modal{width:100%;max-width:460px;background:var(--surface,#fff);border:1px solid var(--line,#e2e7f0);border-radius:16px;padding:24px;box-shadow:0 16px 44px rgba(16,24,40,.28);max-height:90vh;overflow-y:auto;}'
      + '.mb-modal-title{font-size:18px;font-weight:800;letter-spacing:-.02em;margin-bottom:8px;color:var(--text,#161a22);}'
      + '.mb-modal-text{font-size:13.5px;color:var(--muted,#6e7787);line-height:1.55;margin-bottom:14px;}'
      + '.mb-group-title{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--faint,#99a2b2);margin:16px 0 8px;}'
      + '.mb-check{display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--text-2,#3c434f);padding:6px 0;cursor:pointer;}'
      + '.mb-count{font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--muted,#6e7787);background:var(--surface-2,#edf0f6);border-radius:999px;padding:1px 8px;}'
      + '.mb-textarea{width:100%;min-height:64px;padding:10px 12px;border:1px solid var(--line-2,#d2d9e6);border-radius:10px;background:var(--surface,#fff);color:var(--text,#161a22);font-size:13.5px;font-family:inherit;resize:vertical;margin-bottom:10px;box-sizing:border-box;}'
      + '.mb-row{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-2,#3c434f);flex-wrap:wrap;margin-bottom:4px;}'
      + '.mb-num{width:70px;height:32px;padding:0 10px;border:1px solid var(--line-2,#d2d9e6);border-radius:8px;background:var(--surface,#fff);color:var(--text,#161a22);font-family:inherit;}'
      + '.mb-grow{flex:1;}'
      + '.mb-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px;}'
      + '.mb-flash{margin-top:12px;}'
      + '.mb-flash-box{padding:9px 12px;border-radius:9px;font-size:13px;}'
      + '.mb-flash-box.err{background:var(--red-soft,#fce7e8);color:var(--red-text,#c81e2d);}'
      + '.mb-flash-box.ok{background:var(--green-soft,#e2f3ea);color:var(--green-text,#15935a);}';
    var st = document.createElement('style');
    st.id = 'mb-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }
})();
