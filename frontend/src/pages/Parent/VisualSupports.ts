import { t } from '@/i18n/i18n';
import { printVisualSupport } from '@/components/Print';
import { api, ApiError } from '@/api/client';
import { PHASE_A_LAYOUTS, PHASE_A_SAMPLE_ITEMS, firstEmptyIndex } from '@/visual-support/engine/phaseA';
import type { SupportedVisualDocumentType, VisualCardItem } from '@/visual-support/engine/types';

type Slots = Array<VisualCardItem | null>;

interface DragState {
  pointerId: number;
  sourceIndex: number;
  targetIndex: number | null;
  ghost: HTMLElement;
  handleEl: HTMLElement;
  offsetX: number;
  offsetY: number;
}

interface TemplateDto {
  id: string;
  name: string;
  document_type: string;
  layout_spec: unknown;
}

interface DocumentDto {
  id: string;
  title: string;
  document_type: string;
  layout_spec: unknown;
  content: unknown;
  version: number;
}

interface ActivityCardDto {
  id: string;
  label: string;
  locale: string;
  is_system: boolean;
  pictogram_id?: string | null;
  arasaac_id?: number | null;
  local_image_path?: string | null;
}

interface PictogramSearchItem {
  arasaac_id: number;
  keywords: string[];
  image_url: string | null;
  local_file_path: string | null;
}

const PHASE_B_TYPES: SupportedVisualDocumentType[] = [
  'EMOTION_CARDS',
  'REWARD_TRACKER',
];

const SUPPORTED_TYPES: SupportedVisualDocumentType[] = [
  'DAILY_SCHEDULE',
  'FIRST_THEN',
  'CHOICE_BOARD',
  'ROUTINE_STEPS',
  ...PHASE_B_TYPES,
];

