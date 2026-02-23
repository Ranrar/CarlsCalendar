/**
 * PictogramLibrary.ts — Dedicated ARASAAC pictogram search and management page.
 *
 * Features:
 *  • Full keyword search with debounce + datalist autocomplete
 *  • Exact-phrase ("..") and exclusion (-word) syntax support (ARASAAC native)
 *  • Category filter chips derived from live results
 *  • Saved tab  — personal bookmark collection, sorted by use count
 *  • New tab    — latest pictograms published on ARASAAC
 *  • Detail modal — larger image, all keyword chips, categories, star/unstar
 */

import { t } from '@/i18n/i18n';
import { api } from '@/api/client';
import { session } from '@/auth/session';

// ── Types ────────────────────────────────────────────────────────────────────

interface PictogramDto {
  arasaac_id: number;
  keywords: string[];
  category: string | null;
  categories: string[];
  tags: string[];
  language: string;
  image_url: string | null;
  local_file_path: string | null;
  license: string;
  description: string | null;
}

interface SavedPictogramDto {
  arasaac_id: number;
  label: string | null;
  used_count: number;
  keywords: string[];
  category?: string | null;
  categories: string[];
  tags: string[];
  language: string;
  image_url: string | null;
  local_file_path: string | null;
  license: string;
  description: string | null;
}

type AnyPict = PictogramDto | SavedPictogramDto;
type TabId = 'search' | 'saved' | 'new';

// ── Module state ─────────────────────────────────────────────────────────────

let savedIds = new Set<number>();
let currentTab: TabId = 'search';
let activeCategorySearch = '';
let activeCategorySaved = '';
let activeCategoryNew = '';
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastSearchResults: PictogramDto[] = [];
let lastSavedResults: SavedPictogramDto[] = [];
let lastNewResults: PictogramDto[] = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

function lang(): string {
  return (session.user?.language ?? 'en').slice(0, 2);
}

function imgSrc(p: AnyPict): string {
  const s = (p as SavedPictogramDto);
  if (s.local_file_path) return s.local_file_path;
  if (p.image_url) return p.image_url;
  return `https://static.arasaac.org/pictograms/${p.arasaac_id}/${p.arasaac_id}_500.png`;
}

function firstName(p: AnyPict): string {
  return (p as SavedPictogramDto).label
    || p.keywords[0]
    || String(p.arasaac_id);
}

function extractCategories(items: AnyPict[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of items) {
    for (const c of p.categories) {
      if (c && !seen.has(c)) { seen.add(c); out.push(c); }
    }
    if (p.category && !seen.has(p.category)) { seen.add(p.category); out.push(p.category); }
  }
  return out.sort();
}

// ── Icon SVG strings ─────────────────────────────────────────────────────────

function searchSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
}
function starSvg(filled = false): string {
  return filled
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1.5" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
}
function newSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>`;
}

// ── Card rendering ───────────────────────────────────────────────────────────

function renderCard(p: AnyPict): string {
  const saved = savedIds.has(p.arasaac_id);
  const name = firstName(p);
  const src = imgSrc(p);
  return `
    <div class="pict-card plib__card" role="button" tabindex="0"
         data-id="${p.arasaac_id}" aria-label="${name}">
      <img class="pict-card__img" src="${src}" alt="${name}" loading="lazy"
           onerror="this.classList.add('pict-card__img--broken')" />
      <div class="pict-card__img pict-card__img--placeholder" aria-hidden="true"></div>
      <span class="pict-card__name">${name}</span>
      <button class="pict-card__star${saved ? ' pict-card__star--saved' : ''}"
              data-star="${p.arasaac_id}"
              aria-label="${saved ? t('pictogram.unsave') : t('pictogram.save')}"
              title="${saved ? t('pictogram.unsave') : t('pictogram.save')}">
        ${starSvg(saved)}
      </button>
    </div>`;
}

function renderGrid(items: AnyPict[], activeCategory: string, container: HTMLElement): string {
  if (!items.length) return `<p class="plib__empty">${t('pictogram.no_results')}</p>`;
  const filtered = activeCategory
    ? items.filter(p => p.categories.includes(activeCategory) || p.category === activeCategory)
    : items;
  if (!filtered.length) return `<p class="plib__empty">${t('pictogram.no_results')}</p>`;
  return filtered.map(p => renderCard(p)).join('');
}

// ── Category filter bar ──────────────────────────────────────────────────────

function renderCatBar(bar: HTMLElement, categories: string[], active: string, onSelect: (c: string) => void): void {
  if (!categories.length) { bar.innerHTML = ''; return; }
  const chips = [
    `<button class="plib__cat-chip${!active ? ' plib__cat-chip--active' : ''}" data-cat="">${t('pictogram_library.cat_all')}</button>`,
    ...categories.map(c =>
      `<button class="plib__cat-chip${active === c ? ' plib__cat-chip--active' : ''}" data-cat="${c}">${c}</button>`
    ),
  ].join('');
  bar.innerHTML = chips;
  bar.querySelectorAll<HTMLButtonElement>('.plib__cat-chip').forEach(btn => {
    btn.addEventListener('click', () => onSelect(btn.dataset['cat'] ?? ''));
  });
}

// ── Detail modal ─────────────────────────────────────────────────────────────

function openDetail(p: AnyPict, modal: HTMLElement): void {
  const saved = savedIds.has(p.arasaac_id);
  const src = imgSrc(p);
  const name = firstName(p);
  const kwds = p.keywords.map(k => `<span class="plib__chip">${k}</span>`).join('');
  const cats = p.categories.map(c => `<span class="plib__chip plib__chip--cat">${c}</span>`).join('');
  const tags = p.tags.map(t => `<span class="plib__chip plib__chip--tag">${t}</span>`).join('');

  modal.querySelector('#plib-modal-body')!.innerHTML = `
    <div class="plib-modal__content">
      <div class="plib-modal__img-wrap">
        <img src="${src}" alt="${name}" class="plib-modal__img"
             onerror="this.style.display='none'" />
      </div>
      <div class="plib-modal__info">
        <div class="plib-modal__name-row">
          <h2 class="plib-modal__name">${name}</h2>
          <button class="plib-modal__star${saved ? ' plib-modal__star--saved' : ''}"
                  id="plib-detail-star" data-id="${p.arasaac_id}"
                  aria-label="${saved ? t('pictogram.unsave') : t('pictogram.save')}">
            ${starSvg(saved)} <span>${saved ? t('pictogram.unsave') : t('pictogram.save')}</span>
          </button>
        </div>
        ${p.description ? `<p class="plib-modal__desc">${p.description}</p>` : ''}
        ${kwds ? `<div class="plib-modal__section"><strong>${t('pictogram_library.keywords')}</strong><div class="plib__chips">${kwds}</div></div>` : ''}
        ${cats ? `<div class="plib-modal__section"><strong>${t('pictogram_library.categories')}</strong><div class="plib__chips">${cats}</div></div>` : ''}
        ${tags ? `<div class="plib-modal__section"><strong>${t('pictogram_library.tags')}</strong><div class="plib__chips">${tags}</div></div>` : ''}
        <p class="plib-modal__license">${p.license}</p>
        <p class="plib-modal__id">ID: ${p.arasaac_id}</p>
      </div>
    </div>`;

  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');

  // Star handler inside modal
  modal.querySelector<HTMLButtonElement>('#plib-detail-star')?.addEventListener('click', async () => {
    await toggleStar(p.arasaac_id, modal.querySelector('#plib-detail-star')! as HTMLElement);
    // Also refresh the card in the background grid
    document.querySelectorAll<HTMLButtonElement>(`[data-star="${p.arasaac_id}"]`).forEach(btn => {
      const isSaved = savedIds.has(p.arasaac_id);
      btn.innerHTML = starSvg(isSaved);
      btn.setAttribute('aria-label', isSaved ? t('pictogram.unsave') : t('pictogram.save'));
      btn.classList.toggle('pict-card__star--saved', isSaved);
    });
  });
}

function closeDetail(modal: HTMLElement): void {
  modal.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

// ── Star toggle ──────────────────────────────────────────────────────────────

async function toggleStar(arasaacId: number, btn: HTMLElement): Promise<void> {
  const wasSaved = savedIds.has(arasaacId);
  // Optimistic update
  if (wasSaved) savedIds.delete(arasaacId); else savedIds.add(arasaacId);

  // Update star button appearance
  btn.innerHTML = starSvg(!wasSaved);
  const span = btn.querySelector('span');
  if (span) span.textContent = !wasSaved ? t('pictogram.unsave') : t('pictogram.save');
  btn.classList.toggle('pict-card__star--saved', !wasSaved);
  btn.classList.toggle('plib-modal__star--saved', !wasSaved);

  try {
    if (wasSaved) {
      await api.delete(`/pictograms/saved/${arasaacId}`);
    } else {
      await api.post('/pictograms/saved', { arasaac_id: arasaacId });
    }
  } catch {
    // Rollback
    if (!wasSaved) savedIds.delete(arasaacId); else savedIds.add(arasaacId);
    btn.innerHTML = starSvg(wasSaved);
    btn.classList.toggle('pict-card__star--saved', wasSaved);
    btn.classList.toggle('plib-modal__star--saved', wasSaved);
  }
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadSavedIds(): Promise<void> {
  try {
    const ids = await api.get<number[]>('/pictograms/saved/ids');
    savedIds = new Set(ids);
  } catch { savedIds = new Set(); }
}

async function loadKeywords(datalist: HTMLDataListElement): Promise<void> {
  try {
    const words = await api.get<string[]>(`/pictograms/keywords?lang=${lang()}`);
    datalist.innerHTML = words.slice(0, 2000).map(w => `<option value="${w}"></option>`).join('');
  } catch { /* non-fatal */ }
}

async function doSearch(query: string, container: HTMLElement): Promise<void> {
  const grid = container.querySelector<HTMLElement>('#plib-search-results')!;
  const catBar = container.querySelector<HTMLElement>('#plib-search-cats')!;
  grid.innerHTML = `<p class="plib__loading">${t('pictogram.searching')}</p>`;
  catBar.innerHTML = '';
  activeCategorySearch = '';

  try {
    const encoded = encodeURIComponent(query);
    const results = await api.get<PictogramDto[]>(`/pictograms/search/${lang()}/${encoded}`);
    lastSearchResults = results;
    const cats = extractCategories(results);
    renderCatBar(catBar, cats, '', (c) => {
      activeCategorySearch = c;
      grid.innerHTML = renderGrid(lastSearchResults, activeCategorySearch, container);
      attachCardHandlers(grid, container);
      // Re-render cat bar to reflect new active
      renderCatBar(catBar, cats, c, arguments.callee as (c: string) => void);  // eslint-disable-line
    });
    grid.innerHTML = renderGrid(results, '', container);
    attachCardHandlers(grid, container);
  } catch {
    grid.innerHTML = `<p class="plib__empty">${t('pictogram.no_results')}</p>`;
  }
}

async function loadSaved(container: HTMLElement): Promise<void> {
  const grid = container.querySelector<HTMLElement>('#plib-saved-results')!;
  const catBar = container.querySelector<HTMLElement>('#plib-saved-cats')!;
  grid.innerHTML = `<p class="plib__loading">${t('common.loading')}</p>`;
  catBar.innerHTML = '';
  activeCategorySaved = '';

  try {
    const items = await api.get<SavedPictogramDto[]>(`/pictograms/saved?lang=${lang()}`);
    lastSavedResults = items;
    const cats = extractCategories(items);
    const rerender = (c: string) => {
      activeCategorySaved = c;
      grid.innerHTML = items.length
        ? renderGrid(lastSavedResults, c, container)
        : `<p class="plib__empty">${t('pictogram.no_saved')}</p>`;
      attachCardHandlers(grid, container);
      renderCatBar(catBar, cats, c, rerender);
    };
    renderCatBar(catBar, cats, '', rerender);
    if (!items.length) {
      grid.innerHTML = `<p class="plib__empty">${t('pictogram.no_saved')}</p>`;
      return;
    }
    grid.innerHTML = renderGrid(items, '', container);
    attachCardHandlers(grid, container);
  } catch {
    grid.innerHTML = `<p class="plib__empty">${t('pictogram.no_results')}</p>`;
  }
}

async function loadNew(container: HTMLElement): Promise<void> {
  const grid = container.querySelector<HTMLElement>('#plib-new-results')!;
  const catBar = container.querySelector<HTMLElement>('#plib-new-cats')!;
  grid.innerHTML = `<p class="plib__loading">${t('common.loading')}</p>`;
  catBar.innerHTML = '';
  activeCategoryNew = '';

  try {
    const items = await api.get<PictogramDto[]>(`/pictograms/new?lang=${lang()}&n=60`);
    lastNewResults = items;
    const cats = extractCategories(items);
    const rerender = (c: string) => {
      activeCategoryNew = c;
      grid.innerHTML = items.length
        ? renderGrid(lastNewResults, c, container)
        : `<p class="plib__empty">${t('pictogram.no_results')}</p>`;
      attachCardHandlers(grid, container);
      renderCatBar(catBar, cats, c, rerender);
    };
    renderCatBar(catBar, cats, '', rerender);
    if (!items.length) {
      grid.innerHTML = `<p class="plib__empty">${t('pictogram.no_results')}</p>`;
      return;
    }
    grid.innerHTML = renderGrid(items, '', container);
    attachCardHandlers(grid, container);
  } catch {
    grid.innerHTML = `<p class="plib__empty">${t('pictogram.no_results')}</p>`;
  }
}

// ── Card event delegation ────────────────────────────────────────────────────

function allItemsForId(id: number): AnyPict | undefined {
  return lastSearchResults.find(p => p.arasaac_id === id)
    || lastSavedResults.find(p => p.arasaac_id === id)
    || lastNewResults.find(p => p.arasaac_id === id);
}

function attachCardHandlers(grid: HTMLElement, container: HTMLElement): void {
  const modal = container.querySelector<HTMLElement>('#plib-detail-modal')!;

  grid.querySelectorAll<HTMLElement>('.plib__card').forEach(card => {
    const id = Number(card.dataset['id']);

    const openCard = () => {
      const p = allItemsForId(id);
      if (p) openDetail(p, modal);
    };

    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-star]')) return;
      openCard();
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCard(); }
    });
  });

  grid.querySelectorAll<HTMLButtonElement>('[data-star]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset['star']);
      await toggleStar(id, btn);
      // Refresh all star buttons for same ID across all grids
      document.querySelectorAll<HTMLButtonElement>(`[data-star="${id}"]`).forEach(b => {
        const isSaved = savedIds.has(id);
        b.innerHTML = starSvg(isSaved);
        b.classList.toggle('pict-card__star--saved', isSaved);
        b.setAttribute('aria-label', isSaved ? t('pictogram.unsave') : t('pictogram.save'));
      });
    });
  });
}

// ── Tab switching ────────────────────────────────────────────────────────────

function switchTab(tab: TabId, container: HTMLElement): void {
  currentTab = tab;
  const tabs = ['search', 'saved', 'new'] as TabId[];
  tabs.forEach(id => {
    const btn = container.querySelector<HTMLButtonElement>(`#plib-tab-${id}`);
    const panel = container.querySelector<HTMLElement>(`#plib-${id}-panel`);
    const isActive = id === tab;
    btn?.classList.toggle('pict-tab--active', isActive);
    btn?.setAttribute('aria-selected', String(isActive));
    if (panel) panel.style.display = isActive ? '' : 'none';
  });

  // Lazy-load saved/new tabs on first activation
  if (tab === 'saved') void loadSaved(container);
  if (tab === 'new') void loadNew(container);
}

