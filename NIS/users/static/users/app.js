(() => {
    const BOOTSTRAP = window.ALFA_APP_BOOTSTRAP || {};
    const username = BOOTSTRAP.username;
    const CSRF = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

    let state = { candidate: null, isOwner: false, editing: false };

    function escHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function getInitial(name) {
        return (name || '?').trim()[0].toUpperCase();
    }

    function formatDate(iso) {
        if (!iso) return '';
        try {
            return new Date(iso).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' });
        } catch { return ''; }
    }

    // ── API ───────────────────────────────────────────────────────────────────

    async function apiFetch(url, options = {}) {
        const isFormData = options.body instanceof FormData;
        const res = await fetch(url, {
            headers: {
                'X-CSRFToken': CSRF(),
                ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
                ...(options.headers || {}),
            },
            ...options,
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || 'Ошибка сервера');
        return data;
    }

    // ── Render view mode ──────────────────────────────────────────────────────

    function renderProfile() {
        const c = state.candidate;
        const container = document.getElementById('cd-content');
        if (!container) return;

        const avatarHtml = c.avatar
            ? `<img src="${escHtml(c.avatar)}" alt="">`
            : escHtml(getInitial(c.name));

        const avatarEditBtn = state.isOwner
            ? `<button type="button" class="cd-avatar-edit-btn" id="cd-avatar-btn" title="Сменить фото">✎</button>`
            : '';

        const bioHtml = c.bio
            ? `<p class="cd-bio">${escHtml(c.bio)}</p>`
            : `<p class="cd-empty-bio">${state.isOwner ? 'Нажмите «Редактировать», чтобы добавить биографию' : 'Биография не заполнена'}</p>`;

        const editBtn = state.isOwner
            ? `<button type="button" class="cd-btn" id="cd-edit-btn">Редактировать</button>`
            : '';

        container.innerHTML = `
            <div class="cd-card">
                <div class="cd-card-header">
                    <div class="cd-avatar-wrap">
                        <div class="cd-avatar">${avatarHtml}</div>
                        ${avatarEditBtn}
                        <input type="file" id="cd-avatar-input" accept="image/*" hidden>
                    </div>
                    <div class="cd-header-info">
                        <h1 class="cd-name">${escHtml(c.name)}</h1>
                        <p class="cd-username">@${escHtml(c.username)}</p>
                        <span class="cd-role-badge">Кандидат</span>
                    </div>
                </div>
                <div class="cd-card-body">
                    <div class="cd-section">
                        <div class="cd-section-label">О себе</div>
                        ${bioHtml}
                    </div>
                    ${c.created_at ? `<div class="cd-section"><div class="cd-meta">Зарегистрирован ${escHtml(formatDate(c.created_at))}</div></div>` : ''}
                    ${editBtn ? `<div class="cd-actions">${editBtn}</div>` : ''}
                </div>
            </div>
        `;

        document.getElementById('cd-edit-btn')?.addEventListener('click', () => renderEditForm());

        const avatarBtn = document.getElementById('cd-avatar-btn');
        const avatarInput = document.getElementById('cd-avatar-input');
        if (avatarBtn && avatarInput) {
            avatarBtn.addEventListener('click', () => avatarInput.click());
            avatarInput.addEventListener('change', e => {
                const file = e.target.files[0];
                if (file) uploadAvatar(file);
            });
        }
    }

    // ── Render edit form ──────────────────────────────────────────────────────

    function renderEditForm() {
        const c = state.candidate;
        const container = document.getElementById('cd-content');
        if (!container) return;

        container.innerHTML = `
            <div class="cd-card">
                <div class="cd-card-body">
                    <h2 style="margin:0 0 20px;font-size:1.1rem;font-weight:700">Редактирование профиля</h2>
                    <div id="cd-edit-flash"></div>
                    <div class="cd-edit-field">
                        <label class="cd-edit-label" for="edit-name">Отображаемое имя</label>
                        <input class="cd-edit-input" id="edit-name" type="text" value="${escHtml(c.name)}" maxlength="255">
                    </div>
                    <div class="cd-edit-field">
                        <label class="cd-edit-label" for="edit-bio">О себе</label>
                        <textarea class="cd-edit-textarea" id="edit-bio" placeholder="Расскажите о себе…" maxlength="1000">${escHtml(c.bio)}</textarea>
                    </div>
                    <div class="cd-actions">
                        <button type="button" class="cd-btn cd-btn-primary" id="cd-save-btn">Сохранить</button>
                        <button type="button" class="cd-btn" id="cd-cancel-btn">Отмена</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('cd-cancel-btn').addEventListener('click', renderProfile);
        document.getElementById('cd-save-btn').addEventListener('click', saveProfile);
    }

    // ── Save ──────────────────────────────────────────────────────────────────

    async function saveProfile() {
        const saveBtn = document.getElementById('cd-save-btn');
        const flashEl = document.getElementById('cd-edit-flash');
        const name = document.getElementById('edit-name')?.value.trim();
        const bio = document.getElementById('edit-bio')?.value.trim();

        if (!name) {
            flashEl.innerHTML = `<div class="cd-flash error">Имя не может быть пустым.</div>`;
            return;
        }

        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Сохранение…'; }

        try {
            const data = await apiFetch(`/api/v1/candidates/${username}/update/`, {
                method: 'PATCH',
                body: JSON.stringify({ name, bio: bio || '' }),
            });
            state.candidate = data.candidate;
            renderProfile();
        } catch (e) {
            if (flashEl) flashEl.innerHTML = `<div class="cd-flash error">${escHtml(e.message)}</div>`;
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Сохранить'; }
        }
    }

    // ── Avatar upload ─────────────────────────────────────────────────────────

    async function uploadAvatar(file) {
        const body = new FormData();
        body.append('avatar', file);

        try {
            const data = await apiFetch(`/api/v1/candidates/${username}/avatar/`, {
                method: 'POST',
                body,
            });
            state.candidate = data.candidate;
            renderProfile();
        } catch (e) {
            alert(e.message);
        }
    }

    // ── Logout ────────────────────────────────────────────────────────────────

    function bindLogout() {
        const btn = document.getElementById('cd-logout-btn');
        if (!btn) return;
        btn.addEventListener('click', async () => {
            await fetch('/api/v1/auth/signout/', {
                method: 'POST',
                headers: { 'X-CSRFToken': CSRF() },
            });
            window.location.assign('/');
        });
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    async function init() {
        if (!username) return;
        bindLogout();

        try {
            const data = await apiFetch(`/api/v1/candidates/${username}/`);
            state.candidate = data.candidate;
            state.isOwner = data.is_owner;

            if (state.isOwner) {
                const logoutBtn = document.getElementById('cd-logout-btn');
                if (logoutBtn) logoutBtn.hidden = false;
            }

            renderProfile();
        } catch (e) {
            const container = document.getElementById('cd-content');
            if (container) container.innerHTML = `<div class="cd-loading">${escHtml(e.message)}</div>`;
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
