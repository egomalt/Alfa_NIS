const BOOTSTRAP = window.ALFA_APP_BOOTSTRAP || {};
const USERNAME = BOOTSTRAP.username || '';
const CONTEST_ID = BOOTSTRAP.contestId || null;

function csrf() {
  return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { 'X-CSRFToken': csrf(), 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Ошибка');
  return data;
}

const SECTIONS = [
  { key: 'basics',     label: 'Основное',      icon: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>' },
  { key: 'case',       label: 'Кейс и данные', icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' },
  { key: 'rules',      label: 'Правила',        icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' },
  { key: 'submission', label: 'Решение',        icon: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/>' },
];
let activeSection = 'basics';

const SUB_TYPES = [
  { key: 'file', title: 'Файл',   desc: 'Загрузка PDF, архива и т.п.' },
  { key: 'link', title: 'Ссылка', desc: 'Репозиторий, документ, деплой' },
  { key: 'text', title: 'Текст',  desc: 'Развёрнутый текстовый ответ' },
];
let activeSubType = 'file';
let rules = ['Решение принимается только до истечения дедлайна', 'Один участник может отправить решение только 1 раз'];
let attachments = [];
let currentStatus = 'draft';

function renderSections() {
  document.getElementById('ccon-sec-list').innerHTML = SECTIONS.map((s, i) => `
    <div class="ccon-sec-item ${s.key === activeSection ? 'active' : ''}" data-sec="${s.key}">
      <span class="ccon-sec-num">${i + 1}</span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${s.icon}</svg>
      ${s.label}
    </div>`).join('');
  document.querySelectorAll('.ccon-sec-item').forEach(el => {
    el.addEventListener('click', () => switchSection(el.dataset.sec));
  });
}

function switchSection(key) {
  activeSection = key;
  renderSections();
  document.querySelectorAll('.ccon-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === key));
}

function renderRules() {
  document.getElementById('ccon-rules-list').innerHTML = rules.map((r, i) => `
    <div class="ccon-rule-row">
      <span class="ccon-rule-num">${i + 1}</span>
      <input class="ccon-rule-inp" value="${r.replace(/"/g, '&quot;')}" data-rule="${i}">
      <button class="ccon-btn-rm-rule" data-rm="${i}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>`).join('');
  document.querySelectorAll('[data-rule]').forEach(inp => {
    inp.addEventListener('input', () => { rules[parseInt(inp.dataset.rule)] = inp.value; });
  });
  document.querySelectorAll('[data-rm]').forEach(btn => {
    btn.addEventListener('click', () => { rules.splice(parseInt(btn.dataset.rm), 1); renderRules(); });
  });
}

function renderTypeCards() {
  document.getElementById('ccon-type-cards').innerHTML = SUB_TYPES.map(t => `
    <div class="ccon-type-card ${t.key === activeSubType ? 'active' : ''}" data-type="${t.key}">
      <div style="font-size:13.5px;font-weight:700;margin-bottom:3px;">${t.title}</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.4;">${t.desc}</div>
    </div>`).join('');
  document.querySelectorAll('.ccon-type-card').forEach(card => {
    card.addEventListener('click', () => { activeSubType = card.dataset.type; renderTypeCards(); });
  });
}

function renderAttachments() {
  document.getElementById('ccon-attach-list').innerHTML = attachments.map((a, i) => `
    <div class="ccon-attach-row">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span style="flex:1;font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.name}</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--faint);">${a.size}</span>
      <button class="ccon-btn-rm-attach" data-ai="${i}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>`).join('');
  document.querySelectorAll('[data-ai]').forEach(btn => {
    btn.addEventListener('click', () => { attachments.splice(parseInt(btn.dataset.ai), 1); renderAttachments(); });
  });
}

function updateBadge() {
  const badge = document.getElementById('ccon-badge');
  if (currentStatus === 'active') {
    badge.className = 'ccon-badge-pub';
    badge.textContent = 'Опубликован';
  } else {
    badge.className = 'ccon-badge-draft';
    badge.textContent = 'Черновик';
  }
}

function getFormData() {
  return {
    title: document.getElementById('ccon-title').value,
    category: document.getElementById('ccon-cat').value,
    level: document.getElementById('ccon-level').value,
    deadline: document.getElementById('ccon-deadline').value || null,
    prize: document.getElementById('ccon-prize').value,
    excerpt: document.getElementById('ccon-excerpt').value,
    case_text: document.getElementById('ccon-case').value,
    rules,
    submission_type: activeSubType,
    submission_hint: document.getElementById('ccon-sub-hint').value,
  };
}

function fillForm(contest) {
  if (!contest) return;
  document.getElementById('ccon-title').value = contest.title || '';
  document.getElementById('ccon-name-display').textContent = contest.title || 'Новый конкурс';
  document.getElementById('ccon-cat').value = contest.category || 'Backend';
  document.getElementById('ccon-level').value = contest.level || 'Middle';
  document.getElementById('ccon-deadline').value = contest.deadline ? contest.deadline.slice(0, 10) : '';
  document.getElementById('ccon-prize').value = contest.prize || '';
  document.getElementById('ccon-excerpt').value = contest.excerpt || '';
  document.getElementById('ccon-case').value = contest.case_text || '';
  document.getElementById('ccon-sub-hint').value = contest.submission_hint || '';
  if (contest.rules?.length) rules = [...contest.rules];
  if (contest.submission_type) activeSubType = contest.submission_type;
  if (contest.attachments?.length) {
    attachments = contest.attachments.map(a => ({ name: a.name, size: a.size_display || '' }));
  }
  currentStatus = contest.status || 'draft';
  updateBadge();
  renderRules();
  renderTypeCards();
  renderAttachments();
}

async function doSave() {
  const btn = document.getElementById('ccon-save-btn');
  const body = getFormData();
  try {
    btn.textContent = 'Сохранение…';
    btn.disabled = true;
    let res;
    if (CONTEST_ID) {
      res = await api(`/api/v1/contests/${CONTEST_ID}/`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      res = await api('/api/v1/contests/', { method: 'POST', body: JSON.stringify(body) });
      if (res.contest?.id) {
        history.replaceState({}, '', `/cabinet/company/contests/${res.contest.id}/edit/`);
        BOOTSTRAP.contestId = res.contest.id;
      }
    }
    btn.textContent = '✓ Сохранено';
    btn.classList.add('saved');
    setTimeout(() => { btn.textContent = 'Сохранить'; btn.classList.remove('saved'); btn.disabled = false; }, 1800);
  } catch (err) {
    btn.textContent = 'Сохранить';
    btn.disabled = false;
    alert(err.message);
  }
}

async function doPublish() {
  await doSave();
  const id = CONTEST_ID || BOOTSTRAP.contestId;
  if (!id) { alert('Сначала сохраните конкурс'); return; }
  try {
    await api(`/api/v1/contests/${id}/publish/`, { method: 'POST' });
    currentStatus = 'active';
    updateBadge();
  } catch (err) {
    alert(err.message);
  }
}

async function load() {
  if (!CONTEST_ID) return;
  try {
    const data = await api(`/api/v1/contests/${CONTEST_ID}/`);
    fillForm(data.contest || data);
  } catch (_) {}
}

document.getElementById('ccon-title').addEventListener('input', e => {
  document.getElementById('ccon-name-display').textContent = e.target.value || 'Новый конкурс';
});
document.getElementById('ccon-save-btn').addEventListener('click', doSave);
document.getElementById('ccon-publish-btn').addEventListener('click', doPublish);
document.getElementById('ccon-add-rule-btn').addEventListener('click', () => { rules.push(''); renderRules(); });
document.getElementById('ccon-attach-input').addEventListener('change', e => {
  Array.from(e.target.files).forEach(f => {
    attachments.push({ name: f.name, size: (f.size / 1024 / 1024).toFixed(1) + ' МБ', file: f });
  });
  e.target.value = '';
  renderAttachments();
});
document.getElementById('ccon-preview-btn').addEventListener('click', () => {
  const id = CONTEST_ID || BOOTSTRAP.contestId;
  if (id) location.href = `/contests/${id}/`;
  else alert('Сохраните конкурс для предпросмотра');
});

renderSections();
switchSection('basics');
renderRules();
renderTypeCards();
renderAttachments();
load();
