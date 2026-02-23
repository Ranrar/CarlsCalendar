import { t } from '@/i18n/i18n';
import { api, ApiError } from '@/api/client';
import { renderQrCode, qrCodeDataUrl } from '@/components/QrCode';
import { formatDateTimeForUser } from '@/utils/datetime';

interface Child {
  id: string;
  parent_id: string | null;
  display_name: string;
  avatar_path: string | null;
}
interface QrToken { id: string; token: string; is_active: boolean; }
interface ChildDevice {
  id: string;
  parent_user_id: string;
  child_id: string;
  created_at: string;
  last_used_at: string | null;
  user_agent_hash: string | null;
  ip_range: string | null;
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

    <div class="modal-backdrop hidden" id="qr-modal">
      <dialog class="modal children-qr-modal" open role="dialog" aria-modal="true" aria-labelledby="qr-modal-name">
        <h2 id="qr-modal-name"></h2>
        <div id="qr-canvas" class="children-qr-canvas"></div>
        <p class="children-qr-help">
          ${t('children.qr_help')}
        </p>
        <div class="children-qr-actions">
          <a id="qr-download" class="btn btn-secondary" download="qr-login.png">${t('children.download_png')}</a>
          <button class="btn btn-secondary" id="btn-qr-close">${t('pictogram_library.close')}</button>
        </div>
      </dialog>
    </div>

