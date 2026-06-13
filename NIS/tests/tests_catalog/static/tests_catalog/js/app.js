(() => {
  const LEVEL_COLORS = {
    junior: { bg: 'var(--green-soft)', color: 'var(--green-text)' },
    middle: { bg: 'var(--amber-soft)', color: 'var(--amber-text)' },
    senior: { bg: 'var(--brand-soft)', color: 'var(--brand-text)' },
  };

  const CAT_LABELS = {
    frontend: 'Frontend', backend: 'Backend',
    devops: 'DevOps', analytics: 'Аналитика', other: 'Другое',
  };

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function pluralQ(n) {
    if (n % 10 === 1 && n % 100 !== 11) return n + ' вопрос';
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return n + ' вопроса';
    return n + ' вопросов';
  }

  function pluralT(n) {
    if (n % 10 === 1 && n % 100 !== 11) return n + ' тест';
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return n + ' теста';
    return n + ' тестов';
  }

  let allTests = [];
  let activeLevel = 'all';
  let activeCat = 'all';

  function filtered() {
    return allTests.filter(t =>
      (activeLevel === 'all' || t.level === activeLevel) &&
      (activeCat === 'all' || t.category === activeCat)
    );
  }

  function render() {
    const list = filtered();
    document.getElementById('count').textContent = list.length ? pluralT(list.length) : '';
    const grid = document.getElementById('grid');

    if (!list.length) {
      grid.innerHTML = `<div class="empty"><div class="empty-title">Тестов не найдено</div><div class="empty-sub">Попробуйте изменить фильтры</div></div>`;
      return;
    }

    grid.innerHTML = list.map(t => {
      const initial = esc((t.owner_name || t.owner_username || '?')[0].toUpperCase());
      const lc = LEVEL_COLORS[t.level] || null;
      const levelBadge = lc && t.level
        ? `<span class="card-level" style="background:${lc.bg};color:${lc.color};">${esc({ junior: 'Junior', middle: 'Middle', senior: 'Senior' }[t.level] || t.level)}</span>`
        : '';
      const catLabel = CAT_LABELS[t.category] || t.category || '';
      return `
        <div class="card">
          <div class="card-header">
            <span class="card-company-icon">${initial}</span>
            <span class="card-company">${esc(t.owner_name || t.owner_username)}</span>
            ${levelBadge}
          </div>
          <div class="card-title">${esc(t.title)}</div>
          ${t.description ? `<div class="card-desc">${esc(t.description)}</div>` : '<div class="card-desc"></div>'}
          <div class="card-footer">
            <span class="card-questions">${pluralQ(t.page_count)}</span>
            ${catLabel ? `<span class="card-category">${esc(catLabel)}</span>` : ''}
          </div>
          <a href="${esc(t.url)}" class="btn-start">Начать тест</a>
        </div>`;
    }).join('');
  }

  document.querySelectorAll('[data-level]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeLevel = btn.dataset.level;
      document.querySelectorAll('[data-level]').forEach(b => b.classList.toggle('active', b === btn));
      render();
    });
  });

  document.querySelectorAll('[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCat = btn.dataset.cat;
      document.querySelectorAll('[data-cat]').forEach(b => b.classList.toggle('active', b === btn));
      render();
    });
  });

  // Show "Создать тест" for company accounts
  fetch('/api/v1/auth/me/')
    .then(r => r.json())
    .then(data => {
      if (data.ok && data.account && data.account.role === 'company') {
        const btn = document.getElementById('btn-create');
        if (btn) btn.hidden = false;
      }
    })
    .catch(() => {});

  fetch('/api/v1/tests/catalog/')
    .then(r => r.json())
    .then(data => {
      if (!data.ok) throw new Error();
      allTests = data.tests || [];
      render();
    })
    .catch(() => {
      document.getElementById('grid').innerHTML = `<div class="empty"><div class="empty-title">Не удалось загрузить тесты</div><div class="empty-sub">Попробуйте обновить страницу</div></div>`;
    });
})();
