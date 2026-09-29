/* Прохождение теста.
   Ответы живут в памяти вкладки и уходят на сервер одним запросом при
   завершении, поэтому уход со страницы подтверждается предупреждением. */
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { api, byId, esc, pageData, toast } from 'alfa/core';

const { testId, isPreview } = pageData();
const PREVIEW_QUERY = isPreview ? '?preview=1' : '';
const PASS_PERCENT = 60;
// Страницы, за которые начисляются баллы
const SCORED_TYPES = ['quiz', 'input', 'code'];
const LANGUAGES = {
  python: ['Python 3', '.py'],
  javascript: ['JavaScript (Node)', '.js'],
  cpp: ['C++17', '.cpp'],
};

const ICONS = {
  prev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 12H5M11 5l-6 7 6 7"/></svg>',
  next: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M13 5l6 7-6 7"/></svg>',
  check:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>',
  cross:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  clock:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  run: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
  upload:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 17V5M7 10l5-5 5 5M4 19h16"/></svg>',
  reset:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
};

const state = {
  pages: [],
  current: 0,
  answers: {}, // {pageId: value}: [] для quiz, строка для input, {code, type, passed, total} для code
  submitted: false,
  results: [],
  score: 0,
  total: 0,
};

const main = byId('tv-main-inner');

/* Текст заданий пишет автор теста — Markdown превращаем в HTML
   и вычищаем всё исполняемое, прежде чем вставить в страницу */
const markdown = (text) => DOMPurify.sanitize(marked.parse(text ?? ''));

const isScored = (page) => SCORED_TYPES.includes(page.type);
const scoredPages = () => state.pages.filter(isScored);

/* «Отвечено» — это именно данный ответ, а не просто тронутое поле.
   Для задачи на код засчитывается только проверенное решение */
function isAnswered(page) {
  const value = state.answers[page.id];
  if (page.type === 'quiz') return Array.isArray(value) && value.length > 0;
  if (page.type === 'input') return typeof value === 'string' && value.trim() !== '';
  if (page.type === 'code') return value?.type === 'code';
  return false;
}

// Номер считаем среди оцениваемых страниц, а не среди всех
const questionNumber = (page) => scoredPages().findIndex((item) => item.id === page.id) + 1;
const answeredCount = () => scoredPages().filter(isAnswered).length;

function renderProgress() {
  const total = scoredPages().length;
  const done = answeredCount();
  byId('tv-progress-fill').style.width = state.submitted ? '100%' : `${total ? Math.round((done / total) * 100) : 0}%`;
  byId('tv-progress-label').textContent = state.submitted
    ? 'Тест завершён'
    : total
      ? `Отвечено ${done} из ${total}`
      : 'Без вопросов';
}

function renderToc() {
  const total = scoredPages().length;
  if (state.submitted) {
    byId('tv-toc-sum').textContent = 'Тест завершён';
    byId('tv-toc-items').innerHTML = `
      <div class="tv-nav-item active"><span class="tv-nav-num">${ICONS.check}</span><span class="tv-nav-label">Результаты</span></div>`;
  } else {
    byId('tv-toc-sum').innerHTML = total ? `Отвечено <b>${answeredCount()}</b> из <b>${total}</b>` : 'Вопросов нет';
    byId('tv-toc-items').innerHTML = state.pages
      .map((page, index) => {
        const scored = isScored(page);
        const answered = scored && isAnswered(page);
        const classes = [
          'tv-nav-item',
          index === state.current && 'active',
          answered && 'answered',
          !scored && 'is-text',
        ]
          .filter(Boolean)
          .join(' ');
        const number = answered ? ICONS.check : scored ? questionNumber(page) : '§';
        const label = page.title || (scored ? `Вопрос ${questionNumber(page)}` : 'Материал');
        return `<div class="${classes}" data-page-index="${index}"><span class="tv-nav-num">${number}</span><span class="tv-nav-label">${esc(label)}</span></div>`;
      })
      .join('');
  }
  renderProgress();
}

const setTocOpen = (open) => ['tv-toc', 'tv-toc-backdrop'].forEach((id) => byId(id).classList.toggle('open', open));

function goTo(index) {
  if (index < 0 || index >= state.pages.length) return;
  state.current = index;
  renderPage();
  renderToc();
}

