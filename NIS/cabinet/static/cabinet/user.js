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
  function formatDateShort(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); }
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

  function renderArticlesTab() {
    if (!document.getElementById('ud-articles-list')) return;
    const articles = state.articles;
    const published = articles.filter(a => a.status === 'published').length;
    const drafts = articles.filter(a => a.status === 'draft').length;
    const totalViews = articles.reduce((s, a) => s + (a.views || 0), 0);
    const totalLikes = articles.reduce((s, a) => s + (a.likes || 0), 0);

    set('astat-published', published);
    set('astat-drafts', drafts);
    set('astat-views', fmtNum(totalViews));
    set('astat-likes', totalLikes);

    const listEl = document.getElementById('ud-articles-list');
    if (!listEl) return;

    if (!articles.length) {
      listEl.innerHTML = `<div class="ud-empty"><div class="ud-empty-title">Нет статей</div><div class="ud-empty-sub">Напишите первую статью, нажав кнопку выше.</div></div>`;
      return;
    }

    const STATUS_BG = { draft: 'var(--amber-soft)', published: 'var(--green-soft)' };
    const STATUS_CO = { draft: 'var(--amber-text)', published: 'var(--green-text)' };
    const STATUS_LB = { draft: 'Черновик', published: 'Опубликована' };

    listEl.innerHTML = articles.map(a => {
      const metaParts = [
        STATUS_LB[a.status] || a.status,
        a.published_at ? formatDateShort(a.published_at) : formatDateShort(a.created_at),
        a.views ? `${fmtNum(a.views)} просмотров` : null,
        a.likes ? `${a.likes} лайков` : null,
      ].filter(Boolean).join(' · ');
      // Черновик ещё не опубликован — публичная страница отдаёт на нём 404,
      // поэтому ведём в редактор
      const href = a.status === 'published' ? `/articles/${a.id}/` : `/cabinet/user/articles/${a.id}/edit/`;
      return `<a class="ud-list-row" href="${href}">
        <div class="ud-list-main">
          <div class="ud-list-title">${esc(a.title || 'Без названия')}</div>
          <div class="ud-list-meta">${esc(metaParts)}</div>
        </div>
        <span class="ud-status-pill" style="background:${STATUS_BG[a.status]||'var(--surface-2)'};color:${STATUS_CO[a.status]||'var(--muted)'};">${STATUS_LB[a.status] || a.status}</span>
        <div class="ud-row-actions" onclick="event.stopPropagation()">
          <a class="ud-icon-btn" href="/cabinet/user/articles/${a.id}/edit/" title="Редактировать">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </a>
          <button class="ud-icon-btn" data-delete-article="${a.id}" title="Удалить">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </a>`;
    }).join('');

    listEl.querySelectorAll('[data-delete-article]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm('Удалить статью? Это действие нельзя отменить.')) return;
        try {
          await apiFetch(`/api/v1/articles/${btn.dataset.deleteArticle}/delete/`, { method: 'DELETE' });
          state.articles = state.articles.filter(a => String(a.id) !== btn.dataset.deleteArticle);
          renderArticlesTab();
          renderProfileTab();
          renderStatsTab();
        } catch (e) { alert(e.message); }
      });
    });
  }

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

  function renderStatsTab() {
    if (!document.getElementById('ud-heat-grid')) return;
    const tests = state.tests;
    const articles = state.articles;
    const history = state.contestHistory;
    const ratings = state.myRatings;
    const c = state.candidate;

    const daysOnPlatform = c && c.created_at
      ? Math.floor((Date.now() - new Date(c.created_at)) / 86400000)
      : 0;
    set('sstat-days', daysOnPlatform);
    set('sstat-tests', tests.length);
    set('sstat-contests', history.length);

    const avgRating = ratings.length
      ? (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1)
      : '—';
    set('sstat-avg-rating', avgRating !== '—' ? `${avgRating} ★` : '—');

    set('ss-c-total', history.length);
    set('ss-c-wins', history.filter(s => s.winner).length);
    set('ss-t-total', tests.length);
    set('ss-t-pub', tests.filter(t => t.status === 'published').length);

    const totalViews = articles.reduce((s, a) => s + (a.views || 0), 0);
    const totalLikes = articles.reduce((s, a) => s + (a.likes || 0), 0);
    set('ss-a-pub', articles.filter(a => a.status === 'published').length);
    set('ss-a-views', fmtNum(totalViews));
    set('ss-a-likes', totalLikes);

    renderActivityHeatmap();

    // Contest bars
    const contestBarsEl = document.getElementById('ud-contest-bars');
    if (contestBarsEl) {
      if (!history.length) {
        contestBarsEl.innerHTML = `<div style="font-size:13px;color:var(--muted);">Нет данных</div>`;
      } else {
        const wins = history.filter(s => s.winner).length;
        const accepted = history.filter(s => s.status === 'accepted').length;
        const pending = history.filter(s => s.status === 'pending').length;
        const rejected = history.filter(s => s.status === 'rejected').length;
        const total = history.length;
        const bars = [
          { label: 'Победы', pct: Math.round(wins / total * 100), note: wins },
          { label: 'Принято', pct: Math.round(accepted / total * 100), note: accepted },
          { label: 'На проверке', pct: Math.round(pending / total * 100), note: pending },
          { label: 'Отклонено', pct: Math.round(rejected / total * 100), note: rejected },
        ].filter(b => b.note > 0);
        contestBarsEl.innerHTML = bars.map(b => `
          <div class="ud-bar-row">
            <div class="ud-bar-label">${esc(b.label)}</div>
            <div class="ud-bar-track"><div class="ud-bar-fill" style="width:${b.pct}%"></div></div>
            <div class="ud-bar-val">${b.note}</div>
          </div>`).join('');
      }
    }

    // Test bars
    const testBarsEl = document.getElementById('ud-test-bars');
    if (testBarsEl) {
      if (!tests.length) {
        testBarsEl.innerHTML = `<div style="font-size:13px;color:var(--muted);">Нет данных</div>`;
      } else {
        const total = tests.length;
        const published = tests.filter(t => t.status === 'published').length;
        const drafts = tests.filter(t => t.status === 'draft').length;
        const bars = [
          { label: 'Опубликовано', pct: Math.round(published / total * 100), note: published },
          { label: 'Черновики', pct: Math.round(drafts / total * 100), note: drafts },
        ].filter(b => b.note > 0);
        testBarsEl.innerHTML = bars.map(b => `
          <div class="ud-bar-row">
            <div class="ud-bar-label">${esc(b.label)}</div>
            <div class="ud-bar-track"><div class="ud-bar-fill" style="width:${b.pct}%"></div></div>
            <div class="ud-bar-val">${b.note}</div>
          </div>`).join('');
      }
    }

    // Company ratings
    const ratingsEl = document.getElementById('ud-my-ratings');
    if (ratingsEl) {
      if (!ratings.length) {
        ratingsEl.innerHTML = `<div style="font-size:13px;color:var(--muted);padding:8px 0;">Вы ещё не оценивали компании</div>`;
      } else {
        ratingsEl.innerHTML = ratings.map(r => {
          const stars = [1,2,3,4,5].map(i =>
            `<svg width="14" height="14" viewBox="0 0 24 24" fill="${i <= r.rating ? 'var(--amber-text)' : 'none'}" stroke="var(--amber-text)" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8-6.1-3.6-6.1 3.6 1.5-6.8-5.2-4.7 6.9-.7z"/></svg>`
          ).join('');
          return `<div class="ud-rating-row">
            <span class="ud-rating-av">${esc(initial(r.company_name))}</span>
            <div style="flex:1;font-size:13.5px;font-weight:600;">${esc(r.company_name)}</div>
            <div style="display:flex;gap:2px;">${stars}</div>
          </div>`;
        }).join('');
      }
    }
  }

  /* ---------- render settings tab ---------- */

  /* ---------- activity heatmap ---------- */

  const HEAT_WEEKS = 26;

  // Даты приходят в двух форматах: ISO от статей и тестов, «ДД.ММ.ГГГГ ЧЧ:ММ» от работ на конкурс
  function parseActivityDate(value) {
    if (!value) return null;
    const ru = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(value);
    const date = ru ? new Date(`${ru[3]}-${ru[2]}-${ru[1]}`) : new Date(value);
    return isNaN(date) ? null : date;
  }

  function dayKey(date) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  function renderActivityHeatmap() {
    const heatEl = document.getElementById('ud-heat-grid');
    if (!heatEl) return;

    // Считаем реальные события: созданные статьи, тесты и отправленные работы
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let cells = '';
    for (let back = HEAT_WEEKS * 7 - 1; back >= 0; back--) {
      const day = new Date(today);
      day.setDate(today.getDate() - back);
      const n = counts.get(dayKey(day)) || 0;
      const bg = n >= 3 ? 'var(--brand)' : n > 0 ? 'var(--brand-soft)' : 'var(--surface-2)';
      const label = `${day.toLocaleDateString('ru-RU')} — ${n ? pluralEvents(n) : 'нет активности'}`;
      cells += `<div class="ud-heat-cell" style="background:${bg};" title="${esc(label)}"></div>`;
    }
    heatEl.innerHTML = cells;
  }

  function pluralEvents(n) {
    if (n % 10 === 1 && n % 100 !== 11) return n + ' событие';
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return n + ' события';
    return n + ' событий';
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

      const [testsResp, articlesResp, historyResp, ratingsResp] = await Promise.all([
        fetch(`/api/v1/tests/?owner=${encodeURIComponent(username)}`).then(r => r.json()).catch(() => ({ ok: false })),
        fetch('/api/v1/articles/my/').then(r => r.json()).catch(() => ({ ok: false })),
        fetch('/api/v1/contests/user-history/').then(r => r.json()).catch(() => ({ ok: false })),
        fetch('/api/v1/companies/my-ratings/').then(r => r.json()).catch(() => ({ ok: false })),
      ]);

      state.tests = testsResp.ok ? (testsResp.tests || []) : [];
      state.articles = articlesResp.ok ? (articlesResp.articles || []) : [];
      state.contestHistory = historyResp.ok ? (historyResp.submissions || []) : [];
      state.myRatings = ratingsResp.ok ? (ratingsResp.ratings || []) : [];

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
