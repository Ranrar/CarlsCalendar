import { t } from '@/i18n/i18n';

type PlaceholderSpec = {
  titleKey: string;
  hintKey?: string;
};

const PLACEHOLDERS: Record<string, PlaceholderSpec> = {
  '/daily-schedule': { titleKey: 'nav.daily_schedule' },
  '/choice-board': { titleKey: 'nav.choice_board' },
  '/routine-steps': { titleKey: 'nav.routine_steps' },
  '/emotion-cards': { titleKey: 'nav.emotion_cards' },
  '/reward-tracker': { titleKey: 'nav.reward_tracker' },
  '/aac-board': { titleKey: 'nav.aac_board' },
};

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function render(container: HTMLElement): Promise<void> {
  const path = window.location.pathname;
  const spec = PLACEHOLDERS[path];

  const title = spec ? t(spec.titleKey) : t('common.coming_soon');
  const hint = spec?.hintKey ? t(spec.hintKey) : t('common.coming_soon_desc');

  container.innerHTML = `
    <main class="container page-content">
      <div class="page-header">
        <h1>${escapeHtml(title)}</h1>
      </div>
      <section class="card" style="padding:1rem">
        <div class="empty-state">
          <p style="max-width:60ch">${escapeHtml(hint)}</p>
          <p style="max-width:60ch;color:var(--text-muted);margin-top:.5rem">
            ${escapeHtml(t('common.phase0_note'))}
          </p>
        </div>
      </section>
    </main>
  `;
}
