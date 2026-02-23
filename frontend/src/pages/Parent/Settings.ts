/**
 * Settings.ts — user preferences page.
 * Sections: Account (language), Appearance (theme), Print defaults (paper size),
 *           Date & Time, Security (change password).
 */

import { t, setLanguage } from '@/i18n/i18n';
import { api, ApiError } from '@/api/client';
import { session } from '@/auth/session';
import { theme } from '@/utils/theme';
import { router } from '@/router';

const TIMEZONE_STORAGE_KEY = 'timeZone';
export const PRINT_PAGE_SIZE_KEY = 'print.pageSize';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sunSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
}
function moonSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>`;
}

export async function render(container: HTMLElement): Promise<void> {
  const browserTz        = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const initialTz        = session.user?.timezone    || browserTz;
  const initialLocale    = session.user?.locale      || navigator.language || 'en-GB';
  const initialDateFmt   = session.user?.date_format || 'locale';
  const initialTimeFmt   = session.user?.time_format || '24h';
  const initialWeekStart = session.user?.week_start  || 1;
  const currentLang      = session.user?.language    || localStorage.getItem('lang') || 'en';
  const isDark           = (localStorage.getItem('theme') ?? 'dark') === 'dark';
  const pageSize         = localStorage.getItem(PRINT_PAGE_SIZE_KEY) ?? 'A4';
  const displayName      = esc(session.user?.username ?? session.user?.email ?? 'User');
  const email            = esc(session.user?.email ?? '');

  container.innerHTML = `
    <main class="container page-content">
      <div class="page-header">
        <h1>${t('nav.settings')}</h1>
      </div>

      <div class="settings-layout">

        <!-- ── Account ──────────────────────────────────────── -->
        <section class="card settings-section" aria-labelledby="sec-account">
          <h2 id="sec-account" class="settings-section__title">${t('settings.account')}</h2>
          <form id="account-form" class="form-stack" novalidate>
            <div>
              <label>Display name</label>
              <input type="text" value="${displayName}" readonly class="input--readonly" title="Username cannot be changed here." />
            </div>
            <div>
              <label>Email</label>
              <input type="email" value="${email}" readonly class="input--readonly" />
            </div>
            <div>
              <label for="lang-select">${t('settings.language')}</label>
              <select id="lang-select">
                <option value="en" ${currentLang === 'en' ? 'selected' : ''}>English</option>
                <option value="da" ${currentLang === 'da' ? 'selected' : ''}>Dansk</option>
              </select>
            </div>
            <p id="account-error" class="error-msg" aria-live="polite"></p>
            <div class="modal-actions" style="margin-top:.5rem">
              <button type="submit" class="btn btn-primary">${t('schedule.save')}</button>
            </div>
          </form>
        </section>

        <!-- ── Appearance ───────────────────────────────────── -->
        <section class="card settings-section" aria-labelledby="sec-appearance">
          <h2 id="sec-appearance" class="settings-section__title">${t('settings.appearance')}</h2>
          <div class="settings-row">
            <div>
              <span class="settings-label">${t('settings.theme')}</span>
              <span class="settings-hint">Saved in your browser</span>
            </div>
            <div class="theme-picker" role="group" aria-label="Choose theme">
              <button type="button" class="theme-picker__btn${!isDark ? ' theme-picker__btn--active' : ''}" data-theme="light">
                ${sunSvg()} ${t('settings.theme_light')}
              </button>
              <button type="button" class="theme-picker__btn${isDark ? ' theme-picker__btn--active' : ''}" data-theme="dark">
                ${moonSvg()} ${t('settings.theme_dark')}
              </button>
            </div>
          </div>
        </section>

        <!-- ── Print defaults ───────────────────────────────── -->
        <section class="card settings-section" aria-labelledby="sec-print">
          <h2 id="sec-print" class="settings-section__title">${t('settings.print_defaults')}</h2>
          <span class="settings-label">${t('settings.paper_size')}</span>
          <span class="settings-hint">Applied when printing schedules and calendars</span>
          <div class="paper-size-options" role="group" aria-label="Paper size">
            <label class="paper-size-opt${pageSize === 'A4' ? ' paper-size-opt--active' : ''}">
              <input type="radio" name="paper-size" value="A4" ${pageSize === 'A4' ? 'checked' : ''} class="sr-only" />
              <span class="paper-size-opt__icon">📄</span>
              <span class="paper-size-opt__name">A4</span>
              <span class="paper-size-opt__dim">210 × 297 mm</span>
            </label>
            <label class="paper-size-opt${pageSize === 'letter' ? ' paper-size-opt--active' : ''}">
              <input type="radio" name="paper-size" value="letter" ${pageSize === 'letter' ? 'checked' : ''} class="sr-only" />
              <span class="paper-size-opt__icon">📃</span>
              <span class="paper-size-opt__name">US Letter</span>
              <span class="paper-size-opt__dim">8.5 × 11 in</span>
            </label>
          </div>
          <p id="paper-saved" class="success-msg hidden" style="margin-top:.75rem" aria-live="polite">${t('settings.saved')}</p>
        </section>

        <!-- ── Date & Time ───────────────────────────────────── -->
        <section class="card settings-section" aria-labelledby="sec-datetime">
          <h2 id="sec-datetime" class="settings-section__title">${t('settings.datetime')}</h2>
          <form id="pref-form" class="form-stack" novalidate>
            <div>
              <label for="timezone">Timezone</label>
              <select id="timezone"><option value="${esc(initialTz)}">${esc(initialTz)}</option></select>
            </div>
            <div>
              <label for="locale">Locale</label>
              <input id="locale" type="text" placeholder="e.g. en-GB or da-DK" value="${esc(initialLocale)}" />
            </div>
            <div>
              <label for="date-format">Date format</label>
              <select id="date-format">
                <option value="locale">Locale default</option>
                <option value="dd-mm-yyyy">DD-MM-YYYY</option>
                <option value="dd_month_yyyy">DD Month YYYY</option>
                <option value="mm/dd/yyyy">MM/DD/YYYY</option>
              </select>
            </div>
            <div>
              <label for="time-format">Time format</label>
              <select id="time-format">
                <option value="24h">24-hour (HH:MM)</option>
                <option value="12h">12-hour (HH:MM AM/PM)</option>
              </select>
            </div>
            <div>
              <label for="week-start">Week starts on</label>
              <select id="week-start">
                <option value="1">Monday</option>
                <option value="7">Sunday</option>
              </select>
            </div>
            <p id="pref-error" class="error-msg" aria-live="polite"></p>
            <div class="modal-actions" style="margin-top:.5rem">
              <button type="submit" class="btn btn-primary" id="btn-save-prefs">${t('schedule.save')}</button>
            </div>
          </form>
        </section>

        <!-- ── Security ─────────────────────────────────────── -->
        <section class="card settings-section" aria-labelledby="sec-security">
          <h2 id="sec-security" class="settings-section__title">${t('settings.security')}</h2>
          <p class="settings-hint" style="margin-bottom:1.25rem">Update the password for your account.</p>
          <form id="cp-form" class="form-stack" novalidate>
            <div>
              <label for="current-pw">${t('auth.current_password')}</label>
              <input type="password" id="current-pw" autocomplete="current-password" required />
            </div>
            <div>
              <label for="new-pw">${t('auth.new_password')}</label>
              <input type="password" id="new-pw" autocomplete="new-password" minlength="8" required />
            </div>
            <div>
              <label for="confirm-pw">${t('auth.confirm_password')}</label>
              <input type="password" id="confirm-pw" autocomplete="new-password" minlength="8" required />
            </div>
            <p id="cp-error" class="error-msg" aria-live="polite"></p>
            <p id="cp-success" class="success-msg hidden" aria-live="polite">Password changed successfully.</p>
            <div class="modal-actions" style="margin-top:.5rem">
              <button type="submit" class="btn btn-primary" id="btn-cp-submit">${t('auth.change_password')}</button>
            </div>
          </form>
        </section>

        <!-- ── GDPR / Privacy ────────────────────────────────── -->
        <section class="card settings-section settings-section--gdpr" aria-labelledby="sec-gdpr">
          <h2 id="sec-gdpr" class="settings-section__title">${t('settings.gdpr')}</h2>

          <div class="gdpr-row">
            <div>
              <span class="settings-label">${t('settings.gdpr_export_btn')}</span>
              <span class="settings-hint">${t('settings.gdpr_export_desc')}</span>
            </div>
            <button type="button" class="btn btn-secondary" id="btn-export">${t('settings.gdpr_export_btn')}</button>
          </div>

          <div class="gdpr-row">
            <div>
              <span class="settings-label">${t('settings.gdpr_cookie_btn')}</span>
              <span class="settings-hint">${t('settings.gdpr_cookie_desc')}</span>
            </div>
            <button type="button" class="btn btn-secondary" id="btn-cookie-withdraw">${t('settings.gdpr_cookie_btn')}</button>
          </div>

          <div class="gdpr-row gdpr-row--danger">
            <div>
              <span class="settings-label">${t('settings.gdpr_delete_btn')}</span>
              <span class="settings-hint">${t('settings.gdpr_delete_desc')}</span>
            </div>
            <button type="button" class="btn btn-danger" id="btn-delete-account">${t('settings.gdpr_delete_btn')}</button>
          </div>

          <!-- Inline delete confirmation (hidden by default) -->
          <div id="delete-confirm-box" class="gdpr-confirm hidden" role="alert">
            <p class="gdpr-confirm__title">${t('settings.gdpr_delete_confirm_title')}</p>
            <p class="gdpr-confirm__body">${t('settings.gdpr_delete_confirm_body')}</p>
            <input type="text" id="delete-confirm-input" class="gdpr-confirm__input"
              placeholder="${t('settings.gdpr_delete_confirm_word')}" autocomplete="off" />
            <div class="modal-actions" style="margin-top:.75rem">
              <button type="button" class="btn btn-secondary" id="btn-delete-cancel">${t('schedule.cancel')}</button>
              <button type="button" class="btn btn-danger" id="btn-delete-confirm" disabled>${t('settings.gdpr_delete_btn')}</button>
            </div>
            <p id="delete-error" class="error-msg" aria-live="polite"></p>
          </div>
        </section>

      </div>

      <!-- Global save toast -->
      <div id="settings-toast" class="toast toast--hidden" role="status" aria-live="polite">Settings saved.</div>
    </main>
  `;

  // ── DOM refs ───────────────────────────────────────────────

  const accountForm  = container.querySelector<HTMLFormElement>('#account-form')!;
  const accountError = container.querySelector<HTMLParagraphElement>('#account-error')!;
  const langSelect   = container.querySelector<HTMLSelectElement>('#lang-select')!;

  const prefForm     = container.querySelector<HTMLFormElement>('#pref-form')!;
  const tzEl         = container.querySelector<HTMLSelectElement>('#timezone')!;
  const localeEl     = container.querySelector<HTMLInputElement>('#locale')!;
  const dateFmtEl    = container.querySelector<HTMLSelectElement>('#date-format')!;
  const timeFmtEl    = container.querySelector<HTMLSelectElement>('#time-format')!;
  const weekStartEl  = container.querySelector<HTMLSelectElement>('#week-start')!;
  const prefErrorEl  = container.querySelector<HTMLParagraphElement>('#pref-error')!;
  const prefSaveBtn  = container.querySelector<HTMLButtonElement>('#btn-save-prefs')!;

  const cpForm       = container.querySelector<HTMLFormElement>('#cp-form')!;
  const cpError      = container.querySelector<HTMLParagraphElement>('#cp-error')!;
  const cpSuccess    = container.querySelector<HTMLParagraphElement>('#cp-success')!;
  const cpSubmit     = container.querySelector<HTMLButtonElement>('#btn-cp-submit')!;
  const currentPwEl  = container.querySelector<HTMLInputElement>('#current-pw')!;
  const newPwEl      = container.querySelector<HTMLInputElement>('#new-pw')!;
  const confirmPwEl  = container.querySelector<HTMLInputElement>('#confirm-pw')!;

  const toast        = container.querySelector<HTMLElement>('#settings-toast')!;
  const paperSaved   = container.querySelector<HTMLElement>('#paper-saved')!;

  // GDPR
  const btnExport          = container.querySelector<HTMLButtonElement>('#btn-export')!;
  const btnCookieWithdraw  = container.querySelector<HTMLButtonElement>('#btn-cookie-withdraw')!;
  const btnDeleteAccount   = container.querySelector<HTMLButtonElement>('#btn-delete-account')!;
  const deleteConfirmBox   = container.querySelector<HTMLElement>('#delete-confirm-box')!;
  const deleteConfirmInput = container.querySelector<HTMLInputElement>('#delete-confirm-input')!;
  const btnDeleteConfirm   = container.querySelector<HTMLButtonElement>('#btn-delete-confirm')!;
  const btnDeleteCancel    = container.querySelector<HTMLButtonElement>('#btn-delete-cancel')!;
  const deleteError        = container.querySelector<HTMLParagraphElement>('#delete-error')!;
  const confirmWord        = t('settings.gdpr_delete_confirm_word');

  let toastTimer: number | null = null;

  // ── Toast helper ───────────────────────────────────────────

  function showToast(msg = 'Settings saved.'): void {
    toast.textContent = msg;
    toast.classList.remove('toast--hidden');
    toast.classList.add('toast--visible');
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('toast--visible');
      toast.classList.add('toast--hidden');
      toastTimer = null;
    }, 1800);
  }

  // ── Seed date/time selects ─────────────────────────────────

  tzEl.value       = initialTz;
  dateFmtEl.value  = initialDateFmt;
  timeFmtEl.value  = initialTimeFmt;
  weekStartEl.value = String(initialWeekStart);

  // Lazy-load timezone list (heavy module) to keep bundle small.
  try {
    const { collectTimezones, getBrowserTimeZone } = await import('@/utils/timezone');
    tzEl.innerHTML = collectTimezones(session.user?.timezone)
      .map((tz) => `<option value="${tz.replaceAll('"', '&quot;')}">${tz}</option>`)
      .join('');
    tzEl.value = session.user?.timezone || getBrowserTimeZone();
  } catch {
    // Keep the initial fallback option when the module fails.
  }

  // ── Account form ───────────────────────────────────────────

  accountForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    accountError.textContent = '';
    const lang = langSelect.value as 'en' | 'da';
    try {
      await api.patch('/users/me', { language: lang });
      await setLanguage(lang);
      await session.fetch();
      window.dispatchEvent(new CustomEvent('nav:update'));
      showToast('Account settings saved.');
    } catch (err) {
      accountError.textContent = err instanceof ApiError ? err.message : t('errors.generic');
    }
  });

  // ── Theme picker ───────────────────────────────────────────

  container.querySelectorAll<HTMLButtonElement>('.theme-picker__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset['theme'] as 'light' | 'dark';
      const currentlyDark = (localStorage.getItem('theme') ?? 'dark') === 'dark';
      if ((target === 'dark') !== currentlyDark) theme.toggle();
      container.querySelectorAll<HTMLButtonElement>('.theme-picker__btn').forEach((b) => {
        b.classList.toggle('theme-picker__btn--active', b === btn);
      });
    });
  });

  // ── Paper size ─────────────────────────────────────────────

  container.querySelectorAll<HTMLInputElement>('input[name="paper-size"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      localStorage.setItem(PRINT_PAGE_SIZE_KEY, radio.value);
      container.querySelectorAll('.paper-size-opt').forEach((el) =>
        el.classList.toggle('paper-size-opt--active', el === radio.closest('.paper-size-opt')));
      paperSaved.classList.remove('hidden');
      setTimeout(() => paperSaved.classList.add('hidden'), 1800);
    });
  });

  // ── Date & Time form ───────────────────────────────────────

  prefForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    prefErrorEl.textContent = '';
    prefSaveBtn.disabled = true;
    const timezone    = tzEl.value.trim()       || 'UTC';
    const locale      = localeEl.value.trim()   || navigator.language || 'en-GB';
    const date_format = dateFmtEl.value;
    const time_format = timeFmtEl.value;
    const week_start  = Number.parseInt(weekStartEl.value, 10) || 1;
    try {
      await api.patch('/users/me', { timezone, locale, date_format, time_format, week_start });
      await session.fetch();
      window.localStorage.setItem(TIMEZONE_STORAGE_KEY, timezone);
      showToast('Date & time preferences saved.');
    } catch (err) {
      prefErrorEl.textContent = err instanceof ApiError ? err.message : t('errors.generic');
    } finally {
      prefSaveBtn.disabled = false;
    }
  });

  // ── Change password form ───────────────────────────────────

  cpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    cpError.textContent = '';
    cpSuccess.classList.add('hidden');
    const cur = currentPwEl.value.trim();
    const nw  = newPwEl.value.trim();
    const con = confirmPwEl.value.trim();
    if (!cur)          { cpError.textContent = 'Current password is required.'; return; }
    if (nw !== con)    { cpError.textContent = 'Passwords do not match.'; return; }
    if (nw.length < 8) { cpError.textContent = 'Password must be at least 8 characters.'; return; }
    cpSubmit.disabled = true;
    try {
      await api.post('/auth/change-password', { password: nw, current_password: cur });
      await session.fetch();
      cpSuccess.classList.remove('hidden');
      cpForm.reset();
      showToast('Password changed.');
    } catch (err) {
      cpError.textContent = err instanceof ApiError ? err.message : t('errors.generic');
    } finally {
      cpSubmit.disabled = false;
    }
  });

  // ── GDPR: Export ──────────────────────────────────────────

  btnExport.addEventListener('click', async () => {
    const orig = btnExport.textContent!;
    btnExport.disabled = true;
    btnExport.textContent = t('settings.gdpr_exporting');
    try {
      const data = await api.get<unknown>('/users/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `carlscalendar-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Export downloaded.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t('errors.generic'));
    } finally {
      btnExport.disabled = false;
      btnExport.textContent = orig;
    }
  });

  // ── GDPR: Cookie consent withdrawal ───────────────────────

  btnCookieWithdraw.addEventListener('click', async () => {
    const { withdrawConsent } = await import('@/components/CookieConsent');
    await withdrawConsent();
  });

  // ── GDPR: Delete account ──────────────────────────────────

  btnDeleteAccount.addEventListener('click', () => {
    deleteConfirmBox.classList.remove('hidden');
    deleteConfirmInput.value = '';
    btnDeleteConfirm.disabled = true;
    deleteConfirmInput.focus();
    btnDeleteAccount.disabled = true;
  });

  btnDeleteCancel.addEventListener('click', () => {
    deleteConfirmBox.classList.add('hidden');
    btnDeleteAccount.disabled = false;
    deleteError.textContent = '';
  });

  deleteConfirmInput.addEventListener('input', () => {
    btnDeleteConfirm.disabled = deleteConfirmInput.value.trim() !== confirmWord;
  });

  btnDeleteConfirm.addEventListener('click', async () => {
    deleteError.textContent = '';
    btnDeleteConfirm.disabled = true;
    btnDeleteConfirm.textContent = t('settings.gdpr_deleting');
    try {
      await api.delete('/users/me');
      session.clear();
      window.dispatchEvent(new CustomEvent('auth:change'));
      router.replace('/');
    } catch (err) {
      deleteError.textContent = err instanceof ApiError ? err.message : t('errors.generic');
      btnDeleteConfirm.disabled = false;
      btnDeleteConfirm.textContent = t('settings.gdpr_delete_btn');
    }
  });
}
