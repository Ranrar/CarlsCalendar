import { t } from '@/i18n/i18n';
import { createScheduleItem, type ScheduleItemData } from '@/components/ScheduleItem';

export interface DayData {
  date: string;        // ISO 8601 date, e.g. "2026-02-23"
  day_of_week: number; // 1=Mon … 7=Sun
  items: ScheduleItemData[];
}

/**
 * Renders a single day's schedule into `container`.
 * `readonly` — suppresses edit controls (child view).
 */
export function renderDayView(
  container: HTMLElement,
  day: DayData,
  readonly = false,
): void {
  const dayName = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    .format(new Date(day.date));

  container.innerHTML = `
    <header class="day-view__header no-print">
      <button class="btn btn-secondary js-prev">← ${t('calendar.prev_week')}</button>
      <h2>${dayName}</h2>
      <button class="btn btn-secondary js-next">${t('calendar.next_week')} →</button>
    </header>
    <div class="day-view__items" id="day-items">
      ${day.items.length === 0 ? '<p style="color:var(--text-dim)">No activities scheduled.</p>' : ''}
    </div>
  `;

  const itemsContainer = container.querySelector<HTMLElement>('#day-items')!;
  day.items.forEach((item) => itemsContainer.appendChild(createScheduleItem(item, readonly)));
}
