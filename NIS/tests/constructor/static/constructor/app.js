/* Конструктор теста: страница «Информация», вопросы трёх типов, задачи на код.
   Тест живёт в памяти страницы до сохранения; первая страница — виртуальная
   «Информация о тесте», на сервер она не уходит. */
import { api, byId, confirmDialog, esc, pageData, toast } from 'alfa/core';

const page = pageData();
const TYPE_LABELS = { info: 'Инфо', text: 'Текст', quiz: 'Выбор', input: 'Ввод', code: 'Код' };
const DEFAULT_TIME_LIMIT = 5;
const ICONS = {
  info: '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 1 0 20A10 10 0 0 1 12 2zm1 9h-2v6h2v-6zm0-4h-2v2h2V7z"/></svg>',
  remove: (size) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  tick: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>',
};

const state = {
  testId: page.testId || null,
  ownerUsername: page.ownerUsername || '',
  title: '',
  description: '',
  level: '',
  category: '',
  pages: [],
  current: -1,
  dirty: false,
  saving: false,
  published: false,
  // Тест не загрузился: форма пустая, и сохранение стёрло бы вопросы
  loadFailed: false,
};

const currentPage = () => state.pages[state.current];
const realPages = () => state.pages.filter((item) => item.type !== 'info');
const emptyAnswers = (count = 4) =>
  Array.from({ length: count }, (_, order) => ({ text: '', is_correct: false, order }));
const infoPage = () => ({ type: 'info', title: 'Информация о тесте', content: '', answers: [], page_meta: {} });

const serialize = () => ({
  owner_username: state.ownerUsername,
  title: state.title,
  description: state.description,
  level: state.level,
  category: state.category,
  pages: realPages().map((item, order) => ({
    ...(item.id && { id: item.id }),
    order,
    type: item.type,
    title: item.title,
    content: item.content,
    page_meta: item.page_meta ?? {},
    answers: (item.answers ?? []).map((answer, answerOrder) => ({
      ...(answer.id && { id: answer.id }),
      text: answer.text,
      is_correct: answer.is_correct,
      order: answerOrder,
    })),
  })),
});

function applyTest(test) {
  Object.assign(state, {
    testId: test.id,
    title: test.title,
    description: test.description ?? '',
    level: test.level || test.stats?.level || '',
    category: test.category || test.stats?.category || '',
    published: test.status === 'published',
    ownerUsername: state.ownerUsername || test.owner_username || '',
    pages: [
      infoPage(),
      ...(test.pages ?? []).map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        content: item.content,
        page_meta: item.page_meta ?? {},
        answers: (item.answers ?? []).map(({ id, text, is_correct: isCorrect, order }) => ({
          id,
          text,
          is_correct: isCorrect,
          order,
        })),
      })),
    ],
  });
}

/* Сервер присвоил новым страницам и вариантам id — переносим их к себе,
   иначе следующее сохранение создало бы их заново */
function applySavedIds(saved) {
  state.testId = saved.id;
  state.published = saved.status === 'published';
  realPages().forEach((item, index) => {
    const savedPage = saved.pages?.[index];
    if (!savedPage) return;
    item.id = savedPage.id;
    item.answers?.forEach((answer, answerIndex) => {
      const savedAnswer = savedPage.answers?.[answerIndex];
      if (savedAnswer) answer.id = savedAnswer.id;
    });
  });
}

/* Ошибки показываются уведомлением, в шапке — только ход работы: «Сохранение…», «Черновик» */
function setStatus(message = '', kind = '') {
  const status = byId('cst-save-status');
  if (kind === 'error') {
    toast(message);
    status.textContent = '';
    return;
  }
  status.textContent = message;
  status.title = message;
  status.className = `save-status${kind ? ` ${kind}` : ''}`;
}

function syncButtons() {
  byId('cst-save-btn').disabled = !state.dirty || !state.title.trim() || state.saving;
  const publish = byId('cst-publish-btn');
  publish.textContent = state.published ? 'Опубликован' : 'Опубликовать';
  publish.disabled = state.published || !state.testId || !realPages().length;
  byId('cst-preview-btn').disabled = !state.testId;
  // Статистика есть только у опубликованного теста: черновик никто не проходил
  const stats = byId('cst-stats-btn');
  stats.hidden = !state.testId || !state.published;
  if (state.testId) stats.href = `/constructor/${state.testId}/stats/`;
}

function markDirty() {
  state.dirty = true;
  if (!state.published) setStatus();
  syncButtons();
}

/* true — только если тест действительно сохранён: публикация
   и предпросмотр по этому признаку решают, можно ли идти дальше */
