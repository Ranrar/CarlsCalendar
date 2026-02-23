/**
 * Nav.ts — public top navigation bar (shown only when NOT logged in).
 * Authenticated pages use Sidebar.ts instead.
 */

import { t, setLanguage } from '@/i18n/i18n';
import { theme } from '@/utils/theme';
import { session } from '@/auth/session';
import { api } from '@/api/client';

// ── Icons ────────────────────────────────────────────────────

function aboutSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9h.01" /><path d="M11 12h1v4h1" /><path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9 -9 9s-9 -1.8 -9 -9s1.8 -9 9 -9z" /></svg>`;
}
function contactSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10z" /><path d="M3 7l9 6l9 -6" /></svg>`;
}
// ── Theme toggle ─────────────────────────────────────────────

/** UIverse sun/moon animated theme toggle */
function themeToggleHtml(isDark: boolean): string {
  return `
  <label class="switch" title="Toggle light/dark mode" aria-label="Toggle light/dark mode">
    <input id="theme-toggle" type="checkbox" ${isDark ? 'checked' : ''} />
    <div class="slider round">
      <div class="sun-moon">
        <svg id="moon-dot-1" class="moon-dot" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50"></circle></svg>
        <svg id="moon-dot-2" class="moon-dot" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50"></circle></svg>
        <svg id="moon-dot-3" class="moon-dot" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50"></circle></svg>
        <svg id="light-ray-1" class="light-ray" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50"></circle></svg>
        <svg id="light-ray-2" class="light-ray" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50"></circle></svg>
        <svg id="light-ray-3" class="light-ray" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50"></circle></svg>
        <svg id="cloud-1" class="cloud-dark" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50"></circle></svg>
        <svg id="cloud-2" class="cloud-dark" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50"></circle></svg>
        <svg id="cloud-3" class="cloud-dark" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50"></circle></svg>
        <svg id="cloud-4" class="cloud-light" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50"></circle></svg>
        <svg id="cloud-5" class="cloud-light" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50"></circle></svg>
        <svg id="cloud-6" class="cloud-light" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50"></circle></svg>
      </div>
      <div class="stars">
        <svg id="star-1" class="star" viewBox="0 0 20 20"><path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z"></path></svg>
        <svg id="star-2" class="star" viewBox="0 0 20 20"><path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z"></path></svg>
        <svg id="star-3" class="star" viewBox="0 0 20 20"><path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z"></path></svg>
        <svg id="star-4" class="star" viewBox="0 0 20 20"><path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z"></path></svg>
      </div>
    </div>
  </label>`;
}

function topNavLink(href: string, icon: string, label: string): string {
  const isActive = window.location.pathname === href;
  return `<a class="nav__link${isActive ? ' nav__link--active' : ''}" href="${href}"${isActive ? ' aria-current="page"' : ''}>${icon}<span>${label}</span></a>`;
}

/**
 * Renders the public top navigation bar into `target`.
 * Only used when the user is NOT authenticated (public pages).
 */
export function renderNav(target: HTMLElement): void {
  const currentLang = localStorage.getItem('lang') ?? 'en';
  const isDark = (localStorage.getItem('theme') ?? 'dark') === 'dark';

  target.innerHTML = `
    <nav class="nav" aria-label="Main navigation">
      <div class="container nav__inner">
        <a class="nav__brand" href="/">
          <span class="nav__brand-mark">CC</span>
          ${t('app.name')}
        </a>
        <div class="nav__links">
          ${topNavLink('/about', aboutSvg(), t('nav.about'))}
          ${topNavLink('/contact', contactSvg(), t('nav.contact'))}
        </div>
        <div class="nav__actions">
          <div class="lang-switcher" role="group" aria-label="Language">
            <button class="lang-btn ${currentLang === 'en' ? 'lang-btn--active' : ''}" data-lang="en">EN</button>
            <button class="lang-btn ${currentLang === 'da' ? 'lang-btn--active' : ''}" data-lang="da">DA</button>
          </div>
          ${themeToggleHtml(isDark)}
        </div>
      </div>
    </nav>
  `;

  // Animated theme toggle
  target.querySelector<HTMLInputElement>('#theme-toggle')?.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const sunMoon = target.querySelector<HTMLElement>('.sun-moon');
    if (sunMoon) {
      sunMoon.classList.remove('to-moon', 'to-sun');
      void sunMoon.offsetWidth;
      sunMoon.classList.add(input.checked ? 'to-moon' : 'to-sun');
      sunMoon.addEventListener('animationend', () => {
        sunMoon.classList.remove('to-moon', 'to-sun');
      }, { once: true });
    }
    theme.toggle();
  });

  // Language switcher
  target.querySelectorAll<HTMLButtonElement>('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const lang = btn.dataset['lang'] as 'en' | 'da';
      await setLanguage(lang);
      if (session.isLoggedIn) {
        api.patch('/users/me', { language: lang }).catch(() => { /* non-fatal */ });
      }
      window.dispatchEvent(new CustomEvent('nav:update'));
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  });
}
