import { t } from '@/i18n/i18n';
import { formatIsoDateForUser, getUserLocale, getUserWeekStart } from '@/utils/datetime';

export interface MonthDay {
  date: string;        // ISO 8601 date
  day_of_week: number; // 1=Mon … 7=Sun
  hasSchedule: boolean;
}

/**
 * Renders a month calendar grid into `container`.
 * Clicking a day fires `onDayClick(date)`.
 */
export function renderMonthView(
  container: HTMLElement,
  year: number,
  month: number, // 1-12
  days: MonthDay[],
  onDayClick?: (date: string) => void,
): void {
  const locale = getUserLocale();
  const weekStart = getUserWeekStart();
  const monthName = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));

  const orderedWeekdays = Array.from({ length: 7 }, (_, idx) => ((weekStart - 1 + idx) % 7) + 1);
  const weekdayLabels = orderedWeekdays.map((dow) => {
    const ref = new Date(Date.UTC(2024, 0, dow));
    return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(ref);
  });

  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const firstDay = sortedDays[0];
  const leadingBlanks = firstDay ? ((firstDay.day_of_week - weekStart + 7) % 7) : 0;
  const dayCells = [
    ...Array.from({ length: leadingBlanks }, () => '<div class="month-grid__day month-grid__day--empty" aria-hidden="true"></div>'),
    ...sortedDays.map((day) => {
      const dayNumber = day.date.match(/^\d{4}-\d{2}-(\d{2})$/)?.[1] ?? '';
      return `
        <div
          class="month-grid__day${day.hasSchedule ? ' month-grid__day--has-schedule' : ''}"
          data-date="${day.date}"
          role="button"
          tabindex="0"
          aria-label="${t('calendar.assign_weekly_schedule')}: ${formatIsoDateForUser(day.date)}"
        >
          ${Number.parseInt(dayNumber, 10)}
        </div>
      `;
    }),
  ];

  container.innerHTML = `
    <header class="month-view__header no-print">
      <button class="btn btn-secondary js-prev">←</button>
      <h2>${monthName}</h2>
      <button class="btn btn-secondary js-next">→</button>
    </header>
    <div class="month-grid">
      ${weekdayLabels.map((d) => `<div class="month-grid__heading">${d}</div>`).join('')}
      ${dayCells.join('')}
    </div>
  `;

  if (onDayClick) {
    container.querySelectorAll<HTMLElement>('.month-grid__day').forEach((el) => {
      el.addEventListener('click', () => onDayClick(el.dataset['date']!));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') onDayClick(el.dataset['date']!);
      });
    });
  }
}
