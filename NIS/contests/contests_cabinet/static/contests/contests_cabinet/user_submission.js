/* Одно отправленное решение: что ушло в компанию и чем она ответила.
   Текстового отзыва в системе нет — вердикт складывается из статуса,
   отметки и признака победителя. */
import { api, byId, esc, formatDate, formatDateTime, LEVELS, pageData } from 'alfa/core';

const { submissionId } = pageData();
const box = byId('us-content');

const ICONS = {
  wait: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  ok: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>',
  no: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  cup: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/><path d="M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
  file: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
};

const CONTEST_STAGES = {
  draft: 'Черновик',
  active: 'Идёт приём работ',
  review: 'Работы на проверке',
  finished: 'Завершён',
};

/* Вердикт словами: что означает статус и что из этого следует */
function verdict(submission, contest) {
  if (submission.winner) {
    return {
      icon: ICONS.cup,
      tone: 'amber',
      title: 'Решение победило',
      text: `Компания выбрала вашу работу победителем конкурса.${contest.prize ? ` Приз: ${contest.prize}.` : ''}`,
    };
  }
  if (submission.status === 'accepted') {
    return {
      icon: ICONS.ok,
      tone: 'green',
      title: 'Решение принято',
      text: submission.liked
        ? 'Компания приняла работу и отметила её среди понравившихся.'
        : 'Компания приняла работу. Победителя выбирают после дедлайна.',
    };
  }
  if (submission.status === 'rejected') {
    return {
      icon: ICONS.no,
      tone: 'red',
      title: 'Решение отклонено',
      text: 'Компания не приняла работу. Текстового отзыва она не оставляет — за разбором можно написать напрямую.',
    };
  }
  // Нейтрально: кандидату это значит «решения пока нет», а не «сделай что-то»
  return {
    icon: ICONS.wait,
    tone: 'muted',
    title: 'Решение на проверке',
    text: contest.deadline
      ? `Компания разбирает работы. Обычно это происходит после дедлайна — ${formatDate(contest.deadline)}.`
      : 'Компания ещё не вынесла решение.',
  };
}

/* «Ваше решение» — вид зависит от формата, который задал конкурс */
function answerHtml(submission, contest) {
  if (contest.submission_type === 'file') {
    return submission.file_url
      ? `<div class="us-file">${ICONS.file}
          <span class="us-file-name">${esc(submission.file_name || 'Файл решения')}</span>
          <a class="us-btn" href="${esc(submission.file_url)}" download>Скачать</a>
        </div>`
      : '<div class="us-answer">Файл не сохранился.</div>';
  }
  if (contest.submission_type === 'link') {
    if (!submission.link) return '<div class="us-answer">Ссылка не сохранилась.</div>';
    return /^https?:\/\//i.test(submission.link)
      ? `<a class="us-link" href="${esc(submission.link)}" target="_blank" rel="noopener">${esc(submission.link)}</a>`
      : `<div class="us-answer">${esc(submission.link)}</div>`;
  }
  return `<div class="us-answer">${esc(submission.text || 'Текст решения пуст.')}</div>`;
}

const fact = (label, value) =>
  `<div><div class="us-fact-label">${esc(label)}</div><div class="us-fact-value">${esc(value || '—')}</div></div>`;

function render({ submission, contest }) {
  const result = verdict(submission, contest);
  const chips = [contest.company_name, contest.category, LEVELS[contest.level?.toLowerCase()] ?? contest.level]
    .filter(Boolean)
    .map((part) => `<span class="us-chip">${esc(part)}</span>`)
    .join('');

  box.innerHTML = `
    <div class="us-head">
      <div>
        <div class="us-title">${esc(contest.title || 'Конкурс')}</div>
        <div class="us-meta">${chips}</div>
      </div>
      <a class="us-btn" href="/contests/${contest.id}/">Открыть конкурс</a>
    </div>

    <div class="us-verdict">
      <span class="us-verdict-icon" data-tone="${result.tone}">${result.icon}</span>
      <div>
        <div class="us-verdict-title">${result.title}</div>
        <div class="us-verdict-sub">${esc(result.text)}</div>
      </div>
    </div>

    <div class="us-section">
      <div class="us-section-title">Ваше решение</div>
      <div class="us-section-note">Именно это компания видит у себя в кабинете.</div>
      ${answerHtml(submission, contest)}
      ${
        submission.comment
          ? `
        <div class="us-comment">
          <div class="us-fact-label">Комментарий к работе</div>
          <div class="us-answer">${esc(submission.comment)}</div>
        </div>`
          : ''
      }
    </div>

    <div class="us-section">
      <div class="us-section-title">Об отправке</div>
      <div class="us-facts">
        ${fact('Отправлено', formatDateTime(submission.submitted_at))}
        ${fact('Дедлайн конкурса', formatDate(contest.deadline))}
        ${fact('Попытка', `№${submission.attempt || 1}`)}
        ${fact('Статус конкурса', CONTEST_STAGES[contest.status] ?? contest.status)}
      </div>
    </div>`;
}

try {
  render(await api.get(`/api/v1/contests/my-submissions/${submissionId}/`));
} catch (error) {
  box.innerHTML = `<div class="us-loading">${esc(error.message)}</div>`;
}
