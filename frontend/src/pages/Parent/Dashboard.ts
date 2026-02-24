import { t } from '@/i18n/i18n';
import { api, ApiError } from '@/api/client';

interface Child {
  id: string;
  display_name: string;
  avatar_path: string | null;
}

function errMsg(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return t('errors.generic');
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function render(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <main class="container page-content">
      <div class="page-header">
        <h1>${t('nav.dashboard')}</h1>
        <button class="btn btn-primary" id="btn-add-child">+ ${t('children.add')}</button>
      </div>

      <section class="card" style="padding:1rem">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.75rem;flex-wrap:wrap">
          <h2 style="margin:0">${t('nav.children')}</h2>
          <a class="btn btn-secondary btn-sm" href="/child-devices">${t('nav.child_devices')}</a>
        </div>
        <div id="children-list" class="dashboard-children-grid">
          <p>${t('common.loading')}</p>
        </div>
        <p id="children-error" class="error-msg" aria-live="polite"></p>
      </section>
    </main>

    <div class="modal-backdrop hidden" id="child-modal">
      <dialog class="modal" open role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">${t('children.add')}</h2>
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

  const list = container.querySelector<HTMLElement>('#children-list')!;
  const childrenError = container.querySelector<HTMLParagraphElement>('#children-error')!;
  const childModal = container.querySelector<HTMLElement>('#child-modal')!;
  const childForm = container.querySelector<HTMLFormElement>('#child-form')!;
  const modalError = container.querySelector<HTMLParagraphElement>('#modal-error')!;

  let children: Child[] = [];

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

  async function deleteChild(id: string): Promise<void> {
    if (!confirm(t('children.delete_confirm'))) return;
    childrenError.textContent = '';
    try {
      await api.delete(`/children/${id}`);
      await loadChildren();
    } catch (err) {
      childrenError.textContent = errMsg(err);
    }
  }

  function renderChildren(): void {
    if (children.length === 0) {
      list.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <span class="empty-state__icon">👶</span>
          <p>${escapeHtml(t('children.empty'))}</p>
          <button class="btn btn-primary" id="btn-empty-add">${escapeHtml(t('children.empty_add'))}</button>
        </div>
      `;
      list.querySelector('#btn-empty-add')?.addEventListener('click', openAddModal);
      return;
    }

    list.innerHTML = children.map((child) => `
      <div class="card">
        <h3 style="margin:0">${escapeHtml(child.display_name)}</h3>
        <p class="dashboard-children-links">
          <a href="/weeklyschedule?child=${encodeURIComponent(child.id)}">${escapeHtml(t('nav.weekly_schedule'))}</a>
        </p>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem">
          <button class="btn btn-secondary btn-sm js-edit" data-id="${escapeHtml(child.id)}" data-name="${escapeHtml(child.display_name)}">${escapeHtml(t('schedule.edit'))}</button>
          <button class="btn btn-secondary btn-sm js-delete" data-id="${escapeHtml(child.id)}">${escapeHtml(t('schedule.delete'))}</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll<HTMLButtonElement>('.js-edit').forEach((btn) => {
      btn.addEventListener('click', () => openEditModal(btn.dataset['id']!, btn.dataset['name']!));
    });
    list.querySelectorAll<HTMLButtonElement>('.js-delete').forEach((btn) => {
      btn.addEventListener('click', () => deleteChild(btn.dataset['id']!));
    });
  }

  async function loadChildren(): Promise<void> {
    childrenError.textContent = '';
    list.innerHTML = `<p>${t('common.loading')}</p>`;
    try {
      children = await api.get<Child[]>('/children');
      renderChildren();
    } catch (err) {
      list.innerHTML = `<p class="error-msg">${escapeHtml(errMsg(err))}</p>`;
    }
  }

  childForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    modalError.textContent = '';
    const id = childForm.querySelector<HTMLInputElement>('#child-id')!.value;
    const name = childForm.querySelector<HTMLInputElement>('#display-name')!.value.trim();
    const btn = childForm.querySelector<HTMLButtonElement>('#btn-save')!;
    btn.disabled = true;
    try {
      if (id) await api.put(`/children/${id}`, { display_name: name });
      else await api.post('/children', { display_name: name });
      childModal.classList.add('hidden');
      await loadChildren();
    } catch (err) {
      modalError.textContent = errMsg(err);
    } finally {
      btn.disabled = false;
    }
  });

  container.querySelector('#btn-add-child')?.addEventListener('click', openAddModal);
  container.querySelector('#btn-cancel')?.addEventListener('click', () => childModal.classList.add('hidden'));

  await loadChildren();
}
