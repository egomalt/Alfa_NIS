/* Все тесты компании — публичный список, парный к списку конкурсов.
 *
 * API отдаёт анониму только опубликованные тесты, поэтому фильтруем
 * по уровню, а не по статусу.
 */
(function () {
  'use strict';

  var username = (window.ALFA_APP_BOOTSTRAP || {}).username || '';
  var allTests = [];
  var activeFilter = 'all';

  var LEVEL_LABELS = { junior: 'Junior', middle: 'Middle', senior: 'Senior' };
  var CAT_LABELS = {
    frontend: 'Frontend', backend: 'Backend', devops: 'DevOps',
    analytics: 'Аналитика', other: 'Другое',
  };

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function apiFetch(url) {
    return fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.ok) throw new Error(d.message || 'Ошибка'); return d; });
  }

  function questionsLabel(n) {
    return AlfaPlural.withNumber(n, 'вопрос', 'вопроса', 'вопросов');
  }

  function levelPill(level) {
    if (!LEVEL_LABELS[level]) return '';
    return '<span class="ct-level ct-level-' + level + '">' + LEVEL_LABELS[level] + '</span>';
  }

  function filterTests(f) {
    if (f === 'all') return allTests;
    return allTests.filter(function (t) { return t.level === f; });
  }

  function renderList() {
    var list = filterTests(activeFilter);
    var countEl = document.getElementById('ct-count');
    if (countEl) countEl.textContent = list.length + ' из ' + allTests.length;

    var wrap = document.getElementById('ct-list');
    if (!list.length) {
      wrap.innerHTML = '<div class="ct-empty">'
        + '<div class="ct-empty-title">' + (allTests.length ? 'Тестов не найдено' : 'Тестов пока нет') + '</div>'
        + '<div class="ct-empty-sub">' + (allTests.length ? 'Попробуйте другой фильтр' : 'Компания ещё не опубликовала ни одного задания') + '</div>'
        + '</div>';
      return;
    }

    wrap.innerHTML = list.map(function (t) {
      var meta = [CAT_LABELS[t.category] || t.category, questionsLabel(t.page_count)]
        .filter(Boolean).join(' · ');
      return '<a class="ct-card" href="' + esc(t.url) + '">'
        + '<div class="ct-card-main">'
        +   '<div class="ct-card-title">' + esc(t.title || 'Без названия') + '</div>'
        +   '<div class="ct-card-meta">' + esc(meta) + '</div>'
        + '</div>'
        + '<span class="ct-mono">' + AlfaPlural.attempts(t.submissions) + '</span>'
        + levelPill(t.level)
        + '</a>';
    }).join('');
  }

  function initFilters() {
    document.querySelectorAll('.ct-filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeFilter = btn.dataset.f;
        document.querySelectorAll('.ct-filter-btn').forEach(function (b) {
          b.classList.toggle('active', b.dataset.f === activeFilter);
        });
        renderList();
      });
    });
  }

  function init() {
    var backLink = document.getElementById('ct-back-link');
    if (backLink) backLink.href = '/' + username + '/';

    initFilters();

    apiFetch('/api/v1/companies/' + username + '/tests/').then(function (data) {
      var company = data.company || {};
      // Владелец видит здесь и свои черновики — на публичной странице они лишние
      allTests = (data.tests || []).filter(function (t) { return t.status === 'published'; });

      var avEl = document.getElementById('ct-company-av');
      if (avEl) {
        if (company.avatar_url) {
          avEl.innerHTML = '<img src="' + esc(company.avatar_url) + '" alt="">';
        } else {
          avEl.textContent = (company.name || '?')[0].toUpperCase();
        }
      }

      var titleEl = document.getElementById('ct-page-title');
      if (titleEl) {
        var badge = company.is_verified ? '<span class="ct-verified">✓</span>' : '';
        titleEl.innerHTML = 'Тесты «' + esc(company.name || username) + '» ' + badge;
      }

      renderList();
    }).catch(function (e) {
      var wrap = document.getElementById('ct-list');
      if (wrap) wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);">' + esc(e.message) + '</div>';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
