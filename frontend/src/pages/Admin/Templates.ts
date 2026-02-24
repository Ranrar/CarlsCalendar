import { api, ApiError } from '@/api/client';

interface AdminTemplate {
  id: string;
  owner_id: string;
  name: string;
  status: 'active' | 'inactive' | 'archived' | string;
}

function errMsg(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Unexpected error';
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function render(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <main class="container page-content">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
        <div>
          <h1>Manage Templates</h1>
          <p style="margin-top:.25rem;color:var(--text-muted)">Create, rename, archive, and edit predefined templates.</p>
        </div>
        <a class="btn btn-secondary" href="/admin">Back to Admin</a>
      </div>

      <section class="card" style="padding:1rem;margin-bottom:1rem">
        <h2 style="margin-bottom:.75rem">Create template</h2>
        <form id="template-create-form" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
          <input name="name" required placeholder="Template name" style="min-width:240px" />
          <button class="btn btn-primary" type="submit">Create</button>
        </form>
        <p id="template-create-error" class="error-msg" aria-live="polite"></p>
      </section>

      <section class="card" style="padding:1rem">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.75rem;flex-wrap:wrap;margin-bottom:.75rem">
          <h2>Template list</h2>
          <label style="display:flex;align-items:center;gap:.4rem">
            <input id="js-show-archived" type="checkbox" /> Show archived
          </label>
        </div>
        <div id="template-list"><div class="empty-state"><p>Loading…</p></div></div>
      </section>
    </main>
  `;

  const listEl = container.querySelector<HTMLElement>('#template-list')!;
  const createForm = container.querySelector<HTMLFormElement>('#template-create-form')!;
  const createError = container.querySelector<HTMLParagraphElement>('#template-create-error')!;
  const showArchived = container.querySelector<HTMLInputElement>('#js-show-archived')!;

  let allTemplates: AdminTemplate[] = [];

  function renderList(): void {
    const rows = showArchived.checked
      ? allTemplates
      : allTemplates.filter((t) => t.status !== 'archived');

    if (rows.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><p>No templates found.</p></div>';
      return;
    }

    listEl.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((t) => `
              <tr>
                <td>
                  <input class="js-name" data-id="${t.id}" value="${escapeHtml(t.name)}" ${t.status === 'archived' ? 'disabled' : ''} />
                </td>
                <td>
                  ${t.status === 'active'
                    ? '<span class="badge badge-active">active</span>'
                    : t.status === 'archived'
                      ? '<span class="badge badge-archived">archived</span>'
                      : `<span class="badge">${escapeHtml(t.status)}</span>`}
                </td>
                <td style="display:flex;gap:.375rem;flex-wrap:wrap">
                  <button class="btn btn-secondary btn-sm js-rename" data-id="${t.id}" ${t.status === 'archived' ? 'disabled' : ''}>Save name</button>
                  <a class="btn btn-secondary btn-sm ${t.status === 'archived' ? 'disabled' : ''}" href="/weeklyschedule/${t.id}" ${t.status === 'archived' ? 'tabindex="-1" aria-disabled="true"' : ''}>Edit items</a>
                  ${t.status !== 'archived'
                    ? `<button class="btn btn-secondary btn-sm js-archive" data-id="${t.id}">Archive</button>`
                    : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function loadTemplates(): Promise<void> {
    listEl.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';
    try {
      allTemplates = await api.get<AdminTemplate[]>('/admin/templates');
      renderList();
    } catch (err) {
      listEl.innerHTML = `<p class="error-msg">${escapeHtml(errMsg(err))}</p>`;
    }
  }

  createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    createError.textContent = '';
    const fd = new FormData(createForm);
    const name = String(fd.get('name') ?? '').trim();
    if (!name) {
      createError.textContent = 'Template name is required.';
      return;
    }

    try {
      await api.post('/admin/templates', { name });
      createForm.reset();
      await loadTemplates();
    } catch (err) {
      createError.textContent = errMsg(err);
    }
  });

  showArchived.addEventListener('change', renderList);

  container.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;

    const renameBtn = target.closest<HTMLButtonElement>('.js-rename');
    if (renameBtn) {
      const id = renameBtn.dataset['id'];
      if (!id) return;
      const input = container.querySelector<HTMLInputElement>(`.js-name[data-id="${id}"]`);
      const name = input?.value.trim() ?? '';
      if (!name) {
        alert('Template name cannot be empty.');
        return;
      }
      renameBtn.disabled = true;
      try {
        await api.put(`/admin/templates/${id}`, { name });
        await loadTemplates();
      } catch (err) {
        alert(errMsg(err));
      } finally {
        renameBtn.disabled = false;
      }
      return;
    }

    const archiveBtn = target.closest<HTMLButtonElement>('.js-archive');
    if (archiveBtn) {
      const id = archiveBtn.dataset['id'];
      if (!id) return;
      if (!window.confirm('Archive this template?')) return;
      archiveBtn.disabled = true;
      try {
        await api.delete(`/admin/templates/${id}`);
        await loadTemplates();
      } catch (err) {
        alert(errMsg(err));
      } finally {
        archiveBtn.disabled = false;
      }
    }
  });

  await loadTemplates();
}
