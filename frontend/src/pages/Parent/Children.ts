import { t } from '@/i18n/i18n';
import { api, ApiError } from '@/api/client';

interface Child {
  id: string;
  parent_id: string | null;
  display_name: string;
  avatar_path: string | null;
}

export async function render(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <main class="container page-content">
      <div class="page-header">
        <h1>${t('nav.children')}</h1>
        <button class="btn btn-primary" id="btn-add-child">+ ${t('children.add')}</button>
      </div>
      <div id="children-grid" class="child-grid"></div>
      <p id="children-status" class="error-msg" aria-live="polite"></p>
    </main>

    <div class="modal-backdrop hidden" id="child-modal">
      <dialog class="modal" open role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">${t('children.add')}</h2>

        <!-- Step 1: enter name -->
        <form id="child-form" class="form-stack children-form">
          <input type="hidden" id="child-id" />
          <div>
            <label for="display-name">${t('children.name_label')}</label>
            <input id="display-name" type="text" required placeholder="${t('children.name_placeholder')}" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="btn-cancel">${t('schedule.cancel')}</button>
            <button type="submit" class="btn btn-primary" id="btn-save">${t('schedule.save')}</button>
          </div>
          <p id="modal-error" class="error-msg" aria-live="polite"></p>
        </form>

      </dialog>
    </div>

  `;

  const grid = container.querySelector<HTMLElement>('#children-grid')!;
  const childModal = container.querySelector<HTMLElement>('#child-modal')!;
  const childForm = container.querySelector<HTMLFormElement>('#child-form')!;
  const modalError = container.querySelector<HTMLParagraphElement>('#modal-error')!;
  const childrenStatus = container.querySelector<HTMLParagraphElement>('#children-status')!;
  let children: Child[] = [];

  async function loadChildren(): Promise<void> {
    childrenStatus.textContent = '';
    grid.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';
    try {
      children = await api.get<Child[]>('/children');
      renderGrid();
    } catch {
      grid.innerHTML = `<p class="error-msg">${t('errors.generic')}</p>`;
    }
  }

  function renderGrid(): void {
    if (children.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <span class="empty-state__icon">👶</span>
          <p>${t('children.empty')}</p>
          <button class="btn btn-primary" id="btn-empty-add">${t('children.empty_add')}</button>
        </div>`;
      grid.querySelector('#btn-empty-add')?.addEventListener('click', openAddModal);
      return;
    }
    grid.innerHTML = children.map((c) => `
      <div class="child-card card" data-id="${c.id}">
        <div class="child-card__avatar">
          ${c.avatar_path
            ? `<img src="${c.avatar_path}" alt="${c.display_name}" />`
            : `<span>${c.display_name.charAt(0).toUpperCase()}</span>`}
        </div>
        <h3 class="child-card__name">${c.display_name}</h3>
        <div class="child-card__actions">
          <a class="btn btn-secondary btn-sm" href="/weeklyschedule?child=${c.id}">${t('nav.calendar')}</a>
          <a class="btn btn-secondary btn-sm" href="/child-devices">${t('nav.child_devices')}</a>
          <button class="btn btn-secondary btn-sm js-edit" data-id="${c.id}" data-name="${c.display_name}">${t('schedule.edit')}</button>
          <button class="btn btn-secondary btn-sm js-delete" data-id="${c.id}">${t('schedule.delete')}</button>
        </div>
      </div>`).join('');

    grid.querySelectorAll<HTMLButtonElement>('.js-edit').forEach((btn) =>
      btn.addEventListener('click', () => openEditModal(btn.dataset['id']!, btn.dataset['name']!)));
    grid.querySelectorAll<HTMLButtonElement>('.js-delete').forEach((btn) =>
      btn.addEventListener('click', () => deleteChild(btn.dataset['id']!)));
  }

  function openAddModal(): void {
    container.querySelector<HTMLElement>('#modal-title')!.textContent = t('children.add');
    childForm.reset();
    childForm.querySelector<HTMLInputElement>('#child-id')!.value = '';
    modalError.textContent = '';
    childModal.classList.remove('hidden');
  }

  function openEditModal(id: string, name: string): void {
    container.querySelector<HTMLElement>('#modal-title')!.textContent = t('children.edit');
    childForm.querySelector<HTMLInputElement>('#child-id')!.value = id;
    childForm.querySelector<HTMLInputElement>('#display-name')!.value = name;
    modalError.textContent = '';
    childModal.classList.remove('hidden');
  }

  childForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id   = childForm.querySelector<HTMLInputElement>('#child-id')!.value;
    const name = childForm.querySelector<HTMLInputElement>('#display-name')!.value.trim();
    const btn  = childForm.querySelector<HTMLButtonElement>('#btn-save')!;
    btn.disabled = true;
    modalError.textContent = '';
    try {
      if (id) {
        await api.put(`/children/${id}`, { display_name: name });
      } else {
        await api.post<Child>('/children', { display_name: name });
      }
      childModal.classList.add('hidden');
      await loadChildren();
    } catch (err) {
      modalError.textContent = err instanceof ApiError ? err.message : t('errors.generic');
    } finally { btn.disabled = false; }
  });

  async function deleteChild(id: string): Promise<void> {
    if (!confirm(t('children.delete_confirm'))) return;
    try { await api.delete(`/children/${id}`); await loadChildren(); }
    catch { childrenStatus.textContent = t('errors.generic'); }
  }

  container.querySelector('#btn-add-child')?.addEventListener('click', openAddModal);
  container.querySelector('#btn-cancel')?.addEventListener('click', () => childModal.classList.add('hidden'));
  childModal.addEventListener('click', (e) => { if (e.target === childModal) childModal.classList.add('hidden'); });

  await loadChildren();
}
