/* career.js — navbar user chip helper */
(() => {
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function initial(name) { return (name || '?').trim()[0].toUpperCase(); }

  /* Принимает и сам элемент, и его id. Раньше брала только id, а
     автомонтирование передавало `el.id` — у контейнера без id это пустая
     строка, getElementById('') отдаёт null, и чип молча не появлялся. */
  async function mountUserChip(target) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return;
    try {
      const res = await fetch('/api/v1/auth/me/');
      const data = await res.json();
      if (!data.ok || !data.account) {
        const next = encodeURIComponent(location.pathname);
        el.innerHTML = `
          <a href="/authorization/signin/?next=${next}" class="mini-link-button">Войти</a>
          <a href="/authorization/signup/?next=${next}" class="mini-link-button" style="background:var(--brand);color:var(--on-brand);border-color:transparent;">Регистрация</a>`;
        return;
      }
      const a = data.account;
      if (a.banned) showBanNotice(a);
      const avatarInner = a.avatar
        ? `<img src="${esc(a.avatar)}" alt="">`
        : esc(initial(a.name));
      el.innerHTML = `
        <a href="${esc(a.profile_url)}" class="cr-user-chip">
          <div class="cr-user-avatar">${avatarInner}</div>
          <div>
            <div class="cr-user-name">${esc(a.name || a.username)}</div>
            <div class="cr-user-role">${a.role === 'company' ? 'Компания' : a.role === 'moderator' ? 'Модератор' : 'Кандидат'}</div>
          </div>
        </a>`;
    } catch(_) {}
  }

  /* Плашка блокировки. Заблокированный теперь входит в кабинет — иначе он
     не узнал бы ни причину, ни срок: раньше единственным местом, где это
     писалось, была форма входа, а на неё он попадал только выйдя сам. */
  function showBanNotice(account) {
    if (document.querySelector('.cr-ban-notice')) return;
    const until = account.ban_until
      ? 'До ' + new Date(account.ban_until).toLocaleDateString('ru-RU') + '.'
      : 'Блокировка бессрочная.';
    const notice = document.createElement('div');
    notice.className = 'cr-ban-notice';
    notice.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      + ' stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>'
      + '<div><b>Аккаунт заблокирован.</b> ' + esc(until)
      + (account.ban_reason ? ' Причина: ' + esc(account.ban_reason) : '')
      + '<br><span>Профиль и материалы скрыты от других, публиковать и отправлять ничего нельзя.</span></div>';
    document.body.insertBefore(notice, document.body.firstChild);
  }

  window.careerMountUserChip = mountUserChip;

  // Сам элемент, а не его id: id у контейнера необязателен
  document.querySelectorAll('[data-user-chip]').forEach(mountUserChip);

  /* ── Выход из аккаунта ───────────────────────────────────────────── */
  function csrfToken() {
    const cookie = document.cookie.split(';').map(c => c.trim())
      .find(c => c.startsWith('csrftoken='));
    if (cookie) return decodeURIComponent(cookie.slice('csrftoken='.length));
    return document.querySelector('meta[name="csrf-token"]')?.content || '';
  }

  /* Кнопка выхода живёт только в сайдбарах кабинетов и там же обрабатывается
     (#cp-logout-btn в cabinet/company.js, #ud-logout-btn в cabinet/user.js).
     Дубль в верхней шапке убран — он же тянул лишний запрос /auth/me/. */

  /* ── Бургер верхнего навбара ─────────────────────────────────────── */
  document.querySelectorAll('[data-nav-burger]').forEach(btn => {
    const bar = btn.closest('.cr-navbar');
    if (!bar) return;
    btn.addEventListener('click', () => {
      const open = bar.classList.toggle('nav-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    bar.querySelectorAll('.cr-nav a').forEach(a =>
      a.addEventListener('click', () => bar.classList.remove('nav-open')));
  });

  /* ── Бургер сайдбара кабинета (off-canvas) ───────────────────────── */
  document.querySelectorAll('[data-sidebar-burger]').forEach(btn => {
    const layout = document.querySelector('.ud-layout, .cp-layout');
    if (!layout) return;
    const close = () => layout.classList.remove('sidebar-open');
    btn.addEventListener('click', e => {
      e.stopPropagation();
      layout.classList.toggle('sidebar-open');
    });
    // Закрыть панель: крестиком внутри неё, кликом по затемнению или по пункту меню
    layout.addEventListener('click', e => {
      if (e.target.closest('[data-sidebar-close]')) close();
      else if (e.target.classList.contains('cab-scrim')) close();
      else if (e.target.closest('.ud-side-link, .cp-side-link')) close();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') close();
    });
  });
})();