async function save() {
  if (state.loadFailed) {
    setStatus('Тест не загрузился — обновите страницу, иначе сохранение сотрёт вопросы', 'error');
    return false;
  }
  if (state.saving || !state.title.trim()) return false;
  state.saving = true;
  state.dirty = false;
  setStatus('Сохранение…');
  try {
    const { test } = state.testId
      ? await api.put(`/api/v1/tests/${state.testId}/`, serialize())
      : await api.post('/api/v1/tests/create/', serialize());
    applySavedIds(test);
    history.replaceState(null, '', `/constructor/${state.testId}/`);
    const button = byId('cst-save-btn');
    button.textContent = '✓ Сохранено';
    button.classList.add('saved');
    setTimeout(() => {
      button.textContent = 'Сохранить';
      button.classList.remove('saved');
    }, 1800);
    setStatus(state.published ? 'Опубликован' : 'Черновик');
    return true;
  } catch (error) {
    setStatus(error.message || 'Не удалось сохранить', 'error');
    state.dirty = true;
    return false;
  } finally {
    state.saving = false;
    syncButtons();
  }
}

async function publish() {
  if (!state.testId || state.published) return;
  if (state.dirty && !(await save())) return;
  setStatus('Публикация…');
  try {
    await api.post(`/api/v1/tests/${state.testId}/publish/`);
    state.published = true;
    setStatus('Опубликован', 'ok');
  } catch (error) {
    setStatus(error.message || 'Не удалось опубликовать', 'error');
  }
  syncButtons();
}

function renderPageList() {
  byId('cst-pages-list').innerHTML = state.pages
    .map((item, index) => {
      const isInfo = item.type === 'info';
      return `
      <div class="page-item ${index === state.current ? 'active' : ''}" data-page="${index}">
        <span class="page-num">${isInfo ? ICONS.info : index}</span>
        <div class="page-item-body">
          <div class="page-title">${esc(item.title || 'Без названия')}</div>
          <div class="page-type">${TYPE_LABELS[item.type] ?? item.type}</div>
        </div>
        ${isInfo ? '' : `<button type="button" class="page-del-btn" data-delete-page="${index}" title="Удалить" aria-label="Удалить страницу">${ICONS.remove(10)}</button>`}
      </div>`;
    })
    .join('');
}

function switchPage(index) {
  state.current = index;
  renderPageList();
  renderEditor();
}

function addPage() {
  state.pages.push({
    type: 'quiz',
    title: `Вопрос ${realPages().length + 1}`,
    content: '',
    answers: emptyAnswers(),
    page_meta: {},
  });
  switchPage(state.pages.length - 1);
  markDirty();
}

async function deletePage(index) {
  const item = state.pages[index];
  if (!item || item.type === 'info') return;
  // Один промах по крестику стирал готовый вопрос без следа
  const filled = item.title?.trim() || item.content?.trim() || item.answers?.some((answer) => answer.text?.trim());
  if (
    filled &&
    !(await confirmDialog({
      title: 'Удалить страницу?',
      text: `«${item.title || 'Без названия'}» пропадёт из теста после сохранения.`,
      confirmLabel: 'Удалить',
    }))
  )
    return;

  state.pages.splice(index, 1);
  // Курсор держим на той же странице: при удалении страницы выше индекс съезжал
  if (index < state.current) state.current -= 1;
  state.current = Math.min(state.current, state.pages.length - 1);
  markDirty();
  renderPageList();
  renderEditor();
}

function setType(type) {
  const item = currentPage();
  if (!item || item.type === type || item.type === 'info') return;
  item.type = type;
  item.answers = [];
  item.page_meta = type === 'code' ? { language: 'python', time_limit: DEFAULT_TIME_LIMIT, test_cases: [] } : {};
  markDirty();
  renderEditor();
  renderPageList();
}

function syncInfoToggles() {
  document
    .querySelectorAll('#info-level .toggle-btn')
    .forEach((button) => button.classList.toggle('active', button.dataset.value === state.level));
  document
    .querySelectorAll('#info-category .toggle-btn')
    .forEach((button) => button.classList.toggle('active', button.dataset.value === state.category));
}

const EDITORS = {
  info() {
    byId('p-info-desc').value = state.description;
    syncInfoToggles();
  },
  text(item) {
    byId('p-title').value = item.title ?? '';
    byId('p-content').value = item.content ?? '';
  },
  quiz(item) {
    byId('p-question-choice').value = item.title ?? '';
    if (!item.answers.length) item.answers = emptyAnswers();
    renderOptions();
  },
  input(item) {
    byId('p-question-input').value = item.title ?? '';
    // Все принимаемые ответы — одной строкой через запятую, как обещает подсказка
    byId('p-answer').value = (item.answers ?? []).map((answer) => answer.text).join(', ');
  },
  code(item) {
    byId('p-question-code').value = item.content ?? '';
    byId('ed-language').value = item.page_meta?.language || 'python';
    byId('ed-time-limit').value = item.page_meta?.time_limit || DEFAULT_TIME_LIMIT;
    renderTestCases();
  },
};

