/* Прохождение теста.
 * Ответы живут в памяти вкладки и уходят на сервер одним запросом при
 * завершении, поэтому уход со страницы подтверждается предупреждением.
 */
(() => {
    const BOOTSTRAP = window.ALFA_APP_BOOTSTRAP || {};
    const CSRF = () => document.querySelector('meta[name="csrf-token"]')?.content || '';
    const testId = BOOTSTRAP.testId;
    const isPreview = !!BOOTSTRAP.isPreview;

    // Страницы, за которые начисляются баллы
    const SCORED_TYPES = ['quiz', 'input', 'code'];

    const state = {
        test: null,
        pages: [],
        currentIndex: 0,
        answers: {},       // {pageId: value}  value = [] для quiz, строка для input, {code,…} для code
        submitted: false,
        results: null,
        score: 0,
        total: 0,
    };

    async function apiFetch(url, options = {}) {
        const res = await fetch(url, {
            headers: { 'X-CSRFToken': CSRF(), 'Content-Type': 'application/json', ...(options.headers || {}) },
            ...options,
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || 'Ошибка сервера');
        return data;
    }

    const el = id => document.getElementById(id);

    function escHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function md(text) {
        return window.marked ? window.marked.parse(text || '') : escHtml(text);
    }

    const ICON_PREV = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 12H5M11 5l-6 7 6 7"/></svg>';
    const ICON_NEXT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M13 5l6 7-6 7"/></svg>';
    const ICON_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>';
    const ICON_RUN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>';
    const ICON_UPLOAD = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 17V5M7 10l5-5 5 5M4 19h16"/></svg>';
    const ICON_RESET = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';

    // ── Состояние ответов ─────────────────────────────────────────────────────

    function isScored(page) {
        return SCORED_TYPES.includes(page.type);
    }

    /* «Отвечено» — это именно данный ответ, а не просто тронутое поле.
       Для задачи на код засчитывается только проверенное решение: набранный,
       но не отправленный код баллов не даёт. */
    function isAnswered(page) {
        const value = state.answers[page.id];
        if (value === undefined) return false;
        if (page.type === 'quiz') return Array.isArray(value) && value.length > 0;
        if (page.type === 'input') return typeof value === 'string' && value.trim() !== '';
        if (page.type === 'code') return value.type === 'code';
        return false;
    }

    function scoredPages() {
        return state.pages.filter(isScored);
    }

    // Номер считаем среди оцениваемых страниц, а не среди всех
    function questionNumber(page) {
        return scoredPages().findIndex(p => p.id === page.id) + 1;
    }

    function answeredCount() {
        return scoredPages().filter(isAnswered).length;
    }

    function hasAnyAnswerPage() {
        return scoredPages().length > 0;
    }

    // ── Прогресс ──────────────────────────────────────────────────────────────

    function renderProgress() {
        const fill = el('tv-progress-fill');
        const label = el('tv-progress-label');
        if (!fill || !label) return;

        if (state.submitted) {
            fill.style.width = '100%';
            label.textContent = 'Тест завершён';
            return;
        }

        const total = scoredPages().length;
        const done = answeredCount();
        fill.style.width = total ? `${Math.round(done / total * 100)}%` : '0%';
        label.textContent = total ? `Отвечено ${done} из ${total}` : 'Без вопросов';
    }

    // ── Содержание ────────────────────────────────────────────────────────────

    function renderSidebar() {
        const list = el('tv-toc-items');
        const sum = el('tv-toc-sum');
        if (!list) return;
        list.innerHTML = '';

        if (state.submitted) {
            if (sum) sum.textContent = 'Тест завершён';
            const item = document.createElement('div');
            item.className = 'tv-nav-item active';
            item.innerHTML = `<span class="tv-nav-num">${ICON_CHECK}</span><span class="tv-nav-label">Результаты</span>`;
            list.appendChild(item);
            renderProgress();
            return;
        }

        const total = scoredPages().length;
        if (sum) sum.innerHTML = total ? `Отвечено <b>${answeredCount()}</b> из <b>${total}</b>` : 'Вопросов нет';

        state.pages.forEach((page, i) => {
            const scored = isScored(page);
            const answered = scored && isAnswered(page);
            const item = document.createElement('div');
            item.className = 'tv-nav-item'
                + (i === state.currentIndex ? ' active' : '')
                + (answered ? ' answered' : '')
                + (scored ? '' : ' is-text');

            const num = answered ? ICON_CHECK : (scored ? questionNumber(page) : '§');
            const label = page.title || (scored ? `Вопрос ${questionNumber(page)}` : 'Материал');
            item.innerHTML = `<span class="tv-nav-num">${num}</span><span class="tv-nav-label">${escHtml(label)}</span>`;
            item.addEventListener('click', () => {
                state.currentIndex = i;
                closeToc();
                renderPage();
                renderSidebar();
            });
            list.appendChild(item);
        });

        renderProgress();
    }

    function openToc() {
        el('tv-toc')?.classList.add('open');
        el('tv-toc-backdrop')?.classList.add('open');
    }
    function closeToc() {
        el('tv-toc')?.classList.remove('open');
        el('tv-toc-backdrop')?.classList.remove('open');
    }

    // ── Шапка карточки задания ────────────────────────────────────────────────

    function metaHtml(page, badges = []) {
        const label = isScored(page)
            ? `Вопрос ${questionNumber(page)} из ${scoredPages().length}`
            : 'Материал';
        const chips = badges.filter(Boolean)
            .map(b => `<span class="tv-q-badge${b.accent ? ' accent' : ''}">${escHtml(b.text)}</span>`)
            .join('');
        return `<div class="tv-q-meta"><span class="tv-q-num">${label}</span>${chips}</div>`;
    }

    function navButtonsHtml() {
        const isFirst = state.currentIndex === 0;
        const isLast = state.currentIndex === state.pages.length - 1;
        return `
            <div class="tv-nav-btns">
                <button type="button" id="tv-prev-btn" class="tv-btn" ${isFirst ? 'disabled' : ''}>${ICON_PREV}Назад</button>
                <span class="tv-spacer"></span>
                ${!isLast ? `<button type="button" id="tv-next-btn" class="tv-btn tv-btn-primary">Далее${ICON_NEXT}</button>` : ''}
                ${isLast && hasAnyAnswerPage() ? `<button type="button" id="tv-submit-btn" class="tv-btn tv-btn-primary">${ICON_CHECK}Завершить тест</button>` : ''}
            </div>`;
    }

    function bindNavButtons(container) {
        container.querySelector('#tv-prev-btn')?.addEventListener('click', () => {
            if (state.currentIndex > 0) { state.currentIndex--; renderPage(); renderSidebar(); }
        });
        container.querySelector('#tv-next-btn')?.addEventListener('click', () => {
            if (state.currentIndex < state.pages.length - 1) { state.currentIndex++; renderPage(); renderSidebar(); }
        });
        container.querySelector('#tv-submit-btn')?.addEventListener('click', submitTest);
    }

    // ── Страница ──────────────────────────────────────────────────────────────

    function renderPage() {
        const container = el('tv-main-inner');
        if (!container) return;

        if (state.submitted) { renderResults(container); return; }

        const page = state.pages[state.currentIndex];
        if (!page) return;

        if (page.type === 'code') { renderCodePage(container, page); return; }

        let card = '';

        if (page.type === 'text') {
            card = `
                ${metaHtml(page)}
                ${page.title ? `<h2 class="tv-question">${escHtml(page.title)}</h2>` : ''}
                <div class="tv-page-content">${md(page.content)}</div>`;
        } else if (page.type === 'quiz') {
            const inputType = page.multi_correct ? 'checkbox' : 'radio';
            const selected = state.answers[page.id] || [];
            const answers = (page.answers || []).map(a => `
                <label class="tv-answer-label${selected.includes(a.id) ? ' selected' : ''}">
                    <input type="${inputType}" name="quiz-${page.id}" value="${a.id}" ${selected.includes(a.id) ? 'checked' : ''}>
                    ${escHtml(a.text)}
                </label>`).join('');
            card = `
                ${metaHtml(page, [page.multi_correct
                    ? { text: 'Несколько вариантов', accent: true }
                    : { text: 'Один вариант' }])}
                <h2 class="tv-question">${escHtml(page.title)}</h2>
                ${page.content ? `<div class="tv-page-content">${md(page.content)}</div>` : ''}
                <div class="tv-answers" id="tv-answers-${page.id}">${answers}</div>`;
        } else if (page.type === 'input') {
            card = `
                ${metaHtml(page, [{ text: 'Ответ текстом' }])}
                <h2 class="tv-question">${escHtml(page.title)}</h2>
                ${page.content ? `<div class="tv-page-content">${md(page.content)}</div>` : ''}
                <input id="tv-input-${page.id}" class="tv-input-field" type="text"
                       placeholder="Введите ответ…" value="${escHtml(state.answers[page.id] || '')}" autocomplete="off">`;
        }

        container.innerHTML = `<div class="tv-card">${card}</div>${navButtonsHtml()}`;

        if (page.type === 'quiz') {
            container.querySelectorAll(`[name="quiz-${page.id}"]`).forEach(input => {
                input.addEventListener('change', () => {
                    state.answers[page.id] = Array.from(container.querySelectorAll(`[name="quiz-${page.id}"]`))
                        .filter(i => i.checked)
                        .map(i => parseInt(i.value, 10));
                    container.querySelectorAll(`#tv-answers-${page.id} .tv-answer-label`).forEach(label => {
                        label.classList.toggle('selected', label.querySelector('input')?.checked);
                    });
                    renderSidebar();
                });
            });
        } else if (page.type === 'input') {
            container.querySelector(`#tv-input-${page.id}`)?.addEventListener('input', e => {
                state.answers[page.id] = e.target.value;
                renderSidebar();
            });
        }

        bindNavButtons(container);
    }

    // ── Задача на код ─────────────────────────────────────────────────────────

    const LANG_LABELS = { python: 'Python 3', javascript: 'JavaScript (Node)', cpp: 'C++17' };
    const LANG_EXTENSIONS = { python: '.py', javascript: '.js', cpp: '.cpp' };

    function samplesHtml(samples) {
        if (!samples || !samples.length) return '';
        const rows = samples.map(s => `
            <div class="tv-sample">
                <div class="tv-sample-cell">
                    <div class="tv-sample-label">Ввод</div>
                    <pre>${escHtml(s.input) || '—'}</pre>
                </div>
                <div class="tv-sample-cell">
                    <div class="tv-sample-label">Ожидаемый вывод</div>
                    <pre>${escHtml(s.expected) || '—'}</pre>
                </div>
            </div>`).join('');
        return `<div class="tv-samples"><div class="tv-samples-head">Примеры</div>${rows}</div>`;
    }

    function renderCodePage(container, page) {
        // Язык приходит с сервера в page_meta. Пока его не отдавали, здесь всегда
        // подставлялся python и решение на другом языке гарантированно падало.
        const meta = page.page_meta || {};
        const language = meta.language || 'python';
        const langLabel = LANG_LABELS[language] || language;
        const ext = LANG_EXTENSIONS[language] || '.txt';
        const currentCode = state.answers[page.id]?.code || '';

        container.innerHTML = `
            <div class="tv-card">
                ${metaHtml(page, [{ text: 'Задача на код', accent: true }])}
                ${page.title ? `<h2 class="tv-question">${escHtml(page.title)}</h2>` : ''}
                ${page.content ? `<div class="tv-page-content">${md(page.content)}</div>` : ''}
                ${samplesHtml(meta.samples)}
            </div>

            <div class="tv-editor">
                <div class="tv-editor-bar">
                    <span class="tv-code-lang-badge">${escHtml(langLabel)}</span>
                    ${meta.time_limit ? `<span class="tv-editor-hint">${meta.time_limit} с на тест</span>` : ''}
                    <div class="tv-editor-acts">
                        <label class="tv-editor-act">
                            ${ICON_UPLOAD} Загрузить файл
                            <input type="file" id="tv-code-file" accept="${ext}" hidden>
                        </label>
                        <button type="button" id="tv-code-reset" class="tv-editor-act">${ICON_RESET} Сбросить</button>
                    </div>
                </div>
                <textarea id="tv-code-editor" class="tv-code-textarea" spellcheck="false"
                          autocorrect="off" autocapitalize="off">${escHtml(currentCode)}</textarea>
            </div>

            <div id="tv-code-results"></div>

            <div class="tv-code-actions">
                <button type="button" id="tv-code-run-btn" class="tv-btn">${ICON_RUN} Запустить на примерах</button>
                <button type="button" id="tv-code-submit-btn" class="tv-btn tv-btn-primary">${ICON_CHECK} Проверить решение</button>
            </div>

            ${navButtonsHtml()}`;

        const textarea = container.querySelector('#tv-code-editor');

        function saveCode() {
            state.answers[page.id] = { ...(state.answers[page.id] || {}), code: textarea.value };
        }

        container.querySelector('#tv-code-file').addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => { textarea.value = ev.target.result; saveCode(); };
            reader.readAsText(file);
        });

        container.querySelector('#tv-code-reset').addEventListener('click', () => {
            textarea.value = '';
            saveCode();
        });

        textarea.addEventListener('input', saveCode);

        container.querySelector('#tv-code-run-btn').addEventListener('click',
            () => runCode(page.id, textarea.value, true, container));
        container.querySelector('#tv-code-submit-btn').addEventListener('click',
            () => runCode(page.id, textarea.value, false, container));

        bindNavButtons(container);
    }

    async function runCode(pageId, code, sampleOnly, container) {
        const runBtn = container.querySelector('#tv-code-run-btn');
        const submitBtn = container.querySelector('#tv-code-submit-btn');
        const resultsEl = container.querySelector('#tv-code-results');

        const runLabel = runBtn?.innerHTML;
        if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Выполняется…'; }
        if (submitBtn) submitBtn.disabled = true;
        if (resultsEl) resultsEl.innerHTML = '<div class="tv-editor-hint" style="padding:10px 0">Выполнение…</div>';

        try {
            const data = await apiFetch(`/api/v1/tests/pages/${pageId}/run/${isPreview ? '?preview=1' : ''}`, {
                method: 'POST',
                body: JSON.stringify({ code, sample_only: sampleOnly }),
            });

            if (!sampleOnly) {
                state.answers[pageId] = {
                    ...(state.answers[pageId] || {}),
                    type: 'code', passed: data.passed, total: data.total,
                };
                renderSidebar();
            }
            if (resultsEl) renderCodeResults(resultsEl, data, sampleOnly);
        } catch (e) {
            if (resultsEl) resultsEl.innerHTML = `<div class="tv-code-error">${escHtml(e.message)}</div>`;
        } finally {
            if (runBtn) { runBtn.disabled = false; runBtn.innerHTML = runLabel; }
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    function renderCodeResults(el_, data, sampleOnly) {
        const items = data.results.map(r => {
            const icon = r.passed ? '✅' : (r.timed_out ? '⏱' : '❌');
            let detail = '';
            if (r.input !== undefined) {
                detail = `
                    <div class="tv-code-detail">
                        ${r.input ? `<div><span class="tv-code-detail-label">Ввод:</span><pre>${escHtml(r.input)}</pre></div>` : ''}
                        <div><span class="tv-code-detail-label">Ожидалось:</span><pre>${escHtml(r.expected)}</pre></div>
                        <div><span class="tv-code-detail-label">Получено:</span><pre>${escHtml(r.actual)}</pre></div>
                        ${r.stderr ? `<div><span class="tv-code-detail-label">Ошибка:</span><pre>${escHtml(r.stderr)}</pre></div>` : ''}
                    </div>`;
            }
            return `<div class="tv-code-result-item ${r.passed ? 'pass' : 'fail'}">${icon} Тест ${r.index}${detail}</div>`;
        }).join('');

        el_.innerHTML = `
            <div class="tv-code-results-wrap">
                <div class="tv-code-results-header">
                    <span><strong>${data.passed} / ${data.total}</strong> тестов пройдено</span>
                    ${!sampleOnly ? `<span class="tv-code-verdict ${data.passed === data.total ? 'pass' : 'fail'}">${data.passed === data.total ? 'Принято' : 'Есть ошибки'}</span>` : ''}
                </div>
                <div class="tv-code-result-list">${items}</div>
            </div>`;
    }

    // ── Завершение ────────────────────────────────────────────────────────────

    async function submitTest() {
        const btn = el('tv-submit-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Отправка…'; }
        try {
            const data = await apiFetch(`/api/v1/tests/${testId}/submit/${isPreview ? '?preview=1' : ''}`, {
                method: 'POST',
                body: JSON.stringify({ answers: state.answers }),
            });
            state.submitted = true;
            state.score = data.score;
            state.total = data.total;
            state.results = data.results;
            renderSidebar();
            renderResults(el('tv-main-inner'));
        } catch (e) {
            if (btn) { btn.disabled = false; btn.innerHTML = `${ICON_CHECK}Завершить тест`; }
            const container = el('tv-main-inner');
            if (container) {
                const err = document.createElement('p');
                err.className = 'tv-error-note';
                err.textContent = e.message || 'Ошибка отправки.';
                container.appendChild(err);
            }
        }
    }

    // ── Результаты ────────────────────────────────────────────────────────────

    function renderResults(container) {
        const pct = state.total > 0 ? Math.round(state.score / state.total * 100) : 0;
        const pass = pct >= 60;

        const resultItems = (state.results || []).map(r => {
            const page = state.pages.find(p => p.id === r.page_id);
            const title = page?.title || 'Вопрос';
            let hint = '';
            if (!r.correct) {
                if (r.type === 'input') {
                    hint = `Правильный ответ: ${escHtml(r.correct_text)}`;
                } else if (r.type === 'quiz') {
                    const correct = (page?.answers || [])
                        .filter(a => r.correct_answer_ids.includes(a.id))
                        .map(a => escHtml(a.text)).join(', ');
                    hint = `Правильно: ${correct}`;
                }
            }
            return `
                <div class="tv-result-item ${r.correct ? 'correct' : 'incorrect'}">
                    <div class="tv-result-item-title">${r.correct ? '✓' : '✗'} ${escHtml(title)}</div>
                    ${hint ? `<div class="tv-result-item-hint">${hint}</div>` : ''}
                </div>`;
        }).join('');

        container.innerHTML = `
            <div class="tv-results">
                <div class="tv-score-circle ${pass ? 'pass' : 'fail'}">${pct}%</div>
                <div class="tv-result-title">${pass ? 'Тест пройден!' : 'Тест не пройден'}</div>
                <div class="tv-result-sub">${state.score} из ${state.total} правильных ответов</div>
                ${resultItems ? `<div class="tv-result-items">${resultItems}</div>` : ''}
                <a href="${isPreview ? `/constructor/${testId}/` : '/tests/'}" class="tv-btn">${isPreview ? 'Вернуться в конструктор' : 'Все тесты'}</a>
            </div>`;
        renderProgress();
    }

    // ── Защита от потери ответов ──────────────────────────────────────────────

    function hasUnsavedAnswers() {
        return !state.submitted && scoredPages().some(isAnswered);
    }

    window.addEventListener('beforeunload', event => {
        if (!hasUnsavedAnswers()) return;
        event.preventDefault();
        event.returnValue = '';   // требуется старыми браузерами
    });

    // ── Запуск ────────────────────────────────────────────────────────────────

    async function init() {
        if (!testId) return;

        document.querySelectorAll('[data-toc-open]').forEach(b => b.addEventListener('click', openToc));
        document.querySelectorAll('[data-toc-close]').forEach(b => b.addEventListener('click', closeToc));
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeToc(); });

        if (isPreview) {
            const badge = el('tv-preview-badge');
            if (badge) badge.hidden = false;
            const backBtn = el('tv-back-to-editor');
            if (backBtn) {
                backBtn.href = `/constructor/${testId}/`;
                backBtn.hidden = false;
            }
        }

        try {
            const data = await apiFetch(`/api/v1/tests/${testId}/view/${isPreview ? '?preview=1' : ''}`);
            state.test = data.test;
            state.pages = data.pages;

            const titleEl = el('tv-test-title');
            if (titleEl) titleEl.textContent = data.test.title;

            renderSidebar();
            renderPage();
        } catch (e) {
            const container = el('tv-main-inner');
            if (container) container.innerHTML = `<div class="tv-loading">${escHtml(e.message || 'Не удалось загрузить тест.')}</div>`;
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
