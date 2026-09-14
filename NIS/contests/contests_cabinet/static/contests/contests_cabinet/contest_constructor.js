const BOOTSTRAP = window.ALFA_APP_BOOTSTRAP || {};
const USERNAME = BOOTSTRAP.username || '';
let contestId = BOOTSTRAP.contestId || null;

// Приходит из шаблона, значение задаёт core.uploads.MAX_DOCUMENT_SIZE
const MAX_ATTACHMENT_MB = BOOTSTRAP.maxAttachmentMb || 25;
const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

function csrf() {
  return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let isDirty = false;
let loadFailed = false;

function markDirty() { isDirty = true; }

/* Сообщения вместо alert(): ошибку сохранения раньше показывали модальным
   окном браузера, а результат успешной загрузки — никак. */
function setStatus(message, kind = '') {
  const el = document.getElementById('ccon-status');
  if (!el) return;
  el.textContent = message || '';
  el.className = 'ccon-status' + (kind ? ' ' + kind : '');
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
      <input class="ccon-rule-inp" value="${esc(r)}" data-rule="${i}">
      <button type="button" class="ccon-btn-rm-rule" data-rm="${i}" aria-label="Убрать правило">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>`).join('');
  document.querySelectorAll('[data-rule]').forEach(inp => {
    inp.addEventListener('input', () => { rules[parseInt(inp.dataset.rule, 10)] = inp.value; markDirty(); });
  });
  document.querySelectorAll('[data-rm]').forEach(btn => {
    btn.addEventListener('click', () => {
      rules.splice(parseInt(btn.dataset.rm, 10), 1);
      renderRules();
      markDirty();
    });
  });
}

function renderTypeCards() {
  document.getElementById('ccon-type-cards').innerHTML = SUB_TYPES.map(t => `
    <div class="ccon-type-card ${t.key === activeSubType ? 'active' : ''}" data-type="${t.key}">
      <div class="ccon-type-title">${t.title}</div>
      <div class="ccon-type-desc">${t.desc}</div>
    </div>`).join('');
  document.querySelectorAll('.ccon-type-card').forEach(card => {
    card.addEventListener('click', () => { activeSubType = card.dataset.type; renderTypeCards(); markDirty(); });
  });
}

function renderAttachments() {
  document.getElementById('ccon-attach-list').innerHTML = attachments.map((a, i) => `
    <div class="ccon-attach-row">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span class="ccon-attach-name">${esc(a.name)}</span>
      <span class="ccon-attach-size">${esc(a.size)}</span>
      <button type="button" class="ccon-btn-rm-attach" data-ai="${i}" aria-label="Убрать файл">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>`).join('');
  document.querySelectorAll('[data-ai]').forEach(btn => {
    btn.addEventListener('click', () => removeAttachment(parseInt(btn.dataset.ai)));
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
  attachments = (contest.attachments || []).map(a => ({ id: a.id, name: a.name, size: a.size_display || '' }));
  currentStatus = contest.status || 'draft';
  updateBadge();
  renderRules();
  renderTypeCards();
  renderAttachments();
}

/* Возвращает true, только если конкурс сохранён вместе с файлами. */
async function doSave() {
  // Если конкурс не удалось загрузить, форма пустая — сохранение затёрло бы
  // название, кейс и правила пустыми строками
  if (loadFailed) {
    setStatus('Конкурс не загрузился — обновите страницу, иначе сохранение сотрёт данные', 'error');
    return false;
  }

  const btn = document.getElementById('ccon-save-btn');
  const body = getFormData();
  try {
    btn.textContent = 'Сохранение…';
    btn.disabled = true;
    setStatus('');
    let res;
    if (contestId) {
      res = await api(`/api/v1/contests/${contestId}/`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      res = await api('/api/v1/contests/', { method: 'POST', body: JSON.stringify(body) });
      if (res.contest?.id) {
        contestId = res.contest.id;
        history.replaceState({}, '', `/cabinet/company/contests/${contestId}/edit/`);
      }
    }
    await uploadPendingAttachments();
    isDirty = false;
    btn.textContent = '✓ Сохранено';
    btn.classList.add('saved');
    setTimeout(() => { btn.textContent = 'Сохранить'; btn.classList.remove('saved'); btn.disabled = false; }, 1800);
    return true;
  } catch (err) {
    btn.textContent = 'Сохранить';
    btn.disabled = false;
    setStatus(err.message || 'Не удалось сохранить', 'error');
    return false;
  }
}

async function doPublish() {
  // Публикация шла даже после неудачного сохранения — в бой уходила прошлая версия
  if (!await doSave()) return;

  const btn = document.getElementById('ccon-publish-btn');
  btn.disabled = true;
  try {
    await api(`/api/v1/contests/${contestId}/publish/`, { method: 'POST' });
    currentStatus = 'active';
    updateBadge();
    setStatus('Конкурс опубликован', 'ok');
  } catch (err) {
    setStatus(err.message || 'Не удалось опубликовать', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function load() {
  if (!contestId) return;
  try {
    const data = await api(`/api/v1/contests/${contestId}/`);
    fillForm(data.contest || data);
    isDirty = false;
  } catch (err) {
    // Молчаливый catch показывал пустую форму как будто это новый конкурс
    loadFailed = true;
    setStatus('Не удалось загрузить конкурс. Обновите страницу — не сохраняйте.', 'error');
  }
}

document.getElementById('ccon-title').addEventListener('input', e => {
  document.getElementById('ccon-name-display').textContent = e.target.value || 'Новый конкурс';
});
document.getElementById('ccon-save-btn').addEventListener('click', doSave);
document.getElementById('ccon-publish-btn').addEventListener('click', doPublish);
document.getElementById('ccon-add-rule-btn').addEventListener('click', () => { rules.push(''); renderRules(); markDirty(); });

// Любое поле формы помечает конкурс изменённым
['ccon-title', 'ccon-cat', 'ccon-level', 'ccon-deadline', 'ccon-prize',
 'ccon-excerpt', 'ccon-case', 'ccon-sub-hint'].forEach(id => {
  const el = document.getElementById(id);
  el?.addEventListener('input', markDirty);
  el?.addEventListener('change', markDirty);
});

window.addEventListener('beforeunload', event => {
  if (!isDirty) return;
  event.preventDefault();
  event.returnValue = '';
});

document.getElementById('ccon-attach-input').addEventListener('change', e => {
  const rejected = [];
  Array.from(e.target.files).forEach(f => {
    // Сервер режет вложения на MAX_DOCUMENT_SIZE. Раньше подсказка обещала
    // 100 МБ, файл спокойно добавлялся в список и отваливался уже при сохранении
    if (f.size > MAX_ATTACHMENT_BYTES) { rejected.push(f.name); return; }
    attachments.push({ name: f.name, size: (f.size / 1024 / 1024).toFixed(1) + ' МБ', file: f });
  });
  e.target.value = '';
  renderAttachments();
  markDirty();
  setStatus(rejected.length
    ? `Не добавлены (больше ${MAX_ATTACHMENT_MB} МБ): ${rejected.join(', ')}`
    : '', rejected.length ? 'error' : '');
});

// Файл, уже сохранённый на сервере, удаляем и на сервере; новый — просто из списка
async function removeAttachment(index) {
  const item = attachments[index];
  if (!item) return;
  if (item.id && contestId) {
    try {
      await api(`/api/v1/contests/${contestId}/attachments/${item.id}/`, { method: 'DELETE' });
    } catch (err) {
      setStatus(err.message || 'Не удалось удалить файл', 'error');
      return;
    }
  }
  attachments.splice(index, 1);
  renderAttachments();
}

// Файлы уходят отдельными multipart-запросами: конкурс сохраняется JSON-ом,
// вложить в него файл нельзя
async function uploadPendingAttachments() {
  const pending = attachments.filter(a => a.file && !a.id);
  for (const item of pending) {
    const form = new FormData();
    form.append('file', item.file);
    const resp = await fetch(`/api/v1/contests/${contestId}/attachments/`, {
      method: 'POST',
      headers: { 'X-CSRFToken': csrf() },
      credentials: 'same-origin',
      body: form,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.message || `Не удалось загрузить «${item.name}».`);
    item.id = data.attachment.id;
    item.size = data.attachment.size_display;
    delete item.file;
  }
  if (pending.length) renderAttachments();
}
document.getElementById('ccon-preview-btn').addEventListener('click', async () => {
  // Несохранённые правки в предпросмотр не попадают — сохраняем и не уходим,
  // если сохранение не прошло
  if (isDirty || !contestId) {
    if (!await doSave()) return;
  }
  if (contestId) location.href = `/contests/${contestId}/`;
});

renderSections();
switchSection('basics');
renderRules();
renderTypeCards();
renderAttachments();
load();
