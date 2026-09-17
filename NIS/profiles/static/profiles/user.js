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

  var FLAME = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M13.6 1.5c.4 3-1.1 4.7-2.5 6.1C9.5 9.2 8 10.8 8.2 13.6c-.9-.6-1.6-1.7-1.9-2.9C4.8 12.2 4 14.1 4 16c0 4.2 3.6 6.9 8 6.9s8-3 8-7.3c0-3.9-2.3-6.4-4-8.2-1.7-1.8-2.4-3.8-2.4-5.9z"/></svg>';

  var LINK_ICONS = {
    github: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.93.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg>',
    telegram: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.3 18.9 19c-.2 1-.8 1.3-1.7.8l-4.6-3.4-2.2 2.1c-.2.2-.5.5-1 .5l.3-4.7 8.5-7.7c.4-.3-.1-.5-.6-.2L6.9 13.1l-4.5-1.4c-1-.3-1-1 .2-1.5l17.6-6.8c.8-.3 1.5.2 1.2 1z"/></svg>',
    site: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg>',
  };

  /** Огонёк серии: значок и число дней. Холодный — человек давно не заходил.
   *  Что означает число, объясняет подсказка: в строке с именем ей не место. */
  function streakHtml(streak) {
    if (!streak) return '';
    var days = streak.current;
    return '<span class="pu-streak' + (days ? '' : ' cold')
      + '" title="Дней подряд с активностью на площадке">' + FLAME + days + '</span>';
  }

  function linksHtml(links) {
    if (!links || !links.length) return '';
    return '<div class="pu-links">' + links.map(function (link) {
      return '<a class="pu-link" href="' + esc(link.url) + '" target="_blank" rel="noopener nofollow">'
        + (LINK_ICONS[link.kind] || '') + esc(link.label) + '</a>';
    }).join('') + '</div>';
  }

  /** Сильные стороны: темы, подтверждённые результатами чужих тестов. */
  function topicsHtml(strengths) {
    if (!strengths || !strengths.length) return '';
    return '<div class="pu-section">'
      + '<div class="pu-section-title">Сильные стороны</div>'
      + '<div class="pu-topics">' + strengths.map(function (topic) {
          return '<div>'
            + '<div class="pu-topic-head">'
            +   '<span class="pu-topic-name">' + esc(topic.label) + '</span>'
            +   '<span class="pu-topic-count">' + topic.attempts + ' тестов</span>'
            +   '<span class="pu-topic-val">' + topic.avg_percent + '%</span>'
            + '</div>'
            + '<div class="pu-topic-track"><div class="pu-topic-fill" style="width:' + topic.avg_percent + '%"></div></div>'
            + '</div>';
        }).join('') + '</div></div>';
  }

  /** Контакты: сервер отдаёт их владельцу и подтверждённой компании. */
  function contactsHtml(c) {
    if (!c.contacts_visible) return '';
    var rows = [];
    if (c.email) {
      rows.push('<a class="pu-contact" href="mailto:' + esc(c.email) + '">'
        + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>'
        + esc(c.email) + '</a>');
    }
    if (c.phone) {
      rows.push('<a class="pu-contact" href="tel:' + esc(c.phone.replace(/[^\d+]/g, '')) + '">'
        + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.3a2 2 0 0 1 2.1-.5c.9.4 1.8.6 2.7.8a2 2 0 0 1 1.7 2z"/></svg>'
        + esc(c.phone) + '</a>');
    }
    if (!rows.length) return '';
    return '<div class="pu-section">'
      + '<div class="pu-section-title">Как связаться</div>'
      + '<div class="pu-contacts">' + rows.join('') + '</div></div>';
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
    var metaStr = 'Кандидат' + (joinYear ? ' · на платформе с ' + joinYear + ' г.' : '');

    var skills = c.skills || [];
    var tagsHtml = skills.map(function (sk) { return '<span class="pu-tag">' + esc(sk) + '</span>'; }).join('');

    // Конкурсы остаются числами в плашках и карточками побед: лента участий
    // повторяла их третий раз
    var wins = submissions.filter(function (s) { return s.winner; }).length;
    var totalContests = submissions.length;
    var totalArticles = articles.length;

    var articlesPreview = articles.slice(0, 2);
    var articlesHtml = articlesPreview.length
      ? articlesPreview.map(function (a) {
          var covBg = COVERS[a.cover_index % COVERS.length] || COVERS[0];
          var dateStr = fmtDateShort(a.published_at);
          return '<a class="pu-article-row" href="/articles/' + esc(a.id) + '/">'
            + '<div class="pu-article-cover" style="background:' + covBg + ';"></div>'
            + '<div><div class="pu-article-title">' + esc(a.title) + '</div>'
            + '<div class="pu-article-meta">' + dateStr + (dateStr && a.views ? ' · ' : '') + (a.views || 0) + ' просм. · рейтинг ' + (a.likes || 0) + '</div></div>'
            + '</a>';
        }).join('')
      : '<div class="pu-empty">Публикаций пока нет.</div>';

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
        + '<div><div class="pu-badge-title">' + AlfaPlural.articles(totalArticles) + '</div><div class="pu-badge-sub">опубликовано</div></div>'
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
      +     '<div class="pu-name-row"><div class="pu-hero-name">' + esc(c.name) + '</div>'
      +     streakHtml(c.streak) + '</div>'
      +     '<div class="pu-hero-meta">' + esc(metaStr) + '</div>'
      +     (c.bio ? '<div class="pu-hero-bio">' + esc(c.bio) + '</div>' : '')
      +     (tagsHtml ? '<div class="pu-tag-row">' + tagsHtml + '</div>' : '')
      +     linksHtml(c.links)
      +   '</div>'
      + '</div>'
      + '<div class="pu-stats-row">'
      +   '<div class="pu-stat-card"><div class="pu-stat-label">Статей опубликовано</div><div class="pu-stat-value">' + totalArticles + '</div></div>'
      +   '<div class="pu-stat-card"><div class="pu-stat-label">Конкурсов</div><div class="pu-stat-value">' + totalContests + '</div></div>'
      +   '<div class="pu-stat-card"><div class="pu-stat-label">Побед</div><div class="pu-stat-value">' + wins + '</div></div>'
      +   '<div class="pu-stat-card"><div class="pu-stat-label">На платформе с</div><div class="pu-stat-value" style="font-size:16px;">' + (joinYear || '—') + '</div></div>'
      + '</div>'
      + topicsHtml(c.strengths)
      + achievementsSection
      + '<div class="pu-section">'
      +   '<div class="pu-section-header"><div class="pu-section-title">Публикации</div>' + allArticlesLink + '</div>'
      +   '<div class="pu-article-list">' + articlesHtml + '</div>'
      + '</div>'
      + contactsHtml(c);
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
