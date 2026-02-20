/**
 * Client-side router — history API based.
 * Pages are lazy-loaded TypeScript modules.
 * Each page module must export: `render(container: HTMLElement) => void`
 */

export type PageModule = {
  render: (container: HTMLElement) => void | Promise<void>;
};

type Route = {
  path: RegExp;
  load: () => Promise<PageModule>;
  requiresAuth?: boolean;
  requiresRole?: 'parent' | 'child' | 'admin';
};

const routes: Route[] = [
  // Public
  { path: /^\/$/, load: () => import('@/pages/Landing') },
  { path: /^\/about$/, load: () => import('@/pages/About') },
  { path: /^\/contact$/, load: () => import('@/pages/Contact') },
  { path: /^\/privacy$/, load: () => import('@/pages/LegalPrivacy') },
  { path: /^\/terms$/, load: () => import('@/pages/LegalTerms') },

  // Auth
  { path: /^\/login$/, load: () => import('@/components/auth/AuthLogin') },
  { path: /^\/register$/, load: () => import('@/components/auth/AuthRegister') },
  { path: /^\/verify-email$/, load: () => import('@/components/auth/AuthVerifyEmail') },
  { path: /^\/reset-password$/, load: () => import('@/components/auth/AuthResetPassword') },
  { path: /^\/qr-login$/, load: () => import('@/components/auth/AuthQrLogin') },

  // Parent
  { path: /^\/dashboard$/, load: () => import('@/pages/Parent/Dashboard'), requiresAuth: true },
  { path: /^\/children$/, load: () => import('@/pages/Parent/Children'), requiresAuth: true },
  { path: /^\/schedules$/, load: () => import('@/pages/Parent/Schedules'), requiresAuth: true },
  { path: /^\/calendar$/, load: () => import('@/pages/Parent/Calendar'), requiresAuth: true },

  // Child
  { path: /^\/my-calendar$/, load: () => import('@/pages/Child/Calendar'), requiresAuth: true },

  // Admin
  { path: /^\/admin$/, load: () => import('@/pages/Admin/Dashboard'), requiresAuth: true, requiresRole: 'admin' },
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

async function navigate(path: string): Promise<void> {
  // Auth routes open as modal overlay — don't replace page content
  if (AUTH_MODAL_PATHS.includes(path)) {
    const { openAuthModal } = await import('@/components/AuthModal');
    openAuthModal(path === '/login' ? 'login' : 'register');
    return;
  }

  // Any other navigation closes the auth modal if open
  const { closeAuthModal } = await import('@/components/AuthModal');
  closeAuthModal(false);

  const container = appContainer();
  container.innerHTML = '';

  const matched = routes.find((r) => r.path.test(path)) ?? NOT_FOUND_ROUTE;

  // Route guards
  if (matched.requiresAuth) {
    const { session } = await import('@/auth/session');
    if (!session.isLoggedIn) { router.replace('/login'); return; }
    if (matched.requiresRole && session.role !== matched.requiresRole) {
      router.replace('/'); return;
    }
  }

  try {
    const page = await matched.load();
    await page.render(container);
  } catch (err) {
    console.error('Router: failed to load page', path, err);
    container.innerHTML = `<p style="color:red;padding:2rem">Failed to load page. Please try again.</p>`;
  }

  window.dispatchEvent(new CustomEvent('nav:update'));
}

function handlePopState(): void {
  navigate(location.pathname).catch(console.error);
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
    navigate(location.pathname).catch(console.error);
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
