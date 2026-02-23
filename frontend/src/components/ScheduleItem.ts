import { formatClockRangeForUser } from '@/utils/datetime';

export interface ScheduleItemData {
  id: string;
  title: string;
  description: string;
  picture_path: string | null;
  start_time: string;
  end_time: string | null;
  sort_order: number;
}

/**
 * Creates and returns an HTMLElement representing a single schedule item.
 */
export function createScheduleItem(item: ScheduleItemData): HTMLElement {
  const el = document.createElement('div');
  el.className = 'schedule-item card';
  el.dataset['id'] = item.id;

  const safeTitle = escapeHtml(item.title);
  const safeDesc = item.description ? escapeHtml(item.description) : '';
  const safePicturePath = item.picture_path ? escapeHtml(item.picture_path) : null;

  el.innerHTML = `
    ${safePicturePath
      ? `<img class="schedule-item__image" src="${safePicturePath}" alt="${safeTitle}" />`
      : `<div class="schedule-item__image schedule-item__image--placeholder"></div>`
    }
    <div class="schedule-item__body">
      <span class="schedule-item__time">${formatClockRangeForUser(item.start_time, item.end_time)}</span>
      <h3 class="schedule-item__title">${safeTitle}</h3>
      ${item.description ? `<p class="schedule-item__desc">${safeDesc}</p>` : ''}
    </div>
  `;

  const img = el.querySelector<HTMLImageElement>('.schedule-item__image');
  if (img && item.picture_path) {
    const fallback = toArasaacPngFallback(item.picture_path);
    if (fallback) {
      img.addEventListener('error', () => {
        img.src = fallback;
      }, { once: true });
    }
  }

  return el;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toArasaacPngFallback(path: string): string | null {
  const m = path.match(/\/(\d+)(?:\.svg|\.png)(?:\?.*)?$/i);
  if (!m) return null;
  const id = m[1];
  if (!id) return null;
  return `https://static.arasaac.org/pictograms/${id}/${id}_500.png`;
}
