import '@/styles/global.css';
import '@/styles/print.css';
import { initI18n } from '@/i18n/i18n';
import { router } from '@/router';
import { renderNav } from '@/components/Nav';
import { session } from '@/auth/session';
import { theme } from '@/utils/theme';

function refreshNav(): void {
  const mount = document.getElementById('nav-mount');
  if (mount) renderNav(mount, session.isLoggedIn, session.role);
}

async function bootstrap(): Promise<void> {
  theme.init();
  await initI18n();
  await session.fetch();

  const app = document.getElementById('app')!;
  const year = new Date().getFullYear();

  app.innerHTML = `
    <div id="nav-mount"></div>
    <div id="page"></div>
    <footer class="footer">
      <div class="container footer__inner">
        <span>© ${year} <a href="https://www.skovrasmussen.com" target="_blank">Kim Skov Rasmussen</a></span>
        <nav aria-label="Footer">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/contact">Contact</a>
        </nav>
      </div>
    </footer>
  `;

  refreshNav();
  window.addEventListener('nav:update', refreshNav);
  router.init();
}

bootstrap().catch(console.error);
