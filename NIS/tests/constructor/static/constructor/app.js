(() => {
    const BOOTSTRAP = window.ALFA_APP_BOOTSTRAP || {};
    const CSRF = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

    const state = {
        testId: BOOTSTRAP.testId || null,
        companyUsername: BOOTSTRAP.companyUsername || '',
        title: '',
        description: '',
        pages: [],           // [{localId, id?, order, type, title, content, answers:[{localId, id?, text, is_correct, order}]}]
        currentIndex: -1,    // -1 = meta page
        dirty: false,
        saving: false,
        published: false,
        saveTimer: null,
        localCounter: 0,
    };

    function uid() { return ++state.localCounter; }

    async function apiFetch(url, options = {}) {
        const res = await fetch(url, {
            headers: { 'X-CSRFToken': CSRF(), 'Content-Type': 'application/json', ...(options.headers || {}) },
            ...options,
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || 'Ошибка сервера');
        return data;
    }

    // ── Serialization ─────────────────────────────────────────────────────────

    function serializeState() {
        return {
            company_username: state.companyUsername,
            title: state.title,
            description: state.description,
            pages: state.pages.map((p, i) => ({
                ...(p.id ? { id: p.id } : {}),
                order: i,
                type: p.type,
                title: p.title,
                content: p.content,
                answers: (p.answers || []).map((a, j) => ({
                    ...(a.id ? { id: a.id } : {}),
                    text: a.text,
                    is_correct: a.is_correct,
                    order: j,
                })),
            })),
        };
    }

    function applyTest(test) {
        state.testId = test.id;
        state.title = test.title;
        state.description = test.description;
        state.published = test.status === 'published';
        state.pages = (test.pages || []).map(p => ({
            localId: uid(),
            id: p.id,
            order: p.order,
            type: p.type,
            title: p.title,
            content: p.content,
            answers: (p.answers || []).map(a => ({
                localId: uid(),
                id: a.id,
                text: a.text,
                is_correct: a.is_correct,
                order: a.order,
            })),
        }));
    }

    // ── After save: patch IDs without replacing live objects ──────────────────
    // applyTest() replaces state.pages with new objects, breaking event-listener
    // closures in the editor. patchSavedState() only writes back DB-assigned IDs.

    function patchSavedState(savedTest) {
        state.testId = savedTest.id;
        state.published = savedTest.status === 'published';
        const savedPages = savedTest.pages || [];
        state.pages.forEach((page, i) => {
            const sp = savedPages[i];
            if (!sp) return;
            page.id = sp.id;
            (page.answers || []).forEach((ans, j) => {
                const sa = (sp.answers || [])[j];
                if (sa) ans.id = sa.id;
            });
        });
    }

    // ── Save logic ─────────────────────────────────────────────────────────────

    function markDirty() {
        state.dirty = true;
        setStatus('');
        clearTimeout(state.saveTimer);
        state.saveTimer = setTimeout(save, 1000);
    }

    async function save() {
        if (state.saving || !state.title.trim()) return;
        state.saving = true;
        state.dirty = false;
        setStatus('Сохранение…');
        try {
            const payload = serializeState();
            let data;
            if (state.testId) {
                data = await apiFetch(`/api/tests/${state.testId}/`, { method: 'PUT', body: JSON.stringify(payload) });
            } else {
                data = await apiFetch('/api/tests/create/', { method: 'POST', body: JSON.stringify(payload) });
            }
            patchSavedState(data.test);
            history.replaceState(null, '', `/constructor/${state.testId}/`);
            setStatus('Сохранено');
            syncPublishBtn();
            syncPreviewBtn();
        } catch (e) {
            setStatus('Ошибка сохранения');
            state.dirty = true;
        } finally {
            state.saving = false;
        }
    }

    // ── UI helpers ─────────────────────────────────────────────────────────────

    function setStatus(msg) {
        const el = document.getElementById('cst-save-status');
        if (el) el.textContent = msg;
    }

    function syncPublishBtn() {
        const btn = document.getElementById('cst-publish-btn');
        if (!btn) return;
        if (state.published) {
            btn.textContent = 'Опубликован';
            btn.disabled = true;
        } else {
            btn.textContent = 'Опубликовать';
            btn.disabled = !state.testId || state.pages.length === 0;
        }
    }

    function syncPreviewBtn() {
        const btn = document.getElementById('cst-preview-btn');
        if (btn) btn.disabled = !state.testId;
    }

    function syncBackLink() {
        const link = document.getElementById('cst-back');
        if (link) link.href = state.companyUsername ? `/${state.companyUsername}/tests/` : '/';
    }

    // ── Sidebar ────────────────────────────────────────────────────────────────

    const PAGE_TYPE_LABELS = { text: 'Текст', quiz: 'Вопрос', input: 'Ввод' };

    function renderSidebar() {
        const list = document.getElementById('cst-pages-list');
        if (!list) return;
        list.innerHTML = '';

        // Meta item
        const meta = document.createElement('div');
        meta.className = `cst-page-item${state.currentIndex === -1 ? ' active' : ''}`;
        meta.innerHTML = `<span class="cst-page-num">●</span><span class="cst-page-label">Заголовок и описание</span>`;
        meta.addEventListener('click', () => { state.currentIndex = -1; renderEditor(); renderSidebar(); });
        list.appendChild(meta);

        state.pages.forEach((page, i) => {
            const item = document.createElement('div');
            item.className = `cst-page-item${state.currentIndex === i ? ' active' : ''}`;
            const label = page.title || PAGE_TYPE_LABELS[page.type] || page.type;
            item.innerHTML = `
                <span class="cst-page-num">${i + 1}</span>
                <span class="cst-page-label">${escHtml(label)}</span>
                <button type="button" class="cst-page-del" title="Удалить">✕</button>
            `;
            item.querySelector('.cst-page-del').addEventListener('click', e => {
                e.stopPropagation();
                deletePage(i);
            });
            item.addEventListener('click', () => { state.currentIndex = i; renderEditor(); renderSidebar(); });
            list.appendChild(item);
        });
    }

    // ── Editor ─────────────────────────────────────────────────────────────────

    function renderEditor() {
        const inner = document.getElementById('cst-editor-inner');
        if (!inner) return;

        if (state.currentIndex === -1) {
            renderMetaEditor(inner);
        } else {
            const page = state.pages[state.currentIndex];
            if (!page) { inner.innerHTML = '<div class="cst-empty">Страница не найдена</div>'; return; }
            if (page.type === 'text') renderTextEditor(inner, page);
            else if (page.type === 'quiz') renderQuizEditor(inner, page);
            else if (page.type === 'input') renderInputEditor(inner, page);
        }
    }

    function renderMetaEditor(container) {
        container.innerHTML = `
            <h2 class="cst-section-title">Заголовок и описание теста</h2>
            <div class="cst-field">
                <label class="cst-label">Название теста</label>
                <input id="ed-title" class="cst-input" type="text" maxlength="255" placeholder="Введите название" value="${escAttr(state.title)}">
            </div>
            <div class="cst-field">
                <label class="cst-label">Описание</label>
                <textarea id="ed-desc" class="cst-textarea" placeholder="Краткое описание теста (необязательно)">${escHtml(state.description)}</textarea>
            </div>
        `;
        container.querySelector('#ed-title').addEventListener('input', e => {
            state.title = e.target.value;
            document.getElementById('cst-title').value = state.title;
            markDirty();
        });
        container.querySelector('#ed-desc').addEventListener('input', e => {
            state.description = e.target.value;
            markDirty();
        });
    }

    function renderTextEditor(container, page) {
        let previewing = false;
        container.innerHTML = `
            <span class="cst-type-badge">Текстовая страница</span>
            <div class="cst-field">
                <label class="cst-label">Заголовок страницы</label>
                <input id="ed-page-title" class="cst-input" type="text" maxlength="500" placeholder="Необязательно" value="${escAttr(page.title)}">
            </div>
            <div class="cst-field">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                    <label class="cst-label" style="margin:0">Содержимое (Markdown)</label>
                    <button type="button" id="ed-preview-toggle" class="cst-preview-toggle">Показать предпросмотр</button>
                </div>
                <textarea id="ed-content" class="cst-textarea" style="min-height:200px" placeholder="# Заголовок&#10;&#10;Текст страницы...">${escHtml(page.content)}</textarea>
                <div id="ed-md-preview" class="cst-markdown-preview" hidden></div>
            </div>
        `;
        container.querySelector('#ed-page-title').addEventListener('input', e => {
            page.title = e.target.value;
            markDirty();
            renderSidebar();
        });
        container.querySelector('#ed-content').addEventListener('input', e => {
            page.content = e.target.value;
            markDirty();
            if (previewing) updateMdPreview(e.target.value);
        });
        container.querySelector('#ed-preview-toggle').addEventListener('click', () => {
            previewing = !previewing;
            const contentEl = container.querySelector('#ed-content');
            const previewEl = container.querySelector('#ed-md-preview');
            contentEl.hidden = previewing;
            previewEl.hidden = !previewing;
            container.querySelector('#ed-preview-toggle').textContent = previewing ? 'Редактировать' : 'Показать предпросмотр';
            if (previewing) updateMdPreview(page.content);
        });
    }

    function updateMdPreview(md) {
        const el = document.getElementById('ed-md-preview');
        if (el && window.marked) el.innerHTML = window.marked.parse(md || '');
    }

    function renderQuizEditor(container, page) {
        container.innerHTML = `
            <span class="cst-type-badge">Вопрос с вариантами ответа</span>
            <div class="cst-field">
                <label class="cst-label">Вопрос</label>
                <input id="ed-page-title" class="cst-input" type="text" maxlength="500" placeholder="Формулировка вопроса" value="${escAttr(page.title)}">
            </div>
            <div class="cst-field">
                <label class="cst-label">Дополнительный текст (необязательно)</label>
                <textarea id="ed-content" class="cst-textarea" style="min-height:80px" placeholder="Описание, контекст...">${escHtml(page.content)}</textarea>
            </div>
            <div class="cst-field">
                <label class="cst-label">Варианты ответа</label>
                <p class="cst-correct-hint">Отметьте правильные ответы галочкой. Если отмечено несколько — тип вопроса «множественный выбор».</p>
                <div id="ed-answers" class="cst-answers"></div>
                <button type="button" id="ed-add-answer" class="cst-add-btn">+ Добавить вариант</button>
            </div>
        `;
        container.querySelector('#ed-page-title').addEventListener('input', e => {
            page.title = e.target.value;
            markDirty();
            renderSidebar();
        });
        container.querySelector('#ed-content').addEventListener('input', e => {
            page.content = e.target.value;
            markDirty();
        });
        renderAnswers(container, page);
        container.querySelector('#ed-add-answer').addEventListener('click', () => {
            page.answers.push({ localId: uid(), text: '', is_correct: false, order: page.answers.length });
            renderAnswers(container, page);
            markDirty();
        });
    }

    function renderAnswers(container, page) {
        const answersEl = container.querySelector('#ed-answers');
        if (!answersEl) return;
        answersEl.innerHTML = '';
        page.answers.forEach((ans, i) => {
            const row = document.createElement('div');
            row.className = 'cst-answer-row';
            row.innerHTML = `
                <input type="checkbox" class="cst-answer-check" ${ans.is_correct ? 'checked' : ''} title="Правильный ответ">
                <input type="text" class="cst-answer-text" value="${escAttr(ans.text)}" placeholder="Вариант ответа ${i + 1}" maxlength="1000">
                <button type="button" class="cst-answer-del" title="Удалить">✕</button>
            `;
            row.querySelector('.cst-answer-check').addEventListener('change', e => {
                ans.is_correct = e.target.checked;
                markDirty();
            });
            row.querySelector('.cst-answer-text').addEventListener('input', e => {
                ans.text = e.target.value;
                markDirty();
            });
            row.querySelector('.cst-answer-del').addEventListener('click', () => {
                page.answers.splice(i, 1);
                renderAnswers(container, page);
                markDirty();
            });
            answersEl.appendChild(row);
        });
    }

    function renderInputEditor(container, page) {
        const correctText = page.answers.length > 0 ? page.answers[0].text : '';
        container.innerHTML = `
            <span class="cst-type-badge">Вопрос с текстовым ответом</span>
            <div class="cst-field">
                <label class="cst-label">Вопрос</label>
                <input id="ed-page-title" class="cst-input" type="text" maxlength="500" placeholder="Формулировка вопроса" value="${escAttr(page.title)}">
            </div>
            <div class="cst-field">
                <label class="cst-label">Дополнительный текст (необязательно)</label>
                <textarea id="ed-content" class="cst-textarea" style="min-height:80px" placeholder="Описание, контекст...">${escHtml(page.content)}</textarea>
            </div>
            <div class="cst-field">
                <label class="cst-label">Правильный ответ (регистр не учитывается)</label>
                <input id="ed-correct" class="cst-input" type="text" maxlength="1000" placeholder="Точная формулировка правильного ответа" value="${escAttr(correctText)}">
            </div>
        `;
        container.querySelector('#ed-page-title').addEventListener('input', e => {
            page.title = e.target.value;
            markDirty();
            renderSidebar();
        });
        container.querySelector('#ed-content').addEventListener('input', e => {
            page.content = e.target.value;
            markDirty();
        });
        container.querySelector('#ed-correct').addEventListener('input', e => {
            if (page.answers.length === 0) {
                page.answers.push({ localId: uid(), text: e.target.value, is_correct: true, order: 0 });
            } else {
                page.answers[0].text = e.target.value;
                page.answers[0].is_correct = true;
            }
            markDirty();
        });
    }

    // ── Page operations ────────────────────────────────────────────────────────

    function addPage(type) {
        const page = { localId: uid(), order: state.pages.length, type, title: '', content: '', answers: [] };
        state.pages.push(page);
        state.currentIndex = state.pages.length - 1;
        markDirty();
        renderSidebar();
        renderEditor();
        syncPublishBtn();
    }

    function deletePage(index) {
        state.pages.splice(index, 1);
        if (state.currentIndex >= state.pages.length) {
            state.currentIndex = state.pages.length - 1;
        }
        markDirty();
        renderSidebar();
        renderEditor();
        syncPublishBtn();
    }

    // ── Escape helpers ─────────────────────────────────────────────────────────

    function escHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function escAttr(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    }

    // ── Init ───────────────────────────────────────────────────────────────────

    async function init() {
        syncBackLink();

        const titleInput = document.getElementById('cst-title');
        titleInput?.addEventListener('input', e => {
            state.title = e.target.value;
            markDirty();
        });

        document.querySelectorAll('[data-add]').forEach(btn => {
            btn.addEventListener('click', () => addPage(btn.dataset.add));
        });

        document.getElementById('cst-preview-btn')?.addEventListener('click', async () => {
            if (!state.testId && !state.title.trim()) return;
            if (state.dirty || !state.testId) await save();
            if (state.testId) {
                window.location.assign(`/tests/${state.testId}/?preview=1`);
            }
        });

        document.getElementById('cst-publish-btn')?.addEventListener('click', async () => {
            if (!state.testId || state.published) return;
            if (state.dirty) await save();
            if (!state.testId) return;
            try {
                setStatus('Публикация…');
                await apiFetch(`/api/tests/${state.testId}/publish/`, { method: 'POST' });
                state.published = true;
                setStatus('Опубликован!');
                syncPublishBtn();
            } catch (e) {
                setStatus(e.message || 'Ошибка публикации');
            }
        });

        if (state.testId) {
            try {
                setStatus('Загрузка…');
                const data = await apiFetch(`/api/tests/${state.testId}/`);
                applyTest(data.test);
                setStatus('');
            } catch (e) {
                setStatus('Ошибка загрузки теста');
            }
        }

        if (titleInput) titleInput.value = state.title;
        renderSidebar();
        renderEditor();
        syncPublishBtn();
        syncPreviewBtn();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
