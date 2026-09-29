/* Конструктор конкурса: основное, кейс со стартовыми файлами, правила, формат решения. */
import { api, byId, esc, pageData } from 'alfa/core';

const page = pageData();
let contestId = page.contestId || null;

// Значение задаёт core.uploads.MAX_DOCUMENT_SIZE — тот же потолок проверяет сервер
const MAX_ATTACHMENT_MB = page.maxAttachmentMb || 25;
const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

let isDirty = false;
let loadFailed = false;

function markDirty() {
  isDirty = true;
}

/* Сообщения в шапке вместо системного alert() */
function setStatus(message = '', kind = '') {
  const status = byId('ccon-status');
  status.textContent = message;
  status.className = `ccon-status${kind ? ` ${kind}` : ''}`;
}

const SECTIONS = [
  { key: 'basics', label: 'Основное', icon: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>' },
  {
    key: 'case',
    label: 'Кейс и данные',
    icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  },
  {
    key: 'rules',
    label: 'Правила',
    icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  },
  { key: 'submission', label: 'Решение', icon: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/>' },
];
let activeSection = 'basics';

const SUB_TYPES = [
  { key: 'file', title: 'Файл', desc: 'Загрузка PDF, архива и т.п.' },
  { key: 'link', title: 'Ссылка', desc: 'Репозиторий, документ, деплой' },
  { key: 'text', title: 'Текст', desc: 'Развёрнутый текстовый ответ' },
];
let activeSubType = 'file';
let rules = ['Решение принимается только до истечения дедлайна', 'Один участник может отправить решение только 1 раз'];
let attachments = [];
let currentStatus = 'draft';

function renderSections() {
  byId('ccon-sec-list').innerHTML = SECTIONS.map(
    (s, i) => `
    <div class="ccon-sec-item ${s.key === activeSection ? 'active' : ''}" data-sec="${s.key}">
      <span class="ccon-sec-num">${i + 1}</span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${s.icon}</svg>
      ${s.label}
    </div>`,
  ).join('');
}

function switchSection(key) {
  activeSection = key;
  renderSections();
  document.querySelectorAll('.ccon-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === key));
}

function renderRules() {
  byId('ccon-rules-list').innerHTML = rules
    .map(
      (r, i) => `
    <div class="ccon-rule-row">
      <span class="ccon-rule-num">${i + 1}</span>
      <input class="ccon-rule-inp" value="${esc(r)}" data-rule="${i}">
      <button type="button" class="ccon-btn-rm-rule" data-rm="${i}" aria-label="Убрать правило">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>`,
    )
    .join('');
}

function renderTypeCards() {
  byId('ccon-type-cards').innerHTML = SUB_TYPES.map(
    (t) => `
    <div class="ccon-type-card ${t.key === activeSubType ? 'active' : ''}" data-type="${t.key}">
      <div class="ccon-type-title">${t.title}</div>
      <div class="ccon-type-desc">${t.desc}</div>
    </div>`,
  ).join('');
}

function renderAttachments() {
  byId('ccon-attach-list').innerHTML = attachments
    .map(
      (a, i) => `
    <div class="ccon-attach-row">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span class="ccon-attach-name">${esc(a.name)}</span>
      <span class="ccon-attach-size">${esc(a.size)}</span>
      <button type="button" class="ccon-btn-rm-attach" data-ai="${i}" aria-label="Убрать файл">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>`,
    )
    .join('');
}

function updateBadge() {
  const badge = byId('ccon-badge');
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
    title: byId('ccon-title').value,
    category: byId('ccon-cat').value,
    level: byId('ccon-level').value,
    deadline: byId('ccon-deadline').value || null,
    prize: byId('ccon-prize').value,
    excerpt: byId('ccon-excerpt').value,
    case_text: byId('ccon-case').value,
    rules,
    submission_type: activeSubType,
    submission_hint: byId('ccon-sub-hint').value,
  };
}

function fillForm(contest) {
  if (!contest) return;
  byId('ccon-title').value = contest.title || '';
  byId('ccon-name-display').textContent = contest.title || 'Новый конкурс';
  byId('ccon-cat').value = contest.category || 'Backend';
  byId('ccon-level').value = contest.level || 'Middle';
  byId('ccon-deadline').value = contest.deadline ? contest.deadline.slice(0, 10) : '';
  byId('ccon-prize').value = contest.prize || '';
  byId('ccon-excerpt').value = contest.excerpt || '';
  byId('ccon-case').value = contest.case_text || '';
  byId('ccon-sub-hint').value = contest.submission_hint || '';
  if (contest.rules?.length) rules = [...contest.rules];
  if (contest.submission_type) activeSubType = contest.submission_type;
  attachments = (contest.attachments || []).map((a) => ({ id: a.id, name: a.name, size: a.size_display || '' }));
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

  const btn = byId('ccon-save-btn');
  const body = getFormData();
  try {
    btn.textContent = 'Сохранение…';
    btn.disabled = true;
    setStatus('');
    if (contestId) {
      await api.put(`/api/v1/contests/${contestId}/`, body);
    } else {
      const { contest } = await api.post('/api/v1/contests/', body);
      contestId = contest.id;
      history.replaceState(null, '', `/cabinet/company/contests/${contestId}/edit/`);
    }
    await uploadPendingAttachments();
    isDirty = false;
    btn.textContent = '✓ Сохранено';
    btn.classList.add('saved');
    setTimeout(() => {
      btn.textContent = 'Сохранить';
      btn.classList.remove('saved');
      btn.disabled = false;
    }, 1800);
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
  if (!(await doSave())) return;

  const btn = byId('ccon-publish-btn');
  btn.disabled = true;
  try {
    await api.post(`/api/v1/contests/${contestId}/publish/`);
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
    const { contest } = await api.get(`/api/v1/contests/${contestId}/`);
    fillForm(contest);
    isDirty = false;
  } catch {
    // Молчаливый catch показывал пустую форму как будто это новый конкурс
    loadFailed = true;
    setStatus('Не удалось загрузить конкурс. Обновите страницу — не сохраняйте.', 'error');
  }
}

byId('ccon-title').addEventListener('input', (event) => {
  byId('ccon-name-display').textContent = event.target.value || 'Новый конкурс';
});
byId('ccon-save-btn').addEventListener('click', doSave);
byId('ccon-publish-btn').addEventListener('click', doPublish);
byId('ccon-add-rule-btn').addEventListener('click', () => {
  rules.push('');
  renderRules();
  markDirty();
});

// Любое поле формы помечает конкурс изменённым
[
  'ccon-title',
  'ccon-cat',
  'ccon-level',
  'ccon-deadline',
  'ccon-prize',
  'ccon-excerpt',
  'ccon-case',
  'ccon-sub-hint',
].forEach((id) => {
  const el = byId(id);
  el?.addEventListener('input', markDirty);
  el?.addEventListener('change', markDirty);
});

addEventListener('beforeunload', (event) => {
  if (isDirty) event.preventDefault();
});

function addFiles(files) {
  const rejected = [];
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) rejected.push(file.name);
    else attachments.push({ name: file.name, size: `${(file.size / 1024 / 1024).toFixed(1)} МБ`, file });
  }
  renderAttachments();
  markDirty();
  if (rejected.length) setStatus(`Не добавлены (больше ${MAX_ATTACHMENT_MB} МБ): ${rejected.join(', ')}`, 'error');
  else setStatus();
}

const attachInput = byId('ccon-attach-input');
const fileDrop = byId('ccon-file-drop');
attachInput.addEventListener('change', () => {
  addFiles(attachInput.files);
  attachInput.value = '';
});
fileDrop.addEventListener('click', () => attachInput.click());
fileDrop.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') attachInput.click();
});
fileDrop.addEventListener('dragover', (event) => {
  event.preventDefault();
  fileDrop.classList.add('is-dragover');
});
fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('is-dragover'));
fileDrop.addEventListener('drop', (event) => {
  event.preventDefault();
  fileDrop.classList.remove('is-dragover');
  addFiles(event.dataTransfer.files);
});