// ── Page entry point ─────────────────────────────────────────────────────────

export function render(container: HTMLElement): void {
  container.innerHTML = `
    <main class="container page-content">
      <div class="plib">
        <div class="page-header plib__page-header">
          <h1>${t('pictogram_library.title')}</h1>
          <p class="plib__attribution">${t('pictogram_library.attribution')}</p>
        </div>

        <!-- Tab bar -->
        <div class="plib__tabs pict-tabs" role="tablist">
          <button class="pict-tab pict-tab--active" id="plib-tab-search" role="tab" aria-selected="true" data-tab="search">
            ${searchSvg()} ${t('pictogram.tab_search')}
          </button>
          <button class="pict-tab" id="plib-tab-saved" role="tab" aria-selected="false" data-tab="saved">
            ${starSvg(true)} ${t('pictogram.tab_saved')}
          </button>
          <button class="pict-tab" id="plib-tab-new" role="tab" aria-selected="false" data-tab="new">
            ${newSvg()} ${t('pictogram_library.tab_new')}
          </button>
        </div>

        <!-- Search panel -->
        <div id="plib-search-panel">
          <div class="plib__search-row">
            <input id="plib-search-input" type="search"
              class="plib__search-input"
              placeholder="${t('pictogram.search_placeholder')}"
              autocomplete="off"
              list="plib-keywords-datalist" />
            <datalist id="plib-keywords-datalist"></datalist>
          </div>
          <p class="plib__search-hint">${t('pictogram_library.search_hint')}</p>
          <div id="plib-search-cats" class="plib__cat-bar"></div>
          <div id="plib-search-results" class="pict-grid">
            <p class="plib__hint-text">${t('pictogram_library.type_to_search')}</p>
          </div>
        </div>

        <!-- Saved panel -->
        <div id="plib-saved-panel" style="display:none">
          <div id="plib-saved-cats" class="plib__cat-bar"></div>
          <div id="plib-saved-results" class="pict-grid">
            <p class="plib__loading">${t('common.loading')}</p>
          </div>
        </div>

        <!-- New panel -->
        <div id="plib-new-panel" style="display:none">
          <div id="plib-new-cats" class="plib__cat-bar"></div>
          <div id="plib-new-results" class="pict-grid">
            <p class="plib__loading">${t('common.loading')}</p>
          </div>
        </div>
      </div>
    </main>

    <!-- Detail modal -->
    <div id="plib-detail-modal" class="plib-modal hidden" role="dialog" aria-modal="true" aria-labelledby="plib-modal-title">
      <div class="plib-modal__backdrop"></div>
      <div class="plib-modal__box">
        <button class="plib-modal__close" id="plib-modal-close" aria-label="${t('pictogram_library.close')}">&times;</button>
        <div id="plib-modal-body"></div>
      </div>
    </div>
  `;

  // ── Wire up search input ──────────────────────────────────────────────────
  const searchInputEl = container.querySelector<HTMLInputElement>('#plib-search-input')!;
  const datalist = container.querySelector<HTMLDataListElement>('#plib-keywords-datalist')!;
  const modal = container.querySelector<HTMLElement>('#plib-detail-modal')!;

  searchInputEl.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    const q = searchInputEl.value.trim();
    if (!q) {
      const grid = container.querySelector<HTMLElement>('#plib-search-results')!;
      grid.innerHTML = `<p class="plib__hint-text">${t('pictogram_library.type_to_search')}</p>`;
      const catBar = container.querySelector<HTMLElement>('#plib-search-cats')!;
      catBar.innerHTML = '';
      return;
    }
    debounceTimer = setTimeout(() => void doSearch(q, container), 300);
  });

  searchInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (debounceTimer) clearTimeout(debounceTimer);
      const q = searchInputEl.value.trim();
      if (q) void doSearch(q, container);
    }
  });

  // ── Tab clicks ────────────────────────────────────────────────────────────
  container.querySelectorAll<HTMLButtonElement>('.pict-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset['tab'] as TabId, container));
  });

  // ── Close modal ───────────────────────────────────────────────────────────
  container.querySelector('#plib-modal-close')?.addEventListener('click', () => closeDetail(modal));
  modal.querySelector('.plib-modal__backdrop')?.addEventListener('click', () => closeDetail(modal));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeDetail(modal);
  });

  // ── Initialise ────────────────────────────────────────────────────────────
  void loadSavedIds();
  void loadKeywords(datalist);
}
