const BOOTSTRAP = window.ALFA_APP_BOOTSTRAP || {};

async function getMe() {
  try {
    const res = await fetch('/api/v1/auth/me/');
    const data = await res.json();
    return data.account || null;
  } catch (_) { return null; }
}

async function loadContests(statusFilter, catFilter) {
  const params = new URLSearchParams();
  if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
  if (catFilter && catFilter !== 'all') params.set('category', catFilter);
  const res = await fetch('/api/v1/contests/catalog/?' + params);
  const data = await res.json();
  return data.contests || [];
}

const STATUS_META = {
  active:   { label: 'Активен',     bg: 'var(--green-soft)',  color: 'var(--green-text)' },
  finished: { label: 'Завершён',    bg: 'var(--surface-2)',   color: 'var(--muted)' },
  review:   { label: 'На проверке', bg: 'var(--amber-soft)',  color: 'var(--amber-text)' },
};

const CAT_KEYS = {
  backend: 'backend', frontend: 'frontend', devops: 'devops',
  analytics: 'аналитика', design: 'дизайн',
};

let me = null;
let activeStatus = 'all';
let activeCat = 'all';
let contests = [];

function isUrgent(deadline, status) {
  if (status !== 'active' || !deadline) return false;
  return (new Date(deadline) - Date.now()) / 86400000 <= 10;
}

function formatDeadline(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function renderGrid() {
  const filtered = contests.filter(c => {
    const matchStatus = activeStatus === 'all' || c.status === activeStatus;
    const matchCat = activeCat === 'all' ||
      (c.category || '').toLowerCase() === (CAT_KEYS[activeCat] || activeCat);
    return matchStatus && matchCat;
  });

  document.getElementById('cat-count').textContent = filtered.length + ' конкурсов';
  const grid = document.getElementById('cat-grid');

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty">
        <div class="empty-title">Конкурсов не найдено</div>
        <div class="empty-sub">Попробуйте изменить фильтры</div>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(c => {
    const sm = STATUS_META[c.status] || STATUS_META.finished;
    const urgent = isUrgent(c.deadline, c.status);
    const initial = (c.company_name || c.company_username || '?').charAt(0).toUpperCase();
    const deadlineLabel = c.status === 'active' ? 'до ' + formatDeadline(c.deadline) : formatDeadline(c.deadline);

    return `
      <div class="card">
        <div class="card-header">
          <span class="card-co-icon">${initial}</span>
          <span class="card-co-name">${c.company_name || c.company_username || ''}</span>
          <span class="card-status" style="background:${sm.bg};color:${sm.color};">${sm.label}</span>
        </div>
        <div class="card-title">${c.title || 'Конкурс'}</div>
        <div class="card-desc">${c.excerpt || ''}</div>
        <div class="card-facts">
          <span class="card-deadline ${urgent ? 'urgent' : ''}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            ${deadlineLabel}
          </span>
          <span class="card-category">${c.category || ''}</span>
        </div>
        ${c.prize ? `
        <div class="card-prize">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4"/></svg>
          ${c.prize}
        </div>` : ''}
        <button class="btn-start" onclick="joinContest(${c.id}, '${c.status}')">
          ${c.status === 'active' ? 'Участвовать' : 'Смотреть решения'}
        </button>
      </div>`;
  }).join('');
}

window.joinContest = function(id, status) {
  if (status !== 'active') { location.href = `/contests/${id}/`; return; }
  if (!me) { document.getElementById('cat-auth-modal').classList.add('open'); return; }
  location.href = `/contests/${id}/`;
};

function initFilters() {
  document.querySelectorAll('[data-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeStatus = btn.dataset.status;
      document.querySelectorAll('[data-status]').forEach(b => b.classList.toggle('active', b === btn));
      renderGrid();
    });
  });
  document.querySelectorAll('[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCat = btn.dataset.cat;
      document.querySelectorAll('[data-cat]').forEach(b => b.classList.toggle('active', b === btn));
      renderGrid();
    });
  });
  document.getElementById('cat-modal-close').addEventListener('click', () => {
    document.getElementById('cat-auth-modal').classList.remove('open');
  });
}

async function init() {
  me = await getMe();
  try {
    contests = await loadContests();
    renderGrid();
  } catch (err) {
    document.getElementById('cat-grid').innerHTML = `
      <div class="empty">
        <div class="empty-title">Ошибка загрузки</div>
        <div class="empty-sub">${err.message}</div>
      </div>`;
  }
}

initFilters();
init();
