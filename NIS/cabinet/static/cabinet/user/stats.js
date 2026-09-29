/* Кабинет кандидата — раздел «Статистика»: прохождения, карта активности,
   серия дней, конкурсы, свои материалы и оценки компаниям. */
import { byId, countOf, esc, formatDate, formatDateMedium, initial, pluralForm, WORDS } from 'alfa/core';
import { registerPanel, setText, shortNumber, state, sum } from 'alfa/cabinet-user';

const DAY_MS = 86400000;
const HEAT_WEEKS = 26;
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
// Строки с подписями: все семь не помещаются, подписываем через одну
const WEEKDAY_ROWS = [0, 2, 4, 6];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const FLAME =
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M13.6 1.5c.4 3-1.1 4.7-2.5 6.1C9.5 9.2 8 10.8 8.2 13.6c-.9-.6-1.6-1.7-1.9-2.9C4.8 12.2 4 14.1 4 16c0 4.2 3.6 6.9 8 6.9s8-3 8-7.3c0-3.9-2.3-6.4-4-8.2-1.7-1.8-2.4-3.8-2.4-5.9z"/></svg>';
const star = (filled) =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="${filled ? 'var(--amber-text)' : 'none'}" stroke="var(--amber-text)" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8-6.1-3.6-6.1 3.6 1.5-6.8-5.2-4.7 6.9-.7z"/></svg>`;

const fact = (label, value) =>
  `<div><div class="ud-fact-label">${esc(label)}</div><div class="ud-fact-value">${esc(value)}</div></div>`;

/* Прохождения чужих тестов */
function renderAttempts() {
  const attempts = state.attempts;
  const recentBox = byId('ud-attempts-recent');
  if (!attempts?.started) {
    byId('ud-attempts-facts').innerHTML = '';
    recentBox.innerHTML = `<div class="ud-note">Вы ещё не проходили тесты.
      <a href="/tests/" class="ud-link">Каталог тестов</a> открыт всем.</div>`;
    setText('ud-attempts-note', 'Здесь появятся ваши результаты');
    return;
  }

  setText('ud-attempts-note', `Тест считается пройденным от ${attempts.pass_percent}% верных ответов`);
  byId('ud-attempts-facts').innerHTML = [
    fact('Начато', attempts.started),
    fact('Завершено', attempts.finished),
    fact('Средний результат', attempts.avg_percent === null ? '—' : `${attempts.avg_percent}%`),
    fact('Пройдено', attempts.pass_rate === null ? '—' : `${attempts.passed} · ${attempts.pass_rate}%`),
  ].join('');

  // По среднему баллу не видно, растёт результат или падает, а по нескольким последним — видно
  recentBox.innerHTML = attempts.recent.length
    ? `<div class="ud-mini-head">Последние прохождения</div>
      <div class="ud-mini-list">${attempts.recent
        .map((result) => {
          const tone = result.percent === null ? 'muted' : result.percent >= attempts.pass_percent ? 'green' : 'red';
          return `<div class="ud-mini-row">
            <a class="ud-mini-title" href="/tests/${result.test_id}/">${esc(result.title || 'Тест')}</a>
            <span class="ud-mini-date">${formatDateMedium(result.finished_at) || '—'}</span>
            <span class="cr-pill cr-tone-${tone}">${result.percent === null ? '—' : `${result.percent}%`}</span>
          </div>`;
        })
        .join('')}</div>`
    : '';
}

/* Ключ обязан совпадать с ISO-датами, которыми сервер отдаёт активность:
   без ведущих нулей «2026-9-16» и «2026-09-16» — разные дни */
function dayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/* Понедельник недели, в которую попадает дата */
function mondayOf(date) {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

/* Насыщенность клетки: четыре ступени, как в легенде под картой */
const heatLevel = (n) => (n <= 2 ? n : n <= 4 ? 3 : 4);

/* Карта активности за полгода. Сервер считает события по дням — браузеру
   остаётся раскрасить клетки: колонка — неделя, строка — день недели */
function renderActivity() {
  const counts = new Map(Object.entries(state.attempts?.daily ?? {}));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Последняя колонка — текущая неделя, поэтому её хвост ещё в будущем
  const start = mondayOf(today);
  start.setDate(start.getDate() - (HEAT_WEEKS - 1) * 7);

  let cells = '';
  let months = '';
  let total = 0;
  let activeDays = 0;
  let pastDays = 0;
  let run = { month: null, span: 0 };
  const flushMonth = () => {
    // Однонедельный хвост месяца подписывать некуда — подпись не влезет
    if (run.month !== null)
      months += `<span style="grid-column:span ${run.span}">${run.span > 1 ? MONTHS_SHORT[run.month] : ''}</span>`;
  };

  for (let week = 0; week < HEAT_WEEKS; week++) {
    const monday = new Date(start);
    monday.setDate(start.getDate() + week * 7);
    if (monday.getMonth() === run.month) {
      run.span += 1;
    } else {
      flushMonth();
      run = { month: monday.getMonth(), span: 1 };
    }
    for (let weekday = 0; weekday < 7; weekday++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + weekday);
      if (day > today) {
        cells += '<i class="ud-heat-cell future"></i>';
        continue;
      }
      const n = Number(counts.get(dayKey(day)) || 0);
      const label = `${formatDate(day)} — ${n ? countOf(n, WORDS.events) : 'нет активности'}`;
      cells += `<i class="ud-heat-cell lvl-${heatLevel(n)}" title="${esc(label)}"></i>`;
      pastDays += 1;
      total += n;
      if (n) activeDays += 1;
    }
  }
  flushMonth();

  const weekdayLabels = WEEKDAYS.map((name, index) => `<span>${WEEKDAY_ROWS.includes(index) ? name : ''}</span>`);
  byId('ud-heat').innerHTML = `
    <span class="ud-heat-corner"></span><div class="ud-heat-months">${months}</div>
    <div class="ud-heat-weekdays">${weekdayLabels.join('')}</div>
    <div class="ud-heat-grid">${cells}</div>`;
  byId('ud-heat-total').innerHTML = `<b>${total}</b> ${pluralForm(total, WORDS.events)}`;
  byId('ud-heat-active').innerHTML = `Активных дней: <b>${activeDays}</b> из ${pastDays}`;

  renderStreak(counts, today, total, activeDays);
}

/* Серия дней подряд. Правило серии живёт на сервере (users/activity.py):
   его же показывает огонёк в публичном профиле */
function renderStreak(counts, today, total, activeDays) {
  const { current, best } = state.attempts?.streak ?? { current: 0, best: 0 };
  const alive = current > 0;
  const todayCount = Number(counts.get(dayKey(today)) || 0);

  // Полоска текущей недели: понедельник — воскресенье
  const monday = mondayOf(today);
  const week = WEEKDAYS.map((name, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    const classes = [
      'ud-week-cell',
      counts.get(dayKey(day)) ? 'on' : '',
      day.getTime() === today.getTime() ? 'today' : '',
      day > today ? 'future' : '',
    ].filter(Boolean);
    return `<div class="ud-week-day"><span class="ud-week-label">${name}</span><div class="${classes.join(' ')}"></div></div>`;
  }).join('');

  let note = 'Серия прервана. Любое действие сегодня начнёт новую.';
  if (todayCount) note = `Сегодня уже ${countOf(todayCount, WORDS.events)} — серия продолжается.`;
  else if (alive) note = 'Сегодня ещё нет активности. Пройдите тест или отправьте решение, чтобы серия не прервалась.';

  // Число набрано крупно отдельной строкой, поэтому слово к нему — отдельно
  byId('ud-streak').innerHTML = `
    <div class="ud-streak-head">
      <span class="ud-streak-flame ${alive ? '' : 'cold'}">${FLAME}</span>
      <div>
        <div class="ud-streak-line">
          <span class="ud-streak-value">${current}</span>
          <span class="ud-streak-word">${alive ? `${pluralForm(current, WORDS.days)} подряд` : 'серия прервана'}</span>
        </div>
        <div class="ud-streak-best">Лучшая серия — <b>${countOf(best, WORDS.days)}</b></div>
      </div>
    </div>
    <div class="ud-week">${week}</div>
    <div class="ud-callout ${todayCount ? 'done' : ''}">
      <i class="ud-callout-dot"></i>
      <div>${note}</div>
    </div>
    <div class="ud-streak-stats">
      <div class="ud-streak-stat"><b>${total}</b><span>${pluralForm(total, WORDS.events)}</span></div>
      <div class="ud-streak-stat"><b>${activeDays}</b><span>активных дней</span></div>
      <div class="ud-streak-stat"><b>${(total / HEAT_WEEKS).toFixed(1).replace('.', ',')}</b><span>в неделю</span></div>
    </div>`;
}

