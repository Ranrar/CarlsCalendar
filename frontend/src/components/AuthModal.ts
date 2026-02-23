import { t } from '@/i18n/i18n';
import { api, ApiError } from '@/api/client';
import { session } from '@/auth/session';
import { router } from '@/router';

export type AuthMode = 'login' | 'register';

let _open = false;

/* ── helpers ──────────────────────────────────────────────── */

function getRoot(): HTMLElement {
  let el = document.getElementById('auth-modal-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'auth-modal-root';
    document.getElementById('app')!.appendChild(el);
  }
  return el;
}

function escHandler(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeAuthModal(true);
}

/* ── public API ───────────────────────────────────────────── */

export function closeAuthModal(goBack = false): void {
  if (!_open) return;
  _open = false;
  getRoot().innerHTML = '';
  document.removeEventListener('keydown', escHandler);
  if (goBack) history.back();
}

export function openAuthModal(mode: AuthMode): void {
  // If already open just switch the active tab
  if (_open) {
    _switchMode(mode);
    return;
  }
  _open = true;
  _render(mode);
  document.addEventListener('keydown', escHandler);
}

/* ── rendering ────────────────────────────────────────────── */

function _render(mode: AuthMode): void {
  const root = getRoot();
  root.innerHTML = `
    <div class="auth-modal" id="auth-modal-overlay" role="dialog" aria-modal="true" aria-label="${mode === 'login' ? t('auth.login') : t('auth.register')}">
      <div class="auth-modal__box card">
        <button class="auth-modal__close" id="auth-modal-close" aria-label="Close">&times;</button>

        <div class="auth-modal__tabs" role="tablist">
          <button class="auth-modal__tab ${mode === 'login' ? 'auth-modal__tab--active' : ''}"
            data-mode="login" role="tab">${t('auth.login')}</button>
          <button class="auth-modal__tab ${mode === 'register' ? 'auth-modal__tab--active' : ''}"
            data-mode="register" role="tab">${t('nav.register')}</button>
        </div>

        <div id="auth-modal-body"></div>
      </div>
    </div>
  `;

  _fillBody(mode);
  _attachEvents();
}

function _switchMode(mode: AuthMode): void {
  const root = getRoot();
  root.querySelectorAll<HTMLButtonElement>('.auth-modal__tab').forEach((btn) => {
    btn.classList.toggle('auth-modal__tab--active', btn.dataset['mode'] === mode);
  });
  history.replaceState(null, '', mode === 'login' ? '/login' : '/register');
  _fillBody(mode);
  _attachBodyEvents(mode);
}

function _fillBody(mode: AuthMode): void {
  const body = document.getElementById('auth-modal-body')!;
  body.innerHTML = mode === 'login' ? _loginHtml() : _registerHtml();
  _attachBodyEvents(mode);
}

/* ── form HTML ────────────────────────────────────────────── */

function _loginHtml(): string {
  return `
    <form id="auth-form" class="form-stack" novalidate>
      <p class="muted" style="margin-top:0;margin-bottom:.75rem">
        Parent/Admin login uses email + password. Child access is opened from a parent-generated QR code.
      </p>
      <div>
        <label for="am-email">${t('auth.email')}</label>
        <input id="am-email" type="email" autocomplete="email" required />
      </div>
      <div>
        <label for="am-password">${t('auth.password')}</label>
        <input id="am-password" type="password" autocomplete="current-password" required />
      </div>
      <button type="submit" class="btn btn-primary">${t('auth.login')}</button>
      <p id="auth-error" class="error-msg" aria-live="polite"></p>
    </form>
    <div class="form-footer">
      <a href="/reset-password">${t('auth.forgot_password')}</a>
    </div>`;
}

function _registerHtml(): string {
  return `
    <form id="auth-form" class="form-stack" novalidate>
      <div>
        <label for="am-reg-username">${t('auth.username')}</label>
        <input id="am-reg-username" type="text" autocomplete="username" required />
      </div>
      <div>
        <label for="am-email">${t('auth.email')}</label>
        <input id="am-email" type="email" autocomplete="email" required />
      </div>
      <div>
        <label for="am-password">${t('auth.password')}</label>
        <input id="am-password" type="password" autocomplete="new-password" required />
      </div>
      <div>
        <label for="am-confirm">${t('auth.confirm_password')}</label>
        <input id="am-confirm" type="password" autocomplete="new-password" required />
      </div>
      <button type="submit" class="btn btn-primary">${t('auth.register')}</button>
      <p id="auth-error" class="error-msg" aria-live="polite"></p>
    </form>`;
}

/* ── event wiring ─────────────────────────────────────────── */

function _attachEvents(): void {
  const root = getRoot();

  // Close on backdrop click
  root.querySelector<HTMLElement>('#auth-modal-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'auth-modal-overlay') closeAuthModal(true);
  });

  // Close button
  root.querySelector('#auth-modal-close')?.addEventListener('click', () => closeAuthModal(true));

  // Tab switcher
  root.querySelectorAll<HTMLButtonElement>('.auth-modal__tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset['mode'] as AuthMode;
      _switchMode(mode);
    });
  });
}

function _attachBodyEvents(mode: AuthMode): void {
  const form = document.querySelector<HTMLFormElement>('#auth-form');
  const errorEl = document.querySelector<HTMLParagraphElement>('#auth-error');
  if (!form || !errorEl) return;

  if (mode === 'login') {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      const btn = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
      btn.disabled = true;
      const email = (document.getElementById('am-email') as HTMLInputElement).value.trim();
      const password  = (document.getElementById('am-password') as HTMLInputElement).value;
      try {
        await api.post('/auth/login', { email, password });
        await session.fetch();
        closeAuthModal(false);
        window.dispatchEvent(new CustomEvent('auth:change'));
        const u = session.user;
        if (u?.role === 'child') router.replace('/my-calendar');
        else if (u?.role === 'admin') router.replace('/admin');
        else                          router.replace('/dashboard');
      } catch (err) {
        errorEl.textContent = err instanceof ApiError ? err.message : t('errors.generic');
      } finally {
        btn.disabled = false;
      }
    });
  } else {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      const btn     = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
      btn.disabled = true;
      const username  = (document.getElementById('am-reg-username') as HTMLInputElement).value.trim();
      const emailVal  = (document.getElementById('am-email') as HTMLInputElement).value.trim();
      const password  = (document.getElementById('am-password') as HTMLInputElement).value;
      const confirm   = (document.getElementById('am-confirm') as HTMLInputElement).value;

      if (!emailVal) {
        errorEl.textContent = 'Email is required.';
        btn.disabled = false;
        return;
      }

      if (password !== confirm) {
        errorEl.textContent = 'Passwords do not match.';
        btn.disabled = false;
        return;
      }
      try {
        const body: Record<string, unknown> = { username, password };
        body['email'] = emailVal;
        body['timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const locale = navigator.language || 'en-GB';
        const uses12h = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hour12 === true;
        body['locale'] = locale;
        body['date_format'] = 'locale';
        body['time_format'] = uses12h ? '12h' : '24h';
        body['week_start'] = locale.toLowerCase().startsWith('en-us') ? 7 : 1;
        await api.post('/auth/register', body);
        closeAuthModal(false);
        router.replace('/verify-email');
      } catch (err) {
        errorEl.textContent = err instanceof ApiError ? err.message : t('errors.generic');
      } finally {
        btn.disabled = false;
      }
    });
  }
}
