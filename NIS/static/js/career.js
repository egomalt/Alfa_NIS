/* career.js — navbar user chip helper */
(() => {
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function initial(name) { return (name || '?').trim()[0].toUpperCase(); }

  async function mountUserChip(containerId) {
    const el = document.getElementById(containerId);
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
      const avatarInner = a.avatar
        ? `<img src="${esc(a.avatar)}" alt="">`
        : esc(initial(a.name));
      el.innerHTML = `
        <a href="${esc(a.profile_url)}" class="cr-user-chip">
          <div class="cr-user-avatar">${avatarInner}</div>
          <div>
            <div class="cr-user-name">${esc(a.name || a.username)}</div>
            <div class="cr-user-role">${a.role === 'company' ? 'Компания' : 'Кандидат'}</div>
          </div>
        </a>`;
    } catch(_) {}
  }

  window.careerMountUserChip = mountUserChip;

  // Auto-mount for all elements with data-user-chip attribute
  document.querySelectorAll('[data-user-chip]').forEach(el => mountUserChip(el.id));
})();
