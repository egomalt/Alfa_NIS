(function () {
  'use strict';

  var username = (window.ALFA_APP_BOOTSTRAP || {}).username || '';

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
    try { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { return ''; }
  }

  function fmtDateShort(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); }
    catch (e) { return ''; }
  }

  function apiFetch(url) {
    return fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.ok) throw new Error(d.message || 'Ошибка'); return d; });
  }

  function render(candidate, articles, submissions) {
    var el = document.getElementById('profile-content');
    if (!el) return;

    var c = candidate;
    var initial = (c.name || '?').trim()[0].toUpperCase();
    var avatarHtml = c.avatar
      ? '<img src="' + esc(c.avatar) + '" alt="' + esc(c.name) + '" style="width:100%;height:100%;object-fit:cover;">'
      : '<span>' + esc(initial) + '</span>';

    var joinYear = c.created_at ? new Date(c.created_at).getFullYear() : '';
    var metaParts = [];
    if (c.bio) metaParts.push(c.bio.split('.')[0]);
    var metaStr = 'Кандидат' + (joinYear ? ' · на платформе с ' + joinYear + ' г.' : '');

    var skills = c.skills || [];
    var tagsHtml = skills.map(function (sk) { return '<span class="pu-tag">' + esc(sk) + '</span>'; }).join('');

    // Stats
    var wins = submissions.filter(function (s) { return s.winner; }).length;
    var totalContests = submissions.length;
    var totalArticles = articles.length;

    // Published articles (up to 2 for preview)
    var articlesPreview = articles.slice(0, 2);
    var articlesHtml = articlesPreview.length
      ? articlesPreview.map(function (a) {
          var covBg = COVERS[a.cover_index % COVERS.length] || COVERS[0];
          var dateStr = fmtDateShort(a.published_at);
          return '<a class="pu-article-row" href="/articles/' + esc(a.id) + '/">'
            + '<div class="pu-article-cover" style="background:' + covBg + ';"></div>'
            + '<div><div class="pu-article-title">' + esc(a.title) + '</div>'
            + '<div class="pu-article-meta">' + dateStr + (dateStr && a.views ? ' · ' : '') + (a.views || 0) + ' просм. · ' + (a.likes || 0) + ' лайков</div></div>'
            + '</a>';
        }).join('')
      : '<div class="pu-empty">Публикаций пока нет.</div>';

    // Contest timeline
    var timelineHtml = submissions.length
      ? submissions.slice(0, 5).map(function (s) {
          var icon, bg, label;
          if (s.winner) {
            icon = '🏆'; bg = 'var(--green-soft)'; label = '1 место';
          } else if (s.status === 'pending') {
            icon = '⏳'; bg = 'var(--amber-soft)'; label = 'На проверке';
          } else {
            icon = '✓'; bg = 'var(--surface-2)'; label = 'Участвовал';
          }
          return '<div class="pu-tl-row">'
            + '<span class="pu-tl-icon" style="background:' + bg + ';">' + icon + '</span>'
            + '<span class="pu-tl-text">' + label + ' — «' + esc(s.contest_title) + '»</span>'
            + '<span class="pu-tl-time">' + fmtDateShort(s.submitted_at) + '</span>'
            + '</div>';
        }).join('')
      : '<div class="pu-empty">Конкурсов пока нет.</div>';

    // Badges from wins
    var badgesHtml = '';
    var winSubs = submissions.filter(function (s) { return s.winner; });
    if (winSubs.length) {
      badgesHtml = winSubs.slice(0, 3).map(function (s) {
        return '<div class="pu-badge-card">'
          + '<span class="pu-badge-medal">🥇</span>'
          + '<div><div class="pu-badge-title">1 место</div><div class="pu-badge-sub">«' + esc(s.contest_title) + '»</div></div>'
          + '</div>';
      }).join('');
    }
    if (totalArticles > 0) {
      badgesHtml += '<div class="pu-badge-card">'
        + '<span class="pu-badge-medal" style="background:var(--green-soft);color:var(--green-text);">✍</span>'
        + '<div><div class="pu-badge-title">' + totalArticles + ' ' + (totalArticles === 1 ? 'статья' : totalArticles < 5 ? 'статьи' : 'статей') + '</div><div class="pu-badge-sub">опубликовано</div></div>'
        + '</div>';
    }
    var achievementsSection = badgesHtml
      ? '<div class="pu-section"><div class="pu-section-title">Достижения</div><div class="pu-badge-grid">' + badgesHtml + '</div></div>'
      : '';

    var allArticlesLink = '<a class="pu-all-link" href="/' + esc(username) + '/articles/">Все публикации →</a>';

    el.innerHTML = ''
      + '<div class="pu-hero-card">'
      +   '<div class="pu-cover"><svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice"><circle cx="340" cy="20" r="80" fill="rgba(255,255,255,.08)"/><circle cx="60" cy="130" r="100" fill="rgba(255,255,255,.05)"/></svg></div>'
      +   '<div class="pu-hero-body">'
      +     '<div class="pu-hero-av">' + avatarHtml + '</div>'
      +     '<div><div class="pu-hero-name">' + esc(c.name) + '</div>'
      +     '<div class="pu-hero-meta">' + esc(metaStr) + '</div></div>'
      +     (c.bio ? '<div class="pu-hero-bio">' + esc(c.bio) + '</div>' : '')
      +     (tagsHtml ? '<div class="pu-tag-row">' + tagsHtml + '</div>' : '')
      +   '</div>'
      + '</div>'
      + '<div class="pu-stats-row">'
      +   '<div class="pu-stat-card"><div class="pu-stat-label">Статей опубликовано</div><div class="pu-stat-value">' + totalArticles + '</div></div>'
      +   '<div class="pu-stat-card"><div class="pu-stat-label">Конкурсов</div><div class="pu-stat-value">' + totalContests + '</div></div>'
      +   '<div class="pu-stat-card"><div class="pu-stat-label">Побед</div><div class="pu-stat-value">' + wins + '</div></div>'
      +   '<div class="pu-stat-card"><div class="pu-stat-label">На платформе с</div><div class="pu-stat-value" style="font-size:16px;">' + (joinYear || '—') + '</div></div>'
      + '</div>'
      + achievementsSection
      + '<div class="pu-section">'
      +   '<div class="pu-section-header"><div class="pu-section-title">Публикации</div>' + allArticlesLink + '</div>'
      +   '<div class="pu-article-list">' + articlesHtml + '</div>'
      + '</div>'
      + '<div class="pu-section">'
      +   '<div class="pu-section-title">Участие в конкурсах</div>'
      +   '<div class="pu-timeline">' + timelineHtml + '</div>'
      + '</div>';
  }

  function init() {
    var el = document.getElementById('profile-content');

    Promise.all([
      apiFetch('/api/v1/candidates/' + username + '/'),
      apiFetch('/api/v1/candidates/' + username + '/articles/'),
      apiFetch('/api/v1/candidates/' + username + '/contests/'),
    ]).then(function (results) {
      render(
        results[0].candidate,
        results[1].articles || [],
        results[2].submissions || []
      );
    }).catch(function (e) {
      if (el) el.innerHTML = '<div style="padding:80px;text-align:center;color:var(--muted);">' + esc(e.message) + '</div>';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
