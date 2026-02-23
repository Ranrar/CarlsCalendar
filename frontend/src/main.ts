import '@/styles/global.css';
import '@/styles/pictograms.css';
import '@/styles/visual-support.css';
import '@/styles/print.css';
import { initI18n } from '@/i18n/i18n';
import { router } from '@/router';
import { renderNav } from '@/components/Nav';
import { renderSidebar, renderAppTopbar, renderBottomNav } from '@/components/Sidebar';
import { session } from '@/auth/session';
import { theme } from '@/utils/theme';
import { initCookieConsent } from '@/components/CookieConsent';

type LayoutMode = 'public' | 'app' | null;
let currentLayoutMode: LayoutMode = null;

const YEAR = new Date().getFullYear();
const FOOTER_HTML = `
  <footer class="footer">
    <div class="container footer__inner">
      <span>© ${YEAR} <a href="https://www.skovrasmussen.com" target="_blank">Kim Skov Rasmussen</a></span>
      <nav aria-label="Footer">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/contact">Contact</a>
      </nav>
    </div>
  </footer>
`;

/**
 * Rebuilds the root HTML shell when the auth state changes.
 * No-ops if the layout mode has not changed (prevents destroying #page mid-render).
 */
function buildShell(isLoggedIn: boolean): void {
  const newMode: LayoutMode = isLoggedIn ? 'app' : 'public';
  if (newMode === currentLayoutMode) return;
  currentLayoutMode = newMode;

  const app = document.getElementById('app')!;

  if (isLoggedIn) {
    app.innerHTML = `
      <div aria-live="polite" aria-atomic="true" id="page-announcement" class="sr-only"></div>
      <div id="app-shell" class="app-shell">
        <header id="topbar-mount" class="app-topbar"></header>
        <div class="app-body">
          <aside id="app-sidebar" class="sidebar" aria-label="Application navigation"></aside>
          <main id="page" tabindex="-1" class="app-content"></main>
        </div>
        <nav id="bottom-nav-mount" class="bottom-nav" aria-label="Mobile navigation"></nav>
      </div>
    `;
  } else {
    app.innerHTML = `
      <div aria-live="polite" aria-atomic="true" id="page-announcement" class="sr-only"></div>
      <div id="nav-mount"></div>
      <main id="page" tabindex="-1"></main>
      ${FOOTER_HTML}
    `;
  }
}

/** Re-renders just the nav/sidebar content — never rebuilds the shell HTML. */
function refreshNavContent(): void {
  if (session.isLoggedIn) {
    const sidebar   = document.getElementById('app-sidebar');
    const topbar    = document.getElementById('topbar-mount');
    const bottomNav = document.getElementById('bottom-nav-mount');
    if (sidebar)   renderSidebar(sidebar, session.role!, session.user);
    if (topbar)    renderAppTopbar(topbar, session.role!);
    if (bottomNav) renderBottomNav(bottomNav, session.role!);
  } else {
    const navMount = document.getElementById('nav-mount');
    if (navMount) renderNav(navMount);
  }
}

async function bootstrap(): Promise<void> {
  theme.init();

  // Keep the shell visible even if backend/session init fails.
  try {
    await session.fetch();
  } catch (err) {
    console.error('Session bootstrap failed', err);
  }

  try {
    await initI18n(session.user?.language ?? undefined);
  } catch (err) {
    console.error('i18n bootstrap failed', err);
  }

  buildShell(session.isLoggedIn);
  refreshNavContent();

  // nav:update — re-render nav content only (e.g. language change, theme toggle)
  window.addEventListener('nav:update', refreshNavContent);

  // auth:change — rebuild shell then re-render nav (fired on login / logout)
  window.addEventListener('auth:change', () => {
    buildShell(session.isLoggedIn);
    refreshNavContent();
  });

  router.init();
  initCookieConsent();
}

bootstrap().catch(console.error);