function metaHtml(page, badges = []) {
  const label = isScored(page) ? `Вопрос ${questionNumber(page)} из ${scoredPages().length}` : 'Материал';
  const chips = badges
    .map((badge) => `<span class="tv-q-badge ${badge.accent ? 'accent' : ''}">${esc(badge.text)}</span>`)
    .join('');
  return `<div class="tv-q-meta"><span class="tv-q-num">${label}</span>${chips}</div>`;
}

function navButtonsHtml() {
  const isFirst = state.current === 0;
  const isLast = state.current === state.pages.length - 1;
  return `
    <div class="tv-nav-btns">
      <button type="button" class="tv-btn" data-nav="prev" ${isFirst ? 'disabled' : ''}>${ICONS.prev}Назад</button>
      <span class="tv-spacer"></span>
      ${!isLast ? `<button type="button" class="tv-btn tv-btn-primary" data-nav="next">Далее${ICONS.next}</button>` : ''}
      ${isLast && scoredPages().length ? `<button type="button" class="tv-btn tv-btn-primary" data-nav="submit">${ICONS.check}Завершить тест</button>` : ''}
    </div>`;
}

const titleHtml = (page) => (page.title ? `<h2 class="tv-question">${esc(page.title)}</h2>` : '');
const contentHtml = (page) => (page.content ? `<div class="tv-page-content">${markdown(page.content)}</div>` : '');

function quizHtml(page) {
  const selected = state.answers[page.id] ?? [];
  const type = page.multi_correct ? 'checkbox' : 'radio';
  const answers = (page.answers ?? [])
    .map((answer) => {
      const checked = selected.includes(answer.id);
      return `
      <label class="tv-answer-label ${checked ? 'selected' : ''}">
        <input type="${type}" name="quiz-${page.id}" value="${answer.id}" ${checked ? 'checked' : ''}>
        ${esc(answer.text)}
      </label>`;
    })
    .join('');
  return `
    ${metaHtml(page, [page.multi_correct ? { text: 'Несколько вариантов', accent: true } : { text: 'Один вариант' }])}
    ${titleHtml(page)}${contentHtml(page)}
    <div class="tv-answers" data-quiz="${page.id}">${answers}</div>`;
}

const inputHtml = (page) => `
  ${metaHtml(page, [{ text: 'Ответ текстом' }])}
  ${titleHtml(page)}${contentHtml(page)}
  <input class="tv-input-field" data-input="${page.id}" type="text" placeholder="Введите ответ…"
         value="${esc(state.answers[page.id] ?? '')}" autocomplete="off">`;

function renderPage() {
  if (state.submitted) {
    renderResults();
    return;
  }
  const page = state.pages[state.current];
  if (!page) return;
  if (page.type === 'code') {
    renderCodePage(page);
    return;
  }
  const card =
    {
      text: () => `${metaHtml(page)}${titleHtml(page)}<div class="tv-page-content">${markdown(page.content)}</div>`,
      quiz: () => quizHtml(page),
      input: () => inputHtml(page),
    }[page.type]?.() ?? '';
  main.innerHTML = `<div class="tv-card">${card}</div>${navButtonsHtml()}`;
}

function samplesHtml(samples = []) {
  if (!samples.length) return '';
  const cell = (label, value) =>
    `<div class="tv-sample-cell"><div class="tv-sample-label">${label}</div><pre>${esc(value) || '—'}</pre></div>`;
  return `
    <div class="tv-samples">
      <div class="tv-samples-head">Примеры</div>
      ${samples.map((sample) => `<div class="tv-sample">${cell('Ввод', sample.input)}${cell('Ожидаемый вывод', sample.expected)}</div>`).join('')}
    </div>`;
}

