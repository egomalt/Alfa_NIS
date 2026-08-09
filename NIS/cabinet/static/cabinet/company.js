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
      avEl.innerHTML = '<img src="' + company.avatar_url + '" alt="avatar">';
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
      avEl.innerHTML = '<img src="' + company.avatar_url + '" alt="avatar">';
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

  // ---- Avatar upload ----
  function initAvatarUpload() {
    var heroAv = el('cp-hero-av');
    var avatarInput = el('cp-avatar-input');
    if (!heroAv || !avatarInput) return;
    heroAv.addEventListener('click', function () { avatarInput.click(); });
    avatarInput.addEventListener('change', function () {
      var file = avatarInput.files[0];
      if (!file || !state.company) return;
      var c = state.company;
      var fd = new FormData();
      fd.append('avatar', file);
      fd.append('username', c.username || username);
      fd.append('name', c.name || '');
      fd.append('contact_email', c.contact_email || '');
      fd.append('description', c.description || '');
      fd.append('phone', c.phone || '');
      fd.append('website', c.website || '');
      fd.append('city', c.city || '');
      fd.append('industry', c.industry || '');
      fd.append('company_size', c.company_size || '');
      fd.append('direction_1', c.direction_1 || '');
      fd.append('direction_2', c.direction_2 || '');
      fd.append('direction_3', c.direction_3 || '');
      fd.append('direction_4', c.direction_4 || '');
      apiFetchForm('/api/v1/companies/' + username + '/profile/', fd)
        .then(function (data) {
          if (data.company) {
            state.company = data.company;
            renderSidebar(data.company);
            renderHero(data.company);
          }
        })
        .catch(function () {});
    });
  }

  // ---- Tab switching ----
  // ---- Stats tab ----
  function pillStyle(status) {
    if (status === 'active') return 'background:var(--green-soft);color:var(--green-text);';
    if (status === 'review') return 'background:var(--amber-soft);color:var(--amber-text);';
    return 'background:var(--surface-2);color:var(--muted);';
  }

  function renderStatsTab() {
    var c = state.company || {};
    var contests = state.contests || [];
    var tests = state.tests || [];
    var publishedTests = tests.filter(function (t) { return t.status === 'published'; });
    var totalParticipants = contests.reduce(function (s, x) { return s + (x.participants_count || 0); }, 0);

    el('cpst2-contests').textContent = contests.length;
    el('cpst2-tests').textContent = publishedTests.length;
    el('cpst2-participants').textContent = totalParticipants;
    el('cpst2-rating').textContent = c.avg_rating ? c.avg_rating.toFixed(1) + ' ★' : '—';

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

    // Конкурсы
    var CS = { draft: 'Черновик', active: 'Активен', review: 'На проверке', finished: 'Завершён' };
    var cel = el('cp-stats-contests');
    cel.innerHTML = contests.length
      ? contests.map(function (x) {
          var d = x.deadline ? new Date(x.deadline).toLocaleDateString('ru-RU') : '—';
          var meta = [x.category, 'дедлайн ' + d].filter(Boolean).join(' · ');
          return '<div class="cp-srow"><div class="cp-srow-main"><div class="cp-srow-title">' + esc(x.title)
            + '</div><div class="cp-srow-meta">' + esc(meta) + '</div></div>'
            + '<span class="cp-srow-val">' + (x.participants_count || 0) + ' уч.</span>'
            + '<span class="cp-srow-pill" style="' + pillStyle(x.status) + '">' + (CS[x.status] || x.status) + '</span></div>';
        }).join('')
      : '<div class="cp-empty-note">Конкурсы ещё не создавались.</div>';

    // Тесты
    var TS = { draft: 'Черновик', published: 'Опубликован' };
    var tel = el('cp-stats-tests');
    tel.innerHTML = tests.length
      ? tests.map(function (t) {
          return '<div class="cp-srow"><div class="cp-srow-main"><div class="cp-srow-title">' + esc(t.title)
            + '</div><div class="cp-srow-meta">' + (TS[t.status] || t.status) + '</div></div>'
            + '<span class="cp-srow-val">' + (t.submissions || 0) + ' прох.</span></div>';
        }).join('')
      : '<div class="cp-empty-note">Тесты ещё не создавались.</div>';
  }

  // ---- Settings form ----
  function fillSettingsForm() {
    var c = state.company;
    if (!c) return;
    el('cp-f-name').value = c.name || '';
    el('cp-f-industry').value = c.industry || '';
    el('cp-f-city').value = c.city || '';
    el('cp-f-email').value = c.contact_email || '';
    el('cp-f-phone').value = c.phone || '';
    el('cp-f-website').value = c.website || '';
    el('cp-f-size').value = c.company_size || '';
    el('cp-f-desc').value = c.description || '';
    el('cp-f-dir1').value = c.direction_1 || '';
    el('cp-f-dir2').value = c.direction_2 || '';
    el('cp-f-dir3').value = c.direction_3 || '';
    el('cp-f-dir4').value = c.direction_4 || '';
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
    fd.append('username', username);
    fd.append('name', el('cp-f-name').value);
    fd.append('industry', el('cp-f-industry').value);
    fd.append('city', el('cp-f-city').value);
    fd.append('contact_email', el('cp-f-email').value);
    fd.append('phone', el('cp-f-phone').value);
    fd.append('website', el('cp-f-website').value);
    fd.append('company_size', el('cp-f-size').value);
    fd.append('description', el('cp-f-desc').value);
    fd.append('direction_1', el('cp-f-dir1').value);
    fd.append('direction_2', el('cp-f-dir2').value);
    fd.append('direction_3', el('cp-f-dir3').value);
    fd.append('direction_4', el('cp-f-dir4').value);

    apiFetchForm('/api/v1/companies/' + username + '/profile/', fd)
      .then(function (data) {
        state.company = data.company;
        renderSidebar(data.company);
        renderHero(data.company);
        if (data.company.is_verified) renderProfileContent(data.company);
        btn.disabled = false;
        btn.textContent = 'Сохранить';
        flashSettings('Сохранено!', 'success');
      })
      .catch(function (err) {
        flashSettings(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Сохранить';
      });
  }

  function initSettingsButtons() {
    var saveBtn = el('cp-save-settings-btn');
    var cancelBtn = el('cp-cancel-settings-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveProfile);
    if (cancelBtn) cancelBtn.addEventListener('click', function () { fillSettingsForm(); });
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
  var page = (window.ALFA_APP_BOOTSTRAP || {}).page || 'profile';

  function init() {
    initLogout();
    initVerifyDoc();
    initAvatarUpload();
    initSettingsButtons();

    var companyFetch = apiFetch('/api/v1/companies/' + username + '/');
    var contestsFetch = apiFetch('/api/v1/contests/company/').catch(function () { return { contests: [] }; });
    var testsFetch = apiFetch('/api/v1/companies/' + username + '/tests/').catch(function () { return { tests: [] }; });

    Promise.all([companyFetch, contestsFetch, testsFetch])
      .then(function (results) {
        state.company = results[0].company;
        state.contests = results[1].contests || [];
        state.tests = results[2].tests || [];

        var company = state.company;
        renderSidebar(company);
        // Разблокируем «Тесты»/«Конкурсы» на любой странице кабинета, если компания подтверждена
        if (company.is_verified) unlockSidebarLinks();

        if (page === 'stats') {
          renderStatsTab();
        } else if (page === 'settings') {
          fillSettingsForm();
        } else {
          renderHero(company);
          if (company.is_verified) {
            showProfileContent(company);
          } else {
            showVerifyGate(company);
          }
        }
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
