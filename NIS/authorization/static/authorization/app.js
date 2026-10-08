/* Формы входа и регистрации.
   Ошибки приходят в двух видах: errors: {поле: [{message}]} — под полем,
   message: "..." — баннером над формой. */
import { api, byId } from 'alfa/core';

/* Та же проверка и те же тексты, что на сервере (core/utils.py), — чтобы не ждать ответа ради опечатки */
function validateUsername(value) {
  const username = value.trim().toLowerCase();
  if (!username) return 'Введите имя пользователя.';
  if (username.length < 3 || username.length > 50) return 'Имя пользователя должно быть от 3 до 50 символов.';
  if (!/^[a-z0-9_-]+$/.test(username)) return 'Используйте только латинские буквы, цифры, дефис и подчёркивание.';
  if (!/^[a-z0-9](.*[a-z0-9])?$/.test(username))
    return 'Имя пользователя должно начинаться и заканчиваться латинской буквой или цифрой.';
  return '';
}

function setFieldError(block, messages = []) {
  const list = block.querySelector('.errorlist');
  list?.replaceChildren(
    ...messages.map((message) => Object.assign(document.createElement('li'), { textContent: message })),
  );
  if (list) list.hidden = !messages.length;
  const invalid = messages.length > 0;
  block.querySelectorAll('input').forEach((input) => {
    input.classList.toggle('is-invalid', invalid);
    if (invalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  });
}

const clearFormErrors = (form) => form.querySelectorAll('[data-field]').forEach((block) => setFieldError(block));

function showFieldErrors(form, errors) {
  clearFormErrors(form);
  for (const [field, items] of Object.entries(errors)) {
    const block = form.querySelector(`[data-field="${field}"]`);
    if (block)
      setFieldError(
        block,
        items.map((item) => item?.message ?? String(item)),
      );
  }
  // Курсор — в первое проблемное поле, чтобы не искать его глазами
  form.querySelector('.is-invalid')?.focus();
}

function showFlash(message = '', kind = 'error') {
  const flash = byId('auth-flash');
  flash.classList.toggle('app-alert-success', kind === 'success');
  flash.textContent = message;
  flash.hidden = !message;
}

function setBusy(form, busy) {
  const button = form.querySelector('[type="submit"]');
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = form.dataset.apiForm === 'register' ? 'Создаём аккаунт…' : 'Входим…';
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
  button.disabled = busy;
}

/* Начинается с одного слэша и не с «//» или «/\» — иначе это адрес чужого
   сайта, и переход по нему увёл бы пользователя с платформы */
function safeNextUrl(fallback) {
  const next = new URLSearchParams(location.search).get('next');
  return next && /^\/(?![/\\])/.test(next) ? next : fallback;
}

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-api-form]');
  if (!form) return;
  event.preventDefault();
  clearFormErrors(form);
  showFlash();

  const isRegister = form.dataset.apiForm === 'register';
  if (isRegister) {
    const usernameError = validateUsername(form.elements.username.value);
    if (usernameError) {
      showFieldErrors(form, { username: [usernameError] });
      return;
    }
  }

  setBusy(form, true);
  try {
    const { next_url: nextUrl } = await api.post(form.action, new URLSearchParams(new FormData(form)));
    showFlash(isRegister ? 'Аккаунт создан, открываем кабинет…' : 'Входим…', 'success');
    location.assign(safeNextUrl(nextUrl || '/'));
  } catch (error) {
    setBusy(form, false);
    const errors = error.data?.errors;
    // Ошибки полей показываем под полями — баннер был бы дублированием
    if (errors && Object.keys(errors).length) showFieldErrors(form, errors);
    else showFlash(error.message);
  }
});

/* Показ пароля — один делегированный обработчик на все поля.
   Кнопка вне обхода табом (tabindex=-1): она не шаг формы */
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-toggle-password]');
  if (!button) return;
  const input = byId(button.dataset.togglePassword);
  const shown = input.type === 'text';
  input.type = shown ? 'password' : 'text';
  button.setAttribute('aria-pressed', String(!shown));
  button.setAttribute('aria-label', shown ? 'Показать пароль' : 'Скрыть пароль');
  // Смена type сбрасывает курсор в начало — возвращаем в конец
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
});

// Ошибка поля гаснет, как только человек начал его править
document.addEventListener('input', (event) => {
  const block = event.target.closest('[data-field]');
  if (block) setFieldError(block);
});

// Имя пользователя проверяем сразу при уходе из поля. Фокус не трогаем —
// человек как раз уходит из поля
document.addEventListener('focusout', (event) => {
  const input = event.target.closest('#register-username');
  if (!input?.value.trim()) return;
  const usernameError = validateUsername(input.value);
  if (usernameError) setFieldError(input.closest('[data-field]'), [usernameError]);
});

const ROLES = {
  candidate: {
    nameLabel: 'Отображаемое имя',
    namePlaceholder: 'Например, Иван Иванов',
    emailLabel: 'Email',
    emailPlaceholder: 'ivan@example.com',
    submit: 'Создать аккаунт кандидата',
  },
  company: {
    nameLabel: 'Название компании',
    namePlaceholder: 'Например, Alfa Career',
    emailLabel: 'Рабочий email',
    emailPlaceholder: 'team@company.com',
    submit: 'Создать кабинет компании',
  },
};

byId('role-toggle')?.addEventListener('click', (event) => {
  const button = event.target.closest('.cr-role-btn');
  if (!button) return;
  const { role } = button.dataset;
  const config = ROLES[role];
  byId('role-input').value = role;
  byId('label-name').textContent = config.nameLabel;
  byId('register-name').placeholder = config.namePlaceholder;
  byId('email-label').textContent = config.emailLabel;
  byId('register-email').placeholder = config.emailPlaceholder;
  byId('signup-submit').textContent = config.submit;
  document.querySelectorAll('.cr-role-btn').forEach((item) => item.classList.toggle('active', item === button));
});