function renderCodePage(page) {
  // Язык приходит с сервера в page_meta
  const meta = page.page_meta ?? {};
  const [languageLabel, extension] = LANGUAGES[meta.language ?? 'python'] ?? [meta.language, '.txt'];
  main.innerHTML = `
    <div class="tv-card">
      ${metaHtml(page, [{ text: 'Задача на код', accent: true }])}
      ${titleHtml(page)}${contentHtml(page)}
      ${samplesHtml(meta.samples)}
    </div>
    <div class="tv-editor">
      <div class="tv-editor-bar">
        <span class="tv-code-lang-badge">${esc(languageLabel)}</span>
        ${meta.time_limit ? `<span class="tv-editor-hint">${meta.time_limit} с на тест</span>` : ''}
        <div class="tv-editor-acts">
          <label class="tv-editor-act">${ICONS.upload} Загрузить файл
            <input type="file" id="tv-code-file" accept="${extension}" hidden>
          </label>
          <button type="button" id="tv-code-reset" class="tv-editor-act">${ICONS.reset} Сбросить</button>
        </div>
      </div>
      <textarea id="tv-code-editor" class="tv-code-textarea" spellcheck="false" autocorrect="off"
                autocapitalize="off">${esc(state.answers[page.id]?.code ?? '')}</textarea>
    </div>
    <div id="tv-code-results"></div>
    <div class="tv-code-actions">
      <button type="button" id="tv-code-run-btn" class="tv-btn">${ICONS.run} Запустить на примерах</button>
      <button type="button" id="tv-code-submit-btn" class="tv-btn tv-btn-primary">${ICONS.check} Проверить решение</button>
    </div>
    ${navButtonsHtml()}`;

  const editor = byId('tv-code-editor');
  const saveCode = () => {
    state.answers[page.id] = { ...state.answers[page.id], code: editor.value };
  };
  editor.addEventListener('input', saveCode);
  byId('tv-code-file').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    editor.value = await file.text();
    saveCode();
  });
  byId('tv-code-reset').addEventListener('click', () => {
    editor.value = '';
    saveCode();
  });
  byId('tv-code-run-btn').addEventListener('click', () => runCode(page.id, editor.value, true));
  byId('tv-code-submit-btn').addEventListener('click', () => runCode(page.id, editor.value, false));
}

async function runCode(pageId, code, sampleOnly) {
  const runButton = byId('tv-code-run-btn');
  const submitButton = byId('tv-code-submit-btn');
  const results = byId('tv-code-results');
  const runLabel = runButton.innerHTML;
  runButton.disabled = true;
  submitButton.disabled = true;
  runButton.textContent = 'Выполняется…';
  results.innerHTML = '<div class="tv-editor-hint tv-code-running">Выполнение…</div>';
  try {
    const data = await api.post(`/api/v1/tests/pages/${pageId}/run/${PREVIEW_QUERY}`, {
      code,
      sample_only: sampleOnly,
    });
    if (!sampleOnly) {
      state.answers[pageId] = { ...state.answers[pageId], type: 'code', passed: data.passed, total: data.total };
      renderToc();
    }
    renderCodeResults(results, data, sampleOnly);
  } catch (error) {
    results.innerHTML = `<div class="tv-code-error">${esc(error.message)}</div>`;
  } finally {
    runButton.disabled = false;
    submitButton.disabled = false;
    runButton.innerHTML = runLabel;
  }
}

function renderCodeResults(box, data, sampleOnly) {
  const items = data.results
    .map((result) => {
      const icon = result.passed ? ICONS.check : result.timed_out ? ICONS.clock : ICONS.cross;
      const detail =
        result.input === undefined
          ? ''
          : `
      <div class="tv-code-detail">
        ${result.input ? `<div><span class="tv-code-detail-label">Ввод:</span><pre>${esc(result.input)}</pre></div>` : ''}
        <div><span class="tv-code-detail-label">Ожидалось:</span><pre>${esc(result.expected)}</pre></div>
        <div><span class="tv-code-detail-label">Получено:</span><pre>${esc(result.actual)}</pre></div>
        ${result.stderr ? `<div><span class="tv-code-detail-label">Ошибка:</span><pre>${esc(result.stderr)}</pre></div>` : ''}
      </div>`;
      return `<div class="tv-code-result-item ${result.passed ? 'pass' : 'fail'}"><span class="tv-code-status">${icon}</span>Тест ${result.index}${detail}</div>`;
    })
    .join('');

  // Прерванный по времени прогон — это не «есть ошибки»: часть тестов
  // просто не успела отработать, и говорить надо именно об этом
  const allPassed = data.passed === data.total;
  const verdict = data.interrupted
    ? '<span class="tv-code-verdict fail">Не уложилось по времени</span>'
    : `<span class="tv-code-verdict ${allPassed ? 'pass' : 'fail'}">${allPassed ? 'Принято' : 'Есть ошибки'}</span>`;

  box.innerHTML = `
    <div class="tv-code-results-wrap">
      <div class="tv-code-results-header">
        <span><strong>${data.passed} / ${data.total}</strong> тестов пройдено</span>
        ${sampleOnly ? '' : verdict}
      </div>
      ${data.interrupted && data.message ? `<div class="tv-code-note">${esc(data.message)}</div>` : ''}
      <div class="tv-code-result-list">${items}</div>
    </div>`;
}

