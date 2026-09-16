(function () {
  const BOOTSTRAP = window.ALFA_APP_BOOTSTRAP || {};
  const username = BOOTSTRAP.username;
  const CSRF = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

  let state = {
    candidate: null,
    tests: [],
    articles: [],
    contestHistory: [],
    myRatings: [],
    attempts: null,
  };

  /* ---------- utils ---------- */

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function initial(name) { return (name || '?').trim()[0].toUpperCase(); }
  function set(id, val) { const el = document.getElementById(id); if (el) el.textContent = String(val); }

  function formatDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch { return ''; }
  }
  function fmtNum(n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + ' тыс.';
    return String(n);
  }

  async function apiFetch(url, options = {}) {
    const isForm = options.body instanceof FormData;
    const res = await fetch(url, {
      headers: {
        'X-CSRFToken': CSRF(),
        ...(!isForm ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || 'Ошибка сервера');
    return data;
  }

  /* ---------- sidebar & tab switching ---------- */

  /* Навигация между разделами — переходы по ссылкам (отдельные адреса),
     активный раздел задаётся сервером через переменную page. */

  /* ---------- logout ---------- */

  /* ---------- avatar ---------- */

  async function uploadAvatar(file) {
    const body = new FormData();
    body.append('avatar', file);
    try {
      const data = await apiFetch(`/api/v1/candidates/${username}/avatar/`, { method: 'POST', body });
      state.candidate = data.candidate;
      renderSidebar();
      renderProfileTab();
    } catch (e) { alert(e.message); }
  }

  /* ---------- render sidebar ---------- */

  function renderSidebar() {
    const c = state.candidate;
    if (!c) return;
    const avEl = document.getElementById('ud-sidebar-av');
    if (avEl) {
      avEl.innerHTML = c.avatar
        ? `<img src="${esc(c.avatar)}" alt="">`
        : esc(initial(c.name));
    }
    set('ud-sidebar-name', c.name || c.username);
  }

  /* ---------- render profile tab ---------- */

  function renderProfileTab() {
    if (!document.getElementById('ud-profile-hero')) return;
    const c = state.candidate;
    if (!c) return;

    const avEl = document.getElementById('ud-profile-av');
    if (avEl) {
      avEl.innerHTML = c.avatar
        ? `<img src="${esc(c.avatar)}" alt="">`
        : esc(initial(c.name));
    }
    set('ud-profile-name', c.name || c.username);

    const roleEl = document.getElementById('ud-profile-role');
    if (roleEl) {
      const joinText = c.created_at ? `· на платформе с ${formatDate(c.created_at)}` : '';
      roleEl.textContent = `Кандидат ${joinText}`;
    }

    const bioEl = document.getElementById('ud-profile-bio');
    if (bioEl) {
      bioEl.innerHTML = c.bio
        ? `<p style="margin:0;">${esc(c.bio)}</p>`
        : `<p style="margin:0;color:var(--faint);">Нажмите «Редактировать», чтобы добавить информацию о себе.</p>`;
    }

    const skillsEl = document.getElementById('ud-profile-skills');
    if (skillsEl) {
      const skills = c.skills || [];
      skillsEl.innerHTML = skills.length
        ? skills.map(sk => `<span style="padding:5px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);font-size:13px;font-weight:500;color:var(--text-2);">${esc(sk)}</span>`).join('')
        : `<span style="font-size:13.5px;color:var(--faint);">Добавьте навыки в настройках профиля.</span>`;
    }

    const tests = state.tests;
    const articles = state.articles;
    const history = state.contestHistory;

    set('pstat-tests', tests.length);
    set('pstat-articles', articles.filter(a => a.status === 'published').length);
    set('pstat-contests', history.length);
    set('pstat-wins', history.filter(s => s.winner).length);

    const testDrafts = tests.filter(t => t.status === 'draft').length;
    set('sc-tests-sub', testDrafts > 0 ? `${testDrafts} черновика ждут завершения` : `${tests.length} тестов создано`);
    const totalViews = articles.reduce((s, a) => s + (a.views || 0), 0);
    set('sc-articles-sub', `${fmtNum(totalViews)} просмотров за всё время`);
    const pending = history.filter(s => s.status === 'pending').length;
    set('sc-contests-sub', pending > 0 ? `${pending} решение на проверке` : `${history.length} участий`);

    const profileHero = document.getElementById('ud-profile-hero');
    if (profileHero && !profileHero.dataset.avatarWired) {
      profileHero.dataset.avatarWired = '1';
      profileHero.style.cursor = 'default';
      const avBtn = document.getElementById('ud-profile-av');
      if (avBtn) {
        avBtn.style.cursor = 'pointer';
        avBtn.title = 'Сменить фото';
        avBtn.addEventListener('click', () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = e => { if (e.target.files[0]) uploadAvatar(e.target.files[0]); };
          input.click();
        });
      }
    }
  }

  /* ---------- render tests tab ---------- */

  let testsFilter = 'all';

  const TEST_STATUS_LABEL = { draft: 'Черновик', published: 'Опубликован' };

  const ICON_STATS = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-4"/></svg>';
  const ICON_EDIT = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  const ICON_DELETE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

  function formatDateCell(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return '—'; }
  }

  function testRowHtml(test) {
    // Черновик по публичному адресу отдаёт 404 — владельцу открываем предпросмотр
    const viewUrl = test.status === 'published'
      ? esc(test.url)
      : esc(test.url) + '?preview=1';
    // Статистика есть только у опубликованного: черновик никто не проходил
    const statsBtn = test.status === 'published'
      ? `<a class="action-icon-btn" href="${esc(test.edit_url)}stats/" title="Как проходят тест">${ICON_STATS}</a>`
      : '';
    return `<tr>
      <td><a href="${viewUrl}" target="_blank" rel="noopener">${esc(test.title || 'Без названия')}</a></td>
      <td data-label="Статус"><span class="status-pill ${esc(test.status)}">${esc(TEST_STATUS_LABEL[test.status] || test.status)}</span></td>
      <td data-label="Страниц">${test.page_count || 0}</td>
      <td data-label="Прохождений">${test.submissions || 0}</td>
      <td data-label="Создан">${esc(formatDateCell(test.created_at))}</td>
      <td><div class="action-row">
        ${statsBtn}
        <a class="action-icon-btn" href="${esc(test.edit_url)}" title="Редактировать">${ICON_EDIT}</a>
        <button type="button" class="action-icon-btn danger" data-delete-test="${test.id}" title="Удалить">${ICON_DELETE}</button>
      </div></td>
    </tr>`;
  }

  function renderTestsTab() {
    const body = document.getElementById('ud-tests-body');
    if (!body) return;

    const tests = state.tests;
    const subs = tests.reduce((s, t) => s + (t.submissions || 0), 0);
    // Плашки считают по всем тестам: это сводка, а не срез под фильтром
    set('tstat-total', tests.length);
    set('tstat-published', tests.filter(t => t.status === 'published').length);
    set('tstat-subs', subs);
    set('tstat-drafts', tests.filter(t => t.status === 'draft').length);

    const shown = testsFilter === 'all' ? tests : tests.filter(t => t.status === testsFilter);
    set('ud-tests-count', tests.length ? `${shown.length} из ${tests.length}` : '');

    const wrapper = document.getElementById('ud-tests-wrapper');
    const empty = document.getElementById('tests-empty');

    if (!shown.length) {
      body.innerHTML = '';
      wrapper.hidden = true;
      empty.hidden = false;
      // Пусто из-за фильтра и пусто вообще — разные сообщения
      set('tests-empty-title', tests.length ? 'Тестов не найдено' : 'Тестов пока нет');
      set('tests-empty-sub', tests.length
        ? 'Под выбранный фильтр ничего не подходит'
        : 'Соберите первый тест — его смогут пройти все желающие');
      document.getElementById('tests-empty-create').hidden = Boolean(tests.length);
      return;
    }

    body.innerHTML = shown.map(testRowHtml).join('');
    wrapper.hidden = false;
    empty.hidden = true;
  }

  document.getElementById('ud-tests-body')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-delete-test]');
    if (!btn) return;
    if (!confirm('Удалить тест? Это действие нельзя отменить.')) return;
    try {
      await apiFetch(`/api/v1/tests/${btn.dataset.deleteTest}/`, { method: 'DELETE' });
      state.tests = state.tests.filter(t => String(t.id) !== btn.dataset.deleteTest);
      renderTestsTab();
      renderProfileTab();
      renderStatsTab();
    } catch (err) { alert(err.message); }
  });

  document.getElementById('panel-tests')?.addEventListener('click', e => {
    const fbtn = e.target.closest('[data-tests-filter]');
    if (!fbtn) return;
    testsFilter = fbtn.dataset.testsFilter;
    document.querySelectorAll('[data-tests-filter]').forEach(b => b.classList.toggle('active', b.dataset.testsFilter === testsFilter));
    renderTestsTab();
  });

  /* ---------- render articles tab ---------- */

  const ARTICLE_STATUS_LABEL = { draft: 'Черновик', published: 'Опубликована' };

  function articleRowHtml(article) {
    // Черновик по публичному адресу отдаёт 404 — владельцу открываем предпросмотр
    const viewUrl = article.status === 'published'
      ? `/articles/${article.id}/`
      : `/cabinet/user/articles/${article.id}/preview/`;
    const editUrl = `/cabinet/user/articles/${article.id}/edit/`;
    // У опубликованной статьи важна дата публикации, у черновика её нет —
    // показываем, когда его завели
    const date = article.published_at || article.created_at;
    return `<tr>
      <td><a href="${viewUrl}" target="_blank" rel="noopener">${esc(article.title || 'Без названия')}</a></td>
      <td data-label="Статус"><span class="status-pill ${esc(article.status)}">${esc(ARTICLE_STATUS_LABEL[article.status] || article.status)}</span></td>
      <td data-label="Просмотры">${fmtNum(article.views || 0)}</td>
      <td data-label="Рейтинг">${article.likes || 0}</td>
      <td data-label="Дата">${esc(formatDateCell(date))}</td>
      <td><div class="action-row">
        <a class="action-icon-btn" href="${editUrl}" title="Редактировать">${ICON_EDIT}</a>
        <button type="button" class="action-icon-btn danger" data-delete-article="${article.id}" title="Удалить">${ICON_DELETE}</button>
      </div></td>
    </tr>`;
  }

  function renderArticlesTab() {
    const body = document.getElementById('ud-articles-body');
    if (!body) return;

    const articles = state.articles;
    // Плашки считают по всем статьям: это сводка, а не срез под фильтром
    set('astat-published', articles.filter(a => a.status === 'published').length);
    set('astat-drafts', articles.filter(a => a.status === 'draft').length);
    set('astat-views', fmtNum(articles.reduce((sum, a) => sum + (a.views || 0), 0)));
    set('astat-likes', fmtNum(articles.reduce((sum, a) => sum + (a.likes || 0), 0)));

    const shown = articlesFilter === 'all'
      ? articles
      : articles.filter(a => a.status === articlesFilter);
    set('ud-articles-count', articles.length ? `${shown.length} из ${articles.length}` : '');

    const wrapper = document.getElementById('ud-articles-wrapper');
    const empty = document.getElementById('tests-empty');

    if (!shown.length) {
      body.innerHTML = '';
      wrapper.hidden = true;
      empty.hidden = false;
      // Пусто из-за фильтра и пусто вообще — разные сообщения
      set('tests-empty-title', articles.length ? 'Статей не найдено' : 'Статей пока нет');
      set('tests-empty-sub', articles.length
        ? 'Под выбранный фильтр ничего не подходит'
        : 'Расскажите о своём опыте — статьи видят все кандидаты и компании');
      document.getElementById('tests-empty-create').hidden = Boolean(articles.length);
      return;
    }

    body.innerHTML = shown.map(articleRowHtml).join('');
    wrapper.hidden = false;
    empty.hidden = true;
  }

  let articlesFilter = 'all';

  document.getElementById('ud-articles-body')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-delete-article]');
    if (!btn) return;
    if (!confirm('Удалить статью? Это действие нельзя отменить.')) return;
    try {
      await apiFetch(`/api/v1/articles/${btn.dataset.deleteArticle}/delete/`, { method: 'DELETE' });
      state.articles = state.articles.filter(a => String(a.id) !== btn.dataset.deleteArticle);
      renderArticlesTab();
      renderProfileTab();
      renderStatsTab();
    } catch (err) { alert(err.message); }
  });

  document.getElementById('panel-articles')?.addEventListener('click', e => {
    const chip = e.target.closest('[data-articles-filter]');
    if (!chip) return;
    articlesFilter = chip.dataset.articlesFilter;
    document.querySelectorAll('[data-articles-filter]')
      .forEach(b => b.classList.toggle('active', b.dataset.articlesFilter === articlesFilter));
    renderArticlesTab();
  });

  /* ---------- render contests tab ---------- */

  const SUB_STATUS_LABEL = {
    pending: 'На проверке',
    accepted: 'Принято',
    rejected: 'Отклонено',
  };
  const ICON_OPEN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>';

  function formatDeadline(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    // Дедлайны по всему сайту пишутся ДД.ММ.ГГГГ
    return isNaN(d) ? '—' : d.toLocaleDateString('ru-RU');
  }

  function contestRowHtml(entry) {
    // Отличается не только цветом: у победы ещё и золотая обводка
    const verdict = entry.winner
      ? '<span class="status-pill winner">Победа</span>'
      : `<span class="status-pill ${esc(entry.status)}">${esc(SUB_STATUS_LABEL[entry.status] || entry.status)}</span>`;
    return `<tr>
      <td><a href="/contests/${entry.contest_id}/">${esc(entry.contest_title || 'Конкурс')}</a></td>
      <td data-label="Компания">${esc(entry.company_name || entry.company_username)}</td>
      <td data-label="Вердикт">${verdict}</td>
      <td data-label="Подано">${esc(formatDateCell(entry.submitted_at))}</td>
      <td data-label="Дедлайн">${esc(formatDeadline(entry.deadline))}</td>
      <td><div class="action-row">
        <a class="action-icon-btn" href="/cabinet/user/contests/${entry.id}/" title="Моё решение и вердикт">${ICON_OPEN}</a>
      </div></td>
    </tr>`;
  }

  function renderContestsTab() {
    const body = document.getElementById('ud-contests-body');
    if (!body) return;

    const history = state.contestHistory;
    // Плашки считают по всем участиям: это сводка, а не срез под фильтром
    set('cstat-total', history.length);
    set('cstat-wins', history.filter(s => s.winner).length);
    set('cstat-pending', history.filter(s => s.status === 'pending').length);
    set('cstat-accepted', history.filter(s => s.status === 'accepted').length);

    const shown = contestsFilter === 'all'
      ? history
      : contestsFilter === 'winner'
        ? history.filter(s => s.winner)
        : history.filter(s => s.status === contestsFilter);
    set('ud-contests-count', history.length ? `${shown.length} из ${history.length}` : '');

    const wrapper = document.getElementById('ud-contests-wrapper');
    const empty = document.getElementById('tests-empty');

    if (!shown.length) {
      body.innerHTML = '';
      wrapper.hidden = true;
      empty.hidden = false;
      // Пусто из-за фильтра и пусто вообще — разные сообщения
      set('tests-empty-title', history.length ? 'Ничего не найдено' : 'Участий пока нет');
      set('tests-empty-sub', history.length
        ? 'Под выбранный фильтр не подходит ни одно решение'
        : 'Выберите конкурс в каталоге и пришлите решение до дедлайна');
      document.getElementById('tests-empty-create').hidden = Boolean(history.length);
      return;
    }

    body.innerHTML = shown.map(contestRowHtml).join('');
    wrapper.hidden = false;
    empty.hidden = true;
  }

  let contestsFilter = 'all';

  document.getElementById('panel-contests')?.addEventListener('click', e => {
    const chip = e.target.closest('[data-contests-filter]');
    if (!chip) return;
    contestsFilter = chip.dataset.contestsFilter;
    document.querySelectorAll('[data-contests-filter]')
      .forEach(b => b.classList.toggle('active', b.dataset.contestsFilter === contestsFilter));
    renderContestsTab();
  });

  /* ---------- render stats tab ---------- */

  function fact(label, value) {
    return `<div><div class="ud-fact-label">${esc(label)}</div>`
      + `<div class="ud-fact-value">${esc(value)}</div></div>`;
  }

  function renderAttempts() {
    const factsEl = document.getElementById('ud-attempts-facts');
    const recentEl = document.getElementById('ud-attempts-recent');
    if (!factsEl) return;

    const a = state.attempts;
    if (!a || !a.started) {
      factsEl.innerHTML = '';
      recentEl.innerHTML = `<div class="ud-note">Вы ещё не проходили тесты.
        <a href="/tests/" style="color:var(--brand-text);">Каталог тестов</a> открыт всем.</div>`;
      set('ud-attempts-note', 'Здесь появятся ваши результаты');
      return;
    }

    set('ud-attempts-note', `Тест считается пройденным от ${a.pass_percent}% верных ответов`);
    factsEl.innerHTML = fact('Начато', a.started)
      + fact('Завершено', a.finished)
      + fact('Средний результат', a.avg_percent === null ? '—' : `${a.avg_percent}%`)
      + fact('Пройдено', a.pass_rate === null ? '—' : `${a.passed} · ${a.pass_rate}%`);

    if (!a.recent.length) {
      recentEl.innerHTML = '';
      return;
    }
    // Список последних прохождений: по среднему баллу не видно, растёт
    // результат или падает, а по нескольким последним — видно
    recentEl.innerHTML = `<div class="ud-mini-head">Последние прохождения</div>
      <div class="ud-mini-list">${a.recent.map(r => {
      const passed = r.percent !== null && r.percent >= a.pass_percent;
      const pill = r.percent === null
        ? '<span class="status-pill">—</span>'
        : `<span class="status-pill ${passed ? 'accepted' : 'rejected'}">${r.percent}%</span>`;
      return `<div class="ud-mini-row">
        <a class="ud-mini-title" href="/tests/${r.test_id}/">${esc(r.title || 'Тест')}</a>
        <span class="ud-mini-date">${esc(formatDateCell(r.finished_at))}</span>
        ${pill}
      </div>`;
    }).join('')}</div>`;
  }

  function renderStatsTab() {
    // Сверяемся с корнем панели, а не с внутренним блоком: сетку карты
    // теперь собирает скрипт, и проверка по ней отключала всю страницу
    if (!document.getElementById('panel-stats')) return;
    const tests = state.tests;
    const articles = state.articles;
    const history = state.contestHistory;
    const ratings = state.myRatings;
    const c = state.candidate;

    const daysOnPlatform = c && c.created_at
      ? Math.floor((Date.now() - new Date(c.created_at)) / 86400000)
      : 0;
    set('sstat-days', daysOnPlatform);
    set('sstat-passed', state.attempts ? state.attempts.passed : 0);
    set('sstat-contests', history.length);
    set('sstat-articles', articles.filter(a => a.status === 'published').length);

    renderAttempts();
    renderActivity();

    // Чем закончились участия в конкурсах
    const contestBarsEl = document.getElementById('ud-contest-bars');
    if (contestBarsEl) {
      if (!history.length) {
        contestBarsEl.innerHTML = '<div class="ud-note">Вы ещё не участвовали в конкурсах.</div>';
        set('ud-contests-note', 'Здесь появится разбор ваших участий');
      } else {
        const total = history.length;
        set('ud-contests-note', `Всего участий: ${total}`);
        const bars = [
          { label: 'Победы', n: history.filter(s => s.winner).length },
          { label: 'Принято', n: history.filter(s => s.status === 'accepted').length },
          { label: 'На проверке', n: history.filter(s => s.status === 'pending').length },
          { label: 'Отклонено', n: history.filter(s => s.status === 'rejected').length },
        ].filter(b => b.n > 0);
        contestBarsEl.innerHTML = bars.map(b => `
          <div class="ud-bar-row">
            <div class="ud-bar-label">${esc(b.label)}</div>
            <div class="ud-bar-track"><div class="ud-bar-fill" style="width:${Math.round(b.n / total * 100)}%"></div></div>
            <div class="ud-bar-val">${b.n}</div>
          </div>`).join('');
      }
    }

    // Своё авторство: тесты и статьи в одном блоке — раньше два раздела
    // повторяли плашки, которые стояли прямо над ними
    const authoredEl = document.getElementById('ud-authored-facts');
    if (authoredEl) {
      const passes = tests.reduce((sum, t) => sum + (t.submissions || 0), 0);
      const views = articles.reduce((sum, a) => sum + (a.views || 0), 0);
      const rating = articles.reduce((sum, a) => sum + (a.likes || 0), 0);
      authoredEl.innerHTML = fact('Тестов', `${tests.filter(t => t.status === 'published').length} из ${tests.length}`)
        + fact('Их прошли', passes)
        + fact('Статей', `${articles.filter(a => a.status === 'published').length} из ${articles.length}`)
        + fact('Просмотров', fmtNum(views))
        + fact('Рейтинг статей', rating);
    }

    // Оценки компаниям
    const ratingsEl = document.getElementById('ud-my-ratings');
    if (ratingsEl) {
      if (!ratings.length) {
        ratingsEl.innerHTML = '<div class="ud-note">Вы ещё не оценивали компании.</div>';
        set('ud-ratings-note', '');
      } else {
        const avg = (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(1);
        set('ud-ratings-note', `Средняя оценка: ${avg} из 5`);
        ratingsEl.innerHTML = ratings.map(r => {
          const stars = [1, 2, 3, 4, 5].map(i =>
            `<svg width="14" height="14" viewBox="0 0 24 24" fill="${i <= r.rating ? 'var(--amber-text)' : 'none'}" stroke="var(--amber-text)" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8-6.1-3.6-6.1 3.6 1.5-6.8-5.2-4.7 6.9-.7z"/></svg>`
          ).join('');
          return `<div class="ud-rating-row">
            <span class="ud-rating-av">${esc(initial(r.company_name))}</span>
            <a href="/${esc(r.company_username)}/" class="ud-mini-title" style="flex:1;">${esc(r.company_name)}</a>
            <div style="display:flex;gap:2px;">${stars}</div>
          </div>`;
        }).join('');
      }
    }
  }

  /* ---------- активность и серия ---------- */

  const HEAT_WEEKS = 26;
  const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  // Строки с подписями: все семь не помещаются, подписываем через одну
  const WEEKDAY_ROWS = [0, 2, 4, 6];
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн',
                        'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  // Даты приходят в двух форматах: ISO от статей и тестов, «ДД.ММ.ГГГГ ЧЧ:ММ» от работ на конкурс
  function parseActivityDate(value) {
    if (!value) return null;
    const ru = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(value);
    const date = ru ? new Date(`${ru[3]}-${ru[2]}-${ru[1]}`) : new Date(value);
    return isNaN(date) ? null : date;
  }

  // Ключ обязан совпадать с ISO-датами, которыми сервер отдаёт прохождения:
  // без ведущих нулей «2026-9-16» и «2026-09-16» — разные дни
  function dayKey(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  /** Понедельник недели, в которую попадает дата. */
  function mondayOf(date) {
    const monday = new Date(date);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return monday;
  }

  /** Сколько событий в каждый день: всё, что человек делал на площадке. */
  function activityByDay() {
    const counts = new Map();
    const sources = [
      ...state.articles.map(a => a.created_at),
      ...state.tests.map(t => t.created_at),
      ...state.contestHistory.map(s => s.submitted_at),
    ];
    for (const raw of sources) {
      const date = parseActivityDate(raw);
      if (!date) continue;
      const key = dayKey(date);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    // Прохождения тестов приходят уже сгруппированными по дням: их бывают
    // сотни, и тащить каждую попытку в браузер ради карты незачем
    const daily = (state.attempts && state.attempts.daily) || {};
    for (const [key, n] of Object.entries(daily)) {
      counts.set(key, (counts.get(key) || 0) + n);
    }
    return counts;
  }

  /** Насыщенность клетки: четыре ступени, как в легенде под картой. */
  function heatLevel(n) {
    if (!n) return 0;
    if (n === 1) return 1;
    if (n === 2) return 2;
    if (n <= 4) return 3;
    return 4;
  }

  function renderActivity() {
    const heatEl = document.getElementById('ud-heat');
    if (!heatEl) return;

    const counts = activityByDay();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Карта выровнена по неделям: колонка — неделя, строка — день недели.
    // Последняя колонка — текущая неделя, поэтому её хвост ещё в будущем.
    const start = mondayOf(today);
    start.setDate(start.getDate() - (HEAT_WEEKS - 1) * 7);

    const days = [];
    let cells = '';
    let months = '';
    let total = 0;
    let activeDays = 0;
    let run = { month: null, span: 0 };

    const flushMonth = () => {
      if (run.month === null) return;
      // Однонедельный хвост месяца подписывать некуда — подпись не влезет
      const label = run.span > 1 ? MONTHS_SHORT[run.month] : '';
      months += `<span style="grid-column:span ${run.span}">${label}</span>`;
    };

    for (let week = 0; week < HEAT_WEEKS; week++) {
      const monday = new Date(start);
      monday.setDate(start.getDate() + week * 7);
      if (monday.getMonth() !== run.month) {
        flushMonth();
        run = { month: monday.getMonth(), span: 1 };
      } else {
        run.span += 1;
      }

      for (let weekday = 0; weekday < 7; weekday++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + weekday);
        if (day > today) {
          cells += '<i class="ud-heat-cell future"></i>';
          continue;
        }
        const n = counts.get(dayKey(day)) || 0;
        const label = `${day.toLocaleDateString('ru-RU')} — ${n ? pluralEvents(n) : 'нет активности'}`;
        cells += `<i class="ud-heat-cell lvl-${heatLevel(n)}" title="${esc(label)}"></i>`;

        days.push(n);
        total += n;
        if (n) activeDays += 1;
      }
    }
    flushMonth();

    const weekdayLabels = WEEKDAYS
      .map((name, index) => `<span>${WEEKDAY_ROWS.includes(index) ? name : ''}</span>`)
      .join('');

    heatEl.innerHTML = `<span class="ud-heat-corner"></span><div class="ud-heat-months">${months}</div>`
      + `<div class="ud-heat-weekdays">${weekdayLabels}</div>`
      + `<div class="ud-heat-grid">${cells}</div>`;

    const totalEl = document.getElementById('ud-heat-total');
    if (totalEl) totalEl.innerHTML = `<b>${total}</b> ${eventWord(total)}`;
    const activeEl = document.getElementById('ud-heat-active');
    if (activeEl) {
      activeEl.innerHTML = `Активных дней: <b>${activeDays}</b> из ${days.length}`;
    }

    renderStreak(days, counts, today, total, activeDays);
  }

  /** Сколько дней подряд идёт активность прямо сейчас.
   *
   * Отсутствие активности сегодня серию не обрывает: день ещё не кончился,
   * и обнулять счётчик в полночь было бы враньём. Как только сутки прошли
   * без событий, серия гаснет.
   */
  function currentStreak(days) {
    let index = days.length - 1;
    if (days[index] === 0) index -= 1;
    let streak = 0;
    while (index >= 0 && days[index] > 0) {
      streak += 1;
      index -= 1;
    }
    return streak;
  }

  const FLAME = '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M13.6 1.5c.4 3-1.1 4.7-2.5 6.1C9.5 9.2 8 10.8 8.2 13.6c-.9-.6-1.6-1.7-1.9-2.9C4.8 12.2 4 14.1 4 16c0 4.2 3.6 6.9 8 6.9s8-3 8-7.3c0-3.9-2.3-6.4-4-8.2-1.7-1.8-2.4-3.8-2.4-5.9z"/></svg>';

  function renderStreak(days, counts, today, total, activeDays) {
    const box = document.getElementById('ud-streak');
    if (!box) return;

    const streak = currentStreak(days);
    const alive = streak > 0;
    const todayCount = counts.get(dayKey(today)) || 0;

    // Полоска текущей недели: понедельник — воскресенье
    const monday = mondayOf(today);
    const week = WEEKDAYS.map((name, index) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + index);
      const done = (counts.get(dayKey(day)) || 0) > 0;
      const isToday = day.getTime() === today.getTime();
      const classes = ['ud-week-cell', done ? 'on' : '', isToday ? 'today' : '',
                       day > today ? 'future' : ''].filter(Boolean).join(' ');
      return `<div class="ud-week-day"><span class="ud-week-label">${name}</span>
        <div class="${classes}"></div></div>`;
    }).join('');

    let note;
    if (todayCount) {
      note = `Сегодня уже ${pluralEvents(todayCount)} — серия продолжается.`;
    } else if (alive) {
      note = 'Сегодня ещё нет активности. Пройдите тест или отправьте решение, чтобы серия не прервалась.';
    } else {
      note = 'Серия прервана. Любое действие сегодня начнёт новую.';
    }

    const best = bestStreak(days);
    const perWeek = (total / HEAT_WEEKS).toFixed(1).replace('.', ',');

    box.innerHTML = `
      <div class="ud-streak-head">
        <span class="ud-streak-flame${alive ? '' : ' cold'}">${FLAME}</span>
        <div>
          <div class="ud-streak-line">
            <span class="ud-streak-value">${streak}</span>
            <span class="ud-streak-word">${alive ? dayWord(streak) + ' подряд' : 'серия прервана'}</span>
          </div>
          <div class="ud-streak-best">Лучшая серия — <b>${pluralDays(best)}</b></div>
        </div>
      </div>

      <div class="ud-week">${week}</div>

      <div class="ud-callout${todayCount ? ' done' : ''}">
        <i class="ud-callout-dot"></i>
        <div>${note}</div>
      </div>

      <div class="ud-streak-stats">
        <div class="ud-streak-stat"><b>${total}</b><span>${eventWord(total)}</span></div>
        <div class="ud-streak-stat"><b>${activeDays}</b><span>активных дней</span></div>
        <div class="ud-streak-stat"><b>${perWeek}</b><span>в неделю</span></div>
      </div>`;
  }

  function bestStreak(days) {
    let best = 0;
    let run = 0;
    for (const n of days) {
      run = n ? run + 1 : 0;
      if (run > best) best = run;
    }
    return best;
  }

  // Число и слово нужны то вместе («5 дней»), то порознь: в плашке серии
  // число набрано крупно отдельной строкой
  function dayWord(n) {
    if (n % 10 === 1 && n % 100 !== 11) return 'день';
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'дня';
    return 'дней';
  }

  function pluralDays(n) {
    return `${n} ${dayWord(n)}`;
  }

  function eventWord(n) {
    if (n % 10 === 1 && n % 100 !== 11) return 'событие';
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'события';
    return 'событий';
  }

  function pluralEvents(n) {
    return `${n} ${eventWord(n)}`;
  }

  function renderSettingsTab() {
    if (!document.getElementById('ud-s-name')) return;
    const c = state.candidate;
    if (!c) return;
    const nameEl = document.getElementById('ud-s-name');
    const emailEl = document.getElementById('ud-s-email');
    const phoneEl = document.getElementById('ud-s-phone');
    const bioEl = document.getElementById('ud-s-bio');
    const skillsEl = document.getElementById('ud-s-skills');
    if (nameEl) nameEl.value = c.name || '';
    if (emailEl) emailEl.value = c.email || '';
    if (phoneEl) phoneEl.value = c.phone || '';
    if (bioEl) bioEl.value = c.bio || '';
    if (skillsEl) skillsEl.value = (c.skills || []).join(', ');
  }

  let settingsOriginal = null;

  document.getElementById('ud-save-settings-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('ud-save-settings-btn');
    const flashEl = document.getElementById('ud-settings-flash');
    const name = document.getElementById('ud-s-name')?.value.trim();
    const email = document.getElementById('ud-s-email')?.value.trim();
    const phone = document.getElementById('ud-s-phone')?.value.trim();
    const bio = document.getElementById('ud-s-bio')?.value.trim();
    const skillsStr = document.getElementById('ud-s-skills')?.value || '';
    const skills = skillsStr.split(',').map(s => s.trim()).filter(Boolean);

    if (!name) {
      if (flashEl) flashEl.innerHTML = `<div style="padding:10px 14px;border-radius:9px;background:var(--red-soft);color:var(--red-text);font-size:13.5px;margin-bottom:10px;">Имя не может быть пустым.</div>`;
      return;
    }
    if (flashEl) flashEl.innerHTML = '';
    if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }

    try {
      const data = await apiFetch(`/api/v1/candidates/${username}/update/`, {
        method: 'PATCH',
        body: JSON.stringify({ name, email: email || '', phone: phone || '', bio: bio || '', skills }),
      });
      state.candidate = data.candidate;
      if (btn) { btn.disabled = false; btn.textContent = '✓ Сохранено'; }
      setTimeout(() => { if (btn) btn.textContent = 'Сохранить'; }, 1800);
      renderSidebar();
      renderProfileTab();
      renderStatsTab();
    } catch (e) {
      if (flashEl) flashEl.innerHTML = `<div style="padding:10px 14px;border-radius:9px;background:var(--red-soft);color:var(--red-text);font-size:13.5px;margin-bottom:10px;">${esc(e.message)}</div>`;
      if (btn) { btn.disabled = false; btn.textContent = 'Сохранить'; }
    }
  });

  document.getElementById('ud-cancel-settings-btn')?.addEventListener('click', () => {
    renderSettingsTab();
    document.getElementById('ud-settings-flash').innerHTML = '';
  });

  /* ---------- create test button ---------- */

  document.getElementById('ud-create-test-btn')?.addEventListener('click', e => {
    e.preventDefault();
    window.location.assign(`/constructor/?owner=${encodeURIComponent(username)}`);
  });

  /* ---------- init ---------- */

  /* panel='none' передают страницы, которые лежат в кабинете, но рисуют себя сами
     (например статистика теста). Им от этого скрипта нужны только чип в сайдбаре
     и выход — четыре списочных запроса были бы выброшены впустую. */
  const panel = (window.ALFA_APP_BOOTSTRAP || {}).panel
    || (window.ALFA_APP_BOOTSTRAP || {}).page || 'profile';

  async function init() {
    if (!username) return;

    try {
      const candData = await apiFetch(`/api/v1/candidates/${username}/`);
      state.candidate = candData.candidate;
      renderSidebar();

      if (panel === 'none') return;

      // Прохождения нужны только странице статистики: остальным разделам
      // это был бы пятый запрос впустую
      const wantsAttempts = Boolean(document.getElementById('panel-stats'));
      const [testsResp, articlesResp, historyResp, ratingsResp, attemptsResp] = await Promise.all([
        fetch(`/api/v1/tests/?owner=${encodeURIComponent(username)}`).then(r => r.json()).catch(() => ({ ok: false })),
        fetch('/api/v1/articles/my/').then(r => r.json()).catch(() => ({ ok: false })),
        fetch('/api/v1/contests/user-history/').then(r => r.json()).catch(() => ({ ok: false })),
        fetch('/api/v1/companies/my-ratings/').then(r => r.json()).catch(() => ({ ok: false })),
        wantsAttempts
          ? fetch('/api/v1/tests/my-attempts/').then(r => r.json()).catch(() => ({ ok: false }))
          : Promise.resolve({ ok: false }),
      ]);

      state.tests = testsResp.ok ? (testsResp.tests || []) : [];
      state.articles = articlesResp.ok ? (articlesResp.articles || []) : [];
      state.contestHistory = historyResp.ok ? (historyResp.submissions || []) : [];
      state.myRatings = ratingsResp.ok ? (ratingsResp.ratings || []) : [];
      state.attempts = attemptsResp.ok ? attemptsResp : null;

      renderProfileTab();
      renderTestsTab();
      renderArticlesTab();
      renderContestsTab();
      renderStatsTab();
      renderSettingsTab();
    } catch (e) {
      console.error('Cabinet init error:', e);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
