(function () {
  'use strict';

  var username = (window.ALFA_APP_BOOTSTRAP || {}).username || '';
  var allArticles = [];
  var activeTag = 'all';

  var COVERS = [
    'linear-gradient(135deg,#1e3a5f 0%,#2d6a9f 100%)',
    'linear-gradient(135deg,#D62839 0%,#7a1020 100%)',
    'linear-gradient(135deg,#134e5e 0%,#1a7a6e 100%)',
  ];

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); }
    catch (e) { return ''; }
  }

  function apiFetch(url) {
    return fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.ok) throw new Error(d.message || 'Ошибка'); return d; });
  }

  function renderFilters() {
    var tags = [];
    allArticles.forEach(function (a) {
      (a.tags || []).forEach(function (t) { if (tags.indexOf(t) === -1) tags.push(t); });
    });
    var filtersEl = document.getElementById('ua-filters');
    var html = '<button class="ua-filter-btn' + (activeTag === 'all' ? ' active' : '') + '" data-tag="all">Все</button>';
    tags.forEach(function (t) {
      html += '<button class="ua-filter-btn' + (activeTag === t ? ' active' : '') + '" data-tag="' + esc(t) + '">' + esc(t) + '</button>';
    });
    html += '<span class="ua-filter-count" id="ua-count"></span>';
    filtersEl.innerHTML = html;
    filtersEl.querySelectorAll('.ua-filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeTag = btn.dataset.tag;
        renderGrid();
        renderFilters();
      });
    });
  }

  function renderGrid() {
    var list = activeTag === 'all'
      ? allArticles
      : allArticles.filter(function (a) { return (a.tags || []).indexOf(activeTag) !== -1; });

    var countEl = document.getElementById('ua-count');
    if (countEl) countEl.textContent = list.length + ' из ' + allArticles.length;

    var grid = document.getElementById('ua-grid');
    if (!list.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--muted);">Нет статей.</div>';
      return;
    }

    grid.innerHTML = list.map(function (a) {
      var covBg = COVERS[a.cover_index % COVERS.length] || COVERS[0];
      var dateStr = fmtDate(a.published_at);
      var tagsHtml = (a.tags || []).map(function (t) { return '<span class="ua-card-tag">' + esc(t) + '</span>'; }).join('');
      return '<a class="ua-card" href="/articles/' + esc(a.id) + '/">'
        + '<div class="ua-card-cover" style="background:' + covBg + ';">'
        + '<svg class="ua-card-cover-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:44px;height:44px;"><path d="M8 10h32M8 18h24M8 26h20M8 34h16" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>'
        + '</div>'
        + '<div class="ua-card-body">'
        + (tagsHtml ? '<div class="ua-card-tags">' + tagsHtml + '</div>' : '')
        + '<div class="ua-card-title">' + esc(a.title) + '</div>'
        + (a.excerpt ? '<div class="ua-card-excerpt">' + esc(a.excerpt) + '</div>' : '')
        + '<div class="ua-card-footer">'
        + '<span class="ua-card-mono"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' + (a.read_time || 5) + ' мин</span>'
        + (dateStr ? '<span class="ua-card-dot">·</span><span class="ua-card-meta">' + dateStr + '</span>' : '')
        + '<div class="ua-card-footer-right">'
        + '<span class="ua-stat-pill"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' + (a.views || 0) + '</span>'
        + '<span class="ua-stat-pill"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' + (a.likes || 0) + '</span>'
        + '</div>'
        + '</div>'
        + '</div>'
        + '</a>';
    }).join('');
  }

  function init() {
    var backLink = document.getElementById('ua-back-link');
    if (backLink) backLink.href = '/' + username + '/';

    Promise.all([
      apiFetch('/api/v1/candidates/' + username + '/'),
      apiFetch('/api/v1/candidates/' + username + '/articles/'),
    ]).then(function (results) {
      var candidate = results[0].candidate;
      allArticles = results[1].articles || [];

      var avEl = document.getElementById('ua-author-av');
      if (avEl) {
        if (candidate.avatar) {
          avEl.innerHTML = '<img src="' + esc(candidate.avatar) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">';
        } else {
          avEl.textContent = (candidate.name || '?')[0].toUpperCase();
        }
      }

      var titleEl = document.getElementById('ua-page-title');
      if (titleEl) titleEl.textContent = 'Публикации ' + (candidate.name || username);

      var subEl = document.getElementById('ua-page-sub');
      if (subEl) subEl.textContent = allArticles.length + ' опубликованных статей';

      renderFilters();
      renderGrid();
    }).catch(function (e) {
      var grid = document.getElementById('ua-grid');
      if (grid) grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--muted);">' + esc(e.message) + '</div>';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
