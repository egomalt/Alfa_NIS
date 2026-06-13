(() => {
    const BOOTSTRAP = window.ALFA_APP_BOOTSTRAP || {};
    const username = BOOTSTRAP.username;
    const CSRF = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

    let state = { candidate: null, isOwner: false };

    function esc(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function initial(name) { return (name || '?').trim()[0].toUpperCase(); }

    function formatDate(iso) {
        if (!iso) return '';
        try { return new Date(iso).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' }); }
        catch { return ''; }
    }
    function formatTestDate(iso) {
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

    async function logout() {
        await fetch('/api/v1/auth/signout/', { method: 'POST', headers: { 'X-CSRFToken': CSRF() } });
        window.location.assign('/');
    }

    async function uploadAvatar(tests, file) {
        const body = new FormData();
        body.append('avatar', file);
        try {
            const data = await apiFetch(`/api/v1/candidates/${username}/avatar/`, { method: 'POST', body });
            state.candidate = data.candidate;
            renderProfile(tests);
        } catch (e) { alert(e.message); }
    }

    // ── Профиль ───────────────────────────────────────────────────────────

    function renderProfile(tests) {
        const c = state.candidate;
        const el = document.getElementById('cd-content');
        if (!el) return;

        const STATUS_COLORS = {
            draft:     { bg: 'var(--amber-soft)', color: 'var(--amber-text)' },
            published: { bg: 'var(--green-soft)',  color: 'var(--green-text)' },
        };
        const STATUS_LABELS = { draft: 'Черновик', published: 'Опубликован' };

        const avatarInner = c.avatar
            ? `<img src="${esc(c.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : `<span style="font-size:32px;font-weight:700;color:var(--brand-text);">${esc(initial(c.name))}</span>`;

        const editAvatarBtn = state.isOwner
            ? `<button id="cd-avatar-btn" title="Сменить фото"
                 style="position:absolute;bottom:3px;right:3px;width:26px;height:26px;border-radius:50%;background:var(--text);color:var(--bg);border:2px solid var(--surface);cursor:pointer;display:flex;align-items:center;justify-content:center;"
                 onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'">
                 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
               </button>`
            : '';

        const ownerBtns = state.isOwner
            ? `<div style="display:flex;gap:9px;flex-shrink:0;padding-bottom:6px;">
                 <button id="cd-edit-btn"
                   style="height:36px;padding:0 15px;border:1px solid var(--line-2);border-radius:9px;background:var(--surface);color:var(--text);font-size:13.5px;font-weight:600;cursor:pointer;"
                   onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background='var(--surface)'">Редактировать</button>
                 <button id="cd-logout-inline"
                   style="height:36px;padding:0 15px;border:1px solid var(--line-2);border-radius:9px;background:var(--surface);color:var(--text-2);font-size:13.5px;font-weight:600;cursor:pointer;"
                   onmouseover="this.style.color='var(--red-text)';this.style.borderColor='var(--red-text)'"
                   onmouseout="this.style.color='var(--text-2)';this.style.borderColor='var(--line-2)'">Выйти</button>
               </div>`
            : '';

        const bioHtml = c.bio
            ? `<p style="font-size:14px;line-height:1.65;color:var(--text-2);margin:0;text-wrap:pretty;">${esc(c.bio)}</p>`
            : `<p style="font-size:14px;color:var(--faint);margin:0;">${state.isOwner ? 'Нажмите «Редактировать», чтобы добавить информацию о себе.' : 'Биография не заполнена.'}</p>`;

        const skills = c.skills || [];
        const skillsHtml = skills.length
            ? skills.map(sk => `<span style="padding:5px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);font-size:13px;font-weight:500;color:var(--text-2);">${esc(sk)}</span>`).join('')
            : `<span style="font-size:13.5px;color:var(--faint);">${state.isOwner ? 'Добавьте навыки в редактировании профиля.' : 'Навыки не указаны.'}</span>`;

        let testsPreviewHtml;
        if (!tests || !tests.length) {
            testsPreviewHtml = `<div style="padding:18px;text-align:center;border:1px dashed var(--line-2);border-radius:11px;">
              <div style="font-size:13.5px;color:var(--muted);">Вы ещё не создали ни одного теста</div>
            </div>`;
        } else {
            testsPreviewHtml = tests.slice(0, 3).map(t => {
                const sc = STATUS_COLORS[t.status] || STATUS_COLORS.draft;
                return `<a href="${esc(t.edit_url)}"
                  style="display:flex;align-items:center;gap:12px;padding:11px 13px;border:1px solid var(--line);border-radius:11px;cursor:pointer;text-decoration:none;color:inherit;"
                  onmouseover="this.style.borderColor='var(--line-2)'" onmouseout="this.style.borderColor='var(--line)'">
                  <span style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;background:var(--surface-2);flex-shrink:0;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="13" height="13" rx="2"/><path d="M5 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1"/></svg>
                  </span>
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(t.title)}</div>
                    <div style="font-size:12px;color:var(--muted);margin-top:1px;">${esc(pluralPages(t.page_count))} · ${esc(formatTestDate(t.created_at))}</div>
                  </div>
                  <span style="font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:999px;background:${sc.bg};color:${sc.color};flex-shrink:0;">${esc(STATUS_LABELS[t.status] || t.status)}</span>
                </a>`;
            }).join('');
        }

        const emailRow = c.email
            ? `<span style="display:inline-flex;align-items:center;gap:5px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>${esc(c.email)}</span>`
            : '';

        el.innerHTML = `
        <input type="file" id="cd-avatar-input" accept="image/*" hidden>

        <div style="border:1px solid var(--line);border-radius:18px;background:var(--surface);overflow:hidden;box-shadow:var(--shadow);">
          <div style="height:88px;background:linear-gradient(120deg,var(--brand) 0%,color-mix(in srgb,var(--brand) 55%,#ff7a45) 100%);"></div>
          <div style="padding:0 28px 24px;">
            <div style="display:flex;align-items:flex-end;gap:18px;margin-top:-42px;">
              <div style="position:relative;flex-shrink:0;">
                <div style="width:90px;height:90px;border-radius:50%;background:var(--brand-soft);border:4px solid var(--surface);display:flex;align-items:center;justify-content:center;overflow:hidden;">${avatarInner}</div>
                ${editAvatarBtn}
              </div>
              <div style="flex:1;padding-bottom:6px;">
                <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;">
                  <h1 style="font-size:24px;font-weight:800;letter-spacing:-.02em;margin:0;">${esc(c.name)}</h1>
                  <span style="font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;background:var(--brand-soft);color:var(--brand-text);">Кандидат</span>
                </div>
              </div>
              ${ownerBtns}
            </div>
            <div style="display:flex;align-items:center;gap:16px;margin-top:12px;font-size:13.5px;color:var(--muted);flex-wrap:wrap;">
              <span style="font-family:'JetBrains Mono',monospace;font-size:12.5px;">@${esc(c.username)}</span>
              ${emailRow}
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 310px;gap:20px;margin-top:20px;align-items:start;">
          <div style="display:flex;flex-direction:column;gap:20px;">

            <div style="border:1px solid var(--line);border-radius:16px;background:var(--surface);padding:22px 24px;">
              <div style="font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--faint);margin-bottom:12px;">О себе</div>
              ${bioHtml}
            </div>

            <div style="border:1px solid var(--line);border-radius:16px;background:var(--surface);padding:22px 24px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                <div style="font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--faint);">Мои тесты</div>
                <div style="display:flex;gap:7px;">
                  <button id="cd-all-tests-btn"
                    style="display:inline-flex;align-items:center;height:28px;padding:0 11px;border:1px solid var(--line-2);border-radius:7px;font-size:12.5px;color:var(--text-2);cursor:pointer;background:var(--surface);"
                    onmouseover="this.style.color='var(--brand-text)';this.style.borderColor='var(--brand)'"
                    onmouseout="this.style.color='var(--text-2)';this.style.borderColor='var(--line-2)'">Все</button>
                  <a href="/constructor/?owner=${esc(username)}"
                    style="display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border:1px solid var(--line-2);border-radius:7px;background:var(--surface);color:var(--text-2);font-size:12.5px;font-weight:500;text-decoration:none;"
                    onmouseover="this.style.borderColor='var(--brand)';this.style.color='var(--brand-text)'"
                    onmouseout="this.style.borderColor='var(--line-2)';this.style.color='var(--text-2)'">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                    Создать
                  </a>
                </div>
              </div>
              <div style="display:flex;flex-direction:column;gap:8px;">${testsPreviewHtml}</div>
            </div>

            <div style="border:1px solid var(--line);border-radius:16px;background:var(--surface);padding:22px 24px;">
              <div style="font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--faint);margin-bottom:12px;">Навыки</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px;">${skillsHtml}</div>
            </div>

            <div style="border:1px solid var(--line);border-radius:16px;background:var(--surface);padding:22px 24px;">
              <div style="font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--faint);margin-bottom:14px;">Пройденные тесты</div>
              <div style="padding:18px;text-align:center;border:1px dashed var(--line-2);border-radius:11px;">
                <div style="font-size:13.5px;color:var(--muted);">История прохождений появится здесь</div>
              </div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:20px;position:sticky;top:88px;">
            <div style="border:1px solid var(--line);border-radius:16px;background:var(--surface);padding:20px 22px;">
              <div style="font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--faint);margin-bottom:14px;">Статистика</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div style="padding:13px;border:1px solid var(--line);border-radius:11px;background:var(--bg);">
                  <div style="font-family:'JetBrains Mono',monospace;font-size:21px;font-weight:600;letter-spacing:-.02em;">${(tests || []).length}</div>
                  <div style="font-size:11.5px;color:var(--muted);margin-top:3px;">Тестов создано</div>
                </div>
                <div style="padding:13px;border:1px solid var(--line);border-radius:11px;background:var(--bg);">
                  <div style="font-family:'JetBrains Mono',monospace;font-size:21px;font-weight:600;letter-spacing:-.02em;">${(tests || []).filter(t => t.status === 'published').length}</div>
                  <div style="font-size:11.5px;color:var(--muted);margin-top:3px;">Опубликовано</div>
                </div>
                <div style="padding:13px;border:1px solid var(--line);border-radius:11px;background:var(--bg);">
                  <div style="font-family:'JetBrains Mono',monospace;font-size:21px;font-weight:600;letter-spacing:-.02em;">—</div>
                  <div style="font-size:11.5px;color:var(--muted);margin-top:3px;">Тестов пройдено</div>
                </div>
                <div style="padding:13px;border:1px solid var(--line);border-radius:11px;background:var(--bg);">
                  <div style="font-family:'JetBrains Mono',monospace;font-size:21px;font-weight:600;letter-spacing:-.02em;">${skills.length}</div>
                  <div style="font-size:11.5px;color:var(--muted);margin-top:3px;">Навыков</div>
                </div>
              </div>
            </div>
            ${c.created_at ? `<div style="font-size:12px;color:var(--faint);text-align:center;padding:4px 0;">Зарегистрирован ${esc(formatDate(c.created_at))}</div>` : ''}
          </div>
        </div>
        `;

        // Аватар (единственная привязка — здесь)
        const avatarBtn = document.getElementById('cd-avatar-btn');
        const avatarInput = document.getElementById('cd-avatar-input');
        if (avatarBtn && avatarInput) {
            avatarBtn.addEventListener('click', () => avatarInput.click());
            avatarInput.addEventListener('change', e => {
                const file = e.target.files[0];
                if (file) uploadAvatar(tests, file);
            });
        }

        document.getElementById('cd-edit-btn')?.addEventListener('click', () => openEditModal(tests));
        document.getElementById('cd-logout-inline')?.addEventListener('click', logout);
        document.getElementById('cd-all-tests-btn')?.addEventListener('click', () => renderMyTests(tests));
    }

    // ── Страница «Все мои тесты» ──────────────────────────────────────────

    function renderMyTests(tests) {
        const el = document.getElementById('cd-content');
        if (!el) return;

        const STATUS_COLORS = {
            draft:     { bg: 'var(--amber-soft)', color: 'var(--amber-text)' },
            published: { bg: 'var(--green-soft)',  color: 'var(--green-text)' },
        };
        const STATUS_LABELS = { draft: 'Черновик', published: 'Опубликован' };

        let bodyHtml;
        if (!tests || !tests.length) {
            bodyHtml = `<div style="padding:48px;text-align:center;border:1px dashed var(--line-2);border-radius:14px;">
              <div style="font-size:15px;font-weight:600;margin-bottom:6px;color:var(--text);">Тестов пока нет</div>
              <div style="font-size:13.5px;color:var(--muted);margin-bottom:18px;">Создайте первый тест в конструкторе</div>
              <a href="/constructor/?owner=${esc(username)}"
                style="display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 18px;background:var(--brand);color:var(--on-brand);border-radius:9px;font-size:14px;font-weight:600;text-decoration:none;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                Создать тест
              </a>
            </div>`;
        } else {
            bodyHtml = `<div style="display:flex;flex-direction:column;gap:10px;">
              ${tests.map(t => {
                const sc = STATUS_COLORS[t.status] || STATUS_COLORS.draft;
                return `<div style="display:flex;align-items:center;gap:14px;padding:14px 16px;border:1px solid var(--line);border-radius:13px;background:var(--surface);">
                  <span style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9px;background:var(--surface-2);flex-shrink:0;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="13" height="13" rx="2"/><path d="M5 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1"/></svg>
                  </span>
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:14px;font-weight:600;">${esc(t.title)}</div>
                    <div style="font-size:12.5px;color:var(--muted);margin-top:2px;">${esc(pluralPages(t.page_count))} · ${t.submissions ?? 0} прохождений · ${esc(formatTestDate(t.created_at))}</div>
                  </div>
                  <span style="font-size:11.5px;font-weight:600;padding:3px 10px;border-radius:999px;background:${sc.bg};color:${sc.color};flex-shrink:0;">${esc(STATUS_LABELS[t.status] || t.status)}</span>
                  <a href="${esc(t.edit_url)}"
                    style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid var(--line-2);border-radius:8px;color:var(--text-2);flex-shrink:0;"
                    title="Редактировать"
                    onmouseover="this.style.borderColor='var(--brand)';this.style.color='var(--brand-text)'"
                    onmouseout="this.style.borderColor='var(--line-2)';this.style.color='var(--text-2)'">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </a>
                </div>`;
            }).join('')}
            </div>`;
        }

        el.innerHTML = `
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:32px;">
          <button id="cd-back-btn"
            style="display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--text-2);font-size:13px;cursor:pointer;"
            onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='var(--text-2)'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/></svg>
            Профиль
          </button>
          <h1 style="font-size:26px;font-weight:800;letter-spacing:-.02em;margin:0;flex:1;">Мои тесты</h1>
          <a href="/constructor/?owner=${esc(username)}"
            style="display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 16px;background:var(--brand);color:var(--on-brand);border-radius:9px;font-size:13.5px;font-weight:600;text-decoration:none;"
            onmouseover="this.style.background='var(--brand-strong)'" onmouseout="this.style.background='var(--brand)'">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Создать тест
          </a>
        </div>
        ${bodyHtml}
        `;

        document.getElementById('cd-back-btn')?.addEventListener('click', () => renderProfile(tests));
    }

    // ── Модалка редактирования ────────────────────────────────────────────

    function openEditModal(tests) {
        const c = state.candidate;

        const overlay = document.createElement('div');
        overlay.id = 'cd-edit-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px;';

        overlay.innerHTML = `
          <div style="width:100%;max-width:520px;border:1px solid var(--line);border-radius:18px;background:var(--surface);padding:32px;box-shadow:var(--shadow-lg);max-height:90vh;overflow-y:auto;">
            <h2 style="font-size:20px;font-weight:800;letter-spacing:-.02em;margin:0 0 22px;">Редактировать профиль</h2>
            <div id="cd-edit-flash" style="margin-bottom:4px;"></div>
            <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:22px;">
              <div>
                <div style="font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:6px;">Отображаемое имя</div>
                <input id="cd-edit-name" type="text" value="${esc(c.name)}" maxlength="255"
                  style="width:100%;box-sizing:border-box;height:42px;padding:0 13px;border:1px solid var(--line-2);border-radius:9px;background:var(--bg);color:var(--text);font-size:14px;font-family:inherit;outline:none;"
                  onfocus="this.style.borderColor='var(--brand)'" onblur="this.style.borderColor='var(--line-2)'">
              </div>
              <div>
                <div style="font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:6px;">О себе</div>
                <textarea id="cd-edit-bio" maxlength="1000" placeholder="Расскажите о себе…"
                  style="width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid var(--line-2);border-radius:9px;background:var(--bg);color:var(--text);font-size:14px;font-family:inherit;resize:vertical;min-height:110px;outline:none;"
                  onfocus="this.style.borderColor='var(--brand)'" onblur="this.style.borderColor='var(--line-2)'">${esc(c.bio)}</textarea>
              </div>
              <div>
                <div style="font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:4px;">Навыки</div>
                <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Перечислите через запятую: React, TypeScript, Go…</div>
                <input id="cd-edit-skills" type="text" value="${esc((c.skills || []).join(', '))}" maxlength="500"
                  placeholder="React, TypeScript, Git…"
                  style="width:100%;box-sizing:border-box;height:42px;padding:0 13px;border:1px solid var(--line-2);border-radius:9px;background:var(--bg);color:var(--text);font-size:14px;font-family:inherit;outline:none;"
                  onfocus="this.style.borderColor='var(--brand)'" onblur="this.style.borderColor='var(--line-2)'">
              </div>
            </div>
            <div style="display:flex;gap:10px;justify-content:flex-end;">
              <button id="cd-modal-cancel"
                style="height:42px;padding:0 18px;border:1px solid var(--line-2);border-radius:9px;background:var(--surface);color:var(--text-2);font-size:14px;font-weight:600;cursor:pointer;"
                onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background='var(--surface)'">Отмена</button>
              <button id="cd-modal-save"
                style="height:42px;padding:0 18px;border:none;border-radius:9px;background:var(--brand);color:var(--on-brand);font-size:14px;font-weight:600;cursor:pointer;"
                onmouseover="this.style.background='var(--brand-strong)'" onmouseout="this.style.background='var(--brand)'">Сохранить</button>
            </div>
          </div>
        `;

        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeEditModal(); });
        document.getElementById('cd-modal-cancel').addEventListener('click', closeEditModal);
        document.getElementById('cd-modal-save').addEventListener('click', () => saveProfile(tests));
        document.addEventListener('keydown', onEscKey);
        document.getElementById('cd-edit-name')?.focus();
    }

    function closeEditModal() {
        document.getElementById('cd-edit-overlay')?.remove();
        document.removeEventListener('keydown', onEscKey);
    }
    function onEscKey(e) { if (e.key === 'Escape') closeEditModal(); }

    async function saveProfile(tests) {
        const saveBtn = document.getElementById('cd-modal-save');
        const flashEl = document.getElementById('cd-edit-flash');
        const name = document.getElementById('cd-edit-name')?.value.trim();
        const bio = document.getElementById('cd-edit-bio')?.value.trim();
        const skillsStr = document.getElementById('cd-edit-skills')?.value || '';
        const skills = skillsStr.split(',').map(s => s.trim()).filter(Boolean);

        if (!name) {
            if (flashEl) flashEl.innerHTML = `<div style="padding:10px 14px;border-radius:9px;background:var(--red-soft);color:var(--red-text);font-size:13.5px;margin-bottom:10px;">Имя не может быть пустым.</div>`;
            return;
        }
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Сохранение…'; }

        try {
            const data = await apiFetch(`/api/v1/candidates/${username}/update/`, {
                method: 'PATCH',
                body: JSON.stringify({ name, bio: bio || '', skills }),
            });
            state.candidate = data.candidate;
            closeEditModal();
            renderProfile(tests);
        } catch (e) {
            if (flashEl) flashEl.innerHTML = `<div style="padding:10px 14px;border-radius:9px;background:var(--red-soft);color:var(--red-text);font-size:13.5px;margin-bottom:10px;">${esc(e.message)}</div>`;
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Сохранить'; }
        }
    }

    // ── Init ──────────────────────────────────────────────────────────────

    async function init() {
        if (!username) return;
        document.getElementById('cd-logout-btn')?.addEventListener('click', logout);

        try {
            const [candData, testsResp] = await Promise.all([
                apiFetch(`/api/v1/candidates/${username}/`),
                fetch(`/api/v1/tests/?owner=${encodeURIComponent(username)}`).then(r => r.json()).catch(() => ({ ok: false })),
            ]);

            state.candidate = candData.candidate;
            state.isOwner = candData.is_owner;

            const tests = testsResp.ok ? (testsResp.tests || []) : [];
            renderProfile(tests);
        } catch (e) {
            const el = document.getElementById('cd-content');
            if (el) el.innerHTML = `<div style="padding:80px;text-align:center;color:var(--muted);">${esc(e.message)}</div>`;
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
