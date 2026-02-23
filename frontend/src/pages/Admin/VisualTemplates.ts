import { api, ApiError } from '@/api/client';

type VisualDocumentType =
  | 'DAILY_SCHEDULE'
  | 'WEEKLY_SCHEDULE'
  | 'FIRST_THEN'
  | 'CHOICE_BOARD'
  | 'ROUTINE_STEPS'
  | 'EMOTION_CARDS'
  | 'AAC_BOARD'
  | 'REWARD_TRACKER';

interface TemplateDto {
  id: string;
  owner_id: string | null;
  name: string;
  document_type: VisualDocumentType;
  locale: string;
  is_system: boolean;
  layout_spec: unknown;
  created_at: string;
  updated_at: string;
}

const ALL_TYPES: VisualDocumentType[] = [
  'DAILY_SCHEDULE',
  'WEEKLY_SCHEDULE',
  'FIRST_THEN',
  'CHOICE_BOARD',
  'ROUTINE_STEPS',
  'EMOTION_CARDS',
  'AAC_BOARD',
  'REWARD_TRACKER',
];

function defaultLayoutSpec(type: VisualDocumentType): Record<string, unknown> {
  switch (type) {
    case 'DAILY_SCHEDULE':
      return { type, title: 'Daily schedule', slotCount: 8, columns: 1 };
    case 'FIRST_THEN':
      return { type, title: 'First / Then', slotCount: 2, columns: 2 };
    case 'CHOICE_BOARD':
      return { type, title: 'Choice board', slotCount: 4, columns: 2 };
    case 'ROUTINE_STEPS':
      return { type, title: 'Routine steps', slotCount: 6, columns: 1 };
    case 'WEEKLY_SCHEDULE':
      return { type, title: 'Weekly schedule', slotCount: 7, columns: 7 };
    case 'EMOTION_CARDS':
      return { type, title: 'Emotion cards', slotCount: 6, columns: 3 };
    case 'AAC_BOARD':
      return { type, title: 'AAC board', slotCount: 12, columns: 4 };
    case 'REWARD_TRACKER':
      return { type, title: 'Reward tracker', slotCount: 10, columns: 5 };
    default:
      return { type, title: 'Visual template', slotCount: 4, columns: 2 };
  }
}

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function render(container: HTMLElement): Promise<void> {
  const state = {
    items: [] as TemplateDto[],
    selectedType: 'DAILY_SCHEDULE' as VisualDocumentType,
    message: '',
    error: '',
    loading: false,
  };

  const listElId = 'admin-visual-template-list';
  const msgElId = 'admin-visual-template-msg';
  const errElId = 'admin-visual-template-err';

  container.innerHTML = `
    <main class="container page-content">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
        <h1>Visual template manager</h1>
        <a class="btn btn-secondary" href="/admin">Back to admin</a>
      </div>

      <section class="card" style="padding:1rem;margin-bottom:1rem;display:grid;gap:.75rem">
        <h2 style="margin:0">Create template</h2>
        <div style="display:grid;gap:.5rem;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));align-items:end">
          <label style="display:grid;gap:.25rem">
            <span>Name</span>
            <input id="tpl-create-name" class="input" type="text" placeholder="e.g. Morning routine" />
          </label>

          <label style="display:grid;gap:.25rem">
            <span>Document type</span>
            <select id="tpl-create-type" class="input">
              ${ALL_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}
            </select>
          </label>

          <label style="display:grid;gap:.25rem">
            <span>Locale</span>
            <input id="tpl-create-locale" class="input" type="text" value="en" maxlength="8" />
          </label>
        </div>

        <label style="display:grid;gap:.25rem">
          <span>Layout spec (JSON)</span>
          <textarea id="tpl-create-layout" class="input" rows="6"></textarea>
        </label>

        <div>
          <button id="tpl-create-btn" class="btn btn-primary">Create template</button>
        </div>
      </section>

      <section class="card" style="padding:1rem">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem">
          <h2 style="margin:0">Existing templates</h2>
          <button id="tpl-refresh-btn" class="btn btn-secondary btn-sm">Refresh</button>
        </div>

        <p id="${msgElId}" style="margin:0 0 .5rem 0;color:var(--success, #1f7a1f)"></p>
        <p id="${errElId}" style="margin:0 0 .5rem 0;color:var(--danger, #b00020)"></p>

        <div id="${listElId}"><div class="empty-state"><p>Loading…</p></div></div>
      </section>
    </main>
  `;

  const createName = container.querySelector<HTMLInputElement>('#tpl-create-name')!;
  const createType = container.querySelector<HTMLSelectElement>('#tpl-create-type')!;
  const createLocale = container.querySelector<HTMLInputElement>('#tpl-create-locale')!;
  const createLayout = container.querySelector<HTMLTextAreaElement>('#tpl-create-layout')!;
  const createBtn = container.querySelector<HTMLButtonElement>('#tpl-create-btn')!;
  const refreshBtn = container.querySelector<HTMLButtonElement>('#tpl-refresh-btn')!;
  const listEl = container.querySelector<HTMLElement>(`#${listElId}`)!;
  const msgEl = container.querySelector<HTMLElement>(`#${msgElId}`)!;
  const errEl = container.querySelector<HTMLElement>(`#${errElId}`)!;

  const syncCreateLayoutToType = () => {
    state.selectedType = createType.value as VisualDocumentType;
    createLayout.value = JSON.stringify(defaultLayoutSpec(state.selectedType), null, 2);
  };

  function setStatus(message = '', error = ''): void {
    state.message = message;
    state.error = error;
    msgEl.textContent = state.message;
    errEl.textContent = state.error;
  }

  function renderList(): void {
    if (state.loading) {
      listEl.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';
      return;
    }

    if (!state.items.length) {
      listEl.innerHTML = '<div class="empty-state"><p>No visual templates yet.</p></div>';
      return;
    }

    listEl.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Locale</th>
              <th>System</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${state.items.map((item) => `
              <tr>
                <td><strong>${esc(item.name)}</strong></td>
                <td>${esc(item.document_type)}</td>
                <td>${esc(item.locale)}</td>
                <td>${item.is_system ? 'Yes' : 'No'}</td>
                <td>${new Date(item.updated_at).toLocaleString()}</td>
                <td style="display:flex;gap:.375rem;flex-wrap:wrap">
                  <button class="btn btn-secondary btn-sm js-edit" data-id="${item.id}">Edit</button>
                  <button class="btn btn-danger btn-sm js-delete" data-id="${item.id}">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    listEl.querySelectorAll<HTMLButtonElement>('.js-edit').forEach((btn) => {
      btn.addEventListener('click', () => editTemplate(btn.dataset['id'] ?? ''));
    });

    listEl.querySelectorAll<HTMLButtonElement>('.js-delete').forEach((btn) => {
      btn.addEventListener('click', () => deleteTemplate(btn.dataset['id'] ?? ''));
    });
  }

  async function loadTemplates(): Promise<void> {
    state.loading = true;
    renderList();
    try {
      state.items = await api.get<TemplateDto[]>('/visual-documents/templates');
      setStatus();
    } catch {
      setStatus('', 'Failed to load templates.');
    } finally {
      state.loading = false;
      renderList();
    }
  }

  async function createTemplate(): Promise<void> {
    const name = createName.value.trim();
    const locale = createLocale.value.trim() || 'en';
    if (!name) {
      setStatus('', 'Name is required.');
      return;
    }

    let layoutSpec: unknown;
    try {
      layoutSpec = JSON.parse(createLayout.value);
    } catch {
      setStatus('', 'Layout spec must be valid JSON.');
      return;
    }

    createBtn.disabled = true;
    try {
      await api.post<TemplateDto>('/visual-documents/templates', {
        name,
        document_type: createType.value,
        locale,
        is_system: true,
        layout_spec: layoutSpec,
      });
      createName.value = '';
      setStatus('Template created.');
      await loadTemplates();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to create template.';
      setStatus('', message);
    } finally {
      createBtn.disabled = false;
    }
  }

  async function editTemplate(id: string): Promise<void> {
    const tpl = state.items.find((item) => item.id === id);
    if (!tpl) return;

    const nextName = prompt('Template name', tpl.name);
    if (nextName === null) return;

    const nextLocale = prompt('Locale', tpl.locale);
    if (nextLocale === null) return;

    const nextLayoutRaw = prompt('Layout spec JSON', JSON.stringify(tpl.layout_spec));
    if (nextLayoutRaw === null) return;

    let nextLayout: unknown;
    try {
      nextLayout = JSON.parse(nextLayoutRaw);
    } catch {
      setStatus('', 'Layout spec must be valid JSON.');
      return;
    }

    try {
      await api.put<TemplateDto>(`/visual-documents/templates/${id}`, {
        name: nextName.trim(),
        locale: nextLocale.trim() || 'en',
        layout_spec: nextLayout,
      });
      setStatus('Template updated.');
      await loadTemplates();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to update template.';
      setStatus('', message);
    }
  }

  async function deleteTemplate(id: string): Promise<void> {
    const ok = confirm('Delete this template? This cannot be undone.');
    if (!ok) return;

    try {
      await api.delete<void>(`/visual-documents/templates/${id}`);
      setStatus('Template deleted.');
      await loadTemplates();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to delete template.';
      setStatus('', message);
    }
  }

  createType.addEventListener('change', syncCreateLayoutToType);
  createBtn.addEventListener('click', createTemplate);
  refreshBtn.addEventListener('click', () => {
    void loadTemplates();
  });

  syncCreateLayoutToType();
  await loadTemplates();
}
