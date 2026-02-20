import { t } from '@/i18n/i18n';
import { api } from '@/api/client';

interface Child {
  id: string;
  display_name: string;
  avatar_path: string | null;
}

export async function render(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <main class="container" style="padding-top:2rem">
      <h1>${t('nav.dashboard')}</h1>
      <section id="children-list" style="margin-top:2rem;display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
        <p>Loading…</p>
      </section>
    </main>
  `;

  const list = container.querySelector<HTMLElement>('#children-list')!;

  try {
    const children = await api.get<Child[]>('/children');
    if (children.length === 0) {
      list.innerHTML = `<p>No children yet. <a href="/children">Add a child</a>.</p>`;
      return;
    }
    list.innerHTML = children.map((child) => `
      <div class="card">
        <h3>${child.display_name}</h3>
        <p style="margin-top:.5rem">
          <a href="/calendar?child=${child.id}">${t('nav.calendar')}</a> ·
          <a href="/schedules?child=${child.id}">${t('nav.schedules')}</a>
        </p>
      </div>
    `).join('');
  } catch {
    list.innerHTML = `<p style="color:#e05555">${t('errors.generic')}</p>`;
  }
}
