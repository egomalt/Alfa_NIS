/* Ядро админ-панели: общие утилиты, вкладки, модалки, реестр разделов. */
(function () {
  'use strict';

  var CSRF = (function () {
    var m = document.cookie.match(/csrftoken=([^;]+)/);
    if (m) return m[1];
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : '';
  })();

  function el(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { return ''; }
  }

  function apiGet(url) {
    return fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.json().then(function (d) { if (!d.ok) throw new Error(d.message || 'Ошибка'); return d; }); });
  }

  function apiPost(url, body) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
      body: JSON.stringify(body || {}),
    }).then(function (r) { return r.json().then(function (d) { if (!d.ok) throw new Error(d.message || 'Ошибка'); return d; }); });
  }

  // Пилюли статусов
  var STATUS_META = {
    pending:  { label: 'На проверке', bg: 'var(--amber-soft)', color: 'var(--amber-text)' },
    approved: { label: 'Одобрено',    bg: 'var(--green-soft)', color: 'var(--green-text)' },
    rejected: { label: 'Отклонено',   bg: 'var(--red-soft)',   color: 'var(--red-text)' },
    active:   { label: 'Активен',     bg: 'var(--green-soft)', color: 'var(--green-text)' },
    warned:   { label: 'Предупреждён',bg: 'var(--amber-soft)', color: 'var(--amber-text)' },
    banned:   { label: 'Забанен',     bg: 'var(--red-soft)',   color: 'var(--red-text)' },
    new:      { label: 'Новая',       bg: 'var(--amber-soft)', color: 'var(--amber-text)' },
    resolved: { label: 'Рассмотрена', bg: 'var(--green-soft)', color: 'var(--green-text)' },
    dismissed:{ label: 'Отклонена',   bg: 'var(--surface-2)',  color: 'var(--muted)' },
  };

  function pill(status, labelOverride) {
    var m = STATUS_META[status] || { label: status, bg: 'var(--surface-2)', color: 'var(--muted)' };
    return '<span class="ap-status-pill" style="background:' + m.bg + ';color:' + m.color + ';">' + esc(labelOverride || m.label) + '</span>';
  }

  var sections = {};

  function registerSection(name, obj) { sections[name] = obj; }

  function showTab(name) {
    document.querySelectorAll('.ap-tab-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'ap-panel-' + name);
    });
    document.querySelectorAll('.ap-side-link[data-tab]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    window.scrollTo(0, 0);
    if (sections[name] && sections[name].load) sections[name].load();
  }

  // ---- Модалка причины ----
  var reasonCb = null;
  var reasonNeedsDuration = false;
  var durationPerm = false;

  function openReasonModal(title, cb, needsDuration) {
    el('ap-reason-modal-title').textContent = title;
    el('ap-reason-text').value = '';
    reasonCb = cb;
    reasonNeedsDuration = !!needsDuration;
    durationPerm = false;
    el('ap-duration-days').value = 7;
    el('ap-duration-days').disabled = false;
    el('ap-duration-perm-btn').classList.remove('active');
    el('ap-modal-duration-field').style.display = reasonNeedsDuration ? '' : 'none';
    el('ap-reason-modal').classList.add('ap-open');
  }

  function closeReasonModal() {
    el('ap-reason-modal').classList.remove('ap-open');
    reasonCb = null;
  }

  function setupReasonModal() {
    el('ap-reason-cancel').addEventListener('click', closeReasonModal);
    el('ap-reason-confirm').addEventListener('click', function () {
      var text = el('ap-reason-text').value.trim();
      var duration = null;
      if (reasonNeedsDuration) duration = durationPerm ? 'perm' : (el('ap-duration-days').value || '7');
      var cb = reasonCb;
      closeReasonModal();
      if (cb) cb(text, duration);
    });
    el('ap-duration-perm-btn').addEventListener('click', function () {
      durationPerm = !durationPerm;
      this.classList.toggle('active', durationPerm);
      el('ap-duration-days').disabled = durationPerm;
    });
    el('ap-reason-modal').addEventListener('click', function (e) {
      if (e.target === this) closeReasonModal();
    });
  }

  // ---- Модалка документа ----
  function openDocModal(name, url) {
    el('ap-doc-modal-name').textContent = name || 'Документ';
    var openBtn = el('ap-doc-open');
    if (url) { openBtn.href = url; openBtn.style.display = 'inline-flex'; }
    else { openBtn.style.display = 'none'; }
    el('ap-doc-modal').classList.add('ap-open');
  }
  function closeDocModal() { el('ap-doc-modal').classList.remove('ap-open'); }

  function setupDocModal() {
    el('ap-doc-close').addEventListener('click', closeDocModal);
    el('ap-doc-modal').addEventListener('click', function (e) {
      if (e.target === this) closeDocModal();
    });
  }

  // ---- Навигация ----
  function setupTabs() {
    document.querySelectorAll('.ap-side-link[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { showTab(btn.dataset.tab); });
    });
    document.querySelectorAll('[data-goto]').forEach(function (n) {
      n.addEventListener('click', function () { showTab(n.dataset.goto); });
    });
  }

  function setupLogout() {
    var btn = el('ap-logout');
    if (!btn) return;
    btn.addEventListener('click', function () {
      apiPost('/api/v1/auth/signout/', {})
        .then(function () { window.location.href = '/'; })
        .catch(function () { window.location.href = '/'; });
    });
  }

  function setModName() {
    var name = (window.ALFA_ADMIN_BOOTSTRAP || {}).username || 'Admin';
    var nameEl = el('ap-mod-name');
    var avEl = el('ap-mod-avatar');
    if (nameEl) nameEl.textContent = name;
    if (avEl) avEl.textContent = (name || 'A')[0].toUpperCase();
  }

  // Обновляет бейджи сайдбара по данным обзора
  function refreshBadges(stats) {
    var vb = el('ap-badge-verify');
    var rb = el('ap-badge-reports');
    if (vb) { vb.textContent = stats.verify_pending || ''; vb.style.display = stats.verify_pending ? '' : 'none'; }
    if (rb) { rb.textContent = stats.reports_new || ''; rb.style.display = stats.reports_new ? '' : 'none'; }
  }

  // Публичный API ядра
  window.AdminPanel = {
    el: el,
    esc: esc,
    fmtDate: fmtDate,
    apiGet: apiGet,
    apiPost: apiPost,
    pill: pill,
    STATUS_META: STATUS_META,
    registerSection: registerSection,
    showTab: showTab,
    openReasonModal: openReasonModal,
    openDocModal: openDocModal,
    refreshBadges: refreshBadges,
    reloadOverview: function () { if (sections.overview && sections.overview.load) sections.overview.load(); },
  };

  function setupSidebarBurger() {
    var burger = el('ap-sidebar-burger');
    var layout = document.querySelector('.ap-layout');
    if (!burger || !layout) return;
    var close = function () { layout.classList.remove('sidebar-open'); };
    burger.addEventListener('click', function (e) {
      e.stopPropagation();
      layout.classList.toggle('sidebar-open');
    });
    var scrim = el('ap-scrim');
    if (scrim) scrim.addEventListener('click', close);
    // выбор раздела в сайдбаре закрывает панель на мобиле
    document.querySelectorAll('.ap-side-link').forEach(function (b) {
      b.addEventListener('click', close);
    });
  }

  function init() {
    setupTabs();
    setupLogout();
    setupReasonModal();
    setupDocModal();
    setModName();
    setupSidebarBurger();

    // Инициализируем все зарегистрированные разделы
    Object.keys(sections).forEach(function (name) {
      if (sections[name].init) sections[name].init();
    });
    // Грузим активный раздел (обзор). Он же обновит бейджи.
    if (sections.overview && sections.overview.load) sections.overview.load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
