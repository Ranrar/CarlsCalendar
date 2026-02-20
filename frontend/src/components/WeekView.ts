import { t } from '@/i18n/i18n';
import { createScheduleItem, type ScheduleItemData } from '@/components/ScheduleItem';

export interface WeekDay {
  date: string;        // ISO 8601 date, e.g. "2026-02-23"
  day_of_week: number; // 1=Mon … 7=Sun
  items: ScheduleItemData[];
}

/**
 * Renders a 7-day week grid into `container`.
 * `readonly` — suppresses edit controls (child view).
 */
export function renderWeekView(
  container: HTMLElement,
  days: WeekDay[],
  isoWeek: number,
  year: number,
  readonly = false,
): void {
  const dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

  container.innerHTML = `
    <header class="week-view__header no-print">
      <button class="btn btn-secondary js-prev">← ${t('calendar.prev_week')}</button>
      <h2>${t('calendar.week', { week: isoWeek })} · ${year}</h2>
      <button class="btn btn-secondary js-next">${t('calendar.next_week')} →</button>
    </header>
    <div class="week-grid">
      ${days.map((day, i) => `
        <div class="week-grid__day">
          <h3 class="week-grid__day-name">${t(`calendar.days.${dayNames[i]}`)}</h3>
          <time class="week-grid__date" datetime="${day.date}">${day.date.slice(5)}</time>
          <div class="week-grid__items" data-day="${day.day_of_week}">
            ${day.items.length === 0 ? '<p style="color:var(--text-dim);font-size:.875rem">—</p>' : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  days.forEach((day, i) => {
    const col = container.querySelectorAll<HTMLElement>('.week-grid__items')[i];
    if (!col) return;
    day.items.forEach((item) => col.appendChild(createScheduleItem(item, readonly)));
  });
}
