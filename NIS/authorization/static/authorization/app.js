/* Формы входа и регистрации.
   Ошибки приходят в двух видах: errors: {поле: [{message}]} — под полем,
   message: "..." — баннером над формой. */
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
        return getCookie('csrftoken')
            || document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')
            || '';
    }

    async function postForm(url, form) {
        const response = await fetch(url, {
            method: 'POST',
            body: new URLSearchParams(new FormData(form)),
            headers: {
                'X-CSRFToken': getCsrfToken(),
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            },
            credentials: 'same-origin',
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch (_error) {
            payload = null;
        }

        if (!response.ok) {
            const error = new Error(payload?.message || 'Не удалось связаться с сервером. Попробуйте ещё раз.');
            error.payload = payload;
            throw error;
        }
        return payload;
    }

    function validateUsername(value) {
        const normalized = String(value || '').trim().toLowerCase();
        const formatMessage = 'Имя пользователя может содержать только буквы, цифры, дефисы и символы подчёркивания.';

        if (!normalized) return 'Введите имя пользователя.';
        if (normalized.includes(' ')) return formatMessage;
        if (normalized.length < 3) return 'Имя пользователя должно содержать 3-50 символов.';
        if (normalized.length > 50) return 'Имя пользователя не должно быть длиннее 50 символов.';
        if (!/^[a-z0-9_-]+$/.test(normalized)) return formatMessage;
        if (!/^[a-z0-9]$/.test(normalized) && !/^[a-z0-9].*[a-z0-9]$/.test(normalized)) {
            return 'Имя пользователя должно начинаться и заканчиваться буквой или цифрой.';
        }
        return '';
    }

    /* ── Показ ошибок ───────────────────────────────────────────────── */

    function fieldBlock(form, fieldName) {
        return form.querySelector(`[data-field="${fieldName}"]`);
    }

    function clearFieldError(block) {
        if (!block) return;
        const list = block.querySelector('.errorlist');
        if (list) {
            list.innerHTML = '';
            list.hidden = true;
        }
        block.querySelectorAll('input').forEach(input => {
            input.classList.remove('is-invalid');
            input.removeAttribute('aria-invalid');
        });
    }

    function clearFormErrors(form) {
        if (!form) return;
        form.querySelectorAll('[data-field]').forEach(clearFieldError);
    }

    function showFieldErrors(form, errors, { focusFirst = true } = {}) {
        clearFormErrors(form);

        let firstInvalid = null;
        Object.entries(errors || {}).forEach(([fieldName, messages]) => {
            const block = fieldBlock(form, fieldName);
            if (!block) return;

            const list = block.querySelector('.errorlist');
            if (list) {
                list.innerHTML = '';
                for (const item of messages) {
                    const li = document.createElement('li');
                    li.textContent = item?.message || String(item || 'Ошибка в поле.');
                    list.appendChild(li);
                }
                list.hidden = list.children.length === 0;
            }

            block.querySelectorAll('input').forEach(input => {
                input.classList.add('is-invalid');
                input.setAttribute('aria-invalid', 'true');
                if (!firstInvalid) firstInvalid = input;
            });
        });

        // Курсор — в первое проблемное поле, чтобы не искать его глазами
        if (focusFirst && firstInvalid) firstInvalid.focus();
    }

    function showFlash(message, kind = 'error') {
        const flash = document.getElementById('auth-flash');
        if (!flash) return;
        flash.classList.toggle('app-alert-success', kind === 'success');
        if (!message) {
            flash.hidden = true;
            flash.textContent = '';
            return;
        }
        flash.textContent = message;
        flash.hidden = false;
    }

    function setBusy(form, busy) {
        const button = form.querySelector('[type="submit"]');
        if (!button) return;
        if (busy) {
            button.dataset.label = button.textContent;
            button.textContent = form.dataset.apiForm === 'register' ? 'Создаём аккаунт…' : 'Входим…';
        } else if (button.dataset.label) {
            button.textContent = button.dataset.label;
        }
        button.disabled = busy;
    }

    /* ── Переход после успеха ───────────────────────────────────────── */

    function safeNextUrl(fallback) {
        const next = new URLSearchParams(location.search).get('next');
        // Начинается с одного слэша и не с «//» или «/\» — иначе это адрес чужого
        // сайта, и переход по нему увёл бы пользователя с платформы.
        if (next && /^\/(?![/\\])/.test(next)) return next;
        return fallback;
    }

    /* ── Обработчики ────────────────────────────────────────────────── */

    document.addEventListener('DOMContentLoaded', () => {
        /* Показ пароля. Делегированием, а не по кнопке на поле: полей три
           на двух страницах, и обработчик один на все. Кнопка вне обхода
           табом (tabindex=-1) — она не шаг формы, а подсказка себе. */
        document.body.addEventListener('click', (event) => {
            const button = event.target.closest('[data-toggle-password]');
            if (!button) return;
            const input = document.getElementById(button.dataset.togglePassword);
            if (!input) return;
            const shown = input.type === 'text';
            input.type = shown ? 'password' : 'text';
            button.setAttribute('aria-pressed', String(!shown));
            button.setAttribute('aria-label', shown ? 'Показать пароль' : 'Скрыть пароль');
            // Курсор возвращаем в конец: смена type сбрасывает его в начало
            input.focus();
            const end = input.value.length;
            input.setSelectionRange(end, end);
        });

        document.body.addEventListener('submit', async (event) => {
            const form = event.target;
            if (!form.matches('[data-api-form]')) return;
            event.preventDefault();

            clearFormErrors(form);
            showFlash('');

            if (form.dataset.apiForm === 'register') {
                const usernameError = validateUsername(form.querySelector('#register-username')?.value || '');
                if (usernameError) {
                    showFieldErrors(form, { username: [{ message: usernameError }] });
                    return;
                }
            }

            setBusy(form, true);
            try {
                const payload = await postForm(form.action, form);
                showFlash(
                    form.dataset.apiForm === 'register' ? 'Аккаунт создан, открываем кабинет…' : 'Входим…',
                    'success',
                );
                window.location.assign(safeNextUrl(payload.next_url || '/'));
            } catch (error) {
                setBusy(form, false);
                const fieldErrors = error.payload?.errors;
                if (fieldErrors && Object.keys(fieldErrors).length) {
                    // Ошибки полей показываем под полями — баннер был бы дублированием
                    showFieldErrors(form, fieldErrors);
                } else {
                    showFlash(error.message);
                }
            }
        });

        // Ошибка поля гаснет, как только человек начал его править
        document.body.addEventListener('input', (event) => {
            const block = event.target.closest('[data-field]');
            if (block) clearFieldError(block);
        });

        // Имя пользователя проверяем сразу при уходе из поля
        document.body.addEventListener('focusout', (event) => {
            const usernameInput = event.target.closest('#register-username');
            if (!usernameInput || !usernameInput.value.trim()) return;
            const usernameError = validateUsername(usernameInput.value);
            if (!usernameError) return;

            // Правим только это поле: соседние ошибки трогать нельзя,
            // и фокус не возвращаем — человек как раз уходит из поля
            const block = usernameInput.closest('[data-field]');
            const list = block?.querySelector('.errorlist');
            if (list) {
                list.innerHTML = `<li></li>`;
                list.firstChild.textContent = usernameError;
                list.hidden = false;
            }
            usernameInput.classList.add('is-invalid');
            usernameInput.setAttribute('aria-invalid', 'true');
        });
    });
})();
