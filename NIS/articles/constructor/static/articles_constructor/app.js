'use strict';

const BOOTSTRAP = window.ALFA_APP_BOOTSTRAP;
const CSRF = document.querySelector('meta[name="csrf-token"]').content;

let currentArticleId = BOOTSTRAP.articleId;
let activeCover = -1;
let tags = [];
let isSaving = false;

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
}

function cycleCover() { setCover((activeCover + 1) % COVERS.length); }

function removeCover() {
    activeCover = -1;
    document.getElementById('cover-placeholder').style.display = '';
    document.getElementById('cover-set-area').style.display = 'none';
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
    document.getElementById('tags-wrap').innerHTML = tags.map((t, i) => `
        <span class="tag-chip">${t}
            <button onclick="removeTag(${i})">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
        </span>
    `).join('');
}

function removeTag(i) { tags.splice(i, 1); renderTags(); }

function handleTagInput(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const val = e.target.value.trim();
    if (val && !tags.includes(val) && tags.length < 8) {
        tags.push(val);
        renderTags();
    }
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
    document.execCommand(cmd, false, null);
    document.getElementById('body-editor').focus();
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
    const rt = parseInt(document.getElementById('stat-readtime').textContent) || 1;
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
    return true;
}

async function doSave() {
    if (isSaving) return;
    isSaving = true;
    const btn = document.getElementById('btn-save');
    btn.textContent = 'Сохраняю...';
    btn.disabled = true;

    try {
        if (!await ensureArticleId()) throw new Error();

        const res = await fetch(`/api/v1/articles/${currentArticleId}/`, {
            method: 'PATCH',
            headers: { 'X-CSRFToken': CSRF, 'Content-Type': 'application/json' },
            body: JSON.stringify(collectData()),
        });
        if ((await res.json()).ok) {
            btn.textContent = '✓ Сохранено';
            btn.classList.add('saved');
            setTimeout(() => { btn.textContent = 'Сохранить'; btn.classList.remove('saved'); }, 1800);
        } else {
            btn.textContent = 'Сохранить';
        }
    } catch {
        btn.textContent = 'Сохранить';
    } finally {
        btn.disabled = false;
        isSaving = false;
    }
}

async function doPublish() {
    await doSave();
    if (!currentArticleId) return;

    const res = await fetch(`/api/v1/articles/${currentArticleId}/publish/`, {
        method: 'POST',
        headers: { 'X-CSRFToken': CSRF },
    });
    if ((await res.json()).ok) {
        document.getElementById('status-badge').textContent = 'Опубликована';
        document.getElementById('status-badge').className = 'badge-published';
        document.getElementById('btn-publish').style.display = 'none';
    }
}

function deleteDraft() {
    if (!confirm('Удалить черновик?')) return;
    window.location.href = '/cabinet/user/articles/';
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
    setCover(articleData.cover_index >= 0 ? articleData.cover_index : Math.floor(Math.random() * COVERS.length));
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

// Auto-save every 30s только если статья уже создана
setInterval(() => {
    const hasContent = document.getElementById('title-input').value ||
        document.getElementById('body-editor').innerText.trim();
    if (hasContent && currentArticleId) doSave();
}, 30000);
