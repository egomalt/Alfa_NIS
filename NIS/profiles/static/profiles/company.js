(function () {
  'use strict';

  var username = (window.ALFA_APP_BOOTSTRAP || {}).username || '';

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDeadline(iso) {
    if (!iso) return '';
    // Дедлайн — короткий ДД.ММ.ГГГГ (формат локали ru-RU по умолчанию)
    try { return new Date(iso).toLocaleDateString('ru-RU'); }
    catch (e) { return ''; }
  }

  function apiFetch(url) {
    return fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.ok) throw new Error(d.message || 'Ошибка'); return d; });
  }

  function starSvg(filled) {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="' + (filled ? 'var(--amber-text)' : 'none') + '" stroke="var(--amber-text)" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8-6.1-3.6-6.1 3.6 1.5-6.8-5.2-4.7 6.9-.7z"/></svg>';
  }

  function statusPill(status) {
    if (status === 'active') return '<span class="pc-status-pill" style="background:var(--green-soft);color:var(--green-text);">Активен</span>';
    if (status === 'review') return '<span class="pc-status-pill" style="background:var(--amber-soft);color:var(--amber-text);">На проверке</span>';
    return '<span class="pc-status-pill" style="background:var(--surface-2);color:var(--muted);">Завершён</span>';
  }

  function render(company, contests, tests) {
    var el = document.getElementById('profile-content');
    if (!el) return;

    var initial = (company.name || '?')[0].toUpperCase();
    var avHtml = company.avatar_url
      ? '<img src="' + esc(company.avatar_url) + '" alt="">'
      : initial;

    var verBadge = company.is_verified
      ? '<span class="pc-verified">✓</span>'
      : '';

    var metaParts = [];
    // Отрасль и город приходят от компании и попадают прямо в разметку —
    // раньше они вставлялись без экранирования
    if (company.industry) metaParts.push(esc(company.industry));
    if (company.city) metaParts.push(esc(company.city));
    var ratingStr = company.avg_rating ? '★ ' + company.avg_rating : '';
    if (ratingStr) metaParts.push('<span class="pc-rating-inline">' + esc(ratingStr) + '</span>');
    if (company.created_at) {
      // toLocaleDateString даёт «июль 2026 г.» — после «с» нужен родительный падеж
      var since = AlfaPlural.monthYearOf(company.created_at);
      if (since) metaParts.push('на платформе с ' + since);
    }

    var tags = company.directions || [];
    var tagsHtml = tags.map(function (t) { return '<span class="pc-tag">' + esc(t) + '</span>'; }).join('');
    if (company.city) tagsHtml += '<span class="pc-tag">' + esc(company.city) + '</span>';

    // Stats
    var activeContests = contests.filter(function (c) { return c.status === 'active'; });
    var totalParticipants = contests.reduce(function (s, c) { return s + (c.participants_count || 0); }, 0);
    var publishedTests = (tests || []).filter(function (t) { return t.status === 'published'; });

    // Active contests section (up to 2)
    var contestRowsHtml = activeContests.length
      ? activeContests.slice(0, 2).map(function (c) {
          var dl = c.deadline ? 'дедлайн ' + fmtDeadline(c.deadline) : '';
          var meta = [c.category, dl].filter(Boolean).join(' · ');
          return '<a class="pc-row" href="/contests/' + esc(c.id) + '/">'
            + '<div class="pc-row-main"><div class="pc-row-title">' + esc(c.title) + '</div><div class="pc-row-meta">' + esc(meta) + '</div></div>'
            + '<span class="pc-mono">' + AlfaPlural.participants(c.participants_count) + '</span>'
            + statusPill(c.status)
            + '</a>';
        }).join('')
      : '<div class="pc-empty">Активных конкурсов нет.</div>';

    var allContestsLink = contests.length
      ? '<a class="pc-link-more" href="/' + esc(username) + '/contests/">Все конкурсы компании →</a>'
      : '';

    // Раздел тестов ссылки на полный список не имел, хотя показывает только три
    var allTestsLink = publishedTests.length
      ? '<a class="pc-link-more" href="/' + esc(username) + '/tests/">Все тесты компании →</a>'
      : '';

    // Tests section (up to 3)
    var testRowsHtml = publishedTests.length
      ? publishedTests.slice(0, 3).map(function (t) {
          var sub = t.submissions || 0;
          return '<a class="pc-row" href="' + esc(t.url) + '">'
            + '<div class="pc-row-main"><div class="pc-row-title">' + esc(t.title) + '</div><div class="pc-row-meta">' + AlfaPlural.attempts(sub) + '</div></div>'
            + '</a>';
        }).join('')
      : '<div class="pc-empty">Тестов пока нет.</div>';

    // Rating section
    var ratingHtml = '';
    if (company.avg_rating) {
      var score = company.avg_rating;
      var filled = Math.round(score);
      var starsHtml = [1, 2, 3, 4, 5].map(function (i) { return starSvg(i <= filled); }).join('');
      var dist = company.rating_dist || {};
      var distHtml = [5, 4, 3, 2, 1].map(function (star) {
        var pct = dist[star] || 0;
        return '<div class="pc-dist-row">'
          + '<div class="pc-dist-label">' + star + ' ★</div>'
          + '<div class="pc-dist-track"><div class="pc-dist-fill" style="width:' + pct + '%"></div></div>'
          + '<div class="pc-dist-val">' + pct + '%</div>'
          + '</div>';
      }).join('');
      ratingHtml = '<div class="pc-section">'
        + '<div class="pc-section-title">Рейтинг компании</div>'
        + '<div class="pc-rating-hero">'
        + '<div><div class="pc-rating-score">' + score + '</div>'
        + '<div class="pc-rating-stars">' + starsHtml + '</div>'
        + '<div class="pc-rating-count">' + AlfaPlural.ratings(company.rating_count) + ' от кандидатов</div></div>'
        + '<div class="pc-rating-dist">' + distHtml + '</div>'
        + '</div></div>';
    }

    el.innerHTML = ''
      + '<div class="pc-hero-card">'
      +   '<div class="pc-cover"><svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice"><circle cx="340" cy="20" r="80" fill="rgba(255,255,255,.08)"/><circle cx="60" cy="130" r="100" fill="rgba(255,255,255,.05)"/></svg></div>'
      +   '<div class="pc-hero-body">'
      +     '<div class="pc-hero-av">' + avHtml + '</div>'
      +     '<div class="pc-hero-name">' + esc(company.name) + verBadge + '</div>'
      +     (metaParts.length ? '<div class="pc-hero-meta">' + metaParts.join(' · ') + '</div>' : '')
      +     (company.description ? '<div class="pc-hero-bio">' + esc(company.description) + '</div>' : '')
      +     (tagsHtml ? '<div class="pc-tag-row">' + tagsHtml + '</div>' : '')
      +   '</div>'
      + '</div>'
      // Плашки рейтинга здесь нет: оценка и так стоит рядом с названием,
      // а разбор по звёздам — отдельным разделом внизу страницы
      + '<div class="pc-stats-row">'
      +   '<div class="pc-stat-card"><div class="pc-stat-label">Активных конкурсов</div><div class="pc-stat-value">' + activeContests.length + '</div></div>'
      +   '<div class="pc-stat-card"><div class="pc-stat-label">Тестов</div><div class="pc-stat-value">' + publishedTests.length + '</div></div>'
      +   '<div class="pc-stat-card"><div class="pc-stat-label">Участников привлечено</div><div class="pc-stat-value">' + totalParticipants + '</div></div>'
      + '</div>'
      + '<div class="pc-section">'
      +   '<div class="pc-section-head"><div class="pc-section-title">Активные конкурсы</div>' + allContestsLink + '</div>'
      +   contestRowsHtml
      + '</div>'
      + '<div class="pc-section">'
      +   '<div class="pc-section-head"><div class="pc-section-title">Тесты компании</div>' + allTestsLink + '</div>'
      +   testRowsHtml
      + '</div>'
      + ratingHtml;
  }

  function init() {
    var el = document.getElementById('profile-content');

    Promise.all([
      apiFetch('/api/v1/companies/' + username + '/'),
      apiFetch('/api/v1/companies/' + username + '/contests/'),
      apiFetch('/api/v1/companies/' + username + '/tests/').catch(function () { return { tests: [] }; }),
    ]).then(function (results) {
      render(
        results[0].company,
        results[1].contests || [],
        results[2].tests || []
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
