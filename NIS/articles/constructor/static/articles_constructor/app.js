/* Редактор статьи кандидата: обложка, текст с плавающей панелью, теги, сохранение. */
import { api, byId, esc, pageData, promptDialog, toast } from 'alfa/core';

const { articleId, articleData, covers = [] } = pageData();
const MAX_TAGS = 8;
const AUTOSAVE_MS = 30000;
const REMOVE_ICON =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';

const editor = byId('body-editor');
const titleInput = byId('title-input');
const leadInput = byId('lead-input');
const tagInput = byId('tag-input');
const toolbar = byId('floating-toolbar');

const state = {
  id: articleId,
  cover: -1,
  tags: [],
  saving: false,
  dirty: false,
};

const markDirty = () => {
  state.dirty = true;
};

/* Любой сбой сохранения и публикации виден в шапке редактора */
/* Ошибки показываются уведомлением, в шапке — только ход работы: «Сохранение…», «Черновик» */
function setStatus(message = '', kind = '') {
  const status = byId('status-msg');
  if (kind === 'error') {
    toast(message);
    status.textContent = '';
    return;
  }
  status.textContent = message;
  status.title = message;
  status.className = `status-msg${kind ? ` ${kind}` : ''}`;
}

function setCover(index) {
  state.cover = index;
  const hasCover = index >= 0;
  byId('cover-placeholder').hidden = hasCover;
  byId('cover-set-area').hidden = !hasCover;
  if (hasCover) byId('cover-bg').style.background = covers[index];
}

function changeCover(index) {
  setCover(index);
  markDirty();
}

byId('cover-placeholder').addEventListener('click', () => changeCover(0));
byId('cover-placeholder').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') changeCover(0);
});
byId('cover-change').addEventListener('click', () => changeCover((state.cover + 1) % covers.length));
byId('cover-remove').addEventListener('click', () => changeCover(-1));

