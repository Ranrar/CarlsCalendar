/**
 * Client-side router — history API based.
 * Pages are lazy-loaded TypeScript modules.
 * Each page module must export: `render(container: HTMLElement) => void`
 */

export type PageModule = {
  render: (container: HTMLElement) => void | Promise<void>;
};

import { session } from '@/auth/session';

const APP_NAME = 'Carls Calendar';

type Route = {
  path: RegExp;
  load: () => Promise<PageModule>;
  requiresAuth?: boolean;
  requiresRole?: 'parent' | 'child' | 'admin';
  title?: string;
};

const routes: Route[] = [
  // Public
  { path: /^\/$/, load: () => import('@/pages/Landing'), title: APP_NAME },
  { path: /^\/about$/, load: () => import('@/pages/About'), title: `About | ${APP_NAME}` },
  { path: /^\/contact$/, load: () => import('@/pages/Contact'), title: `Contact | ${APP_NAME}` },
  { path: /^\/privacy$/, load: () => import('@/pages/LegalPrivacy'), title: `Privacy Policy | ${APP_NAME}` },
  { path: /^\/terms$/, load: () => import('@/pages/LegalTerms'), title: `Terms | ${APP_NAME}` },

  // Auth
  { path: /^\/login$/, load: () => import('@/components/auth/AuthLogin'), title: `Log in | ${APP_NAME}` },
  { path: /^\/register$/, load: () => import('@/components/auth/AuthRegister'), title: `Register | ${APP_NAME}` },
  { path: /^\/verify-email$/, load: () => import('@/components/auth/AuthVerifyEmail'), title: `Verify Email | ${APP_NAME}` },
  { path: /^\/reset-password$/, load: () => import('@/components/auth/AuthResetPassword'), title: `Reset Password | ${APP_NAME}` },
  { path: /^\/qr-login$/, load: () => import('@/components/auth/AuthQrLogin'), title: `QR Login | ${APP_NAME}` },

  // Auth-protected (all roles)
  { path: /^\/settings$/, load: () => import('@/pages/Parent/Settings'), requiresAuth: true, title: `Settings | ${APP_NAME}` },

  // Parent
  { path: /^\/dashboard$/, load: () => import('@/pages/Parent/Dashboard'), requiresAuth: true, title: `Dashboard | ${APP_NAME}` },
  { path: /^\/children$/, load: () => import('@/pages/Parent/Children'), requiresAuth: true, requiresRole: 'parent', title: `Children | ${APP_NAME}` },
  { path: /^\/schedules$/, load: () => import('@/pages/Parent/Schedules'), requiresAuth: true, title: `Schedules | ${APP_NAME}` },
  { path: /^\/schedules\/[^/]+$/, load: () => import('@/pages/Parent/ScheduleDetail'), requiresAuth: true, title: `Schedule | ${APP_NAME}` },
  { path: /^\/templates$/, load: () => import('@/pages/Parent/Templates'), requiresAuth: true, title: `Templates | ${APP_NAME}` },
  { path: /^\/visual-supports$/, load: () => import('@/pages/Parent/VisualSupports'), requiresAuth: true, requiresRole: 'parent', title: `Visual Supports | ${APP_NAME}` },
  { path: /^\/calendar$/, load: () => import('@/pages/Parent/Calendar'), requiresAuth: true, title: `Calendar | ${APP_NAME}` },
  { path: /^\/pictograms$/, load: () => import('@/pages/Parent/PictogramLibrary'), requiresAuth: true, requiresRole: 'parent', title: `Pictograms | ${APP_NAME}` },

  // Child
  { path: /^\/my-calendar$/, load: () => import('@/pages/Child/Calendar'), title: `My Calendar | ${APP_NAME}` },

  // Admin
  { path: /^\/admin$/, load: () => import('@/pages/Admin/Dashboard'), requiresAuth: true, requiresRole: 'admin', title: `Admin | ${APP_NAME}` },
  { path: /^\/admin\/templates$/, load: () => import('@/pages/Admin/Templates'), requiresAuth: true, requiresRole: 'admin', title: `Templates | ${APP_NAME}` },
  { path: /^\/admin\/visual-templates$/, load: () => import('@/pages/Admin/VisualTemplates'), requiresAuth: true, requiresRole: 'admin', title: `Visual Templates | ${APP_NAME}` },
  { path: /^\/admin\/compliance$/, load: () => import('@/pages/Admin/Compliance'), requiresAuth: true, requiresRole: 'admin', title: `Compliance | ${APP_NAME}` },
];

const NOT_FOUND_ROUTE: Route = {
  path: /.*/,
  load: () => import('@/pages/NotFound'),
};

const appContainer = (): HTMLElement => {
  const el = document.getElementById('page');
  if (!el) throw new Error('#page element not found');
  return el;
};

const AUTH_MODAL_PATHS = ['/login', '/register'];

function parseRouteTarget(target: string): { pathname: string; search: string } {
  const url = new URL(target, window.location.origin);
  return { pathname: url.pathname, search: url.search };
}

async function navigate(path: string): Promise<void> {
  const { pathname, search } = parseRouteTarget(path);

  // Lock down qr-login discoverability:
  // - allow when opened by tokenized QR URL
  // - allow for logged-in parents
  // - otherwise redirect to login
  if (pathname === '/qr-login') {
    const token = new URLSearchParams(search).get('token')?.trim() ?? '';
    const isParent = session.isLoggedIn && session.role === 'parent';
    if (!token && !isParent) {
      router.replace('/login');
      return;
    }
  }

  // Auth routes open as modal overlay — don't replace page content
  if (AUTH_MODAL_PATHS.includes(pathname)) {
    const { openAuthModal } = await import('@/components/AuthModal');
    openAuthModal(pathname === '/login' ? 'login' : 'register');
    return;
  }

  // Any other navigation closes the auth modal if open
  const { closeAuthModal } = await import('@/components/AuthModal');
  closeAuthModal(false);

  const container = appContainer();
  container.innerHTML = '';

  const matched = routes.find((r) => r.path.test(pathname)) ?? NOT_FOUND_ROUTE;

  // Update document title
  document.title = matched.title ?? APP_NAME;

  // Route guards
  if (matched.requiresAuth) {
    if (!session.isLoggedIn) { router.replace('/login'); return; }
    if (matched.requiresRole && session.role !== matched.requiresRole) {
      router.replace('/'); return;
    }
  }

  try {
    const page = await matched.load();
    await page.render(container);
  } catch (err) {
    console.error('Router: failed to load page', pathname, err);
    container.innerHTML = `<p style="color:red;padding:2rem">Failed to load page. Please try again.</p>`;
  }

  // Move focus to page container so keyboard/screen-reader users land at new content
  container.focus({ preventScroll: false });

  // Announce the new page title to screen readers via the aria-live region
  const announcer = document.getElementById('page-announcement');
  if (announcer) announcer.textContent = document.title;

  window.dispatchEvent(new CustomEvent('nav:update'));
}

function handlePopState(): void {
  navigate(`${location.pathname}${location.search}`).catch(console.error);
}

export const router = {
  init(): void {
    // Intercept all <a> clicks
    document.addEventListener('click', (e) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('mailto')) return;
      e.preventDefault();
      router.push(href);
    });

    window.addEventListener('popstate', handlePopState);
    navigate(`${location.pathname}${location.search}`).catch(console.error);
  },

  push(path: string): void {
    history.pushState(null, '', path);
    navigate(path).catch(console.error);
  },

  replace(path: string): void {
    history.replaceState(null, '', path);
    navigate(path).catch(console.error);
  },
};
