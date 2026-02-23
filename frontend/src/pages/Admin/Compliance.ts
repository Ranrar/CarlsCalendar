import { api, ApiError } from '@/api/client';
import { formatDateTimeForUser, formatIsoDateForUser, toEpochMillis } from '@/utils/datetime';

type DsrAuditLog = {
  id: string;
  request_id: string;
  user_id: string | null;
  action: 'export' | 'delete';
  status: 'started' | 'completed' | 'failed';
  requested_at: string;
  completed_at: string | null;
  error_message: string | null;
  actor_user_id: string | null;
  metadata: string | null;
};

type DeletionLog = {
  id: string;
  table_name: string;
  record_id: string | null;
  deleted_at: string;
  reason: string;
  details: string | null;
  actor_user_id: string | null;
};

type RetentionRule = {
  id: string;
  name: string;
  table_name: string;
  timestamp_column: string;
  retention_days: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type BreachLog = {
  id: string;
  detected_at: string;
  reported_at: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'contained' | 'resolved';
  title: string;
  description: string | null;
  affected_records: number | null;
  authority_notified: boolean;
  data_subjects_notified: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type Subprocessor = {
  id: string;
  provider: string;
  purpose: string;
  location: string;
  dpa_signed_date: string | null;
  transfer_basis: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type PictogramPrefetchSettings = {
  enabled: boolean;
  idle_minutes: number;
  batch_size: number;
  last_run_at: string | null;
  last_result: {
    processed_ids?: number;
    downloaded?: number;
    already_cached?: number;
    hydrated_seeded?: number;
    idle_seconds?: number;
  } | null;
  idle_seconds: number;
};

type PictogramPrefetchRunResult = {
  processed_ids: number;
  downloaded: number;
  already_cached: number;
  hydrated_seeded: number;
  idle_seconds: number;
};

const BREACH_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const BREACH_STATUSES = ['open', 'investigating', 'contained', 'resolved'] as const;
const FILTER_STATE_KEY = 'admin-compliance-filters-v1';

type ComplianceFilterState = {
  breachStatus: string;
  breachSeverity: string;
  breachFrom: string;
  breachTo: string;
  breachQuery: string;
  dsrQuery: string;
  deletionQuery: string;
};

function fmtDate(value: string | null): string {
  return formatDateTimeForUser(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return `${err.message} (HTTP ${err.status})`;
  if (err instanceof Error) return err.message;
  return 'Unexpected error';
}

function loadFilterState(): ComplianceFilterState | null {
  try {
    const raw = window.localStorage.getItem(FILTER_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ComplianceFilterState>;
    return {
      breachStatus: String(parsed.breachStatus ?? 'all'),
      breachSeverity: String(parsed.breachSeverity ?? 'all'),
      breachFrom: String(parsed.breachFrom ?? ''),
      breachTo: String(parsed.breachTo ?? ''),
      breachQuery: String(parsed.breachQuery ?? ''),
      dsrQuery: String(parsed.dsrQuery ?? ''),
      deletionQuery: String(parsed.deletionQuery ?? ''),
    };
  } catch {
    return null;
  }
}

export async function render(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <main class="container page-content">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
        <h1>Compliance Center</h1>
        <button id="js-run-retention" class="btn btn-secondary">Run retention cleanup now</button>
      </div>

      <section style="display:grid;gap:1rem">
        <article class="card" style="padding:1rem">
          <h2 style="margin-bottom:.5rem">Retention rules</h2>
          <form id="retention-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.5rem;margin-bottom:.75rem">
            <input name="name" required placeholder="Rule name" />
            <input name="table_name" required placeholder="Table (e.g. qr_tokens)" />
            <input name="timestamp_column" required placeholder="Timestamp column" />
            <input name="retention_days" required type="number" min="1" placeholder="Days" />
            <label style="display:flex;align-items:center;gap:.4rem"><input name="enabled" type="checkbox" checked /> Enabled</label>
            <button class="btn btn-primary" type="submit">Add rule</button>
          </form>
          <div id="retention-list"><p>Loading…</p></div>
        </article>

        <article class="card" style="padding:1rem">
          <h2 style="margin-bottom:.5rem">Pictogram prefetch (idle worker)</h2>
          <p style="margin:0 0 .75rem 0;color:var(--text-muted)">
            Prefetches ARASAAC pictograms to local seed storage while the app is idle.
          </p>
          <form id="prefetch-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.5rem;align-items:end;margin-bottom:.75rem">
            <label style="display:flex;align-items:center;gap:.4rem"><input id="js-prefetch-enabled" type="checkbox" /> Enabled</label>
            <label style="display:grid;gap:.25rem">
              <span>Idle minutes</span>
              <input id="js-prefetch-idle-minutes" type="number" min="1" max="1440" />
            </label>
            <label style="display:grid;gap:.25rem">
              <span>Batch size</span>
              <input id="js-prefetch-batch-size" type="number" min="1" max="2000" />
            </label>
            <button id="js-prefetch-save" class="btn btn-primary" type="submit">Save prefetch settings</button>
            <button id="js-prefetch-run" class="btn btn-secondary" type="button">Run prefetch now</button>
          </form>
          <div id="prefetch-summary"><p>Loading…</p></div>
        </article>

        <article class="card" style="padding:1rem">
          <h2 style="margin-bottom:.5rem">Breach logs</h2>
          <form id="breach-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:.5rem;margin-bottom:.75rem">
            <input name="title" required placeholder="Incident title" />
            <select name="severity">${BREACH_SEVERITIES.map((s) => `<option value="${s}">${s}</option>`).join('')}</select>
            <input name="affected_records" type="number" min="0" placeholder="Affected records (optional)" />
            <label style="display:flex;align-items:center;gap:.4rem"><input name="authority_notified" type="checkbox" /> Authority notified</label>
            <label style="display:flex;align-items:center;gap:.4rem"><input name="data_subjects_notified" type="checkbox" /> Data subjects notified</label>
            <input name="description" placeholder="Description (optional)" />
            <button class="btn btn-primary" type="submit">Create breach entry</button>
          </form>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.5rem;margin-bottom:.75rem">
            <select id="js-breach-filter-status">
              <option value="all">All statuses</option>
              ${BREACH_STATUSES.map((s) => `<option value="${s}">${s}</option>`).join('')}
            </select>
            <select id="js-breach-filter-severity">
              <option value="all">All severities</option>
              ${BREACH_SEVERITIES.map((s) => `<option value="${s}">${s}</option>`).join('')}
            </select>
            <input id="js-breach-filter-from" type="date" placeholder="From date" />
            <input id="js-breach-filter-to" type="date" placeholder="To date" />
            <input id="js-breach-filter-query" type="search" placeholder="Search title/description" />
            <button id="js-breach-filter-reset" class="btn btn-secondary" type="button">Reset filters</button>
          </div>
          <div id="breach-list"><p>Loading…</p></div>
        </article>

        <article class="card" style="padding:1rem">
          <h2 style="margin-bottom:.5rem">Subprocessors</h2>
          <form id="subprocessor-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:.5rem;margin-bottom:.75rem">
            <input name="provider" required placeholder="Provider" />
            <input name="purpose" required placeholder="Purpose" />
            <input name="location" required placeholder="Location" />
            <input name="transfer_basis" required placeholder="Transfer basis" />
            <input name="dpa_signed_date" type="date" />
            <input name="notes" placeholder="Notes" />
            <label style="display:flex;align-items:center;gap:.4rem"><input name="is_active" type="checkbox" checked /> Active</label>
            <button class="btn btn-primary" type="submit">Add subprocessor</button>
          </form>
          <div id="subprocessor-list"><p>Loading…</p></div>
        </article>

        <article class="card" style="padding:1rem">
          <h2 style="margin-bottom:.5rem">DSR audit logs</h2>
          <div style="margin-bottom:.75rem">
            <input id="js-dsr-filter-query" type="search" placeholder="Search request ID, action, status, user, error" />
          </div>
          <div id="dsr-list"><p>Loading…</p></div>
        </article>

        <article class="card" style="padding:1rem">
          <h2 style="margin-bottom:.5rem">Deletion logs</h2>
          <div style="margin-bottom:.75rem">
            <input id="js-deletion-filter-query" type="search" placeholder="Search table, record ID, reason, actor" />
          </div>
          <div id="deletion-list"><p>Loading…</p></div>
        </article>
      </section>
    </main>
  `;

  const retentionListEl = container.querySelector<HTMLElement>('#retention-list')!;
  const breachListEl = container.querySelector<HTMLElement>('#breach-list')!;
  const subprocessorListEl = container.querySelector<HTMLElement>('#subprocessor-list')!;
  const dsrListEl = container.querySelector<HTMLElement>('#dsr-list')!;
  const deletionListEl = container.querySelector<HTMLElement>('#deletion-list')!;
  const prefetchSummaryEl = container.querySelector<HTMLElement>('#prefetch-summary')!;
  const runRetentionBtn = container.querySelector<HTMLButtonElement>('#js-run-retention')!;
  const prefetchForm = container.querySelector<HTMLFormElement>('#prefetch-form')!;
  const prefetchEnabledEl = container.querySelector<HTMLInputElement>('#js-prefetch-enabled')!;
  const prefetchIdleEl = container.querySelector<HTMLInputElement>('#js-prefetch-idle-minutes')!;
  const prefetchBatchEl = container.querySelector<HTMLInputElement>('#js-prefetch-batch-size')!;
  const prefetchRunBtn = container.querySelector<HTMLButtonElement>('#js-prefetch-run')!;
  const breachFilterStatusEl = container.querySelector<HTMLSelectElement>('#js-breach-filter-status')!;
  const breachFilterSeverityEl = container.querySelector<HTMLSelectElement>('#js-breach-filter-severity')!;
  const breachFilterFromEl = container.querySelector<HTMLInputElement>('#js-breach-filter-from')!;
  const breachFilterToEl = container.querySelector<HTMLInputElement>('#js-breach-filter-to')!;
  const breachFilterQueryEl = container.querySelector<HTMLInputElement>('#js-breach-filter-query')!;
  const breachFilterResetBtn = container.querySelector<HTMLButtonElement>('#js-breach-filter-reset')!;
  const dsrFilterQueryEl = container.querySelector<HTMLInputElement>('#js-dsr-filter-query')!;
  const deletionFilterQueryEl = container.querySelector<HTMLInputElement>('#js-deletion-filter-query')!;

  let breachRowsCache: BreachLog[] = [];
  let dsrRowsCache: DsrAuditLog[] = [];
  let deletionRowsCache: DeletionLog[] = [];
  let prefetchSettingsCache: PictogramPrefetchSettings | null = null;

  function saveFilterState(): void {
    const payload: ComplianceFilterState = {
      breachStatus: breachFilterStatusEl.value,
      breachSeverity: breachFilterSeverityEl.value,
      breachFrom: breachFilterFromEl.value,
      breachTo: breachFilterToEl.value,
      breachQuery: breachFilterQueryEl.value,
      dsrQuery: dsrFilterQueryEl.value,
      deletionQuery: deletionFilterQueryEl.value,
    };

    try {
      window.localStorage.setItem(FILTER_STATE_KEY, JSON.stringify(payload));
    } catch {
      // Non-fatal (e.g., storage disabled)
    }
  }

  function dateFromInput(value: string, isEndOfDay: boolean): number | null {
    if (!value) return null;
    const d = new Date(`${value}T${isEndOfDay ? '23:59:59' : '00:00:00'}`);
    if (Number.isNaN(d.getTime())) return null;
    return d.getTime();
  }

  function renderBreachRows(rows: BreachLog[]): void {
    breachListEl.innerHTML = rows.length === 0
      ? '<div class="empty-state"><p>No breach logs match your current filters.</p></div>'
      : `<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Severity</th><th>Status</th><th>Title</th><th>Affected</th><th>Actions</th></tr></thead><tbody>${rows.map((r) => `
        <tr>
          <td>${fmtDate(r.detected_at)}</td>
          <td>${r.severity}</td>
          <td>
            <select class="js-breach-status" data-id="${r.id}">
              ${BREACH_STATUSES.map((s) => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </td>
          <td>${escapeHtml(r.title)}</td>
          <td>${r.affected_records ?? '—'}</td>
          <td><button class="btn btn-secondary btn-sm js-breach-save" data-id="${r.id}">Save status</button></td>
        </tr>`).join('')}</tbody></table></div>`;
  }

  function applyBreachFilters(): void {
    const status = breachFilterStatusEl.value;
    const severity = breachFilterSeverityEl.value;
    const fromTs = dateFromInput(breachFilterFromEl.value, false);
    const toTs = dateFromInput(breachFilterToEl.value, true);
    const query = breachFilterQueryEl.value.trim().toLocaleLowerCase();

    const filtered = breachRowsCache.filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (severity !== 'all' && row.severity !== severity) return false;

      const detected = toEpochMillis(row.detected_at);
      if (fromTs !== null && (detected === null || detected < fromTs)) return false;
      if (toTs !== null && (detected === null || detected > toTs)) return false;

      if (query) {
        const haystack = `${row.title} ${row.description ?? ''}`.toLocaleLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });

    renderBreachRows(filtered);
    saveFilterState();
  }

  function renderDsrRows(rows: DsrAuditLog[]): void {
    dsrListEl.innerHTML = rows.length === 0
      ? '<div class="empty-state"><p>No DSR audit logs match your search.</p></div>'
      : `<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Request ID</th><th>Action</th><th>Status</th><th>User</th><th>Error</th></tr></thead><tbody>${rows.slice(0, 100).map((r) => `
        <tr>
          <td>${fmtDate(r.requested_at)}</td>
          <td><code>${escapeHtml(r.request_id)}</code></td>
          <td>${r.action}</td>
          <td>${r.status}</td>
          <td>${r.user_id ?? '—'}</td>
          <td>${r.error_message ? escapeHtml(r.error_message) : '—'}</td>
        </tr>`).join('')}</tbody></table></div>`;
  }

  function applyDsrFilters(): void {
    const query = dsrFilterQueryEl.value.trim().toLocaleLowerCase();
    const filtered = !query
      ? dsrRowsCache
      : dsrRowsCache.filter((row) => {
          const haystack = `${row.request_id} ${row.action} ${row.status} ${row.user_id ?? ''} ${row.error_message ?? ''}`.toLocaleLowerCase();
          return haystack.includes(query);
        });
    renderDsrRows(filtered);
    saveFilterState();
  }

  function renderDeletionRows(rows: DeletionLog[]): void {
    deletionListEl.innerHTML = rows.length === 0
      ? '<div class="empty-state"><p>No deletion logs match your search.</p></div>'
      : `<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Table</th><th>Record</th><th>Reason</th><th>Actor</th></tr></thead><tbody>${rows.slice(0, 100).map((r) => `
        <tr>
          <td>${fmtDate(r.deleted_at)}</td>
          <td><code>${escapeHtml(r.table_name)}</code></td>
          <td>${r.record_id ?? '—'}</td>
          <td>${escapeHtml(r.reason)}</td>
          <td>${r.actor_user_id ?? 'system'}</td>
        </tr>`).join('')}</tbody></table></div>`;
  }

  function applyDeletionFilters(): void {
    const query = deletionFilterQueryEl.value.trim().toLocaleLowerCase();
    const filtered = !query
      ? deletionRowsCache
      : deletionRowsCache.filter((row) => {
          const haystack = `${row.table_name} ${row.record_id ?? ''} ${row.reason} ${row.actor_user_id ?? ''}`.toLocaleLowerCase();
          return haystack.includes(query);
        });
    renderDeletionRows(filtered);
    saveFilterState();
  }

  const savedFilters = loadFilterState();
  if (savedFilters) {
    breachFilterStatusEl.value = savedFilters.breachStatus;
    breachFilterSeverityEl.value = savedFilters.breachSeverity;
    breachFilterFromEl.value = savedFilters.breachFrom;
    breachFilterToEl.value = savedFilters.breachTo;
    breachFilterQueryEl.value = savedFilters.breachQuery;
    dsrFilterQueryEl.value = savedFilters.dsrQuery;
    deletionFilterQueryEl.value = savedFilters.deletionQuery;
  }

  async function loadRetentionRules(): Promise<void> {
    try {
      const rules = await api.get<RetentionRule[]>('/admin/compliance/retention-rules');
      retentionListEl.innerHTML = rules.length === 0
        ? '<div class="empty-state"><p>No retention rules configured.</p></div>'
        : `<div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Target</th><th>Days</th><th>Enabled</th><th>Actions</th></tr></thead><tbody>${rules.map((r) => `
          <tr>
            <td>${escapeHtml(r.name)}</td>
            <td><code>${escapeHtml(r.table_name)}.${escapeHtml(r.timestamp_column)}</code></td>
            <td><input class="js-rule-days" type="number" min="1" value="${r.retention_days}" data-id="${r.id}" style="width:90px" /></td>
            <td>${r.enabled ? 'Yes' : 'No'}</td>
            <td>
              <button class="btn btn-secondary btn-sm js-rule-toggle" data-id="${r.id}" data-enabled="${String(r.enabled)}">${r.enabled ? 'Disable' : 'Enable'}</button>
              <button class="btn btn-secondary btn-sm js-rule-save" data-id="${r.id}">Save days</button>
            </td>
          </tr>`).join('')}</tbody></table></div>`;
    } catch (err) {
      retentionListEl.innerHTML = `<p class="error-msg">Failed to load retention rules: ${escapeHtml(errorMessage(err))}</p>`;
    }
  }

  async function loadBreachLogs(): Promise<void> {
    try {
      breachRowsCache = await api.get<BreachLog[]>('/admin/compliance/breach-logs');
      applyBreachFilters();
    } catch (err) {
      breachListEl.innerHTML = `<p class="error-msg">Failed to load breach logs: ${escapeHtml(errorMessage(err))}</p>`;
    }
  }

  async function loadSubprocessors(): Promise<void> {
    try {
      const rows = await api.get<Subprocessor[]>('/admin/compliance/subprocessors');
      subprocessorListEl.innerHTML = rows.length === 0
        ? '<div class="empty-state"><p>No subprocessors configured.</p></div>'
        : `<div class="table-wrap"><table class="table"><thead><tr><th>Provider</th><th>Purpose</th><th>Location</th><th>Transfer basis</th><th>DPA date</th><th>Active</th><th>Actions</th></tr></thead><tbody>${rows.map((r) => `
          <tr>
            <td>${escapeHtml(r.provider)}</td>
            <td>${escapeHtml(r.purpose)}</td>
            <td>${escapeHtml(r.location)}</td>
            <td>${escapeHtml(r.transfer_basis)}</td>
            <td>${r.dpa_signed_date ? formatIsoDateForUser(r.dpa_signed_date) : '—'}</td>
            <td>${r.is_active ? 'Yes' : 'No'}</td>
            <td>
              <button class="btn btn-secondary btn-sm js-sub-toggle" data-id="${r.id}" data-active="${String(r.is_active)}">${r.is_active ? 'Set inactive' : 'Set active'}</button>
              <button class="btn btn-secondary btn-sm js-sub-delete" data-id="${r.id}">Delete</button>
            </td>
          </tr>`).join('')}</tbody></table></div>`;
    } catch (err) {
      subprocessorListEl.innerHTML = `<p class="error-msg">Failed to load subprocessors: ${escapeHtml(errorMessage(err))}</p>`;
    }
  }

  async function loadDsrLogs(): Promise<void> {
    try {
      dsrRowsCache = await api.get<DsrAuditLog[]>('/admin/compliance/dsr');
      applyDsrFilters();
    } catch (err) {
      dsrListEl.innerHTML = `<p class="error-msg">Failed to load DSR logs: ${escapeHtml(errorMessage(err))}</p>`;
    }
  }

  async function loadDeletionLogs(): Promise<void> {
    try {
      deletionRowsCache = await api.get<DeletionLog[]>('/admin/compliance/deletions');
      applyDeletionFilters();
    } catch (err) {
      deletionListEl.innerHTML = `<p class="error-msg">Failed to load deletion logs: ${escapeHtml(errorMessage(err))}</p>`;
    }
  }

  function renderPrefetchSummary(settings: PictogramPrefetchSettings): void {
    const lastRun = settings.last_run_at ? fmtDate(settings.last_run_at) : 'Never';
    const last = settings.last_result;

    prefetchSummaryEl.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <tbody>
            <tr><th>Worker status</th><td>${settings.enabled ? 'Enabled' : 'Disabled'}</td></tr>
            <tr><th>Current idle time</th><td>${Math.floor(settings.idle_seconds / 60)} min (${settings.idle_seconds}s)</td></tr>
            <tr><th>Last run</th><td>${lastRun}</td></tr>
            <tr><th>Last result</th><td>${last
              ? `processed=${last.processed_ids ?? 0}, downloaded=${last.downloaded ?? 0}, cached=${last.already_cached ?? 0}, hydrated_seeded=${last.hydrated_seeded ?? 0}`
              : 'No result yet'}</td></tr>
          </tbody>
        </table>
      </div>
    `;
  }

  async function loadPrefetchSettings(): Promise<void> {
    try {
      const settings = await api.get<PictogramPrefetchSettings>('/admin/compliance/pictogram-prefetch');
      prefetchSettingsCache = settings;
      prefetchEnabledEl.checked = settings.enabled;
      prefetchIdleEl.value = String(settings.idle_minutes);
      prefetchBatchEl.value = String(settings.batch_size);
      renderPrefetchSummary(settings);
    } catch (err) {
      prefetchSummaryEl.innerHTML = `<p class="error-msg">Failed to load prefetch settings: ${escapeHtml(errorMessage(err))}</p>`;
    }
  }

  async function loadAll(): Promise<void> {
    await Promise.all([
      loadRetentionRules(),
      loadPrefetchSettings(),
      loadBreachLogs(),
      loadSubprocessors(),
      loadDsrLogs(),
      loadDeletionLogs(),
    ]);
  }

  container.querySelector<HTMLFormElement>('#retention-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    try {
      await api.post<RetentionRule>('/admin/compliance/retention-rules', {
        name: String(fd.get('name') ?? '').trim(),
        table_name: String(fd.get('table_name') ?? '').trim(),
        timestamp_column: String(fd.get('timestamp_column') ?? '').trim(),
        retention_days: Number(fd.get('retention_days')),
        enabled: fd.get('enabled') === 'on',
      });
      form.reset();
      await loadRetentionRules();
    } catch (err) {
      alert(`Failed to create retention rule: ${errorMessage(err)}`);
    }
  });

  container.querySelector<HTMLFormElement>('#breach-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    const affectedRaw = String(fd.get('affected_records') ?? '').trim();
    try {
      await api.post<BreachLog>('/admin/compliance/breach-logs', {
        severity: String(fd.get('severity') ?? 'low'),
        title: String(fd.get('title') ?? '').trim(),
        description: String(fd.get('description') ?? '').trim() || null,
        affected_records: affectedRaw ? Number(affectedRaw) : null,
        authority_notified: fd.get('authority_notified') === 'on',
        data_subjects_notified: fd.get('data_subjects_notified') === 'on',
      });
      form.reset();
      await loadBreachLogs();
    } catch (err) {
      alert(`Failed to create breach log: ${errorMessage(err)}`);
    }
  });

  container.querySelector<HTMLFormElement>('#subprocessor-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    try {
      await api.post<Subprocessor>('/admin/compliance/subprocessors', {
        provider: String(fd.get('provider') ?? '').trim(),
        purpose: String(fd.get('purpose') ?? '').trim(),
        location: String(fd.get('location') ?? '').trim(),
        transfer_basis: String(fd.get('transfer_basis') ?? '').trim(),
        dpa_signed_date: String(fd.get('dpa_signed_date') ?? '').trim() || null,
        notes: String(fd.get('notes') ?? '').trim() || null,
        is_active: fd.get('is_active') === 'on',
      });
      form.reset();
      await loadSubprocessors();
    } catch (err) {
      alert(`Failed to create subprocessor: ${errorMessage(err)}`);
    }
  });

  container.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;

    const toggleRuleBtn = target.closest<HTMLButtonElement>('.js-rule-toggle');
    if (toggleRuleBtn) {
      const id = toggleRuleBtn.dataset['id'];
      const enabled = toggleRuleBtn.dataset['enabled'] === 'true';
      if (!id) return;
      try {
        await api.put<RetentionRule>(`/admin/compliance/retention-rules/${id}`, { enabled: !enabled });
        await loadRetentionRules();
      } catch (err) {
        alert(`Failed to update retention rule: ${errorMessage(err)}`);
      }
      return;
    }

    const saveRuleBtn = target.closest<HTMLButtonElement>('.js-rule-save');
    if (saveRuleBtn) {
      const id = saveRuleBtn.dataset['id'];
      if (!id) return;
      const input = container.querySelector<HTMLInputElement>(`.js-rule-days[data-id="${id}"]`);
      const days = Number(input?.value ?? '0');
      if (!Number.isFinite(days) || days <= 0) {
        alert('Retention days must be greater than 0.');
        return;
      }
      try {
        await api.put<RetentionRule>(`/admin/compliance/retention-rules/${id}`, { retention_days: days });
        await loadRetentionRules();
      } catch (err) {
        alert(`Failed to update retention days: ${errorMessage(err)}`);
      }
      return;
    }

    const saveBreachBtn = target.closest<HTMLButtonElement>('.js-breach-save');
    if (saveBreachBtn) {
      const id = saveBreachBtn.dataset['id'];
      if (!id) return;
      const select = container.querySelector<HTMLSelectElement>(`.js-breach-status[data-id="${id}"]`);
      const status = select?.value;
      if (!status) return;
      try {
        await api.put<BreachLog>(`/admin/compliance/breach-logs/${id}`, { status });
        await loadBreachLogs();
      } catch (err) {
        alert(`Failed to update breach status: ${errorMessage(err)}`);
      }
      return;
    }

    const toggleSubBtn = target.closest<HTMLButtonElement>('.js-sub-toggle');
    if (toggleSubBtn) {
      const id = toggleSubBtn.dataset['id'];
      const active = toggleSubBtn.dataset['active'] === 'true';
      if (!id) return;
      try {
        await api.put<Subprocessor>(`/admin/compliance/subprocessors/${id}`, { is_active: !active });
        await loadSubprocessors();
      } catch (err) {
        alert(`Failed to update subprocessor: ${errorMessage(err)}`);
      }
      return;
    }

    const deleteSubBtn = target.closest<HTMLButtonElement>('.js-sub-delete');
    if (deleteSubBtn) {
      const id = deleteSubBtn.dataset['id'];
      if (!id) return;
      if (!window.confirm('Delete this subprocessor entry?')) return;
      try {
        await api.delete<void>(`/admin/compliance/subprocessors/${id}`);
        await loadSubprocessors();
      } catch (err) {
        alert(`Failed to delete subprocessor: ${errorMessage(err)}`);
      }
    }
  });

  runRetentionBtn.addEventListener('click', async () => {
    runRetentionBtn.disabled = true;
    const oldLabel = runRetentionBtn.textContent;
    runRetentionBtn.textContent = 'Running…';
    try {
      await api.post<void>('/admin/compliance/retention/cleanup', {});
      await loadDeletionLogs();
      alert('Retention cleanup completed.');
    } catch (err) {
      alert(`Failed to run retention cleanup: ${errorMessage(err)}`);
    } finally {
      runRetentionBtn.disabled = false;
      runRetentionBtn.textContent = oldLabel;
    }
  });

  prefetchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const idleMinutes = Number(prefetchIdleEl.value || '0');
    const batchSize = Number(prefetchBatchEl.value || '0');
    if (!Number.isFinite(idleMinutes) || idleMinutes <= 0) {
      alert('Idle minutes must be greater than 0.');
      return;
    }
    if (!Number.isFinite(batchSize) || batchSize <= 0) {
      alert('Batch size must be greater than 0.');
      return;
    }

    const submitBtn = container.querySelector<HTMLButtonElement>('#js-prefetch-save');
    if (submitBtn) submitBtn.disabled = true;
    try {
      const updated = await api.put<PictogramPrefetchSettings>('/admin/compliance/pictogram-prefetch', {
        enabled: prefetchEnabledEl.checked,
        idle_minutes: idleMinutes,
        batch_size: batchSize,
      });
      prefetchSettingsCache = updated;
      renderPrefetchSummary(updated);
      alert('Pictogram prefetch settings saved.');
    } catch (err) {
      alert(`Failed to save prefetch settings: ${errorMessage(err)}`);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  prefetchRunBtn.addEventListener('click', async () => {
    prefetchRunBtn.disabled = true;
    const oldLabel = prefetchRunBtn.textContent;
    prefetchRunBtn.textContent = 'Running…';
    try {
      const result = await api.post<PictogramPrefetchRunResult>('/admin/compliance/pictogram-prefetch/run', {});
      await loadPrefetchSettings();
      alert(`Prefetch completed. Processed ${result.processed_ids}, downloaded ${result.downloaded}, already cached ${result.already_cached}.`);
    } catch (err) {
      alert(`Failed to run pictogram prefetch: ${errorMessage(err)}`);
    } finally {
      prefetchRunBtn.disabled = false;
      prefetchRunBtn.textContent = oldLabel;
    }
  });

  breachFilterStatusEl.addEventListener('change', applyBreachFilters);
  breachFilterSeverityEl.addEventListener('change', applyBreachFilters);
  breachFilterFromEl.addEventListener('change', applyBreachFilters);
  breachFilterToEl.addEventListener('change', applyBreachFilters);
  breachFilterQueryEl.addEventListener('input', applyBreachFilters);
  breachFilterResetBtn.addEventListener('click', () => {
    breachFilterStatusEl.value = 'all';
    breachFilterSeverityEl.value = 'all';
    breachFilterFromEl.value = '';
    breachFilterToEl.value = '';
    breachFilterQueryEl.value = '';
    applyBreachFilters();
  });

  dsrFilterQueryEl.addEventListener('input', applyDsrFilters);
  deletionFilterQueryEl.addEventListener('input', applyDeletionFilters);

  await loadAll();
}
