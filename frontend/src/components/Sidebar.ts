/**
 * Sidebar.ts — authenticated-app navigation.
 * Exports:
 *   renderSidebar(target, role, user)  — 240 px left sidebar
 *   renderAppTopbar(target)            — slim top bar (mobile/tablet hamburger + title)
 *   renderBottomNav(target, role)      — fixed bottom bar on mobile
 */

import { t, setLanguage } from '@/i18n/i18n';
import { router } from '@/router';
import { theme } from '@/utils/theme';
import { session } from '@/auth/session';
import { api } from '@/api/client';
import type { SessionUser } from '@/auth/session';

// ── Icons ────────────────────────────────────────────────────

function dashboardSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l-2 0l9 -9l9 9l-2 0" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" /><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6" /></svg>`;
}
function childrenSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h.5" /><path d="M18 22l3.35 -3.284a2.143 2.143 0 0 0 .005 -3.071a2.242 2.242 0 0 0 -3.129 -.006l-.224 .22l-.223 -.22a2.242 2.242 0 0 0 -3.128 -.006a2.143 2.143 0 0 0 -.006 3.071l3.355 3.296" /></svg>`;
}
function calendarSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10.5 21h-4.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v3" /><path d="M16 3v4" /><path d="M8 3v4" /><path d="M4 11h10" /><path d="M14 18a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M18 16.5v1.5l.5 .5" /></svg>`;
}
function schedulesSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><path d="M9 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2" /><path d="M9 12l.01 0" /><path d="M13 12l2 0" /><path d="M9 16l.01 0" /><path d="M13 16l2 0" /></svg>`;
}
function pictogramsSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" /></svg>`;
}
function visualSupportsSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 5a1 1 0 0 1 1 -1h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1z"/><path d="M13 5a1 1 0 0 1 1 -1h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1z"/><path d="M4 14a1 1 0 0 1 1 -1h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1z"/><path d="M13 14h7"/><path d="M13 18h7"/></svg>`;
}
function settingsSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065" /><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></svg>`;
}
function menuSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l16 0" /><path d="M4 12l16 0" /><path d="M4 18l16 0" /></svg>`;
}
function closeSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>`;
}
function logoutSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" /><path d="M9 12h12l-3 -3" /><path d="M18 15l3 -3" /></svg>`;
}
// ── Helpers ──────────────────────────────────────────────────

/** UIverse sun/moon animated theme toggle — reuses same IDs as public nav (shells never coexist). */
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

/** Sidebar navigation link — marks current page. */
function sLink(href: string, icon: string, label: string): string {
  const isActive = window.location.pathname === href
    || (href.length > 1 && window.location.pathname.startsWith(href + '/'));
  const cls = `sidebar__link${isActive ? ' sidebar__link--active' : ''}`;
  const current = isActive ? ' aria-current="page"' : '';
  return `<a class="${cls}" href="${href}"${current} title="${label}">${icon}<span class="sidebar__label">${label}</span></a>`;
}

/** Bottom nav link — marks current page. */
function bLink(href: string, icon: string, label: string): string {
  const isActive = window.location.pathname === href
    || (href.length > 1 && window.location.pathname.startsWith(href + '/'));
  const cls = `bottom-nav__item${isActive ? ' bottom-nav__item--active' : ''}`;
  const current = isActive ? ' aria-current="page"' : '';
  return `<a class="${cls}" href="${href}"${current}>${icon}<span>${label}</span></a>`;
}

function navLinksFor(role: SessionUser['role']): string {
  if (role === 'child') {
    return sLink('/my-calendar', calendarSvg(), t('nav.calendar'));
  }
  if (role === 'admin') {
    return [
      sLink('/admin',            dashboardSvg(),  t('nav.dashboard')),
      sLink('/admin/templates',  schedulesSvg(),  t('nav.templates')),
      sLink('/admin/visual-templates', visualSupportsSvg(), t('nav.visual_supports')),
      sLink('/admin/compliance', settingsSvg(),   t('nav.compliance')),
    ].join('');
  }
  return [
    sLink('/dashboard',  dashboardSvg(),   t('nav.dashboard')),
    sLink('/children',   childrenSvg(),    t('nav.children')),
    sLink('/schedules',  schedulesSvg(),   t('nav.schedules')),
    sLink('/visual-supports', visualSupportsSvg(), t('nav.visual_supports')),
    sLink('/calendar',   calendarSvg(),    t('nav.calendar')),
    sLink('/pictograms', pictogramsSvg(),  t('nav.pictograms')),
  ].join('');
}

function bottomLinksFor(role: SessionUser['role']): string {
  if (role === 'child') {
    return bLink('/my-calendar', calendarSvg(), t('nav.calendar'));
  }
  if (role === 'admin') {
    return [
      bLink('/admin',            dashboardSvg(),  t('nav.dashboard')),
      bLink('/admin/templates',  schedulesSvg(),  t('nav.templates')),
      bLink('/admin/visual-templates', visualSupportsSvg(), t('nav.visual_supports')),
      bLink('/admin/compliance', settingsSvg(),   t('nav.compliance')),
    ].join('');
  }
  return [
    bLink('/dashboard',  dashboardSvg(),   t('nav.dashboard')),
    bLink('/schedules',  schedulesSvg(),   t('nav.schedules')),
    bLink('/visual-supports', visualSupportsSvg(), t('nav.visual_supports')),
    bLink('/calendar',   calendarSvg(),    t('nav.calendar')),
    bLink('/pictograms', pictogramsSvg(),  t('nav.pictograms')),
    bLink('/settings',   settingsSvg(),    t('nav.settings')),
  ].join('');
}

