/* Каталог компаний.
 *
 * Конструкция страницы общая с каталогом статей: шапка → поиск → чипы фильтров →
 * сетка с боковой панелью. Оформление карточки своё — у компании нет обложки,
 * поэтому карточка построена вокруг логотипа и названия, как визитка.
 *
 * Переключателя «только верифицированные» здесь нет: API отдаёт только
 * одобренные компании, поэтому фильтр не отсекал ничего.
 */
(() => {
  const PER_PAGE = 6;

  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const initial = name => (name || '?').trim()[0].toUpperCase();
  const el = id => document.getElementById(id);

  function testsLabel(n) {
    if (!n) return 'Нет тестов';
    const m10 = n % 10, m100 = n % 100;
    if (m100 >= 11 && m100 <= 19) return `${n} тестов`;
    if (m10 === 1) return `${n} тест`;
    if (m10 >= 2 && m10 <= 4) return `${n} теста`;
    return `${n} тестов`;
  }

  function companiesLabel(n) {
    const m10 = n % 10, m100 = n % 100;
    if (m100 >= 11 && m100 <= 19) return `${n} компаний`;
    if (m10 === 1) return `${n} компания`;
    if (m10 >= 2 && m10 <= 4) return `${n} компании`;
    return `${n} компаний`;
  }

  const ICON_TESTS = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
  const ICON_STAR = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6.5 7 .9-5 4.8 1.2 7-6.2-3.4L5.8 21 7 14.2 2 9.4l7-.9L12 2z"/></svg>';

  function ratingHtml(company) {
    if (company.avg_rating === null || company.avg_rating === undefined) return '';
    return `<span class="co-stat co-rating">${ICON_STAR}${company.avg_rating}</span>`;
  }

  function logoHtml(company) {
    const inner = company.avatar_url
      ? `<img src="${esc(company.avatar_url)}" alt="">`
      : esc(initial(company.name));
    return `<div class="co-logo">${inner}</div>`;
  }

  /* ── Состояние ──────────────────────────────────────────────────── */

  let all = [];
  let search = '';
  let industry = 'all';
  let shown = PER_PAGE;

  function visible() {
    const query = search.trim().toLowerCase();
    return all.filter(c => {
      if (industry !== 'all' && c.industry !== industry) return false;
      if (!query) return true;
      return `${c.name} ${c.description} ${c.city} ${c.industry}`.toLowerCase().includes(query);
    });
  }

  /* ── Отрисовка ──────────────────────────────────────────────────── */

  function cardHtml(company) {
    const meta = [company.industry, company.city].filter(Boolean).join(' · ');
    const description = company.description || 'Компания пока не добавила описание.';

    return `
      <a class="card co-card" href="${esc(company.profile_url)}">
        <div class="card-body">
          <div class="co-head">
            ${logoHtml(company)}
            <div class="co-head-text">
              <div class="co-name">
                <span>${esc(company.name)}</span>
                <svg class="co-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" title="Проверена"><path d="M5 13l4 4L19 7"/></svg>
              </div>
              ${meta ? `<div class="co-meta">${esc(meta)}</div>` : ''}
            </div>
          </div>
          <div class="card-excerpt">${esc(description)}</div>
          <div class="card-footer">
            <span class="co-stat">${ICON_TESTS}${esc(testsLabel(company.tests_count))}</span>
            <div class="card-meta">${ratingHtml(company)}</div>
          </div>
        </div>
      </a>`;
  }

  function renderGrid() {
    const list = visible();
    const grid = el('co-grid');

    el('co-count').textContent = list.length ? companiesLabel(list.length) : '';

    if (!list.length) {
      grid.innerHTML = `<div class="state-msg">${
        search ? `По запросу «${esc(search)}» ничего не нашлось` : 'Компаний пока нет'
      }</div>`;
      el('load-more-row').style.display = 'none';
      return;
    }

    grid.innerHTML = list.slice(0, shown).map(cardHtml).join('');
    el('load-more-row').style.display = list.length > shown ? '' : 'none';
  }

  function renderIndustries() {
    const counts = {};
    for (const c of all) {
      if (c.industry) counts[c.industry] = (counts[c.industry] || 0) + 1;
    }
    const names = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name]) => name);

    const chips = el('industries');
    chips.querySelectorAll('.cr-chip').forEach(node => node.remove());
    const countEl = el('industries-count');

    const makeChip = (value, label) => {
      const button = document.createElement('button');
      button.className = 'cr-chip' + (industry === value ? ' active' : '');
      button.textContent = label;
      button.addEventListener('click', () => selectIndustry(value));
      chips.insertBefore(button, countEl);
    };

    makeChip('all', 'Все');
    names.forEach(name => makeChip(name, name));

  }

  function renderTrending() {
    const top = [...all].filter(c => c.tests_count > 0)
      .sort((a, b) => b.tests_count - a.tests_count).slice(0, 5);
    const list = el('trending-list');

    if (!top.length) {
      list.innerHTML = '<div style="font-size:13px;color:var(--muted);">Пока никто не опубликовал тесты</div>';
      return;
    }

    list.innerHTML = top.map((c, i) => `
      <a class="trending-item" href="${esc(c.profile_url)}">
        <span class="trending-num">${i + 1}</span>
        <span style="min-width:0;">
          <div class="trending-title">${esc(c.name)}</div>
          <div class="trending-meta">${esc(testsLabel(c.tests_count))}</div>
        </span>
      </a>`).join('');
  }

  function selectIndustry(value) {
    industry = value;
    shown = PER_PAGE;
    renderIndustries();
    renderGrid();
  }

  /* ── Запуск ─────────────────────────────────────────────────────── */

  el('search-input').addEventListener('input', event => {
    search = event.target.value;
    shown = PER_PAGE;
    renderGrid();
  });

  el('btn-load').addEventListener('click', () => {
    shown += PER_PAGE;
    renderGrid();
  });

  // Кнопку «Стать компанией» показываем только тем, кто ещё не вошёл
  fetch('/api/v1/auth/me/')
    .then(r => r.json())
    .then(data => {
      if (!data.ok || !data.account) el('btn-join').style.display = '';
    })
    .catch(() => {});

  fetch('/api/v1/companies/')
    .then(r => r.json())
    .then(data => {
      if (!data.ok) throw new Error();
      all = data.companies || [];
      renderIndustries();
      renderTrending();
      renderGrid();
    })
    .catch(() => {
      el('co-grid').innerHTML = '<div class="state-msg">Не удалось загрузить компании</div>';
    });
})();
