import { t } from '@/i18n/i18n';
import { api, ApiError } from '@/api/client';
import { renderWeekView, type WeekDay } from '@/components/WeekView';
import type { ScheduleItemData } from '@/components/ScheduleItem';
import { session } from '@/auth/session';
import { formatClockRangeForUser, formatIsoDateForUser, getUserLocale, getUserWeekStart, normalizeClockInput } from '@/utils/datetime';

// ── Types ────────────────────────────────────────────────────

interface Child { id: string; display_name: string; }
interface WeeklySchedule {
  id: string;
  child_id: string | null;
  name: string;
  description: string | null;
  status: 'active' | 'inactive' | 'archived';
  used_by_children: string[];
  activity_card_count: number;
}
interface WeekResponse {
  year: number; week: number; monday: string;
  days: {
    date: string; day_of_week: number;
    assignment_id: string | null;
    schedule_id: string | null;
    schedule_name: string | null;
    activity_cards: ScheduleItemData[];
  }[];
}

const STATUS_CLASS: Record<WeeklySchedule['status'], string> = {
  active: 'badge-active',
  inactive: 'badge-inactive',
  archived: 'badge-archived',
};

// ── ISO week helpers ─────────────────────────────────────────

function getISOWeek(d: Date): number {
  const tmp = new Date(d); tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const w1 = new Date(tmp.getFullYear(), 0, 4);
  return 1 + Math.round(((tmp.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}
function padWeek(n: number): string { return String(n).padStart(2, '0'); }
function isoDate(d: Date): string { return d.toISOString().split('T')[0] ?? ''; }
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Page ─────────────────────────────────────────────────────

export async function render(container: HTMLElement): Promise<void> {
  const today = new Date();
  let week = getISOWeek(today);
  let year = today.getFullYear();
  let visibleDays: 5 | 7 = (localStorage.getItem('calendar.visibleDays') === '5' ? 5 : 7);
  const use24hInput = (session.user?.time_format ?? '24h') === '24h';
  const timeInputAttrs = use24hInput
    ? 'type="text" inputmode="numeric" pattern="^([01]\\d|2[0-3]):[0-5]\\d$" placeholder="HH:MM"'
    : 'type="time"';

  container.innerHTML = `
    <main class="container page-content">
      <div class="page-header">
        <h1>${t('nav.calendar')}</h1>
        <div class="calendar-header-controls">
          <span id="single-child-name" class="badge hidden" aria-live="polite"></span>
          <select id="child-select" class="child-select"><option value="">${t('calendar.select_child')}</option></select>
          <label class="calendar-days-mode" for="week-visible-days">
            <span>${t('calendar.visible_days')}</span>
            <select id="week-visible-days" class="child-select">
              <option value="5" ${visibleDays === 5 ? 'selected' : ''}>${t('calendar.visible_days_5')}</option>
              <option value="7" ${visibleDays === 7 ? 'selected' : ''}>${t('calendar.visible_days_7')}</option>
            </select>
          </label>
        </div>
      </div>

      <section class="card weekly-schedules">
        <div class="weekly-schedules__head">
          <h2>${t('nav.weekly_schedule')}</h2>
          <div class="weekly-schedules-header-actions">
            <a class="btn btn-secondary btn-sm" href="/templates">${t('schedule.template_browser')}</a>
            <button class="btn btn-primary btn-sm" id="btn-new-schedule">+ ${t('calendar.new_weekly_schedule')}</button>
          </div>
        </div>
        <div id="calendar-schedule-list" class="schedule-list"></div>
      </section>

      <div id="week-wrap" class="week-view-wrap">
        <div class="empty-state">
          <span class="empty-state__icon">📅</span>
          <p>${t('calendar.select_child_hint')}</p>
        </div>
      </div>
    </main>

    <!-- Assign weekly schedule modal -->
    <div class="modal-backdrop hidden" id="assign-modal">
      <dialog class="modal" open role="dialog" aria-modal="true" aria-labelledby="assign-modal-title">
        <h2 id="assign-modal-title">${t('calendar.assign_weekly_schedule')}</h2>
        <div class="form-stack calendar-assign-form">
          <input type="hidden" id="assign-dow" />
          <div>
            <label for="assign-select">${t('calendar.weekly_schedule_label')}</label>
            <select id="assign-select"></select>
          </div>
          <label class="calendar-persistent-row">
            <input type="checkbox" id="assign-persistent" checked />
            <span>${t('calendar.assign_persistent')}</span>
          </label>
          <div id="assign-range-wrap" class="form-grid calendar-assign-range">
            <div>
              <label for="assign-start-date">${t('calendar.start_date')}</label>
              <input type="date" id="assign-start-date" />
            </div>
            <div>
              <label for="assign-end-date">${t('calendar.end_date')}</label>
              <input type="date" id="assign-end-date" />
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="btn-assign-cancel">${t('schedule.cancel')}</button>
            <button type="button" class="btn btn-primary" id="btn-assign-confirm">${t('calendar.assign_weekly_schedule')}</button>
          </div>
          <p id="assign-error" class="error-msg" aria-live="polite"></p>
        </div>
      </dialog>
    </div>

    <!-- Weekly schedule create/edit modal -->
    <div class="modal-backdrop hidden" id="schedule-modal">
      <dialog class="modal" open role="dialog" aria-modal="true" aria-labelledby="schedule-modal-title">
        <h2 id="schedule-modal-title">${t('calendar.new_weekly_schedule')}</h2>
        <form id="schedule-form" class="form-stack weekly-schedule-form">
          <input type="hidden" id="schedule-id" />
          <div>
            <label for="schedule-title">${t('schedule.title')}</label>
            <input id="schedule-title" type="text" required />
          </div>
          <div>
            <label for="schedule-desc">${t('schedule.description')}</label>
            <textarea id="schedule-desc" rows="3"></textarea>
          </div>
          <div>
            <label for="schedule-child">${t('calendar.assign_child')}</label>
            <select id="schedule-child"><option value="">${t('calendar.none')}</option></select>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="btn-schedule-cancel">${t('schedule.cancel')}</button>
            <button type="submit" class="btn btn-primary">${t('schedule.save')}</button>
          </div>
          <p id="schedule-error" class="error-msg" aria-live="polite"></p>
        </form>
      </dialog>
    </div>

    <!-- Day detail modal -->
    <div class="modal-backdrop hidden" id="day-modal">
      <dialog class="modal calendar-day-modal" open role="dialog" aria-modal="true" aria-labelledby="day-modal-title">
        <h2 id="day-modal-title"></h2>
        <div id="day-modal-body" class="calendar-day-body"></div>
        <div class="modal-actions calendar-day-actions">
          <button type="button" class="btn btn-secondary" id="btn-day-close">${t('schedule.cancel')}</button>
        </div>
      </dialog>
    </div>

    <!-- Item edit modal -->
    <div class="modal-backdrop hidden" id="item-modal">
      <dialog class="modal" open role="dialog" aria-modal="true" aria-labelledby="item-modal-title">
        <h2 id="item-modal-title">${t('schedule.activity_card.edit')}</h2>
        <div class="form-stack calendar-item-form">
          <input type="hidden" id="item-edit-schedule-id" />
          <input type="hidden" id="item-edit-item-id" />
          <div>
            <label for="item-edit-title">${t('schedule.title')}</label>
            <input id="item-edit-title" type="text" maxlength="200" required />
          </div>
          <div>
            <label for="item-edit-description">${t('schedule.description')}</label>
            <textarea id="item-edit-description" rows="3"></textarea>
          </div>
          <div class="form-grid calendar-item-time-grid">
            <div>
              <label for="item-edit-start">${t('schedule.start_time')}</label>
              <input id="item-edit-start" ${timeInputAttrs} required />
            </div>
            <div>
              <label for="item-edit-end">${t('schedule.end_time')}</label>
              <input id="item-edit-end" ${timeInputAttrs} />
            </div>
          </div>
          <div class="modal-actions calendar-item-actions">
            <button type="button" class="btn btn-danger" id="btn-item-delete">${t('schedule.delete')}</button>
            <div class="calendar-item-actions-right">
              <button type="button" class="btn btn-secondary" id="btn-item-cancel">${t('schedule.cancel')}</button>
              <button type="button" class="btn btn-primary" id="btn-item-save">${t('schedule.save')}</button>
            </div>
          </div>
          <p id="item-edit-error" class="error-msg" aria-live="polite"></p>
        </div>
      </dialog>
    </div>
  `;

  // ── DOM refs ────────────────────────────────────────────────
  const childSelect = container.querySelector<HTMLSelectElement>('#child-select')!;
  const weekVisibleDays = container.querySelector<HTMLSelectElement>('#week-visible-days')!;
  const singleChildName = container.querySelector<HTMLElement>('#single-child-name')!;
  const weeklyScheduleListEl = container.querySelector<HTMLElement>('#calendar-schedule-list')!;
  const wrap        = container.querySelector<HTMLElement>('#week-wrap')!;
  const assignModal = container.querySelector<HTMLElement>('#assign-modal')!;
  const dayModal    = container.querySelector<HTMLElement>('#day-modal')!;
  const itemModal   = container.querySelector<HTMLElement>('#item-modal')!;
  const weeklyScheduleModal = container.querySelector<HTMLElement>('#schedule-modal')!;
  const weeklyScheduleForm = container.querySelector<HTMLFormElement>('#schedule-form')!;
  const weeklyScheduleError = container.querySelector<HTMLParagraphElement>('#schedule-error')!;
  const assignDowEl = container.querySelector<HTMLInputElement>('#assign-dow')!;
  const assignSel   = container.querySelector<HTMLSelectElement>('#assign-select')!;
  const assignPersistentEl = container.querySelector<HTMLInputElement>('#assign-persistent')!;
  const assignRangeWrap = container.querySelector<HTMLElement>('#assign-range-wrap')!;
  const assignStartEl = container.querySelector<HTMLInputElement>('#assign-start-date')!;
  const assignEndEl = container.querySelector<HTMLInputElement>('#assign-end-date')!;
  const assignError = container.querySelector<HTMLParagraphElement>('#assign-error')!;
  const assignConfirmBtn = container.querySelector<HTMLButtonElement>('#btn-assign-confirm')!;
  const assignCancelBtn = container.querySelector<HTMLButtonElement>('#btn-assign-cancel')!;
  const dayCloseBtn = container.querySelector<HTMLButtonElement>('#btn-day-close')!;
  const itemEditScheduleIdEl = container.querySelector<HTMLInputElement>('#item-edit-schedule-id')!;
  const itemEditItemIdEl = container.querySelector<HTMLInputElement>('#item-edit-item-id')!;
  const itemEditTitleEl = container.querySelector<HTMLInputElement>('#item-edit-title')!;
  const itemEditDescriptionEl = container.querySelector<HTMLTextAreaElement>('#item-edit-description')!;
  const itemEditStartEl = container.querySelector<HTMLInputElement>('#item-edit-start')!;
  const itemEditEndEl = container.querySelector<HTMLInputElement>('#item-edit-end')!;
  const itemEditErrorEl = container.querySelector<HTMLParagraphElement>('#item-edit-error')!;
  const itemCancelBtn = container.querySelector<HTMLButtonElement>('#btn-item-cancel')!;
  const itemSaveBtn = container.querySelector<HTMLButtonElement>('#btn-item-save')!;
  const itemDeleteBtn = container.querySelector<HTMLButtonElement>('#btn-item-delete')!;

  const userLocale = getUserLocale();
  const weekStart = getUserWeekStart();
  const datePickerLocale = weekStart === 1
    ? (userLocale.toLowerCase().startsWith('en-us') ? 'en-GB' : userLocale)
    : userLocale;
  assignStartEl.setAttribute('lang', datePickerLocale);
  assignEndEl.setAttribute('lang', datePickerLocale);

  let weeklySchedules: WeeklySchedule[] = [];
  let children: Child[] = [];
  const todayStr = isoDate(today);
  let loadedInitialWeek = false;
  let currentDays: WeekDay[] = [];

  // Bind static modal controls up-front (before async loading) so buttons never become inert.
  assignCancelBtn.onclick = (event) => {
    event.preventDefault();
    assignModal.classList.add('hidden');
  };
  assignConfirmBtn.onclick = (event) => {
    event.preventDefault();
    void handleAssignConfirm();
  };
  dayCloseBtn.onclick = (event) => {
    event.preventDefault();
    dayModal.classList.add('hidden');
  };
  itemCancelBtn.onclick = (event) => {
    event.preventDefault();
    itemModal.classList.add('hidden');
  };
  itemSaveBtn.onclick = (event) => {
    event.preventDefault();
    void saveItemEdit();
  };
  itemDeleteBtn.onclick = (event) => {
    event.preventDefault();
    void deleteItemFromModal();
  };
  assignPersistentEl.onchange = () => {
    toggleAssignRangeInputs();
  };

  // ── Load children ───────────────────────────────────────────
  try {
    children = await api.get<Child[]>('/children');
    children.forEach((c) => {
      const o = document.createElement('option');
      o.value = c.id; o.textContent = c.display_name;
      childSelect.appendChild(o);
      container.querySelector<HTMLSelectElement>('#schedule-child')
        ?.insertAdjacentHTML('beforeend', `<option value="${c.id}">${escapeHtml(c.display_name)}</option>`);
    });

    if (children.length === 1) {
      const only = children[0]!;
      childSelect.value = only.id;
      childSelect.classList.add('hidden');
      childSelect.disabled = true;
      singleChildName.textContent = only.display_name;
      singleChildName.classList.remove('hidden');
      await loadWeek();
      loadedInitialWeek = true;
    }

    const p = new URLSearchParams(location.search).get('child');
    if (!loadedInitialWeek && p) {
      childSelect.value = p;
      await loadWeek();
      loadedInitialWeek = true;
    }
  } catch { /* non-fatal */ }

  // ── Load schedules (for assign dropdown) ───────────────────
  // ── Load weekly schedules (for assign dropdown) ─────────────
  async function loadWeeklySchedules(): Promise<void> {
    try {
      weeklySchedules = await api.get<WeeklySchedule[]>('/schedules');
      renderWeeklyScheduleList();
    } catch {
      weeklySchedules = [];
      weeklyScheduleListEl.innerHTML = `<p class="error-msg">${t('errors.generic')}</p>`;
    }
  }

  function renderWeeklyScheduleList(): void {
    if (weeklySchedules.length === 0) {
      weeklyScheduleListEl.innerHTML = `<div class="empty-state"><p>${t('calendar.no_weekly_schedules_yet')}</p></div>`;
      return;
    }

    weeklyScheduleListEl.innerHTML = weeklySchedules.map((s) => `
      <div class="schedule-card card" data-id="${s.id}">
        <div class="schedule-card__head">
          <div>
            <h3>${escapeHtml(s.name)}</h3>
            ${s.description ? `<p class="weekly-schedule-card-desc">${escapeHtml(s.description)}</p>` : ''}
            <p class="weekly-schedule-card-usedby">
              ${t('calendar.used_by')}: ${s.used_by_children.length > 0 ? s.used_by_children.join(', ') : t('calendar.no_children_yet')}
            </p>
          </div>
          ${s.status === 'inactive' ? '' : `<span class="badge ${STATUS_CLASS[s.status]}">${t(`schedule.status.${s.status}`)}</span>`}
        </div>
        <div class="schedule-card__actions">
          <a class="btn btn-primary btn-sm" href="/weeklyschedule/${s.id}">${t('schedule.edit_activity_cards')}</a>
          <button class="btn btn-secondary btn-sm js-schedule-edit" data-id="${s.id}">${t('schedule.edit')}</button>
          <button class="btn btn-secondary btn-sm js-schedule-archive" data-id="${s.id}" data-status="${s.status}">
            ${s.status === 'archived' ? t('schedule.restore') : t('schedule.archive')}
          </button>
          <button class="btn btn-secondary btn-sm js-schedule-delete" data-id="${s.id}">${t('schedule.delete')}</button>
        </div>
      </div>
    `).join('');

    weeklyScheduleListEl.querySelectorAll<HTMLButtonElement>('.js-schedule-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const s = weeklySchedules.find((x) => x.id === btn.dataset['id']);
        if (!s) return;
        openEditWeeklyScheduleModal(s);
      });
    });

    weeklyScheduleListEl.querySelectorAll<HTMLButtonElement>('.js-schedule-archive').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset['id'];
        const status = btn.dataset['status'] as WeeklySchedule['status'] | undefined;
        if (!id || !status) return;
        void toggleWeeklyScheduleArchive(id, status);
      });
    });

    weeklyScheduleListEl.querySelectorAll<HTMLButtonElement>('.js-schedule-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset['id'];
        if (!id) return;
        void deleteWeeklySchedule(id);
      });
    });
  }

  function openCreateWeeklyScheduleModal(): void {
    container.querySelector<HTMLElement>('#schedule-modal-title')!.textContent = t('calendar.new_weekly_schedule');
    weeklyScheduleForm.reset();
    weeklyScheduleForm.querySelector<HTMLInputElement>('#schedule-id')!.value = '';
    weeklyScheduleForm.querySelector<HTMLSelectElement>('#schedule-child')!.value = '';
    weeklyScheduleError.textContent = '';
    weeklyScheduleModal.classList.remove('hidden');
  }

  function openEditWeeklyScheduleModal(schedule: WeeklySchedule): void {
    container.querySelector<HTMLElement>('#schedule-modal-title')!.textContent = t('calendar.edit_weekly_schedule');
    weeklyScheduleForm.querySelector<HTMLInputElement>('#schedule-id')!.value = schedule.id;
    weeklyScheduleForm.querySelector<HTMLInputElement>('#schedule-title')!.value = schedule.name;
    weeklyScheduleForm.querySelector<HTMLTextAreaElement>('#schedule-desc')!.value = schedule.description ?? '';
    weeklyScheduleForm.querySelector<HTMLSelectElement>('#schedule-child')!.value = schedule.child_id ?? '';
    weeklyScheduleError.textContent = '';
    weeklyScheduleModal.classList.remove('hidden');
  }

  async function saveWeeklySchedule(): Promise<void> {
    const id = weeklyScheduleForm.querySelector<HTMLInputElement>('#schedule-id')!.value;
    const name = weeklyScheduleForm.querySelector<HTMLInputElement>('#schedule-title')!.value.trim();
    const description = weeklyScheduleForm.querySelector<HTMLTextAreaElement>('#schedule-desc')!.value.trim();
    const childId = weeklyScheduleForm.querySelector<HTMLSelectElement>('#schedule-child')!.value || null;

    if (!name) {
      weeklyScheduleError.textContent = t('calendar.title_required');
      return;
    }

    const submitBtn = weeklyScheduleForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submitBtn.disabled = true;
    weeklyScheduleError.textContent = '';

    try {
      if (id) {
        await api.put(`/schedules/${id}`, { name, description, child_id: childId });
      } else {
        await api.post('/schedules', { name, description, child_id: childId });
      }
      weeklyScheduleModal.classList.add('hidden');
      await loadWeeklySchedules();
    } catch (err) {
      weeklyScheduleError.textContent = err instanceof ApiError ? err.message : t('errors.generic');
    } finally {
      submitBtn.disabled = false;
    }
  }

  async function toggleWeeklyScheduleArchive(id: string, status: WeeklySchedule['status']): Promise<void> {
    try {
      await api.patch(`/schedules/${id}/status`, { status: status === 'archived' ? 'active' : 'archived' });
      await loadWeeklySchedules();
    } catch {
      weeklyScheduleError.textContent = t('errors.generic');
    }
  }

  async function deleteWeeklySchedule(id: string): Promise<void> {
    if (!window.confirm(t('calendar.delete_weekly_schedule_confirm'))) return;
    try {
      await api.delete(`/schedules/${id}`);
      await loadWeeklySchedules();
    } catch {
      weeklyScheduleError.textContent = t('errors.generic');
    }
  }

  // ── Load week data ──────────────────────────────────────────
  async function loadWeek(): Promise<void> {
    if (!childSelect.value) return;
    wrap.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';
    try {
      const data = await api.get<WeekResponse>(
        `/calendar/${childSelect.value}/week/${year}-W${padWeek(week)}`);

      const days: WeekDay[] = data.days.map((d) => ({
        date:          d.date,
        day_of_week:   d.day_of_week,
        assignment_id: d.assignment_id,
        schedule_id:   d.schedule_id,
        schedule_name: d.schedule_name,
        activity_cards: d.activity_cards,
      }));
      currentDays = days;

      renderWeekView(wrap, days, week, year, false, getUserWeekStart(), visibleDays);

      // Highlight today
      wrap.querySelectorAll<HTMLElement>('.week-grid__day').forEach((col) => {
        if (col.querySelector('time')?.getAttribute('datetime') === todayStr)
          col.classList.add('week-grid__day--today');
      });

      // Wire nav
      wrap.querySelector<HTMLButtonElement>('.js-prev')?.addEventListener('click', prevWeek);
      wrap.querySelector<HTMLButtonElement>('.js-next')?.addEventListener('click', nextWeek);

    } catch (err) {
      wrap.innerHTML = `<p class="error-msg calendar-error-pad">
        ${err instanceof ApiError ? err.message : t('errors.generic')}</p>`;
    }
  }

  function prevWeek(): void { week--; if (week < 1) { year--; week = 52; } loadWeek(); }
  function nextWeek(): void { week++; if (week > 52) { year++; week = 1; } loadWeek(); }

  // Delegated week actions (assign/unassign/day details) so handlers survive rerenders.
  wrap.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;

    const assignBtn = target.closest<HTMLButtonElement>('.js-assign');
    if (assignBtn) {
      const dow = Number.parseInt(assignBtn.dataset['dow'] ?? '', 10);
      const date = assignBtn.dataset['date'] ?? '';
      if (Number.isInteger(dow) && dow >= 1 && dow <= 7) {
        void openAssignModal(dow, date);
      }
      return;
    }

    const unassignBtn = target.closest<HTMLButtonElement>('.js-unassign');
    if (unassignBtn) {
      const assignmentId = unassignBtn.dataset['assignmentId'];
      const dow = Number.parseInt(unassignBtn.dataset['dow'] ?? '', 10);
      if (assignmentId && Number.isInteger(dow)) {
        void unassign(assignmentId, dow);
      }
      return;
    }

    const nameEl = target.closest<HTMLElement>('.day-schedule-badge__name');
    if (nameEl) {
      const dayCol = nameEl.closest<HTMLElement>('.week-grid__day');
      const datetime = dayCol?.querySelector('time.week-grid__date')?.getAttribute('datetime');
      if (!datetime) return;
      const day = currentDays.find((d) => d.date === datetime);
      if (day) {
        openDayDetail(day);
      }
      return;
    }

    const scheduleItem = target.closest<HTMLElement>('.schedule-item');
    if (scheduleItem) {
      void openItemEditFromCard(scheduleItem);
    }
  });

  // ── Assign modal ────────────────────────────────────────────
  async function openAssignModal(dow: number, date: string): Promise<void> {
    if (weeklySchedules.length === 0) await loadWeeklySchedules();
    assignDowEl.value = String(dow);
    const assignable = weeklySchedules.filter((s) => s.status !== 'archived');
    assignSel.innerHTML = assignable.length === 0
      ? `<option value="">${t('calendar.no_active_weekly_schedules')}</option>`
      : assignable.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    const defaultDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : isoDate(new Date());
    assignPersistentEl.checked = true;
    assignStartEl.value = defaultDate;
    assignEndEl.value = defaultDate;
    toggleAssignRangeInputs();
    assignError.textContent = '';
    assignConfirmBtn.disabled = assignable.length === 0;
    assignModal.classList.remove('hidden');
  }

  function toggleAssignRangeInputs(): void {
    const isPersistent = assignPersistentEl.checked;
    assignRangeWrap.classList.toggle('disabled', isPersistent);
    assignStartEl.disabled = isPersistent;
    assignEndEl.disabled = isPersistent;
  }

  assignModal.addEventListener('click', (e) => {
    if (e.target === assignModal) assignModal.classList.add('hidden');
  });
  async function handleAssignConfirm(): Promise<void> {
    const scheduleId = assignSel.value;
    const dow = Number.parseInt(assignDowEl.value, 10);
    if (!scheduleId) {
      assignError.textContent = t('calendar.select_weekly_schedule_required');
      return;
    }
    if (!Number.isInteger(dow) || dow < 1 || dow > 7) {
      assignError.textContent = t('calendar.invalid_weekday');
      return;
    }
    const btn = container.querySelector<HTMLButtonElement>('#btn-assign-confirm')!;
    btn.disabled = true; assignError.textContent = '';
    try {
      await api.post(`/calendar/${childSelect.value}/assign`, {
        schedule_id: scheduleId,
        day_of_week: dow,
        persistent: assignPersistentEl.checked,
        start_date: assignPersistentEl.checked ? null : assignStartEl.value,
        end_date: assignPersistentEl.checked ? null : assignEndEl.value,
      });
      assignModal.classList.add('hidden');
      await loadWeek();
    } catch (err) {
      assignError.textContent = err instanceof ApiError ? err.message : t('errors.generic');
    } finally { btn.disabled = false; }
  }

  // ── Unassign ────────────────────────────────────────────────
  async function unassign(assignmentId: string, _dow: number): Promise<void> {
    if (!confirm(t('calendar.unassign_confirm'))) return;
    try {
      await api.delete(`/calendar/${childSelect.value}/assign/${assignmentId}`);
      await loadWeek();
    } catch { alert(t('errors.generic')); }
  }

  async function openItemEditFromCard(card: HTMLElement): Promise<void> {
    const itemId = card.dataset['id'];
    if (!itemId) return;

    const dayCol = card.closest<HTMLElement>('.week-grid__day');
    const datetime = dayCol?.querySelector('time.week-grid__date')?.getAttribute('datetime');
    if (!datetime) return;

    const day = currentDays.find((d) => d.date === datetime);
    if (!day?.schedule_id) return;

    const item = day.activity_cards.find((i) => i.id === itemId);
    if (!item) return;

    itemEditScheduleIdEl.value = day.schedule_id;
    itemEditItemIdEl.value = item.id;
    itemEditTitleEl.value = item.title;
    itemEditDescriptionEl.value = item.description ?? '';
    itemEditStartEl.value = item.start_time;
    itemEditEndEl.value = item.end_time ?? '';
    itemEditErrorEl.textContent = '';
    itemModal.classList.remove('hidden');
  }

  async function saveItemEdit(): Promise<void> {
    const scheduleId = itemEditScheduleIdEl.value;
    const itemId = itemEditItemIdEl.value;
    const title = itemEditTitleEl.value.trim();
    const start = normalizeClockInput(itemEditStartEl.value);
    const endRaw = itemEditEndEl.value;
    const end = endRaw.trim() ? normalizeClockInput(endRaw) : null;
    if (!scheduleId || !itemId) return;
    if (!title) {
      itemEditErrorEl.textContent = t('calendar.title_required');
      return;
    }
    if (!start) {
      itemEditErrorEl.textContent = t('calendar.start_required');
      return;
    }
    if (endRaw.trim() && !end) {
      itemEditErrorEl.textContent = 'Use HH:MM for end time.';
      return;
    }

    itemSaveBtn.disabled = true;
    itemEditErrorEl.textContent = '';
    try {
      const payload: Record<string, unknown> = {
        title,
        description: itemEditDescriptionEl.value,
        start_time: start,
      };
      if (end) {
        payload['end_time'] = end;
      }
      await api.put(`/schedules/${scheduleId}/activity-cards/${itemId}`, payload);
      itemModal.classList.add('hidden');
      await loadWeek();
    } catch (err) {
      itemEditErrorEl.textContent = err instanceof ApiError ? err.message : t('errors.generic');
    } finally {
      itemSaveBtn.disabled = false;
    }
  }

  async function deleteItemFromModal(): Promise<void> {
    const scheduleId = itemEditScheduleIdEl.value;
    const itemId = itemEditItemIdEl.value;
    if (!scheduleId || !itemId) return;
    if (!confirm(t('calendar.item_delete_confirm'))) return;

    itemDeleteBtn.disabled = true;
    itemEditErrorEl.textContent = '';
    try {
      await api.delete(`/schedules/${scheduleId}/activity-cards/${itemId}`);
      itemModal.classList.add('hidden');
      await loadWeek();
    } catch (err) {
      itemEditErrorEl.textContent = err instanceof ApiError ? err.message : t('errors.generic');
    } finally {
      itemDeleteBtn.disabled = false;
    }
  }

  // ── Day detail modal ────────────────────────────────────────
  function openDayDetail(day: WeekDay): void {
    container.querySelector<HTMLElement>('#day-modal-title')!.textContent =
      `${day.schedule_name ?? t('calendar.no_schedule')} — ${formatIsoDateForUser(day.date)}`;
    const body = container.querySelector<HTMLElement>('#day-modal-body')!;
    body.innerHTML = day.activity_cards.length === 0
      ? `<p class="calendar-day-empty">${t('calendar.no_activity_cards')}</p>`
      : day.activity_cards.map((item) => `
          <div class="item-card card calendar-day-item">
            <div class="item-card__body">
              <div class="item-card__head">
                <span class="item-card__time">${formatClockRangeForUser(item.start_time, item.end_time)}</span>
                <strong class="item-card__title">${escapeHtml(item.title)}</strong>
              </div>
              ${item.description ? `<p class="item-card__desc">${escapeHtml(item.description)}</p>` : ''}
            </div>
          </div>`).join('');
    dayModal.classList.remove('hidden');
  }

  dayModal.addEventListener('click', (e) => {
    if (e.target === dayModal) dayModal.classList.add('hidden');
  });
  itemModal.addEventListener('click', (e) => {
    if (e.target === itemModal) itemModal.classList.add('hidden');
  });

  childSelect.addEventListener('change', loadWeek);
  weekVisibleDays.addEventListener('change', () => {
    visibleDays = weekVisibleDays.value === '5' ? 5 : 7;
    localStorage.setItem('calendar.visibleDays', String(visibleDays));
    void loadWeek();
  });

  container.querySelector('#btn-new-schedule')?.addEventListener('click', openCreateWeeklyScheduleModal);
  container.querySelector('#btn-schedule-cancel')?.addEventListener('click', () => weeklyScheduleModal.classList.add('hidden'));
  weeklyScheduleForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void saveWeeklySchedule();
  });
  weeklyScheduleModal.addEventListener('click', (event) => {
    if (event.target === weeklyScheduleModal) weeklyScheduleModal.classList.add('hidden');
  });

  // Pre-load weekly schedules in background
  void loadWeeklySchedules();
}