/** Register all sidebar event handlers (lang, logout). */
function attachSidebarHandlers(target: HTMLElement): void {
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

  // Logout
  target.querySelector('#sidebar-logout')?.addEventListener('click', async () => {
    try {
      await api.post('/auth/logout', {});
    } finally {
      session.clear();
      window.dispatchEvent(new CustomEvent('auth:change'));
      router.replace('/');
    }
  });
}

// ── Public API ───────────────────────────────────────────────

/**
 * Renders the 240 px fixed left sidebar into `target`.
 * Called on every nav:update to reflect active link changes.
 */
export function renderSidebar(target: HTMLElement, role: SessionUser['role'], user?: SessionUser | null): void {
  const currentLang = localStorage.getItem('lang') ?? 'en';
  const initials = (user?.username ?? user?.email ?? 'U').slice(0, 1).toUpperCase();
  const displayName = user?.username ?? user?.email ?? 'User';

  target.innerHTML = `
    <nav class="sidebar__nav" aria-label="Application">
      ${navLinksFor(role)}
      <div class="sidebar__divider"></div>
      ${sLink('/settings', settingsSvg(), t('nav.settings'))}
    </nav>

    <div class="sidebar__footer">
      <div class="sidebar__controls">
        <div class="lang-switcher sidebar__lang" role="group" aria-label="Language">
          <button class="lang-btn ${currentLang === 'en' ? 'lang-btn--active' : ''}" data-lang="en">EN</button>
          <button class="lang-btn ${currentLang === 'da' ? 'lang-btn--active' : ''}" data-lang="da">DA</button>
        </div>
      </div>
      <div class="sidebar__user">
        <div class="sidebar__avatar" aria-hidden="true">${initials}</div>
        <span class="sidebar__username sidebar__label">${displayName}</span>
        <button id="sidebar-logout" class="sidebar__icon-btn sidebar__logout-btn" title="${t('nav.logout')}" aria-label="${t('nav.logout')}">
          ${logoutSvg()}
        </button>
      </div>
    </div>
  `;

  attachSidebarHandlers(target);
}

/**
 * Renders the slim top bar (used inside the authenticated app shell).
 * Shows hamburger (mobile/tablet), current page title, theme toggle on small screens.
 */
export function renderAppTopbar(target: HTMLElement, role?: SessionUser['role']): void {
  const isDark = (localStorage.getItem('theme') ?? 'dark') === 'dark';
  const brandHref = role === 'admin' ? '/admin' : role === 'child' ? '/my-calendar' : '/dashboard';

  target.innerHTML = `
    <div class="app-topbar__inner">
      <button class="app-topbar__menu-btn" id="topbar-sidebar-toggle"
        aria-label="Open navigation" aria-expanded="false" aria-controls="app-sidebar">
        ${menuSvg()}
      </button>
      <a class="app-topbar__brand" href="${brandHref}">
        <span class="app-topbar__brand-mark">CC</span>
        <span class="app-topbar__brand-text">${t('app.name')}</span>
      </a>
      <div class="app-topbar__actions">
        ${themeToggleHtml(isDark)}
      </div>
    </div>
    <!-- Overlay backdrop for mobile/tablet sidebar drawer -->
    <div class="sidebar-backdrop hidden" id="sidebar-backdrop" aria-hidden="true"></div>
  `;

  // Hamburger toggles sidebar overlay
  const toggle = target.querySelector<HTMLButtonElement>('#topbar-sidebar-toggle')!;
  const backdrop = target.querySelector<HTMLElement>('#sidebar-backdrop')!;
  const sidebar = document.getElementById('app-sidebar');

  const openDrawer = () => {
    sidebar?.classList.add('sidebar--open');
    document.body.classList.add('sidebar-drawer-open');
    backdrop.classList.remove('hidden');
    toggle.setAttribute('aria-expanded', 'true');
    // Replace hamburger with close icon
    toggle.innerHTML = closeSvg();
  };
  const closeDrawer = () => {
    sidebar?.classList.remove('sidebar--open');
    document.body.classList.remove('sidebar-drawer-open');
    backdrop.classList.add('hidden');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = menuSvg();
  };

  toggle.addEventListener('click', () => {
    if (sidebar?.classList.contains('sidebar--open')) closeDrawer();
    else openDrawer();
  });

  backdrop.addEventListener('click', closeDrawer);

  // Close drawer on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar?.classList.contains('sidebar--open')) closeDrawer();
  }, { once: false });

  // Close drawer when a nav link is clicked (route change)
  sidebar?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) closeDrawer();
  });

  // Theme toggle in topbar
  target.querySelector<HTMLInputElement>('#theme-toggle')?.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const sunMoon = (e.target as HTMLElement).closest('.switch')?.querySelector<HTMLElement>('.sun-moon');
    if (sunMoon) {
      sunMoon.classList.remove('to-moon', 'to-sun');
      void sunMoon.offsetWidth;
      sunMoon.classList.add(input.checked ? 'to-moon' : 'to-sun');
      sunMoon.addEventListener('animationend', () => sunMoon.classList.remove('to-moon', 'to-sun'), { once: true });
    }
    theme.toggle();
  });
}

/**
 * Renders the fixed bottom navigation bar into `target` (mobile only, shown via CSS).
 */
export function renderBottomNav(target: HTMLElement, role: SessionUser['role']): void {
  target.innerHTML = bottomLinksFor(role);
}
