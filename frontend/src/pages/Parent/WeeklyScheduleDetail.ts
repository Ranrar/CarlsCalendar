import { t } from '@/i18n/i18n';
import { api, ApiError } from '@/api/client';
import { router } from '@/router';
import { printSchedule } from '@/components/Print';
import { session } from '@/auth/session';
import { formatClockRangeForUser, normalizeClockInput } from '@/utils/datetime';

// ── Types ────────────────────────────────────────────────────

interface ActivityCard {
  id: string;
  schedule_id: string;
  title: string;
  description: string | null;
  picture_path: string | null;
  start_time: string;
  end_time: string | null;
  sort_order: number;
}

interface ScheduleWithActivityCards {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'archived';
  is_template: boolean;
  activity_cards: ActivityCard[];
}

interface PictogramSearchItem {
  arasaac_id: number;
  keywords: string[];
  categories: string[];
  tags: string[];
  language: string;
  image_url: string | null;
  local_file_path: string | null;
  license: string;
}

interface SavedPictogramItem {
  arasaac_id: number;
  label: string | null;
  used_count: number;
  keywords: string[];
  categories: string[];
  tags: string[];
  language: string;
  image_url: string | null;
  local_file_path: string | null;
  license: string;
  description: string | null;
}

const STATUS_CLASS: Record<string, string> = {
  active: 'badge-active',
  inactive: 'badge-inactive',
  archived: 'badge-archived',
};

// ── Page entry point ─────────────────────────────────────────

