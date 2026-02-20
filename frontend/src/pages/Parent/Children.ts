import { t } from '@/i18n/i18n';
import { api, ApiError } from '@/api/client';
import { renderQrCode, qrCodeDataUrl } from '@/components/QrCode';

interface Child {
  id: string;
  display_name: string;
  avatar_path: string | null;
}
interface QrToken { token: string; url: string; }

export async function render(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <main class="container page-content">
      <div class="page-header">
        <h1>${t('nav.children')}</h1>
        <button class="btn btn-primary" id="btn-add-child">+ Add child</button>
      </div>
      <div id="children-grid" class="child-grid"></div>
    </main>

    <div class="modal-backdrop hidden" id="child-modal">
      <dialog class="modal" open>
        <h2 id="modal-title">Add child</h2>
        <form id="child-form" class="form-stack" style="margin-top:1.25rem">
          <input type="hidden" id="child-id" />
          <div>
            <label for="display-name">Display name</label>
            <input id="display-name" type="text" required />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="btn-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-save">Save</button>
          </div>
          <p id="modal-error" class="error-msg" aria-live="polite"></p>
        </form>
      </dialog>
    </div>

    <div class="modal-backdrop hidden" id="qr-modal">
      <dialog class="modal" open style="text-align:center">
        <h2 id="qr-modal-name"></h2>
        <div id="qr-canvas" style="margin:1.5rem auto;width:fit-content"></div>
        <p style="font-size:.875rem;color:var(--text-muted);margin-bottom:1rem">
          Print or show this QR code to the child to log in.
        </p>
        <div style="display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap">
          <a id="qr-download" class="btn btn-secondary" download="qr-login.png">Download PNG</a>
          <button class="btn btn-secondary" id="btn-qr-close">Close</button>
        </div>
      </dialog>
    </div>
  `;

  const grid = container.querySelector<HTMLElement>('#children-grid')!;
  const childModal = container.querySelector<HTMLElement>('#child-modal')!;
  const qrModal = container.querySelector<HTMLElement>('#qr-modal')!;
  const childForm = container.querySelector<HTMLFormElement>('#child-form')!;
  const modalError = container.querySelector<HTMLParagraphElement>('#modal-error')!;
  let children: Child[] = [];

  async function loadChildren(): Promise<void> {
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
          <p>No children yet.</p>
          <button class="btn btn-primary" id="btn-empty-add">Add your first child</button>
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
          <button class="btn btn-secondary btn-sm js-qr" data-id="${c.id}" data-name="${c.display_name}">📷 QR code</button>
          <a class="btn btn-secondary btn-sm" href="/calendar?child=${c.id}">${t('nav.calendar')}</a>
          <button class="btn btn-secondary btn-sm js-edit" data-id="${c.id}" data-name="${c.display_name}">Edit</button>
          <button class="btn btn-secondary btn-sm js-delete" data-id="${c.id}">Delete</button>
        </div>
      </div>`).join('');

    grid.querySelectorAll<HTMLButtonElement>('.js-qr').forEach((btn) =>
      btn.addEventListener('click', () => openQrModal(btn.dataset['id']!, btn.dataset['name']!)));
    grid.querySelectorAll<HTMLButtonElement>('.js-edit').forEach((btn) =>
      btn.addEventListener('click', () => openEditModal(btn.dataset['id']!, btn.dataset['name']!)));
    grid.querySelectorAll<HTMLButtonElement>('.js-delete').forEach((btn) =>
      btn.addEventListener('click', () => deleteChild(btn.dataset['id']!)));
  }

  function openAddModal(): void {
    container.querySelector<HTMLElement>('#modal-title')!.textContent = 'Add child';
    childForm.reset();
    childForm.querySelector<HTMLInputElement>('#child-id')!.value = '';
    modalError.textContent = '';
    childModal.classList.remove('hidden');
  }

  function openEditModal(id: string, name: string): void {
    container.querySelector<HTMLElement>('#modal-title')!.textContent = 'Edit child';
    childForm.querySelector<HTMLInputElement>('#child-id')!.value = id;
    childForm.querySelector<HTMLInputElement>('#display-name')!.value = name;
    modalError.textContent = '';
    childModal.classList.remove('hidden');
  }

  async function openQrModal(childId: string, name: string): Promise<void> {
    qrModal.querySelector<HTMLElement>('#qr-modal-name')!.textContent = name;
    const canvas = qrModal.querySelector<HTMLElement>('#qr-canvas')!;
    canvas.innerHTML = '';
    qrModal.classList.remove('hidden');
    try {
      const token = await api.get<QrToken>(`/children/${childId}/qr-token`);
      await renderQrCode(canvas, token.url);
      const dl = qrModal.querySelector<HTMLAnchorElement>('#qr-download')!;
      dl.href = await qrCodeDataUrl(token.url);
    } catch {
      canvas.innerHTML = `<p class="error-msg">Failed to load QR code.</p>`;
    }
  }

  childForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = childForm.querySelector<HTMLInputElement>('#child-id')!.value;
    const name = childForm.querySelector<HTMLInputElement>('#display-name')!.value.trim();
    const btn = childForm.querySelector<HTMLButtonElement>('#btn-save')!;
    btn.disabled = true;
    modalError.textContent = '';
    try {
      if (id) { await api.put(`/children/${id}`, { display_name: name }); }
      else    { await api.post('/children', { display_name: name }); }
      childModal.classList.add('hidden');
      await loadChildren();
    } catch (err) {
      modalError.textContent = err instanceof ApiError ? err.message : t('errors.generic');
    } finally { btn.disabled = false; }
  });

  async function deleteChild(id: string): Promise<void> {
    if (!confirm('Delete this child? This cannot be undone.')) return;
    try { await api.delete(`/children/${id}`); await loadChildren(); }
    catch { alert(t('errors.generic')); }
  }

  container.querySelector('#btn-add-child')?.addEventListener('click', openAddModal);
  container.querySelector('#btn-cancel')?.addEventListener('click', () => childModal.classList.add('hidden'));
  container.querySelector('#btn-qr-close')?.addEventListener('click', () => qrModal.classList.add('hidden'));
  childModal.addEventListener('click', (e) => { if (e.target === childModal) childModal.classList.add('hidden'); });
  qrModal.addEventListener('click', (e) => { if (e.target === qrModal) qrModal.classList.add('hidden'); });

  await loadChildren();
}
