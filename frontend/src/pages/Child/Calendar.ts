import { t } from '@/i18n/i18n';
import { api } from '@/api/client';
import { renderWeekView, type WeekDay } from '@/components/WeekView';

function getISOWeek(d: Date): number {
  const tmp = new Date(d); tmp.setHours(0,0,0,0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const w1 = new Date(tmp.getFullYear(), 0, 4);
  return 1 + Math.round(((tmp.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}
function mondayOfWeek(year: number, week: number): Date {
  const s = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = s.getDay(); const m = new Date(s);
  m.setDate(s.getDate() - (dow <= 4 ? dow - 1 : dow - 8)); return m;
}
const isoDate = (d: Date): string => d.toISOString().split('T')[0] ?? '';

export async function render(container: HTMLElement): Promise<void> {
  const today = new Date();
  let week = getISOWeek(today); let year = today.getFullYear();

  container.innerHTML = `
    <main class="container page-content">
      <div id="week-wrap" class="week-view-wrap child-view">
        <div class="empty-state"><p>Loading your calendar…</p></div>
      </div>
    </main>`;

  const wrap = container.querySelector<HTMLElement>('#week-wrap')!;
  const todayStr = isoDate(today);

  async function loadWeek(): Promise<void> {
    wrap.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';
    try {
      const monday = mondayOfWeek(year, week);
      const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday); d.setDate(monday.getDate() + i);
        return { date: isoDate(d), day_of_week: i + 1, items: [] };
      });
      const data = await api.get<{ date: string; items: WeekDay['items'] }[]>(
        `/my-calendar?week=${week}&year=${year}`);
      data.forEach((a) => { const day = days.find((d) => d.date === a.date); if (day) day.items = a.items; });
      renderWeekView(wrap, days, week, year, true);
      // Highlight today
      wrap.querySelectorAll<HTMLElement>('.week-grid__day').forEach((col) => {
        if (col.querySelector('time')?.getAttribute('datetime') === todayStr)
          col.classList.add('week-grid__day--today');
      });
      wrap.querySelector<HTMLButtonElement>('.js-prev')?.addEventListener('click', () => { week--; if (week < 1) { year--; week = 52; } loadWeek(); });
      wrap.querySelector<HTMLButtonElement>('.js-next')?.addEventListener('click', () => { week++; if (week > 52) { year++; week = 1; } loadWeek(); });
    } catch {
      wrap.innerHTML = `<p class="error-msg" style="padding:2rem">${t('errors.generic')}</p>`;
    }
  }

  await loadWeek();
}
