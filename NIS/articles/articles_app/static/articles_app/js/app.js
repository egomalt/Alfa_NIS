// Progress bar
window.addEventListener('scroll', () => {
  const doc = document.documentElement;
  const scrolled = doc.scrollTop || document.body.scrollTop;
  const total = doc.scrollHeight - doc.clientHeight;
  document.getElementById('progress-fill').style.width = (total > 0 ? (scrolled / total) * 100 : 0) + '%';
  updateTOC();
}, { passive: true });

// Auto-build TOC from headings
(function buildTOC() {
  const headings = [...document.querySelectorAll('#article-content h2, #article-content h3')]
    .filter(h => h.textContent.trim());
  if (!headings.length) return;
  const toc = document.getElementById('toc');
  headings.forEach((h, i) => {
    if (!h.id) h.id = 'toc-h' + i;
    const item = document.createElement('a');
    item.className = 'toc-item' + (h.tagName === 'H3' ? ' h3' : '');
    item.href = '#' + h.id;
    item.innerHTML = `<span class="toc-num">${String(i + 1).padStart(2, '0')}</span><span class="toc-text">${h.textContent.trim()}</span>`;
    toc.appendChild(item);
  });
  document.getElementById('toc-card').style.display = '';
})();

function updateTOC() {
  const items = document.querySelectorAll('#article-content h2[id], #article-content h3[id]');
  let active = null;
  items.forEach(h => {
    if (h.getBoundingClientRect().top <= 120) active = h.id;
  });
  document.querySelectorAll('.toc-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('href') === '#' + active);
  });
}

async function vote(dir) {
  if (!IS_LOGGED_IN) {
    location.href = '/authorization/signin/?next=' + encodeURIComponent(location.pathname);
    return;
  }
  const direction = dir === 'up' ? 1 : -1;
  try {
    const csrf = document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
    const res = await fetch(`/api/v1/articles/${ARTICLE_ID}/vote/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
      body: JSON.stringify({ direction }),
    });
    const data = await res.json();
    if (!data.ok) return;
    userVote = data.user_vote;
    const counter = document.getElementById('vote-count');
    counter.textContent = data.score;
    counter.className = 'vote-count' + (userVote === 1 ? ' up' : userVote === -1 ? ' down' : '');
    document.getElementById('btn-up').classList.toggle('active', userVote === 1);
    document.getElementById('btn-down').classList.toggle('active', userVote === -1);
  } catch (e) { /* ignore */ }
}

function copyLink() {
  navigator.clipboard.writeText(location.href).catch(() => {});
  const btn = document.getElementById('btn-share-top');
  const orig = btn.innerHTML;
  btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Скопировано';
  btn.style.cssText = 'border-color:var(--green-text);color:var(--green-text);background:var(--green-soft);';
  setTimeout(() => { btn.innerHTML = orig; btn.style.cssText = ''; }, 1800);
}
