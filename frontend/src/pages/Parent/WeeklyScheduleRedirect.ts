import { t } from '@/i18n/i18n';
import { router } from '@/router';

export async function render(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <main class="container page-content">
      <div class="empty-state">
        <p>${t('calendar.moved_to_weeklyschedule')}</p>
      </div>
    </main>
  `;

  router.replace('/weeklyschedule');
}
