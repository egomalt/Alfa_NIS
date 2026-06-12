(() => {
    const BOOTSTRAP = window.ALFA_APP_BOOTSTRAP || {};
    const CSRF = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

    const state = {
        testId: BOOTSTRAP.testId || null,
        companyUsername: BOOTSTRAP.companyUsername || '',
        title: '',
        description: '',
        level: '',
        category: '',
        pages: [],
        currentIndex: -1,
        dirty: false,
        saving: false,
        published: false,
        localCounter: 0,
    };

    const TYPE_LABELS = { info: 'Инфо', text: 'Текст', quiz: 'Выбор', input: 'Ввод', code: 'Код' };

    function uid() { return ++state.localCounter; }

    function makeInfoPage() {
        return { localId: uid(), type: 'info', title: 'Информация о тесте', content: '', answers: [], page_meta: {} };
    }

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
            level: state.level,
            category: state.category,
            // info page is virtual — skip it
            pages: state.pages.filter(p => p.type !== 'info').map((p, i) => ({
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
        state.description = test.description || '';
        state.level = test.level || (test.stats && test.stats.level) || '';
        state.category = test.category || (test.stats && test.stats.category) || '';
        state.published = test.status === 'published';
        if (!state.companyUsername && test.company_username) state.companyUsername = test.company_username;
        state.pages = [
            makeInfoPage(),
            ...(test.pages || []).map(p => ({
                localId: uid(), id: p.id, order: p.order, type: p.type,
                title: p.title, content: p.content, page_meta: p.page_meta || {},
                answers: (p.answers || []).map(a => ({
                    localId: uid(), id: a.id, text: a.text,
                    is_correct: a.is_correct, order: a.order,
                })),
            })),
        ];
    }

    function patchSavedState(savedTest) {
        state.testId = savedTest.id;
        state.published = savedTest.status === 'published';
        const savedPages = savedTest.pages || [];
        // Skip info page (index 0) when matching
        const realPages = state.pages.filter(p => p.type !== 'info');
        realPages.forEach((page, i) => {
            const sp = savedPages[i];
            if (!sp) return;
            page.id = sp.id;
            (page.answers || []).forEach((ans, j) => {
                const sa = (sp.answers || [])[j];
                if (sa) ans.id = sa.id;
            });
        });
    }

    // ── Save ──────────────────────────────────────────────────────────────────

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
            const saveBtn = document.getElementById('cst-save-btn');
            if (saveBtn) { saveBtn.textContent = '✓ Сохранено'; saveBtn.classList.add('saved'); }
            setStatus('Черновик');
            setTimeout(() => {
                const b = document.getElementById('cst-save-btn');
                if (b) { b.textContent = 'Сохранить'; b.classList.remove('saved'); }
            }, 1800);
            syncSaveBtn();
            syncPublishBtn();
            syncPreviewBtn();
        } catch (e) {
            setStatus('Ошибка');
            state.dirty = true;
            syncSaveBtn();
        } finally {
            state.saving = false;
        }
    }

    // ── UI sync ───────────────────────────────────────────────────────────────

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
        const realPages = state.pages.filter(p => p.type !== 'info');
        if (state.published) { btn.textContent = 'Опубликован'; btn.disabled = true; }
        else { btn.textContent = 'Опубликовать'; btn.disabled = !state.testId || realPages.length === 0; }
    }

    function syncPreviewBtn() {
        const btn = document.getElementById('cst-preview-btn');
        if (btn) btn.disabled = !state.testId;
    }

    function syncBackLink() {
        const href = BOOTSTRAP.isCompany ? '/cabinet/company/tests/' : '/cabinet/user/tests/';
        const back = document.getElementById('cst-back');
        const backTests = document.getElementById('cst-back-tests');
        if (back) back.href = href;
        if (backTests) backTests.href = href;
    }

    function syncInfoToggles() {
        document.querySelectorAll('#info-level .toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === state.level);
        });
        document.querySelectorAll('#info-category .toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === state.category);
        });
    }


    // ── Page list (sidebar) ───────────────────────────────────────────────────

    function renderPageList() {
        const list = document.getElementById('cst-pages-list');
        if (!list) return;
        list.innerHTML = '';
        state.pages.forEach((p, i) => {
            const isActive = i === state.currentIndex;
            const isInfo = p.type === 'info';
            const el = document.createElement('div');
            el.className = 'page-item' + (isActive ? ' active' : '');
            const numBg = isActive ? 'var(--brand)' : 'var(--surface-2)';
            const numColor = isActive ? '#fff' : 'var(--text-2)';

            const numContent = isInfo
                ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 1 0 20A10 10 0 0 1 12 2zm1 9h-2v6h2v-6zm0-4h-2v2h2V7z"/></svg>`
                : String(i);

            el.innerHTML = `
                <span class="page-num" style="background:${numBg};color:${numColor};">${numContent}</span>
                <div style="flex:1;min-width:0;">
                    <div class="page-title">${escHtml(p.title || 'Без названия')}</div>
                    <div class="page-type">${TYPE_LABELS[p.type] || p.type}</div>
                </div>
                ${isInfo ? '' : `<button type="button" class="page-del-btn" title="Удалить"
                  style="flex-shrink:0;width:18px;height:18px;border:none;background:none;cursor:pointer;
                  color:var(--faint);font-size:11px;display:flex;align-items:center;justify-content:center;
                  border-radius:4px;opacity:0;transition:opacity .1s,background .1s,color .1s;">✕</button>`}
            `;

            if (!isInfo) {
                el.addEventListener('mouseenter', () => { el.querySelector('.page-del-btn').style.opacity = '1'; });
                el.addEventListener('mouseleave', () => { el.querySelector('.page-del-btn').style.opacity = '0'; });
                el.querySelector('.page-del-btn').addEventListener('click', e => {
                    e.stopPropagation();
                    deletePage(i);
                });
                el.querySelector('.page-del-btn').addEventListener('mouseenter', e => {
                    e.currentTarget.style.background = 'var(--brand-soft)';
                    e.currentTarget.style.color = 'var(--red-text)';
                });
                el.querySelector('.page-del-btn').addEventListener('mouseleave', e => {
                    e.currentTarget.style.background = '';
                    e.currentTarget.style.color = 'var(--faint)';
                });
            }
            el.addEventListener('click', () => switchPage(i));
            list.appendChild(el);
        });
    }

    // ── Editor ────────────────────────────────────────────────────────────────

    function switchPage(idx) {
        state.currentIndex = idx;
        renderPageList();
        renderEditor();
    }

    function setType(type) {
        const page = state.pages[state.currentIndex];
        if (!page || page.type === type || page.type === 'info') return;
        page.type = type;
        page.answers = [];
        page.page_meta = type === 'code'
            ? { language: 'python', time_limit: 5, test_cases: [] }
            : {};
        markDirty();
        renderEditor();
        renderPageList();
    }

    function renderEditor() {
        const page = state.currentIndex >= 0 ? state.pages[state.currentIndex] : null;
        const panelType = page ? page.type : 'empty';

        // Show type tabs only for question pages
        const typeTabs = document.getElementById('type-tabs');
        if (typeTabs) typeTabs.style.display = (panelType === 'info' || panelType === 'empty') ? 'none' : '';

        // Type tabs active state
        document.querySelectorAll('#type-tabs .tab-btn').forEach(btn => {
            btn.disabled = !page || page.type === 'info';
            btn.classList.toggle('active', !!page && btn.dataset.type === page.type);
        });

        // Panels
        document.querySelectorAll('[data-panel]').forEach(p => {
            p.classList.toggle('active', p.dataset.panel === panelType);
        });

        if (!page) return;

        if (page.type === 'info') {
            const descEl = document.getElementById('p-info-desc');
            if (descEl) descEl.value = state.description || '';
            syncInfoToggles();
            return;
        }

        if (page.type === 'text') {
            const t = document.getElementById('p-title');
            const c = document.getElementById('p-content');
            if (t) t.value = page.title || '';
            if (c) c.value = page.content || '';
        } else if (page.type === 'quiz') {
            const q = document.getElementById('p-question-choice');
            if (q) q.value = page.title || '';
            if (!page.answers.length) {
                page.answers.push({ localId: uid(), text: '', is_correct: false, order: 0 });
                page.answers.push({ localId: uid(), text: '', is_correct: false, order: 1 });
                page.answers.push({ localId: uid(), text: '', is_correct: false, order: 2 });
                page.answers.push({ localId: uid(), text: '', is_correct: false, order: 3 });
            }
            renderOptions();
        } else if (page.type === 'input') {
            const q = document.getElementById('p-question-input');
            const a = document.getElementById('p-answer');
            if (q) q.value = page.title || '';
            if (a) a.value = page.answers.length > 0 ? page.answers[0].text : '';
        } else if (page.type === 'code') {
            const q = document.getElementById('p-question-code');
            if (q) q.value = page.content || '';
            const meta = page.page_meta || {};
            const langEl = document.getElementById('ed-language');
            const timeLimitEl = document.getElementById('ed-time-limit');
            if (langEl) langEl.value = meta.language || 'python';
            if (timeLimitEl) timeLimitEl.value = meta.time_limit || 5;
            renderTestCases();
        }
    }

    // ── Options (quiz) ────────────────────────────────────────────────────────

    function renderOptions() {
        const page = state.pages[state.currentIndex];
        const list = document.getElementById('options-list');
        if (!list || !page) return;
        list.innerHTML = '';
        (page.answers || []).forEach((ans, i) => {
            const isCorrect = ans.is_correct;
            const row = document.createElement('div');
            row.className = 'option-row';
            row.innerHTML = `
                <div class="checkbox ${isCorrect ? 'checked' : ''}" data-idx="${i}">
                    ${isCorrect ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>' : ''}
                </div>
                <input class="opt-input ${isCorrect ? 'correct' : ''}" value="${escAttr(ans.text)}" placeholder="Вариант ${i + 1}">
                <button type="button" style="height:40px;width:32px;flex-shrink:0;border:1px solid var(--line);border-radius:8px;background:none;color:var(--faint);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color .15s,border-color .15s;" class="opt-del-btn">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
            `;
            row.querySelector('.checkbox').addEventListener('click', () => {
                ans.is_correct = !ans.is_correct;
                renderOptions();
                markDirty();
            });
            row.querySelector('.opt-input').addEventListener('input', e => {
                ans.text = e.target.value;
                markDirty();
            });
            row.querySelector('.opt-del-btn').addEventListener('click', () => {
                page.answers.splice(i, 1);
                renderOptions();
                markDirty();
            });
            row.querySelector('.opt-del-btn').addEventListener('mouseenter', e => {
                e.currentTarget.style.color = 'var(--red-text)';
                e.currentTarget.style.borderColor = 'var(--red-text)';
            });
            row.querySelector('.opt-del-btn').addEventListener('mouseleave', e => {
                e.currentTarget.style.color = 'var(--faint)';
                e.currentTarget.style.borderColor = 'var(--line)';
            });
            list.appendChild(row);
        });
    }

    // ── Test cases (code) ─────────────────────────────────────────────────────

    function renderTestCases() {
        const page = state.pages[state.currentIndex];
        const list = document.getElementById('tc-list');
        if (!list || !page) return;
        list.innerHTML = '';
        const cases = (page.page_meta && page.page_meta.test_cases) || [];
        if (!cases.length) {
            list.innerHTML = '<div class="empty-tc">Добавьте хотя бы один тест-кейс</div>';
            return;
        }
        cases.forEach((tc, i) => {
            const row = document.createElement('div');
            row.className = 'tc-row';
            row.innerHTML = `
                <div>
                    <div class="tc-mini-label">Ввод (stdin)</div>
                    <input class="inp-sm tc-input" value="${escAttr(tc.input)}" placeholder="пусто — если ввод не нужен">
                </div>
                <div>
                    <div class="tc-mini-label">Ожидаемый вывод</div>
                    <input class="inp-sm tc-expected" value="${escAttr(tc.expected)}" placeholder="ожидаемый stdout">
                </div>
                <button type="button" class="btn-remove-tc">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
            `;
            row.querySelector('.tc-input').addEventListener('input', e => { tc.input = e.target.value; markDirty(); });
            row.querySelector('.tc-expected').addEventListener('input', e => { tc.expected = e.target.value; markDirty(); });
            row.querySelector('.btn-remove-tc').addEventListener('click', () => {
                page.page_meta.test_cases.splice(i, 1);
                renderTestCases();
                markDirty();
            });
            list.appendChild(row);
        });
    }

    // ── Page operations ───────────────────────────────────────────────────────

    function addPage() {
        const realCount = state.pages.filter(p => p.type !== 'info').length;
        state.pages.push({
            localId: uid(), order: state.pages.length, type: 'quiz',
            title: 'Вопрос ' + (realCount + 1), content: '',
            answers: [
                { localId: uid(), text: '', is_correct: false, order: 0 },
                { localId: uid(), text: '', is_correct: false, order: 1 },
                { localId: uid(), text: '', is_correct: false, order: 2 },
                { localId: uid(), text: '', is_correct: false, order: 3 },
            ],
            page_meta: {},
        });
        switchPage(state.pages.length - 1);
        markDirty();
        syncPublishBtn();
    }

    function deletePage(index) {
        if (index === 0 && state.pages[0]?.type === 'info') return;
        state.pages.splice(index, 1);
        if (state.currentIndex >= state.pages.length) state.currentIndex = state.pages.length - 1;
        markDirty();
        renderPageList();
        renderEditor();
        syncPublishBtn();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function escHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function escAttr(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    async function init() {
        syncBackLink();

        // Title input
        const titleInput = document.getElementById('cst-title');
        titleInput?.addEventListener('input', e => {
            state.title = e.target.value;
            markDirty();
        });

        // Theme toggle
        document.getElementById('cst-theme-btn')?.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const next = isDark ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            try { localStorage.setItem('alfa_theme', next); } catch(_) {}
        });

        // Add page
        document.getElementById('cst-add-page')?.addEventListener('click', addPage);

        // Type tabs
        document.querySelectorAll('#type-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => setType(btn.dataset.type));
        });

        // Save
        document.getElementById('cst-save-btn')?.addEventListener('click', () => save());

        // Preview
        document.getElementById('cst-preview-btn')?.addEventListener('click', async () => {
            if (!state.testId && !state.title.trim()) return;
            if (state.dirty || !state.testId) await save();
            if (state.testId) window.location.assign(`/tests/${state.testId}/?preview=1`);
        });

        // Publish
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
                setStatus(e.message || 'Ошибка');
            }
        });

        // Info panel
        document.getElementById('p-info-desc')?.addEventListener('input', e => {
            state.description = e.target.value;
            markDirty();
        });
        document.querySelectorAll('#info-level .toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.level = btn.dataset.value;
                syncInfoToggles();
                markDirty();
            });
        });
        document.querySelectorAll('#info-category .toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.category = btn.dataset.value;
                syncInfoToggles();
                markDirty();
            });
        });

        // Text panel fields
        document.getElementById('p-title')?.addEventListener('input', e => {
            const page = state.pages[state.currentIndex];
            if (!page) return;
            page.title = e.target.value;
            markDirty();
            renderPageList();
        });
        document.getElementById('p-content')?.addEventListener('input', e => {
            const page = state.pages[state.currentIndex];
            if (page) { page.content = e.target.value; markDirty(); }
        });

        // Quiz panel fields
        document.getElementById('p-question-choice')?.addEventListener('input', e => {
            const page = state.pages[state.currentIndex];
            if (!page) return;
            page.title = e.target.value;
            markDirty();
            renderPageList();
        });
        document.getElementById('btn-add-option')?.addEventListener('click', () => {
            const page = state.pages[state.currentIndex];
            if (!page) return;
            page.answers.push({ localId: uid(), text: '', is_correct: false, order: page.answers.length });
            renderOptions();
            markDirty();
        });

        // Input panel fields
        document.getElementById('p-question-input')?.addEventListener('input', e => {
            const page = state.pages[state.currentIndex];
            if (!page) return;
            page.title = e.target.value;
            markDirty();
            renderPageList();
        });
        document.getElementById('p-answer')?.addEventListener('input', e => {
            const page = state.pages[state.currentIndex];
            if (!page) return;
            if (!page.answers.length) {
                page.answers.push({ localId: uid(), text: e.target.value, is_correct: true, order: 0 });
            } else {
                page.answers[0].text = e.target.value;
                page.answers[0].is_correct = true;
            }
            markDirty();
        });

        // Code panel fields
        document.getElementById('p-question-code')?.addEventListener('input', e => {
            const page = state.pages[state.currentIndex];
            if (page) { page.content = e.target.value; markDirty(); }
        });
        document.getElementById('ed-language')?.addEventListener('change', e => {
            const page = state.pages[state.currentIndex];
            if (page) { if (!page.page_meta) page.page_meta = {}; page.page_meta.language = e.target.value; markDirty(); }
        });
        document.getElementById('ed-time-limit')?.addEventListener('input', e => {
            const page = state.pages[state.currentIndex];
            if (page) { if (!page.page_meta) page.page_meta = {}; page.page_meta.time_limit = parseInt(e.target.value, 10) || 5; markDirty(); }
        });
        document.getElementById('ed-add-tc')?.addEventListener('click', () => {
            const page = state.pages[state.currentIndex];
            if (!page) return;
            if (!page.page_meta) page.page_meta = {};
            if (!page.page_meta.test_cases) page.page_meta.test_cases = [];
            page.page_meta.test_cases.push({ input: '', expected: '', is_sample: true });
            renderTestCases();
            markDirty();
        });
        document.getElementById('ed-tc-file')?.addEventListener('change', e => {
            const page = state.pages[state.currentIndex];
            const file = e.target.files[0];
            if (!file || !page) return;
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    const parsed = JSON.parse(ev.target.result);
                    if (!Array.isArray(parsed)) throw new Error('Ожидается массив');
                    if (!page.page_meta) page.page_meta = {};
                    page.page_meta.test_cases = parsed.map(tc => ({
                        input: String(tc.input ?? ''), expected: String(tc.expected ?? ''), is_sample: Boolean(tc.is_sample),
                    }));
                    renderTestCases();
                    markDirty();
                    setStatus(`Загружено ${page.page_meta.test_cases.length} тест-кейсов`);
                } catch (err) {
                    alert(`Ошибка: ${err.message}`);
                }
                e.target.value = '';
            };
            reader.readAsText(file);
        });

        // Load existing test
        if (state.testId) {
            try {
                setStatus('Загрузка…');
                const data = await apiFetch(`/api/v1/tests/${state.testId}/`);
                applyTest(data.test);
                syncBackLink();
                setStatus(data.test.status === 'published' ? 'Опубликован' : 'Черновик');
            } catch (e) {
                setStatus('Ошибка загрузки');
            }
        }

        // New test: always start with info page + auto-name
        if (!state.testId && state.pages.length === 0) {
            state.pages.push(makeInfoPage());
            if (state.companyUsername) {
                try {
                    const resp = await fetch(`/api/v1/tests/?company=${encodeURIComponent(state.companyUsername)}`).then(r => r.json()).catch(() => ({ ok: false }));
                    const count = resp.ok ? (resp.tests || []).length : 0;
                    state.title = `Тест ${count + 1}`;
                } catch (_) {
                    state.title = 'Тест 1';
                }
            } else {
                state.title = 'Тест 1';
            }
            state.dirty = true;
        }

        // Always open the info page first
        state.currentIndex = 0;

        if (titleInput) titleInput.value = state.title;
        renderPageList();
        renderEditor();
        syncPublishBtn();
        syncPreviewBtn();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