function renderEditor() {
  const item = currentPage();
  const panel = item?.type ?? 'empty';
  byId('type-tabs').hidden = panel === 'info' || panel === 'empty';
  document.querySelectorAll('#type-tabs .tab-btn').forEach((button) => {
    button.disabled = !item || item.type === 'info';
    button.classList.toggle('active', button.dataset.type === item?.type);
  });
  document
    .querySelectorAll('[data-panel]')
    .forEach((element) => element.classList.toggle('active', element.dataset.panel === panel));
  if (item) EDITORS[item.type]?.(item);
}

function renderOptions() {
  byId('options-list').innerHTML = (currentPage()?.answers ?? [])
    .map(
      (answer, index) => `
    <div class="option-row">
      <div class="checkbox ${answer.is_correct ? 'checked' : ''}" data-toggle-correct="${index}" role="checkbox"
           aria-checked="${answer.is_correct}" tabindex="0">${answer.is_correct ? ICONS.tick : ''}</div>
      <input class="opt-input ${answer.is_correct ? 'correct' : ''}" data-option="${index}" value="${esc(answer.text)}" placeholder="Вариант ${index + 1}">
      <button type="button" class="opt-del-btn" data-delete-option="${index}" aria-label="Удалить вариант">${ICONS.remove(12)}</button>
    </div>`,
    )
    .join('');
}

function renderTestCases() {
  const cases = currentPage()?.page_meta?.test_cases ?? [];
  byId('tc-list').innerHTML = cases.length
    ? cases
        .map(
          (testCase, index) => `
      <div class="tc-row">
        <div>
          <div class="tc-mini-label">Ввод (stdin)</div>
          <input class="inp-sm" data-case="${index}" data-field="input" value="${esc(testCase.input)}" placeholder="пусто — если ввод не нужен">
        </div>
        <div>
          <div class="tc-mini-label">Ожидаемый вывод</div>
          <input class="inp-sm" data-case="${index}" data-field="expected" value="${esc(testCase.expected)}" placeholder="ожидаемый stdout">
        </div>
        <button type="button" class="btn-remove-tc" data-delete-case="${index}" aria-label="Удалить тест-кейс">${ICONS.remove(13)}</button>
      </div>`,
        )
        .join('')
    : '<div class="empty-tc">Добавьте хотя бы один тест-кейс</div>';
}

function codeMeta() {
  const item = currentPage();
  item.page_meta ??= {};
  item.page_meta.test_cases ??= [];
  return item.page_meta;
}

async function importTestCases(file) {
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) throw new Error('ожидается массив');
    codeMeta().test_cases = parsed.map((testCase) => ({
      input: String(testCase.input ?? ''),
      expected: String(testCase.expected ?? ''),
      is_sample: Boolean(testCase.is_sample),
    }));
    renderTestCases();
    markDirty();
    setStatus(`Загружено тест-кейсов: ${parsed.length}`, 'ok');
  } catch (error) {
    setStatus(`Не удалось разобрать JSON: ${error.message}`, 'error');
  }
}

/* Поле редактора → свойство текущей страницы */
function bindField(id, apply, { refreshList = false } = {}) {
  byId(id).addEventListener('input', (event) => {
    const item = currentPage();
    if (!item) return;
    apply(item, event.target.value);
    markDirty();
    if (refreshList) renderPageList();
  });
}

