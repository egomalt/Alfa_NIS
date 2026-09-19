/* Кнопка «Пожаловаться». Разметка объявляет цель атрибутами:
   <button data-report-type="article" data-report-id="12" data-report-author="ivan">
   Показывается только вошедшему и только на чужом материале. */
(() => {
  function csrfToken() {
    const cookie = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('csrftoken='));
    if (cookie) return decodeURIComponent(cookie.slice('csrftoken='.length));
    return document.querySelector('meta[name="csrf-token"]')?.content || '';
  }

  function buildModal() {
    const wrap = document.createElement('div');
    wrap.id = 'report-modal';
    wrap.className = 'cr-modal';
    wrap.innerHTML = `
      <div class="cr-modal-card">
        <div class="cr-modal-title">Пожаловаться на материал</div>
        <div class="cr-modal-sub" id="report-target"></div>
        <div class="cr-modal-label">Причина</div>
        <textarea id="report-reason" class="cr-modal-textarea" maxlength="2000"
                  placeholder="Что не так с этим материалом?"></textarea>
        <div class="cr-modal-error" id="report-error"></div>
        <div class="cr-modal-actions">
          <button type="button" id="report-cancel" class="cr-modal-btn-cancel">Отмена</button>
          <button type="button" id="report-send" class="cr-modal-btn-primary">Отправить</button>
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
    modal.classList.add('open');
    modal.querySelector('#report-reason').focus();
  }

  function closeModal() {
    if (modal) modal.classList.remove('open');
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
        btn.style.display = own ? 'none' : 'inline-flex';  // класс скрывает по умолчанию
      });
    });
  }

  // Страницы с асинхронной загрузкой (конкурс) вызывают refresh() сами,
  // когда кнопка появилась в разметке
  window.AlfaReport = { refresh };
  refresh();
})();
