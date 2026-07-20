const BOOTSTRAP = window.ALFA_APP_BOOTSTRAP || {};
const USERNAME = BOOTSTRAP.username || '';

function csrf() {
  return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { 'X-CSRFToken': csrf(), 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Ошибка');
  return data;
}

const STATUS_META = {
  active:   { label: 'Активен',      bg: 'var(--green-soft)',  color: 'var(--green-text)' },
  review:   { label: 'На проверке',  bg: 'var(--amber-soft)',  color: 'var(--amber-text)' },
  finished: { label: 'Завершён',     bg: 'var(--surface-2)',   color: 'var(--muted)' },
  draft:    { label: 'Черновик',     bg: 'var(--amber-soft)',  color: 'var(--amber-text)' },
};

let contests = [];
let activeFilter = 'all';

function formatDeadline(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function isUrgent(dt, status) {
  if (status !== 'active' || !dt) return false;
  const days = (new Date(dt) - Date.now()) / 86400000;
  return days <= 10;
}

function renderStats() {
  const active = contests.filter(c => c.status === 'active').length;
  const participants = contests.reduce((s, c) => s + (c.participants_count || 0), 0);
  const submissions = contests.reduce((s, c) => s + (c.submissions_count || 0), 0);
  document.getElementById('cc-stats-row').innerHTML = [
    { v: contests.length, l: 'Всего конкурсов' },
    { v: active, l: 'Сейчас активны' },
    { v: participants, l: 'Участников' },
    { v: submissions, l: 'Решений прислано' },
  ].map(s => `
    <div class="cc-stat-card">
      <div class="cc-stat-value" style="font-family:'JetBrains Mono',monospace;">${s.v}</div>
      <div class="cc-stat-label">${s.l}</div>
    </div>`).join('');
}

function renderTable() {
  const filtered = activeFilter === 'all' ? contests : contests.filter(c => c.status === activeFilter);
  document.getElementById('cc-filter-count').textContent = `${filtered.length} из ${contests.length}`;
  const wrap = document.getElementById('cc-table-wrap');

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="cc-empty">
      <div style="font-size:16px;font-weight:700;margin-bottom:6px;">Конкурсов не найдено</div>
      <div style="font-size:14px;color:var(--muted);">Попробуйте другой фильтр или создайте новый конкурс</div>
    </div>`;
    return;
  }

  wrap.innerHTML = `<div class="cc-table">
    <div class="cc-thead">
      <span>Название</span><span>Дедлайн</span><span>Участники</span><span>Решения</span><span>Статус</span><span></span>
    </div>
    ${filtered.map(c => {
      const m = STATUS_META[c.status] || STATUS_META.draft;
      const urgent = isUrgent(c.deadline, c.status);
      return `
      <div class="cc-trow" onclick="location.href='/contests/${c.id}/'">
        <div>
          <div style="font-size:14px;font-weight:600;margin-bottom:2px;">${c.title || 'Без названия'}</div>
          <div style="font-size:12px;color:var(--muted);">${c.category || ''}</div>
        </div>
        <div style="font-size:13px;${urgent ? 'color:var(--brand-text);font-weight:600;' : ''}">${formatDeadline(c.deadline)}</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--text-2);">${c.participants_count || 0}</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--text-2);">${c.submissions_count || 0}</div>
        <div><span style="font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;background:${m.bg};color:${m.color};">${m.label}</span></div>
        <div style="display:flex;gap:6px;" onclick="event.stopPropagation()">
          <button class="cc-icon-btn" title="Решения" onclick="location.href='/cabinet/company/contests/${c.id}/submissions/'">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          </button>
          <button class="cc-icon-btn" title="Редактировать" onclick="location.href='/cabinet/company/contests/${c.id}/edit/'">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </button>
          <button class="cc-icon-btn danger" title="Удалить" onclick="deleteContest(${c.id}, event)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

async function deleteContest(id, e) {
  e.stopPropagation();
  if (!confirm('Удалить конкурс?')) return;
  try {
    await api(`/api/v1/contests/${id}/`, { method: 'DELETE' });
    contests = contests.filter(c => c.id !== id);
    renderStats();
    renderTable();
  } catch (err) {
    alert(err.message);
  }
}

function initFilters() {
  document.querySelectorAll('.cc-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.f;
      document.querySelectorAll('.cc-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderTable();
    });
  });
}

async function loadSidebarCompany() {
  try {
    const data = await api(`/api/v1/companies/${USERNAME}/`);
    const company = data.company || data;
    const name = company.name || USERNAME;
    const el = document.getElementById('sidebar-name');
    const av = document.getElementById('sidebar-avatar');
    if (el) el.textContent = name;
    if (av) av.textContent = name.charAt(0).toUpperCase();
  } catch (_) {}
}

async function load() {
  try {
    const data = await api('/api/v1/contests/company/');
    contests = data.contests || [];
    renderStats();
    renderTable();
  } catch (err) {
    document.getElementById('cc-table-wrap').innerHTML =
      `<div class="cc-empty"><div style="font-size:16px;font-weight:700;margin-bottom:6px;">Ошибка загрузки</div><div style="font-size:14px;color:var(--muted);">${err.message}</div></div>`;
  }
}

initFilters();
loadSidebarCompany();
load();
