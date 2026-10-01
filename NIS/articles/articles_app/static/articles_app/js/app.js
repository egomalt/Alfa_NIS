/* Страница чтения статьи: прогресс чтения, оглавление, голосование, ссылка. */
import { api, byId, esc, pageData, toast } from 'alfa/core';

const { articleId, isLoggedIn } = pageData();
const CHECK_ICON =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>';

const headings = [...document.querySelectorAll('#article-content h2, #article-content h3')].filter((heading) =>
  heading.textContent.trim(),
);

headings.forEach((heading, index) => {
  heading.id ||= `toc-h${index}`;
  const item = document.createElement('a');
  item.className = `toc-item${heading.tagName === 'H3' ? ' h3' : ''}`;
  item.href = `#${heading.id}`;
  item.innerHTML = `<span class="toc-num">${String(index + 1).padStart(2, '0')}</span><span class="toc-text">${esc(heading.textContent.trim())}</span>`;
  byId('toc').append(item);
});
byId('toc-card').hidden = !headings.length;

function highlightCurrentHeading() {
  const current = headings.findLast((heading) => heading.getBoundingClientRect().top <= 120);
  document
    .querySelectorAll('.toc-item')
    .forEach((item) => item.classList.toggle('active', item.hash === `#${current?.id}`));
}

addEventListener(
  'scroll',
  () => {
    const doc = document.documentElement;
    const total = doc.scrollHeight - doc.clientHeight;
    byId('progress-fill').style.width = `${total > 0 ? (doc.scrollTop / total) * 100 : 0}%`;
    highlightCurrentHeading();
  },
  { passive: true },
);

document.querySelectorAll('[data-vote]').forEach((button) =>
  button.addEventListener('click', async () => {
    if (!isLoggedIn) {
      location.href = `/authorization/signin/?next=${encodeURIComponent(location.pathname)}`;
      return;
    }
    try {
      const { score, user_vote: vote } = await api.post(`/api/v1/articles/${articleId}/vote/`, {
        direction: Number(button.dataset.vote),
      });
      const counter = byId('vote-count');
      counter.textContent = score;
      counter.classList.toggle('up', vote === 1);
      counter.classList.toggle('down', vote === -1);
      byId('btn-up').classList.toggle('active', vote === 1);
      byId('btn-down').classList.toggle('active', vote === -1);
    } catch (error) {
      // Голос не записался — счётчик остаётся прежним, а человек узнаёт почему
      toast(error.message);
    }
  }),
);

byId('btn-share-top').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (button.classList.contains('is-copied')) return;
  await navigator.clipboard?.writeText(location.href).catch(() => null);
  const original = button.innerHTML;
  button.innerHTML = `${CHECK_ICON} Скопировано`;
  button.classList.add('is-copied');
  setTimeout(() => {
    button.innerHTML = original;
    button.classList.remove('is-copied');
  }, 1800);
});