export async function render(container: HTMLElement): Promise<void> {
  // Read schedule ID from URL: /weeklyschedule/<id>
  const parts = location.pathname.split('/').filter(Boolean);
  const scheduleId = parts[parts.length - 1];
  if (!scheduleId) {
    container.innerHTML = `
      <main class="container page-content">
        <div class="empty-state"><p>${t('errors.generic')}</p></div>
      </main>
    `;
    return;
  }
  const use24hInput = (session.user?.time_format ?? '24h') === '24h';
  const timeInputAttrs = use24hInput
    ? 'type="text" inputmode="numeric" pattern="^([01]\\d|2[0-3]):[0-5]\\d$" placeholder="HH:MM"'
    : 'type="time"';

  container.innerHTML = `
    <main class="container page-content">
      <div class="page-header schedule-detail-header">
        <div>
          <button class="btn btn-secondary btn-sm schedule-detail-back" id="btn-back">← ${t('schedule.back')}</button>
          <h1 id="sched-name">…</h1>
          <div class="schedule-detail-meta">
            <span id="sched-badge" class="badge"></span>
            <span id="sched-item-count" class="schedule-detail-count"></span>
          </div>
        </div>
        <div class="schedule-detail-actions">
          <button class="btn btn-secondary btn-sm no-print" id="btn-print" title="${t('print.schedule')}">🖨 ${t('print.schedule')}</button>
          <button class="btn btn-primary" id="btn-add-item">+ ${t('schedule.activity_card.add')}</button>
        </div>
      </div>
      <div id="items-list" class="printable-schedule"></div>
    </main>

    <!-- Add / Edit item modal -->
    <div class="modal-backdrop hidden" id="item-modal">
      <dialog class="modal" open role="dialog" aria-modal="true" aria-labelledby="item-modal-title">
        <h2 id="item-modal-title">${t('schedule.activity_card.new')}</h2>
        <form id="item-form" class="form-stack schedule-detail-form">
          <input type="hidden" id="item-id" />
          <div>
            <label for="item-title">${t('schedule.title')} *</label>
            <input id="item-title" type="text" required />
          </div>
          <div>
            <label for="item-desc">${t('schedule.description')}</label>
            <textarea id="item-desc" rows="2"></textarea>
          </div>
          <div>
            <label>${t('pictogram.label')}</label>
            <!-- Tabs -->
            <div class="pict-tabs" role="tablist">
              <button type="button" class="pict-tab pict-tab--active" id="tab-search" role="tab" aria-selected="true">🔍 ${t('pictogram.tab_search')}</button>
              <button type="button" class="pict-tab" id="tab-saved" role="tab" aria-selected="false">★ ${t('pictogram.tab_saved')}</button>
            </div>
            <!-- Search panel -->
            <div id="pict-panel-search" role="tabpanel">
              <div class="schedule-detail-search-row">
                <input id="pict-search" type="text" placeholder="${t('pictogram.search_placeholder')}" autocomplete="off" />
              </div>
              <div id="pict-results" class="pict-grid schedule-detail-pict-grid"></div>
            </div>
            <!-- Saved panel -->
            <div id="pict-panel-saved" role="tabpanel" class="hidden">
              <div id="pict-saved-results" class="pict-grid schedule-detail-pict-grid"></div>
            </div>
            <input type="hidden" id="item-picture-path" />
            <div id="pict-selected" class="schedule-detail-selected"></div>
          </div>
          <div class="schedule-detail-time-grid">
            <div>
              <label for="item-start">${t('schedule.start_time')} *</label>
              <input id="item-start" ${timeInputAttrs} required />
            </div>
            <div>
              <label for="item-end">${t('schedule.end_time')} <span class="schedule-detail-optional">(${t('common.optional')})</span></label>
              <input id="item-end" ${timeInputAttrs} />
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="btn-item-cancel">${t('schedule.cancel')}</button>
            <button type="submit" class="btn btn-primary">${t('schedule.save')}</button>
          </div>
          <p id="item-error" class="error-msg" aria-live="polite"></p>
        </form>
      </dialog>
    </div>

    <!-- Delete confirm modal -->
    <div class="modal-backdrop hidden" id="delete-modal">
      <dialog class="modal" open role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
        <h2 id="delete-modal-title">${t('schedule.activity_card.delete_confirm_title')}</h2>
        <p class="schedule-detail-delete-text">${t('schedule.activity_card.delete_confirm_body')}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="btn-delete-cancel">${t('schedule.cancel')}</button>
          <button class="btn btn-danger" id="btn-delete-confirm">${t('schedule.delete')}</button>
        </div>
        <p id="delete-error" class="error-msg" aria-live="polite"></p>
      </dialog>
    </div>
  `;

  // ── DOM refs ────────────────────────────────────────────────
  const schedName    = container.querySelector<HTMLElement>('#sched-name')!;
  const schedBadge   = container.querySelector<HTMLElement>('#sched-badge')!;
  const itemCount    = container.querySelector<HTMLElement>('#sched-item-count')!;
  const itemsList    = container.querySelector<HTMLElement>('#items-list')!;
  const itemModal    = container.querySelector<HTMLElement>('#item-modal')!;
  const deleteModal  = container.querySelector<HTMLElement>('#delete-modal')!;
  const itemForm     = container.querySelector<HTMLFormElement>('#item-form')!;
  const itemError    = container.querySelector<HTMLParagraphElement>('#item-error')!;
  const deleteErrorEl = container.querySelector<HTMLParagraphElement>('#delete-error')!;

  let activityCards: ActivityCard[] = [];
  let pendingDeleteId: string | null = null;

  const pictResults      = container.querySelector<HTMLElement>('#pict-results')!;
  const pictSavedResults = container.querySelector<HTMLElement>('#pict-saved-results')!;
  const pictSelected     = container.querySelector<HTMLElement>('#pict-selected')!;
  const pictSearchInput  = container.querySelector<HTMLInputElement>('#pict-search')!;
  const pictPathInput    = container.querySelector<HTMLInputElement>('#item-picture-path')!;
  const pictSearchPanel  = container.querySelector<HTMLElement>('#pict-panel-search')!;
  const pictSavedPanel   = container.querySelector<HTMLElement>('#pict-panel-saved')!;
  const tabSearch        = container.querySelector<HTMLButtonElement>('#tab-search')!;
  const tabSaved         = container.querySelector<HTMLButtonElement>('#tab-saved')!;

  let savedIds: Set<number> = new Set();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function setSelectedPictogram(path: string | null, fallbackPath: string | null = null): void {
    pictPathInput.value = path ?? '';
    if (!path) {
      pictSelected.innerHTML = '';
      return;
    }
    pictSelected.innerHTML = `
      <div class="card schedule-detail-selected-card">
        <img src="${escapeHtml(path)}" alt="${t('pictogram.selected')}" class="schedule-detail-selected-img" />
        <div class="schedule-detail-selected-text">
          ${t('pictogram.selected')}
          <div class="schedule-detail-clear-wrap"><button type="button" class="btn btn-secondary btn-sm" id="btn-clear-pict">${t('pictogram.clear')}</button></div>
        </div>
      </div>`;
    const selectedImg = pictSelected.querySelector<HTMLImageElement>('img');
    if (selectedImg && fallbackPath && fallbackPath !== path) {
      selectedImg.addEventListener('error', () => {
        selectedImg.src = fallbackPath;
        pictPathInput.value = fallbackPath;
      }, { once: true });
    }
    container.querySelector('#btn-clear-pict')?.addEventListener('click', () => setSelectedPictogram(null));
  }

  // ── Tab switching ───────────────────────────────────────────
  function showTab(tab: 'search' | 'saved'): void {
    const isSearch = tab === 'search';
    tabSearch.classList.toggle('pict-tab--active', isSearch);
    tabSearch.setAttribute('aria-selected', String(isSearch));
    tabSaved.classList.toggle('pict-tab--active', !isSearch);
    tabSaved.setAttribute('aria-selected', String(!isSearch));
    pictSearchPanel.classList.toggle('hidden', !isSearch);
    pictSavedPanel.classList.toggle('hidden', isSearch);
    if (!isSearch) { void loadSaved(); }
  }

  // ── Saved IDs (for star state) ──────────────────────────────
  async function loadSavedIds(): Promise<void> {
    try {
      const ids = await api.get<number[]>('/pictograms/saved/ids');
      savedIds = new Set(ids);
    } catch {
      savedIds = new Set();
    }
  }

  // ── Saved pictograms grid ───────────────────────────────────
  async function loadSaved(): Promise<void> {
    const lang = session.user?.language ?? 'en';
    pictSavedResults.innerHTML = `<p class="pict-grid-span">${t('common.loading')}</p>`;
    try {
      const rows = await api.get<SavedPictogramItem[]>(`/pictograms/saved?lang=${encodeURIComponent(lang)}`);
      renderSavedItems(rows);
    } catch {
      pictSavedResults.innerHTML = `<p class="pict-grid-span error-msg">${t('errors.generic')}</p>`;
    }
  }

  function renderSavedItems(rows: SavedPictogramItem[]): void {
    if (rows.length === 0) {
      pictSavedResults.innerHTML = `<p class="pict-grid-span">${t('pictogram.no_saved')}</p>`;
      return;
    }
    pictSavedResults.innerHTML = rows.map((row) => {
      const src   = row.local_file_path || row.image_url || '';
      const title = escapeHtml(row.label ?? row.keywords[0] ?? String(row.arasaac_id));
      return `
        <div class="pict-card" tabindex="0" role="button"
             data-id="${row.arasaac_id}"
             data-local-src="${escapeHtml(row.local_file_path ?? '')}"
             data-remote-src="${escapeHtml(row.image_url ?? '')}"
             title="${title}">
          ${src ? `<img src="${escapeHtml(src)}" alt="${title}" class="pict-card__img" />` : '<div class="pict-card__img"></div>'}
          <div class="pict-card__name">${title}</div>
        </div>`;
    }).join('');
    attachCardHandlers(pictSavedResults, true);
  }

  // ── Search ──────────────────────────────────────────────────
  async function searchPictograms(): Promise<void> {
    const q = pictSearchInput.value.trim();
    if (!q) { pictResults.innerHTML = ''; return; }

    const lang = session.user?.language ?? 'en';
    pictResults.innerHTML = `<p class="pict-grid-span">${t('pictogram.searching')}</p>`;
    try {
      const rows = await api.get<PictogramSearchItem[]>(`/pictograms/search/${lang}/${encodeURIComponent(q)}`);
      if (rows.length === 0) {
        pictResults.innerHTML = `<p class="pict-grid-span">${t('pictogram.no_results')}</p>`;
        return;
      }
      renderSearchItems(rows);
    } catch (err) {
      pictResults.innerHTML = `<p class="pict-grid-span error-msg">${err instanceof ApiError ? err.message : t('errors.generic')}</p>`;
    }
  }

  function renderSearchItems(rows: PictogramSearchItem[]): void {
    pictResults.innerHTML = rows.map((row) => {
      const id      = row.arasaac_id;
      const isSaved = savedIds.has(id);
      const src     = row.local_file_path || row.image_url || '';
      const title   = escapeHtml(row.keywords[0] ?? String(id));
      const starLabel = isSaved ? t('pictogram.unsave') : t('pictogram.save');
      return `
        <div class="pict-card" tabindex="0" role="button"
             data-id="${id}"
             data-local-src="${escapeHtml(row.local_file_path ?? '')}"
             data-remote-src="${escapeHtml(row.image_url ?? '')}"
             title="${title}">
          ${src ? `<img src="${escapeHtml(src)}" alt="${title}" class="pict-card__img" />` : '<div class="pict-card__img"></div>'}
          <div class="pict-card__name">${title}</div>
          <button type="button" class="pict-card__star js-pict-star${isSaved ? ' pict-card__star--saved' : ''}"
                  data-id="${id}" title="${starLabel}" aria-label="${starLabel}">★</button>
        </div>`;
    }).join('');
    attachCardHandlers(pictResults, false);
  }

  // ── Card click / star handlers ──────────────────────────────
  function attachCardHandlers(grid: HTMLElement, isSavedGrid: boolean): void {
    grid.querySelectorAll<HTMLElement>('.pict-card').forEach((card) => {
      const id     = parseInt(card.dataset['id'] ?? '0', 10);
      const local  = card.dataset['localSrc']?.trim() || null;
      const remote = card.dataset['remoteSrc']?.trim() || null;
      const img    = card.querySelector<HTMLImageElement>('img');

      // Image error fallback
      if (img && local && remote && local !== remote) {
        img.addEventListener('error', () => { img.src = remote; }, { once: true });
      }

      // Select the pictogram
      const selectPict = (): void => {
        const primary = local ?? remote;
        if (!primary) { setSelectedPictogram(null); return; }
        setSelectedPictogram(primary, remote ?? null);
        // Record use if already saved (fire-and-forget)
        if (isSavedGrid || savedIds.has(id)) {
          void api.post(`/pictograms/saved/${id}/use`, {}).catch(() => null);
        }
      };

      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('js-pict-star')) return;
        selectPict();
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPict(); }
      });
    });

    // Star buttons (search grid only)
    if (!isSavedGrid) {
      grid.querySelectorAll<HTMLButtonElement>('.js-pict-star').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = parseInt(btn.dataset['id'] ?? '0', 10);
          void toggleStar(id, btn);
        });
      });
    }
  }

  async function toggleStar(id: number, btn: HTMLButtonElement): Promise<void> {
    if (savedIds.has(id)) {
      // Unsave
      savedIds.delete(id);
      btn.classList.remove('pict-card__star--saved');
      btn.title = t('pictogram.save');
      btn.setAttribute('aria-label', t('pictogram.save'));
      try { await api.delete(`/pictograms/saved/${id}`); } catch { savedIds.add(id); }
    } else {
      // Save
      savedIds.add(id);
      btn.classList.add('pict-card__star--saved');
      btn.title = t('pictogram.unsave');
      btn.setAttribute('aria-label', t('pictogram.unsave'));
      try { await api.post('/pictograms/saved', { arasaac_id: id }); } catch { savedIds.delete(id); }
    }
  }

  // ── Load schedule + items ───────────────────────────────────
  async function load(): Promise<void> {
    itemsList.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';
    try {
      const data = await api.get<ScheduleWithActivityCards>(`/schedules/${scheduleId}`);
      schedName.textContent = data.name;
      schedBadge.textContent = t(`schedule.status.${data.status}`);
      schedBadge.className = `badge ${STATUS_CLASS[data.status] ?? ''}`;
      activityCards = data.activity_cards;
      renderActivityCards();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        itemsList.innerHTML = `<p class="error-msg">${t('errors.not_found')}</p>`;
      } else {
        itemsList.innerHTML = `<p class="error-msg">${t('errors.generic')}</p>`;
      }
    }
  }

  // ── Render items list ───────────────────────────────────────
  function renderActivityCards(): void {
    const count = activityCards.length;
    itemCount.textContent = count === 1 ? `1 ${t('schedule.activity_card.count_one')}` : `${count} ${t('schedule.activity_card.count_many')}`;

    if (count === 0) {
      itemsList.innerHTML = `
        <div class="empty-state">
          <span class="empty-state__icon">📋</span>
          <p>${t('schedule.activity_card.empty')}</p>
        </div>`;
      return;
    }

    itemsList.innerHTML = activityCards.map((item, idx) => `
      <div class="item-card card" data-id="${item.id}">
        <div class="item-card__reorder">
          <button class="btn-icon js-up" data-id="${item.id}" ${idx === 0 ? 'disabled' : ''} title="${t('schedule.activity_card.move_up')}">↑</button>
          <button class="btn-icon js-down" data-id="${item.id}" ${idx === count - 1 ? 'disabled' : ''} title="${t('schedule.activity_card.move_down')}">↓</button>
        </div>
        <div class="item-card__body">
          <div class="item-card__head">
            <span class="item-card__time">${formatClockRangeForUser(item.start_time, item.end_time)}</span>
            <strong class="item-card__title">${escapeHtml(item.title)}</strong>
          </div>
          ${item.description ? `<p class="item-card__desc">${escapeHtml(item.description)}</p>` : ''}
        </div>
        <div class="item-card__actions">
          <button class="btn btn-secondary btn-sm js-item-edit" data-id="${item.id}">${t('schedule.edit')}</button>
          <button class="btn btn-secondary btn-sm js-item-delete" data-id="${item.id}">${t('schedule.delete')}</button>
        </div>
      </div>`).join('');

    itemsList.querySelectorAll<HTMLButtonElement>('.js-up').forEach((btn) =>
      btn.addEventListener('click', () => move(btn.dataset['id']!, -1)));
    itemsList.querySelectorAll<HTMLButtonElement>('.js-down').forEach((btn) =>
      btn.addEventListener('click', () => move(btn.dataset['id']!, 1)));
    itemsList.querySelectorAll<HTMLButtonElement>('.js-item-edit').forEach((btn) => {
      const item = activityCards.find((x) => x.id === btn.dataset['id'])!;
      btn.addEventListener('click', () => openEdit(item));
    });
    itemsList.querySelectorAll<HTMLButtonElement>('.js-item-delete').forEach((btn) =>
      btn.addEventListener('click', () => openDeleteConfirm(btn.dataset['id']!)));
  }

  // ── Modal helpers ───────────────────────────────────────────
  function openAdd(): void {
    container.querySelector<HTMLElement>('#item-modal-title')!.textContent = t('schedule.activity_card.new');
    itemForm.reset();
    itemForm.querySelector<HTMLInputElement>('#item-id')!.value = '';
    pictSearchInput.value = '';
    pictResults.innerHTML = '';
    pictSavedResults.innerHTML = '';
    showTab('search');
    setSelectedPictogram(null);
    itemError.textContent = '';
    void loadSavedIds();
    itemModal.classList.remove('hidden');
    itemForm.querySelector<HTMLInputElement>('#item-title')!.focus();
  }

  function openEdit(item: ActivityCard): void {
    container.querySelector<HTMLElement>('#item-modal-title')!.textContent = t('schedule.activity_card.edit');
    itemForm.querySelector<HTMLInputElement>('#item-id')!.value = item.id;
    itemForm.querySelector<HTMLInputElement>('#item-title')!.value = item.title;
    itemForm.querySelector<HTMLTextAreaElement>('#item-desc')!.value = item.description ?? '';
    itemForm.querySelector<HTMLInputElement>('#item-start')!.value = item.start_time;
    itemForm.querySelector<HTMLInputElement>('#item-end')!.value = item.end_time ?? '';
    pictSearchInput.value = '';
    pictResults.innerHTML = '';
    pictSavedResults.innerHTML = '';
    showTab('search');
    setSelectedPictogram(item.picture_path ?? null);
    itemError.textContent = '';
    void loadSavedIds();
    itemModal.classList.remove('hidden');
    itemForm.querySelector<HTMLInputElement>('#item-title')!.focus();
  }

  function openDeleteConfirm(id: string): void {
    pendingDeleteId = id;
    deleteModal.classList.remove('hidden');
  }

  function closeItemModal(): void { itemModal.classList.add('hidden'); }
  function closeDeleteModal(): void { deleteModal.classList.add('hidden'); pendingDeleteId = null; }

  // ── Form submit: add or update item ────────────────────────
  itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id         = itemForm.querySelector<HTMLInputElement>('#item-id')!.value;
    const title      = itemForm.querySelector<HTMLInputElement>('#item-title')!.value.trim();
    const description = itemForm.querySelector<HTMLTextAreaElement>('#item-desc')!.value.trim() || null;
    const picture_path = itemForm.querySelector<HTMLInputElement>('#item-picture-path')!.value.trim() || null;
    const startRaw = itemForm.querySelector<HTMLInputElement>('#item-start')!.value;
    const endRaw   = itemForm.querySelector<HTMLInputElement>('#item-end')!.value;
    const start_time = normalizeClockInput(startRaw);
    const end_time = endRaw.trim() ? normalizeClockInput(endRaw) : null;
    const submitBtn  = itemForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;

    if (!start_time) {
      itemError.textContent = t('schedule.activity_card.invalid_start_time');
      return;
    }
    if (endRaw.trim() && !end_time) {
      itemError.textContent = t('schedule.activity_card.invalid_end_time');
      return;
    }

    submitBtn.disabled = true;
    itemError.textContent = '';
    try {
      if (id) {
        await api.put(`/schedules/${scheduleId}/activity-cards/${id}`, { title, description, picture_path, start_time, end_time });
      } else {
        await api.post(`/schedules/${scheduleId}/activity-cards`, { title, description, picture_path, start_time, end_time });
      }
      closeItemModal();
      await load();
    } catch (err) {
      itemError.textContent = err instanceof ApiError ? err.message : t('errors.generic');
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ── Delete confirmed ────────────────────────────────────────
  container.querySelector('#btn-delete-confirm')?.addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    const btn = container.querySelector<HTMLButtonElement>('#btn-delete-confirm')!;
    deleteErrorEl.textContent = '';
    btn.disabled = true;
    try {
      await api.delete(`/schedules/${scheduleId}/activity-cards/${pendingDeleteId}`);
      closeDeleteModal();
      await load();
    } catch {
      deleteErrorEl.textContent = t('errors.generic');
      btn.disabled = false;
    }
  });

  // ── Reorder (up / down) ─────────────────────────────────────
  async function move(itemId: string, direction: -1 | 1): Promise<void> {
    const idx = activityCards.findIndex((x) => x.id === itemId);
    if (idx < 0) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= activityCards.length) return;

    // Swap locally for instant UI feedback
    const tmp = activityCards[idx]!;
    activityCards[idx] = activityCards[swapIdx]!;
    activityCards[swapIdx] = tmp;
    renderActivityCards();

    // Persist new order
    try {
      await api.patch(`/schedules/${scheduleId}/activity-cards/reorder`, {
        activity_card_ids: activityCards.map((x) => x.id),
      });
    } catch {
      // Rollback and reload on error
      await load();
    }
  }

  // ── Event listeners ─────────────────────────────────────────
  container.querySelector('#btn-back')?.addEventListener('click', () => router.push('/weeklyschedule'));
  container.querySelector('#btn-print')?.addEventListener('click', () => printSchedule());
  container.querySelector('#btn-add-item')?.addEventListener('click', openAdd);

  // Debounced search (300 ms)
  pictSearchInput.addEventListener('input', () => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { void searchPictograms(); }, 300);
  });
  pictSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (debounceTimer !== null) clearTimeout(debounceTimer); void searchPictograms(); }
  });

  // Tab switching
  tabSearch.addEventListener('click', () => showTab('search'));
  tabSaved.addEventListener('click', () => showTab('saved'));
  container.querySelector('#btn-item-cancel')?.addEventListener('click', closeItemModal);
  container.querySelector('#btn-delete-cancel')?.addEventListener('click', closeDeleteModal);

  itemModal.addEventListener('click', (e) => { if (e.target === itemModal) closeItemModal(); });
  deleteModal.addEventListener('click', (e) => { if (e.target === deleteModal) closeDeleteModal(); });

  // ── Initial load ────────────────────────────────────────────
  await load();
}

// ── Utility ──────────────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
