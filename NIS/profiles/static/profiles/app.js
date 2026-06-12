(() => {
    const BOOTSTRAP = window.ALFA_APP_BOOTSTRAP || {};
    const username = BOOTSTRAP.username || '';
    const type = BOOTSTRAP.type || 'company'; // 'company' | 'user'

    function esc(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function formatDate(iso) {
        if (!iso) return '';
        try { return new Date(iso).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' }); }
        catch { return ''; }
    }

    async function apiFetch(url) {
        const res = await fetch(url);
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || 'Ошибка загрузки');
        return data;
    }

    // ── Company profile ───────────────────────────────────────────────────

    function renderCompany(company, tests) {
        const el = document.getElementById('profile-content');
        if (!el) return;

        const initial = (company.name || 'A').charAt(0).toUpperCase();
        const avatarHtml = company.avatar_url
            ? `<img src="${esc(company.avatar_url)}" alt="${esc(company.name)}" style="width:100%;height:100%;object-fit:cover;">`
            : `<span style="font-size:28px;font-weight:700;color:var(--brand-text);">${esc(initial)}</span>`;

        const verifiedHtml = company.is_verified
            ? `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;background:var(--green-soft);color:var(--green-text);">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>
                Подтверждена
               </span>`
            : '';

        const metaParts = [company.industry, company.company_size, company.city].filter(Boolean);
        const metaHtml = metaParts.length
            ? `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:13px;color:var(--muted);margin-top:8px;">${metaParts.map(p => `<span>${esc(p)}</span>`).join('')}</div>`
            : '';

        const aboutHtml = company.description
            ? `<div style="border:1px solid var(--line);border-radius:16px;background:var(--surface);padding:22px 24px;margin-bottom:20px;">
                <div style="font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--faint);margin-bottom:12px;">О компании</div>
                <p style="font-size:14px;line-height:1.65;color:var(--text-2);margin:0;">${esc(company.description)}</p>
               </div>`
            : '';

        const directions = company.directions || [];
        const directionsHtml = directions.length
            ? `<div style="border:1px solid var(--line);border-radius:16px;background:var(--surface);padding:22px 24px;margin-bottom:20px;">
                <div style="font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--faint);margin-bottom:14px;">Направления работы</div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;">${directions.map(d => `<span class="direction-chip">${esc(d)}</span>`).join('')}</div>
               </div>`
            : '';

        const publishedTests = (tests || []).filter(t => t.status === 'published');
        const testsHtml = publishedTests.length
            ? `<div style="border:1px solid var(--line);border-radius:16px;background:var(--surface);padding:22px 24px;margin-bottom:20px;">
                <div style="font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--faint);margin-bottom:14px;">Тесты компании</div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                  ${publishedTests.map(t => `
                    <a href="${esc(t.url)}" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--line);border-radius:11px;text-decoration:none;color:inherit;"
                      onmouseover="this.style.borderColor='var(--line-2)'" onmouseout="this.style.borderColor='var(--line)'">
                      <span style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;background:var(--surface-2);flex-shrink:0;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="13" height="13" rx="2"/><path d="M5 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1"/></svg>
                      </span>
                      <div style="flex:1;font-size:13.5px;font-weight:600;">${esc(t.title)}</div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                    </a>`).join('')}
                </div>
               </div>`
            : '';

        const contactRows = [];
        if (company.contact_email) contactRows.push(['Email', company.contact_email, null]);
        if (company.phone) contactRows.push(['Телефон', company.phone, null]);
        if (company.website) contactRows.push(['Сайт', company.website, company.website]);

        const contactsHtml = contactRows.length
            ? `<div style="border:1px solid var(--line);border-radius:16px;background:var(--surface);padding:20px 22px;margin-bottom:16px;">
                <div style="font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--faint);margin-bottom:14px;">Контакты</div>
                <div class="info-list">${contactRows.map(([label, value, href]) => `
                  <div><span>${esc(label)}</span><strong>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(value)}</a>` : esc(value)}</strong></div>`).join('')}
                </div>
               </div>`
            : '';

        el.innerHTML = `
          <!-- Hero card -->
          <div style="border:1px solid var(--line);border-radius:18px;background:var(--surface);overflow:hidden;box-shadow:var(--shadow);margin-bottom:20px;">
            <div style="height:88px;background:linear-gradient(120deg,var(--brand) 0%,color-mix(in srgb,var(--brand) 60%,#7c3aed) 100%);"></div>
            <div style="padding:0 28px 22px;">
              <div style="display:flex;align-items:flex-end;gap:18px;margin-top:-38px;">
                <div style="width:80px;height:80px;border-radius:16px;background:var(--brand-soft);border:4px solid var(--surface);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
                  ${avatarHtml}
                </div>
                <div style="flex:1;min-width:0;padding-bottom:6px;">
                  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <h1 style="font-size:24px;font-weight:800;letter-spacing:-.02em;margin:0;">${esc(company.name)}</h1>
                    ${verifiedHtml}
                  </div>
                  ${metaHtml}
                </div>
              </div>
            </div>
          </div>

          <!-- Two-column layout -->
          <div style="display:grid;grid-template-columns:1fr 300px;gap:20px;align-items:start;">
            <div>
              ${aboutHtml}
              ${directionsHtml}
              ${testsHtml}
            </div>
            <div>
              ${contactsHtml}
              <div style="font-size:12px;color:var(--faint);text-align:center;padding:8px 0;">На платформе с ${esc(formatDate(company.created_at))}</div>
            </div>
          </div>
        `;
    }

    // ── User profile ──────────────────────────────────────────────────────

    function renderUser(candidate) {
        const el = document.getElementById('profile-content');
        if (!el) return;

        const c = candidate;
        const initial = (c.name || '?').trim()[0].toUpperCase();
        const avatarHtml = c.avatar
            ? `<img src="${esc(c.avatar)}" alt="${esc(c.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : `<span style="font-size:32px;font-weight:700;color:var(--brand-text);">${esc(initial)}</span>`;

        const bioHtml = c.bio
            ? `<p style="font-size:14px;line-height:1.65;color:var(--text-2);margin:0;">${esc(c.bio)}</p>`
            : `<p style="font-size:14px;color:var(--faint);margin:0;">Биография не заполнена.</p>`;

        const skills = c.skills || [];
        const skillsHtml = skills.length
            ? skills.map(sk => `<span style="padding:5px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);font-size:13px;font-weight:500;color:var(--text-2);">${esc(sk)}</span>`).join('')
            : `<span style="font-size:13.5px;color:var(--faint);">Навыки не указаны.</span>`;

        el.innerHTML = `
          <div style="border:1px solid var(--line);border-radius:18px;background:var(--surface);overflow:hidden;box-shadow:var(--shadow);margin-bottom:20px;">
            <div style="height:88px;background:linear-gradient(120deg,var(--brand) 0%,color-mix(in srgb,var(--brand) 55%,#ff7a45) 100%);"></div>
            <div style="padding:0 28px 24px;">
              <div style="display:flex;align-items:flex-end;gap:18px;margin-top:-42px;">
                <div style="position:relative;flex-shrink:0;">
                  <div style="width:90px;height:90px;border-radius:50%;background:var(--brand-soft);border:4px solid var(--surface);display:flex;align-items:center;justify-content:center;overflow:hidden;">${avatarHtml}</div>
                </div>
                <div style="flex:1;padding-bottom:6px;">
                  <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;">
                    <h1 style="font-size:24px;font-weight:800;letter-spacing:-.02em;margin:0;">${esc(c.name)}</h1>
                    <span style="font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;background:var(--brand-soft);color:var(--brand-text);">Кандидат</span>
                  </div>
                  <div style="margin-top:8px;font-size:13px;color:var(--muted);">
                    <span style="font-family:'JetBrains Mono',monospace;font-size:12.5px;">@${esc(c.username)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 280px;gap:20px;align-items:start;">
            <div style="display:flex;flex-direction:column;gap:20px;">
              <div style="border:1px solid var(--line);border-radius:16px;background:var(--surface);padding:22px 24px;">
                <div style="font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--faint);margin-bottom:12px;">О себе</div>
                ${bioHtml}
              </div>
              <div style="border:1px solid var(--line);border-radius:16px;background:var(--surface);padding:22px 24px;">
                <div style="font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--faint);margin-bottom:12px;">Навыки</div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;">${skillsHtml}</div>
              </div>
            </div>
            <div>
              <div style="font-size:12px;color:var(--faint);text-align:center;padding:8px 0;">На платформе с ${esc(formatDate(c.created_at))}</div>
            </div>
          </div>
        `;
    }

    // ── Init ──────────────────────────────────────────────────────────────

    async function init() {
        const el = document.getElementById('profile-content');

        try {
            if (type === 'company') {
                const [companyData, testsData] = await Promise.all([
                    apiFetch(`/api/v1/companies/${username}/`),
                    apiFetch(`/api/v1/companies/${username}/tests/`).catch(() => ({ tests: [] })),
                ]);
                renderCompany(companyData.company, testsData.tests || []);
            } else {
                const data = await apiFetch(`/api/v1/candidates/${username}/`);
                renderUser(data.candidate);
            }
        } catch (e) {
            if (el) el.innerHTML = `<div style="padding:80px;text-align:center;color:var(--muted);">${esc(e.message)}</div>`;
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
