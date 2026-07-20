const BOOTSTRAP = window.ALFA_APP_BOOTSTRAP || {};
const USERNAME = BOOTSTRAP.username || '';
const CONTEST_ID = BOOTSTRAP.contestId;

function csrf() {
  return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

async function api(url, opts = {}) {
  const headers = { 'X-CSRFToken': csrf() };
  if (opts.body && typeof opts.body === 'string') headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { headers, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Ошибка');
  return data;
}

const STATUS_META = {
  pending:  { label: 'На проверке', bg: 'var(--amber-soft)', color: 'var(--amber-text)' },
  accepted: { label: 'Принято',     bg: 'var(--green-soft)', color: 'var(--green-text)' },
  rejected: { label: 'Отклонено',   bg: 'var(--red-soft)',   color: 'var(--red-text)' },
};

let submissions = [];
let activeFilter = 'all';

function renderStats() {
  const pending  = submissions.filter(s => s.status === 'pending').length;
  const accepted = submissions.filter(s => s.status === 'accepted').length;
  const rejected = submissions.filter(s => s.status === 'rejected').length;
  document.getElementById('cs-stats').innerHTML = [
    { v: submissions.length, l: 'Всего решений' },
    { v: pending,  l: 'На проверке' },
    { v: accepted, l: 'Принято' },
    { v: rejected, l: 'Отклонено' },
  ].map(s => `
    <div class="cs-stat-card">
      <div class="cs-stat-value">${s.v}</div>
      <div class="cs-stat-label">${s.l}</div>
    </div>`).join('');
}

function filtered() {
  if (activeFilter === 'all')   return submissions;
  if (activeFilter === 'liked') return submissions.filter(s => s.liked);
  return submissions.filter(s => s.status === activeFilter);
}

function renderList() {
  const list = filtered();
  document.getElementById('cs-filter-count').textContent = `${list.length} из ${submissions.length}`;
  const el = document.getElementById('cs-sub-list');
  if (list.length === 0) {
    const msg = activeFilter === 'liked' ? 'Отмечайте ♥ у понравившихся решений, чтобы выбрать из них победителя' : 'Попробуйте другой фильтр';
    el.innerHTML = `<div class="cs-empty"><div style="font-size:16px;font-weight:700;margin-bottom:6px;">Решений не найдено</div><div style="font-size:14px;color:var(--muted);">${msg}</div></div>`;
    return;
  }

  el.innerHTML = list.map(s => {
    const meta = STATUS_META[s.status] || STATUS_META.pending;
    const initial = (s.candidate_name || s.candidate_username || '?').charAt(0).toUpperCase();
    const contactBtn = `<button class="cs-btn-contact" data-action="contact" data-id="${s.id}" title="Контакты кандидата">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      Контакты
    </button>`;
    const actions = s.status === 'pending'
      ? `<button class="cs-btn-accept" data-action="accept" data-id="${s.id}">Принять</button>
         <button class="cs-btn-reject" data-action="reject" data-id="${s.id}">Отклонить</button>`
      : `<span style="font-size:13px;color:var(--muted);">${s.status === 'accepted' ? 'Решение принято' : 'Решение отклонено'}</span>`;
    const winBtn = s.liked
      ? `<button class="cs-btn-winner ${s.winner ? 'is-winner' : ''}" data-action="winner" data-id="${s.id}">${s.winner ? '🏆 Победитель' : 'Сделать победителем'}</button>`
      : '';
    const fileRow = s.file_url
      ? `<div class="cs-file-row">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
           <span style="font-size:13.5px;font-weight:600;flex:1;">${s.file_name || 'Файл'}</span>
           <a class="cs-btn-download" href="${s.file_url}" download>Скачать</a>
         </div>` : '';
    const linkRow = s.link
      ? `<div class="cs-file-row">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
           <a href="${s.link}" target="_blank" style="flex:1;font-size:13.5px;font-weight:600;color:var(--brand-text);word-break:break-all;">${s.link}</a>
         </div>` : '';
    const textRow = s.text ? `<div style="font-size:13.5px;line-height:1.6;color:var(--text-2);margin-bottom:10px;padding:12px 16px;background:var(--bg);border-radius:10px;">${s.text}</div>` : '';

    return `
      <div class="cs-sub-card ${s.liked ? 'liked' : ''}">
        <div class="cs-sub-top">
          <span class="cs-cand-av">${initial}</span>
          <div>
            <div style="font-size:14.5px;font-weight:700;">${s.candidate_name || s.candidate_username} ${s.winner ? '<span style="font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;background:var(--amber-soft);color:var(--amber-text);">🏆 Победитель</span>' : ''}</div>
            <div style="font-size:12.5px;color:var(--muted);">${s.candidate_level || ''} · ${s.submitted_at || ''} · Попытка ${s.attempt || 1}</div>
          </div>
          <button class="cs-btn-like ${s.liked ? 'liked' : ''}" data-action="like" data-id="${s.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${s.liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>
          </button>
          <span class="cs-status-pill" style="background:${meta.bg};color:${meta.color};">${meta.label}</span>
        </div>
        <div class="cs-sub-body">
          ${fileRow}${linkRow}${textRow}
          ${s.comment ? `<div style="font-size:13.5px;line-height:1.6;color:var(--text-2);margin-bottom:14px;">${s.comment}</div>` : ''}
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">${contactBtn}${actions}${winBtn}</div>
        </div>
      </div>`;
  }).join('');
}

async function toggleLike(id) {
  const s = submissions.find(x => x.id === id);
  if (!s) return;
  try {
    await api(`/api/v1/contests/${CONTEST_ID}/submissions/${id}/like/`, { method: 'POST' });
    s.liked = !s.liked;
    renderList();
  } catch (_) { s.liked = !s.liked; renderList(); }
}

async function toggleWinner(id) {
  const s = submissions.find(x => x.id === id);
  if (!s) return;
  try {
    await api(`/api/v1/contests/${CONTEST_ID}/submissions/${id}/winner/`, { method: 'POST' });
    s.winner = !s.winner;
    renderList();
  } catch (_) { s.winner = !s.winner; renderList(); }
}

async function decide(id, status) {
  const s = submissions.find(x => x.id === id);
  if (!s) return;
  try {
    await api(`/api/v1/contests/${CONTEST_ID}/submissions/${id}/`, { method: 'PATCH', body: JSON.stringify({ status }) });
    s.status = status;
  } catch (_) { s.status = status; }
  renderStats();
  renderList();
}

function initFilters() {
  document.querySelectorAll('.cs-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.f;
      document.querySelectorAll('.cs-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderList();
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

async function loadContest() {
  try {
    const data = await api(`/api/v1/contests/${CONTEST_ID}/`);
    const c = data.contest || data;
    document.getElementById('cs-title').textContent = `${c.title || 'Конкурс'} — решения`;
    document.title = `${c.title || 'Конкурс'} — решения — Career`;
    const chip = document.getElementById('cs-status-chip');
    const STATUS = { active: { label: 'Активен', bg: 'var(--green-soft)', color: 'var(--green-text)' }, draft: { label: 'Черновик', bg: 'var(--amber-soft)', color: 'var(--amber-text)' }, review: { label: 'На проверке', bg: 'var(--amber-soft)', color: 'var(--amber-text)' }, finished: { label: 'Завершён', bg: 'var(--surface-2)', color: 'var(--muted)' } };
    const sm = STATUS[c.status] || STATUS.draft;
    chip.style.background = sm.bg;
    chip.style.color = sm.color;
    chip.textContent = sm.label;
    chip.hidden = false;
    if (c.deadline) {
      document.getElementById('cs-deadline-text').textContent = 'Дедлайн ' + new Date(c.deadline).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    }
  } catch (_) {}
}

async function loadSubmissions() {
  try {
    const data = await api(`/api/v1/contests/${CONTEST_ID}/submissions/`);
    submissions = data.submissions || [];
    renderStats();
    renderList();
  } catch (err) {
    document.getElementById('cs-sub-list').innerHTML = `<div class="cs-empty"><div style="font-size:16px;font-weight:700;">Ошибка загрузки</div><div style="font-size:14px;color:var(--muted);">${err.message}</div></div>`;
  }
}

function showContactPopup(btn, s) {
  closeContactPopup();
  const skillsHtml = s.candidate_skills && s.candidate_skills.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;">${s.candidate_skills.map(sk =>
        `<span style="font-size:12px;padding:3px 9px;border-radius:999px;background:var(--brand-soft);color:var(--brand-text);font-weight:500;">${sk}</span>`
      ).join('')}</div>` : '';
  const popup = document.createElement('div');
  popup.id = 'cs-contact-popup';
  popup.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <span style="width:38px;height:38px;border-radius:10px;background:var(--brand-soft);color:var(--brand-text);font-weight:700;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        ${(s.candidate_name || s.candidate_username || '?').charAt(0).toUpperCase()}
      </span>
      <div>
        <div style="font-size:14px;font-weight:700;line-height:1.2;">${s.candidate_name || s.candidate_username}</div>
        <a href="/${s.candidate_username}/" target="_blank" style="font-size:12.5px;color:var(--brand-text);text-decoration:none;">@${s.candidate_username}</a>
      </div>
    </div>
    ${s.candidate_email ? `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
      <a href="mailto:${s.candidate_email}" style="font-size:13px;color:var(--text);text-decoration:none;">${s.candidate_email}</a>
    </div>` : '<div style="font-size:13px;color:var(--muted);margin-bottom:8px;">Email не указан</div>'}
    ${s.candidate_bio ? `<div style="font-size:12.5px;color:var(--text-2);line-height:1.5;margin-bottom:8px;">${s.candidate_bio}</div>` : ''}
    ${skillsHtml}
  `;
  document.body.appendChild(popup);

  const rect = btn.getBoundingClientRect();
  const popupW = 260;
  let left = rect.left + window.scrollX;
  let top = rect.bottom + window.scrollY + 6;
  if (left + popupW > window.innerWidth - 12) left = window.innerWidth - popupW - 12;
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';

  setTimeout(() => document.addEventListener('click', closeContactPopup, { once: true }), 0);
}

function closeContactPopup() {
  document.getElementById('cs-contact-popup')?.remove();
}

document.getElementById('cs-sub-list').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;
  if (action === 'contact') {
    const s = submissions.find(x => x.id === id);
    if (s) showContactPopup(btn, s);
    return;
  }
  if (action === 'like')   toggleLike(id);
  if (action === 'winner') toggleWinner(id);
  if (action === 'accept') decide(id, 'accepted');
  if (action === 'reject') decide(id, 'rejected');
});

initFilters();
loadSidebarCompany();
loadContest();
loadSubmissions();
