const BOOTSTRAP = window.ALFA_APP_BOOTSTRAP || {};
const CONTEST_ID = BOOTSTRAP.contestId;

function csrf() {
  return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

async function apiFetch(url, opts = {}) {
  const headers = { 'X-CSRFToken': csrf() };
  if (opts.body && typeof opts.body === 'string') headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { headers, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Ошибка');
  return data;
}

let contest = null;
let me = null;
let mySubmissions = [];
let hasContact = false;
let chosenFile = null;
const MAX_ATTEMPTS = 1;

async function getMe() {
  try {
    const d = await apiFetch('/api/v1/auth/me/');
    return d.account || null;
  } catch (_) { return null; }
}

function setTab(key) {
  document.querySelectorAll('.cv-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.p === key));
  document.querySelectorAll('.cv-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === key));
}

function renderHero(c) {
  const statusMeta = { active: { label: 'Активен', bg: 'var(--green-soft)', color: 'var(--green-text)' }, finished: { label: 'Завершён', bg: 'var(--surface-2)', color: 'var(--muted)' }, review: { label: 'На проверке', bg: 'var(--amber-soft)', color: 'var(--amber-text)' }, draft: { label: 'Черновик', bg: 'var(--amber-soft)', color: 'var(--amber-text)' } };
  const sm = statusMeta[c.status] || statusMeta.draft;
  document.getElementById('cv-page-title').textContent = `${c.title || 'Конкурс'} — Career`;
  document.getElementById('cv-hero-inner').innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:18px;">
      <div>
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:10px;">
          <span style="width:26px;height:26px;border-radius:7px;background:var(--brand-soft);color:var(--brand-text);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;">${(c.company_name || c.company_username || '?').charAt(0).toUpperCase()}</span>
          <span style="font-size:13.5px;font-weight:600;color:var(--text-2);">${c.company_name || c.company_username || ''}</span>
          <span style="font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;background:${sm.bg};color:${sm.color};">${sm.label}</span>
        </div>
        <h1 style="font-size:30px;font-weight:800;letter-spacing:-.025em;line-height:1.2;margin-bottom:10px;">${c.title || ''}</h1>
        <p style="font-size:15px;color:var(--muted);line-height:1.6;max-width:680px;margin-bottom:20px;">${c.excerpt || ''}</p>
        <div style="display:flex;gap:7px;">
          ${c.category ? `<span style="font-size:12px;font-weight:600;padding:4px 10px;border-radius:7px;background:var(--surface-2);color:var(--text-2);">${c.category}</span>` : ''}
          ${c.level ? `<span style="font-size:12px;font-weight:600;padding:4px 10px;border-radius:7px;background:var(--surface-2);color:var(--text-2);">${c.level}</span>` : ''}
        </div>
      </div>
    </div>
    <div style="display:flex;gap:4px;max-width:1160px;">
      <button class="cv-tab-btn active" data-p="case">Описание кейса</button>
      <button class="cv-tab-btn" data-p="rules">Правила</button>
      <button class="cv-tab-btn" data-p="submit">Отправить решение</button>
    </div>`;
  document.querySelectorAll('.cv-tab-btn').forEach(b => b.addEventListener('click', () => setTab(b.dataset.p)));
}

function renderAttachments(c) {
  if (!c.attachments?.length) return;
  const box = document.getElementById('cv-attach-box');
  box.hidden = false;
  document.getElementById('cv-attach-list').innerHTML = c.attachments.map(a => `
    <div class="cv-attach-file-row">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span style="flex:1;font-size:13.5px;font-weight:600;">${a.name}</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--faint);">${a.size_display || ''}</span>
      <a class="cv-btn-dl" href="${a.file_url}" download>Скачать</a>
    </div>`).join('');
}

function renderCase(c) {
  const el = document.getElementById('cv-case-content');
  el.innerHTML = `<div class="cv-doc">${(c.case_text || '').replace(/\n/g, '<br>')}</div>`;
}

function renderRules(c) {
  const rules = c.rules || [];
  if (rules.length === 0) {
    document.getElementById('cv-rules-list').innerHTML = '<div style="padding:24px;color:var(--muted);font-size:14px;">Правила не заданы</div>';
    return;
  }
  document.getElementById('cv-rules-list').innerHTML = rules.map((r, i) => `
    <div class="cv-rule-item">
      <span class="cv-rule-num">${i + 1}</span>
      <span style="font-size:14.5px;line-height:1.6;color:var(--text-2);padding-top:2px;">${r}</span>
    </div>`).join('');
}

function renderSidebar(c) {
  const statsEl = document.getElementById('cv-stats-rows');
  statsEl.innerHTML = [
    ['Участников', c.participants_count || 0],
    ['Решений прислано', c.submissions_count || 0],
    ['Формат решения', { file: 'Файл', link: 'Ссылка', text: 'Текст' }[c.submission_type] || '—'],
  ].map(([k, v]) => `<div class="cv-stat-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');

  if (c.prize) {
    document.getElementById('cv-prize-card').hidden = false;
    document.getElementById('cv-prize-text').textContent = c.prize;
  }

  if (c.status === 'active' && c.deadline) {
    const card = document.getElementById('cv-countdown-card');
    card.hidden = false;
    const deadline = new Date(c.deadline);
    document.getElementById('cv-deadline-date').textContent = deadline.toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' МСК';
    function tick() {
      const diff = Math.max(0, deadline - Date.now());
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      document.getElementById('cv-countdown').innerHTML = [
        [d, 'дней'], [h, 'часов'], [m, 'минут'],
      ].map(([n, l]) => `<div class="cv-cd-unit"><div class="cv-cd-num">${n}</div><div class="cv-cd-label">${l}</div></div>`).join('');
    }
    tick();
    setInterval(tick, 60000);
  }
}

function renderMySubmissions() {
  const wrap = document.getElementById('cv-my-submissions');
  if (mySubmissions.length === 0) { wrap.hidden = true; return; }
  wrap.hidden = false;
  const STATUS_LABELS = { pending: 'На проверке', accepted: 'Принято', rejected: 'Отклонено' };
  document.getElementById('cv-ms-list').innerHTML = mySubmissions.map(s => `
    <div class="cv-ms-item">
      <span style="color:var(--muted);">${s.submitted_at || ''}</span>
      <span style="margin-left:auto;font-size:11.5px;font-weight:600;padding:3px 8px;border-radius:999px;background:var(--amber-soft);color:var(--amber-text);">${STATUS_LABELS[s.status] || s.status}</span>
    </div>`).join('');
}

function renderSubmitArea() {
  const bannerWrap = document.getElementById('cv-contact-banner-wrap');
  const formWrap = document.getElementById('cv-form-wrap');
  if (!me) {
    formWrap.innerHTML = `<div style="text-align:center;padding:24px;">
      <div style="font-size:15px;font-weight:600;margin-bottom:8px;">Войдите, чтобы участвовать</div>
      <a href="/authorization/signin/" style="display:inline-flex;height:42px;align-items:center;padding:0 20px;border:none;border-radius:10px;background:var(--brand);color:var(--on-brand);font-size:14px;font-weight:600;text-decoration:none;">Войти</a>
    </div>`;
    return;
  }
  bannerWrap.innerHTML = hasContact ? '' : `
    <div class="cv-contact-banner">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>
      <div>
        <div style="font-size:13.5px;font-weight:700;color:var(--text);margin-bottom:3px;">Добавьте контактные данные</div>
        <div style="font-size:12.5px;color:var(--text-2);line-height:1.5;">Для регистрации на конкурс в профиле должен быть email или телефон.</div>
      </div>
      <button onclick="openContactModal()" style="height:32px;padding:0 13px;border:none;border-radius:8px;background:var(--brand);color:var(--on-brand);font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;margin-left:auto;font-family:inherit;">Добавить</button>
    </div>`;

  if (mySubmissions.length >= MAX_ATTEMPTS) {
    formWrap.innerHTML = `<div class="cv-limit-note">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
      Вы уже отправили решение. На этот конкурс действует лимит — максимум ${MAX_ATTEMPTS} попытка на участника.
    </div>`;
    return;
  }

  const type = contest?.submission_type || 'file';
  const hint = contest?.submission_hint || '';

  let inputHtml = '';
  if (type === 'file') {
    inputHtml = `
      <div class="cv-file-drop" id="cv-file-drop" onclick="document.getElementById('cv-sub-file').click()">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-linecap="round" style="margin-bottom:10px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 12v6M9 15l3 3 3-3"/></svg>
        <div style="font-size:14px;font-weight:600;margin-bottom:4px;">Нажмите или перетащите файл</div>
        <div style="font-size:12.5px;color:var(--muted);">${hint || 'PDF, ZIP, DOCX до 25 МБ'}</div>
      </div>
      <input type="file" id="cv-sub-file" style="display:none;">
      <div id="cv-file-chip-wrap"></div>`;
  } else if (type === 'link') {
    inputHtml = `<div class="cv-submit-label">Ссылка на решение</div>
      <input class="cv-submit-input" id="cv-sub-link" placeholder="${hint || 'https://github.com/...'}" type="url">`;
  } else {
    inputHtml = `<div class="cv-submit-label">Текст решения</div>
      <textarea class="cv-submit-input" id="cv-sub-text" placeholder="${hint || 'Опишите ваше решение…'}"></textarea>`;
  }

  formWrap.innerHTML = `
    ${inputHtml}
    <div class="cv-submit-label" style="margin-top:0;">Комментарий <span style="font-weight:400;text-transform:none;color:var(--faint);">— необязательно</span></div>
    <textarea class="cv-submit-input" id="cv-sub-comment" placeholder="Кратко опишите подход"></textarea>
    <button class="cv-btn-submit" id="cv-btn-submit">Отправить решение</button>
    <div style="font-size:12px;color:var(--faint);margin-top:10px;line-height:1.5;">На этот конкурс доступна только ${MAX_ATTEMPTS} попытка — отправляйте, когда будете готовы.</div>`;

  if (type === 'file') {
    document.getElementById('cv-sub-file').addEventListener('change', e => {
      chosenFile = e.target.files[0];
      if (!chosenFile) return;
      document.getElementById('cv-file-chip-wrap').innerHTML = `
        <div class="cv-file-chip">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span style="font-size:13.5px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${chosenFile.name}</span>
          <button onclick="chosenFile=null;document.getElementById('cv-file-chip-wrap').innerHTML='';document.getElementById('cv-file-drop').style.display='';this.parentElement.remove()" style="width:24px;height:24px;border:none;background:transparent;color:var(--faint);cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
        </div>`;
      document.getElementById('cv-file-drop').style.display = 'none';
    });
  }

  document.getElementById('cv-btn-submit').addEventListener('click', submitSolution);
}

async function submitSolution() {
  if (!hasContact) { openContactModal(); return; }
  const type = contest?.submission_type || 'file';
  let submitted = false;
  try {
    const fd = new FormData();
    fd.append('contest', CONTEST_ID);
    fd.append('comment', document.getElementById('cv-sub-comment')?.value || '');
    if (type === 'file') {
      if (!chosenFile) { document.getElementById('cv-file-drop').style.borderColor = 'var(--brand)'; return; }
      fd.append('file', chosenFile);
    } else if (type === 'link') {
      const link = document.getElementById('cv-sub-link')?.value;
      if (!link) return;
      fd.append('link', link);
    } else {
      const text = document.getElementById('cv-sub-text')?.value;
      if (!text) return;
      fd.append('text', text);
    }
    const res = await fetch(`/api/v1/contests/${CONTEST_ID}/submit/`, {
      method: 'POST', headers: { 'X-CSRFToken': csrf() }, body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Ошибка');
    mySubmissions.unshift(data.submission || { status: 'pending', submitted_at: 'только что' });
    chosenFile = null;
    submitted = true;
  } catch (err) {
    alert(err.message);
  }
  if (!submitted) return;
  try { renderMySubmissions(); } catch (_) {}
  try { renderSubmitArea(); } catch (_) {}
  if (contest?.company_username) openRatingModal(contest.company_username);
}

function openRatingModal(companyUsername) {
  let selected = 0;
  const existing = document.getElementById('cv-rating-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'cv-rating-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);padding:16px;';
  modal.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:28px 28px 24px;max-width:360px;width:100%;text-align:center;box-shadow:0 16px 48px rgba(0,0,0,.18);">
      <div style="font-size:22px;margin-bottom:6px;">🎉</div>
      <div style="font-size:17px;font-weight:800;margin-bottom:6px;">Решение отправлено!</div>
      <div style="font-size:14px;color:var(--muted);margin-bottom:20px;">Оцените организацию конкурса от 1 до 5 звёзд</div>
      <div id="cv-stars" style="display:flex;justify-content:center;gap:8px;margin-bottom:20px;">
        ${[1,2,3,4,5].map(i => `<button data-star="${i}" style="font-size:32px;background:none;border:none;cursor:pointer;color:var(--line-2);padding:0;line-height:1;transition:color .1s;">★</button>`).join('')}
      </div>
      <div style="display:flex;gap:10px;">
        <button id="cv-rating-skip" style="flex:1;height:42px;border:1px solid var(--line-2);border-radius:10px;background:var(--surface);color:var(--text-2);font-size:14px;font-weight:500;cursor:pointer;">Пропустить</button>
        <button id="cv-rating-submit" style="flex:1;height:42px;border:none;border-radius:10px;background:var(--brand);color:var(--on-brand);font-size:14px;font-weight:600;cursor:pointer;opacity:.5;" disabled>Отправить</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const stars = modal.querySelectorAll('[data-star]');
  const submitBtn = modal.querySelector('#cv-rating-submit');

  function paintStars(n) {
    stars.forEach(s => {
      s.style.color = Number(s.dataset.star) <= n ? 'var(--amber-text)' : 'var(--line-2)';
    });
  }

  stars.forEach(s => {
    s.addEventListener('mouseenter', () => paintStars(Number(s.dataset.star)));
    s.addEventListener('mouseleave', () => paintStars(selected));
    s.addEventListener('click', () => {
      selected = Number(s.dataset.star);
      paintStars(selected);
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
    });
  });

  modal.querySelector('#cv-rating-skip').addEventListener('click', () => modal.remove());
  submitBtn.addEventListener('click', async () => {
    if (!selected) return;
    submitBtn.disabled = true;
    submitBtn.textContent = '…';
    try {
      await fetch(`/api/v1/companies/${companyUsername}/rate/`, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrf(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: selected }),
      });
    } catch (_) {}
    modal.remove();
  });
}

function openContactModal() { document.getElementById('cv-contact-modal').classList.add('open'); }
function closeContactModal() { document.getElementById('cv-contact-modal').classList.remove('open'); }

async function saveContact() {
  const emailInput = document.getElementById('cv-contact-email');
  const email = emailInput.value.trim();
  if (!email) { emailInput.style.borderColor = 'var(--brand)'; return; }
  try {
    await apiFetch(`/api/v1/candidates/${me.username}/update/`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    me.email = email;
  } catch (_) {}
  hasContact = true;
  closeContactModal();
  renderSubmitArea();
}

async function init() {
  me = await getMe();
  try {
    const data = await apiFetch(`/api/v1/contests/${CONTEST_ID}/`);
    contest = data.contest || data;
    renderHero(contest);
    renderAttachments(contest);
    renderCase(contest);
    renderRules(contest);
    renderSidebar(contest);

    if (me) {
      const subData = await apiFetch(`/api/v1/contests/${CONTEST_ID}/my-submissions/`).catch(() => ({ submissions: [] }));
      mySubmissions = subData.submissions || [];
      hasContact = !!me.email;
    }
    renderMySubmissions();
    renderSubmitArea();
  } catch (err) {
    document.getElementById('cv-hero-inner').innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted);">Конкурс не найден</div>`;
  }
}

document.getElementById('cv-contact-cancel').addEventListener('click', closeContactModal);
document.getElementById('cv-contact-save').addEventListener('click', saveContact);

init();
