/* Кабинет кандидата — раздел «Настройки»: профиль, контакты, ссылки, навыки и фото. */
import { api, byId, confirmDialog, esc } from 'alfa/core';
import { avatarHtml, registerPanel, setText, state, updateCandidate, uploadAvatar, username } from 'alfa/cabinet-user';

// Столько же навыков принимает сервер (users/views.py)
const MAX_SKILLS = 20;
const LINK_KINDS = ['github', 'telegram', 'site'];
const field = (name) => byId(`ud-s-${name}`);
const skillInput = byId('ud-skill-input');
let skills = [];

function flash(message, kind) {
  byId('ud-settings-flash').innerHTML = message ? `<div class="ud-flash ${kind}">${esc(message)}</div>` : '';
}

function renderAvatarBox() {
  byId('ud-avatar-preview').innerHTML = state.candidate.avatar
    ? `<img src="${esc(state.candidate.avatar)}" alt="Фото профиля">`
    : avatarHtml(state.candidate);
  byId('ud-avatar-remove').hidden = !state.candidate.avatar;
}

function renderSkills() {
  byId('ud-skill-chips').innerHTML = skills
    .map(
      (name, index) =>
        `<span class="chip-tag">${esc(name)}<button type="button" class="chip-x" data-index="${index}" title="Убрать" aria-label="Убрать навык ${esc(name)}">×</button></span>`,
    )
    .join('');
  const full = skills.length >= MAX_SKILLS;
  skillInput.disabled = full;
  byId('ud-skill-add').disabled = full;
  setText('ud-skill-count', full ? `— больше ${MAX_SKILLS} не поместится` : `— ${skills.length} из ${MAX_SKILLS}`);
}

/* Список навыков обычно вставляют целиком, через запятую */
function addSkills(raw) {
  for (const part of raw.split(',')) {
    const name = part.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!name || skills.length >= MAX_SKILLS) continue;
    if (!skills.some((skill) => skill.toLowerCase() === name.toLowerCase())) skills.push(name);
  }
  skillInput.value = '';
  renderSkills();
}

/* Форма заполняется из профиля — и при открытии, и по «Отмене» */
function render() {
  const { candidate } = state;
  for (const name of ['name', 'email', 'phone', 'bio']) field(name).value = candidate[name] ?? '';
  // Сервер отдаёт ссылки списком для показа — в форму раскладываем по видам
  const links = Object.fromEntries((candidate.links ?? []).map((link) => [link.kind, link.url]));
  for (const kind of LINK_KINDS) field(kind).value = links[kind] ?? '';
  skills = [...(candidate.skills ?? [])];
  renderSkills();
  renderAvatarBox();
  flash('');
}

/* Сервер меняет только присланные поля */
async function saveProfile(payload) {
  const { candidate } = await api.patch(`/api/v1/candidates/${username}/update/`, payload);
  updateCandidate(candidate);
}

byId('ud-save-settings-btn').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const name = field('name').value.trim();
  if (!name) {
    flash('Имя не может быть пустым.', 'error');
    return;
  }
  // Навык, набранный, но не добавленный в список, не должен пропасть при сохранении
  if (skillInput.value.trim()) addSkills(skillInput.value);

  button.disabled = true;
  button.textContent = 'Сохранение…';
  try {
    // Сервер приводит «@nick» к полному адресу — форма перерисуется с тем, что вышло
    await saveProfile({
      name,
      email: field('email').value.trim(),
      phone: field('phone').value.trim(),
      bio: field('bio').value.trim(),
      skills,
      links: Object.fromEntries(LINK_KINDS.map((kind) => [kind, field(kind).value.trim()])),
    });
    render();
    flash('Сохранено', 'success');
  } catch (error) {
    flash(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Сохранить';
  }
});

byId('ud-cancel-settings-btn').addEventListener('click', render);

byId('ud-avatar-pick').addEventListener('click', () => byId('ud-avatar-input').click());
byId('ud-avatar-input').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;
  try {
    await uploadAvatar(file);
    flash('Фото обновлено', 'success');
  } catch (error) {
    flash(error.message, 'error');
  }
});
byId('ud-avatar-remove').addEventListener('click', async () => {
  if (!(await confirmDialog({ title: 'Удалить фото профиля?', confirmLabel: 'Удалить' }))) return;
  try {
    await saveProfile({ remove_avatar: true });
    flash('Фото удалено', 'success');
  } catch (error) {
    flash(error.message, 'error');
  }
});

byId('ud-skill-add').addEventListener('click', () => addSkills(skillInput.value));
skillInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ',') return;
  // Enter внутри формы иначе отправляет её, запятая — попадает в текст
  event.preventDefault();
  addSkills(skillInput.value);
});
byId('ud-skill-chips').addEventListener('click', (event) => {
  const button = event.target.closest('.chip-x');
  if (!button) return;
  skills.splice(Number(button.dataset.index), 1);
  renderSkills();
});

// Смена фото не должна сбрасывать несохранённые правки формы
registerPanel({ render, needs: [], onCandidateChange: renderAvatarBox });
