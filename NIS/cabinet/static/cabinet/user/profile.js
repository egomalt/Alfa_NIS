/* Кабинет кандидата — раздел «Профиль»: карточка, о себе, навыки и ярлыки разделов. */
import { byId, countOf, esc, formatDateLong, pluralForm, toast, WORDS } from 'alfa/core';
import { avatarHtml, registerPanel, setText, shortCount, state, sum, uploadAvatar } from 'alfa/cabinet-user';

function render() {
  const { candidate, tests, articles, contestHistory: history } = state;

  byId('ud-profile-av').innerHTML = avatarHtml(candidate);
  setText('ud-profile-name', candidate.name || candidate.username);
  setText(
    'ud-profile-role',
    candidate.created_at ? `Кандидат · на платформе с ${formatDateLong(candidate.created_at)}` : 'Кандидат',
  );
  byId('ud-profile-bio').innerHTML = candidate.bio
    ? `<p class="ud-bio">${esc(candidate.bio)}</p>`
    : '<p class="ud-bio ud-muted">Нажмите «Редактировать», чтобы добавить информацию о себе.</p>';
  const skills = candidate.skills ?? [];
  byId('ud-profile-skills').innerHTML = skills.length
    ? skills.map((skill) => `<span class="ud-skill">${esc(skill)}</span>`).join('')
    : '<span class="ud-muted">Добавьте навыки в настройках профиля.</span>';

  const published = articles.filter((article) => article.status === 'published');
  setText('pstat-tests', tests.length);
  setText('pstat-articles', published.length);
  setText('pstat-contests', history.length);
  setText('pstat-wins', history.filter((entry) => entry.winner).length);

  // Подписи на ярлыках разделов
  const drafts = tests.filter((test) => test.status === 'draft').length;
  const pending = history.filter((entry) => entry.status === 'pending').length;
  setText(
    'sc-tests-sub',
    drafts
      ? `${countOf(drafts, WORDS.drafts)} ${pluralForm(drafts, ['ждёт', 'ждут', 'ждут'])} завершения`
      : `Создано: ${countOf(tests.length, WORDS.tests)}`,
  );
  setText('sc-articles-sub', `${shortCount(sum(articles, 'views'), WORDS.views)} за всё время`);
  setText(
    'sc-contests-sub',
    pending ? `На проверке: ${countOf(pending, WORDS.submissions)}` : countOf(history.length, WORDS.participations),
  );
}

// Щелчок по фото в карточке — смена фото без перехода в настройки
const avatar = byId('ud-profile-av');
const avatarInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
avatar.title = 'Сменить фото';
avatar.addEventListener('click', () => avatarInput.click());
avatar.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') avatarInput.click();
});
avatarInput.addEventListener('change', async () => {
  const [file] = avatarInput.files;
  avatarInput.value = '';
  if (file) await uploadAvatar(file).catch((error) => toast(error.message));
});

registerPanel({ render, needs: ['tests', 'articles', 'contestHistory'] });
