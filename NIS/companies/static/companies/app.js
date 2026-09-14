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
        cell.style.whiteSpace = 'nowrap';

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

        cell.appendChild(statsLink);
        cell.appendChild(editLink);
        cell.appendChild(deleteButton);
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
        const pill = document.createElement('span');
        pill.className = `status-pill ${String(test.status || '').toLowerCase()}`;
        pill.textContent = STATUS_LABELS[test.status] || test.status || '—';
        statusCell.appendChild(pill);
        row.appendChild(statusCell);

        for (const value of [String(test.page_count ?? 0), String(test.submissions ?? 0),
                             formatDate(test.created_at)]) {
            const cell = document.createElement('td');
            cell.textContent = value;
            row.appendChild(cell);
        }

        row.appendChild(buildActions(test, companyUsername));
        return row;
    }

    function syncTestsPage(company, tests, stats) {
        setText('stat-total-tests', String(stats?.total_tests ?? 0));
        setText('stat-active-tests', String(stats?.active_tests ?? 0));
        setText('stat-submissions', String(stats?.submissions ?? 0));
        setText('stat-completion-rate', `${stats?.completion_rate ?? 0}%`);

        const wrapper = document.getElementById('tests-table-wrapper');
        const body = document.getElementById('tests-table-body');
        const empty = document.getElementById('tests-empty');
        if (!wrapper || !body || !empty) return;

        body.innerHTML = '';

        if (!tests.length) {
            wrapper.hidden = true;
            empty.hidden = false;
            return;
        }

        for (const test of tests) {
            body.appendChild(buildRow(test, company.username));
        }
        wrapper.hidden = false;
        empty.hidden = true;
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
