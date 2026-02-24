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

type SidebarSectionKey = 'documents' | 'tools' | 'account' | 'information' | 'legacy';

const SIDEBAR_SECTIONS_STATE_KEY = 'sidebar.sections.state.v1';

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
function dailySvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 13c.325 2.532 1.881 4.781 4 6" /><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2" /><path d="M4 5v4h4" /><path d="M12 15h2a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-1a1 1 0 0 0 -1 1v1a1 1 0 0 0 1 1h2" /><path d="M18 15v2a1 1 0 0 0 1 1h1" /><path d="M21 15v6" /></svg>`;
}
function firstThenSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 5a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -10" /><path d="M17 17v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2h2" /><path d="M12 8a2 2 0 1 1 4 0c0 .591 -.417 1.318 -.816 1.858l-3.184 4.143l4 0" /></svg>`;
}
function choiceBoardSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 21v-4" /><path d="M12 13v-4" /><path d="M12 5v-2" /><path d="M10 21h4" /><path d="M8 5v4h11l2 -2l-2 -2l-11 0" /><path d="M14 13v4h-8l-2 -2l2 -2l8 0" /></svg>`;
}
function routineSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 4.55a8 8 0 0 0 -6 14.9m0 -4.45v5h-5" /><path d="M18.37 7.16l0 .01" /><path d="M13 19.94l0 .01" /><path d="M16.84 18.37l0 .01" /><path d="M19.37 15.1l0 .01" /><path d="M19.94 11l0 .01" /></svg>`;
}
function emotionCardsSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14.986 3.51a9 9 0 1 0 1.514 16.284c2.489 -1.437 4.181 -3.978 4.5 -6.794" /><path d="M10 10h.01" /><path d="M14 8h.01" /><path d="M12 15c1 -1.333 2 -2 3 -2" /><path d="M20 9v.01" /><path d="M20 6a2.003 2.003 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483" /></svg>`;
}
function rewardSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 21.5v-4.5" /><path d="M8 17h8v-10a4 4 0 1 0 -8 0v10" /><path d="M8 10.5l8 -3.5" /><path d="M8 14.5l8 -3.5" /></svg>`;
}
function aacBoardSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 8v-2a2 2 0 0 1 2 -2h2" /><path d="M4 16v2a2 2 0 0 0 2 2h2" /><path d="M16 4h2a2 2 0 0 1 2 2v2" /><path d="M16 20h2a2 2 0 0 0 2 -2v-2" /><path d="M12 12.5l4 -2.5" /><path d="M8 10l4 2.5v4.5l4 -2.5v-4.5l-4 -2.5l-4 2.5" /><path d="M8 10v4.5l4 2.5" /></svg>`;
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

function qrSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 4h6v6h-6z" /><path d="M14 4h6v6h-6z" /><path d="M4 14h6v6h-6z" /><path d="M14 14h2" /><path d="M20 14h0" /><path d="M14 18h2" /><path d="M18 18h2" /><path d="M14 20h6" /></svg>`;
}

function cardsSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 7a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z" /><path d="M8 9h8" /><path d="M8 13h6" /></svg>`;
}
function infoSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9h.01" /><path d="M11 12h1v4h1" /><path d="M12 20a8 8 0 1 0 0 -16a8 8 0 0 0 0 16" /></svg>`;
}
function chevronDownSvg(isExpanded: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="sidebar__section-chevron${isExpanded ? ' sidebar__section-chevron--expanded' : ''}"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg>`;
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

function defaultSidebarSectionState(): Record<SidebarSectionKey, boolean> {
  return {
    documents: true,
    tools: true,
    account: true,
    information: true,
    legacy: false,
  };
}

function readSidebarSectionState(): Record<SidebarSectionKey, boolean> {
  const defaults = defaultSidebarSectionState();
  try {
    const raw = localStorage.getItem(SIDEBAR_SECTIONS_STATE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Record<SidebarSectionKey, unknown>>;
    return {
      documents: typeof parsed.documents === 'boolean' ? parsed.documents : defaults.documents,
      tools: typeof parsed.tools === 'boolean' ? parsed.tools : defaults.tools,
      account: typeof parsed.account === 'boolean' ? parsed.account : defaults.account,
      information: typeof parsed.information === 'boolean' ? parsed.information : defaults.information,
      legacy: typeof parsed.legacy === 'boolean' ? parsed.legacy : defaults.legacy,
    };
  } catch {
    return defaults;
  }
}

function writeSidebarSectionState(state: Record<SidebarSectionKey, boolean>): void {
  try {
    localStorage.setItem(SIDEBAR_SECTIONS_STATE_KEY, JSON.stringify(state));
  } catch {
    // non-fatal (private mode/quota)
  }
}

function sectionGroup(
  key: SidebarSectionKey,
  label: string,
  bodyHtml: string,
  expanded: boolean,
): string {
  if (!bodyHtml.trim()) return '';
  return `
    <section class="sidebar__section" data-section="${key}">
      <button
        type="button"
        class="sidebar__section-title sidebar__section-toggle"
        data-section-toggle="${key}"
        aria-expanded="${expanded ? 'true' : 'false'}"
      >
        <span>${label}</span>
        ${chevronDownSvg(expanded)}
      </button>
      <div class="sidebar__section-body${expanded ? '' : ' sidebar__section-body--collapsed'}" data-section-body="${key}">
        ${bodyHtml}
      </div>
    </section>
  `;
}

function navLinksFor(role: SessionUser['role'], sectionState: Record<SidebarSectionKey, boolean>): string {
  if (role === 'child') {
    return sLink('/my-calendar', calendarSvg(), t('nav.calendar'));
  }

  const childDevicesLink = role === 'admin'
    ? ''
    : sLink('/child-devices', qrSvg(), t('nav.child_devices'));

  const documentsSection = [
    sLink('/daily-schedule', dailySvg(), t('nav.daily_schedule')),
    sLink('/first-then', firstThenSvg(), t('nav.first_then')),
    sLink('/choice-board', choiceBoardSvg(), t('nav.choice_board')),
    sLink('/routine-steps', routineSvg(), t('nav.routine_steps')),
    sLink('/weeklyschedule', calendarSvg(), t('nav.weekly_schedule')),
    sLink('/emotion-cards', emotionCardsSvg(), t('nav.emotion_cards')),
    sLink('/reward-tracker', rewardSvg(), t('nav.reward_tracker')),
    sLink('/aac-board', aacBoardSvg(), t('nav.aac_board')),
  ].join('');

  const toolsSection = [
    sLink('/pictograms', pictogramsSvg(), t('nav.pictograms')),
    sLink('/activity-cards', cardsSvg(), t('nav.activity_cards')),
  ].join('');

  const accountSection = [
    childDevicesLink,
    sLink('/settings', settingsSvg(), t('nav.settings')),
    role === 'admin' ? sLink('/admin', settingsSvg(), t('nav.admin')) : '',
  ].join('');

  const informationSection = [
    sLink('/whatisaac', infoSvg(), t('nav.information')),
  ].join('');

  const legacySection = [
    sLink('/visual-supports', visualSupportsSvg(), t('nav.visual_supports')),
  ].join('');

  // Parent navigation (also used for admin role — admin gets an extra link below Settings)
  return [
    sLink('/dashboard', dashboardSvg(), t('nav.dashboard')),
    '<div class="sidebar__divider"></div>',
    sectionGroup('documents', t('nav.section_documents'), documentsSection, sectionState.documents),
    '<div class="sidebar__divider"></div>',
    sectionGroup('tools', t('nav.section_tools'), toolsSection, sectionState.tools),
    '<div class="sidebar__divider"></div>',
    sectionGroup('account', t('nav.section_account'), accountSection, sectionState.account),
    '<div class="sidebar__divider"></div>',
    sectionGroup('information', t('nav.section_information'), informationSection, sectionState.information),
    '<div class="sidebar__divider"></div>',
    sectionGroup('legacy', t('nav.section_legacy'), legacySection, sectionState.legacy),
  ].join('');
}

function bottomLinksFor(role: SessionUser['role']): string {
  if (role === 'child') {
    return bLink('/my-calendar', calendarSvg(), t('nav.calendar'));
  }

  // Parent/admin bottom nav — keep it short.
  return [
    bLink('/dashboard', dashboardSvg(), t('nav.dashboard')),
    bLink('/weeklyschedule', calendarSvg(), t('nav.weekly_schedule')),
    bLink('/pictograms', pictogramsSvg(), t('nav.pictograms')),
    bLink('/settings', settingsSvg(), t('nav.settings')),
  ].join('');
}

/** Register all sidebar event handlers (lang, logout). */
function attachSidebarHandlers(target: HTMLElement): void {
  // Section collapse/expand toggles
  target.querySelectorAll<HTMLButtonElement>('[data-section-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset['sectionToggle'] as SidebarSectionKey | undefined;
      if (!key) return;

      const body = target.querySelector<HTMLElement>(`[data-section-body="${key}"]`);
      const chevron = btn.querySelector<HTMLElement>('.sidebar__section-chevron');
      const currentlyExpanded = btn.getAttribute('aria-expanded') === 'true';
      const nextExpanded = !currentlyExpanded;

      btn.setAttribute('aria-expanded', String(nextExpanded));
      body?.classList.toggle('sidebar__section-body--collapsed', !nextExpanded);
      chevron?.classList.toggle('sidebar__section-chevron--expanded', nextExpanded);

      const state = readSidebarSectionState();
      state[key] = nextExpanded;
      writeSidebarSectionState(state);
    });
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
  const sectionState = readSidebarSectionState();

  target.innerHTML = `
    <nav class="sidebar__nav" aria-label="Application">
      ${navLinksFor(role, sectionState)}
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
  const brandHref = role === 'child' ? '/my-calendar' : '/dashboard';

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
