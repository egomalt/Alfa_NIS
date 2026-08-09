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
  function pluralPages(n) {
    const m10 = n % 10, m100 = n % 100;
    if (m100 >= 11 && m100 <= 19) return `${n} страниц`;
    if (m10 === 1) return `${n} страница`;
    if (m10 >= 2 && m10 <= 4) return `${n} страницы`;
    return `${n} страниц`;
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

  async function logout() {
    await fetch('/api/v1/auth/signout/', { method: 'POST', headers: { 'X-CSRFToken': CSRF() } });
    window.location.assign('/');
  }
  document.getElementById('ud-logout-btn')?.addEventListener('click', logout);
  document.getElementById('logout-btn')?.addEventListener('click', logout);

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

  function renderTestsTab() {
    const tests = state.tests;
    const total = tests.length;
    const published = tests.filter(t => t.status === 'published').length;
    const drafts = tests.filter(t => t.status === 'draft').length;
    const subs = tests.reduce((s, t) => s + (t.submissions || 0), 0);

    set('tstat-total', total);
    set('tstat-published', published);
    set('tstat-subs', subs);
    set('tstat-drafts', drafts);

    const listEl = document.getElementById('ud-tests-list');
    if (!listEl) return;

    const STATUS_BG = { draft: 'var(--amber-soft)', published: 'var(--green-soft)' };
    const STATUS_CO = { draft: 'var(--amber-text)', published: 'var(--green-text)' };
    const STATUS_LB = { draft: 'Черновик', published: 'Опубликован' };

    const filtered = testsFilter === 'all' ? tests : tests.filter(t => t.status === testsFilter);

    if (!filtered.length) {
      listEl.innerHTML = `<div class="ud-empty"><div class="ud-empty-title">${testsFilter === 'all' ? 'Нет тестов' : 'Нет тестов в этой категории'}</div><div class="ud-empty-sub">Создайте первый тест, нажав кнопку выше.</div></div>`;
      return;
    }

    listEl.innerHTML = filtered.map(t => `
      <a class="ud-list-row" href="${esc(t.edit_url || '#')}">
        <div class="ud-list-main">
          <div class="ud-list-title">${esc(t.title || 'Без названия')}</div>
          <div class="ud-list-meta">${esc(pluralPages(t.page_count || 0))} · создан ${esc(formatDateShort(t.created_at))}</div>
        </div>
        <span class="ud-status-pill" style="background:${STATUS_BG[t.status]||'var(--surface-2)'};color:${STATUS_CO[t.status]||'var(--muted)'};">${STATUS_LB[t.status] || t.status}</span>
        <div class="ud-row-actions" onclick="event.stopPropagation()">
          <button class="ud-icon-btn" data-delete-test="${t.id}" title="Удалить">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </a>`).join('');

    listEl.querySelectorAll('[data-delete-test]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm('Удалить тест? Это действие нельзя отменить.')) return;
        try {
          await apiFetch(`/api/v1/tests/${btn.dataset.deleteTest}/`, { method: 'DELETE' });
          state.tests = state.tests.filter(t => String(t.id) !== btn.dataset.deleteTest);
          renderTestsTab();
          renderProfileTab();
          renderStatsTab();
        } catch (e) { alert(e.message); }
      });
    });
  }

  document.getElementById('panel-tests')?.addEventListener('click', e => {
    const fbtn = e.target.closest('[data-tests-filter]');
    if (!fbtn) return;
    testsFilter = fbtn.dataset.testsFilter;
    document.querySelectorAll('[data-tests-filter]').forEach(b => b.classList.toggle('active', b.dataset.testsFilter === testsFilter));
    renderTestsTab();
  });

  /* ---------- render articles tab ---------- */

  function renderArticlesTab() {
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
      return `<a class="ud-list-row" href="/articles/${a.id}/">
        <div class="ud-list-main">
          <div class="ud-list-title">${esc(a.title || 'Без названия')}</div>
          <div class="ud-list-meta">${esc(metaParts)}</div>
        </div>
        <span class="ud-status-pill" style="background:${STATUS_BG[a.status]||'var(--surface-2)'};color:${STATUS_CO[a.status]||'var(--muted)'};">${STATUS_LB[a.status] || a.status}</span>
      </a>`;
    }).join('');
  }

  /* ---------- render contests tab ---------- */

  function renderContestsTab() {
    const history = state.contestHistory;
    const wins = history.filter(s => s.winner).length;
    const pending = history.filter(s => s.status === 'pending').length;
    const accepted = history.filter(s => s.status === 'accepted').length;

    set('cstat-total', history.length);
    set('cstat-wins', wins);
    set('cstat-pending', pending);
    set('cstat-accepted', accepted);

    const listEl = document.getElementById('ud-contests-list');
    if (!listEl) return;

    if (!history.length) {
      listEl.innerHTML = `<div class="ud-empty"><div class="ud-empty-title">Нет участий</div><div class="ud-empty-sub">Подайте решение в любой конкурс из каталога.</div></div>`;
      return;
    }

    const STATUS_BG = {
      pending:  'var(--amber-soft)',
      accepted: 'var(--green-soft)',
      rejected: 'var(--surface-2)',
    };
    const STATUS_CO = {
      pending:  'var(--amber-text)',
      accepted: 'var(--green-text)',
      rejected: 'var(--muted)',
    };
    const STATUS_LB = {
      pending:  'На проверке',
      accepted: 'Принято',
      rejected: 'Отклонено',
    };

    listEl.innerHTML = history.map(s => {
      const placeHtml = s.winner
        ? `<span class="ud-place-badge">🏆 Победитель</span>`
        : '';
      const statusBg = s.status === 'accepted' && s.winner ? 'var(--green-soft)' : STATUS_BG[s.status] || 'var(--surface-2)';
      const statusCo = s.status === 'accepted' && s.winner ? 'var(--green-text)' : STATUS_CO[s.status] || 'var(--muted)';
      const statusLb = s.winner ? 'Победа' : (STATUS_LB[s.status] || s.status);
      return `<a class="ud-list-row" href="/contests/${s.contest_id}/">
        <div class="ud-list-main">
          <div class="ud-list-title">${esc(s.contest_title || 'Конкурс')}</div>
          <div class="ud-list-meta">${esc(s.company_username)} · подано ${esc(formatDateShort(s.submitted_at))}</div>
        </div>
        ${placeHtml}
        <span class="ud-status-pill" style="background:${statusBg};color:${statusCo};">${esc(statusLb)}</span>
      </a>`;
    }).join('');
  }

  /* ---------- render stats tab ---------- */

  function renderStatsTab() {
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

    // Heatmap
    const heatEl = document.getElementById('ud-heat-grid');
    if (heatEl) {
      let cells = '';
      for (let i = 0; i < 26 * 7; i++) {
        const r = Math.random();
        const bg = r > 0.85 ? 'var(--brand)' : r > 0.6 ? 'var(--brand-soft)' : 'var(--surface-2)';
        cells += `<div class="ud-heat-cell" style="background:${bg};"></div>`;
      }
      heatEl.innerHTML = cells;
    }

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

  function renderSettingsTab() {
    const c = state.candidate;
    if (!c) return;
    const nameEl = document.getElementById('ud-s-name');
    const emailEl = document.getElementById('ud-s-email');
    const bioEl = document.getElementById('ud-s-bio');
    const skillsEl = document.getElementById('ud-s-skills');
    if (nameEl) nameEl.value = c.name || '';
    if (emailEl) emailEl.value = c.email || '';
    if (bioEl) bioEl.value = c.bio || '';
    if (skillsEl) skillsEl.value = (c.skills || []).join(', ');
  }

  let settingsOriginal = null;

  document.getElementById('ud-save-settings-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('ud-save-settings-btn');
    const flashEl = document.getElementById('ud-settings-flash');
    const name = document.getElementById('ud-s-name')?.value.trim();
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
        body: JSON.stringify({ name, bio: bio || '', skills }),
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

  async function init() {
    if (!username) return;

    try {
      const [candData, testsResp, articlesResp, historyResp, ratingsResp] = await Promise.all([
        apiFetch(`/api/v1/candidates/${username}/`),
        fetch(`/api/v1/tests/?owner=${encodeURIComponent(username)}`).then(r => r.json()).catch(() => ({ ok: false })),
        fetch('/api/v1/articles/my/').then(r => r.json()).catch(() => ({ ok: false })),
        fetch('/api/v1/contests/user-history/').then(r => r.json()).catch(() => ({ ok: false })),
        fetch('/api/v1/companies/my-ratings/').then(r => r.json()).catch(() => ({ ok: false })),
      ]);

      state.candidate = candData.candidate;
      state.tests = testsResp.ok ? (testsResp.tests || []) : [];
      state.articles = articlesResp.ok ? (articlesResp.articles || []) : [];
      state.contestHistory = historyResp.ok ? (historyResp.submissions || []) : [];
      state.myRatings = ratingsResp.ok ? (ratingsResp.ratings || []) : [];

      renderSidebar();
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
