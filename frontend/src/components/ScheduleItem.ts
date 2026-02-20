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
 * `readonly` — if true, suppresses edit/delete controls (child view).
 */
export function createScheduleItem(item: ScheduleItemData, readonly = false): HTMLElement {
  const el = document.createElement('div');
  el.className = 'schedule-item card';
  el.dataset['id'] = item.id;

  el.innerHTML = `
    ${item.picture_path
      ? `<img class="schedule-item__image" src="${item.picture_path}" alt="${item.title}" />`
      : `<div class="schedule-item__image schedule-item__image--placeholder"></div>`
    }
    <div class="schedule-item__body">
      <span class="schedule-item__time">${item.start_time}${item.end_time ? ` – ${item.end_time}` : ''}</span>
      <h3 class="schedule-item__title">${item.title}</h3>
      ${item.description ? `<p class="schedule-item__desc">${item.description}</p>` : ''}
    </div>
    ${!readonly ? `
      <div class="schedule-item__actions no-print">
        <button class="btn btn-secondary js-edit" data-id="${item.id}">Edit</button>
        <button class="btn btn-secondary js-delete" data-id="${item.id}">Delete</button>
      </div>
    ` : ''}
  `;

  return el;
}
