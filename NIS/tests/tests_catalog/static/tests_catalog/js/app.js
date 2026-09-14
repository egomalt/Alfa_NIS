/* Каталог тренировочных тестов.
 *
 * Конструкция страницы общая с каталогами статей и компаний: шапка → поиск →
 * чипы фильтров → сетка с боковой панелью. Оформление карточки своё: уровень
 * сложности вынесен в цветную полосу слева, потому что в каталоге заданий
 * именно сложность ищут глазами в первую очередь.
 *
 * Фильтры читаются из адреса (?q=, ?cat=, ?level=) — по таким ссылкам сюда
 * ведут поиск и чипы с главной страницы.
 */
(() => {
  const PER_PAGE = 9;

  const LEVEL_LABELS = { junior: 'Junior', middle: 'Middle', senior: 'Senior' };
  const CAT_LABELS = {
    frontend: 'Frontend', backend: 'Backend',
    devops: 'DevOps', analytics: 'Аналитика', other: 'Другое',
  };

  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const initial = name => (name || '?').trim()[0].toUpperCase();
  const el = id => document.getElementById(id);

  function questionsLabel(n) {
    const m10 = n % 10, m100 = n % 100;
    if (m100 >= 11 && m100 <= 19) return `${n} вопросов`;
    if (m10 === 1) return `${n} вопрос`;
    if (m10 >= 2 && m10 <= 4) return `${n} вопроса`;
    return `${n} вопросов`;
  }

  function testsLabel(n) {
    const m10 = n % 10, m100 = n % 100;
    if (m100 >= 11 && m100 <= 19) return `${n} тестов`;
    if (m10 === 1) return `${n} тест`;
    if (m10 >= 2 && m10 <= 4) return `${n} теста`;
    return `${n} тестов`;
  }

  function passedLabel(n) {
    if (!n) return 'ещё никто не проходил';
    const m10 = n % 10, m100 = n % 100;
    if (m100 >= 11 && m100 <= 19) return `${n} прошли`;
    if (m10 === 1) return `${n} прошёл`;
    return `${n} прошли`;
  }

  const ICON_Q = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
  const ICON_PEOPLE = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>';
  const ICON_PLAY = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

  /* ── Состояние ──────────────────────────────────────────────────── */

  const params = new URLSearchParams(location.search);
  let all = [];
  let level = params.get('level') || 'all';
  let category = params.get('cat') || 'all';
  let query = (params.get('q') || '').trim().toLowerCase();
  let shown = PER_PAGE;

  function visible() {
    return all.filter(t => {
      if (level !== 'all' && t.level !== level) return false;
      if (category !== 'all' && t.category !== category) return false;
      if (!query) return true;
      return `${t.title} ${t.description} ${t.owner_name} ${t.owner_username}`
        .toLowerCase().includes(query);
    });
  }

  /* ── Отрисовка ──────────────────────────────────────────────────── */

  function cardHtml(test) {
    const levelKey = LEVEL_LABELS[test.level] ? test.level : '';
    const levelBadge = levelKey
      ? `<span class="te-level te-level-${levelKey}">${LEVEL_LABELS[levelKey]}</span>`
      : '';
    const catLabel = CAT_LABELS[test.category] || test.category || '';
    const description = test.description || 'Автор не добавил описание к заданию.';

    return `
      <article class="card te-card"${levelKey ? ` data-level="${levelKey}"` : ''}>
        <div class="te-head">
          <span class="te-author-av">${esc(initial(test.owner_name || test.owner_username))}</span>
          <span class="te-author">${esc(test.owner_name || test.owner_username)}</span>
          ${levelBadge}
        </div>
        <div class="card-title">${esc(test.title || 'Без названия')}</div>
        <div class="card-excerpt">${esc(description)}</div>
        <div class="te-meta">
          <span class="co-stat">${ICON_Q}${esc(questionsLabel(test.page_count))}</span>
          <span class="co-stat">${ICON_PEOPLE}${esc(passedLabel(test.submissions))}</span>
          ${catLabel ? `<span class="te-cat">${esc(catLabel)}</span>` : ''}
        </div>
        <a class="te-start" href="${esc(test.url)}">Начать тест${ICON_PLAY}</a>
      </article>`;
  }

  function renderGrid() {
    const list = visible();
    const grid = el('grid');

    el('count').textContent = list.length ? testsLabel(list.length) : '';

    if (!list.length) {
      grid.innerHTML = `<div class="state-msg">${
        query ? `По запросу «${esc(query)}» ничего не нашлось` : 'Под выбранные фильтры ничего не подходит'
      }</div>`;
      el('load-more-row').style.display = 'none';
      return;
    }

    grid.innerHTML = list.slice(0, shown).map(cardHtml).join('');
    el('load-more-row').style.display = list.length > shown ? '' : 'none';
  }

  function renderTrending() {
    const top = [...all].filter(t => t.submissions > 0)
      .sort((a, b) => b.submissions - a.submissions).slice(0, 5);
    const list = el('trending-list');

    if (!top.length) {
      list.innerHTML = '<div style="font-size:13px;color:var(--muted);">Эти задания ещё никто не проходил</div>';
      return;
    }

    list.innerHTML = top.map((t, i) => `
      <a class="trending-item" href="${esc(t.url)}">
        <span class="trending-num">${i + 1}</span>
        <span style="min-width:0;">
          <div class="trending-title">${esc(t.title || 'Без названия')}</div>
          <div class="trending-meta">${esc(passedLabel(t.submissions))}</div>
        </span>
      </a>`).join('');
  }

  function syncChips() {
    document.querySelectorAll('[data-level]').forEach(b =>
      b.classList.toggle('active', b.dataset.level === level));
    document.querySelectorAll('[data-cat]').forEach(b =>
      b.classList.toggle('active', b.dataset.cat === category));
    const input = el('search-input');
    if (input && !input.value) input.value = params.get('q') || '';
  }

  /* ── Обработчики ────────────────────────────────────────────────── */

  document.querySelectorAll('[data-level]').forEach(button => {
    button.addEventListener('click', () => {
      level = button.dataset.level;
      shown = PER_PAGE;
      syncChips();
      renderGrid();
    });
  });

  document.querySelectorAll('[data-cat]').forEach(button => {
    button.addEventListener('click', () => {
      category = button.dataset.cat;
      shown = PER_PAGE;
      syncChips();
      renderGrid();
    });
  });

  el('search-input').addEventListener('input', event => {
    query = event.target.value.trim().toLowerCase();
    shown = PER_PAGE;
    renderGrid();
  });

  el('btn-load').addEventListener('click', () => {
    shown += PER_PAGE;
    renderGrid();
  });

  // Кнопку «Создать тест» видят только те, кто может завести тест
  fetch('/api/v1/auth/me/')
    .then(r => r.json())
    .then(data => {
      const role = data.ok && data.account ? data.account.role : null;
      if (role === 'company' || role === 'user') el('btn-create').style.display = '';
    })
    .catch(() => {});

  fetch('/api/v1/tests/catalog/')
    .then(r => r.json())
    .then(data => {
      if (!data.ok) throw new Error();
      all = data.tests || [];
      syncChips();
      renderTrending();
      renderGrid();
    })
    .catch(() => {
      el('grid').innerHTML = '<div class="state-msg">Не удалось загрузить тесты</div>';
    });
})();
