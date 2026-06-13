(() => {
    function getCookie(name) {
        const prefix = `${name}=`;
        const cookies = document.cookie ? document.cookie.split(';') : [];
        for (const rawCookie of cookies) {
            const cookie = rawCookie.trim();
            if (cookie.startsWith(prefix)) {
                return decodeURIComponent(cookie.slice(prefix.length));
            }
        }
        return '';
    }

    function getCsrfToken() {
        return getCookie('csrftoken') || document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    }

    async function fetchJson(url, options = {}) {
        const response = await fetch(url, options);

        let payload = null;
        try {
            payload = await response.json();
        } catch (_error) {
            payload = null;
        }

        if (!response.ok) {
            const error = new Error(payload?.message || payload?.detail || 'Ошибка запроса.');
            error.payload = payload;
            throw error;
        }

        return payload;
    }

    function validateUsername(value) {
        const normalized = String(value || '').trim().toLowerCase();
        const formatMessage = 'Имя пользователя может содержать только буквы, цифры, дефисы и символы подчёркивания.';

        if (!normalized) {
            return 'Введите имя пользователя.';
        }
        if (normalized.includes(' ')) {
            return formatMessage;
        }
        if (normalized.length < 3) {
            return 'Имя пользователя должно содержать 3-50 символов.';
        }
        if (normalized.length > 50) {
            return 'Имя пользователя не должно быть длиннее 50 символов.';
        }
        if (!/^[a-z0-9_-]+$/.test(normalized)) {
            return formatMessage;
        }
        if (!/^[a-z0-9].*[a-z0-9]$/.test(normalized) && normalized.length > 1) {
            return 'Имя пользователя должно начинаться и заканчиваться буквой или цифрой.';
        }
        if (normalized.length === 1 && !/^[a-z0-9]$/.test(normalized)) {
            return 'Имя пользователя должно начинаться и заканчиваться буквой или цифрой.';
        }

        return '';
    }

    function clearFormErrors(form) {
        if (!form) return;
        form.querySelectorAll('[data-field] .errorlist').forEach((list) => {
            list.innerHTML = '';
            list.hidden = true;
        });
    }

    function showFormErrors(form, errors) {
        clearFormErrors(form);

        Object.entries(errors || {}).forEach(([fieldName, values]) => {
            const list = form.querySelector(`[data-field="${fieldName}"] .errorlist`);
            if (!list) return;
            list.innerHTML = '';
            for (const item of values) {
                const li = document.createElement('li');
                li.textContent = item?.message || String(item || 'Ошибка в поле.');
                list.appendChild(li);
            }
            list.hidden = list.children.length === 0;
        });
    }

    function showFlash(message) {
        const flash = document.getElementById('auth-flash');
        if (!flash) return;
        if (!message) {
            flash.hidden = true;
            flash.textContent = '';
            return;
        }
        flash.textContent = message;
        flash.hidden = false;
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.body.addEventListener('submit', async (event) => {
            const form = event.target;
            if (!form.matches('[data-api-form]')) return;
            event.preventDefault();

            clearFormErrors(form);
            showFlash('');

            if (form.dataset.apiForm === 'register') {
                const usernameInput = form.querySelector('#register-username');
                const usernameError = validateUsername(usernameInput?.value || '');
                if (usernameError) {
                    showFormErrors(form, { username: [{ message: usernameError }] });
                    return;
                }
            }

            try {
                const payload = await fetchJson(form.action, {
                    method: 'POST',
                    body: new URLSearchParams(new FormData(form)),
                    headers: {
                        'X-CSRFToken': getCsrfToken(),
                        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    },
                    credentials: 'same-origin',
                });

                if (payload.next_url) {
                    const next = new URLSearchParams(location.search).get('next');
                    window.location.assign(next && next.startsWith('/') ? next : payload.next_url);
                    return;
                }
            } catch (error) {
                showFormErrors(form, error.payload?.errors || {});
                showFlash(error.payload?.message || error.message);
            }
        });

        document.body.addEventListener('focusout', (event) => {
            const usernameInput = event.target.closest('#register-username');
            if (!usernameInput) return;
            const usernameError = validateUsername(usernameInput.value || '');
            const form = usernameInput.closest('form');
            if (usernameError) {
                showFormErrors(form, { username: [{ message: usernameError }] });
            } else {
                const list = form.querySelector('[data-field="username"] .errorlist');
                if (list) {
                    list.innerHTML = '';
                    list.hidden = true;
                }
            }
        });
    });
})();
