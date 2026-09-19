'use strict';

const BOOTSTRAP = window.ALFA_APP_BOOTSTRAP;
const CSRF = document.querySelector('meta[name="csrf-token"]').content;

let currentArticleId = BOOTSTRAP.articleId;
let activeCover = -1;
let tags = [];
let isSaving = false;
let isDirty = false;

function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function markDirty() { isDirty = true; }

/* Любой сбой сохранения и публикации виден в шапке редактора. */
function setStatus(message, kind = '') {
    const el = document.getElementById('status-msg');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'status-msg' + (kind ? ' ' + kind : '');
}

const COVERS = [
    'linear-gradient(135deg,#1e3a5f 0%,#2d6a9f 100%)',
    'linear-gradient(135deg,#D62839 0%,#7a1020 100%)',
    'linear-gradient(135deg,#134e5e 0%,#1a7a6e 100%)',
    'linear-gradient(135deg,#3d1f6e 0%,#6b3fa0 100%)',
    'linear-gradient(135deg,#2d3a1a 0%,#4a7a2d 100%)',
    'linear-gradient(135deg,#5c3d00 0%,#b07000 100%)',
];

// ── Cover ─────────────────────────────────────────────────────────────────────

function addCover() { setCover(0); }

function setCover(idx) {
    activeCover = idx;
    document.getElementById('cover-placeholder').style.display = 'none';
    document.getElementById('cover-set-area').style.display = '';
    document.getElementById('cover-bg').style.background = COVERS[idx];
    markDirty();
}

function cycleCover() { setCover((activeCover + 1) % COVERS.length); }

function removeCover() {
    activeCover = -1;
    document.getElementById('cover-placeholder').style.display = '';
    document.getElementById('cover-set-area').style.display = 'none';
    markDirty();
}

// ── Auto-resize ───────────────────────────────────────────────────────────────

function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

function onTitleInput(el) {
    autoResize(el);
    document.getElementById('topbar-title').textContent = el.value.trim() || 'Новая статья';
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function updateStats() {
    const editor = document.getElementById('body-editor');
    const title = document.getElementById('title-input').value;
    const text = (title + ' ' + editor.innerText).trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const chars = editor.innerText.replace(/\s/g, '').length;
    const paras = editor.querySelectorAll('p,h2,h3,blockquote').length;
    const rt = Math.max(1, Math.round(words / 200));

    document.getElementById('stat-words').textContent = words;
    document.getElementById('stat-chars').textContent = chars;
    document.getElementById('stat-readtime').textContent = rt;
    document.getElementById('stat-paragraphs').textContent = paras;
    document.getElementById('topbar-meta').textContent = words + ' слов · ~' + rt + ' мин';
}

document.getElementById('body-editor').addEventListener('input', updateStats);
document.getElementById('title-input').addEventListener('input', updateStats);

// ── Tags ──────────────────────────────────────────────────────────────────────

function renderTags() {
    // Тег попадает в разметку: без экранирования кавычка или угловая скобка
    // ломали чип, а тег вида <img onerror=…> исполнялся при открытии статьи
    document.getElementById('tags-wrap').innerHTML = tags.map((t, i) => `
        <span class="tag-chip">${escHtml(t)}
            <button type="button" onclick="removeTag(${i})" aria-label="Убрать тег">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
        </span>
    `).join('');
}

function removeTag(i) { tags.splice(i, 1); renderTags(); markDirty(); }

function handleTagInput(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const val = e.target.value.trim();
    if (!val) { e.target.value = ''; return; }
    if (tags.includes(val)) { setStatus('Такой тег уже есть', 'warn'); e.target.value = ''; return; }
    if (tags.length >= 8) { setStatus('Больше 8 тегов не добавить', 'warn'); return; }
    tags.push(val);
    renderTags();
    markDirty();
    setStatus('');
    e.target.value = '';
}

// ── Floating toolbar ──────────────────────────────────────────────────────────

const toolbar = document.getElementById('floating-toolbar');

document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    const editor = document.getElementById('body-editor');
    if (!sel || sel.isCollapsed || !editor.contains(sel.anchorNode)) {
        toolbar.classList.remove('visible');
        return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width < 4) { toolbar.classList.remove('visible'); return; }
    toolbar.style.left = (rect.left + rect.right) / 2 + 'px';
    toolbar.style.top = rect.top + window.scrollY - 48 + 'px';
    toolbar.classList.add('visible');
});

function fmt(cmd) {
    // Команды 'code' в execCommand не существует — оборачиваем выделение сами
    if (cmd === 'code') { wrapInlineCode(); return; }
    document.execCommand(cmd, false, null);
    document.getElementById('body-editor').focus();
}

function wrapInlineCode() {
    const selection = window.getSelection();
    const editor = document.getElementById('body-editor');
    if (!selection.rangeCount || selection.isCollapsed) { editor.focus(); return; }

    const range = selection.getRangeAt(0);
    // Повторное нажатие снимает оформление
    const existing = range.commonAncestorContainer.parentElement?.closest('code');
    if (existing && editor.contains(existing)) {
        const text = document.createTextNode(existing.textContent);
        existing.replaceWith(text);
        editor.focus();
        return;
    }

    const code = document.createElement('code');
    code.textContent = range.toString();
    range.deleteContents();
    range.insertNode(code);

    // Ставим курсор после вставленного фрагмента
    range.setStartAfter(code);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    editor.focus();
}