    <div class="modal-backdrop hidden" id="devices-modal">
      <dialog class="modal children-devices-modal" open role="dialog" aria-modal="true" aria-labelledby="devices-modal-title">
        <h2 id="devices-modal-title"></h2>
        <p class="children-devices-help">
          ${t('children.devices_help')}
        </p>
        <div id="devices-list" class="children-devices-list"></div>
        <p id="devices-error" class="error-msg" aria-live="polite"></p>
        <div class="modal-actions children-devices-actions">
          <button class="btn btn-secondary" id="btn-revoke-all-devices">${t('children.revoke_all')}</button>
          <button class="btn btn-secondary" id="btn-devices-close">${t('pictogram_library.close')}</button>
        </div>
      </dialog>
    </div>
  `;

  const grid = container.querySelector<HTMLElement>('#children-grid')!;
  const childModal = container.querySelector<HTMLElement>('#child-modal')!;
  const qrModal = container.querySelector<HTMLElement>('#qr-modal')!;
  const devicesModal = container.querySelector<HTMLElement>('#devices-modal')!;
  const childForm = container.querySelector<HTMLFormElement>('#child-form')!;
  const modalError = container.querySelector<HTMLParagraphElement>('#modal-error')!;
  const devicesError = container.querySelector<HTMLParagraphElement>('#devices-error')!;
  const childrenStatus = container.querySelector<HTMLParagraphElement>('#children-status')!;
  let devicesChildId = '';
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
          <button class="btn btn-secondary btn-sm js-qr" data-id="${c.id}" data-name="${c.display_name}">📷 ${t('children.qr_code')}</button>
          <button class="btn btn-secondary btn-sm js-devices" data-id="${c.id}" data-name="${c.display_name}">${t('children.devices')}</button>
          <a class="btn btn-secondary btn-sm" href="/calendar?child=${c.id}">${t('nav.calendar')}</a>
          <button class="btn btn-secondary btn-sm js-edit" data-id="${c.id}" data-name="${c.display_name}">${t('schedule.edit')}</button>
          <button class="btn btn-secondary btn-sm js-delete" data-id="${c.id}">${t('schedule.delete')}</button>
        </div>
      </div>`).join('');

    grid.querySelectorAll<HTMLButtonElement>('.js-qr').forEach((btn) =>
      btn.addEventListener('click', () => openQrModal(btn.dataset['id']!, btn.dataset['name']!)));
    grid.querySelectorAll<HTMLButtonElement>('.js-edit').forEach((btn) =>
      btn.addEventListener('click', () => openEditModal(btn.dataset['id']!, btn.dataset['name']!)));
    grid.querySelectorAll<HTMLButtonElement>('.js-delete').forEach((btn) =>
      btn.addEventListener('click', () => deleteChild(btn.dataset['id']!)));
    grid.querySelectorAll<HTMLButtonElement>('.js-devices').forEach((btn) =>
      btn.addEventListener('click', () => openDevicesModal(btn.dataset['id']!, btn.dataset['name']!)));
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

  async function openQrModal(childId: string, name: string): Promise<void> {
    qrModal.querySelector<HTMLElement>('#qr-modal-name')!.textContent = name;
    const canvas = qrModal.querySelector<HTMLElement>('#qr-canvas')!;
    canvas.innerHTML = '';
    qrModal.classList.remove('hidden');
    try {
      const qrData = await api.get<QrToken>(`/children/${childId}/qr`);
      const loginUrl = `${window.location.origin}/qr-login?token=${qrData.token}`;
      await renderQrCode(canvas, loginUrl);
      const dl = qrModal.querySelector<HTMLAnchorElement>('#qr-download')!;
      dl.href = await qrCodeDataUrl(loginUrl);
    } catch {
      canvas.innerHTML = `<p class="error-msg">${t('children.load_qr_failed')}</p>`;
    }
  }

  async function openDevicesModal(childId: string, name: string): Promise<void> {
    devicesChildId = childId;
    devicesModal.querySelector<HTMLElement>('#devices-modal-title')!.textContent = t('children.devices_title', { name });
    devicesError.textContent = '';
    devicesModal.classList.remove('hidden');
    await loadDevices();
  }

  async function loadDevices(): Promise<void> {
    const mount = devicesModal.querySelector<HTMLElement>('#devices-list')!;
    devicesError.textContent = '';
    mount.innerHTML = `<div class="empty-state"><p>${t('children.loading_devices')}</p></div>`;
    try {
      const rows = await api.get<ChildDevice[]>(`/children/${devicesChildId}/devices`);
      if (rows.length === 0) {
        mount.innerHTML = `<div class="empty-state"><p>${t('children.no_active_devices')}</p></div>`;
        return;
      }
      mount.innerHTML = rows.map((d) => `
        <div class="card children-device-card">
          <div class="children-device-row">
            <div>
              <div><strong>${t('children.device_label', { id: d.id.slice(0, 8) })}</strong></div>
              <div class="children-device-meta">
                ${t('children.created')}: ${formatDateTimeForUser(d.created_at)}<br/>
                ${t('children.last_used')}: ${formatDateTimeForUser(d.last_used_at)}
              </div>
            </div>
            <button class="btn btn-secondary btn-sm js-revoke-device" data-device-id="${d.id}">${t('children.revoke')}</button>
          </div>
        </div>
      `).join('');

      mount.querySelectorAll<HTMLButtonElement>('.js-revoke-device').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset['deviceId'];
          if (!id) return;
          try {
            await api.delete(`/children/${devicesChildId}/devices/${id}`);
            await loadDevices();
          } catch {
            devicesError.textContent = t('children.revoke_failed');
          }
        });
      });
    } catch {
      mount.innerHTML = `<p class="error-msg">${t('children.load_devices_failed')}</p>`;
    }
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
  container.querySelector('#btn-qr-close')?.addEventListener('click', () => qrModal.classList.add('hidden'));
  container.querySelector('#btn-devices-close')?.addEventListener('click', () => devicesModal.classList.add('hidden'));
  container.querySelector('#btn-revoke-all-devices')?.addEventListener('click', async () => {
    if (!devicesChildId) return;
    if (!confirm(t('children.revoke_all_confirm'))) return;
    try {
      await api.delete(`/children/${devicesChildId}/devices`);
      await loadDevices();
    } catch {
      devicesError.textContent = t('children.revoke_all_failed');
    }
  });
  childModal.addEventListener('click', (e) => { if (e.target === childModal) childModal.classList.add('hidden'); });
  qrModal.addEventListener('click', (e) => { if (e.target === qrModal) qrModal.classList.add('hidden'); });
  devicesModal.addEventListener('click', (e) => { if (e.target === devicesModal) devicesModal.classList.add('hidden'); });

  await loadChildren();
}
