import { t } from '@/i18n/i18n';

export function render(container: HTMLElement): void {
  container.innerHTML = `
    <main class="container page-content" style="text-align:center">
      <h1>404</h1>
      <p style="margin-top:1rem">${t('errors.not_found')}</p>
      <a class="btn btn-secondary" href="/" style="margin-top:1.5rem;display:inline-flex">${t('nav.home')}</a>
    </main>
  `;
}