// Файл, уже сохранённый на сервере, удаляем и на сервере; новый — просто из списка
async function removeAttachment(index) {
  const item = attachments[index];
  if (!item) return;
  if (item.id && contestId) {
    try {
      await api.delete(`/api/v1/contests/${contestId}/attachments/${item.id}/`);
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
  const pending = attachments.filter((a) => a.file && !a.id);
  for (const item of pending) {
    const form = new FormData();
    form.append('file', item.file);
    const { attachment } = await api.post(`/api/v1/contests/${contestId}/attachments/`, form).catch((error) => {
      throw new Error(`«${item.name}»: ${error.message}`);
    });
    item.id = attachment.id;
    item.size = attachment.size_display;
    delete item.file;
  }
  if (pending.length) renderAttachments();
}
byId('ccon-preview-btn').addEventListener('click', async () => {
  // Несохранённые правки в предпросмотр не попадают — сохраняем и не уходим,
  // если сохранение не прошло
  if (isDirty || !contestId) {
    if (!(await doSave())) return;
  }
  if (contestId) location.href = `/contests/${contestId}/`;
});

// Списки перерисовываются целиком — обработчики висят на контейнерах
byId('ccon-sec-list').addEventListener('click', (event) => {
  const item = event.target.closest('[data-sec]');
  if (item) switchSection(item.dataset.sec);
});
byId('ccon-rules-list').addEventListener('input', (event) => {
  const input = event.target.closest('[data-rule]');
  if (!input) return;
  rules[Number(input.dataset.rule)] = input.value;
  markDirty();
});
byId('ccon-rules-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-rm]');
  if (!button) return;
  rules.splice(Number(button.dataset.rm), 1);
  renderRules();
  markDirty();
});
byId('ccon-type-cards').addEventListener('click', (event) => {
  const card = event.target.closest('[data-type]');
  if (!card) return;
  activeSubType = card.dataset.type;
  renderTypeCards();
  markDirty();
});
byId('ccon-attach-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-ai]');
  if (button) removeAttachment(Number(button.dataset.ai));
});

switchSection('basics');
renderRules();
renderTypeCards();
renderAttachments();
load();
