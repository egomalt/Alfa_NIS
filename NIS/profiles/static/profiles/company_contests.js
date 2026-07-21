(function () {
  'use strict';

  var username = (window.ALFA_APP_BOOTSTRAP || {}).username || '';
  var allContests = [];
  var activeFilter = 'all';

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { return ''; }
  }

  function apiFetch(url) {
    return fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.ok) throw new Error(d.message || 'Ошибка'); return d; });
  }

  function statusPill(status) {
    if (status === 'active') return '<span class="cc-status-pill" style="background:var(--green-soft);color:var(--green-text);">Активен</span>';
    if (status === 'review') return '<span class="cc-status-pill" style="background:var(--amber-soft);color:var(--amber-text);">На проверке</span>';
    return '<span class="cc-status-pill" style="background:var(--surface-2);color:var(--muted);">Завершён</span>';
  }

  function filterContests(f) {
    if (f === 'all') return allContests;
    if (f === 'active') return allContests.filter(function (c) { return c.status === 'active'; });
    if (f === 'finished') return allContests.filter(function (c) { return c.status === 'finished' || c.status === 'review'; });
    return allContests;
  }

  function renderList() {
    var list = filterContests(activeFilter);
    var countEl = document.getElementById('cc-count');
    if (countEl) countEl.textContent = list.length + ' из ' + allContests.length;

    var wrap = document.getElementById('cc-list');
    if (!list.length) {
      wrap.innerHTML = '<div class="cc-empty"><div class="cc-empty-title">Конкурсов не найдено</div><div class="cc-empty-sub">Попробуйте другой фильтр</div></div>';
      return;
    }
    wrap.innerHTML = list.map(function (c) {
      var dl = c.deadline ? 'дедлайн ' + fmtDate(c.deadline) : '';
      var meta = [c.category, dl].filter(Boolean).join(' · ');
      return '<a class="cc-card" href="/contests/' + esc(c.id) + '/">'
        + '<div class="cc-card-main"><div class="cc-card-title">' + esc(c.title) + '</div><div class="cc-card-meta">' + esc(meta) + '</div></div>'
        + '<span class="cc-mono">' + (c.participants_count || 0) + ' участников</span>'
        + statusPill(c.status)
        + '</a>';
    }).join('');
  }

  function initFilters() {
    document.querySelectorAll('.cc-filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeFilter = btn.dataset.f;
        document.querySelectorAll('.cc-filter-btn').forEach(function (b) {
          b.classList.toggle('active', b.dataset.f === activeFilter);
        });
        renderList();
      });
    });
  }

  function init() {
    var backLink = document.getElementById('cc-back-link');
    if (backLink) backLink.href = '/' + username + '/';

    initFilters();

    Promise.all([
      apiFetch('/api/v1/companies/' + username + '/'),
      apiFetch('/api/v1/companies/' + username + '/contests/'),
    ]).then(function (results) {
      var company = results[0].company;
      allContests = results[1].contests || [];

      var avEl = document.getElementById('cc-company-av');
      if (avEl) {
        if (company.avatar_url) {
          avEl.innerHTML = '<img src="' + esc(company.avatar_url) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">';
        } else {
          avEl.textContent = (company.name || '?')[0].toUpperCase();
        }
      }

      var titleEl = document.getElementById('cc-page-title');
      if (titleEl) {
        var badge = company.is_verified ? '<span class="cc-verified">✓</span>' : '';
        titleEl.innerHTML = 'Конкурсы «' + esc(company.name) + '» ' + badge;
      }

      renderList();
    }).catch(function (e) {
      var wrap = document.getElementById('cc-list');
      if (wrap) wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);">' + esc(e.message) + '</div>';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
