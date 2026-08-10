(() => {
  const COVERS = [
    'linear-gradient(135deg,#1e3a5f 0%,#2d6a9f 100%)',
    'linear-gradient(135deg,#D62839 0%,#7a1020 100%)',
    'linear-gradient(135deg,#134e5e 0%,#1a7a6e 100%)',
    'linear-gradient(135deg,#3d1f6e 0%,#6b3fa0 100%)',
    'linear-gradient(135deg,#2d3a1a 0%,#4a7a2d 100%)',
    'linear-gradient(135deg,#5c3d00 0%,#b07000 100%)',
  ];

  const AV_COLORS = [
    ['#FCE7E8', '#C81E2D'], ['#E2F3EA', '#15935A'],
    ['#EDF0F6', '#3C434F'], ['#FBEEDA', '#B7770C'],
    ['rgba(61,31,110,.15)', '#6b3fa0'],
  ];

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); } catch { return ''; }
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  let allArticles = [];
  let activeCat = 'all';
  let searchQ = '';
  let shown = 6;

  function getFiltered() {
    return allArticles.filter(a => {
      const catOk = activeCat === 'all' || (a.tags || []).includes(activeCat);
      const q = searchQ.toLowerCase();
      const qOk = !q || (a.title || '').toLowerCase().includes(q) || (a.tags || []).some(t => t.toLowerCase().includes(q));
      return catOk && qOk;
    });
  }

  function renderFeatured() {
    const top = allArticles[0];
    if (!top) return;
    const el = document.getElementById('featured');
    el.href = `/articles/${top.id}/`;
    el.style.display = '';

    const cover = COVERS[top.cover_index % COVERS.length];
    document.getElementById('featured-cover-bg').style.cssText = `position:absolute;inset:0;background:${cover};`;
    document.getElementById('featured-badge-text').textContent = (top.views || 0) + ' просмотров · Топ недели';
    document.getElementById('featured-tags').innerHTML = (top.tags || []).map(t => `<span class="featured-tag">${esc(t)}</span>`).join('');
    document.getElementById('featured-title').textContent = top.title || 'Без названия';
    document.getElementById('featured-excerpt').textContent = top.excerpt || '';

    const username = top.author_username || '?';
    const ci = username.charCodeAt(0) % AV_COLORS.length;
    const [avBg, avFg] = AV_COLORS[ci];
    const avEl = document.getElementById('featured-author-av');
    avEl.textContent = username[0].toUpperCase();
    avEl.style.cssText = `background:${avBg};color:${avFg};`;
    document.getElementById('featured-author-name').textContent = username;
    const dateParts = [];
    if (top.published_at) dateParts.push(formatDate(top.published_at));
    if (top.read_time) dateParts.push(top.read_time + ' мин чтения');
    document.getElementById('featured-author-date').textContent = dateParts.join(' · ');
    document.getElementById('featured-views-count').textContent = top.views || 0;
    document.getElementById('featured-read-btn').onclick = (e) => {
      e.preventDefault();
      location.href = `/articles/${top.id}/`;
    };
  }

  function renderFilters() {
    const tagCounts = {};
    allArticles.forEach(a => (a.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    const tags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(([t]) => t);

    const cats = document.getElementById('cats');
    const countEl = document.getElementById('cats-count');
    cats.querySelectorAll('.cr-chip').forEach((b, i) => { if (i > 0) b.remove(); });

    tags.forEach(tag => {
      const btn = document.createElement('button');
      btn.className = 'cr-chip';
      btn.dataset.cat = tag;
      btn.textContent = tag;
      btn.addEventListener('click', () => filterCat(tag));
      cats.insertBefore(btn, countEl);
    });
    cats.querySelector('[data-cat="all"]').addEventListener('click', () => filterCat('all'));

    if (tags.length) {
      document.getElementById('tags-card').style.display = '';
      document.getElementById('tag-cloud').innerHTML = tags.slice(0, 12).map(t =>
        `<button class="cloud-tag" data-tag="${esc(t)}">${esc(t)}</button>`
      ).join('');
      document.getElementById('tag-cloud').querySelectorAll('.cloud-tag').forEach(btn => {
        btn.addEventListener('click', () => filterCat(btn.dataset.tag));
      });
    }
  }

  function filterCat(cat) {
    activeCat = cat;
    shown = 6;
    document.querySelectorAll('.cr-chip').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
    document.querySelectorAll('.cloud-tag').forEach(b => b.classList.toggle('active', b.dataset.tag === cat));
    renderGrid();
  }

  function renderTrending() {
    const top5 = [...allArticles].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
    document.getElementById('trending-list').innerHTML = top5.map((a, i) => `
      <div class="trending-item" onclick="location.href='/articles/${a.id}/'">
        <div class="trending-num">0${i + 1}</div>
        <div>
          <div class="trending-title">${esc(a.title || 'Без названия')}</div>
          <div class="trending-meta">${a.views ? a.views + ' просмотров · ' : ''}${a.read_time ? a.read_time + ' мин' : ''}</div>
        </div>
      </div>`).join('');
  }

  function renderGrid() {
    const list = getFiltered();
    const visible = list.slice(0, shown);
    const total = list.length;

    document.getElementById('cats-count').textContent = total + ' ' + plural(total, 'статья', 'статьи', 'статей');
    document.getElementById('art-count').textContent = total + ' ' + plural(total, 'статья', 'статьи', 'статей');

    const grid = document.getElementById('art-grid');
    if (!visible.length) {
      grid.innerHTML = '<div class="state-msg">Статей не найдено</div>';
      document.getElementById('load-more-row').style.display = 'none';
      return;
    }

    grid.innerHTML = visible.map(a => {
      const cover = COVERS[a.cover_index % COVERS.length];
      const username = a.author_username || '?';
      const ci = username.charCodeAt(0) % AV_COLORS.length;
      const [avBg, avFg] = AV_COLORS[ci];
      return `
      <a class="card" href="/articles/${a.id}/">
        <div class="card-cover">
          <div class="card-cover-bg" style="background:${cover};position:absolute;inset:0;"></div>
          <svg class="card-cover-pattern" viewBox="0 0 360 180" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;">
            <circle cx="280" cy="30" r="100" fill="rgba(255,255,255,.08)"/>
            <circle cx="310" cy="160" r="130" fill="rgba(255,255,255,.05)"/>
            <circle cx="40" cy="160" r="70" fill="rgba(255,255,255,.04)"/>
          </svg>
        </div>
        <div class="card-body">
          ${(a.tags || []).length ? `<div class="card-tags">${a.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
          <div class="card-title">${esc(a.title || 'Без названия')}</div>
          <div class="card-excerpt">${esc(a.excerpt || '')}</div>
          <div class="card-footer">
            <div class="card-author">
              <div class="card-av" style="background:${avBg};color:${avFg};">${username[0].toUpperCase()}</div>
              <div class="card-author-name">${esc(username)}</div>
            </div>
            <span class="meta-dot">·</span>
            ${a.read_time ? `<span class="meta-mono"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>${a.read_time} мин</span>` : ''}
            <div class="card-footer-right">
              <span class="stat-pill"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>${a.views || 0}</span>
            </div>
          </div>
        </div>
      </a>`;
    }).join('');

    document.getElementById('load-more-row').style.display = shown < total ? 'flex' : 'none';
  }

  document.getElementById('search-input').addEventListener('input', e => {
    searchQ = e.target.value;
    shown = 6;
    renderGrid();
  });

  document.getElementById('btn-load').addEventListener('click', () => {
    shown += 6;
    renderGrid();
  });

  // Show "Написать" button for logged-in users
  fetch('/api/v1/auth/me/')
    .then(r => r.json())
    .then(data => {
      if (data.ok && data.account) {
        const btn = document.getElementById('btn-write');
        if (btn) btn.style.display = '';
      }
    })
    .catch(() => {});

  async function init() {
    try {
      const res = await fetch('/api/v1/articles/catalog/');
      const data = await res.json();
      if (!data.ok) throw new Error();
      allArticles = data.articles || [];
      if (allArticles.length) {
        renderFeatured();
        renderFilters();
        renderTrending();
      }
      renderGrid();
    } catch {
      document.getElementById('art-grid').innerHTML = '<div class="state-msg">Не удалось загрузить статьи</div>';
    }
  }

  init();
})();
