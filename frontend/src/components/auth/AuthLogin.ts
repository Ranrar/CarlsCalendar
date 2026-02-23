import { t } from '@/i18n/i18n';
import { api, ApiError } from '@/api/client';
import { router } from '@/router';
import { session } from '@/auth/session';

export function render(container: HTMLElement): void {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card card">
        <h1>${t('auth.login')}</h1>
        <p class="muted" style="margin-top:.25rem;margin-bottom:1rem">
          Parent/Admin: sign in with email and password. Child access is started by scanning a QR code shown by a parent.
        </p>
        <form id="login-form" class="form-stack">
          <div>
            <label for="email">${t('auth.email')}</label>
            <input id="email" type="email" autocomplete="email" required />
          </div>
          <div>
            <label for="password">${t('auth.password')}</label>
            <input id="password" type="password" autocomplete="current-password" required />
          </div>
          <button type="submit" class="btn btn-primary">${t('auth.login')}</button>
          <p id="error-msg" class="error-msg" aria-live="polite"></p>
        </form>
        <div class="form-footer">
          <a href="/reset-password">${t('auth.forgot_password')}</a>
          <span>No account? <a href="/register">${t('nav.register')}</a></span>
        </div>
      </div>
    </div>
  `;

  const form = container.querySelector<HTMLFormElement>('#login-form')!;
  const errorMsg = container.querySelector<HTMLParagraphElement>('#error-msg')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.textContent = '';
    const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    btn.disabled = true;
    const email = form.querySelector<HTMLInputElement>('#email')!.value;
    const password = form.querySelector<HTMLInputElement>('#password')!.value;

    try {
      await api.post('/auth/login', { email, password });
      await session.fetch();
      window.dispatchEvent(new CustomEvent('auth:change'));
      router.replace('/dashboard');
    } catch (err) {
      errorMsg.textContent = err instanceof ApiError ? err.message : t('errors.generic');
    } finally {
      btn.disabled = false;
    }
  });
}
