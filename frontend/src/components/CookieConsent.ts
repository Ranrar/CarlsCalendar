/**
 * Cookie Consent Banner
 *
 * Uses `document.cookie` for instant boot-time check (no round-trip).
 * Choice is persisted server-side via POST /consent (tower-cookies).
 */

import { t } from '@/i18n/i18n';
import { api } from '@/api/client';

const CONSENT_COOKIE = 'cookie_consent';
const BANNER_ID       = 'cookie-banner';

/** Read consent value from document.cookie — no network call. */
export function getConsent(): 'accepted' | 'declined' | null {
  const match = document.cookie.match(/(?:^|;\s*)cookie_consent=([^;]+)/);
  if (!match) return null;
  const v = decodeURIComponent(match[1]!);
  return v === 'accepted' ? 'accepted' : v === 'declined' ? 'declined' : null;
}

/** Mount the cookie consent banner if consent has not yet been given. */
export function initCookieConsent(): void {
  if (getConsent() !== null) return;   // already decided — nothing to do

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.className = 'cookie-banner no-print';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-modal', 'false');
  banner.setAttribute('aria-label', 'Cookie consent');
  banner.innerHTML = `
    <div class="cookie-banner__inner">
      <div class="cookie-banner__text">
        <strong class="cookie-banner__title">${t('consent.title')}</strong>
        <p>${t('consent.body')} <a href="/privacy">${t('consent.privacy_link')}</a>.</p>
      </div>
      <div class="cookie-banner__actions">
        <button class="btn btn-secondary btn-sm" id="cb-decline">${t('consent.decline')}</button>
        <button class="btn btn-primary btn-sm"  id="cb-accept">${t('consent.accept')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(banner);

  // Animate in after next paint
  requestAnimationFrame(() => banner.classList.add('cookie-banner--visible'));

  async function choose(choice: 'accepted' | 'declined'): Promise<void> {
    // Optimistically hide the banner immediately
    banner.classList.remove('cookie-banner--visible');
    setTimeout(() => banner.remove(), 300);

    try {
      await api.post('/consent', { choice });
    } catch {
      // Non-fatal — user saw the content already; the cookie just won't be
      // persisted as HttpOnly on the server. On hard refresh they'll see the
      // banner again, which is acceptable.
    }
  }

  banner.querySelector('#cb-accept')?.addEventListener('click', () => choose('accepted'));
  banner.querySelector('#cb-decline')?.addEventListener('click', () => choose('declined'));
}

/**
 * Withdraw consent and reload — call this from the privacy policy page
 * "Withdraw cookie consent" link.
 */
export async function withdrawConsent(): Promise<void> {
  try {
    await api.delete('/consent');
  } finally {
    // Force banner to reappear
    document.cookie = `${CONSENT_COOKIE}=; max-age=0; path=/`;
    window.location.reload();
  }
}