function autoResize(field) {
  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight}px`;
}

function updateStats() {
  const text = `${titleInput.value} ${editor.innerText}`.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const readTime = Math.max(1, Math.round(words / 200));
  byId('stat-words').textContent = words;
  byId('stat-chars').textContent = editor.innerText.replace(/\s/g, '').length;
  byId('stat-readtime').textContent = readTime;
  byId('stat-paragraphs').textContent = editor.querySelectorAll('p,h2,h3,blockquote').length;
  byId('topbar-meta').textContent = `${words} слов · ~${readTime} мин`;
}

titleInput.addEventListener('input', () => {
  autoResize(titleInput);
  byId('topbar-title').textContent = titleInput.value.trim() || 'Новая статья';
  updateStats();
});
leadInput.addEventListener('input', () => autoResize(leadInput));
editor.addEventListener('input', updateStats);
[titleInput, leadInput, editor].forEach((field) => field.addEventListener('input', markDirty));

function renderTags() {
  byId('tags-wrap').innerHTML = state.tags
    .map(
      (tag, index) => `
    <span class="tag-chip">${esc(tag)}
      <button type="button" data-remove-tag="${index}" aria-label="Убрать тег">${REMOVE_ICON}</button>
    </span>`,
    )
    .join('');
}

byId('tags-wrap').addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-tag]');
  if (!button) return;
  state.tags.splice(Number(button.dataset.removeTag), 1);
  renderTags();
  markDirty();
});

tagInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const value = tagInput.value.trim();
  if (state.tags.includes(value)) setStatus('Такой тег уже есть', 'warn');
  else if (value && state.tags.length >= MAX_TAGS) {
    setStatus(`Больше ${MAX_TAGS} тегов не добавить`, 'warn');
    return;
  } else if (value) {
    state.tags.push(value);
    renderTags();
    markDirty();
    setStatus();
  }
  tagInput.value = '';
});

document.addEventListener('selectionchange', () => {
  const selection = getSelection();
  const rect =
    selection && !selection.isCollapsed && editor.contains(selection.anchorNode)
      ? selection.getRangeAt(0).getBoundingClientRect()
      : null;
  if (!rect || rect.width < 4) {
    toolbar.classList.remove('visible');
    return;
  }
  toolbar.style.left = `${(rect.left + rect.right) / 2}px`;
  toolbar.style.top = `${rect.top + scrollY - 48}px`;
  toolbar.classList.add('visible');
});

/* Команды 'code' в execCommand нет — оборачиваем выделение сами.
   Повторное нажатие снимает оформление */
function toggleInlineCode() {
  const selection = getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const existing = range.commonAncestorContainer.parentElement?.closest('code');
  if (existing && editor.contains(existing)) {
    existing.replaceWith(existing.textContent);
    return;
  }
  const code = document.createElement('code');
  code.textContent = range.toString();
  range.deleteContents();
  range.insertNode(code);
  // Курсор — сразу после вставленного фрагмента
  range.setStartAfter(code);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function wrapInBlock(tag) {
  const selection = getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  const block = document.createElement(tag);
  try {
    range.surroundContents(block);
  } catch {
    // Выделение пересекает границы элементов — переносим содержимое целиком
    block.append(range.extractContents());
    range.insertNode(block);
  }
  selection.removeAllRanges();
  updateStats();
}

/* Окно ввода уводит фокус из редактора — выделение запоминаем и возвращаем */
async function insertLink() {
  const selection = getSelection();
  const range = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  const url = await promptDialog({ title: 'Ссылка', placeholder: 'https://…', type: 'url', confirmLabel: 'Вставить' });
  editor.focus();
  if (range) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
  if (!url) return;
  // Сервер всё равно вычистит опасные схемы, но и в черновике их не держим
  if (!/^(https?:\/\/|mailto:)/i.test(url)) {
    setStatus('Ссылка должна начинаться с http://, https:// или mailto:', 'warn');
    return;
  }
  document.execCommand('createLink', false, url);
}

// mousedown не уводит фокус из редактора, и выделение остаётся на месте
toolbar.addEventListener('mousedown', (event) => event.preventDefault());
toolbar.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  markDirty();
  // Ссылка спрашивает адрес в окне — фокус туда, а не обратно в текст
  if ('link' in button.dataset) {
    insertLink();
    return;
  }
  const { inline, block } = button.dataset;
  if (inline === 'code') toggleInlineCode();
  else if (inline) document.execCommand(inline);
  else if (block) wrapInBlock(block);
  editor.focus();
});

editor.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    save();
    return;
  }
  // Enter в заголовке или цитате начинает обычный абзац, а не продолжает блок
  if (event.key !== 'Enter') return;
  const selection = getSelection();
  const block = selection?.anchorNode?.parentElement?.closest('h2,h3,blockquote');
  if (!block) return;
  event.preventDefault();
  const paragraph = document.createElement('p');
  paragraph.innerHTML = '<br>';
  block.after(paragraph);
  const range = document.createRange();
  range.setStart(paragraph, 0);
  selection.removeAllRanges();
  selection.addRange(range);
});

const collectData = () => ({
  title: titleInput.value,
  excerpt: leadInput.value,
  content: editor.innerHTML,
  tags: state.tags,
  cover_index: state.cover,
  read_time: Number(byId('stat-readtime').textContent) || 1,
});

async function ensureArticleId() {
  if (state.id) return;
  const { article_id: id } = await api.post('/api/v1/articles/create/');
  state.id = id;
  history.replaceState(null, '', `/cabinet/user/articles/${id}/edit/`);
  const preview = byId('btn-preview');
  preview.href = `/cabinet/user/articles/${id}/preview/`;
  preview.target = '_blank';
  preview.removeAttribute('aria-disabled');
}

/* true — только если статья действительно сохранена:
   публикация не должна выкладывать прошлую версию текста */
async function save() {
  if (state.saving) return false;
  state.saving = true;
  const button = byId('btn-save');
  button.textContent = 'Сохраняю…';
  button.disabled = true;
  setStatus();
  try {
    await ensureArticleId();
    await api.patch(`/api/v1/articles/${state.id}/`, collectData());
    state.dirty = false;
    button.textContent = '✓ Сохранено';
    button.classList.add('saved');
    setTimeout(() => {
      button.textContent = 'Сохранить';
      button.classList.remove('saved');
    }, 1800);
    return true;
  } catch (error) {
    button.textContent = 'Сохранить';
    setStatus(error.message || 'Не удалось сохранить', 'error');
    return false;
  } finally {
    button.disabled = false;
    state.saving = false;
  }
}

function showPublished() {
  const badge = byId('status-badge');
  badge.textContent = 'Опубликована';
  badge.className = 'badge-published';
  byId('btn-publish').hidden = true;
}

async function publish() {
  if (!(await save())) return;
  const button = byId('btn-publish');
  button.disabled = true;
  try {
    await api.post(`/api/v1/articles/${state.id}/publish/`);
    showPublished();
    setStatus('Статья опубликована', 'ok');
  } catch (error) {
    setStatus(error.message || 'Не удалось опубликовать', 'error');
  } finally {
    button.disabled = false;
  }
}

byId('btn-save').addEventListener('click', save);
byId('btn-publish').addEventListener('click', publish);

if (articleData) {
  titleInput.value = articleData.title ?? '';
  leadInput.value = articleData.excerpt ?? '';
  editor.innerHTML = typeof articleData.content === 'string' ? articleData.content : '';
  byId('topbar-title').textContent = articleData.title || 'Новая статья';
  state.tags = articleData.tags ?? [];
  // -1 — «без обложки»
  setCover(articleData.cover_index ?? -1);
  if (articleData.status === 'published') showPublished();
} else {
  setCover(Math.floor(Math.random() * covers.length));
}
renderTags();
updateStats();
// Поля заполняются после отрисовки — высоту считаем в следующем кадре
requestAnimationFrame(() => [titleInput, leadInput].forEach(autoResize));

// Текст живёт в странице до сохранения — уход со страницы его теряет
addEventListener('beforeunload', (event) => {
  if (state.dirty) event.preventDefault();
});

// Автосохранение — только если статья уже создана и что-то изменилось
setInterval(() => {
  if (state.dirty && state.id && !state.saving) save();
}, AUTOSAVE_MS);
