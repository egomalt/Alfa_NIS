(() => {
    const CSRF = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

    const COVERS = [
        'linear-gradient(135deg,#1e3a5f 0%,#2d6a9f 100%)',
        'linear-gradient(135deg,#D62839 0%,#7a1020 100%)',
        'linear-gradient(135deg,#134e5e 0%,#1a7a6e 100%)',
        'linear-gradient(135deg,#3d1f6e 0%,#6b3fa0 100%)',
        'linear-gradient(135deg,#2d3a1a 0%,#4a7a2d 100%)',
    ];

    function esc(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function formatDate(iso) {
        if (!iso) return '';
        try {
            return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
        } catch { return ''; }
    }

    function fmtNum(n) {
        if (!n) return '0';
        return n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + ' тыс.' : String(n);
    }

    let allArticles = [];
    let activeFilter = 'all';

    async function logout() {
        await fetch('/api/v1/auth/signout/', { method: 'POST', headers: { 'X-CSRFToken': CSRF() } });
        location.href = '/';
    }

    async function publishArticle(id, e) {
        e.stopPropagation();
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '…';
        try {
            const res = await fetch(`/api/v1/articles/${id}/publish/`, {
                method: 'POST',
                headers: { 'X-CSRFToken': CSRF() },
            });
            const data = await res.json();
            if (data.ok) {
                const idx = allArticles.findIndex(a => a.id === id);
                if (idx !== -1) allArticles[idx] = data.article;
                renderStats();
                renderGrid();
            }
        } catch { btn.disabled = false; btn.textContent = 'Опубликовать'; }
    }

    function renderStats() {
        const published = allArticles.filter(a => a.status === 'published').length;
        const drafts = allArticles.filter(a => a.status === 'draft').length;
        const views = allArticles.reduce((s, a) => s + (a.views || 0), 0);
        const likes = allArticles.reduce((s, a) => s + (a.likes || 0), 0);

        document.getElementById('stat-published').textContent = published;
        document.getElementById('stat-drafts').textContent = drafts;
        document.getElementById('stat-views').textContent = fmtNum(views);
        document.getElementById('stat-likes').textContent = fmtNum(likes);
    }

    function renderGrid() {
        const list = activeFilter === 'all'
            ? allArticles
            : allArticles.filter(a => a.status === activeFilter);

        const count = document.getElementById('art-count');
        const total = list.length;
        count.textContent = total + ' ' + (total % 10 === 1 && total % 100 !== 11 ? 'статья' : total % 10 >= 2 && total % 10 <= 4 && (total % 100 < 10 || total % 100 >= 20) ? 'статьи' : 'статей');

        const grid = document.getElementById('art-grid');

        if (list.length === 0) {
            grid.innerHTML = `
              <div class="art-empty">
                <div class="art-empty-title">Статей нет</div>
                <div class="art-empty-sub">Напишите первую статью и поделитесь опытом</div>
                <a href="/cabinet/user/articles/new/" class="art-btn-create">Написать статью</a>
              </div>`;
            return;
        }

        grid.innerHTML = list.map(a => {
            const cover = COVERS[a.cover_index % COVERS.length];
            const date = a.status === 'published' && a.published_at
                ? formatDate(a.published_at)
                : a.status === 'draft' ? 'Черновик' : formatDate(a.created_at);

            const tagsHtml = (a.tags || []).map(t => `<span class="art-tag">${esc(t)}</span>`).join('');

            const publishBtn = a.status === 'draft'
                ? `<button class="art-cover-btn" data-publish="${a.id}" onclick="event.stopPropagation()">Опубликовать</button>`
                : '';

            return `
              <a class="art-card" href="/cabinet/user/articles/${a.id}/edit/">
                <div class="art-cover" style="background:${cover};">
                  <svg style="position:absolute;inset:0;width:100%;height:100%;opacity:.12" viewBox="0 0 400 190" preserveAspectRatio="xMidYMid slice">
                    <circle cx="320" cy="40" r="80" fill="rgba(255,255,255,.07)"/>
                    <circle cx="360" cy="150" r="120" fill="rgba(255,255,255,.05)"/>
                    <circle cx="60" cy="160" r="60" fill="rgba(255,255,255,.04)"/>
                  </svg>
                  <svg style="position:absolute;bottom:16px;right:20px;width:44px;height:44px;opacity:.25" viewBox="0 0 48 48" fill="none">
                    <path d="M8 10h32M8 18h24M8 26h20M8 34h16" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
                  </svg>
                  <span class="art-status ${a.status}">${a.status === 'published' ? 'Опубликована' : 'Черновик'}</span>
                  <div class="art-cover-actions">
                    <button class="art-cover-btn" onclick="event.stopPropagation();location.href='/cabinet/user/articles/${a.id}/edit/'">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Редактировать
                    </button>
                    ${publishBtn}
                  </div>
                </div>
                <div class="art-body">
                  ${tagsHtml ? `<div class="art-tags">${tagsHtml}</div>` : ''}
                  <div class="art-title">${esc(a.title || 'Без названия')}</div>
                  <div class="art-excerpt">${esc(a.excerpt || '')}</div>
                  <div class="art-footer">
                    ${a.read_time ? `<span class="art-meta-mono"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>${a.read_time} мин</span><span class="art-meta-dot">·</span>` : ''}
                    <span class="art-meta">${date}</span>
                    <div class="art-footer-right">
                      ${a.views ? `<span class="art-stat-pill"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>${fmtNum(a.views)}</span>` : ''}
                      ${a.likes ? `<span class="art-stat-pill"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>${fmtNum(a.likes)}</span>` : ''}
                    </div>
                  </div>
                </div>
              </a>`;
        }).join('');

        grid.querySelectorAll('[data-publish]').forEach(btn => {
            btn.addEventListener('click', e => publishArticle(Number(btn.dataset.publish), e));
        });
    }

    function initFilters() {
        document.querySelectorAll('.art-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                activeFilter = btn.dataset.filter;
                document.querySelectorAll('.art-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
                renderGrid();
            });
        });
    }

    async function init() {
        document.getElementById('cd-logout-btn')?.addEventListener('click', logout);

        initFilters();

        try {
            const res = await fetch('/api/v1/articles/my/');
            const data = await res.json();
            if (!data.ok) throw new Error(data.message || 'Ошибка');
            allArticles = data.articles || [];
            renderStats();
            renderGrid();
        } catch (e) {
            document.getElementById('art-grid').innerHTML =
                `<div style="grid-column:1/-1;padding:64px;text-align:center;color:var(--muted);">${esc(e.message)}</div>`;
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
