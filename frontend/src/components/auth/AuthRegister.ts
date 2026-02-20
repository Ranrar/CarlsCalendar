import { t } from '@/i18n/i18n';
import { api, ApiError } from '@/api/client';
import { router } from '@/router';

export function render(container: HTMLElement): void {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card card">
        <h1>${t('auth.register')}</h1>
        <form id="register-form" class="form-stack">
          <div>
            <label for="email">${t('auth.email')}</label>
            <input id="email" type="email" autocomplete="email" required />
          </div>
          <div>
            <label for="password">${t('auth.password')}</label>
            <input id="password" type="password" autocomplete="new-password" required />
          </div>
          <div>
            <label for="confirm">${t('auth.confirm_password')}</label>
            <input id="confirm" type="password" autocomplete="new-password" required />
          </div>
          <button type="submit" class="btn btn-primary">${t('auth.register')}</button>
          <p id="error-msg" class="error-msg" aria-live="polite"></p>
        </form>
        <div class="form-footer">
          <span>Already have an account? <a href="/login">${t('auth.login')}</a></span>
        </div>
      </div>
    </div>
  `;

  const form = container.querySelector<HTMLFormElement>('#register-form')!;
  const errorMsg = container.querySelector<HTMLParagraphElement>('#error-msg')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.textContent = '';
    const email = form.querySelector<HTMLInputElement>('#email')!.value;
    const password = form.querySelector<HTMLInputElement>('#password')!.value;
    const confirm = form.querySelector<HTMLInputElement>('#confirm')!.value;

    if (password !== confirm) {
      errorMsg.textContent = 'Passwords do not match.';
      return;
    }

    try {
      await api.post('/auth/register', { email, password });
      router.replace('/verify-email');
    } catch (err) {
      errorMsg.textContent = err instanceof ApiError ? err.message : t('errors.generic');
    }
  });
}
