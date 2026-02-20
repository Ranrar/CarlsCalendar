import { t } from '@/i18n/i18n';
import { api, ApiError } from '@/api/client';

export function render(container: HTMLElement): void {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card card">
        <h1>${t('auth.reset_password')}</h1>
        <form id="reset-form" class="form-stack">
          <div>
            <label for="email">${t('auth.email')}</label>
            <input id="email" type="email" autocomplete="email" required />
          </div>
          <button type="submit" class="btn btn-primary">${t('auth.send_reset_link')}</button>
          <p id="status-msg" class="status-msg" aria-live="polite"></p>
        </form>
        <div class="form-footer">
          <a href="/login">Back to login</a>
        </div>
      </div>
    </div>
  `;

  const form = container.querySelector<HTMLFormElement>('#reset-form')!;
  const statusMsg = container.querySelector<HTMLParagraphElement>('#status-msg')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusMsg.textContent = '';
    const email = form.querySelector<HTMLInputElement>('#email')!.value;

    try {
      await api.post('/auth/forgot-password', { email });
      statusMsg.textContent = 'If that email is registered, a reset link has been sent.';
      form.reset();
    } catch (err) {
      statusMsg.textContent = err instanceof ApiError ? err.message : t('errors.generic');
    }
  });
}
