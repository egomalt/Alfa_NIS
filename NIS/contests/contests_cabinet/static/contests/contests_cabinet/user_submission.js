/* Страница одного отправленного решения в кабинете кандидата.
 *
 * Показывает то, что кандидат отправил, и то, чем ответила компания.
 * Текстового отзыва в системе нет: компания меняет статус, отмечает
 * понравившиеся работы и выбирает победителя — из этого и складывается
 * вердикт, поэтому страница объясняет его словами, а не одной плашкой.
 */
(function () {
  'use strict';

  var BOOT = window.ALFA_APP_BOOTSTRAP || {};
  var box = document.getElementById('us-content');

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function date(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleDateString('ru-RU');
  }

  function dateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('ru-RU') + ', ' + d.toLocaleTimeString('ru-RU', {
      hour: '2-digit', minute: '2-digit',
    });
  }

  var ICON_WAIT = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var ICON_OK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>';
  var ICON_NO = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  var ICON_CUP = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/><path d="M7 5H4v2a3 3 0 0 0 3 3"/></svg>';

  /** Вердикт словами: что означает статус и что из этого следует. */
  function verdict(submission, contest) {
    if (submission.winner) {
      return {
        // Золотой, как значок победителя у компании: красный на сайте
        // означает опасное действие и читался бы как отказ
        icon: ICON_CUP, color: 'var(--amber-text)', background: 'var(--amber-soft)',
        title: 'Решение победило',
        sub: 'Компания выбрала вашу работу победителем конкурса.'
          + (contest.prize ? ' Приз: ' + esc(contest.prize) + '.' : ''),
      };
    }
    if (submission.status === 'accepted') {
      return {
        icon: ICON_OK, color: 'var(--green-text)', background: 'var(--green-soft)',
        title: 'Решение принято',
        sub: submission.liked
          ? 'Компания приняла работу и отметила её среди понравившихся.'
          : 'Компания приняла работу. Победителя выбирают после дедлайна.',
      };
    }
    if (submission.status === 'rejected') {
      return {
        icon: ICON_NO, color: 'var(--red-text)', background: 'var(--red-soft)',
        title: 'Решение отклонено',
        sub: 'Компания не приняла работу. Текстового отзыва она не оставляет — '
          + 'за разбором можно написать напрямую.',
      };
    }
    return {
      // Нейтрально: кандидату это значит «решения пока нет», а не «сделай что-то»
      icon: ICON_WAIT, color: 'var(--text-2)', background: 'var(--surface-2)',
      title: 'Решение на проверке',
      sub: contest.deadline
        ? 'Компания разбирает работы. Обычно это происходит после дедлайна — ' + date(contest.deadline) + '.'
        : 'Компания ещё не вынесла решение.',
    };
  }

  /** Блок «Ваше решение» — вид зависит от формата, который задал конкурс. */
  function answerHtml(submission, contest) {
    if (contest.submission_type === 'file') {
      if (!submission.file_url) return '<div class="us-answer">Файл не сохранился.</div>';
      return '<div class="us-file">'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>'
        + '<span class="us-file-name">' + esc(submission.file_name || 'Файл решения') + '</span>'
        + '<a class="us-btn" href="' + esc(submission.file_url) + '" download>Скачать</a>'
        + '</div>';
    }
    if (contest.submission_type === 'link') {
      if (!submission.link) return '<div class="us-answer">Ссылка не сохранилась.</div>';
      return '<a class="us-link" href="' + esc(submission.link) + '" target="_blank" rel="noopener">'
        + esc(submission.link) + '</a>';
    }
    return '<div class="us-answer">' + esc(submission.text || 'Текст решения пуст.') + '</div>';
  }

  function render(data) {
    var s = data.submission;
    var c = data.contest;
    var v = verdict(s, c);

    var meta = [c.company_name, c.category, c.level].filter(Boolean)
      .map(function (part) { return '<span class="us-chip">' + esc(part) + '</span>'; }).join('');

    box.innerHTML =
      '<div class="us-head">'
      + '<div>'
      + '<div class="us-title">' + esc(c.title || 'Конкурс') + '</div>'
      + '<div class="us-meta">' + meta + '</div>'
      + '</div>'
      + '<a class="us-btn" href="/contests/' + c.id + '/" style="margin-left:0;">Открыть конкурс</a>'
      + '</div>'

      + '<div class="us-verdict">'
      + '<span class="us-verdict-icon" style="background:' + v.background + ';color:' + v.color + ';">' + v.icon + '</span>'
      + '<div><div class="us-verdict-title">' + v.title + '</div>'
      + '<div class="us-verdict-sub">' + v.sub + '</div></div>'
      + '</div>'

      + '<div class="us-section">'
      + '<div class="us-section-title">Ваше решение</div>'
      + '<div class="us-section-note">Именно это компания видит у себя в кабинете.</div>'
      + answerHtml(s, c)
      + (s.comment
        ? '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--line);">'
          + '<div class="us-fact-label">Комментарий к работе</div>'
          + '<div class="us-answer">' + esc(s.comment) + '</div></div>'
        : '')
      + '</div>'

      + '<div class="us-section">'
      + '<div class="us-section-title">Об отправке</div>'
      + '<div class="us-section-note">&nbsp;</div>'
      + '<div class="us-facts">'
      + fact('Отправлено', dateTime(s.submitted_at))
      + fact('Дедлайн конкурса', date(c.deadline))
      + fact('Попытка', '№' + (s.attempt || 1))
      + fact('Статус конкурса', CONTEST_STATUS[c.status] || c.status)
      + '</div></div>';
  }

  var CONTEST_STATUS = {
    draft: 'Черновик',
    active: 'Идёт приём работ',
    review: 'Работы на проверке',
    finished: 'Завершён',
  };

  function fact(label, value) {
    return '<div><div class="us-fact-label">' + esc(label) + '</div>'
      + '<div class="us-fact-value">' + esc(value) + '</div></div>';
  }

  fetch('/api/v1/contests/my-submissions/' + BOOT.submissionId + '/', { credentials: 'same-origin' })
    .then(function (response) { return response.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.message || 'Не удалось загрузить решение');
      render(data);
    })
    .catch(function (error) {
      box.innerHTML = '<div class="us-loading">' + esc(error.message) + '</div>';
    });
})();
