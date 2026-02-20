import { t } from '@/i18n/i18n';

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
  const monthName = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1));

  container.innerHTML = `
    <header class="month-view__header no-print">
      <button class="btn btn-secondary js-prev">←</button>
      <h2>${monthName}</h2>
      <button class="btn btn-secondary js-next">→</button>
    </header>
    <div class="month-grid">
      ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => `<div class="month-grid__heading">${d}</div>`).join('')}
      ${days.map((day) => `
        <div
          class="month-grid__day${day.hasSchedule ? ' month-grid__day--has-schedule' : ''}"
          data-date="${day.date}"
          role="button"
          tabindex="0"
        >
          ${new Date(day.date).getDate()}
        </div>
      `).join('')}
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
