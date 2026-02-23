import { t } from '@/i18n/i18n';
import { api } from '@/api/client';

interface User {
  id: string;
  email: string | null;
  username: string | null;
  role: 'parent' | 'child' | 'admin';
  is_active: boolean;
  created_at: string;
}

export async function render(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <main class="container page-content">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
        <h1>Admin Dashboard</h1>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <a class="btn btn-secondary" href="/admin/templates">Manage Templates</a>
          <a class="btn btn-secondary" href="/admin/visual-templates">Visual Templates</a>
          <a class="btn btn-secondary" href="/admin/compliance">Open Compliance Center</a>
        </div>
      </div>

      <section id="tab-users">
        <div id="user-list"><div class="empty-state"><p>Loading…</p></div></div>
      </section>
    </main>`;

  async function loadUsers(): Promise<void> {
    const el = container.querySelector<HTMLElement>('#user-list')!;
    try {
      const users = await api.get<User[]>('/admin/users');
      if (users.length === 0) { el.innerHTML = '<div class="empty-state"><p>No users found.</p></div>'; return; }
      el.innerHTML = `
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>User</th><th>Role</th><th>Active</th><th>Actions</th></tr></thead>
            <tbody>${users.map((u) => `
              <tr>
                <td>
                  <div style="font-weight:600">${u.username ?? ''}</div>
                  ${u.email ? `<div style="font-size:.8125rem;color:var(--text-muted)">${u.email}</div>` : ''}
                </td>
                <td><span class="badge badge-role-${u.role}">${u.role}</span></td>
                <td>${u.is_active ? '<span class="badge badge-active">Yes</span>' : '<span class="badge badge-archived">No</span>'}</td>
                <td style="display:flex;gap:.375rem;flex-wrap:wrap">
                  <button class="btn btn-secondary btn-sm js-toggle" data-id="${u.id}" data-active="${u.is_active}">
                    ${u.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
      el.querySelectorAll<HTMLButtonElement>('.js-toggle').forEach((btn) =>
        btn.addEventListener('click', () => toggleUser(btn.dataset['id']!, btn.dataset['active'] === 'true')));
    } catch { el.innerHTML = `<p class="error-msg">${t('errors.generic')}</p>`; }
  }

  async function toggleUser(id: string, active: boolean): Promise<void> {
    try { await api.put(`/admin/users/${id}`, { is_active: !active }); await loadUsers(); }
    catch { alert(t('errors.generic')); }
  }

  await loadUsers();
}
