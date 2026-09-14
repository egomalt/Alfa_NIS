/* Русские числительные.
 *
 * До этого на каждой странице счётчики писались как `n + ' участников'`,
 * из-за чего в интерфейсе попадались «1 участников» и «1 прохождений».
 * Правило одно на весь сайт, поэтому лежит отдельным файлом.
 */
(function () {
  'use strict';

  function form(n, one, few, many) {
    var abs = Math.abs(n) % 100;
    var last = abs % 10;
    if (abs > 10 && abs < 20) return many;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
  }

  function withNumber(n, one, few, many) {
    var value = n || 0;
    return value + ' ' + form(value, one, few, many);
  }

  // Родительный падеж: «на платформе с июля», а не «с июль»
  var MONTHS_OF = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];

  window.AlfaPlural = {
    form: form,
    withNumber: withNumber,

    participants: function (n) { return withNumber(n, 'участник', 'участника', 'участников'); },
    attempts: function (n) { return withNumber(n, 'прохождение', 'прохождения', 'прохождений'); },
    ratings: function (n) { return withNumber(n, 'оценка', 'оценки', 'оценок'); },
    articles: function (n) { return withNumber(n, 'статья', 'статьи', 'статей'); },
    likes: function (n) { return withNumber(n, 'лайк', 'лайка', 'лайков'); },
    contests: function (n) { return withNumber(n, 'конкурс', 'конкурса', 'конкурсов'); },

    /** «июля 2026» — для оборотов вида «на платформе с …» */
    monthYearOf: function (iso) {
      if (!iso) return '';
      var d = new Date(iso);
      if (isNaN(d)) return '';
      return MONTHS_OF[d.getMonth()] + ' ' + d.getFullYear();
    },
  };
})();
