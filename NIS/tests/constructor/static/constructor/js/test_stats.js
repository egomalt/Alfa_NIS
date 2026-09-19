/* Страница «Как проходят тест»: баллы, доля справившихся,
   брошенные попытки и сравнение со средним по площадке. */
(function () {
  'use strict';

  var BOOTSTRAP = window.ALFA_APP_BOOTSTRAP || {};
  var testId = BOOTSTRAP.testId;

  var LEVELS = { junior: 'Junior', middle: 'Middle', senior: 'Senior' };
  var CATEGORIES = {
    frontend: 'Frontend', backend: 'Backend', devops: 'DevOps',
    analytics: 'Аналитика', other: 'Другое',
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function el(id) { return document.getElementById(id); }

  /** Значение в процентах либо прочерк: 0% и «нет данных» — разные вещи. */
  function pct(value) {
    return value === null || value === undefined ? '—' : value + '%';
  }

  function renderMeta(test) {
    var box = el('ts-meta');
    if (!box) return;
    var chips = [
      test.status === 'published' ? 'Опубликован' : 'Черновик',
      LEVELS[test.level],
      CATEGORIES[test.category] || test.category,
      AlfaPlural.withNumber(test.page_count, 'вопрос', 'вопроса', 'вопросов'),
    ].filter(Boolean);
    box.innerHTML = chips.map(function (c) {
      return '<span class="ts-chip">' + esc(c) + '</span>';
    }).join('');
  }

  function cardsHtml(a) {
    return [
      { value: a.finished, label: 'прошли до конца' },
      { value: pct(a.avg_percent), label: 'средний результат' },
      { value: pct(a.pass_rate), label: 'справились' },
      { value: a.abandoned + ' (' + a.abandon_rate + '%)', label: 'бросили на середине' },
    ].map(function (c) {
      return '<div class="ts-card">'
        + '<div class="ts-card-value">' + esc(c.value) + '</div>'
        + '<div class="ts-card-label">' + c.label + '</div>'
        + '</div>';
    }).join('');
  }

  /* Вывод словами: сами по себе «43% справились» ничего не говорят,
     смысл появляется только в сравнении со средним по площадке. */
  function verdict(own, platform) {
    if (own.pass_rate === null || platform.pass_rate === null) {
      return 'Сравнить пока не с чем — на площадке слишком мало пройденных тестов.';
    }
    var diff = own.pass_rate - platform.pass_rate;
    if (diff <= -15) return 'Ваш тест заметно сложнее среднего по площадке.';
    if (diff >= 15) return 'Ваш тест заметно легче среднего по площадке.';
    return 'Сложность близка к средней по площадке.';
  }

  function compareRow(name, own, platform) {
    var rows = [
      { label: 'ваш тест', value: own, cls: 'own' },
      { label: 'в среднем по площадке', value: platform, cls: 'platform' },
    ];
    return '<div class="ts-compare-row">'
      + '<div class="ts-compare-head"><span>' + name + '</span></div>'
      + rows.map(function (r) {
          return '<div class="ts-compare-head" style="font-size:12px;color:var(--muted);">'
            + '<span>' + r.label + '</span>'
            + '<span class="ts-compare-val">' + pct(r.value) + '</span></div>'
            + '<div class="ts-compare-track"><div class="ts-compare-fill ' + r.cls
            + '" style="width:' + (r.value || 0) + '%"></div></div>';
        }).join('')
      + '</div>';
  }

  function histogramHtml(distribution, passPercent) {
    var peak = distribution.reduce(function (m, b) { return Math.max(m, b.count); }, 0);
    if (!peak) {
      return '<div class="ts-panel-empty">Тест ещё никто не проходил до конца</div>';
    }
    return '<div class="ts-hist">' + distribution.map(function (b) {
      // Столбики от порога и выше красим как «справился»
      var lower = parseInt(b.label, 10);
      var passed = lower >= passPercent;
      return '<div class="ts-hist-col">'
        + '<div class="ts-hist-count">' + b.count + '</div>'
        + '<div class="ts-hist-bars">'
        +   '<div class="ts-hist-bar' + (passed ? ' pass' : '') + '" style="height:'
        +   (b.count / peak * 100) + '%" title="' + esc(b.label) + ': ' + b.count + '"></div>'
        + '</div>'
        + '<div class="ts-hist-label">' + esc(b.label) + '</div>'
        + '</div>';
    }).join('') + '</div>';
  }

  function render(data) {
    var a = data.attempts;
    var platform = data.platform;
    renderMeta(data.test);

    el('ts-content').innerHTML = ''
      + '<div class="ts-cards">' + cardsHtml(a) + '</div>'
      + '<div class="ts-panels">'
      +   '<div class="ts-panel">'
      +     '<div class="ts-panel-title">Результаты участников</div>'
      +     '<div class="ts-panel-note">Сколько человек попало в каждый диапазон. '
      +       'Зелёные столбики — те, кто набрал от ' + data.pass_percent + '% и считается справившимся.</div>'
      +     histogramHtml(data.distribution, data.pass_percent)
      +   '</div>'
      +   '<div class="ts-panel">'
      +     '<div class="ts-panel-title">Сравнение с площадкой</div>'
      +     '<div class="ts-panel-note">Средние по ' + AlfaPlural.withNumber(platform.tests,
              'опубликованному тесту', 'опубликованным тестам', 'опубликованным тестам') + '</div>'
      +     compareRow('Средний результат', a.avg_percent, platform.avg_percent)
      +     compareRow('Доля справившихся', a.pass_rate, platform.pass_rate)
      +     '<div class="ts-verdict">' + verdict(a, platform) + '</div>'
      +   '</div>'
      + '</div>';
  }

  function init() {
    if (!testId) return;
    fetch('/api/v1/tests/' + testId + '/statistics/', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.message || 'Ошибка');
        render(d);
      })
      .catch(function (e) {
        el('ts-content').innerHTML = '<div class="ts-loading">' + esc(e.message) + '</div>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