function fmtBlock(tag) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const block = document.createElement(tag);
    try {
        range.surroundContents(block);
    } catch (e) {
        block.appendChild(range.extractContents());
        range.insertNode(block);
    }
    sel.removeAllRanges();
    updateStats();
}

function fmtLink() {
    const url = prompt('Введите URL:');
    if (url) document.execCommand('createLink', false, url);
}

document.getElementById('body-editor').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        doSave();
    }
    if (e.key === 'Enter') {
        const sel = window.getSelection();
        if (sel && sel.anchorNode) {
            const block = sel.anchorNode.parentElement?.closest('h2,h3,blockquote');
            if (block) {
                e.preventDefault();
                const p = document.createElement('p');
                p.innerHTML = '<br>';
                block.after(p);
                const r = document.createRange();
                r.setStart(p, 0);
                sel.removeAllRanges();
                sel.addRange(r);
            }
        }
    }
});

// ── Save / Publish ────────────────────────────────────────────────────────────

function collectData() {
    const rt = parseInt(document.getElementById('stat-readtime').textContent, 10) || 1;
    return {
        title: document.getElementById('title-input').value,
        excerpt: document.getElementById('lead-input').value,
        content: document.getElementById('body-editor').innerHTML,
        tags,
        cover_index: activeCover,
        read_time: rt,
    };
}

async function ensureArticleId() {
    if (currentArticleId) return true;
    const res = await fetch('/api/v1/articles/create/', {
        method: 'POST',
        headers: { 'X-CSRFToken': CSRF },
    });
    const data = await res.json();
    if (!data.ok) return false;
    currentArticleId = data.article_id;
    history.replaceState({}, '', `/cabinet/user/articles/${currentArticleId}/edit/`);
    const preview = document.getElementById('btn-preview');
    if (preview) {
        preview.href = `/cabinet/user/articles/${currentArticleId}/preview/`;
        preview.style.opacity = '';
        preview.style.pointerEvents = '';
    }
    return true;
}

/* Возвращает true, только если статья действительно сохранена:
   публикация не должна выкладывать прошлую версию текста. */
async function doSave() {
    if (isSaving) return false;
    isSaving = true;
    const btn = document.getElementById('btn-save');
    btn.textContent = 'Сохраняю…';
    btn.disabled = true;
    setStatus('');

    try {
        if (!await ensureArticleId()) throw new Error('Не удалось создать черновик');

        const res = await fetch(`/api/v1/articles/${currentArticleId}/`, {
            method: 'PATCH',
            headers: { 'X-CSRFToken': CSRF, 'Content-Type': 'application/json' },
            body: JSON.stringify(collectData()),
        });
        const data = await res.json().catch(() => ({}));
        if (!data.ok) throw new Error(data.message || 'Не удалось сохранить');

        isDirty = false;
        btn.textContent = '✓ Сохранено';
        btn.classList.add('saved');
        setTimeout(() => { btn.textContent = 'Сохранить'; btn.classList.remove('saved'); }, 1800);
        return true;
    } catch (err) {
        btn.textContent = 'Сохранить';
        setStatus(err.message || 'Не удалось сохранить', 'error');
        return false;
    } finally {
        btn.disabled = false;
        isSaving = false;
    }
}

async function doPublish() {
    if (!await doSave()) return;

    const btn = document.getElementById('btn-publish');
    btn.disabled = true;
    try {
        const res = await fetch(`/api/v1/articles/${currentArticleId}/publish/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': CSRF },
        });
        const data = await res.json().catch(() => ({}));
        if (!data.ok) throw new Error(data.message || 'Не удалось опубликовать');

        document.getElementById('status-badge').textContent = 'Опубликована';
        document.getElementById('status-badge').className = 'badge-published';
        btn.style.display = 'none';
        setStatus('Статья опубликована', 'ok');
    } catch (err) {
        setStatus(err.message || 'Не удалось опубликовать', 'error');
    } finally {
        btn.disabled = false;
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────

const articleData = BOOTSTRAP.articleData;

if (articleData) {
    if (articleData.title) {
        const t = document.getElementById('title-input');
        t.value = articleData.title;
        autoResize(t);
        document.getElementById('topbar-title').textContent = articleData.title;
    }
    if (articleData.excerpt) {
        const l = document.getElementById('lead-input');
        l.value = articleData.excerpt;
        autoResize(l);
    }
    if (articleData.content) {
        document.getElementById('body-editor').innerHTML =
            typeof articleData.content === 'string' ? articleData.content : '';
    }
    tags = articleData.tags || [];
    renderTags();
    // -1 означает «без обложки» — случайный градиент тут не нужен
    if (articleData.cover_index >= 0) setCover(articleData.cover_index);
    else removeCover();
    if (articleData.status === 'published') {
        document.getElementById('status-badge').textContent = 'Опубликована';
        document.getElementById('status-badge').className = 'badge-published';
        document.getElementById('btn-publish').style.display = 'none';
    }
    updateStats();
} else {
    renderTags();
    setCover(Math.floor(Math.random() * COVERS.length));
}

// Загрузка готового состояния — ещё не правка
isDirty = false;

['title-input', 'lead-input', 'body-editor', 'tag-input'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', markDirty);
});

// Текст живёт в странице до нажатия «Сохранить» — уход со страницы его теряет
window.addEventListener('beforeunload', event => {
    if (!isDirty) return;
    event.preventDefault();
    event.returnValue = '';
});

// Автосохранение раз в 30 с — только если статья создана и что-то изменилось
setInterval(() => {
    if (isDirty && currentArticleId && !isSaving) doSave();
}, 30000);
