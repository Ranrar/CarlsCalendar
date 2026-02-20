import { t, setLanguage } from '@/i18n/i18n';
import { router } from '@/router';
import { theme } from '@/utils/theme';

/** Build the UIverse sun/moon toggle markup */
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

/**
 * Renders the top navigation bar into `target`.
 * Call once during app init or re-render after auth state changes.
 */
export function renderNav(target: HTMLElement, isLoggedIn: boolean, role?: 'parent' | 'child' | 'admin'): void {
  const currentLang = localStorage.getItem('lang') ?? 'en';
  const isDark = (localStorage.getItem('theme') ?? 'dark') === 'dark';

  const parentLinks = isLoggedIn && role !== 'child' ? `
    <a href="/dashboard">${t('nav.dashboard')}</a>
    <a href="/children">${t('nav.children')}</a>
    <a href="/schedules">${t('nav.schedules')}</a>
    <a href="/calendar">${t('nav.calendar')}</a>
  ` : '';

  const childLinks = isLoggedIn && role === 'child' ? `
    <a href="/my-calendar">${t('nav.calendar')}</a>
  ` : '';

  const authLinks = isLoggedIn
    ? `<button id="nav-logout" class="btn btn-secondary" style="padding:.375rem .875rem">${t('nav.logout')}</button>`
    : `<a class="btn btn-secondary" href="/login" style="padding:.375rem .875rem">${t('nav.login')}</a>`;

  target.innerHTML = `
    <nav class="nav" aria-label="Main navigation">
      <div class="container nav__inner">
        <a class="nav__brand" href="/">${t('app.name')}</a>
        <div class="nav__links">
          ${parentLinks}
          ${childLinks}
          <a href="/about">${t('nav.about')}</a>
        </div>
        <div class="nav__actions">
          <div class="lang-switcher" role="group" aria-label="Language">
            <button class="lang-btn ${currentLang === 'en' ? 'lang-btn--active' : ''}" data-lang="en">EN</button>
            <button class="lang-btn ${currentLang === 'da' ? 'lang-btn--active' : ''}" data-lang="da">DA</button>
          </div>
          ${themeToggleHtml(isDark)}
          ${authLinks}
        </div>
      </div>
    </nav>
  `;

  // Theme toggle — animate only on real user interaction (not on nav re-renders)
  target.querySelector<HTMLInputElement>('#theme-toggle')?.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const sunMoon = target.querySelector<HTMLElement>('.sun-moon');
    if (sunMoon) {
      // Remove leftover classes first and force a reflow so re-adding works
      sunMoon.classList.remove('to-moon', 'to-sun');
      void sunMoon.offsetWidth; // reflow
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
      window.dispatchEvent(new CustomEvent('nav:update'));
      // Re-render the current page so translated strings update
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  });

  // Logout
  target.querySelector('#nav-logout')?.addEventListener('click', async () => {
    try {
      const { api } = await import('@/api/client');
      await api.post('/auth/logout', {});
    } finally {
      const { session } = await import('@/auth/session');
      session.clear();
      router.replace('/login');
    }
  });
}
