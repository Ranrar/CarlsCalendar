import { router } from '@/router';
import { api, ApiError } from '@/api/client';

export function render(container: HTMLElement): void {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card card" style="text-align:center">
        <span style="font-size:3rem;display:block;margin-bottom:1rem">📷</span>
        <h1>Scan QR code</h1>
        <p style="margin-top:.5rem">
          Point your camera at your QR code, or type the token manually below.
        </p>
        <p class="muted" style="margin-top:.25rem">
          QR tokens are created and shown by a parent in the child management page.
        </p>
        <form id="qr-form" class="form-stack" style="margin-top:1.5rem;text-align:left">
          <div>
            <label for="token">QR Token</label>
            <input id="token" type="text" autocomplete="off" required />
          </div>
          <button type="submit" class="btn btn-primary">Open calendar</button>
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

    // Scanned QR flow: pair immediately and open child calendar.
    (async () => {
      try {
        await api.post('/auth/child/pair', { token: tokenParam.trim() });
        router.replace('/my-calendar');
      } catch (err) {
        const errorMsg = container.querySelector<HTMLParagraphElement>('#error-msg')!;
        errorMsg.textContent = err instanceof ApiError ? err.message : 'Unable to pair device.';
      }
    })();
  }

  const form = container.querySelector<HTMLFormElement>('#qr-form')!;
  const errorMsg = container.querySelector<HTMLParagraphElement>('#error-msg')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.textContent = '';
    const token = form.querySelector<HTMLInputElement>('#token')!.value.trim();
    if (!token) {
      errorMsg.textContent = 'Please enter a QR token.';
      return;
    }

    try {
      await api.post('/auth/child/pair', { token });
      router.replace('/my-calendar');
    } catch (err) {
      errorMsg.textContent = err instanceof ApiError ? err.message : 'Unable to pair device.';
    }
  });
}
