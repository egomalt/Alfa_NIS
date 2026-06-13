(() => {
    const BOOTSTRAP = window.ALFA_APP_BOOTSTRAP || {};
    const PAGE = BOOTSTRAP.page === 'tests' ? 'tests' : 'profile';

    const state = {
        company: null,
        tests: [],
        stats: null,
        loading: true,
        modalOpen: false,
        isOwner: false,
    };

    function getCookie(name) {
        const prefix = `${name}=`;
        const cookies = document.cookie ? document.cookie.split(';') : [];
        for (const rawCookie of cookies) {
            const cookie = rawCookie.trim();
            if (cookie.startsWith(prefix)) {
                return decodeURIComponent(cookie.slice(prefix.length));
            }
        }
        return '';
    }

    function getCsrfToken() {
        return getCookie('csrftoken') || document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    }

    function formatDate(value) {
        if (!value) {
            return '';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }
        return new Intl.DateTimeFormat('ru-RU').format(date);
    }

    function setVisible(element, visible) {
        if (!element) {
            return;
        }
        element.hidden = !visible;
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (!element) {
            return;
        }
        element.textContent = value || '';
    }

    function setHref(id, href) {
        const element = document.getElementById(id);
        if (!element) {
            return;
        }
        element.setAttribute('href', href);
    }

    function showFlash(message) {
        const flash = document.getElementById('company-flash');
        if (!flash) {
            return;
        }

        if (!message) {
            flash.hidden = true;
            flash.textContent = '';
            return;
        }

        flash.textContent = message;
        flash.hidden = false;
    }

    function clearFormErrors(form) {
        if (!form) {
            return;
        }

        form.querySelectorAll('[data-field] .errorlist').forEach((list) => {
            list.innerHTML = '';
            list.hidden = true;
        });
    }

    function showFormErrors(form, errors) {
        clearFormErrors(form);

        Object.entries(errors || {}).forEach(([fieldName, values]) => {
            const list = form.querySelector(`[data-field="${fieldName}"] .errorlist`);
            if (!list) {
                return;
            }

            list.innerHTML = '';
            for (const item of values) {
                const li = document.createElement('li');
                li.textContent = item?.message || String(item || 'Ошибка в поле.');
                list.appendChild(li);
            }
            list.hidden = list.children.length === 0;
        });
    }

    async function fetchJson(url, options = {}) {
        const response = await fetch(url, options);

        let payload = null;
        try {
            payload = await response.json();
        } catch (_error) {
            payload = null;
        }

        if (!response.ok) {
            const error = new Error(payload?.message || payload?.detail || 'Ошибка запроса.');
            error.status = response.status;
            error.payload = payload;
            throw error;
        }

        return payload;
    }

    function syncNavigation(company) {
        const profileHref = `/${company.username}/`;
        const testsHref = `/${company.username}/tests/`;

        // sidebar-brand is now the navbar brand — don't overwrite it
        setHref('nav-profile', profileHref);
        setHref('nav-tests', testsHref);

        // lock card shown only to owner of unverified company
        const lockCard = document.getElementById('lock-card');
        const lockButton = document.getElementById('lock-add-file');
        if (lockButton) {
            lockButton.setAttribute('href', `${profileHref}#verification-section`);
        }
    }

    function syncTopbar(company) {
        setText('topbar-company-name', company.name || 'Компания');

        const initial = (company.name || 'A').charAt(0).toUpperCase();
        setText('topbar-avatar-placeholder', initial);

        const avatar = document.getElementById('topbar-avatar');
        const placeholder = document.getElementById('topbar-avatar-placeholder');

        if (avatar && placeholder) {
            if (company.avatar_url) {
                avatar.src = company.avatar_url;
                avatar.alt = company.name || 'Company';
                avatar.hidden = false;
                placeholder.hidden = true;
            } else {
                avatar.hidden = true;
                placeholder.hidden = false;
            }
        }
    }

    function syncProfileHeader(company) {
        setText('hero-name', company.name || 'Компания');

        const initial = (company.name || 'A').charAt(0).toUpperCase();
        setText('hero-avatar-placeholder', initial);

        const heroAvatar = document.getElementById('hero-avatar');
        const heroPlaceholder = document.getElementById('hero-avatar-placeholder');
        if (heroAvatar && heroPlaceholder) {
            if (company.avatar_url) {
                heroAvatar.src = company.avatar_url;
                heroAvatar.alt = company.name || 'Company';
                heroAvatar.hidden = false;
                heroPlaceholder.hidden = true;
            } else {
                heroAvatar.hidden = true;
                heroPlaceholder.hidden = false;
            }
        }

        setVisible(document.getElementById('hero-verified'), company.is_verified);

        const industry = document.getElementById('hero-industry');
        const size = document.getElementById('hero-size');
        const city = document.getElementById('hero-city');

        if (industry) {
            industry.textContent = company.industry || '';
            industry.hidden = !company.industry;
        }
        if (size) {
            size.textContent = company.company_size || '';
            size.hidden = !company.company_size;
        }
        if (city) {
            city.textContent = company.city || '';
            city.hidden = !company.city;
        }
    }

    function syncProfileContent(company, isOwner) {
        const verificationSection = document.getElementById('verification-section');
        const profileContent = document.getElementById('profile-content');

        const lockCard = document.getElementById('lock-card');

        // Non-owners only see profile content (unverified companies are blocked at the server level)
        if (!isOwner) {
            setVisible(lockCard, false);
            setVisible(verificationSection, false);
            setVisible(profileContent, true);
            setVisible(document.getElementById('profile-edit-btn'), false);
        } else {
            setVisible(lockCard, !company.is_verified);
            setVisible(verificationSection, !company.is_verified);
            setVisible(profileContent, company.is_verified);
            setVisible(document.getElementById('profile-edit-btn'), company.is_verified);
        }

        const verificationForm = document.getElementById('verification-form');
        if (verificationForm) {
            verificationForm.setAttribute('action', `/api/v1/companies/${company.username}/verification/`);
        }

        if (!company.is_verified) {
            return;
        }

        const aboutCard = document.getElementById('about-card');
        const emptyAboutCard = document.getElementById('empty-about-card');
        const aboutText = document.getElementById('about-text');

        setVisible(aboutCard, Boolean(company.description));
        setVisible(emptyAboutCard, !company.description);
        if (aboutText) {
            aboutText.textContent = company.description || '';
        }

        const directionsCard = document.getElementById('directions-card');
        const directionsGrid = document.getElementById('directions-grid');
        if (directionsCard && directionsGrid) {
            directionsGrid.innerHTML = '';
            for (const direction of company.directions || []) {
                const chip = document.createElement('div');
                chip.className = 'direction-chip';
                chip.textContent = direction;
                directionsGrid.appendChild(chip);
            }
            setVisible(directionsCard, (company.directions || []).length > 0);
        }

        const contactsList = document.getElementById('contacts-list');
        if (contactsList) {
            contactsList.innerHTML = '';

            const rows = [];
            if (company.username) {
                rows.push(['Аккаунт', `@${company.username}`]);
            }
            if (company.contact_email) {
                rows.push(['Email', company.contact_email]);
            }
            if (company.phone) {
                rows.push(['Телефон', company.phone]);
            }
            if (company.website) {
                rows.push(['Сайт', company.website]);
            }

            if (!rows.length) {
                rows.push(['Контакты', 'Пока не заполнены']);
            }

            for (const [label, value] of rows) {
                const row = document.createElement('div');
                const title = document.createElement('span');
                title.textContent = label;
                const body = document.createElement('strong');

                if (label === 'Сайт' && company.website) {
                    const link = document.createElement('a');
                    link.href = company.website;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = value;
                    body.appendChild(link);
                } else {
                    body.textContent = value;
                }

                row.appendChild(title);
                row.appendChild(body);
                contactsList.appendChild(row);
            }
        }

        const verificationInfo = document.getElementById('verification-info');
        if (verificationInfo) {
            verificationInfo.innerHTML = '';
            const pairs = [
                ['Статус', 'Подтверждена'],
                ['Дата обновления', formatDate(company.updated_at)],
            ];
            if (company.address) {
                pairs.push(['Адрес', company.address]);
            }

            for (const [label, value] of pairs) {
                const row = document.createElement('div');
                const title = document.createElement('span');
                title.textContent = label;
                const body = document.createElement('strong');
                body.textContent = value;
                row.appendChild(title);
                row.appendChild(body);
                verificationInfo.appendChild(row);
            }
        }

        const verificationLink = document.getElementById('verification-file-link');
        if (verificationLink) {
            if (company.registration_document_url) {
                verificationLink.href = company.registration_document_url;
                verificationLink.hidden = false;
            } else {
                verificationLink.hidden = true;
            }
        }
    }

    function syncProfileForm(company) {
        const form = document.getElementById('profile-form');
        if (!form) {
            return;
        }

        form.action = `/api/v1/companies/${company.username}/profile/`;

        const fields = {
            username: company.username || '',
            name: company.name || '',
            industry: company.industry || '',
            company_size: company.company_size || '',
            city: company.city || '',
            description: company.description || '',
            contact_email: company.contact_email || '',
            phone: company.phone || '',
            website: company.website || '',
            address: company.address || '',
            direction_1: company.direction_1 || '',
            direction_2: company.direction_2 || '',
            direction_3: company.direction_3 || '',
            direction_4: company.direction_4 || '',
        };

        for (const [name, value] of Object.entries(fields)) {
            const input = form.querySelector(`[name="${name}"]`);
            if (input) {
                input.value = value;
            }
        }

        const currentAvatar = document.getElementById('current-avatar');
        const currentAvatarLink = document.getElementById('current-avatar-link');
        if (currentAvatar && currentAvatarLink) {
            if (company.avatar_url) {
                currentAvatarLink.href = company.avatar_url;
                currentAvatar.hidden = false;
            } else {
                currentAvatar.hidden = true;
            }
        }

        const currentDocument = document.getElementById('current-document');
        const currentDocumentLink = document.getElementById('current-document-link');
        if (currentDocument && currentDocumentLink) {
            if (company.registration_document_url) {
                currentDocumentLink.href = company.registration_document_url;
                currentDocument.hidden = false;
            } else {
                currentDocument.hidden = true;
            }
        }

        clearFormErrors(form);
    }

    const STATUS_LABELS = { draft: 'Черновик', published: 'Опубликован' };

    function syncTestsPage(company, tests, stats) {
        setText('stat-total-tests', String(stats?.total_tests ?? 0));
        setText('stat-active-tests', String(stats?.active_tests ?? 0));
        setText('stat-submissions', String(stats?.submissions ?? 0));
        setText('stat-completion-rate', `${stats?.completion_rate ?? 0}%`);

        const tableWrapper = document.getElementById('tests-table-wrapper');
        const tableBody = document.getElementById('tests-table-body');
        const empty = document.getElementById('tests-empty');

        if (!tableWrapper || !tableBody || !empty) {
            return;
        }

        tableBody.innerHTML = '';

        if (!tests.length) {
            tableWrapper.hidden = true;
            empty.hidden = false;
            return;
        }

        for (const test of tests) {
            const tr = document.createElement('tr');

            // Title (link to test page)
            const tdTitle = document.createElement('td');
            const titleLink = document.createElement('a');
            titleLink.href = test.url;
            titleLink.textContent = test.title || '—';
            titleLink.target = '_blank';
            tdTitle.appendChild(titleLink);
            tr.appendChild(tdTitle);

            // Status pill
            const tdStatus = document.createElement('td');
            const pill = document.createElement('span');
            pill.className = `status-pill ${String(test.status || '').toLowerCase()}`;
            pill.textContent = STATUS_LABELS[test.status] || test.status || '—';
            tdStatus.appendChild(pill);
            tr.appendChild(tdStatus);

            // Page count
            const tdPages = document.createElement('td');
            tdPages.textContent = String(test.page_count ?? 0);
            tr.appendChild(tdPages);

            // Submissions
            const tdSubs = document.createElement('td');
            tdSubs.textContent = String(test.submissions ?? 0);
            tr.appendChild(tdSubs);

            // Date
            const tdDate = document.createElement('td');
            tdDate.textContent = formatDate(test.created_at);
            tr.appendChild(tdDate);

            // Actions
            const tdActions = document.createElement('td');
            tdActions.style.whiteSpace = 'nowrap';

            const editLink = document.createElement('a');
            editLink.href = test.edit_url;
            editLink.className = 'action-icon-btn';
            editLink.title = 'Редактировать';
            editLink.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'action-icon-btn danger';
            deleteBtn.title = 'Удалить';
            deleteBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
            deleteBtn.addEventListener('click', () => deleteTest(test.id, company.username));

            tdActions.appendChild(editLink);
            tdActions.appendChild(deleteBtn);
            tr.appendChild(tdActions);

            tableBody.appendChild(tr);
        }

        tableWrapper.hidden = false;
        empty.hidden = true;
    }

    async function deleteTest(testId, username) {
        if (!confirm('Удалить тест? Это действие нельзя отменить.')) return;
        try {
            await fetchJson(`/api/v1/tests/${testId}/`, {
                method: 'DELETE',
                headers: { 'X-CSRFToken': getCsrfToken() },
                credentials: 'same-origin',
            });
            const payload = await fetchJson(`/api/v1/companies/${username}/tests/`);
            state.company = payload.company;
            state.tests = payload.tests || [];
            state.stats = payload.stats || null;
            syncNavigation(state.company);
            syncTopbar(state.company);
            syncTestsPage(state.company, state.tests, state.stats);
        } catch (e) {
            showFlash(e.message || 'Не удалось удалить тест.');
        }
    }

    function openModal() {
        const modal = document.getElementById('profile-edit-modal');
        if (!modal) {
            return;
        }
        state.modalOpen = true;
        modal.classList.remove('hidden');
    }

    function closeModal() {
        const modal = document.getElementById('profile-edit-modal');
        if (!modal) {
            return;
        }
        state.modalOpen = false;
        modal.classList.add('hidden');
        clearFormErrors(document.getElementById('profile-form'));
    }

    async function handleProfileSubmit(form) {
        showFlash('');
        clearFormErrors(form);

        try {
            const payload = await fetchJson(form.action, {
                method: 'POST',
                body: new FormData(form),
                headers: {
                    'X-CSRFToken': getCsrfToken(),
                },
                credentials: 'same-origin',
            });

            if (payload.company) {
                state.company = payload.company;
                syncNavigation(state.company);
                syncTopbar(state.company);
                syncProfileHeader(state.company);
                syncProfileContent(state.company, state.isOwner);
                syncProfileForm(state.company);
            }

            if (payload.company?.username && payload.company.username !== BOOTSTRAP.ownerUsername) {
                window.location.assign(`/${payload.company.username}/`);
                return;
            }

            showFlash('Профиль компании сохранён.');
            closeModal();
        } catch (error) {
            showFormErrors(form, error.payload?.errors || {});
            showFlash(error.payload?.message || error.message);
        }
    }

    async function handleVerificationSubmit(form) {
        showFlash('');
        clearFormErrors(form);

        try {
            const payload = await fetchJson(form.action, {
                method: 'POST',
                body: new FormData(form),
                headers: {
                    'X-CSRFToken': getCsrfToken(),
                },
                credentials: 'same-origin',
            });

            if (payload.company) {
                state.company = payload.company;
                syncNavigation(state.company);
                syncTopbar(state.company);
                syncProfileHeader(state.company);
                syncProfileContent(state.company, state.isOwner);
                syncProfileForm(state.company);
            }

            if (payload.next_url) {
                window.location.assign(payload.next_url);
                return;
            }
        } catch (error) {
            showFormErrors(form, error.payload?.errors || {});
            showFlash(error.payload?.message || error.message);
        }
    }

    function bindGlobalEvents() {
        document.body.addEventListener('change', (event) => {
            const input = event.target.closest('.file-input-hidden');
            if (!input) {
                return;
            }

            const fileNameTarget = document.querySelector(`[data-file-name="${input.id}"]`);
            if (!fileNameTarget) {
                return;
            }

            fileNameTarget.textContent = input.files?.length ? input.files[0].name : 'Файл не выбран';
        });

        document.body.addEventListener('click', (event) => {
            const openButton = event.target.closest('[data-modal-open]');
            if (openButton) {
                openModal();
                return;
            }

            const closeButton = event.target.closest('[data-modal-close]');
            if (closeButton) {
                closeModal();
                return;
            }

            if (event.target.matches('[data-modal]')) {
                closeModal();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && state.modalOpen) {
                closeModal();
            }
        });
    }

    async function initProfilePage(username) {
        const payload = await fetchJson(`/api/v1/companies/${username}/`);
        state.company = payload.company;
        state.isOwner = Boolean(payload.is_owner);

        syncNavigation(state.company);
        syncTopbar(state.company);
        syncProfileHeader(state.company);
        syncProfileContent(state.company, state.isOwner);
        syncProfileForm(state.company);
        setVisible(document.getElementById('company-logout-btn'), state.isOwner);

        const profileForm = document.getElementById('profile-form');
        profileForm?.addEventListener('submit', (event) => {
            event.preventDefault();
            handleProfileSubmit(profileForm);
        });

        const verificationForm = document.getElementById('verification-form');
        verificationForm?.addEventListener('submit', (event) => {
            event.preventDefault();
            handleVerificationSubmit(verificationForm);
        });
    }

    async function initTestsPage(username) {
        const payload = await fetchJson(`/api/v1/companies/${username}/tests/`);
        state.company = payload.company;
        state.tests = payload.tests || [];
        state.stats = payload.stats || null;
        const isOwner = Boolean(payload.is_owner);

        syncNavigation(state.company);
        syncTopbar(state.company);
        syncTestsPage(state.company, state.tests, state.stats);
        setVisible(document.getElementById('company-logout-btn'), isOwner);
    }

    document.addEventListener('DOMContentLoaded', async () => {
        bindGlobalEvents();
        showFlash('');

        const logoutBtn = document.getElementById('company-logout-btn');
        if (logoutBtn) {
            logoutBtn.hidden = true; // shown only for owner after data loads
            logoutBtn.addEventListener('click', async () => {
                await fetch('/api/v1/auth/signout/', { method: 'POST', headers: { 'X-CSRFToken': getCsrfToken() } });
                window.location.assign('/');
            });
        }

        const username = BOOTSTRAP.ownerUsername || '';
        if (!username) {
            showFlash('Не удалось определить компанию по адресу страницы.');
            return;
        }

        try {
            if (PAGE === 'tests') {
                await initTestsPage(username);
            } else {
                await initProfilePage(username);
            }
        } catch (error) {
            showFlash(error.payload?.message || error.message || 'Не удалось загрузить данные компании.');
            if (error.payload?.next_url) {
                window.location.assign(error.payload.next_url);
            }
        }
    });
})();
