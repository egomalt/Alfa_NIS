/* Кнопка «Пожаловаться» — общая для страниц статьи и конкурса.
 *
 * Разметка достаточно объявить так:
 *   <button data-report-type="article" data-report-id="12" data-report-author="ivan">…</button>
 *
 * Кнопка показывается только вошедшему и только на чужом материале: на своё
 * жаловаться нельзя, сервер такие запросы тоже отклоняет.
 */
(() => {
  const ESC = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function csrfToken() {
    const cookie = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('csrftoken='));
    if (cookie) return decodeURIComponent(cookie.slice('csrftoken='.length));
    return document.querySelector('meta[name="csrf-token"]')?.content || '';
  }

  function buildModal() {
    const wrap = document.createElement('div');
    wrap.id = 'report-modal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:1000;display:none;align-items:center;' +
      'justify-content:center;background:rgba(0,0,0,.45);padding:20px;';
    wrap.innerHTML = `
      <div style="width:100%;max-width:440px;background:var(--surface);border:1px solid var(--line-2);border-radius:14px;padding:22px;">
        <div style="font-size:18px;font-weight:800;letter-spacing:-.02em;margin-bottom:6px;">Пожаловаться на материал</div>
        <div id="report-target" style="font-size:13px;color:var(--muted);margin-bottom:16px;"></div>
        <div style="font-size:12.5px;font-weight:600;color:var(--text-2);margin-bottom:6px;">Причина</div>
        <textarea id="report-reason" maxlength="2000" rows="4" placeholder="Что не так с этим материалом?"
          style="width:100%;padding:10px 12px;border:1px solid var(--line-2);border-radius:10px;background:var(--bg);color:var(--text);font-size:14px;font-family:inherit;resize:vertical;"></textarea>
        <div id="report-error" style="font-size:12.5px;color:var(--red-text);min-height:18px;margin-top:6px;"></div>
        <div style="display:flex;gap:10px;margin-top:10px;">
          <button type="button" id="report-cancel" style="flex:1;height:42px;border:1px solid var(--line-2);border-radius:10px;background:var(--surface);color:var(--text);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">Отмена</button>
          <button type="button" id="report-send" style="flex:1;height:42px;border:none;border-radius:10px;background:var(--brand);color:var(--on-brand);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">Отправить</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    return wrap;
  }

  let modal = null;
  let current = null;

  function openModal(button) {
    if (!modal) modal = buildModal();
    current = button;
    modal.querySelector('#report-target').textContent = button.dataset.reportTitle || '';
    modal.querySelector('#report-reason').value = '';
    modal.querySelector('#report-error').textContent = '';
    modal.style.display = 'flex';
    modal.querySelector('#report-reason').focus();
  }

  function closeModal() {
    if (modal) modal.style.display = 'none';
    current = null;
  }

  async function send() {
    const reasonEl = modal.querySelector('#report-reason');
    const errEl = modal.querySelector('#report-error');
    const sendBtn = modal.querySelector('#report-send');
    const reason = reasonEl.value.trim();

    if (!reason) { errEl.textContent = 'Опишите, что не так.'; return; }

    sendBtn.disabled = true;
    sendBtn.textContent = 'Отправка…';
    try {
      const resp = await fetch('/api/v1/reports/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
        credentials: 'same-origin',
        body: JSON.stringify({
          target_type: current.dataset.reportType,
          target_id: current.dataset.reportId,
          reason,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) { errEl.textContent = data.message || 'Не удалось отправить жалобу.'; return; }
      closeModal();
      current = null;
      alert(data.message || 'Жалоба отправлена модераторам.');
    } catch (_) {
      errEl.textContent = 'Не удалось отправить жалобу.';
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Отправить';
    }
  }

  document.addEventListener('click', event => {
    const btn = event.target.closest('[data-report-type]');
    if (btn) { openModal(btn); return; }
    if (event.target.id === 'report-cancel' || event.target.id === 'report-modal') { closeModal(); return; }
    if (event.target.id === 'report-send') send();
  });

  // Показываем кнопку только вошедшим и только на чужом материале
  let mePromise = null;

  function loadMe() {
    if (!mePromise) {
      mePromise = fetch('/api/v1/auth/me/')
        .then(r => r.json())
        .then(data => (data.ok ? data.account : null))
        .catch(() => null);
    }
    return mePromise;
  }

  function refresh() {
    const buttons = document.querySelectorAll('[data-report-type]');
    if (!buttons.length) return;
    loadMe().then(me => {
      if (!me) return;
      buttons.forEach(btn => {
        const own = btn.dataset.reportAuthor && btn.dataset.reportAuthor === me.username;
        btn.style.display = own ? 'none' : 'inline-flex';
      });
    });
  }

  // Страницы с асинхронной загрузкой (конкурс) вызывают refresh() сами,
  // когда кнопка появилась в разметке
  window.AlfaReport = { refresh };
  refresh();
})();
