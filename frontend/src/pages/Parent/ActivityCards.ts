import { t } from '@/i18n/i18n';
import { api, ApiError } from '@/api/client';
import { session } from '@/auth/session';

type ActivityCard = {
  id: string;
  owner_id: string | null;
  locale: string;
  label: string;
  pictogram_id: string | null;
  arasaac_id: number | null;
  local_image_path: string | null;
  category: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

type PictogramSearchItem = {
  arasaac_id: number;
  keywords: string[];
  image_url: string | null;
  local_file_path: string | null;
};

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function errMsg(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return t('errors.generic');
}

function pictogramUrlFromId(pictogramId?: string | null): string | undefined {
  if (!pictogramId) return undefined;
  if (!/^\d+$/.test(pictogramId)) return undefined;
  return `https://static.arasaac.org/pictograms/${pictogramId}/${pictogramId}_500.png`;
}

export async function render(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <main class="container page-content">
      <div class="page-header">
        <h1>${t('nav.activity_cards')}</h1>
        <button class="btn btn-primary" id="btn-add-card">+ ${t('activity_cards_page.add')}</button>
      </div>

      <section class="card" style="padding:1rem;margin-bottom:1rem">
        <h2 style="margin:0 0 .75rem 0">${t('activity_cards_page.my_cards')}</h2>
        <div id="my-cards" class="child-grid"></div>
      </section>

      <section class="card" style="padding:1rem">
        <h2 style="margin:0 0 .75rem 0">${t('activity_cards_page.system_cards')}</h2>
        <p style="margin-top:-.25rem;color:var(--text-muted)">${t('activity_cards_page.system_cards_help')}</p>
        <div id="system-cards" class="child-grid"></div>
      </section>

      <p id="cards-status" class="error-msg" aria-live="polite"></p>
    </main>

    <div class="modal-backdrop hidden" id="card-modal">
      <dialog class="modal" open role="dialog" aria-modal="true" aria-labelledby="card-modal-title">
        <h2 id="card-modal-title">${t('activity_cards_page.add')}</h2>
        <form id="card-form" class="form-stack">
          <input type="hidden" id="card-id" />

          <div>
            <label for="card-label">${t('schedule.title')}</label>
            <input id="card-label" type="text" required maxlength="120" />
          </div>

          <div>
            <label for="card-category">${t('activity_cards_page.category')}</label>
            <input id="card-category" type="text" maxlength="80" />
          </div>

          <div>
            <label for="card-pict-search">${t('visual_support.card_pictogram_search')}</label>
            <input id="card-pict-search" type="text" maxlength="80" placeholder="${t('pictogram.search_placeholder')}" />
          </div>

          <div id="card-pict-selected" class="vs-card-pict-selected"></div>
          <div id="card-pict-results" class="vs-card-pict-grid"></div>

          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="btn-card-cancel">${t('schedule.cancel')}</button>
            <button type="submit" class="btn btn-primary" id="btn-card-save">${t('schedule.save')}</button>
          </div>

          <p id="card-error" class="error-msg" aria-live="polite"></p>
        </form>
      </dialog>
    </div>
  `;

  const myCardsEl = container.querySelector<HTMLElement>('#my-cards')!;
  const systemCardsEl = container.querySelector<HTMLElement>('#system-cards')!;
  const statusEl = container.querySelector<HTMLParagraphElement>('#cards-status')!;

  const modal = container.querySelector<HTMLElement>('#card-modal')!;
  const form = container.querySelector<HTMLFormElement>('#card-form')!;
  const modalTitle = container.querySelector<HTMLElement>('#card-modal-title')!;
  const cardIdEl = container.querySelector<HTMLInputElement>('#card-id')!;
  const labelEl = container.querySelector<HTMLInputElement>('#card-label')!;
  const categoryEl = container.querySelector<HTMLInputElement>('#card-category')!;
  const pictSearchEl = container.querySelector<HTMLInputElement>('#card-pict-search')!;
  const pictSelectedEl = container.querySelector<HTMLElement>('#card-pict-selected')!;
  const pictResultsEl = container.querySelector<HTMLElement>('#card-pict-results')!;
  const formErrorEl = container.querySelector<HTMLParagraphElement>('#card-error')!;
  const saveBtn = container.querySelector<HTMLButtonElement>('#btn-card-save')!;

  let allCards: ActivityCard[] = [];
  let selectedPictogramId: string | null = null;
  let selectedPictogramUrl: string | undefined;
  let pictSearchDebounce: ReturnType<typeof setTimeout> | null = null;

  async function loadCards(): Promise<void> {
    statusEl.textContent = '';
    myCardsEl.innerHTML = `<div class="empty-state"><p>${t('common.loading')}</p></div>`;
    systemCardsEl.innerHTML = `<div class="empty-state"><p>${t('common.loading')}</p></div>`;

    try {
      const locale = session.user?.language ?? 'en';
      allCards = await api.get<ActivityCard[]>(`/visual-documents/activity-cards?locale=${encodeURIComponent(locale)}`);
      renderCards();
    } catch (err) {
      const msg = errMsg(err);
      myCardsEl.innerHTML = `<p class="error-msg">${escapeHtml(msg)}</p>`;
      systemCardsEl.innerHTML = `<p class="error-msg">${escapeHtml(msg)}</p>`;
    }
  }

  function renderCards(): void {
    const userId = session.user?.id ?? '';
    const myCards = allCards.filter((c) => !c.is_system && c.owner_id === userId);
    const systemCards = allCards.filter((c) => c.is_system || c.owner_id !== userId);

    if (myCards.length === 0) {
      myCardsEl.innerHTML = `<div class="empty-state"><p>${t('activity_cards_page.empty_my_cards')}</p></div>`;
    } else {
      myCardsEl.innerHTML = myCards.map((card) => `
        <div class="card" data-id="${escapeHtml(card.id)}">
          <h3 style="margin:0">${escapeHtml(card.label)}</h3>
          <p style="color:var(--text-muted);margin:.4rem 0 .5rem 0">
            ${escapeHtml(card.category ?? t('activity_cards_page.no_category'))}
          </p>
          ${card.local_image_path
            ? `<img src="${escapeHtml(card.local_image_path)}" alt="${escapeHtml(card.label)}" style="max-width:96px;max-height:96px;border-radius:8px;border:1px solid var(--border)"/>`
            : ''}
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem">
            <button class="btn btn-secondary btn-sm js-edit" data-id="${escapeHtml(card.id)}">${t('schedule.edit')}</button>
            <button class="btn btn-secondary btn-sm js-delete" data-id="${escapeHtml(card.id)}">${t('schedule.delete')}</button>
          </div>
        </div>
      `).join('');
    }

    if (systemCards.length === 0) {
      systemCardsEl.innerHTML = `<div class="empty-state"><p>${t('activity_cards_page.empty_system_cards')}</p></div>`;
    } else {
      systemCardsEl.innerHTML = systemCards.map((card) => `
        <div class="card" data-id="${escapeHtml(card.id)}">
          <h3 style="margin:0">${escapeHtml(card.label)}</h3>
          <p style="color:var(--text-muted);margin:.4rem 0 .5rem 0">
            ${escapeHtml(card.category ?? t('activity_cards_page.no_category'))}
          </p>
          ${card.local_image_path
            ? `<img src="${escapeHtml(card.local_image_path)}" alt="${escapeHtml(card.label)}" style="max-width:96px;max-height:96px;border-radius:8px;border:1px solid var(--border)"/>`
            : ''}
          <p style="margin-top:.65rem;color:var(--text-muted);font-size:.85rem">
            ${t('activity_cards_page.read_only')}
          </p>
        </div>
      `).join('');
    }

    myCardsEl.querySelectorAll<HTMLButtonElement>('.js-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset['id'];
        if (!id) return;
        const card = allCards.find((c) => c.id === id);
        if (!card) return;
        openEditModal(card);
      });
    });

    myCardsEl.querySelectorAll<HTMLButtonElement>('.js-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset['id'];
        if (!id) return;
        if (!confirm(t('activity_cards_page.delete_confirm'))) return;

        statusEl.textContent = '';
        try {
          await api.delete(`/visual-documents/activity-cards/${id}`);
          await loadCards();
        } catch (err) {
          statusEl.textContent = errMsg(err);
        }
      });
    });
  }

  function renderSelectedPictogram(): void {
    if (!selectedPictogramId || !selectedPictogramUrl) {
      pictSelectedEl.innerHTML = '';
      return;
    }

    pictSelectedEl.innerHTML = `
      <div class="card schedule-detail-selected-card">
        <img src="${escapeHtml(selectedPictogramUrl)}" alt="${t('pictogram.selected')}" class="schedule-detail-selected-img" />
        <div class="schedule-detail-selected-text">
          ${t('pictogram.selected')}
          <div class="schedule-detail-clear-wrap"><button type="button" class="btn btn-secondary btn-sm" id="card-pict-clear">${t('pictogram.clear')}</button></div>
        </div>
      </div>
    `;

    pictSelectedEl.querySelector('#card-pict-clear')?.addEventListener('click', () => {
      selectedPictogramId = null;
      selectedPictogramUrl = undefined;
      renderSelectedPictogram();
    });
  }

  async function searchPictograms(): Promise<void> {
    const query = pictSearchEl.value.trim();
    if (!query) {
      pictResultsEl.innerHTML = '';
      return;
    }

    const lang = session.user?.language ?? 'en';
    pictResultsEl.innerHTML = `<p class="pict-grid-span">${t('pictogram.searching')}</p>`;

    try {
      const rows = await api.get<PictogramSearchItem[]>(`/pictograms/search/${encodeURIComponent(lang)}/${encodeURIComponent(query)}`);
      if (!rows.length) {
        pictResultsEl.innerHTML = `<p class="pict-grid-span">${t('pictogram.no_results')}</p>`;
        return;
      }

      pictResultsEl.innerHTML = rows.slice(0, 24).map((row) => {
        const primary = row.local_file_path || row.image_url || '';
        const title = row.keywords[0] ?? String(row.arasaac_id);
        return `
          <button type="button" class="vs-card-pict-option" data-pict-id="${row.arasaac_id}" data-pict-url="${escapeHtml(primary)}" title="${escapeHtml(title)}">
            ${primary ? `<img src="${escapeHtml(primary)}" alt="${escapeHtml(title)}" class="vs-card-pict-option__img" />` : '<div class="vs-card-pict-option__img"></div>'}
            <span class="vs-card-pict-option__label">${escapeHtml(title)}</span>
          </button>
        `;
      }).join('');

      pictResultsEl.querySelectorAll<HTMLButtonElement>('.vs-card-pict-option').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedPictogramId = btn.dataset['pictId'] ?? null;
          selectedPictogramUrl = btn.dataset['pictUrl'] || pictogramUrlFromId(selectedPictogramId);
          renderSelectedPictogram();
        });
      });
    } catch (err) {
      pictResultsEl.innerHTML = `<p class="pict-grid-span error-msg">${escapeHtml(errMsg(err))}</p>`;
    }
  }

  function openCreateModal(): void {
    modalTitle.textContent = t('activity_cards_page.add');
    cardIdEl.value = '';
    labelEl.value = '';
    categoryEl.value = '';
    pictSearchEl.value = '';
    pictResultsEl.innerHTML = '';
    selectedPictogramId = null;
    selectedPictogramUrl = undefined;
    renderSelectedPictogram();
    formErrorEl.textContent = '';
    modal.classList.remove('hidden');
  }

  function openEditModal(card: ActivityCard): void {
    modalTitle.textContent = t('activity_cards_page.edit');
    cardIdEl.value = card.id;
    labelEl.value = card.label;
    categoryEl.value = card.category ?? '';
    pictSearchEl.value = '';
    pictResultsEl.innerHTML = '';
    selectedPictogramId = card.pictogram_id ?? (card.arasaac_id ? String(card.arasaac_id) : null);
    selectedPictogramUrl = card.local_image_path ?? pictogramUrlFromId(selectedPictogramId);
    renderSelectedPictogram();
    formErrorEl.textContent = '';
    modal.classList.remove('hidden');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formErrorEl.textContent = '';
    saveBtn.disabled = true;

    const id = cardIdEl.value.trim();
    const label = labelEl.value.trim();
    const category = categoryEl.value.trim();
    if (!label) {
      formErrorEl.textContent = t('activity_cards_page.label_required');
      saveBtn.disabled = false;
      return;
    }

    try {
      if (id) {
        await api.put(`/visual-documents/activity-cards/${id}`, {
          label,
          category: category || null,
          pictogram_id: selectedPictogramId ?? '',
        });
      } else {
        await api.post('/visual-documents/activity-cards', {
          label,
          category: category || null,
          pictogram_id: selectedPictogramId ?? null,
          locale: session.user?.language ?? 'en',
        });
      }
      modal.classList.add('hidden');
      await loadCards();
    } catch (err) {
      formErrorEl.textContent = errMsg(err);
    } finally {
      saveBtn.disabled = false;
    }
  });

  container.querySelector('#btn-add-card')?.addEventListener('click', openCreateModal);
  container.querySelector('#btn-card-cancel')?.addEventListener('click', () => {
    modal.classList.add('hidden');
    if (pictSearchDebounce !== null) {
      clearTimeout(pictSearchDebounce);
      pictSearchDebounce = null;
    }
  });

  pictSearchEl.addEventListener('input', () => {
    if (pictSearchDebounce !== null) clearTimeout(pictSearchDebounce);
    pictSearchDebounce = setTimeout(() => {
      void searchPictograms();
    }, 250);
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.classList.add('hidden');
      if (pictSearchDebounce !== null) {
        clearTimeout(pictSearchDebounce);
        pictSearchDebounce = null;
      }
    }
  });

  await loadCards();
}
