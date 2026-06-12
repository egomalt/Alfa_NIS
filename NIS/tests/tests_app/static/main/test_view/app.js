(() => {
    const BOOTSTRAP = window.ALFA_APP_BOOTSTRAP || {};
    const CSRF = () => document.querySelector('meta[name="csrf-token"]')?.content || '';
    const testId = BOOTSTRAP.testId;
    const isPreview = !!BOOTSTRAP.isPreview;

    const state = {
        test: null,
        pages: [],
        currentIndex: 0,
        answers: {},       // {pageId: value}  value = [] for quiz, string for input
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

    // ── Escape ────────────────────────────────────────────────────────────────

    function escHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── Sidebar ───────────────────────────────────────────────────────────────

    function renderSidebar() {
        const sidebar = document.getElementById('tv-sidebar');
        if (!sidebar) return;
        sidebar.innerHTML = '';

        if (state.submitted) {
            const item = document.createElement('div');
            item.className = 'tv-nav-item active';
            item.innerHTML = `<span class="tv-nav-num">★</span><span class="tv-nav-label">Результаты</span>`;
            sidebar.appendChild(item);
            return;
        }

        state.pages.forEach((page, i) => {
            const item = document.createElement('div');
            const isActive = i === state.currentIndex;
            const isAnswered = state.answers[page.id] !== undefined;
            item.className = `tv-nav-item${isActive ? ' active' : ''}${isAnswered && !isActive ? ' answered' : ''}`;
            const label = page.title || (page.type === 'text' ? 'Текст' : `Вопрос ${i + 1}`);
            item.innerHTML = `<span class="tv-nav-num">${i + 1}</span><span class="tv-nav-label">${escHtml(label)}</span>`;
            item.addEventListener('click', () => { state.currentIndex = i; renderPage(); renderSidebar(); });
            sidebar.appendChild(item);
        });
    }

    // ── Page rendering ────────────────────────────────────────────────────────

    function renderPage() {
        const container = document.getElementById('tv-main-inner');
        if (!container) return;

        if (state.submitted) {
            renderResults(container);
            return;
        }

        const page = state.pages[state.currentIndex];
        if (!page) return;

        const isLast = state.currentIndex === state.pages.length - 1;
        const hasQuizPages = state.pages.some(p => p.type === 'quiz' || p.type === 'input');

        let html = '';

        if (page.type === 'code') {
            renderCodePage(container, page);
            return;
        }

        if (page.type === 'text') {
            const renderedMd = window.marked ? window.marked.parse(page.content || '') : escHtml(page.content);
            html = `
                ${page.title ? `<h2>${escHtml(page.title)}</h2>` : ''}
                <div class="tv-page-content">${renderedMd}</div>
            `;
        } else if (page.type === 'quiz') {
            const inputType = page.multi_correct ? 'checkbox' : 'radio';
            const selected = state.answers[page.id] || [];
            const answers = (page.answers || []).map(a => {
                const isSelected = selected.includes(a.id);
                return `
                    <label class="tv-answer-label${isSelected ? ' selected' : ''}">
                        <input type="${inputType}" name="quiz-${page.id}" value="${a.id}" ${isSelected ? 'checked' : ''} style="flex-shrink:0">
                        ${escHtml(a.text)}
                    </label>
                `;
            }).join('');
            html = `
                <p class="tv-question">${escHtml(page.title)}</p>
                ${page.content ? `<div class="tv-page-content">${window.marked ? window.marked.parse(page.content) : escHtml(page.content)}</div>` : ''}
                <div class="tv-answers" id="tv-answers-${page.id}">${answers}</div>
            `;
        } else if (page.type === 'input') {
            const val = state.answers[page.id] || '';
            html = `
                <p class="tv-question">${escHtml(page.title)}</p>
                ${page.content ? `<div class="tv-page-content">${window.marked ? window.marked.parse(page.content) : escHtml(page.content)}</div>` : ''}
                <input id="tv-input-${page.id}" class="tv-input-field" type="text" placeholder="Введите ответ…" value="${escHtml(val)}" autocomplete="off">
            `;
        }

        // Nav buttons
        const prevDisabled = state.currentIndex === 0 ? 'disabled' : '';
        const lastActionBtn = isLast && hasQuizPages
            ? `<button type="button" id="tv-submit-btn" class="tv-btn tv-btn-primary">Завершить тест</button>`
            : isLast
            ? ''
            : `<button type="button" id="tv-next-btn" class="tv-btn tv-btn-primary">Далее →</button>`;

        html += `
            <div class="tv-nav-btns">
                <button type="button" id="tv-prev-btn" class="tv-btn" ${prevDisabled}>← Назад</button>
                ${!isLast ? `<button type="button" id="tv-next-btn" class="tv-btn tv-btn-primary">Далее →</button>` : ''}
                ${isLast && hasQuizPages ? `<button type="button" id="tv-submit-btn" class="tv-btn tv-btn-primary">Завершить тест</button>` : ''}
            </div>
        `;

        container.innerHTML = html;

        // Bind answer inputs
        if (page.type === 'quiz') {
            container.querySelectorAll(`[name="quiz-${page.id}"]`).forEach(input => {
                input.addEventListener('change', () => {
                    const all = container.querySelectorAll(`[name="quiz-${page.id}"]`);
                    state.answers[page.id] = Array.from(all)
                        .filter(i => i.checked)
                        .map(i => parseInt(i.value, 10));
                    // Update selected styling
                    container.querySelectorAll(`#tv-answers-${page.id} .tv-answer-label`).forEach(label => {
                        const inp = label.querySelector('input');
                        label.classList.toggle('selected', inp && inp.checked);
                    });
                    renderSidebar();
                });
            });
        } else if (page.type === 'input') {
            const inputEl = container.querySelector(`#tv-input-${page.id}`);
            if (inputEl) {
                inputEl.addEventListener('input', e => {
                    state.answers[page.id] = e.target.value;
                    renderSidebar();
                });
            }
        }

        container.querySelector('#tv-prev-btn')?.addEventListener('click', () => {
            if (state.currentIndex > 0) { state.currentIndex--; renderPage(); renderSidebar(); }
        });
        container.querySelector('#tv-next-btn')?.addEventListener('click', () => {
            if (state.currentIndex < state.pages.length - 1) { state.currentIndex++; renderPage(); renderSidebar(); }
        });
        container.querySelector('#tv-submit-btn')?.addEventListener('click', submitTest);
    }

    // ── Code page ─────────────────────────────────────────────────────────────

    const LANG_LABELS = { python: 'Python 3', javascript: 'JavaScript (Node)', cpp: 'C++17' };
    const LANG_EXTENSIONS = { python: '.py', javascript: '.js', cpp: '.cpp' };

    function renderCodePage(container, page) {
        const meta = page.page_meta || {};
        const language = meta.language || 'python';
        const langLabel = LANG_LABELS[language] || language;
        const ext = LANG_EXTENSIONS[language] || '.txt';
        const problemHtml = window.marked ? window.marked.parse(page.content || '') : escHtml(page.content);

        const currentCode = (state.answers[page.id] && state.answers[page.id].code) || '';

        const isFirst = state.currentIndex === 0;
        const isLast = state.currentIndex === state.pages.length - 1;
        const hasAnswerPages = state.pages.some(p => p.type === 'quiz' || p.type === 'input' || p.type === 'code');

        container.innerHTML = `
            ${page.title ? `<h2 style="margin-bottom:16px">${escHtml(page.title)}</h2>` : ''}
            ${page.content ? `<div class="tv-page-content" style="margin-bottom:20px">${problemHtml}</div>` : ''}
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                <span class="tv-code-lang-badge">${escHtml(langLabel)}</span>
                <label class="tv-upload-label">
                    📁 Загрузить файл
                    <input type="file" id="tv-code-file" accept="${ext}" hidden>
                </label>
                <button type="button" id="tv-code-reset" class="tv-upload-label" style="cursor:pointer;border:none;background:none;padding:5px 10px">↺ Сбросить</button>
            </div>
            <textarea id="tv-code-editor" class="tv-code-textarea" spellcheck="false" autocorrect="off" autocapitalize="off">${escHtml(currentCode)}</textarea>
            <div id="tv-code-results" style="margin-top:14px"></div>
            <div class="tv-nav-btns" style="margin-top:14px">
                <button type="button" id="tv-code-run-btn" class="tv-btn">▶ Запустить (примеры)</button>
                <button type="button" id="tv-code-submit-btn" class="tv-btn tv-btn-primary">Отправить решение</button>
            </div>
            <div class="tv-nav-btns" style="margin-top:8px">
                <button type="button" id="tv-prev-btn" class="tv-btn" ${isFirst ? 'disabled' : ''}>← Назад</button>
                ${!isLast ? `<button type="button" id="tv-next-btn" class="tv-btn tv-btn-primary">Далее →</button>` : ''}
                ${isLast && hasAnswerPages ? `<button type="button" id="tv-finish-btn" class="tv-btn tv-btn-primary">Завершить тест</button>` : ''}
            </div>
        `;

        const textarea = container.querySelector('#tv-code-editor');

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

        function saveCode() {
            const existing = state.answers[page.id] || {};
            state.answers[page.id] = { ...existing, code: textarea.value };
        }

        container.querySelector('#tv-code-run-btn').addEventListener('click', async () => {
            await runCode(page.id, textarea.value, language, true, container);
        });

        container.querySelector('#tv-code-submit-btn').addEventListener('click', async () => {
            await runCode(page.id, textarea.value, language, false, container);
        });

        container.querySelector('#tv-prev-btn')?.addEventListener('click', () => {
            if (state.currentIndex > 0) { state.currentIndex--; renderPage(); renderSidebar(); }
        });
        container.querySelector('#tv-next-btn')?.addEventListener('click', () => {
            if (state.currentIndex < state.pages.length - 1) { state.currentIndex++; renderPage(); renderSidebar(); }
        });
        container.querySelector('#tv-finish-btn')?.addEventListener('click', submitTest);
    }

    async function runCode(pageId, code, language, sampleOnly, container) {
        const runBtn = container.querySelector('#tv-code-run-btn');
        const submitBtn = container.querySelector('#tv-code-submit-btn');
        const resultsEl = container.querySelector('#tv-code-results');

        if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Выполняется…'; }
        if (submitBtn) { submitBtn.disabled = true; }
        if (resultsEl) { resultsEl.innerHTML = '<div style="color:var(--muted);font-size:0.85rem">Выполнение…</div>'; }

        try {
            const previewParam = isPreview ? '?preview=1' : '';
            const data = await apiFetch(`/api/v1/tests/pages/${pageId}/run/${previewParam}`, {
                method: 'POST',
                body: JSON.stringify({ code, language, sample_only: sampleOnly }),
            });

            if (!sampleOnly) {
                const existing = state.answers[pageId] || {};
                state.answers[pageId] = { ...existing, type: 'code', passed: data.passed, total: data.total };
                renderSidebar();
            }

            if (resultsEl) renderCodeResults(resultsEl, data, sampleOnly);
        } catch (e) {
            if (resultsEl) resultsEl.innerHTML = `<div style="color:#e53e3e;font-size:0.85rem;padding:10px 0">${escHtml(e.message)}</div>`;
        } finally {
            if (runBtn) { runBtn.disabled = false; runBtn.textContent = '▶ Запустить (примеры)'; }
            if (submitBtn) { submitBtn.disabled = false; }
        }
    }

    function renderCodeResults(el, data, sampleOnly) {
        const items = data.results.map(r => {
            const icon = r.passed ? '✅' : (r.timed_out ? '⏱' : '❌');
            let detail = '';
            if (r.input !== undefined) {
                detail = `
                    <div class="tv-code-detail">
                        ${r.input ? `<div><span class="tv-code-detail-label">Ввод:</span><pre>${escHtml(r.input)}</pre></div>` : ''}
                        <div><span class="tv-code-detail-label">Ожидалось:</span><pre>${escHtml(r.expected)}</pre></div>
                        <div><span class="tv-code-detail-label">Получено:</span><pre>${escHtml(r.actual)}</pre></div>
                        ${r.stderr ? `<div><span class="tv-code-detail-label" style="color:#e53e3e">Ошибка:</span><pre style="color:#e53e3e">${escHtml(r.stderr)}</pre></div>` : ''}
                    </div>
                `;
            }
            return `<div class="tv-code-result-item ${r.passed ? 'pass' : 'fail'}">${icon} Тест ${r.index}${detail}</div>`;
        }).join('');

        el.innerHTML = `
            <div class="tv-code-results-wrap">
                <div class="tv-code-results-header">
                    <strong>${data.passed} / ${data.total}</strong> тестов пройдено
                    ${!sampleOnly ? `<span class="tv-code-verdict ${data.passed === data.total ? 'pass' : 'fail'}">${data.passed === data.total ? 'Принято ✓' : 'Ошибка ✗'}</span>` : ''}
                </div>
                <div class="tv-code-result-list">${items}</div>
            </div>
        `;
    }

    // ── Submit ────────────────────────────────────────────────────────────────

    async function submitTest() {
        const btn = document.getElementById('tv-submit-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Отправка…'; }
        try {
            const previewParam = isPreview ? '?preview=1' : '';
            const data = await apiFetch(`/api/v1/tests/${testId}/submit/${previewParam}`, {
                method: 'POST',
                body: JSON.stringify({ answers: state.answers }),
            });
            state.submitted = true;
            state.score = data.score;
            state.total = data.total;
            state.results = data.results;
            renderSidebar();
            renderResults(document.getElementById('tv-main-inner'));
        } catch (e) {
            if (btn) { btn.disabled = false; btn.textContent = 'Завершить тест'; }
            const container = document.getElementById('tv-main-inner');
            if (container) {
                const err = document.createElement('p');
                err.style.color = '#e53e3e';
                err.style.marginTop = '12px';
                err.textContent = e.message || 'Ошибка отправки.';
                container.appendChild(err);
            }
        }
    }

    // ── Results ───────────────────────────────────────────────────────────────

    function renderResults(container) {
        const pct = state.total > 0 ? Math.round(state.score / state.total * 100) : 0;
        const pass = pct >= 60;

        const resultItems = (state.results || []).map(r => {
            const page = state.pages.find(p => p.id === r.page_id);
            const title = page?.title || `Вопрос`;
            const cls = r.correct ? 'correct' : 'incorrect';
            let hint = '';
            if (!r.correct) {
                if (r.type === 'input') {
                    hint = `Правильный ответ: ${escHtml(r.correct_text)}`;
                } else if (r.type === 'quiz') {
                    const correctAnswers = (page?.answers || [])
                        .filter(a => r.correct_answer_ids.includes(a.id))
                        .map(a => escHtml(a.text))
                        .join(', ');
                    hint = `Правильно: ${correctAnswers}`;
                }
            }
            return `
                <div class="tv-result-item ${cls}">
                    <div class="tv-result-item-title">${r.correct ? '✓' : '✗'} ${escHtml(title)}</div>
                    ${hint ? `<div class="tv-result-item-hint">${hint}</div>` : ''}
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="tv-results">
                <div class="tv-score-circle ${pass ? 'pass' : 'fail'}">${pct}%</div>
                <div class="tv-result-title">${pass ? 'Тест пройден!' : 'Тест не пройден'}</div>
                <div class="tv-result-sub">${state.score} из ${state.total} правильных ответов</div>
                ${resultItems ? `<div class="tv-result-items">${resultItems}</div>` : ''}
                <a href="${isPreview ? `/constructor/${testId}/` : '/'}" class="tv-btn">${isPreview ? '← Вернуться в конструктор' : 'На главную'}</a>
            </div>
        `;
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    async function init() {
        if (!testId) return;

        const previewParam = isPreview ? '?preview=1' : '';
        if (isPreview) {
            const badge = document.getElementById('tv-preview-badge');
            if (badge) badge.hidden = false;
            const backBtn = document.getElementById('tv-back-to-editor');
            if (backBtn) {
                backBtn.href = `/constructor/${testId}/`;
                backBtn.hidden = false;
            }
        }

        try {
            const data = await apiFetch(`/api/v1/tests/${testId}/view/${previewParam}`);
            state.test = data.test;
            state.pages = data.pages;

            const titleEl = document.getElementById('tv-test-title');
            if (titleEl) titleEl.textContent = data.test.title;

            renderSidebar();
            renderPage();
        } catch (e) {
            const container = document.getElementById('tv-main-inner');
            if (container) container.innerHTML = `<div class="tv-loading">${escHtml(e.message || 'Не удалось загрузить тест.')}</div>`;
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
