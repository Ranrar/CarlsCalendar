import { t } from '@/i18n/i18n';
import { api, ApiError } from '@/api/client';
import { router } from '@/router';

interface Child { id: string; display_name: string; }
interface Schedule {
  id: string; name: string; description: string | null;
  status: 'active' | 'inactive' | 'archived';
  used_by_children: string[];
}

const STATUS_CLASS: Record<Schedule['status'], string> = {
  active: 'badge-active', inactive: 'badge-inactive', archived: 'badge-archived',
};

export async function render(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <main class="container page-content">
      <div class="page-header">
        <h1>${t('nav.schedules')}</h1>
        <div class="schedules-header-actions">
          <a class="btn btn-secondary" href="/templates">${t('schedule.template_browser')}</a>
          <button class="btn btn-primary" id="btn-new">+ ${t('calendar.new_schedule')}</button>
        </div>
      </div>
      <div id="schedule-list" class="schedule-list"></div>
    </main>

    <div class="modal-backdrop hidden" id="sched-modal">
      <dialog class="modal" open role="dialog" aria-modal="true" aria-labelledby="sched-modal-title">
        <h2 id="sched-modal-title">${t('calendar.new_schedule')}</h2>
        <form id="sched-form" class="form-stack schedules-form">
          <input type="hidden" id="sched-id" />
          <div>
            <label for="sched-title">${t('schedule.title')}</label>
            <input id="sched-title" type="text" required />
          </div>
          <div>
            <label for="sched-desc">${t('schedule.description')}</label>
            <textarea id="sched-desc" rows="3"></textarea>
          </div>
          <div>
            <label for="sched-child">${t('calendar.assign_child')}</label>
            <select id="sched-child"><option value="">${t('calendar.none')}</option></select>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="btn-sched-cancel">${t('schedule.cancel')}</button>
            <button type="submit" class="btn btn-primary">${t('schedule.save')}</button>
          </div>
          <p id="sched-error" class="error-msg" aria-live="polite"></p>
        </form>
      </dialog>
    </div>
  `;

  const list = container.querySelector<HTMLElement>('#schedule-list')!;
  const schedModal = container.querySelector<HTMLElement>('#sched-modal')!;
  const schedForm = container.querySelector<HTMLFormElement>('#sched-form')!;
  const schedError = container.querySelector<HTMLParagraphElement>('#sched-error')!;
  let schedules: Schedule[] = [];

  async function loadChildren(): Promise<void> {
    try {
      const children = await api.get<Child[]>('/children');
      const opts = children.map((c) => `<option value="${c.id}">${c.display_name}</option>`).join('');
      container.querySelector<HTMLSelectElement>('#sched-child')!.insertAdjacentHTML('beforeend', opts);
    } catch { /* non-fatal */ }
  }

  async function loadSchedules(): Promise<void> {
    list.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';
    try {
      schedules = await api.get<Schedule[]>('/schedules');
      renderList();
    } catch {
      list.innerHTML = `<p class="error-msg">${t('errors.generic')}</p>`;
    }
  }

  function renderList(): void {
    if (schedules.length === 0) {
      list.innerHTML = `<div class="empty-state"><span class="empty-state__icon">📋</span><p>${t('calendar.no_schedules_yet')}</p></div>`;
      return;
    }
    list.innerHTML = schedules.map((s) => `
      <div class="schedule-card card" data-id="${s.id}">
        <div class="schedule-card__head">
          <div>
            <h3>${s.name}</h3>
            ${s.description ? `<p class="schedules-card-desc">${s.description}</p>` : ''}
            <p class="schedules-card-usedby">
              ${t('calendar.used_by')}: ${s.used_by_children.length > 0 ? s.used_by_children.join(', ') : t('calendar.no_children_yet')}
            </p>
          </div>
          ${s.status === 'inactive' ? '' : `<span class="badge ${STATUS_CLASS[s.status]}">${t(`schedule.status.${s.status}`)}</span>`}
        </div>
        <div class="schedule-card__actions">
          <button class="btn btn-primary btn-sm js-items" data-id="${s.id}">${t('schedule.edit_items')}</button>
          <button class="btn btn-secondary btn-sm js-edit" data-id="${s.id}">${t('schedule.edit')}</button>
          <button class="btn btn-secondary btn-sm js-archive" data-id="${s.id}" data-status="${s.status}">
            ${s.status === 'archived' ? t('schedule.restore') : t('schedule.archive')}
          </button>
          <button class="btn btn-secondary btn-sm js-delete" data-id="${s.id}">${t('schedule.delete')}</button>
        </div>
      </div>`).join('');

    list.querySelectorAll<HTMLButtonElement>('.js-items').forEach((btn) =>
      btn.addEventListener('click', () => router.push(`/schedules/${btn.dataset['id']}`)));
    list.querySelectorAll<HTMLButtonElement>('.js-edit').forEach((btn) => {
      const s = schedules.find((x) => x.id === btn.dataset['id'])!;
      btn.addEventListener('click', () => openEdit(s));
    });
    list.querySelectorAll<HTMLButtonElement>('.js-archive').forEach((btn) =>
      btn.addEventListener('click', () => toggleArchive(btn.dataset['id']!, btn.dataset['status'] as Schedule['status'])));
    list.querySelectorAll<HTMLButtonElement>('.js-delete').forEach((btn) =>
      btn.addEventListener('click', () => deleteSchedule(btn.dataset['id']!)));
  }

  function openNew(): void {
    container.querySelector<HTMLElement>('#sched-modal-title')!.textContent = t('calendar.new_schedule');
    schedForm.reset();
    schedForm.querySelector<HTMLInputElement>('#sched-id')!.value = '';
    schedError.textContent = '';
    schedModal.classList.remove('hidden');
  }

  function openEdit(s: Schedule): void {
    container.querySelector<HTMLElement>('#sched-modal-title')!.textContent = t('calendar.edit_schedule');
    schedForm.querySelector<HTMLInputElement>('#sched-id')!.value = s.id;
    schedForm.querySelector<HTMLInputElement>('#sched-title')!.value = s.name;
    schedForm.querySelector<HTMLTextAreaElement>('#sched-desc')!.value = s.description ?? '';
    schedError.textContent = '';
    schedModal.classList.remove('hidden');
  }

  schedForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = schedForm.querySelector<HTMLInputElement>('#sched-id')!.value;
    const title = schedForm.querySelector<HTMLInputElement>('#sched-title')!.value.trim();
    const description = schedForm.querySelector<HTMLTextAreaElement>('#sched-desc')!.value.trim();
    const child_id = schedForm.querySelector<HTMLSelectElement>('#sched-child')!.value || null;
    const btn = schedForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    btn.disabled = true; schedError.textContent = '';
    try {
      if (id) { await api.put(`/schedules/${id}`, { name: title, description, child_id }); }
      else    { await api.post('/schedules', { name: title, description, child_id }); }
      schedModal.classList.add('hidden'); await loadSchedules();
    } catch (err) {
      schedError.textContent = err instanceof ApiError ? err.message : t('errors.generic');
    } finally { btn.disabled = false; }
  });

  async function toggleArchive(id: string, status: Schedule['status']): Promise<void> {
    try { await api.patch(`/schedules/${id}/status`, { status: status === 'archived' ? 'active' : 'archived' }); await loadSchedules(); }
    catch { schedError.textContent = t('errors.generic'); }
  }

  async function deleteSchedule(id: string): Promise<void> {
    if (!confirm(t('calendar.delete_schedule_confirm'))) return;
    try { await api.delete(`/schedules/${id}`); await loadSchedules(); }
    catch { schedError.textContent = t('errors.generic'); }
  }

  container.querySelector('#btn-new')?.addEventListener('click', openNew);
  container.querySelector('#btn-sched-cancel')?.addEventListener('click', () => schedModal.classList.add('hidden'));
  schedModal.addEventListener('click', (e) => { if (e.target === schedModal) schedModal.classList.add('hidden'); });

  await loadChildren();
  await loadSchedules();
}
