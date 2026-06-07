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
                page_meta: p.page_meta || {},
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
        if (!state.companyUsername && test.company_username) {
            state.companyUsername = test.company_username;
        }
        state.pages = (test.pages || []).map(p => ({
            localId: uid(),
            id: p.id,
            order: p.order,
            type: p.type,
            title: p.title,
            content: p.content,
            page_meta: p.page_meta || {},
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
        if (!state.published) setStatus('');
        syncSaveBtn();
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
                data = await apiFetch(`/api/v1/tests/${state.testId}/`, { method: 'PUT', body: JSON.stringify(payload) });
            } else {
                data = await apiFetch('/api/v1/tests/create/', { method: 'POST', body: JSON.stringify(payload) });
            }
            patchSavedState(data.test);
            history.replaceState(null, '', `/constructor/${state.testId}/`);
            setStatus('Черновик');
            syncSaveBtn();
            syncPublishBtn();
            syncPreviewBtn();
        } catch (e) {
            setStatus('Ошибка сохранения');
            state.dirty = true;
            syncSaveBtn();
        } finally {
            state.saving = false;
        }
    }

    // ── UI helpers ─────────────────────────────────────────────────────────────

    function setStatus(msg) {
        const el = document.getElementById('cst-save-status');
        if (el) el.textContent = msg;
    }

    function syncSaveBtn() {
        const btn = document.getElementById('cst-save-btn');
        if (!btn) return;
        btn.disabled = !state.dirty || !state.title.trim() || state.saving;
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
        const testsHref = state.companyUsername ? `/${state.companyUsername}/tests/` : '/';
        const brand = document.getElementById('cst-back');
        if (brand) brand.href = testsHref;
        const backTests = document.getElementById('cst-back-tests');
        if (backTests) backTests.href = testsHref;
    }

    // ── Sidebar ────────────────────────────────────────────────────────────────

    const PAGE_TYPE_LABELS = { text: 'Текст', quiz: 'Вопрос', input: 'Ввод', code: 'Код' };

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
            else if (page.type === 'code') renderCodeEditor(inner, page);
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

    function renderCodeEditor(container, page) {
        const meta = page.page_meta || {};
        container.innerHTML = `
            <span class="cst-type-badge">Задача с кодом</span>
            <div class="cst-field">
                <label class="cst-label">Условие задачи (Markdown)</label>
                <textarea id="ed-code-content" class="cst-textarea" style="min-height:140px" placeholder="Описание задачи, входные/выходные данные...">${escHtml(page.content)}</textarea>
            </div>
            <div class="cst-field" data-field="title">
                <label class="cst-label">Заголовок (необязательно)</label>
                <input id="ed-code-title" class="cst-input" type="text" maxlength="500" placeholder="Название задачи" value="${escAttr(page.title)}">
            </div>
            <div class="cst-field">
                <label class="cst-label">Язык</label>
                <select id="ed-code-lang" class="cst-select">
                    <option value="python" ${meta.language === 'python' ? 'selected' : ''}>Python 3</option>
                    <option value="javascript" ${meta.language === 'javascript' ? 'selected' : ''}>JavaScript (Node)</option>
                    <option value="cpp" ${meta.language === 'cpp' ? 'selected' : ''}>C++17</option>
                </select>
            </div>
            <div class="cst-field">
                <label class="cst-label">Стартовый код (выдаётся участнику)</label>
                <textarea id="ed-starter-code" class="cst-textarea" style="min-height:100px;font-family:monospace;font-size:0.85rem" placeholder="# Введите стартовый код...">${escHtml(meta.starter_code || '')}</textarea>
            </div>
            <div class="cst-field">
                <label class="cst-label">Ограничение времени (сек)</label>
                <input id="ed-time-limit" class="cst-input" type="number" min="1" max="30" value="${escAttr(String(meta.time_limit || 5))}">
            </div>
            <div class="cst-field">
                <label class="cst-label">Тест-кейсы</label>
                <p class="cst-correct-hint">Образцы видны участнику при запуске. Скрытые — только для финальной проверки.</p>
                <div id="ed-testcases"></div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
                    <button type="button" id="ed-add-tc" class="cst-add-btn">+ Добавить тест-кейс</button>
                    <label class="cst-add-btn" style="cursor:pointer">
                        📁 Загрузить из файла (.json)
                        <input type="file" id="ed-tc-file" accept=".json" hidden>
                    </label>
                    <a href="#" id="ed-tc-format-hint" style="font-size:0.75rem;color:var(--muted);align-self:center;text-decoration:none" title='Формат файла: [{"input":"3 5","expected":"8","is_sample":true}, ...]'>? формат файла</a>
                </div>
            </div>
        `;

        const syncMeta = () => {
            page.page_meta = {
                language: container.querySelector('#ed-code-lang').value,
                starter_code: container.querySelector('#ed-starter-code').value,
                time_limit: parseInt(container.querySelector('#ed-time-limit').value, 10) || 5,
                test_cases: page.page_meta.test_cases || [],
            };
        };

        container.querySelector('#ed-code-content').addEventListener('input', e => { page.content = e.target.value; syncMeta(); markDirty(); });
        container.querySelector('#ed-code-title').addEventListener('input', e => { page.title = e.target.value; syncMeta(); markDirty(); renderSidebar(); });
        container.querySelector('#ed-code-lang').addEventListener('change', () => { syncMeta(); markDirty(); });
        container.querySelector('#ed-starter-code').addEventListener('input', () => { syncMeta(); markDirty(); });
        container.querySelector('#ed-time-limit').addEventListener('input', () => { syncMeta(); markDirty(); });

        renderTestCases(container, page);

        container.querySelector('#ed-add-tc').addEventListener('click', () => {
            page.page_meta.test_cases = page.page_meta.test_cases || [];
            page.page_meta.test_cases.push({ input: '', expected: '', is_sample: false });
            renderTestCases(container, page);
            markDirty();
        });

        container.querySelector('#ed-tc-file').addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    const parsed = JSON.parse(ev.target.result);
                    if (!Array.isArray(parsed)) throw new Error('Ожидается массив');
                    page.page_meta.test_cases = parsed.map(tc => ({
                        input: String(tc.input ?? ''),
                        expected: String(tc.expected ?? ''),
                        is_sample: Boolean(tc.is_sample),
                    }));
                    renderTestCases(container, page);
                    markDirty();
                    setStatus(`Загружено ${page.page_meta.test_cases.length} тест-кейсов`);
                } catch (err) {
                    alert(`Ошибка чтения файла: ${err.message}\n\nОжидается JSON-массив:\n[{"input":"3 5","expected":"8","is_sample":true}, ...]`);
                }
                e.target.value = '';
            };
            reader.readAsText(file);
        });

        container.querySelector('#ed-tc-format-hint').addEventListener('click', e => {
            e.preventDefault();
            alert('Формат файла — JSON-массив:\n\n[\n  {"input": "3 5",  "expected": "8",  "is_sample": true},\n  {"input": "10 20", "expected": "30", "is_sample": false}\n]\n\nПоля:\n• input — входные данные (stdin)\n• expected — ожидаемый вывод (stdout)\n• is_sample — показывать участнику (true/false)');
        });
    }

    function renderTestCases(container, page) {
        const el = container.querySelector('#ed-testcases');
        if (!el) return;
        el.innerHTML = '';
        const cases = (page.page_meta && page.page_meta.test_cases) || [];
        cases.forEach((tc, i) => {
            const block = document.createElement('div');
            block.className = 'cst-tc-block';
            block.innerHTML = `
                <div class="cst-tc-header">
                    <span>Тест #${i + 1}</span>
                    <label><input type="checkbox" class="tc-sample" ${tc.is_sample ? 'checked' : ''}> Образец</label>
                    <button type="button" class="cst-answer-del tc-del" title="Удалить">✕</button>
                </div>
                <div class="cst-tc-fields">
                    <div>
                        <div class="cst-label">Входные данные (stdin)</div>
                        <textarea class="cst-textarea tc-input" style="min-height:70px;font-family:monospace;font-size:0.82rem" placeholder="пусто — если ввод не нужен">${escHtml(tc.input)}</textarea>
                    </div>
                    <div>
                        <div class="cst-label">Ожидаемый вывод (stdout)</div>
                        <textarea class="cst-textarea tc-expected" style="min-height:70px;font-family:monospace;font-size:0.82rem" placeholder="ожидаемый вывод">${escHtml(tc.expected)}</textarea>
                    </div>
                </div>
            `;
            block.querySelector('.tc-input').addEventListener('input', e => { tc.input = e.target.value; markDirty(); });
            block.querySelector('.tc-expected').addEventListener('input', e => { tc.expected = e.target.value; markDirty(); });
            block.querySelector('.tc-sample').addEventListener('change', e => { tc.is_sample = e.target.checked; markDirty(); });
            block.querySelector('.tc-del').addEventListener('click', () => {
                page.page_meta.test_cases.splice(i, 1);
                renderTestCases(container, page);
                markDirty();
            });
            el.appendChild(block);
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
        const defaultMeta = type === 'code'
            ? { language: 'python', starter_code: '', time_limit: 5, test_cases: [] }
            : {};
        const page = { localId: uid(), order: state.pages.length, type, title: '', content: '', answers: [], page_meta: defaultMeta };
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

        document.getElementById('cst-save-btn')?.addEventListener('click', () => save());

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
                await apiFetch(`/api/v1/tests/${state.testId}/publish/`, { method: 'POST' });
                state.published = true;
                setStatus('Опубликован');
                syncSaveBtn();
                syncPublishBtn();
            } catch (e) {
                setStatus(e.message || 'Ошибка публикации');
            }
        });

        if (state.testId) {
            try {
                setStatus('Загрузка…');
                const data = await apiFetch(`/api/v1/tests/${state.testId}/`);
                applyTest(data.test);
                syncBackLink();
                setStatus(data.test.status === 'published' ? 'Опубликован' : 'Черновик');
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
