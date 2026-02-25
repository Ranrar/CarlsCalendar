import { t } from '@/i18n/i18n';
import { api, ApiError } from '@/api/client';
import { session } from '@/auth/session';
import { printVisualSupport } from '@/components/Print';
import type { VisualCardItem } from '@/visual-support/engine/types';

const PRINT_PAGE_SIZE_KEY = 'print.pageSize';
type PrintLayout = 'side_by_side' | 'top_bottom';

type Slots = Array<VisualCardItem | null>;

interface DocumentDto {
  id: string;
  title: string;
  content: unknown;
  layout_spec: unknown;
  version: number;
}

interface TemplateDto {
  id: string;
  name: string;
  document_type: string;
  layout_spec: unknown;
  is_system: boolean;
}

interface TemplatePreviewDto {
  template_id: string;
  title: string;
  document_type: string;
  locale: string;
  layout_spec: unknown;
  content: unknown;
}

interface ActivityCardDto {
  id: string;
  label: string;
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

function errMsg(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return t('errors.generic');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeTitle(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function pictogramUrlFromId(pictogramId?: string | null): string | undefined {
  if (!pictogramId || !/^\d+$/.test(pictogramId)) return undefined;
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

function defaultSlots(): Slots {
  return [null, null];
}

function serializeContent(slots: Slots): unknown {
  return {
    slots: slots.map((item) => (item
      ? { id: item.id, label: item.label, pictogramUrl: item.pictogramUrl ?? null }
      : null)),
  };
}

function deserializeContent(raw: unknown): Slots {
  const out = defaultSlots();
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

function readShowText(layoutSpec: unknown): boolean {
  const obj = layoutSpec && typeof layoutSpec === 'object' ? layoutSpec as Record<string, unknown> : {};
  const value = obj['showText'];
  return value !== false;
}

function readPaperFormat(layoutSpec: unknown): 'A4' | 'letter' {
  const obj = layoutSpec && typeof layoutSpec === 'object' ? layoutSpec as Record<string, unknown> : {};
  const value = obj['paperFormat'];
  return value === 'letter' ? 'letter' : 'A4';
}

function settingsPaperFormat(): 'A4' | 'letter' {
  return localStorage.getItem(PRINT_PAGE_SIZE_KEY) === 'letter' ? 'letter' : 'A4';
}

function readPrintLayout(layoutSpec: unknown): PrintLayout {
  const obj = layoutSpec && typeof layoutSpec === 'object' ? layoutSpec as Record<string, unknown> : {};
  const value = obj['printLayout'];
  return value === 'top_bottom' ? 'top_bottom' : 'side_by_side';
}

export async function render(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <main class="container page-content visual-supports-page">
      <div class="page-header">
        <div>
          <h1>${t('nav.first_then')}</h1>
          <p class="visual-supports-lead">${t('first_then_page.lead')}</p>
        </div>
      </div>

      <section class="card weekly-schedules ft-schema-card">
        <div class="weekly-schedules__head">
          <h2>${t('first_then_page.schema_title')}</h2>
          <button class="btn btn-primary" id="ft-new-schema">+ ${t('first_then_page.new_schema')}</button>
        </div>
        <div class="visual-supports-persist__row" style="margin:.5rem 0 .75rem 0;">
          <label for="ft-template-select">${t('first_then_page.load_templates')}</label>
          <select id="ft-template-select">
            <option value="">${t('common.loading')}</option>
          </select>
          <button class="btn btn-secondary" id="ft-load-template">${t('first_then_page.load')}</button>
          <span></span>
        </div>

        <div id="ft-schema-list" class="schedule-list"></div>

        <div class="visual-supports-persist__row" style="margin-top:.75rem;">
          <label for="ft-title">${t('first_then_page.current_schema')}</label>
          <input id="ft-title" type="text" maxlength="200" />
          <button class="btn btn-secondary" id="ft-save">${t('visual_support.save')}</button>
          <span></span>
        </div>
      </section>

      <section class="card visual-supports-persist" style="margin-top:1rem;">
        <div class="visual-supports-editor__header">
          <h2 style="margin:0">${t('visual_support.print_options')}</h2>
          <button class="btn btn-primary" id="ft-generate-preview">${t('first_then_page.generate_preview')}</button>
        </div>
        <div class="ft-print-options-row" role="group" aria-label="${t('visual_support.print_options')}">
          <label for="ft-format">${t('first_then_page.paper_format')}:</label>
          <select id="ft-format" class="ft-print-format">
            <option value="A4">A4</option>
            <option value="letter">US Letter</option>
          </select>

          <label for="ft-layout">${t('first_then_page.print_layout')}:</label>
          <select id="ft-layout" class="ft-print-format">
            <option value="side_by_side">${t('first_then_page.layout_side_by_side')}</option>
            <option value="top_bottom">${t('first_then_page.layout_top_bottom')}</option>
          </select>

          <label class="ft-inline-check">
            <input id="ft-show-text" type="checkbox" checked />
            <span>${t('first_then_page.show_text')}</span>
            <span class="ft-help" title="${escapeHtml(t('first_then_page.show_text_help'))}" aria-label="${escapeHtml(t('first_then_page.show_text_help'))}">ⓘ</span>
          </label>

          <label class="ft-inline-check">
            <input id="ft-print-cut" type="checkbox" />
            <span>${t('visual_support.cut_lines')}</span>
            <span class="ft-help" title="${escapeHtml(t('first_then_page.cut_lines_help'))}" aria-label="${escapeHtml(t('first_then_page.cut_lines_help'))}">ⓘ</span>
          </label>

          <label class="ft-inline-check">
            <input id="ft-print-crop" type="checkbox" />
            <span>${t('visual_support.crop_marks')}</span>
            <span class="ft-help" title="${escapeHtml(t('first_then_page.crop_marks_help'))}" aria-label="${escapeHtml(t('first_then_page.crop_marks_help'))}">ⓘ</span>
          </label>
        </div>
        <p id="ft-status" class="status-msg" aria-live="polite"></p>
      </section>

      <section class="card visual-supports-editor" style="margin-top:1rem;">
        <div class="visual-supports-editor__header">
          <h2>${t('first_then_page.preview_title')}</h2>
          <button class="btn btn-primary" id="ft-print">${t('first_then_page.print_a4')}</button>
        </div>
        <p class="visual-supports-editor__hint">
          ${t('first_then_page.hint_line_1')}<br/>
          ${t('first_then_page.hint_line_2')}
        </p>
        <p id="ft-preview-meta" class="status-msg" style="margin-bottom:.5rem"></p>
        <div id="ft-board" class="vs-board vs-board--cols-2 print-vs-first-then"></div>
      </section>

      <div class="modal-backdrop hidden" id="ft-edit-modal">
        <dialog class="modal vs-card-modal ft-edit-modal-card" open role="dialog" aria-modal="true" aria-labelledby="ft-edit-title">
          <h2 id="ft-edit-title">${t('first_then_page.edit_slot')}</h2>

          <div class="pict-tabs" role="tablist" aria-label="Sources">
            <button type="button" class="pict-tab pict-tab--active" id="ft-tab-templates" role="tab" aria-selected="true">${t('visual_support.templates')}</button>
            <button type="button" class="pict-tab" id="ft-tab-saved" role="tab" aria-selected="false">${t('pictogram.tab_saved')}</button>
            <button type="button" class="pict-tab" id="ft-tab-search" role="tab" aria-selected="false">${t('pictogram.tab_search')}</button>
          </div>

          <div id="ft-panel-templates" role="tabpanel">
            <div id="ft-templates-grid" class="vs-card-pict-grid"></div>
          </div>

          <div id="ft-panel-saved" role="tabpanel" class="hidden">
            <div id="ft-saved-grid" class="vs-card-pict-grid"></div>
          </div>

          <div id="ft-panel-search" role="tabpanel" class="hidden">
            <div style="margin-bottom:.5rem">
              <input id="ft-search" type="text" placeholder="${t('pictogram.search_placeholder')}" />
            </div>
            <div id="ft-search-grid" class="vs-card-pict-grid"></div>
          </div>

          <div id="ft-selected" class="vs-card-pict-selected"></div>

          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="ft-modal-cancel">${t('schedule.cancel')}</button>
            <button type="button" class="btn btn-primary" id="ft-modal-add">${t('visual_support.add_custom')}</button>
          </div>
          <p id="ft-modal-error" class="error-msg" aria-live="polite"></p>
        </dialog>
      </div>

      <div class="modal-backdrop hidden" id="ft-unsaved-modal">
        <dialog class="modal" open role="dialog" aria-modal="true" aria-labelledby="ft-unsaved-title">
          <h2 id="ft-unsaved-title">${t('first_then_page.unsaved_title')}</h2>
          <p>${t('first_then_page.unsaved_body')}</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-primary" id="ft-unsaved-save">${t('first_then_page.unsaved_save')}</button>
            <button type="button" class="btn btn-secondary" id="ft-unsaved-discard">${t('first_then_page.unsaved_discard')}</button>
            <button type="button" class="btn btn-secondary" id="ft-unsaved-cancel">${t('schedule.cancel')}</button>
          </div>
        </dialog>
      </div>
    </main>
  `;

  const schemaListEl = container.querySelector<HTMLElement>('#ft-schema-list')!;
  const templateSelect = container.querySelector<HTMLSelectElement>('#ft-template-select')!;
  const titleInput = container.querySelector<HTMLInputElement>('#ft-title')!;
  const formatSelect = container.querySelector<HTMLSelectElement>('#ft-format')!;
  const layoutSelect = container.querySelector<HTMLSelectElement>('#ft-layout')!;
  const showTextInput = container.querySelector<HTMLInputElement>('#ft-show-text')!;
  const printCutInput = container.querySelector<HTMLInputElement>('#ft-print-cut')!;
  const printCropInput = container.querySelector<HTMLInputElement>('#ft-print-crop')!;
  const statusEl = container.querySelector<HTMLElement>('#ft-status')!;
  const previewMetaEl = container.querySelector<HTMLElement>('#ft-preview-meta')!;
  const boardEl = container.querySelector<HTMLElement>('#ft-board')!;

  const editModal = container.querySelector<HTMLElement>('#ft-edit-modal')!;
  const editErrorEl = container.querySelector<HTMLElement>('#ft-modal-error')!;
  const editAddBtn = container.querySelector<HTMLButtonElement>('#ft-modal-add')!;
  const selectedEl = container.querySelector<HTMLElement>('#ft-selected')!;

  const templatesGrid = container.querySelector<HTMLElement>('#ft-templates-grid')!;
  const savedGrid = container.querySelector<HTMLElement>('#ft-saved-grid')!;
  const searchGrid = container.querySelector<HTMLElement>('#ft-search-grid')!;
  const searchInput = container.querySelector<HTMLInputElement>('#ft-search')!;

  const tabTemplates = container.querySelector<HTMLButtonElement>('#ft-tab-templates')!;
  const tabSaved = container.querySelector<HTMLButtonElement>('#ft-tab-saved')!;
  const tabSearch = container.querySelector<HTMLButtonElement>('#ft-tab-search')!;
  const panelTemplates = container.querySelector<HTMLElement>('#ft-panel-templates')!;
  const panelSaved = container.querySelector<HTMLElement>('#ft-panel-saved')!;
  const panelSearch = container.querySelector<HTMLElement>('#ft-panel-search')!;

  const unsavedModal = container.querySelector<HTMLElement>('#ft-unsaved-modal')!;
  const unsavedSaveBtn = container.querySelector<HTMLButtonElement>('#ft-unsaved-save')!;
  const unsavedDiscardBtn = container.querySelector<HTMLButtonElement>('#ft-unsaved-discard')!;
  const unsavedCancelBtn = container.querySelector<HTMLButtonElement>('#ft-unsaved-cancel')!;

  let docs: DocumentDto[] = [];
  let templates: TemplateDto[] = [];
  let currentDocumentId: string | null = null;
  let currentVersion = 0;
  let currentFormat: 'A4' | 'letter' = settingsPaperFormat();
  let currentPrintLayout: PrintLayout = 'side_by_side';
  let showText = true;
  let printCutLines = false;
  let printCropMarks = false;
  let slots: Slots = defaultSlots();
  let hasUnsavedChanges = false;
  let suppressDirtyTracking = false;

  let templateItems: VisualCardItem[] = [];
  let savedItems: VisualCardItem[] = [];

  let editingSlotIndex: number | null = null;
  let pendingSelectedItem: VisualCardItem | null = null;
  let searchDebounce: ReturnType<typeof setTimeout> | null = null;

  let unsavedResolver: ((value: 'save' | 'discard' | 'cancel') => void) | null = null;

  function setStatus(msg: string): void {
    statusEl.textContent = msg;
  }

  function markDirty(): void {
    if (suppressDirtyTracking) return;
    hasUnsavedChanges = true;
  }

  function clearDirty(): void {
    hasUnsavedChanges = false;
  }

  function newSchemaTitle(): string {
    return `${t('nav.first_then')} ${new Date().toLocaleDateString()}`;
  }

  function applyPreviewFlags(): void {
    boardEl.dataset['cutLines'] = printCutLines ? '1' : '0';
    boardEl.dataset['cropMarks'] = printCropMarks ? '1' : '0';
    boardEl.dataset['paperFormat'] = currentFormat;
    boardEl.dataset['printLayout'] = currentPrintLayout;
    boardEl.classList.toggle('vs-board--cols-2', currentPrintLayout === 'side_by_side');
    boardEl.classList.toggle('vs-board--cols-1', currentPrintLayout === 'top_bottom');

    const options: string[] = [];
    options.push(`${t('first_then_page.paper_format')}: ${currentFormat}`);
    options.push(`${t('first_then_page.print_layout')}: ${currentPrintLayout === 'top_bottom' ? t('first_then_page.layout_top_bottom') : t('first_then_page.layout_side_by_side')}`);
    if (showText) options.push(t('first_then_page.show_text'));
    if (printCutLines) options.push(t('visual_support.cut_lines'));
    if (printCropMarks) options.push(t('visual_support.crop_marks'));
    previewMetaEl.textContent = options.join(' • ');
  }

  function rerenderTemplateOptions(): void {
    if (!templates.length) {
      templateSelect.innerHTML = `<option value="">${t('visual_support.none_templates')}</option>`;
      return;
    }

    templateSelect.innerHTML = [
      `<option value="">${t('first_then_page.select_template')}</option>`,
      ...templates.map((tpl) => `<option value="${escapeHtml(tpl.id)}">${escapeHtml(tpl.name)}</option>`),
    ].join('');
  }

  function promptForSchemaName(seed?: string): string | null {
    const proposed = prompt(t('first_then_page.new_schema_prompt'), seed ?? newSchemaTitle());
    if (proposed === null) return null;
    const trimmed = proposed.trim();
    return trimmed.length ? trimmed : newSchemaTitle();
  }

  function firstThenSlotLabel(index: number): string {
    return index === 0 ? t('visual_support.first') : t('visual_support.then');
  }

  function openUnsavedDialog(): Promise<'save' | 'discard' | 'cancel'> {
    unsavedModal.classList.remove('hidden');
    return new Promise((resolve) => {
      unsavedResolver = resolve;
    });
  }

  function closeUnsavedDialog(choice: 'save' | 'discard' | 'cancel'): void {
    unsavedModal.classList.add('hidden');
    const resolver = unsavedResolver;
    unsavedResolver = null;
    resolver?.(choice);
  }

  function rerenderSchemas(): void {
    if (!docs.length) {
      schemaListEl.innerHTML = `<div class="empty-state"><p>${t('visual_support.none_saved')}</p></div>`;
      return;
    }

    schemaListEl.innerHTML = docs.map((doc) => {
      const isCurrent = doc.id === currentDocumentId;
      return `
        <article class="card schedule-card ${isCurrent ? 'schedule-card--current' : ''}">
          <div class="schedule-card__head">
            <div>
              <h3>${escapeHtml(doc.title)}</h3>
            </div>
            <div class="schedule-card__actions">
              <button class="btn btn-secondary btn-sm" data-open-schema="${escapeHtml(doc.id)}">${t('first_then_page.load')}</button>
              <button class="btn btn-danger btn-sm" data-delete-schema="${escapeHtml(doc.id)}">${t('schedule.delete')}</button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    schemaListEl.querySelectorAll<HTMLButtonElement>('[data-open-schema]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset['openSchema'];
        if (id) void runWithUnsavedGuard(async () => {
          await loadDocument(id);
        });
      });
    });

    schemaListEl.querySelectorAll<HTMLButtonElement>('[data-delete-schema]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset['deleteSchema'];
        if (!id) return;
        if (!confirm(t('visual_support.confirm_delete_saved_doc'))) return;

        try {
          await api.delete<void>(`/visual-documents/${id}`);
          await loadSchemas();
          if (currentDocumentId === id) resetForNewSchema();
          setStatus(t('visual_support.saved_doc_deleted'));
        } catch (err) {
          setStatus(errMsg(err));
        }
      });
    });
  }

  function rerenderBoard(): void {
    boardEl.innerHTML = slots.map((item, index) => {
      const header = firstThenSlotLabel(index);
      const hoverAction = item ? t('schedule.edit') : t('visual_support.add');
      return `
        <article class="vs-slot${item ? '' : ' vs-slot--empty-state'}" data-open-slot="${index}" tabindex="0" role="button" aria-label="${escapeHtml(t('first_then_page.open_slot'))}">
          <header class="vs-slot__header">
            <strong>${escapeHtml(header)}</strong>
          </header>

          ${item
            ? `<div class="vs-card">
                <div class="vs-card__main" style="grid-column:1 / -1">
                  ${item.pictogramUrl ? `<img class="vs-card__img" src="${escapeHtml(item.pictogramUrl)}" alt="${escapeHtml(item.label)}" />` : ''}
                  ${showText ? `<span class="vs-card__label">${escapeHtml(item.label)}</span>` : ''}
                </div>
              </div>`
            : `<div class="vs-slot__empty">
                <span class="vs-slot__empty-label">${t('visual_support.empty')}</span>
                <span class="vs-slot__empty-add">+ ${t('visual_support.add')}</span>
              </div>`}

          ${item ? `<div class="vs-slot__hover-action">${escapeHtml(hoverAction)}</div>` : ''}
        </article>
      `;
    }).join('');

    boardEl.querySelectorAll<HTMLElement>('[data-open-slot]').forEach((slotEl) => {
      const open = (delayForEmpty = false) => {
        const slot = Number(slotEl.dataset['openSlot']);
        if (Number.isNaN(slot)) return;
        if (delayForEmpty && slotEl.classList.contains('vs-slot--empty-state')) {
          window.setTimeout(() => openEditModal(slot), 120);
          return;
        }
        openEditModal(slot);
      };
      slotEl.addEventListener('click', () => open(true));
      slotEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(false);
        }
      });
    });

    applyPreviewFlags();
  }

  function setActiveTab(tab: 'templates' | 'saved' | 'search'): void {
    const isTemplates = tab === 'templates';
    const isSaved = tab === 'saved';
    const isSearch = tab === 'search';

    tabTemplates.classList.toggle('pict-tab--active', isTemplates);
    tabTemplates.setAttribute('aria-selected', String(isTemplates));
    tabSaved.classList.toggle('pict-tab--active', isSaved);
    tabSaved.setAttribute('aria-selected', String(isSaved));
    tabSearch.classList.toggle('pict-tab--active', isSearch);
    tabSearch.setAttribute('aria-selected', String(isSearch));

    panelTemplates.classList.toggle('hidden', !isTemplates);
    panelSaved.classList.toggle('hidden', !isSaved);
    panelSearch.classList.toggle('hidden', !isSearch);
  }

  function renderModalSelection(): void {
    if (!pendingSelectedItem) {
      selectedEl.innerHTML = '';
      editAddBtn.disabled = true;
      return;
    }

    selectedEl.innerHTML = `
      <div class="card schedule-detail-selected-card">
        ${pendingSelectedItem.pictogramUrl ? `<img src="${escapeHtml(pendingSelectedItem.pictogramUrl)}" alt="${escapeHtml(pendingSelectedItem.label)}" class="schedule-detail-selected-img" />` : ''}
        <div class="schedule-detail-selected-text">${escapeHtml(pendingSelectedItem.label)}</div>
      </div>
    `;
    editAddBtn.disabled = false;
  }

  function renderItemGrid(target: HTMLElement, items: VisualCardItem[]): void {
    if (!items.length) {
      target.innerHTML = `<p class="pict-grid-span">${t('visual_support.none_saved')}</p>`;
      return;
    }

    target.innerHTML = items.map((item) => `
      <button type="button" class="vs-card-pict-option" data-item-id="${escapeHtml(item.id)}" title="${escapeHtml(item.label)}">
        ${item.pictogramUrl ? `<img src="${escapeHtml(item.pictogramUrl)}" alt="${escapeHtml(item.label)}" class="vs-card-pict-option__img" />` : '<div class="vs-card-pict-option__img"></div>'}
        <span class="vs-card-pict-option__label">${escapeHtml(item.label)}</span>
      </button>
    `).join('');

    target.querySelectorAll<HTMLButtonElement>('.vs-card-pict-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset['itemId'];
        if (!id) return;
        const found = items.find((x) => x.id === id);
        if (!found) return;
        pendingSelectedItem = found;
        renderModalSelection();
      });
    });
  }

  async function searchPictograms(): Promise<void> {
    const q = searchInput.value.trim();
    if (!q) {
      searchGrid.innerHTML = '';
      return;
    }

    const lang = session.user?.language ?? 'en';
    searchGrid.innerHTML = `<p class="pict-grid-span">${t('pictogram.searching')}</p>`;
    try {
      const rows = await api.get<PictogramSearchItem[]>(`/pictograms/search/${encodeURIComponent(lang)}/${encodeURIComponent(q)}`);
      if (!rows.length) {
        searchGrid.innerHTML = `<p class="pict-grid-span">${t('pictogram.no_results')}</p>`;
        return;
      }

      const mapped: VisualCardItem[] = rows.slice(0, 24).map((row) => {
        const label = row.keywords[0] ?? String(row.arasaac_id);
        const url = row.local_file_path || row.image_url || pictogramUrlFromId(String(row.arasaac_id));
        return {
          id: `search:${row.arasaac_id}`,
          label,
          pictogramUrl: url,
        };
      });
      renderItemGrid(searchGrid, mapped);
    } catch (err) {
      searchGrid.innerHTML = `<p class="pict-grid-span error-msg">${escapeHtml(errMsg(err))}</p>`;
    }
  }

  function openEditModal(slotIndex: number): void {
    editingSlotIndex = slotIndex;
    pendingSelectedItem = slots[slotIndex] ?? null;
    editErrorEl.textContent = '';

    renderItemGrid(templatesGrid, templateItems);
    renderItemGrid(savedGrid, savedItems);
    searchInput.value = '';
    searchGrid.innerHTML = '';

    renderModalSelection();
    setActiveTab('templates');
    editModal.classList.remove('hidden');
  }

  function closeEditModal(): void {
    editModal.classList.add('hidden');
    editingSlotIndex = null;
    pendingSelectedItem = null;
    editErrorEl.textContent = '';
    if (searchDebounce) {
      clearTimeout(searchDebounce);
      searchDebounce = null;
    }
  }

  function resetForNewSchema(nameOverride?: string): void {
    suppressDirtyTracking = true;
    currentDocumentId = null;
    currentVersion = 0;
    slots = defaultSlots();
    currentFormat = settingsPaperFormat();
    formatSelect.value = currentFormat;
    currentPrintLayout = 'side_by_side';
    layoutSelect.value = currentPrintLayout;
    showText = true;
    showTextInput.checked = true;
    printCutLines = false;
    printCropMarks = false;
    printCutInput.checked = false;
    printCropInput.checked = false;
    titleInput.value = (nameOverride?.trim().length ? nameOverride : '');
    suppressDirtyTracking = false;
    clearDirty();
    rerenderBoard();
    rerenderSchemas();
  }

  async function loadSchemas(): Promise<void> {
    docs = await api.get<DocumentDto[]>('/visual-documents?type=FIRST_THEN');
    rerenderSchemas();
  }

  async function loadTemplates(): Promise<void> {
    const allTemplates = await api.get<TemplateDto[]>('/visual-documents/templates?type=FIRST_THEN');
    templates = allTemplates.filter((tpl) => tpl.is_system);
    rerenderTemplateOptions();
  }

  async function loadDocument(id: string): Promise<void> {
    try {
      const doc = await api.get<DocumentDto>(`/visual-documents/${id}`);
      suppressDirtyTracking = true;
      currentDocumentId = doc.id;
      currentVersion = doc.version;
      titleInput.value = doc.title;
      slots = deserializeContent(doc.content);
      showText = readShowText(doc.layout_spec);
      showTextInput.checked = showText;
      printCutLines = false;
      printCropMarks = false;
      printCutInput.checked = false;
      printCropInput.checked = false;
      currentFormat = readPaperFormat(doc.layout_spec);
      formatSelect.value = currentFormat;
      currentPrintLayout = readPrintLayout(doc.layout_spec);
      layoutSelect.value = currentPrintLayout;
      suppressDirtyTracking = false;
      clearDirty();
      rerenderBoard();
      rerenderSchemas();
      setStatus(t('visual_support.loaded'));
    } catch (err) {
      suppressDirtyTracking = false;
      setStatus(errMsg(err));
    }
  }

  async function saveSchema(): Promise<boolean> {
    const title = titleInput.value.trim() || newSchemaTitle();
    const layoutSpec = {
      type: 'FIRST_THEN',
      title: 'First / Then',
      slotCount: 2,
      columns: currentPrintLayout === 'top_bottom' ? 1 : 2,
      showText,
      paperFormat: currentFormat,
      printLayout: currentPrintLayout,
      cutLines: printCutLines,
      cropMarks: printCropMarks,
    };

    const payload = {
      title,
      document_type: 'FIRST_THEN',
      locale: session.user?.language ?? 'en',
      layout_spec: layoutSpec,
      content: serializeContent(slots),
    };

    try {
      if (currentDocumentId) {
        const updated = await api.put<DocumentDto>(`/visual-documents/${currentDocumentId}`, {
          title,
          locale: payload.locale,
          layout_spec: layoutSpec,
          content: payload.content,
          expected_version: currentVersion,
        });
        currentVersion = updated.version;
      } else {
        const created = await api.post<DocumentDto>('/visual-documents', payload);
        currentDocumentId = created.id;
        currentVersion = created.version;
      }

      await loadSchemas();
      clearDirty();
      setStatus(t('visual_support.saved'));
      return true;
    } catch (err) {
      setStatus(errMsg(err));
      return false;
    }
  }

  async function runWithUnsavedGuard(next: () => Promise<void> | void): Promise<void> {
    if (!hasUnsavedChanges) {
      await next();
      return;
    }

    const choice = await openUnsavedDialog();
    if (choice === 'cancel') return;

    if (choice === 'save') {
      const ok = await saveSchema();
      if (!ok) return;
    } else {
      clearDirty();
    }

    await next();
  }

  async function cloneTemplateIntoEditor(templateId: string): Promise<void> {
    const template = templates.find((d) => d.id === templateId);
    if (!template) return;

    const existingDoc = docs.find((doc) => normalizeTitle(doc.title) === normalizeTitle(template.name));
    if (existingDoc) {
      await loadDocument(existingDoc.id);
      setStatus(t('first_then_page.template_already_exists_loaded'));
      return;
    }

    try {
      const preview = await api.get<TemplatePreviewDto>(`/visual-documents/templates/${templateId}/preview`);
      suppressDirtyTracking = true;
      currentDocumentId = null;
      currentVersion = 0;
      titleInput.value = preview.title || template.name;
      slots = deserializeContent(preview.content);
      showText = readShowText(preview.layout_spec);
      showTextInput.checked = showText;
      printCutLines = false;
      printCropMarks = false;
      printCutInput.checked = false;
      printCropInput.checked = false;
      currentFormat = readPaperFormat(preview.layout_spec);
      formatSelect.value = currentFormat;
      currentPrintLayout = readPrintLayout(preview.layout_spec);
      layoutSelect.value = currentPrintLayout;
      suppressDirtyTracking = false;
      hasUnsavedChanges = true;
      rerenderBoard();
      rerenderSchemas();
      setStatus(t('first_then_page.template_loaded'));
    } catch (err) {
      suppressDirtyTracking = false;
      setStatus(errMsg(err));
    }
  }

  async function loadActivityCards(): Promise<void> {
    const locale = session.user?.language ?? 'en';
    const cards = await api.get<ActivityCardDto[]>(`/visual-documents/activity-cards?locale=${encodeURIComponent(locale)}`);

    const mapped = cards.map((card) => ({
      id: card.id,
      label: card.label,
      pictogramUrl: resolveCardPictogramUrl(card),
    }));

    templateItems = cards.filter((c) => c.is_system).map((c) => ({
      id: c.id,
      label: c.label,
      pictogramUrl: resolveCardPictogramUrl(c),
    }));

    savedItems = cards.filter((c) => !c.is_system).map((c) => ({
      id: c.id,
      label: c.label,
      pictogramUrl: resolveCardPictogramUrl(c),
    }));

    if (!templateItems.length && mapped.length) {
      templateItems = mapped;
    }
  }

  container.querySelector('#ft-new-schema')?.addEventListener('click', () => {
    void runWithUnsavedGuard(async () => {
      resetForNewSchema('');
      setStatus(t('visual_support.new_ready'));
    });
  });

  container.querySelector('#ft-load-template')?.addEventListener('click', () => {
    const selectedId = templateSelect.value;
    if (!selectedId) return;
    void runWithUnsavedGuard(async () => {
      await cloneTemplateIntoEditor(selectedId);
    });
  });

  container.querySelector('#ft-save')?.addEventListener('click', () => {
    void saveSchema();
  });

  container.querySelector('#ft-generate-preview')?.addEventListener('click', () => {
    rerenderBoard();
    setStatus(t('first_then_page.preview_ready'));
  });

  container.querySelector('#ft-print')?.addEventListener('click', () => {
    printVisualSupport({
      cutLines: printCutLines,
      cropMarks: printCropMarks,
    });
  });

  showTextInput.addEventListener('change', () => {
    showText = showTextInput.checked;
    markDirty();
    rerenderBoard();
  });

  formatSelect.addEventListener('change', () => {
    currentFormat = formatSelect.value === 'letter' ? 'letter' : 'A4';
    markDirty();
    applyPreviewFlags();
  });

  layoutSelect.addEventListener('change', () => {
    currentPrintLayout = layoutSelect.value === 'top_bottom' ? 'top_bottom' : 'side_by_side';
    markDirty();
    applyPreviewFlags();
  });

  printCutInput.addEventListener('change', () => {
    printCutLines = printCutInput.checked;
    markDirty();
    applyPreviewFlags();
  });

  printCropInput.addEventListener('change', () => {
    printCropMarks = printCropInput.checked;
    markDirty();
    applyPreviewFlags();
  });

  titleInput.addEventListener('input', () => {
    markDirty();
  });

  tabTemplates.addEventListener('click', () => setActiveTab('templates'));
  tabSaved.addEventListener('click', () => setActiveTab('saved'));
  tabSearch.addEventListener('click', () => setActiveTab('search'));

  searchInput.addEventListener('input', () => {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      void searchPictograms();
    }, 250);
  });

  container.querySelector('#ft-modal-cancel')?.addEventListener('click', closeEditModal);
  editAddBtn.addEventListener('click', () => {
    if (editingSlotIndex === null || !pendingSelectedItem) {
      editErrorEl.textContent = t('first_then_page.select_item_required');
      return;
    }

    slots[editingSlotIndex] = pendingSelectedItem;
    markDirty();
    rerenderBoard();
    closeEditModal();
  });

  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) closeEditModal();
  });

  unsavedSaveBtn.addEventListener('click', () => closeUnsavedDialog('save'));
  unsavedDiscardBtn.addEventListener('click', () => closeUnsavedDialog('discard'));
  unsavedCancelBtn.addEventListener('click', () => closeUnsavedDialog('cancel'));
  unsavedModal.addEventListener('click', (e) => {
    if (e.target === unsavedModal) closeUnsavedDialog('cancel');
  });

  window.addEventListener('beforeunload', (e) => {
    if (!hasUnsavedChanges) return;
    e.preventDefault();
    e.returnValue = '';
  });

  try {
    await Promise.all([loadSchemas(), loadTemplates(), loadActivityCards()]);
    resetForNewSchema('');
  } catch (err) {
    setStatus(errMsg(err));
  }
}