/* Чем закончились участия в конкурсах */
function renderContestBars() {
  const history = state.contestHistory;
  if (!history.length) {
    byId('ud-contest-bars').innerHTML = '<div class="ud-note">Вы ещё не участвовали в конкурсах.</div>';
    setText('ud-contests-note', 'Здесь появится разбор ваших участий');
    return;
  }
  setText('ud-contests-note', `Всего участий: ${history.length}`);
  byId('ud-contest-bars').innerHTML = [
    ['Победы', history.filter((entry) => entry.winner).length],
    ['Принято', history.filter((entry) => entry.status === 'accepted').length],
    ['На проверке', history.filter((entry) => entry.status === 'pending').length],
    ['Отклонено', history.filter((entry) => entry.status === 'rejected').length],
  ]
    .filter(([, count]) => count > 0)
    .map(
      ([label, count]) => `
      <div class="ud-bar-row">
        <div class="ud-bar-label">${label}</div>
        <div class="ud-bar-track"><div class="ud-bar-fill" style="width:${Math.round((count / history.length) * 100)}%"></div></div>
        <div class="ud-bar-val">${count}</div>
      </div>`,
    )
    .join('');
}

function renderRatings() {
  const ratings = state.myRatings;
  if (!ratings.length) {
    byId('ud-my-ratings').innerHTML = '<div class="ud-note">Вы ещё не оценивали компании.</div>';
    setText('ud-ratings-note', '');
    return;
  }
  setText('ud-ratings-note', `Средняя оценка: ${(sum(ratings, 'rating') / ratings.length).toFixed(1)} из 5`);
  byId('ud-my-ratings').innerHTML = ratings
    .map(
      (entry) => `
      <div class="ud-rating-row">
        <span class="ud-rating-av">${esc(initial(entry.company_name))}</span>
        <a href="/${esc(entry.company_username)}/" class="ud-mini-title ud-grow">${esc(entry.company_name)}</a>
        <div class="ud-stars">${[1, 2, 3, 4, 5].map((i) => star(i <= entry.rating)).join('')}</div>
      </div>`,
    )
    .join('');
}

function render() {
  const { candidate, tests, articles, contestHistory: history } = state;
  const published = (items) => items.filter((item) => item.status === 'published').length;

  setText('sstat-days', candidate.created_at ? Math.floor((Date.now() - new Date(candidate.created_at)) / DAY_MS) : 0);
  setText('sstat-passed', state.attempts?.passed ?? 0);
  setText('sstat-contests', history.length);
  setText('sstat-articles', published(articles));

  renderAttempts();
  renderActivity();
  renderContestBars();
  byId('ud-authored-facts').innerHTML = [
    fact('Тестов', `${published(tests)} из ${tests.length}`),
    fact('Их прошли', sum(tests, 'submissions')),
    fact('Статей', `${published(articles)} из ${articles.length}`),
    fact('Просмотров', shortNumber(sum(articles, 'views'))),
    fact('Рейтинг статей', sum(articles, 'likes')),
  ].join('');
  renderRatings();
}

registerPanel({ render, needs: ['tests', 'articles', 'contestHistory', 'myRatings', 'attempts'] });
