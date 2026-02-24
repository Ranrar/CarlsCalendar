import { t } from '@/i18n/i18n';
import { api, ApiError } from '@/api/client';
import { router } from '@/router';
import { formatClockRangeForUser } from '@/utils/datetime';

// ── Types ────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  owner_id: string;
  status: string;
  is_template: boolean;
}

interface TemplateActivityCard {
  id: string;
  title: string;
  description: string | null;
  picture_path: string | null;
  start_time: string;
  end_time: string | null;
  sort_order: number;
}

interface TemplateDetail extends Template {
  activity_cards: TemplateActivityCard[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Page ─────────────────────────────────────────────────────

export async function render(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <main class="container page-content">
      <div class="page-header">
        <div>
          <a class="btn btn-secondary btn-sm templates-back-link" href="/weeklyschedule">
            ← ${t('schedule.back_weekly_schedule')}
          </a>
          <h1>${t('schedule.template_browser')}</h1>
          <p class="templates-intro">${t('schedule.template_browser_desc')}</p>
        </div>
      </div>
      <div id="template-list" class="schedule-list"></div>
    </main>

    <!-- Preview modal -->
    <div class="modal-backdrop hidden" id="preview-modal">
      <dialog class="modal templates-preview-modal" open role="dialog" aria-modal="true" aria-labelledby="preview-title">
        <div class="templates-preview-head">
          <h2 id="preview-title"></h2>
          <button class="btn btn-secondary btn-sm" id="btn-preview-close">✕</button>
        </div>
        <div id="preview-body" class="templates-preview-body"></div>
        <div class="modal-actions templates-preview-actions">
          <button class="btn btn-secondary" id="btn-preview-cancel">${t('schedule.cancel')}</button>
          <button class="btn btn-primary" id="btn-preview-copy">${t('schedule.template_use')}</button>
        </div>
        <p id="preview-error" class="error-msg" aria-live="polite"></p>
      </dialog>
    </div>

    <!-- Success toast -->
    <div id="copy-toast" class="toast toast--hidden" role="status" aria-live="polite">
      ${t('schedule.template_copied')}
    </div>
  `;

  const listEl       = container.querySelector<HTMLElement>('#template-list')!;
  const previewModal = container.querySelector<HTMLElement>('#preview-modal')!;
  const previewTitle = container.querySelector<HTMLElement>('#preview-title')!;
  const previewBody  = container.querySelector<HTMLElement>('#preview-body')!;
  const previewError = container.querySelector<HTMLParagraphElement>('#preview-error')!;
  const btnCopy      = container.querySelector<HTMLButtonElement>('#btn-preview-copy')!;
  const toast        = container.querySelector<HTMLElement>('#copy-toast')!;

  let currentTemplateId = '';

  // ── Load template list ──────────────────────────────────────
  async function loadTemplates(): Promise<void> {
    listEl.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';
    try {
      const templates = await api.get<Template[]>('/schedules/templates');
      if (templates.length === 0) {
        listEl.innerHTML = `
          <div class="empty-state">
            <span class="empty-state__icon">📋</span>
            <p>${t('schedule.template_empty')}</p>
          </div>`;
        return;
      }
      listEl.innerHTML = templates.map((tmpl) => `
        <div class="schedule-card card" data-id="${tmpl.id}">
          <div class="schedule-card__head">
            <div>
              <h3>${escapeHtml(tmpl.name)}</h3>
              <p class="templates-system-badge">
                ${t('schedule.template_system_badge')}
              </p>
            </div>
            <span class="badge badge-template">📋 ${t('schedule.template_label')}</span>
          </div>
          <div class="schedule-card__actions">
            <button class="btn btn-secondary btn-sm js-preview" data-id="${tmpl.id}">
              ${t('schedule.template_preview')}
            </button>
            <button class="btn btn-primary btn-sm js-copy" data-id="${tmpl.id}">
              ${t('schedule.template_use')}
            </button>
          </div>
        </div>`).join('');

      listEl.querySelectorAll<HTMLButtonElement>('.js-preview').forEach((btn) =>
        btn.addEventListener('click', () => openPreview(btn.dataset['id']!)));
      listEl.querySelectorAll<HTMLButtonElement>('.js-copy').forEach((btn) =>
        btn.addEventListener('click', () => copyTemplate(btn.dataset['id']!, btn)));
    } catch (err) {
      listEl.innerHTML = `<p class="error-msg">${err instanceof ApiError ? err.message : t('errors.generic')}</p>`;
    }
  }

  // ── Preview modal ───────────────────────────────────────────
  async function openPreview(id: string): Promise<void> {
    previewTitle.textContent = '…';
    previewBody.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';
    previewError.textContent = '';
    currentTemplateId = id;
    previewModal.classList.remove('hidden');
    btnCopy.disabled = false;

    try {
      const detail = await api.get<TemplateDetail>(`/schedules/templates/${id}`);
      previewTitle.textContent = detail.name;
      if (detail.activity_cards.length === 0) {
        previewBody.innerHTML = `<p class="templates-preview-empty">${t('schedule.activity_card.empty')}</p>`;
        return;
      }
      previewBody.innerHTML = detail.activity_cards.map((item) => `
        <div class="item-card card templates-preview-item">
          <div class="item-card__body">
            <div class="item-card__head">
              <span class="item-card__time">${formatClockRangeForUser(item.start_time, item.end_time)}</span>
              <strong class="item-card__title">${escapeHtml(item.title)}</strong>
            </div>
            ${item.description ? `<p class="item-card__desc">${escapeHtml(item.description)}</p>` : ''}
          </div>
        </div>`).join('');
    } catch (err) {
      previewBody.innerHTML = '';
      previewError.textContent = err instanceof ApiError ? err.message : t('errors.generic');
    }
  }

  function closePreview(): void {
    previewModal.classList.add('hidden');
    currentTemplateId = '';
  }

  container.querySelector('#btn-preview-close')?.addEventListener('click', closePreview);
  container.querySelector('#btn-preview-cancel')?.addEventListener('click', closePreview);
  previewModal.addEventListener('click', (e) => { if (e.target === previewModal) closePreview(); });

  btnCopy.addEventListener('click', async () => {
    if (!currentTemplateId) return;
    await copyTemplate(currentTemplateId, btnCopy);
    closePreview();
  });

  // ── Copy template ───────────────────────────────────────────
  async function copyTemplate(id: string, btn: HTMLButtonElement): Promise<void> {
    btn.disabled = true;
    try {
      await api.post(`/schedules/templates/${id}/copy`, {});
      showToast(t('schedule.template_copied'));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t('errors.copy_template_failed'));
      btn.disabled = false;
    }
  }

  function showToast(message: string): void {
    toast.textContent = message;
    toast.classList.remove('toast--hidden');
    toast.classList.add('toast--visible');
    setTimeout(() => {
      toast.classList.remove('toast--visible');
      toast.classList.add('toast--hidden');
      // Navigate to calendar where schedule management now lives.
      if (message === t('schedule.template_copied')) router.push('/weeklyschedule');
    }, 1800);
  }

  await loadTemplates();
}
