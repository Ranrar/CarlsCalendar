import { api, ApiError } from '@/api/client';
import { router } from '@/router';
import { t } from '@/i18n/i18n';

export function render(container: HTMLElement): void {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card card" style="text-align:center">
        <span style="font-size:3rem;display:block;margin-bottom:1rem">📷</span>
        <h1>Scan QR code</h1>
        <p style="margin-top:.5rem">
          Point your camera at your QR code, or type the token manually below.
        </p>
        <form id="qr-form" class="form-stack" style="margin-top:1.5rem;text-align:left">
          <div>
            <label for="token">QR Token</label>
            <input id="token" type="text" autocomplete="off" required />
          </div>
          <button type="submit" class="btn btn-primary">Log in</button>
          <p id="error-msg" class="error-msg" aria-live="polite"></p>
        </form>
        <div class="form-footer" style="align-items:center">
          <a href="/login">Back to login</a>
        </div>
      </div>
    </div>
  `;

  const params = new URLSearchParams(location.search);
  const tokenParam = params.get('token');
  if (tokenParam) {
    container.querySelector<HTMLInputElement>('#token')!.value = tokenParam;
  }

  const form = container.querySelector<HTMLFormElement>('#qr-form')!;
  const errorMsg = container.querySelector<HTMLParagraphElement>('#error-msg')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.textContent = '';
    const token = form.querySelector<HTMLInputElement>('#token')!.value;

    try {
      await api.post('/auth/qr-login', { token });
      router.replace('/my-calendar');
    } catch (err) {
      errorMsg.textContent = err instanceof ApiError ? err.message : t('errors.generic');
    }
  });
}
