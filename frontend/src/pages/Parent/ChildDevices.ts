import { t } from '@/i18n/i18n';
import { api } from '@/api/client';
import { renderQrCode, qrCodeDataUrl } from '@/components/QrCode';
import { formatDateTimeForUser } from '@/utils/datetime';

interface Child {
  id: string;
  parent_id: string | null;
  display_name: string;
  avatar_path: string | null;
}

interface QrToken {
  id: string;
  token: string;
  is_active: boolean;
}

interface ChildDevice {
  id: string;
  parent_user_id: string;
  child_id: string;
  created_at: string;
  last_used_at: string | null;
  user_agent_hash: string | null;
  ip_range: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function latestLastUsed(rows: ChildDevice[]): string | null {
  const values = rows
    .map((r) => r.last_used_at)
    .filter((v): v is string => Boolean(v))
    .map((v) => Date.parse(v))
    .filter((v) => Number.isFinite(v));

  if (values.length === 0) return null;
  const max = Math.max(...values);
  return Number.isFinite(max) ? new Date(max).toISOString() : null;
}

export async function render(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <main class="container page-content">
      <div class="page-header">
        <h1>${t('nav.child_devices')}</h1>
      </div>

      <div id="children-grid" class="child-grid"></div>
      <p id="children-status" class="error-msg" aria-live="polite"></p>
    </main>

    <div class="modal-backdrop hidden" id="qr-modal">
      <dialog class="modal children-qr-modal" open role="dialog" aria-modal="true" aria-labelledby="qr-modal-name">
        <h2 id="qr-modal-name"></h2>
        <div id="qr-canvas" class="children-qr-canvas"></div>
        <p class="children-qr-help">${t('children.qr_help')}</p>
        <div class="children-qr-actions">
          <a id="qr-download" class="btn btn-secondary" download="qr-login.png">${t('children.download_png')}</a>
          <button class="btn btn-secondary" id="btn-qr-close">${t('pictogram_library.close')}</button>
        </div>
      </dialog>
    </div>

    <div class="modal-backdrop hidden" id="devices-modal">
      <dialog class="modal children-devices-modal" open role="dialog" aria-modal="true" aria-labelledby="devices-modal-title">
        <h2 id="devices-modal-title"></h2>
        <p class="children-devices-help">${t('children.devices_help')}</p>
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
  const childrenStatus = container.querySelector<HTMLParagraphElement>('#children-status')!;
  const qrModal = container.querySelector<HTMLElement>('#qr-modal')!;
  const devicesModal = container.querySelector<HTMLElement>('#devices-modal')!;
  const devicesError = container.querySelector<HTMLParagraphElement>('#devices-error')!;

  let devicesChildId = '';
  let children: Child[] = [];
  const devicesByChild = new Map<string, ChildDevice[]>();

  async function loadChildren(): Promise<void> {
    childrenStatus.textContent = '';
    grid.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';

    try {
      children = await api.get<Child[]>('/children');
      await preloadDeviceSnapshots();
      renderGrid();
    } catch {
      grid.innerHTML = `<p class="error-msg">${t('errors.generic')}</p>`;
    }
  }

  async function preloadDeviceSnapshots(): Promise<void> {
    devicesByChild.clear();

    await Promise.all(children.map(async (child) => {
      try {
        const rows = await api.get<ChildDevice[]>(`/children/${child.id}/devices`);
        devicesByChild.set(child.id, rows);
      } catch {
        devicesByChild.set(child.id, []);
      }
    }));
  }

  function renderGrid(): void {
    if (children.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <span class="empty-state__icon">👶</span>
          <p>${t('children.empty')}</p>
        </div>`;
      return;
    }

    grid.innerHTML = children.map((c) => {
      const rows = devicesByChild.get(c.id) ?? [];
      const count = rows.length;
      const lastUsedIso = latestLastUsed(rows);
      const lastUsed = lastUsedIso ? formatDateTimeForUser(lastUsedIso) : t('children.no_active_devices');

      return `
        <div class="child-card card" data-id="${escapeHtml(c.id)}">
          <div class="child-card__avatar">
            ${c.avatar_path
              ? `<img src="${escapeHtml(c.avatar_path)}" alt="${escapeHtml(c.display_name)}" />`
              : `<span>${escapeHtml(c.display_name.charAt(0).toUpperCase())}</span>`}
          </div>
          <h3 class="child-card__name">${escapeHtml(c.display_name)}</h3>
          <p class="children-device-meta">
            ${t('children.devices')}: ${count}<br/>
            ${t('children.last_used')}: ${escapeHtml(lastUsed)}
          </p>
          <div class="child-card__actions">
            <button class="btn btn-secondary btn-sm js-qr" data-id="${escapeHtml(c.id)}" data-name="${escapeHtml(c.display_name)}">📷 ${t('children.qr_code')}</button>
            <button class="btn btn-secondary btn-sm js-devices" data-id="${escapeHtml(c.id)}" data-name="${escapeHtml(c.display_name)}">${t('children.devices')}</button>
            <button class="btn btn-secondary btn-sm js-revoke-all" data-id="${escapeHtml(c.id)}">${t('children.revoke_all')}</button>
          </div>
        </div>`;
    }).join('');

    grid.querySelectorAll<HTMLButtonElement>('.js-qr').forEach((btn) => {
      btn.addEventListener('click', () => openQrModal(btn.dataset['id']!, btn.dataset['name']!));
    });

    grid.querySelectorAll<HTMLButtonElement>('.js-devices').forEach((btn) => {
      btn.addEventListener('click', () => openDevicesModal(btn.dataset['id']!, btn.dataset['name']!));
    });

    grid.querySelectorAll<HTMLButtonElement>('.js-revoke-all').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const childId = btn.dataset['id'];
        if (!childId) return;
        if (!confirm(t('children.revoke_all_confirm'))) return;
        try {
          await api.delete(`/children/${childId}/devices`);
          await loadChildren();
        } catch {
          childrenStatus.textContent = t('children.revoke_all_failed');
        }
      });
    });
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
      devicesByChild.set(devicesChildId, rows);

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
            <button class="btn btn-secondary btn-sm js-revoke-device" data-device-id="${escapeHtml(d.id)}">${t('children.revoke')}</button>
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
            await loadChildren();
          } catch {
            devicesError.textContent = t('children.revoke_failed');
          }
        });
      });
    } catch {
      mount.innerHTML = `<p class="error-msg">${t('children.load_devices_failed')}</p>`;
    }
  }

  container.querySelector('#btn-qr-close')?.addEventListener('click', () => qrModal.classList.add('hidden'));
  container.querySelector('#btn-devices-close')?.addEventListener('click', () => devicesModal.classList.add('hidden'));

  container.querySelector('#btn-revoke-all-devices')?.addEventListener('click', async () => {
    if (!devicesChildId) return;
    if (!confirm(t('children.revoke_all_confirm'))) return;
    try {
      await api.delete(`/children/${devicesChildId}/devices`);
      await loadDevices();
      await loadChildren();
    } catch {
      devicesError.textContent = t('children.revoke_all_failed');
    }
  });

  qrModal.addEventListener('click', (e) => {
    if (e.target === qrModal) qrModal.classList.add('hidden');
  });

  devicesModal.addEventListener('click', (e) => {
    if (e.target === devicesModal) devicesModal.classList.add('hidden');
  });

  await loadChildren();
}
