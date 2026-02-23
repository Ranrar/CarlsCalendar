import { t } from '@/i18n/i18n';
import { api, ApiError } from '@/api/client';
import { renderWeekView, type WeekDay } from '@/components/WeekView';
import type { ScheduleItemData } from '@/components/ScheduleItem';
import { formatClockRangeForUser, formatIsoDateForUser, getUserWeekStart } from '@/utils/datetime';

// ── Types ────────────────────────────────────────────────────

interface WeekResponse {
  year: number; week: number; monday: string;
  days: {
    date: string; day_of_week: number;
    assignment_id: string | null;
    schedule_id: string | null;
    schedule_name: string | null;
    items: ScheduleItemData[];
  }[];
}

interface ChildSessionResponse {
  child_id: string;
}

// ── Helpers ──────────────────────────────────────────────────

function getISOWeek(d: Date): number {
  const tmp = new Date(d); tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const w1 = new Date(tmp.getFullYear(), 0, 4);
  return 1 + Math.round(((tmp.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}
function padWeek(n: number): string { return String(n).padStart(2, '0'); }
const isoDate = (d: Date): string => d.toISOString().split('T')[0] ?? '';
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Page ─────────────────────────────────────────────────────

export async function render(container: HTMLElement): Promise<void> {
  const today = new Date();
  let week = getISOWeek(today);
  let year = today.getFullYear();

  container.innerHTML = `
    <main class="container page-content">
      <div class="page-header">
        <h1 id="cal-title">${t('nav.calendar')}</h1>
      </div>
      <div id="week-wrap" class="week-view-wrap child-view">
        <div class="empty-state"><p>${t('calendar.child_loading')}</p></div>
      </div>
    </main>

    <!-- Day detail modal -->
    <div class="modal-backdrop hidden" id="day-modal">
      <dialog class="modal calendar-day-modal" open role="dialog" aria-modal="true" aria-labelledby="day-modal-title">
        <h2 id="day-modal-title"></h2>
        <div id="day-modal-body" class="calendar-day-body"></div>
        <div class="modal-actions calendar-day-actions">
          <button class="btn btn-secondary" id="btn-day-close">${t('schedule.cancel')}</button>
        </div>
      </dialog>
    </div>
  `;

  const wrap     = container.querySelector<HTMLElement>('#week-wrap')!;
  const dayModal = container.querySelector<HTMLElement>('#day-modal')!;
  const todayStr = isoDate(today);
  let childId = '';

  const token = new URLSearchParams(location.search).get('token')?.trim() ?? '';
  if (token) {
    try {
      await api.post('/auth/child/pair', { token });
      history.replaceState(null, '', '/my-calendar');
    } catch (err) {
      wrap.innerHTML = `<p class="error-msg calendar-error-pad">${err instanceof ApiError ? err.message : t('errors.generic')}</p>`;
      return;
    }
  }

  try {
    const session = await api.get<ChildSessionResponse>('/auth/child/me');
    childId = session.child_id;
  } catch {
    wrap.innerHTML = `<p class="error-msg calendar-error-pad">${t('calendar.child_no_session')}</p>`;
    return;
  }

  // ── Load week ───────────────────────────────────────────────
  async function loadWeek(): Promise<void> {
    wrap.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';
    try {
      const data = await api.get<WeekResponse>(
        `/child/${encodeURIComponent(childId)}/week/${year}-W${padWeek(week)}`);

      const days: WeekDay[] = data.days.map((d) => ({
        date:          d.date,
        day_of_week:   d.day_of_week,
        assignment_id: d.assignment_id,
        schedule_id:   d.schedule_id,
        schedule_name: d.schedule_name,
        items:         d.items,
      }));

      renderWeekView(wrap, days, week, year, true /* readonly */, getUserWeekStart());

      // Highlight today
      wrap.querySelectorAll<HTMLElement>('.week-grid__day').forEach((col) => {
        if (col.querySelector('time')?.getAttribute('datetime') === todayStr)
          col.classList.add('week-grid__day--today');
      });

      // Wire nav
      wrap.querySelector<HTMLButtonElement>('.js-prev')?.addEventListener('click', () => {
        week--; if (week < 1) { year--; week = 52; } loadWeek();
      });
      wrap.querySelector<HTMLButtonElement>('.js-next')?.addEventListener('click', () => {
        week++; if (week > 52) { year++; week = 1; } loadWeek();
      });

      // Click day to see schedule items
      wrap.querySelectorAll<HTMLElement>('.day-schedule-badge__name').forEach((el) => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
          const dayCol = el.closest<HTMLElement>('.week-grid__day');
          const datetime = dayCol?.querySelector('time.week-grid__date')?.getAttribute('datetime');
          if (!datetime) return;
          const day = days.find((d) => d.date === datetime);
          if (day) openDayDetail(day);
        });
      });

    } catch (err) {
      wrap.innerHTML = `<p class="error-msg calendar-error-pad">
        ${err instanceof ApiError ? err.message : t('errors.generic')}</p>`;
    }
  }

  // ── Day detail modal ────────────────────────────────────────
  function openDayDetail(day: WeekDay): void {
    container.querySelector<HTMLElement>('#day-modal-title')!.textContent =
      `${day.schedule_name ?? t('calendar.no_schedule')} — ${formatIsoDateForUser(day.date)}`;
    const body = container.querySelector<HTMLElement>('#day-modal-body')!;
    body.innerHTML = day.items.length === 0
      ? `<p class="calendar-day-empty">${t('calendar.no_items')}</p>`
      : day.items.map((item) => `
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

  container.querySelector('#btn-day-close')?.addEventListener('click', () =>
    dayModal.classList.add('hidden'));
  dayModal.addEventListener('click', (e) => {
    if (e.target === dayModal) dayModal.classList.add('hidden');
  });

  await loadWeek();
}
