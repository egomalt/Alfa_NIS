(function () {
  'use strict';

  var username = (window.ALFA_APP_BOOTSTRAP || {}).username || '';
  var state = { company: null, contests: [], tests: [] };

  var CSRF = (function () {
    var m = document.cookie.match(/csrftoken=([^;]+)/);
    if (m) return m[1];
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : '';
  })();

  function apiFetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json', 'X-CSRFToken': CSRF }, opts.headers || {});
    opts.credentials = 'same-origin';
    return fetch(url, opts).then(function (r) {
      return r.json().then(function (d) {
        if (!d.ok) throw new Error(d.message || 'Ошибка');
        return d;
      });
    });
  }

  function apiFetchForm(url, formData) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRFToken': CSRF },
      body: formData,
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!d.ok) throw new Error(d.message || JSON.stringify(d.errors || {}));
        return d;
      });
    });
  }

  function el(id) { return document.getElementById(id); }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderSidebar(company) {
    var avEl = el('cp-sidebar-av');
    if (!avEl) return;
    if (company.avatar_url) {
      avEl.innerHTML = '<img src="' + esc(company.avatar_url) + '" alt="avatar">';
    } else {
      avEl.textContent = (company.name || '?').charAt(0).toUpperCase();
    }
    var nameEl = el('cp-sidebar-name');
    if (nameEl) nameEl.textContent = company.name || username;
  }

  function renderHero(company) {
    var avEl = el('cp-hero-av');
    if (!avEl) return;
    if (company.avatar_url) {
      avEl.innerHTML = '<img src="' + esc(company.avatar_url) + '" alt="avatar">';
    } else {
      avEl.textContent = (company.name || '?').charAt(0).toUpperCase();
    }
    el('cp-hero-name').textContent = company.name || username;
    var badge = el('cp-verified-badge');
    badge.style.display = company.is_verified ? 'inline-flex' : 'none';

    var parts = [];
    if (company.industry) parts.push(company.industry);
    if (company.city) parts.push(company.city);
    if (company.created_at) {
      var d = new Date(company.created_at);
      parts.push('с ' + d.getFullYear() + ' г.');
    }
    el('cp-hero-role').textContent = parts.join(' · ') || 'Компания';
    el('cp-page-sub').textContent = company.contact_email || '';
  }

  function renderProfileContent(company) {
    // Эти элементы есть только на странице профиля
    if (!el('cpstat-contests')) return;
    var contests = state.contests;
    var totalParticipants = contests.reduce(function (s, c) { return s + (c.participants_count || 0); }, 0);
    var totalTests = state.tests ? state.tests.length : 0;

    el('cpstat-contests').textContent = contests.length;
    el('cpstat-tests').textContent = totalTests;
    el('cpstat-participants').textContent = totalParticipants;
    el('cpstat-rating').textContent = company.avg_rating ? company.avg_rating.toFixed(1) + ' ★' : '—';

    el('cp-about-text').textContent = company.description || 'Описание не добавлено.';

    var tagRow = el('cp-tag-row');
    var dirs = company.directions || [];
    var tagsHtml = dirs.map(function (d) { return '<span class="cp-tag">' + esc(d) + '</span>'; }).join('');
    if (company.company_size) tagsHtml += '<span class="cp-tag">' + esc(company.company_size) + '</span>';
    tagRow.innerHTML = tagsHtml;

    el('sc-contests-sub').textContent = contests.length ? contests.length + ' конкурс(а)' : 'Нет конкурсов';
    el('sc-tests-sub').textContent = totalTests ? totalTests + ' тест(а)' : 'Нет тестов';

    renderTimeline(contests);
  }

  function renderTimeline(contests) {
    var tl = el('cp-timeline');
    if (!tl) return;
    if (!contests.length) {
      tl.innerHTML = '<div style="font-size:13.5px;color:var(--muted);padding:4px;">Активность появится здесь по мере работы на платформе</div>';
      return;
    }
    var items = contests.slice(0, 5).map(function (c) {
      var d = new Date(c.created_at);
      var dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      var bg = c.status === 'active' ? 'var(--green-soft)' : 'var(--surface-2)';
      var icon = c.status === 'active' ? '🏆' : '📝';
      return '<div class="cp-tl-row"><span class="cp-tl-icon" style="background:' + bg + ';">' + icon + '</span>'
        + '<span class="cp-tl-text">Конкурс «' + esc(c.title) + '»</span>'
        + '<span class="cp-tl-time">' + dateStr + '</span></div>';
    });
    tl.innerHTML = items.join('');
  }

  function unlockSidebarLinks() {
    ['cp-link-tests', 'cp-link-contests'].forEach(function (id) {
      var a = el(id);
      if (a) a.classList.remove('locked');
    });
    ['cp-lock-tests', 'cp-lock-contests'].forEach(function (id) {
      var sp = el(id);
      if (sp) sp.style.display = 'none';
    });
  }

  function showVerifyGate(company) {
    var gate = el('cp-verify-gate');
    var content = el('cp-profile-content');
    var editBtn = el('cp-edit-btn');
    if (gate) gate.style.display = '';
    if (content) content.style.display = 'none';
    if (editBtn) editBtn.style.display = 'none';
    renderVerifyGate(company || state.company || {});
  }

  // Перерисовывает блок верификации по статусу: none / pending / rejected
  function renderVerifyGate(company) {
    var status = company.verification_status || 'none';
    var statusEl = el('cp-verify-status');
    var iconEl = el('cp-verify-icon');
    var titleEl = el('cp-verify-title');
    var subEl = el('cp-verify-sub');
    var reasonEl = el('cp-verify-reason');
    var uploadEl = el('cp-verify-upload');
    var submitBtn = el('cp-submit-doc-btn');

    if (reasonEl) reasonEl.innerHTML = '';

    if (status === 'pending') {
      // Документ на проверке — модерация ещё не приняла решение
      if (statusEl) {
        statusEl.textContent = 'Документ на проверке';
        statusEl.style.background = 'var(--amber-soft)';
        statusEl.style.color = 'var(--amber-text)';
      }
      if (iconEl) {
        iconEl.style.background = 'var(--amber-soft)';
        iconEl.style.color = 'var(--amber-text)';
        iconEl.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
      }
      if (titleEl) titleEl.textContent = 'Документ отправлен на проверку';
      if (subEl) subEl.textContent = 'Модератор проверит документ и подтвердит компанию. Обычно это занимает до 1–2 рабочих дней. После одобрения откроются создание тестов, конкурсов и другие функции.';
      if (uploadEl) uploadEl.style.display = 'none';
      return;
    }

    if (status === 'rejected') {
      // Заявка отклонена — показываем причину и даём загрузить повторно
      if (statusEl) {
        statusEl.textContent = 'Заявка отклонена';
        statusEl.style.background = 'var(--red-soft)';
        statusEl.style.color = 'var(--red-text)';
      }
      if (iconEl) {
        iconEl.style.background = 'var(--red-soft)';
        iconEl.style.color = 'var(--red-text)';
        iconEl.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
      }
      if (titleEl) titleEl.textContent = 'Документ не прошёл проверку';
      if (subEl) subEl.textContent = 'Исправьте замечания и загрузите документ повторно.';
      if (reasonEl && company.verification_reason) {
        reasonEl.innerHTML = '<div class="cp-flash error" style="margin-bottom:16px;"><strong>Причина отклонения:</strong> ' + esc(company.verification_reason) + '</div>';
      }
      if (uploadEl) uploadEl.style.display = '';
      if (submitBtn) submitBtn.textContent = 'Отправить повторно';
      return;
    }

    // status === 'none' — документ ещё не загружали
    if (statusEl) {
      statusEl.textContent = 'Профиль не подтверждён';
      statusEl.style.background = 'var(--amber-soft)';
      statusEl.style.color = 'var(--amber-text)';
    }
    if (iconEl) {
      iconEl.style.background = 'var(--amber-soft)';
      iconEl.style.color = 'var(--amber-text)';
      iconEl.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>';
    }
    if (titleEl) titleEl.textContent = 'Подтвердите, что компания реальна';
    if (subEl) subEl.textContent = 'Загрузите документ, подтверждающий деятельность компании (выписка ЕГРЮЛ, свидетельство о регистрации и т.п.), чтобы открыть создание тестов, конкурсов и другие функции.';
    if (uploadEl) uploadEl.style.display = '';
    if (submitBtn) submitBtn.textContent = 'Отправить на проверку';
  }

  function showProfileContent(company) {
    var gate = el('cp-verify-gate');
    var content = el('cp-profile-content');
    var editBtn = el('cp-edit-btn');
    if (gate) gate.style.display = 'none';
    if (content) content.style.display = '';
    if (editBtn) editBtn.style.display = '';
    unlockSidebarLinks();
    renderProfileContent(company);
  }

  // ---- Verify doc upload ----
  var chosenFile = null;

  function initVerifyDoc() {
    var docInput = el('cp-doc-input');
    if (!docInput) return;
    docInput.addEventListener('change', function () {
      chosenFile = docInput.files[0] || null;
      renderChosenFile();
    });

    var dropzone = el('cp-dropzone');
    if (dropzone) {
      dropzone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--brand)';
      });
      dropzone.addEventListener('dragleave', function () {
        dropzone.style.borderColor = '';
      });
      dropzone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropzone.style.borderColor = '';
        chosenFile = e.dataTransfer.files[0] || null;
        renderChosenFile();
      });
    }

    var submitBtn = el('cp-submit-doc-btn');
    if (submitBtn) submitBtn.addEventListener('click', submitDoc);
  }

  function renderChosenFile() {
    var wrap = el('cp-file-chosen-wrap');
    var submitBtn = el('cp-submit-doc-btn');
    if (!wrap) return;
    if (!chosenFile) {
      wrap.innerHTML = '';
      if (submitBtn) submitBtn.disabled = true;
      return;
    }
    wrap.innerHTML = '<div class="cp-file-chosen">📎 <span>' + esc(chosenFile.name) + ' (' + (chosenFile.size / 1024).toFixed(0) + ' КБ)</span></div>';
    if (submitBtn) submitBtn.disabled = false;
  }

  function flashVerify(msg, type) {
    var flashEl = el('cp-verify-flash');
    if (!flashEl) return;
    flashEl.innerHTML = '<div class="cp-flash ' + type + '">' + esc(msg) + '</div>';
    if (type === 'success') setTimeout(function () { flashEl.innerHTML = ''; }, 4000);
  }

  function submitDoc() {
    if (!chosenFile) return;
    var btn = el('cp-submit-doc-btn');
    btn.disabled = true;
    btn.textContent = 'Отправка…';

    var fd = new FormData();
    fd.append('registration_document', chosenFile);

    apiFetchForm('/api/v1/companies/' + username + '/verification/', fd)
      .then(function (data) {
        state.company = data.company;
        chosenFile = null;
        var wrap = el('cp-file-chosen-wrap');
        if (wrap) wrap.innerHTML = '';
        renderSidebar(data.company);
        renderHero(data.company);
        // Компания ушла на ручную модерацию — показываем состояние «на проверке»
        showVerifyGate(data.company);
      })
      .catch(function (err) {
        flashVerify(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Отправить на проверку';
      });
  }

  // ---- Профиль компании: одна точка отправки ----
  /* Форма на сервере частичная: что не прислали — то не меняется. */
  function sendProfile(formData, onDone) {
    return apiFetchForm('/api/v1/companies/' + username + '/profile/', formData)
      .then(function (data) {
        if (!data.company) return data;
        state.company = data.company;
        renderSidebar(data.company);
        renderHero(data.company);
        renderLogoBox(data.company);
        if (onDone) onDone(data.company);
        return data;
      });
  }

  // ---- Avatar upload ----
  function initAvatarUpload() {
    var heroAv = el('cp-hero-av');
    var avatarInput = el('cp-avatar-input');
    if (!heroAv || !avatarInput) return;
    heroAv.addEventListener('click', function () { avatarInput.click(); });
    avatarInput.addEventListener('change', function () {
      var file = avatarInput.files[0];
      if (!file) return;
      var fd = new FormData();
      fd.append('avatar', file);
      sendProfile(fd).catch(function () {});
      avatarInput.value = '';
    });
  }

  // ---- Stats tab ----

  /* Активность по неделям. Высота столбика — доля от самой активной недели;
     считать от абсолютных значений нельзя, масштаб у компаний разный. */
  function renderActivity(weekly) {
    var chart = el('cp-activity-chart');
    if (!chart) return;

    var peak = weekly.reduce(function (m, w) {
      return Math.max(m, w.submissions || 0, w.attempts || 0);
    }, 0);

    if (!peak) {
      chart.innerHTML = '<div class="cp-chart-empty">За последние 12 недель активности не было</div>';
      return;
    }

    chart.innerHTML = weekly.map(function (w) {
      var date = new Date(w.week + 'T00:00:00');
      var label = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
      var bar = function (value, cls, title) {
        return '<div class="cp-chart-bar ' + cls + '" style="height:' + (value / peak * 100) + '%"'
          + ' title="' + title + ': ' + value + '"></div>';
      };
      return '<div class="cp-chart-col">'
        + '<div class="cp-chart-bars">'
        +   bar(w.submissions || 0, 'subs', 'Решения')
        +   bar(w.attempts || 0, 'att', 'Прохождения')
        + '</div>'
        + '<div class="cp-chart-label">' + esc(label) + '</div>'
        + '</div>';
    }).join('');
  }

  function renderSkills(skills) {
    var section = el('cp-skills-section');
    var wrap = el('cp-skills');
    if (!section || !wrap) return;

    if (!skills.length) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    wrap.innerHTML = skills.map(function (s) {
      return '<span class="cp-skill">' + esc(s.name)
        + '<span class="cp-skill-count">' + s.count + '</span></span>';
    }).join('');
  }

  function renderTotals(totals) {
    var pairs = [
      ['cpst2-contests', totals.contests],
      ['cpst2-tests', totals.published_tests],
      ['cpst2-participants', totals.participants],
      ['cpst2-submissions', totals.submissions],
      ['cpst2-winners', totals.winners],
      ['cpst2-pending', totals.pending_submissions],
      ['cpst2-attempts', totals.test_attempts],
    ];
    pairs.forEach(function (pair) {
      var node = el(pair[0]);
      if (node) node.textContent = pair[1];
    });
    var rating = el('cpst2-rating');
    if (rating) rating.textContent = totals.avg_rating ? totals.avg_rating.toFixed(1) + ' ★' : '—';
  }

  function renderStatsTab() {
    var c = state.company || {};

    // Сводку считает сервер: числа должны совпадать с PDF-отчётом
    apiFetch('/api/v1/companies/' + username + '/statistics/')
      .then(function (data) {
        renderTotals(data.totals || {});
        renderActivity(data.weekly || []);
        renderSkills(data.skills || []);
      })
      .catch(function () {
        var chart = el('cp-activity-chart');
        if (chart) chart.innerHTML = '<div class="cp-chart-empty">Не удалось загрузить статистику</div>';
      });

    // Рейтинг + распределение
    var section = el('cp-stats-rating-section');
    if (c.avg_rating) {
      section.style.display = '';
      el('cp-rating-score').textContent = c.avg_rating.toFixed(1);
      el('cp-rating-count').textContent = (c.rating_count || 0) + ' оценок от кандидатов';
      var dist = c.rating_dist || {};
      el('cp-rating-dist').innerHTML = [5, 4, 3, 2, 1].map(function (star) {
        var pct = dist[star] || 0;
        return '<div class="cp-dist-row"><div class="cp-dist-label">' + star + ' ★</div>'
          + '<div class="cp-dist-track"><div class="cp-dist-fill" style="width:' + pct + '%"></div></div>'
          + '<div class="cp-dist-val">' + pct + '%</div></div>';
      }).join('');
    } else {
      section.style.display = 'none';
    }

  }

  // ---- Settings form ----
  // Столько же направлений принимает сервер (companies/forms.py)
  var MAX_DIRECTIONS = 10;
  var directions = [];

  var TEXT_FIELDS = [
    ['cp-f-name', 'name'],
    ['cp-f-desc', 'description'],
    ['cp-f-email', 'contact_email'],
    ['cp-f-phone', 'phone'],
    ['cp-f-website', 'website'],
    ['cp-f-city', 'city'],
    ['cp-f-address', 'address'],
    ['cp-f-industry', 'industry'],
    ['cp-f-size', 'company_size'],
  ];

  function renderLogoBox(company) {
    var preview = el('pic-preview');
    if (!preview) return;
    if (company.avatar_url) {
      preview.innerHTML = '<img src="' + esc(company.avatar_url) + '" alt="Логотип компании">';
    } else {
      preview.textContent = (company.name || company.username || '?').charAt(0).toUpperCase();
    }
    el('cp-logo-remove').hidden = !company.avatar_url;
  }

  function renderDirections() {
    var box = el('cp-dir-chips');
    if (!box) return;
    box.innerHTML = directions.map(function (name, index) {
      return '<span class="chip-tag">' + esc(name)
        + '<button type="button" class="chip-x" data-index="' + index
        + '" title="Убрать" aria-label="Убрать направление ' + esc(name) + '">×</button></span>';
    }).join('');

    var full = directions.length >= MAX_DIRECTIONS;
    el('cp-dir-input').disabled = full;
    el('cp-dir-add').disabled = full;
    el('cp-dir-count').textContent = full
      ? '— больше ' + MAX_DIRECTIONS + ' не поместится'
      : '— ' + directions.length + ' из ' + MAX_DIRECTIONS;
  }

  function addDirections(raw) {
    // Строку из другого места обычно вставляют целиком, через запятую
    raw.split(',').forEach(function (part) {
      var name = part.trim().replace(/\s+/g, ' ').slice(0, 60);
      if (!name || directions.length >= MAX_DIRECTIONS) return;
      var exists = directions.some(function (d) { return d.toLowerCase() === name.toLowerCase(); });
      if (!exists) directions.push(name);
    });
    el('cp-dir-input').value = '';
    renderDirections();
  }

  function fillSettingsForm() {
    var c = state.company;
    if (!c) return;
    TEXT_FIELDS.forEach(function (pair) { el(pair[0]).value = c[pair[1]] || ''; });
    directions = (c.directions || []).slice();
    renderDirections();
    renderLogoBox(c);
    el('cp-settings-flash').innerHTML = '';
  }

  function flashSettings(msg, type) {
    el('cp-settings-flash').innerHTML = '<div class="cp-flash ' + type + '">' + esc(msg) + '</div>';
  }

  function saveProfile() {
    var btn = el('cp-save-settings-btn');
    btn.disabled = true;
    btn.textContent = 'Сохранение…';

    var fd = new FormData();
    TEXT_FIELDS.forEach(function (pair) { fd.append(pair[1], el(pair[0]).value); });
    // Пустое значение обязательно: по наличию ключа сервер понимает, что
    // направления вообще присылали, и что пустой список — это очистка
    if (!directions.length) fd.append('directions', '');
    directions.forEach(function (name) { fd.append('directions', name); });

    // Незакоммиченный ввод не должен пропадать при сохранении
    var pending = el('cp-dir-input').value.trim();
    if (pending && directions.length < MAX_DIRECTIONS) fd.append('directions', pending);

    sendProfile(fd, function (company) {
      directions = (company.directions || []).slice();
      renderDirections();
      el('cp-dir-input').value = '';
      if (company.is_verified) renderProfileContent(company);
      flashSettings('Сохранено', 'success');
    })
      .catch(function (err) { flashSettings(err.message, 'error'); })
      .then(function () {
        btn.disabled = false;
        btn.textContent = 'Сохранить';
      });
  }

  function initLogoButtons() {
    var input = el('cp-logo-input');
    if (!input) return;
    el('cp-logo-pick').addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      var file = input.files[0];
      if (!file) return;
      var fd = new FormData();
      fd.append('avatar', file);
      sendProfile(fd, function () { flashSettings('Логотип обновлён', 'success'); })
        .catch(function (err) { flashSettings(err.message, 'error'); });
      input.value = '';
    });
    el('cp-logo-remove').addEventListener('click', function () {
      if (!confirm('Удалить логотип компании?')) return;
      var fd = new FormData();
      fd.append('remove_avatar', '1');
      sendProfile(fd, function () { flashSettings('Логотип удалён', 'success'); })
        .catch(function (err) { flashSettings(err.message, 'error'); });
    });
  }

  function initDirectionsEditor() {
    var input = el('cp-dir-input');
    if (!input) return;
    el('cp-dir-add').addEventListener('click', function () { addDirections(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ',') return;
      // Enter внутри формы иначе отправляет её, запятая — попадает в текст
      e.preventDefault();
      addDirections(input.value);
    });
    el('cp-dir-chips').addEventListener('click', function (e) {
      var btn = e.target.closest('.chip-x');
      if (!btn) return;
      directions.splice(Number(btn.dataset.index), 1);
      renderDirections();
    });
  }

  function initSettingsButtons() {
    var saveBtn = el('cp-save-settings-btn');
    var cancelBtn = el('cp-cancel-settings-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveProfile);
    if (cancelBtn) cancelBtn.addEventListener('click', function () { fillSettingsForm(); });
    initLogoButtons();
    initDirectionsEditor();
  }

  // ---- Logout ----
  function initLogout() {
    var btn = el('cp-logout-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      apiFetch('/api/v1/auth/signout/', { method: 'POST' })
        .then(function () { window.location.href = '/'; })
        .catch(function () { window.location.href = '/'; });
    });
  }

  // ---- Init ----
  // Активный раздел задаётся сервером (отдельные адреса), а не кликом по вкладке
  /* page  — какой пункт подсветить в сайдбаре (есть на всех страницах кабинета);
     panel — какую панель рисовать этим скриптом. У разделов «Тесты» и «Конкурсы»
     своя разметка и свои скрипты, им от company.js нужны только сайдбар, замки
     и выход, поэтому они передают panel='none'. Без этого разделения скрипт
     уходил в профильную ветку и падал на элементах, которых там нет. */
  var BOOT = window.ALFA_APP_BOOTSTRAP || {};
  var page = BOOT.page || 'profile';
  var panel = BOOT.panel || page;

  var OWN_PANELS = ['profile', 'stats', 'settings'];

  function renderPanel(company) {
    if (panel === 'stats') {
      renderStatsTab();
    } else if (panel === 'settings') {
      fillSettingsForm();
    } else {
      renderHero(company);
      if (company.is_verified) showProfileContent(company);
      else showVerifyGate(company);
    }
  }

  function init() {
    // Оболочка кабинета — нужна на каждой странице
    initLogout();

    var ownsPanel = OWN_PANELS.indexOf(panel) !== -1;
    if (ownsPanel) {
      initVerifyDoc();
      initAvatarUpload();
      initSettingsButtons();
    }

    var companyFetch = apiFetch('/api/v1/companies/' + username + '/');
    // Списки конкурсов и тестов нужны только профилю: на остальных страницах
    // это были бы дубли запросов, которые уже делают их собственные скрипты
    var needsLists = panel === 'profile';
    var contestsFetch = needsLists
      ? apiFetch('/api/v1/contests/company/').catch(function () { return { contests: [] }; })
      : Promise.resolve({ contests: [] });
    var testsFetch = needsLists
      ? apiFetch('/api/v1/companies/' + username + '/tests/').catch(function () { return { tests: [] }; })
      : Promise.resolve({ tests: [] });

    Promise.all([companyFetch, contestsFetch, testsFetch])
      .then(function (results) {
        state.company = results[0].company;
        state.contests = results[1].contests || [];
        state.tests = results[2].tests || [];

        var company = state.company;
        renderSidebar(company);
        // Разблокируем «Тесты»/«Конкурсы» на любой странице кабинета, если компания подтверждена
        if (company.is_verified) unlockSidebarLinks();

        if (ownsPanel) renderPanel(company);
      })
      .catch(function (err) {
        var sub = el('cp-page-sub');
        if (sub) sub.textContent = 'Ошибка загрузки: ' + err.message;
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
