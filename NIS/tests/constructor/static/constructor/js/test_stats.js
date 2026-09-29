/* Страница «Как проходят тест»: баллы, доля справившихся,
   брошенные попытки и сравнение со средним по площадке. */
import { api, byId, countOf, esc, LEVELS, pageData, TEST_CATEGORIES, WORDS } from 'alfa/core';

const { testId } = pageData();

/* Процент либо прочерк: 0% и «нет данных» — разные вещи */
const percent = (value) => (value == null ? '—' : `${value}%`);

function renderMeta(test) {
  byId('ts-meta').innerHTML = [
    test.status === 'published' ? 'Опубликован' : 'Черновик',
    LEVELS[test.level],
    TEST_CATEGORIES[test.category] ?? test.category,
    countOf(test.page_count, WORDS.questions),
  ]
    .filter(Boolean)
    .map((chip) => `<span class="ts-chip">${esc(chip)}</span>`)
    .join('');
}

const cardsHtml = (attempts) =>
  [
    [attempts.finished, 'прошли до конца'],
    [percent(attempts.avg_percent), 'средний результат'],
    [percent(attempts.pass_rate), 'справились'],
    [`${attempts.abandoned} (${attempts.abandon_rate}%)`, 'бросили на середине'],
  ]
    .map(
      ([value, label]) => `
  <div class="ts-card"><div class="ts-card-value">${esc(value)}</div><div class="ts-card-label">${label}</div></div>`,
    )
    .join('');

/* Вывод словами: сами по себе «43% справились» ничего не говорят,
   смысл появляется только в сравнении со средним по площадке */
function verdict(own, platform) {
  if (own.pass_rate == null || platform.pass_rate == null) {
    return 'Сравнить пока не с чем — на площадке слишком мало пройденных тестов.';
  }
  const diff = own.pass_rate - platform.pass_rate;
  if (diff <= -15) return 'Ваш тест заметно сложнее среднего по площадке.';
  if (diff >= 15) return 'Ваш тест заметно легче среднего по площадке.';
  return 'Сложность близка к средней по площадке.';
}

const compareRow = (name, own, platform) => `
  <div class="ts-compare-row">
    <div class="ts-compare-head"><span>${name}</span></div>
    ${[
      ['ваш тест', own, 'own'],
      ['в среднем по площадке', platform, 'platform'],
    ]
      .map(
        ([label, value, kind]) => `
      <div class="ts-compare-head is-sub"><span>${label}</span><span class="ts-compare-val">${percent(value)}</span></div>
      <div class="ts-compare-track"><div class="ts-compare-fill ${kind}" style="width:${value || 0}%"></div></div>`,
      )
      .join('')}
  </div>`;

function histogramHtml(distribution, passPercent) {
  const peak = Math.max(0, ...distribution.map((bucket) => bucket.count));
  if (!peak) return '<div class="ts-panel-empty">Тест ещё никто не проходил до конца</div>';
  // Столбики от порога и выше красим как «справился»
  return `<div class="ts-hist">${distribution
    .map(
      (bucket) => `
    <div class="ts-hist-col">
      <div class="ts-hist-count">${bucket.count}</div>
      <div class="ts-hist-bars">
        <div class="ts-hist-bar ${parseInt(bucket.label, 10) >= passPercent ? 'pass' : ''}"
             style="height:${(bucket.count / peak) * 100}%" title="${esc(bucket.label)}: ${bucket.count}"></div>
      </div>
      <div class="ts-hist-label">${esc(bucket.label)}</div>
    </div>`,
    )
    .join('')}</div>`;
}

function render({ test, attempts, platform, distribution, pass_percent: passPercent }) {
  renderMeta(test);
  const platformTests = countOf(platform.tests, [
    'опубликованному тесту',
    'опубликованным тестам',
    'опубликованным тестам',
  ]);
  byId('ts-content').innerHTML = `
    <div class="ts-cards">${cardsHtml(attempts)}</div>
    <div class="ts-panels">
      <div class="ts-panel">
        <div class="ts-panel-title">Результаты участников</div>
        <div class="ts-panel-note">Сколько человек попало в каждый диапазон.
          Зелёные столбики — те, кто набрал от ${passPercent}% и считается справившимся.</div>
        ${histogramHtml(distribution, passPercent)}
      </div>
      <div class="ts-panel">
        <div class="ts-panel-title">Сравнение с площадкой</div>
        <div class="ts-panel-note">Средние по ${platformTests}</div>
        ${compareRow('Средний результат', attempts.avg_percent, platform.avg_percent)}
        ${compareRow('Доля справившихся', attempts.pass_rate, platform.pass_rate)}
        <div class="ts-verdict">${verdict(attempts, platform)}</div>
      </div>
    </div>`;
}

try {
  render(await api.get(`/api/v1/tests/${testId}/statistics/`));
} catch (error) {
  byId('ts-content').innerHTML = `<div class="ts-loading">${esc(error.message)}</div>`;
}
