import { t } from '@/i18n/i18n';
import { createScheduleItem, type ScheduleItemData } from '@/components/ScheduleItem';
import { printWeek } from '@/components/Print';
import { formatIsoDateForUser } from '@/utils/datetime';

export interface WeekDay {
  date: string;        // ISO 8601 date, e.g. "2026-02-23"
  day_of_week: number; // 1=Mon … 7=Sun
  assignment_id: string | null;
  schedule_id:   string | null;
  schedule_name: string | null;
  activity_cards: ScheduleItemData[];
}

/**
 * Renders a 7-day week grid into `container`.
 * `readonly` — suppresses edit controls (child view).
 *
 * After calling this, the caller can wire `.js-assign` and `.js-unassign` buttons:
 *   - `.js-assign[data-dow]`             — day has no schedule yet
 *   - `.js-unassign[data-assignment-id]` — day has a schedule assigned
 */
export function renderWeekView(
  container: HTMLElement,
  days: WeekDay[],
  isoWeek: number,
  year: number,
  readonly = false,
  weekStart = 1,
  visibleDays: 5 | 7 = 7,
): void {
  const dayNamesByDow: Record<number, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = {
    1: 'mon',
    2: 'tue',
    3: 'wed',
    4: 'thu',
    5: 'fri',
    6: 'sat',
    7: 'sun',
  };
  const orderedDows = [1, 2, 3, 4, 5, 6, 7]
    .slice(weekStart - 1)
    .concat([1, 2, 3, 4, 5, 6, 7].slice(0, weekStart - 1));
  const orderedDays = orderedDows
    .filter((dow) => visibleDays === 7 || dow <= 5)
    .map((dow) => days.find((d) => d.day_of_week === dow))
    .filter((d): d is WeekDay => Boolean(d));

  container.innerHTML = `
    <header class="week-view__header">
      <button class="btn btn-secondary js-prev no-print">← ${t('calendar.prev_week')}</button>
      <h2>${t('calendar.week', { week: isoWeek })} · ${year}</h2>
      <div style="display:flex;gap:.5rem;align-items:center">
        <button class="btn btn-secondary js-next no-print">${t('calendar.next_week')} →</button>
        <button class="btn btn-secondary btn-sm js-print-week no-print" title="${t('print.week')}">🖨 ${t('print.week')}</button>
      </div>
    </header>
    <div class="week-grid week-grid--${visibleDays} printable-week">
      ${orderedDays.map((day) => `
        <div class="week-grid__day">
          <h3 class="week-grid__day-name">${t(`calendar.days.${dayNamesByDow[day.day_of_week]}`)}</h3>
          <time class="week-grid__date" datetime="${day.date}">${formatIsoDateForUser(day.date)}</time>
          ${day.schedule_name
            ? `<div class="day-schedule-badge">
                <span class="day-schedule-badge__name">📋 ${escapeHtml(day.schedule_name)}</span>
                ${!readonly && day.assignment_id
                  ? `<button class="btn-icon js-unassign" data-assignment-id="${day.assignment_id}" data-dow="${day.day_of_week}" title="${t('calendar.unassign')}">×</button>`
                  : ''}
              </div>`
            : (!readonly
              ? `<button class="btn btn-secondary btn-sm js-assign" data-dow="${day.day_of_week}" data-date="${day.date}">${t('calendar.assign_weekly_schedule')}</button>`
                : '')
          }
          <div class="week-grid__items" data-day="${day.day_of_week}">
            ${day.activity_cards.length === 0 && !day.schedule_name ? '<p style="color:var(--text-dim);font-size:.875rem;margin:0">—</p>' : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  orderedDays.forEach((day, i) => {
    const col = container.querySelectorAll<HTMLElement>('.week-grid__items')[i];
    if (!col) return;
    day.activity_cards.forEach((item) => col.appendChild(createScheduleItem(item)));
  });

  // Wire print button
  container.querySelector<HTMLButtonElement>('.js-print-week')
    ?.addEventListener('click', () => printWeek());
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