async function submitTest(button) {
  button.disabled = true;
  button.textContent = 'Отправка…';
  try {
    const data = await api.post(`/api/v1/tests/${testId}/submit/${PREVIEW_QUERY}`, { answers: state.answers });
    Object.assign(state, { submitted: true, score: data.score, total: data.total, results: data.results ?? [] });
    renderToc();
    renderResults();
  } catch (error) {
    button.disabled = false;
    button.innerHTML = `${ICONS.check}Завершить тест`;
    toast(error.message);
  }
}

function resultHint(result, page) {
  if (result.correct) return '';
  if (result.type === 'input') return `Правильный ответ: ${esc(result.correct_text)}`;
  if (result.type === 'quiz') {
    const correct = (page?.answers ?? [])
      .filter((answer) => result.correct_answer_ids.includes(answer.id))
      .map((answer) => esc(answer.text));
    return `Правильно: ${correct.join(', ')}`;
  }
  return '';
}

function renderResults() {
  const percent = state.total ? Math.round((state.score / state.total) * 100) : 0;
  const passed = percent >= PASS_PERCENT;
  const items = state.results
    .map((result) => {
      const page = state.pages.find((item) => item.id === result.page_id);
      const hint = resultHint(result, page);
      return `
      <div class="tv-result-item ${result.correct ? 'correct' : 'incorrect'}">
        <div class="tv-result-item-title">${result.correct ? ICONS.check : ICONS.cross}${esc(page?.title || 'Вопрос')}</div>
        ${hint ? `<div class="tv-result-item-hint">${hint}</div>` : ''}
      </div>`;
    })
    .join('');

  main.innerHTML = `
    <div class="tv-results">
      <div class="tv-score-circle ${passed ? 'pass' : 'fail'}">${percent}%</div>
      <div class="tv-result-title">${passed ? 'Тест пройден!' : 'Тест не пройден'}</div>
      <div class="tv-result-sub">${state.score} из ${state.total} правильных ответов</div>
      ${items ? `<div class="tv-result-items">${items}</div>` : ''}
      <a href="${isPreview ? `/constructor/${testId}/` : '/tests/'}" class="tv-btn">${isPreview ? 'Вернуться в конструктор' : 'Все тесты'}</a>
    </div>`;
  renderProgress();
}

/* Страница перерисовывается целиком — обработчики висят на контейнерах */

main.addEventListener('change', (event) => {
  const group = event.target.closest('[data-quiz]');
  if (!group) return;
  state.answers[group.dataset.quiz] = [...group.querySelectorAll('input:checked')].map((input) => Number(input.value));
  group
    .querySelectorAll('.tv-answer-label')
    .forEach((label) => label.classList.toggle('selected', label.querySelector('input').checked));
  renderToc();
});

main.addEventListener('input', (event) => {
  const field = event.target.closest('[data-input]');
  if (!field) return;
  state.answers[field.dataset.input] = field.value;
  renderToc();
});

main.addEventListener('click', (event) => {
  const button = event.target.closest('[data-nav]');
  if (!button) return;
  const { nav } = button.dataset;
  if (nav === 'prev') goTo(state.current - 1);
  else if (nav === 'next') goTo(state.current + 1);
  else submitTest(button);
});

byId('tv-toc-items').addEventListener('click', (event) => {
  const item = event.target.closest('[data-page-index]');
  if (!item) return;
  setTocOpen(false);
  goTo(Number(item.dataset.pageIndex));
});
document
  .querySelectorAll('[data-toc-open]')
  .forEach((button) => button.addEventListener('click', () => setTocOpen(true)));
document
  .querySelectorAll('[data-toc-close]')
  .forEach((button) => button.addEventListener('click', () => setTocOpen(false)));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setTocOpen(false);
});

// Ответы не сохраняются до завершения — предупреждаем об уходе со страницы
addEventListener('beforeunload', (event) => {
  if (!state.submitted && scoredPages().some(isAnswered)) event.preventDefault();
});

if (isPreview) {
  byId('tv-preview-badge').hidden = false;
  const back = byId('tv-back-to-editor');
  back.href = `/constructor/${testId}/`;
  back.hidden = false;
}

try {
  const { test, pages = [] } = await api.get(`/api/v1/tests/${testId}/view/${PREVIEW_QUERY}`);
  state.pages = pages;
  byId('tv-test-title').textContent = test.title;
  renderToc();
  renderPage();
} catch (error) {
  main.innerHTML = `<div class="tv-loading">${esc(error.message || 'Не удалось загрузить тест.')}</div>`;
}