function bindHandlers() {
  byId('cst-title').addEventListener('input', (event) => {
    state.title = event.target.value;
    markDirty();
  });
  byId('cst-add-page').addEventListener('click', addPage);
  byId('cst-save-btn').addEventListener('click', save);
  byId('cst-publish-btn').addEventListener('click', publish);
  byId('cst-preview-btn').addEventListener('click', async () => {
    // Несохранённые правки в предпросмотр не попадут — не уходим, пока сохранение не прошло
    if ((state.dirty || !state.testId) && !(await save())) return;
    location.assign(`/tests/${state.testId}/?preview=1`);
  });
  document
    .querySelectorAll('#type-tabs .tab-btn')
    .forEach((button) => button.addEventListener('click', () => setType(button.dataset.type)));

  byId('cst-pages-list').addEventListener('click', (event) => {
    const remove = event.target.closest('[data-delete-page]');
    if (remove) {
      deletePage(Number(remove.dataset.deletePage));
      return;
    }
    const item = event.target.closest('[data-page]');
    if (item) switchPage(Number(item.dataset.page));
  });

  // Информация о тесте
  byId('p-info-desc').addEventListener('input', (event) => {
    state.description = event.target.value;
    markDirty();
  });
  [
    ['info-level', 'level'],
    ['info-category', 'category'],
  ].forEach(([id, key]) =>
    byId(id).addEventListener('click', (event) => {
      const button = event.target.closest('.toggle-btn');
      if (!button) return;
      state[key] = button.dataset.value;
      syncInfoToggles();
      markDirty();
    }),
  );

  // Текст и вопросы
  bindField(
    'p-title',
    (item, value) => {
      item.title = value;
    },
    { refreshList: true },
  );
  bindField('p-content', (item, value) => {
    item.content = value;
  });
  bindField(
    'p-question-choice',
    (item, value) => {
      item.title = value;
    },
    { refreshList: true },
  );
  bindField(
    'p-question-input',
    (item, value) => {
      item.title = value;
    },
    { refreshList: true },
  );
  /* «Несколько вариантов через запятую»: сервер сравнивает ответ участника
     с каждым вариантом по отдельности, поэтому строку режем на варианты */
  bindField('p-answer', (item, value) => {
    item.answers = value
      .split(',')
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text, order) => ({ text, is_correct: true, order }));
  });

  // Варианты ответа
  const options = byId('options-list');
  const toggleCorrect = (target) => {
    const box = target.closest('[data-toggle-correct]');
    if (!box) return;
    const answer = currentPage().answers[Number(box.dataset.toggleCorrect)];
    answer.is_correct = !answer.is_correct;
    renderOptions();
    markDirty();
  };
  options.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-delete-option]');
    if (remove) {
      currentPage().answers.splice(Number(remove.dataset.deleteOption), 1);
      renderOptions();
      markDirty();
      return;
    }
    toggleCorrect(event.target);
  });
  options.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') toggleCorrect(event.target);
  });
  options.addEventListener('input', (event) => {
    const input = event.target.closest('[data-option]');
    if (!input) return;
    currentPage().answers[Number(input.dataset.option)].text = input.value;
    markDirty();
  });
  byId('btn-add-option').addEventListener('click', () => {
    const item = currentPage();
    item.answers.push({ text: '', is_correct: false, order: item.answers.length });
    renderOptions();
    markDirty();
  });

  // Задача на код
  bindField('p-question-code', (item, value) => {
    item.content = value;
  });
  byId('ed-language').addEventListener('change', (event) => {
    codeMeta().language = event.target.value;
    markDirty();
  });
  byId('ed-time-limit').addEventListener('input', (event) => {
    codeMeta().time_limit = parseInt(event.target.value, 10) || DEFAULT_TIME_LIMIT;
    markDirty();
  });
  byId('ed-add-tc').addEventListener('click', () => {
    codeMeta().test_cases.push({ input: '', expected: '', is_sample: true });
    renderTestCases();
    markDirty();
  });
  byId('tc-list').addEventListener('input', (event) => {
    const input = event.target.closest('[data-case]');
    if (!input) return;
    codeMeta().test_cases[Number(input.dataset.case)][input.dataset.field] = input.value;
    markDirty();
  });
  byId('tc-list').addEventListener('click', (event) => {
    const remove = event.target.closest('[data-delete-case]');
    if (!remove) return;
    codeMeta().test_cases.splice(Number(remove.dataset.deleteCase), 1);
    renderTestCases();
    markDirty();
  });
  byId('ed-tc-file').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    if (file && currentPage()) await importTestCases(file);
    event.target.value = '';
  });

  // Тест живёт в памяти страницы до нажатия «Сохранить»
  addEventListener('beforeunload', (event) => {
    if (state.dirty) event.preventDefault();
  });
}

async function nextTestTitle() {
  if (!state.ownerUsername) return 'Тест 1';
  const { tests = [] } = await api
    .get(`/api/v1/tests/?owner=${encodeURIComponent(state.ownerUsername)}`)
    .catch(() => ({}));
  return `Тест ${tests.length + 1}`;
}

// Кабинет, куда ведёт «назад», зависит от роли автора
for (const id of ['cst-back', 'cst-back-tests']) byId(id).href = page.backUrl || '/cabinet/user/tests/';
bindHandlers();

if (state.testId) {
  setStatus('Загрузка…');
  try {
    const { test } = await api.get(`/api/v1/tests/${state.testId}/`);
    applyTest(test);
    setStatus(test.status === 'published' ? 'Опубликован' : 'Черновик');
  } catch {
    state.loadFailed = true;
    setStatus('Не удалось загрузить тест. Обновите страницу — не сохраняйте.', 'error');
  }
} else {
  // Новый тест: страница «Информация» и название по порядку
  state.pages = [infoPage()];
  state.title = await nextTestTitle();
  state.dirty = true;
}

byId('cst-title').value = state.title;
switchPage(0);
syncButtons();
