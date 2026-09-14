/* Раздел «Тесты» кабинета компании.
 *
 * Файл подключается только из companies/templates/companies/tests.html.
 * Раньше здесь лежала вторая половина — страница профиля компании с формами,
 * верификацией и модалками (около 360 строк). Она не исполнялась никогда:
 * ветка выбиралась по BOOTSTRAP.page, а шаблон всегда передаёт "tests".
 * Работающий профиль компании живёт в cabinet/static/cabinet/company.js.
 */
(() => {
    const BOOTSTRAP = window.ALFA_APP_BOOTSTRAP || {};

    const state = {
        company: null,
        tests: [],
        stats: null,
        filter: 'all',
    };

    const STATUS_LABELS = { draft: 'Черновик', published: 'Опубликован' };

    function getCsrfToken() {
        const cookie = document.cookie.split(';').map(c => c.trim())
            .find(c => c.startsWith('csrftoken='));
        if (cookie) return decodeURIComponent(cookie.slice('csrftoken='.length));
        return document.querySelector('meta[name="csrf-token"]')?.content || '';
    }

    function formatDate(value) {
        if (!value) return '—';
        try {
            return new Date(value).toLocaleDateString('ru-RU', {
                day: 'numeric', month: 'short', year: 'numeric',
            });
        } catch (_) {
            return '—';
        }
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }

    function showFlash(message) {
        const flash = document.getElementById('company-flash');
        if (!flash) return;
        flash.textContent = message || '';
        flash.hidden = !message;
    }

    async function fetchJson(url, options = {}) {
        const response = await fetch(url, { credentials: 'same-origin', ...options });
        let payload = null;
        try {
            payload = await response.json();
        } catch (_) {
            payload = null;
        }
        if (!response.ok || payload?.ok === false) {
            const error = new Error(payload?.message || 'Не удалось загрузить данные.');
            error.payload = payload;
            throw error;
        }
        return payload;
    }

    function buildActions(test, companyUsername) {
        const cell = document.createElement('td');
        // Кнопки стояли впритык к правому краю таблицы — отступ и зазор в CSS
        const row = document.createElement('div');
        row.className = 'action-row';

        // Статистика есть только у опубликованного теста — черновик никто не проходил
        const statsLink = document.createElement('a');
        statsLink.href = `${test.edit_url}stats/`;
        statsLink.className = 'action-icon-btn';
        statsLink.title = 'Как проходят тест';
        statsLink.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-4"/></svg>';
        if (test.status !== 'published') statsLink.hidden = true;

        const editLink = document.createElement('a');
        editLink.href = test.edit_url;
        editLink.className = 'action-icon-btn';
        editLink.title = 'Редактировать';
        editLink.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'action-icon-btn danger';
        deleteButton.title = 'Удалить';
        deleteButton.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
        deleteButton.addEventListener('click', () => deleteTest(test.id, companyUsername));

        row.appendChild(statsLink);
        row.appendChild(editLink);
        row.appendChild(deleteButton);
        cell.appendChild(row);
        return cell;
    }

    function buildRow(test, companyUsername) {
        const row = document.createElement('tr');

        const titleCell = document.createElement('td');
        const titleLink = document.createElement('a');
        titleLink.href = test.url;
        titleLink.textContent = test.title || '—';
        titleLink.target = '_blank';
        titleCell.appendChild(titleLink);
        row.appendChild(titleCell);

        const statusCell = document.createElement('td');
        statusCell.dataset.label = 'Статус';
        const pill = document.createElement('span');
        pill.className = `status-pill ${String(test.status || '').toLowerCase()}`;
        pill.textContent = STATUS_LABELS[test.status] || test.status || '—';
        statusCell.appendChild(pill);
        row.appendChild(statusCell);

        // data-label подхватывает CSS на телефоне: там шапка таблицы скрыта,
        // и без подписи непонятно, что за число в карточке
        const cells = [
            ['Страниц', String(test.page_count ?? 0)],
            ['Прохождений', String(test.submissions ?? 0)],
            ['Создан', formatDate(test.created_at)],
        ];
        for (const [label, value] of cells) {
            const cell = document.createElement('td');
            cell.dataset.label = label;
            cell.textContent = value;
            row.appendChild(cell);
        }

        row.appendChild(buildActions(test, companyUsername));
        return row;
    }

    /** Тесты под выбранным фильтром. Плашки сверху считают по всем — это сводка. */
    function filteredTests() {
        if (state.filter === 'all') return state.tests;
        return state.tests.filter(t => t.status === state.filter);
    }

    function renderTable() {
        const wrapper = document.getElementById('tests-table-wrapper');
        const body = document.getElementById('tests-table-body');
        const empty = document.getElementById('tests-empty');
        if (!wrapper || !body || !empty) return;

        // Клик по фильтру возможен до того, как ответил сервер
        if (!state.company) return;

        const shown = filteredTests();
        setText('tests-filter-count', state.tests.length ? `${shown.length} из ${state.tests.length}` : '');

        body.innerHTML = '';

        if (!shown.length) {
            wrapper.hidden = true;
            empty.hidden = false;
            // Пусто из-за фильтра и пусто вообще — разные сообщения
            setText('tests-empty-title', state.tests.length ? 'Тестов не найдено' : 'Тестов пока нет');
            setText('tests-empty-sub', state.tests.length
                ? 'Под выбранный фильтр ничего не подходит'
                : 'Создайте первый тест, чтобы начать оценку кандидатов');
            const createBtn = document.getElementById('tests-empty-create');
            if (createBtn) createBtn.hidden = Boolean(state.tests.length);
            return;
        }

        for (const test of shown) {
            body.appendChild(buildRow(test, state.company.username));
        }
        wrapper.hidden = false;
        empty.hidden = true;
    }

    function initFilters() {
        const chips = document.querySelectorAll('.cr-chip[data-f]');
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                state.filter = chip.dataset.f;
                chips.forEach(c => c.classList.toggle('active', c === chip));
                renderTable();
            });
        });
    }

    function syncTestsPage(company, tests, stats) {
        setText('stat-total-tests', String(stats?.total_tests ?? 0));
        setText('stat-active-tests', String(stats?.active_tests ?? 0));
        setText('stat-submissions', String(stats?.submissions ?? 0));
        setText('stat-completion-rate', `${stats?.completion_rate ?? 0}%`);
        renderTable();
    }

    async function loadTests(username) {
        const payload = await fetchJson(`/api/v1/companies/${username}/tests/`);
        state.company = payload.company;
        state.tests = payload.tests || [];
        state.stats = payload.stats || null;
        syncTestsPage(state.company, state.tests, state.stats);
    }

    async function deleteTest(testId, username) {
        if (!confirm('Удалить тест? Это действие нельзя отменить.')) return;
        try {
            await fetchJson(`/api/v1/tests/${testId}/`, {
                method: 'DELETE',
                headers: { 'X-CSRFToken': getCsrfToken() },
            });
            await loadTests(username);
        } catch (error) {
            showFlash(error.message || 'Не удалось удалить тест.');
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        showFlash('');
        initFilters();

        const username = BOOTSTRAP.username || '';
        if (!username) {
            showFlash('Не удалось определить компанию по адресу страницы.');
            return;
        }

        try {
            await loadTests(username);
        } catch (error) {
            showFlash(error.message || 'Не удалось загрузить данные компании.');
            if (error.payload?.next_url) {
                window.location.assign(error.payload.next_url);
            }
        }
    });
})();