export async function render(container: HTMLElement): Promise<void> {
  let defaultPaletteItems = [...PHASE_A_SAMPLE_ITEMS];
  const customPaletteItems: VisualCardItem[] = [];

  let selectedType: SupportedVisualDocumentType = 'DAILY_SCHEDULE';
  let selectedPaletteId = defaultPaletteItems[0]?.id ?? '';
  let dragState: DragState | null = null;
  let currentDocumentId: string | null = null;
  let currentVersion = 0;
  let printCutLines = false;
  let printCropMarks = false;
  let cardSearchDebounce: ReturnType<typeof setTimeout> | null = null;
  let selectedCardPictogramId: string | null = null;
  let selectedCardPictogramUrl: string | undefined = undefined;

  const slotsFor = (type: SupportedVisualDocumentType): Slots =>
    Array.from({ length: PHASE_A_LAYOUTS[type].slotCount }, () => null);

  let slots = slotsFor(selectedType);

  function serializeContent(currentSlots: Slots): unknown {
    return {
      slots: currentSlots.map((item) =>
        item ? { id: item.id, label: item.label, pictogramUrl: item.pictogramUrl ?? null } : null,
      ),
    };
  }

  function deserializeContent(raw: unknown, type: SupportedVisualDocumentType): Slots {
    const out = slotsFor(type);
    const root = (raw && typeof raw === 'object') ? raw as { slots?: unknown[] } : {};
    const arr = Array.isArray(root.slots) ? root.slots : [];

    for (let i = 0; i < out.length; i++) {
      const entry = arr[i];
      if (!entry || typeof entry !== 'object') {
        out[i] = null;
        continue;
      }
      const item = entry as { id?: unknown; label?: unknown; pictogramUrl?: unknown };
      const id = typeof item.id === 'string' ? item.id : `custom-${i}`;
      const label = typeof item.label === 'string' && item.label.trim().length > 0
        ? item.label
        : t('visual_support.empty');
      out[i] = {
        id,
        label,
        pictogramUrl: typeof item.pictogramUrl === 'string' ? item.pictogramUrl : undefined,
      };
    }

    return out;
  }

  container.innerHTML = `
    <main class="container page-content visual-supports-page">
      <div class="page-header">
        <div>
          <h1>${t('visual_support.title')}</h1>
          <p class="visual-supports-lead">${t('visual_support.lead')}</p>
        </div>
        <div class="visual-supports-actions">
          <button class="btn btn-secondary" id="vs-new">${t('visual_support.new_doc')}</button>
          <button class="btn btn-secondary" id="vs-save">${t('visual_support.save')}</button>
          <button class="btn btn-secondary" id="vs-save-template">${t('visual_support.save_template')}</button>
          <button class="btn btn-secondary" id="vs-reset">${t('visual_support.reset')}</button>
          <button class="btn btn-primary" id="vs-print">${t('visual_support.print')}</button>
        </div>
      </div>

      <div class="card visual-supports-persist">
        <div class="visual-supports-persist__row">
          <label for="vs-title">${t('visual_support.title_label')}</label>
          <input id="vs-title" type="text" value="${t('visual_support.types.daily')}" maxlength="200" />
        </div>
        <div class="visual-supports-persist__row">
          <label for="vs-doc-select">${t('visual_support.saved_docs')}</label>
          <select id="vs-doc-select"><option value="">${t('visual_support.none_saved')}</option></select>
          <button class="btn btn-secondary btn-sm" id="vs-load">${t('visual_support.load')}</button>
          <button class="btn btn-secondary btn-sm" id="vs-delete-doc">${t('visual_support.delete_saved_doc')}</button>
        </div>
        <div class="visual-supports-persist__row">
          <label for="vs-template-select">${t('visual_support.templates')}</label>
          <select id="vs-template-select"><option value="">${t('visual_support.none_templates')}</option></select>
          <button class="btn btn-secondary btn-sm" id="vs-use-template">${t('visual_support.use_template')}</button>
        </div>
        <div class="visual-supports-persist__row">
          <label>${t('visual_support.print_options')}</label>
          <div class="visual-supports-persist__checks">
            <label><input id="vs-opt-cut-lines" type="checkbox" /> ${t('visual_support.cut_lines')}</label>
            <label><input id="vs-opt-crop-marks" type="checkbox" /> ${t('visual_support.crop_marks')}</label>
          </div>
        </div>
        <p id="vs-status" class="status-msg" aria-live="polite"></p>
      </div>

      <div class="card visual-supports-guidance">
        <h2>${t('visual_support.easy_title')}</h2>
        <ul>
          <li>${t('visual_support.easy_drag')}</li>
          <li>${t('visual_support.easy_tap')}</li>
          <li>${t('visual_support.easy_touch')}</li>
        </ul>
      </div>

      <div class="visual-supports-layout">
        <section class="card visual-supports-sidebar" aria-label="${t('visual_support.type')} and ${t('visual_support.palette')}">
          <h2>${t('visual_support.type')}</h2>
          <div id="vs-type-tabs" class="vs-type-tabs" role="tablist" aria-label="${t('visual_support.type')}"></div>

          <h3>${t('visual_support.palette')}</h3>
          <div class="vs-palette-create">
            <label for="vs-custom-card-label">${t('visual_support.new_activity_card')}</label>
            <div class="vs-palette-create__row">
              <button class="btn btn-secondary btn-sm" id="vs-custom-card-open">${t('visual_support.add_custom')}</button>
            </div>
          </div>
          <div id="vs-palette" class="vs-palette"></div>
        </section>

        <section class="card visual-supports-editor" id="vs-editor" aria-label="${t('visual_support.editor')}">
          <div class="visual-supports-editor__header">
            <h2 id="vs-layout-title"></h2>
            <span class="badge">${t('visual_support.a4')}</span>
          </div>
          <p class="visual-supports-editor__hint">${t('visual_support.hint')}</p>

          <div id="vs-live" class="sr-only" aria-live="polite" aria-atomic="true"></div>
          <div id="vs-board" class="vs-board"></div>
          <p class="print-only vs-print-attribution">${t('visual_support.attribution')}</p>
        </section>
      </div>

      <div class="modal-backdrop hidden" id="vs-card-modal">
        <dialog class="modal vs-card-modal" open role="dialog" aria-modal="true" aria-labelledby="vs-card-modal-title">
          <h2 id="vs-card-modal-title">${t('visual_support.card_modal_title')}</h2>
          <form id="vs-card-form" class="form-stack" autocomplete="off">
            <div>
              <label for="vs-custom-card-label">${t('visual_support.new_activity_card')}</label>
              <input id="vs-custom-card-label" type="text" maxlength="120" placeholder="${t('visual_support.new_activity_placeholder')}" required />
            </div>

            <div>
              <label for="vs-card-pict-search">${t('visual_support.card_pictogram_search')}</label>
              <input id="vs-card-pict-search" type="text" maxlength="80" placeholder="${t('pictogram.search_placeholder')}" />
            </div>

            <div id="vs-card-pict-selected" class="vs-card-pict-selected"></div>
            <div id="vs-card-pict-results" class="vs-card-pict-grid"></div>

            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" id="vs-card-cancel">${t('schedule.cancel')}</button>
              <button type="submit" class="btn btn-primary" id="vs-card-submit">${t('visual_support.add_custom')}</button>
            </div>
            <p id="vs-card-error" class="error-msg" aria-live="polite"></p>
          </form>
        </dialog>
      </div>
    </main>
  `;

  const tabsEl = container.querySelector<HTMLElement>('#vs-type-tabs')!;
  const paletteEl = container.querySelector<HTMLElement>('#vs-palette')!;
  const boardEl = container.querySelector<HTMLElement>('#vs-board')!;
  const titleEl = container.querySelector<HTMLElement>('#vs-layout-title')!;
  const liveEl = container.querySelector<HTMLElement>('#vs-live')!;
  const statusEl = container.querySelector<HTMLElement>('#vs-status')!;
  const titleInput = container.querySelector<HTMLInputElement>('#vs-title')!;
  const docSelect = container.querySelector<HTMLSelectElement>('#vs-doc-select')!;
  const templateSelect = container.querySelector<HTMLSelectElement>('#vs-template-select')!;
  const cutLinesInput = container.querySelector<HTMLInputElement>('#vs-opt-cut-lines')!;
  const cropMarksInput = container.querySelector<HTMLInputElement>('#vs-opt-crop-marks')!;
  const cardModal = container.querySelector<HTMLElement>('#vs-card-modal')!;
  const cardForm = container.querySelector<HTMLFormElement>('#vs-card-form')!;
  const customCardInput = container.querySelector<HTMLInputElement>('#vs-custom-card-label')!;
  const cardPictSearchInput = container.querySelector<HTMLInputElement>('#vs-card-pict-search')!;
  const cardPictResults = container.querySelector<HTMLElement>('#vs-card-pict-results')!;
  const cardPictSelected = container.querySelector<HTMLElement>('#vs-card-pict-selected')!;
  const cardError = container.querySelector<HTMLElement>('#vs-card-error')!;

  const paletteItems = (): VisualCardItem[] => [...defaultPaletteItems, ...customPaletteItems];
  const defaultPaletteIds = (): Set<string> => new Set(defaultPaletteItems.map((item) => item.id));

  function setStatus(msg: string): void {
    statusEl.textContent = msg;
  }

  function announce(msg: string): void {
    liveEl.textContent = msg;
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pictogramUrlFromId(pictogramId?: string | null): string | undefined {
    if (!pictogramId) return undefined;
    if (!/^\d+$/.test(pictogramId)) return undefined;
    return `https://static.arasaac.org/pictograms/${pictogramId}/${pictogramId}_500.png`;
  }

  function pictogramUrlFromArasaacId(arasaacId?: number | null): string | undefined {
    if (!arasaacId || !Number.isFinite(arasaacId)) return undefined;
    return `https://static.arasaac.org/pictograms/${arasaacId}/${arasaacId}_500.png`;
  }

  function resolveCardPictogramUrl(card: ActivityCardDto): string | undefined {
    return card.local_image_path
      ?? pictogramUrlFromArasaacId(card.arasaac_id)
      ?? pictogramUrlFromId(card.pictogram_id);
  }

  function closeCardModal(): void {
    cardModal.classList.add('hidden');
    cardForm.reset();
    cardPictResults.innerHTML = '';
    cardPictSelected.innerHTML = '';
    cardError.textContent = '';
    selectedCardPictogramId = null;
    selectedCardPictogramUrl = undefined;
    if (cardSearchDebounce !== null) {
      clearTimeout(cardSearchDebounce);
      cardSearchDebounce = null;
    }
  }

  function renderSelectedPictogram(): void {
    if (!selectedCardPictogramId || !selectedCardPictogramUrl) {
      cardPictSelected.innerHTML = '';
      return;
    }

    cardPictSelected.innerHTML = `
      <div class="card schedule-detail-selected-card">
        <img src="${escapeHtml(selectedCardPictogramUrl)}" alt="${t('pictogram.selected')}" class="schedule-detail-selected-img" />
        <div class="schedule-detail-selected-text">
          ${t('pictogram.selected')}
          <div class="schedule-detail-clear-wrap"><button type="button" class="btn btn-secondary btn-sm" id="vs-card-pict-clear">${t('pictogram.clear')}</button></div>
        </div>
      </div>
    `;

    cardPictSelected.querySelector('#vs-card-pict-clear')?.addEventListener('click', () => {
      selectedCardPictogramId = null;
      selectedCardPictogramUrl = undefined;
      renderSelectedPictogram();
    });
  }

  async function searchCardPictograms(): Promise<void> {
    const q = cardPictSearchInput.value.trim();
    if (!q) {
      cardPictResults.innerHTML = '';
      return;
    }

    cardPictResults.innerHTML = `<p class="pict-grid-span">${t('pictogram.searching')}</p>`;
    try {
      const rows = await api.get<PictogramSearchItem[]>(`/pictograms/search/en/${encodeURIComponent(q)}`);
      if (!rows.length) {
        cardPictResults.innerHTML = `<p class="pict-grid-span">${t('pictogram.no_results')}</p>`;
        return;
      }

      cardPictResults.innerHTML = rows.slice(0, 24).map((row) => {
        const primary = row.local_file_path || row.image_url || '';
        const title = row.keywords[0] ?? String(row.arasaac_id);
        return `
          <button type="button" class="vs-card-pict-option" data-pict-id="${row.arasaac_id}" data-pict-url="${escapeHtml(primary)}" title="${escapeHtml(title)}">
            ${primary ? `<img src="${escapeHtml(primary)}" alt="${escapeHtml(title)}" class="vs-card-pict-option__img" />` : '<div class="vs-card-pict-option__img"></div>'}
            <span class="vs-card-pict-option__label">${escapeHtml(title)}</span>
          </button>
        `;
      }).join('');

      cardPictResults.querySelectorAll<HTMLButtonElement>('.vs-card-pict-option').forEach((btn) => {
        btn.addEventListener('click', () => {
          const pictId = btn.dataset['pictId'];
          const pictUrl = btn.dataset['pictUrl'];
          selectedCardPictogramId = pictId ?? null;
          selectedCardPictogramUrl = pictUrl || pictogramUrlFromId(pictId);
          renderSelectedPictogram();
        });
      });
    } catch (err) {
      cardPictResults.innerHTML = `<p class="pict-grid-span error-msg">${err instanceof ApiError ? err.message : t('errors.generic')}</p>`;
    }
  }

  function openCardModal(): void {
    cardModal.classList.remove('hidden');
    customCardInput.focus();
  }

  function labelForType(type: SupportedVisualDocumentType): string {
    switch (type) {
      case 'DAILY_SCHEDULE': return t('visual_support.types.daily');
      case 'WEEKLY_SCHEDULE': return t('visual_support.types.weekly');
      case 'FIRST_THEN': return t('visual_support.types.first_then');
      case 'CHOICE_BOARD': return t('visual_support.types.choice');
      case 'ROUTINE_STEPS': return t('visual_support.types.routine');
      case 'EMOTION_CARDS': return t('visual_support.types.emotions');
      case 'REWARD_TRACKER': return t('visual_support.types.reward');
    }
  }

  function reassignSlots(newType: SupportedVisualDocumentType): void {
    selectedType = newType;
    slots = slotsFor(newType);
    titleInput.value = labelForType(newType);
    currentDocumentId = null;
    currentVersion = 0;
  }

  async function loadDocumentsAndTemplates(): Promise<void> {
    try {
      const [docs, templates, cards] = await Promise.all([
        api.get<DocumentDto[]>(`/visual-documents?type=${encodeURIComponent(selectedType)}`),
        api.get<TemplateDto[]>(`/visual-documents/templates?type=${encodeURIComponent(selectedType)}`),
        api.get<ActivityCardDto[]>('/visual-documents/activity-cards?locale=en'),
      ]);

      const systemCards = cards
        .filter((card) => card.is_system)
        .map((card) => ({
          id: card.id,
          label: card.label,
          pictogramUrl: resolveCardPictogramUrl(card),
        }));

      defaultPaletteItems = systemCards.length > 0 ? systemCards : [...PHASE_A_SAMPLE_ITEMS];

      customPaletteItems.splice(
        0,
        customPaletteItems.length,
        ...cards
          .filter((card) => !card.is_system)
          .map((card) => ({
            id: card.id,
            label: card.label,
            pictogramUrl: resolveCardPictogramUrl(card),
          })),
      );

      if (!paletteItems().some((item) => item.id === selectedPaletteId)) {
        selectedPaletteId = paletteItems()[0]?.id ?? '';
      }

      docSelect.innerHTML = [
        `<option value="">${t('visual_support.none_saved')}</option>`,
        ...docs.map((d) => `<option value="${d.id}">${d.title}</option>`),
      ].join('');

      templateSelect.innerHTML = [
        `<option value="">${t('visual_support.none_templates')}</option>`,
        ...templates.map((tpl) => `<option value="${tpl.id}">${tpl.name}</option>`),
      ].join('');

      rerenderPalette();
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : t('errors.generic'));
    }
  }

  async function saveAsTemplate(): Promise<void> {
    const suggested = titleInput.value.trim() || labelForType(selectedType);
    const name = window.prompt(t('visual_support.template_name_prompt'), suggested);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setStatus(t('visual_support.template_name_required'));
      return;
    }

    try {
      await api.post<TemplateDto>('/visual-documents/templates', {
        name: trimmed,
        document_type: selectedType,
        locale: 'en',
        is_system: false,
        layout_spec: {
          type: selectedType,
          columns: PHASE_A_LAYOUTS[selectedType].columns,
          slotCount: PHASE_A_LAYOUTS[selectedType].slotCount,
        },
      });
      await loadDocumentsAndTemplates();
      setStatus(t('visual_support.template_saved'));
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : t('errors.generic'));
    }
  }

  async function deleteSelectedDocument(): Promise<void> {
    const id = docSelect.value;
    if (!id) return;

    if (!window.confirm(t('visual_support.confirm_delete_saved_doc'))) {
      return;
    }

    try {
      await api.delete<void>(`/visual-documents/${id}`);
      docSelect.value = '';
      currentDocumentId = null;
      currentVersion = 0;
      await loadDocumentsAndTemplates();
      setStatus(t('visual_support.saved_doc_deleted'));
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : t('errors.generic'));
    }
  }

  async function addCustomActivityCard(): Promise<void> {
    const label = customCardInput.value.trim();
    if (!label) {
      cardError.textContent = t('visual_support.custom_card_name_required');
      return;
    }

    try {
      const created = await api.post<ActivityCardDto>('/visual-documents/activity-cards', {
        label,
        locale: 'en',
        pictogram_id: selectedCardPictogramId,
      });

      customPaletteItems.push({
        id: created.id,
        label: created.label,
        pictogramUrl: selectedCardPictogramUrl ?? pictogramUrlFromId(created.pictogram_id),
      });
      selectedPaletteId = created.id;
      closeCardModal();
      setStatus(t('visual_support.custom_card_added'));
      rerenderPalette();
    } catch (err) {
      cardError.textContent = err instanceof ApiError ? err.message : t('errors.generic');
    }
  }

  async function removeCustomActivityCard(id: string): Promise<void> {
    if (defaultPaletteIds().has(id)) {
      setStatus(t('visual_support.default_card_protected'));
      return;
    }

    const idx = customPaletteItems.findIndex((item) => item.id === id);
    if (idx < 0) return;

    try {
      await api.delete<void>(`/visual-documents/activity-cards/${id}`);
      customPaletteItems.splice(idx, 1);
      if (selectedPaletteId === id) {
        selectedPaletteId = paletteItems()[0]?.id ?? '';
      }
      setStatus(t('visual_support.custom_card_removed'));
      rerenderPalette();
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : t('errors.generic'));
    }
  }

  function printClassForType(type: SupportedVisualDocumentType): string {
    switch (type) {
      case 'DAILY_SCHEDULE': return 'print-vs-daily';
      case 'WEEKLY_SCHEDULE': return 'print-vs-weekly';
      case 'FIRST_THEN': return 'print-vs-first-then';
      case 'CHOICE_BOARD': return 'print-vs-choice';
      case 'ROUTINE_STEPS': return 'print-vs-routine';
      case 'EMOTION_CARDS': return 'print-vs-emotions';
      case 'REWARD_TRACKER': return 'print-vs-reward';
    }
  }

  async function loadDocument(id: string): Promise<void> {
    try {
      const doc = await api.get<DocumentDto>(`/visual-documents/${id}`);
      if (!SUPPORTED_TYPES.includes(doc.document_type as SupportedVisualDocumentType)) {
        setStatus(t('errors.generic'));
        return;
      }
      selectedType = doc.document_type as SupportedVisualDocumentType;
      currentDocumentId = doc.id;
      currentVersion = doc.version;
      titleInput.value = doc.title;
      slots = deserializeContent(doc.content, selectedType);

      rerenderTabs();
      rerenderPalette();
      rerenderEditor();
      docSelect.value = doc.id;
      await loadDocumentsAndTemplates();
      docSelect.value = doc.id;
      setStatus(t('visual_support.loaded'));
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : t('errors.generic'));
    }
  }

  async function saveDocument(): Promise<void> {
    const payload = {
      title: titleInput.value.trim() || labelForType(selectedType),
      document_type: selectedType,
      locale: 'en',
      layout_spec: {
        type: selectedType,
        columns: PHASE_A_LAYOUTS[selectedType].columns,
        slotCount: PHASE_A_LAYOUTS[selectedType].slotCount,
      },
      content: serializeContent(slots),
    };

    try {
      if (currentDocumentId) {
        const updated = await api.put<DocumentDto>(`/visual-documents/${currentDocumentId}`, {
          title: payload.title,
          layout_spec: payload.layout_spec,
          content: payload.content,
          expected_version: currentVersion,
        });
        currentVersion = updated.version;
        setStatus(t('visual_support.saved'));
      } else {
        const created = await api.post<DocumentDto>('/visual-documents', payload);
        currentDocumentId = created.id;
        currentVersion = created.version;
        setStatus(t('visual_support.saved'));
      }

      await loadDocumentsAndTemplates();
      if (currentDocumentId) docSelect.value = currentDocumentId;
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : t('errors.generic'));
    }
  }

  async function createFromTemplate(templateId: string): Promise<void> {
    try {
      const created = await api.post<DocumentDto>(`/visual-documents/templates/${templateId}/copy`, {
        title: titleInput.value.trim() || undefined,
      });
      await loadDocument(created.id);
      setStatus(t('visual_support.template_applied'));
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : t('errors.generic'));
    }
  }

  function placeSelectedInSlot(index: number): void {
    const selected = paletteItems().find((x) => x.id === selectedPaletteId);
    if (!selected) return;
    slots[index] = selected;
    announce(t('visual_support.announced.placed', { label: selected.label, index: index + 1 }));
    rerenderEditor();
  }

  function addSelectedToNextFreeSlot(): void {
    const idx = firstEmptyIndex(slots);
    placeSelectedInSlot(idx);
  }

  function moveSlotItem(index: number, delta: -1 | 1): void {
    const next = index + delta;
    if (next < 0 || next >= slots.length) return;
    const current = slots[index] ?? null;
    if (!current) return;
    const target = slots[next] ?? null;
    slots[next] = current;
    slots[index] = target;
    announce(t('visual_support.announced.moved', { label: current.label, index: next + 1 }));
    rerenderEditor();
  }

  function clearSlot(index: number): void {
    const prev = slots[index];
    slots[index] = null;
    if (prev) announce(t('visual_support.announced.cleared', { label: prev.label }));
    rerenderEditor();
  }

  function stopDragging(): void {
    if (!dragState) return;

    dragState.ghost.remove();
    dragState.handleEl.releasePointerCapture(dragState.pointerId);

    const target = dragState.targetIndex;
    if (target !== null && target !== dragState.sourceIndex) {
      const sourceItem = slots[dragState.sourceIndex] ?? null;
      const targetItem = slots[target] ?? null;
      slots[target] = sourceItem;
      slots[dragState.sourceIndex] = targetItem;
      if (sourceItem) {
        announce(t('visual_support.announced.moved', { label: sourceItem.label, index: target + 1 }));
      }
    }

    dragState = null;
    rerenderEditor();
  }

  function setDropTargetAtPoint(clientX: number, clientY: number): void {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const slot = el?.closest<HTMLElement>('[data-slot-index]');
    if (!slot) {
      dragState!.targetIndex = null;
      boardEl.querySelectorAll('.vs-slot--drop-target').forEach((x) => x.classList.remove('vs-slot--drop-target'));
      return;
    }

    const index = Number(slot.dataset['slotIndex']);
    dragState!.targetIndex = Number.isFinite(index) ? index : null;

    boardEl.querySelectorAll('.vs-slot--drop-target').forEach((x) => x.classList.remove('vs-slot--drop-target'));
    if (dragState!.targetIndex !== null) {
      slot.classList.add('vs-slot--drop-target');
    }
  }

  function onHandlePointerDown(ev: PointerEvent, sourceIndex: number): void {
    if (!ev.isPrimary) return;
    const sourceItem = slots[sourceIndex];
    if (!sourceItem) return;

    ev.preventDefault();
    const handleEl = ev.currentTarget as HTMLElement;

    const ghost = document.createElement('div');
    ghost.className = 'vs-drag-ghost';
    ghost.textContent = sourceItem.label;
    document.body.appendChild(ghost);

    const rect = handleEl.getBoundingClientRect();
    const offsetX = ev.clientX - rect.left;
    const offsetY = ev.clientY - rect.top;

    dragState = {
      pointerId: ev.pointerId,
      sourceIndex,
      targetIndex: null,
      ghost,
      handleEl,
      offsetX,
      offsetY,
    };

    handleEl.setPointerCapture(ev.pointerId);
    ghost.style.left = `${ev.clientX - offsetX}px`;
    ghost.style.top = `${ev.clientY - offsetY}px`;

    announce(t('visual_support.announced.grabbed', { label: sourceItem.label, index: sourceIndex + 1 }));
  }

  function onHandlePointerMove(ev: PointerEvent): void {
    if (!dragState || ev.pointerId !== dragState.pointerId) return;
    ev.preventDefault();

    dragState.ghost.style.left = `${ev.clientX - dragState.offsetX}px`;
    dragState.ghost.style.top = `${ev.clientY - dragState.offsetY}px`;

    setDropTargetAtPoint(ev.clientX, ev.clientY);
  }

  function onHandlePointerUp(ev: PointerEvent): void {
    if (!dragState || ev.pointerId !== dragState.pointerId) return;
    ev.preventDefault();
    stopDragging();
  }

  function onHandlePointerCancel(ev: PointerEvent): void {
    if (!dragState || ev.pointerId !== dragState.pointerId) return;
    ev.preventDefault();
    dragState.ghost.remove();
    dragState = null;
    rerenderEditor();
  }

  function rerenderTabs(): void {
    tabsEl.innerHTML = SUPPORTED_TYPES.map((type) => {
      const selected = selectedType === type;
      const phaseB = PHASE_B_TYPES.includes(type);
      return `
        <button
          class="vs-type-tab ${selected ? 'vs-type-tab--active' : ''} ${phaseB ? 'vs-type-tab--phase-b' : ''}"
          role="tab"
          aria-selected="${selected ? 'true' : 'false'}"
          data-type="${type}"
        >
          ${labelForType(type)}
        </button>
      `;
    }).join('');

    tabsEl.querySelectorAll<HTMLButtonElement>('[data-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        reassignSlots(btn.dataset['type'] as SupportedVisualDocumentType);
        rerenderTabs();
        rerenderEditor();
        loadDocumentsAndTemplates().catch(() => void 0);
      });
    });
  }

  function rerenderPalette(): void {
    paletteEl.innerHTML = paletteItems().map((item) => {
      const selected = item.id === selectedPaletteId;
      const isDefault = defaultPaletteIds().has(item.id);
      return `
        <div class="vs-palette-item ${selected ? 'vs-palette-item--selected' : ''}">
          <button class="vs-palette-select" data-palette-id="${item.id}">
            ${item.pictogramUrl ? `<img src="${item.pictogramUrl}" alt="" class="vs-palette-item__thumb" />` : ''}
            <span>${item.label}</span>
          </button>
          <div class="vs-palette-item__actions">
            <button class="btn btn-secondary btn-sm" data-palette-add="${item.id}">${t('visual_support.add')}</button>
            ${isDefault ? '' : `<button class="btn btn-secondary btn-sm" data-palette-remove="${item.id}">${t('visual_support.remove_custom')}</button>`}
          </div>
        </div>
      `;
    }).join('');

    paletteEl.querySelectorAll<HTMLButtonElement>('[data-palette-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedPaletteId = btn.dataset['paletteId'] ?? selectedPaletteId;
        rerenderPalette();
      });
    });

    paletteEl.querySelectorAll<HTMLButtonElement>('[data-palette-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedPaletteId = btn.dataset['paletteAdd'] ?? selectedPaletteId;
        addSelectedToNextFreeSlot();
        rerenderPalette();
      });
    });

    paletteEl.querySelectorAll<HTMLButtonElement>('[data-palette-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset['paletteRemove'];
        if (!id) return;
        removeCustomActivityCard(id).catch(() => void 0);
      });
    });
  }

  function slotTitle(index: number): string {
    if (selectedType === 'FIRST_THEN') {
      return index === 0 ? t('visual_support.first') : t('visual_support.then');
    }

    if (selectedType === 'ROUTINE_STEPS') {
      return `${t('visual_support.step')} ${index + 1}`;
    }

    return `${t('visual_support.slot')} ${index + 1}`;
  }

  function rerenderEditor(): void {
    const spec = PHASE_A_LAYOUTS[selectedType];
    titleEl.textContent = labelForType(selectedType);
    const phaseClass = PHASE_B_TYPES.includes(selectedType) ? 'print-vs-phase-b' : 'print-vs-phase-a';

    boardEl.className = `vs-board vs-board--cols-${spec.columns} ${phaseClass} ${printClassForType(selectedType)}`;

    boardEl.innerHTML = slots.map((item, index) => `
      <article class="vs-slot" data-slot-index="${index}">
        <header class="vs-slot__header">
          <strong>${slotTitle(index)}</strong>
        </header>

        ${item ? `
          <div class="vs-card" data-card-id="${item.id}">
            <button class="vs-card__handle" data-drag-handle="${index}" aria-label="${t('visual_support.move')} ${item.label}">⠿</button>
            <div class="vs-card__main">
              ${item.pictogramUrl ? `<img src="${item.pictogramUrl}" alt="" class="vs-card__img" />` : ''}
              <span class="vs-card__label">${item.label}</span>
            </div>
          </div>
        ` : `
          <div class="vs-slot__empty">${t('visual_support.empty')}</div>
        `}

        <footer class="vs-slot__actions">
          <button class="btn btn-secondary btn-sm" data-place-slot="${index}">${t('visual_support.place_here')}</button>
          <button class="btn btn-secondary btn-sm" data-up-slot="${index}">${t('visual_support.up')}</button>
          <button class="btn btn-secondary btn-sm" data-down-slot="${index}">${t('visual_support.down')}</button>
          <button class="btn btn-secondary btn-sm" data-clear-slot="${index}">${t('visual_support.clear')}</button>
        </footer>
      </article>
    `).join('');

    boardEl.querySelectorAll<HTMLButtonElement>('[data-place-slot]').forEach((btn) => {
      btn.addEventListener('click', () => placeSelectedInSlot(Number(btn.dataset['placeSlot'])));
    });

    boardEl.querySelectorAll<HTMLButtonElement>('[data-up-slot]').forEach((btn) => {
      btn.addEventListener('click', () => moveSlotItem(Number(btn.dataset['upSlot']), -1));
    });

    boardEl.querySelectorAll<HTMLButtonElement>('[data-down-slot]').forEach((btn) => {
      btn.addEventListener('click', () => moveSlotItem(Number(btn.dataset['downSlot']), 1));
    });

    boardEl.querySelectorAll<HTMLButtonElement>('[data-clear-slot]').forEach((btn) => {
      btn.addEventListener('click', () => clearSlot(Number(btn.dataset['clearSlot'])));
    });

    boardEl.querySelectorAll<HTMLElement>('[data-drag-handle]').forEach((handle) => {
      const sourceIndex = Number(handle.dataset['dragHandle']);
      handle.addEventListener('pointerdown', (ev) => onHandlePointerDown(ev, sourceIndex));
      handle.addEventListener('pointermove', onHandlePointerMove);
      handle.addEventListener('pointerup', onHandlePointerUp);
      handle.addEventListener('pointercancel', onHandlePointerCancel);
    });
  }

  container.querySelector('#vs-reset')?.addEventListener('click', () => {
    slots = slotsFor(selectedType);
    rerenderEditor();
    announce(t('visual_support.announced.reset'));
  });

  container.querySelector('#vs-new')?.addEventListener('click', () => {
    currentDocumentId = null;
    currentVersion = 0;
    slots = slotsFor(selectedType);
    titleInput.value = labelForType(selectedType);
    docSelect.value = '';
    rerenderEditor();
    setStatus(t('visual_support.new_ready'));
  });

  container.querySelector('#vs-save')?.addEventListener('click', () => {
    saveDocument().catch(() => void 0);
  });

  container.querySelector('#vs-save-template')?.addEventListener('click', () => {
    saveAsTemplate().catch(() => void 0);
  });

  container.querySelector('#vs-load')?.addEventListener('click', () => {
    const id = docSelect.value;
    if (!id) return;
    loadDocument(id).catch(() => void 0);
  });

  container.querySelector('#vs-use-template')?.addEventListener('click', () => {
    const id = templateSelect.value;
    if (!id) return;
    createFromTemplate(id).catch(() => void 0);
  });

  container.querySelector('#vs-delete-doc')?.addEventListener('click', () => {
    deleteSelectedDocument().catch(() => void 0);
  });

  container.querySelector('#vs-custom-card-open')?.addEventListener('click', openCardModal);

  cardForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    addCustomActivityCard().catch(() => void 0);
  });

  container.querySelector('#vs-card-cancel')?.addEventListener('click', closeCardModal);

  cardModal.addEventListener('click', (ev) => {
    if (ev.target === cardModal) closeCardModal();
  });

  cardPictSearchInput.addEventListener('input', () => {
    cardError.textContent = '';
    if (cardSearchDebounce !== null) clearTimeout(cardSearchDebounce);
    cardSearchDebounce = setTimeout(() => {
      searchCardPictograms().catch(() => void 0);
    }, 250);
  });

  container.querySelector('#vs-print')?.addEventListener('click', () => {
    printVisualSupport({
      cutLines: printCutLines,
      cropMarks: printCropMarks,
    });
  });

  cutLinesInput.checked = printCutLines;
  cropMarksInput.checked = printCropMarks;

  cutLinesInput.addEventListener('change', () => {
    printCutLines = cutLinesInput.checked;
  });

  cropMarksInput.addEventListener('change', () => {
    printCropMarks = cropMarksInput.checked;
  });

  rerenderTabs();
  rerenderPalette();
  rerenderEditor();
  await loadDocumentsAndTemplates();
}
