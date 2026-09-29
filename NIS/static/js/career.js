/* Поведение, общее для всех страниц: тема, чип аккаунта, плашка блокировки, бургеры меню. */
import { api, esc, formatDate, initial } from 'alfa/core';

const root = document.documentElement;

// Подпись описывает действие кнопки, а не текущую тему
const THEME_LABELS = { light: 'Тёмная тема', dark: 'Светлая тема' };

const syncThemeToggles = () => {
  const label = THEME_LABELS[root.dataset.theme] ?? THEME_LABELS.light;
  for (const button of document.querySelectorAll('[data-theme-toggle]')) {
    const labelNode = button.querySelector('[data-theme-label]');
    if (labelNode) labelNode.textContent = label;
    button.setAttribute('aria-label', label);
    button.title = label;
  }
};

document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-theme-toggle]')) return;
  const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = theme;
  try {
    localStorage.setItem('alfa_theme', theme);
  } catch {
    /* хранилище недоступно */
  }
  syncThemeToggles();
});

syncThemeToggles();

const ROLE_LABELS = { company: 'Компания', moderator: 'Модератор', user: 'Кандидат' };

function showBanNotice(account) {
  if (document.querySelector('.cr-ban-notice')) return;
  const until = account.ban_until ? `До ${formatDate(account.ban_until)}.` : 'Блокировка бессрочная.';
  const reason = account.ban_reason ? ` Причина: ${esc(account.ban_reason)}` : '';
  const notice = document.createElement('div');
  notice.className = 'cr-ban-notice';
  notice.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>
    <div><b>Аккаунт заблокирован.</b> ${esc(until)}${reason}<br>
      <span>Профиль и материалы скрыты от других, публиковать и отправлять ничего нельзя.</span></div>`;
  document.body.prepend(notice);
}

function renderChip(container, account) {
  if (!account) {
    const next = encodeURIComponent(location.pathname);
    container.innerHTML = `
      <a href="/authorization/signin/?next=${next}" class="mini-link-button">Войти</a>
      <a href="/authorization/signup/?next=${next}" class="mini-link-button mini-link-button-primary">Регистрация</a>`;
    return;
  }
  const avatar = account.avatar ? `<img src="${esc(account.avatar)}" alt="">` : esc(initial(account.name));
  container.innerHTML = `
    <a href="${esc(account.profile_url)}" class="cr-user-chip">
      <div class="cr-user-avatar">${avatar}</div>
      <div>
        <div class="cr-user-name">${esc(account.name || account.username)}</div>
        <div class="cr-user-role">${ROLE_LABELS[account.role] ?? ROLE_LABELS.user}</div>
      </div>
    </a>`;
}

async function mountUserChips() {
  const chips = document.querySelectorAll('[data-user-chip]');
  if (!chips.length) return;
  try {
    const { account } = await api.get('/api/v1/auth/me/');
    if (account?.banned) showBanNotice(account);
    chips.forEach((chip) => renderChip(chip, account));
  } catch {
    // Без сети чип просто остаётся пустым — страница работает дальше
  }
}

// Не ждём ответа: меню и тема должны работать сразу
mountUserChips();

for (const button of document.querySelectorAll('[data-nav-burger]')) {
  const bar = button.closest('.cr-navbar');
  if (!bar) continue;
  button.addEventListener('click', () => {
    const open = bar.classList.toggle('nav-open');
    button.setAttribute('aria-expanded', String(open));
  });
  bar
    .querySelectorAll('.cr-nav a')
    .forEach((link) => link.addEventListener('click', () => bar.classList.remove('nav-open')));
}

const cabinetLayout = document.querySelector('.ud-layout, .cp-layout');
if (cabinetLayout) {
  const close = () => cabinetLayout.classList.remove('sidebar-open');
  document.querySelectorAll('[data-sidebar-burger]').forEach((button) =>
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      cabinetLayout.classList.toggle('sidebar-open');
    }),
  );
  // Закрыть: крестиком внутри панели, кликом по затемнению или по пункту меню
  cabinetLayout.addEventListener('click', (event) => {
    if (
      event.target.closest('[data-sidebar-close], .ud-side-link, .cp-side-link') ||
      event.target.classList.contains('cab-scrim')
    )
      close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
}
