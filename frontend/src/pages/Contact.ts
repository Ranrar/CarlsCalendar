import { t } from '@/i18n/i18n';
import { api, ApiError } from '@/api/client';

export function render(container: HTMLElement): void {
  container.innerHTML = `
    <main class="container page-content">
      <h1>${t('nav.contact')}</h1>
      <p class="page-lead">Have a question or need help? Send us a message and we’ll get back to you shortly.</p>
      <form id="contact-form" class="card form-stack" style="margin-top:1.5rem">
        <div>
          <label for="name">Name</label>
          <input id="name" type="text" required />
        </div>
        <div>
          <label for="email">${t('auth.email')}</label>
          <input id="email" type="email" required />
        </div>
        <div>
          <label for="message">Message</label>
          <textarea id="message" rows="5" required></textarea>
        </div>
        <button type="submit" class="btn btn-primary">Send message</button>
        <p id="form-status" class="status-msg" aria-live="polite"></p>
      </form>
    </main>
  `;

  const form = container.querySelector<HTMLFormElement>('#contact-form')!;
  const status = container.querySelector<HTMLParagraphElement>('#form-status')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    btn.disabled = true; status.textContent = '';
    try {
      await api.post('/contact', {
        name: (form.querySelector<HTMLInputElement>('#name')!).value,
        email: (form.querySelector<HTMLInputElement>('#email')!).value,
        message: (form.querySelector<HTMLTextAreaElement>('#message')!).value,
      });
      status.textContent = 'Message sent! We will get back to you shortly.';
      form.reset();
    } catch (err) {
      status.textContent = err instanceof ApiError ? err.message : t('errors.generic');
      status.style.color = '#e05555';
    } finally { btn.disabled = false; }
  });
}
