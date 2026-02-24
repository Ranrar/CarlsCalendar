# Refactor to Tabbed Document Types (Big-picture TODO)

Date: 2026-02-24

## Goals (what we're building)

- Replace the current **Visual supports** "all-in-one" area with **one left-menu tab per document type**, built incrementally.
- Keep **Pictogram Library**.
- Add a new parent-only page: **Create Activity cards** (manage user-owned activity cards: list / add / edit / delete).
- Move QR/device management out of **Children** into its own top-level parent-only page:
  **Child devices & QR management** (includes QR code per child, active devices, settings, logs).
- Kids have **no accounts** and do **not** use the normal login flow. Kids only access a read-only view via QR login.
- No backwards compatibility: old routes should not redirect; remove legacy paths as we go.
- Sidebar names must match the names we decide on (single source of truth via `nav.*` i18n keys).

## Non-goals (for now)

- A new print system. Printing is known-broken; each tab may keep "good enough" printing until the new print framework is designed.
- Deleting **Visual supports** immediately. It remains temporarily while refactoring; it will be removed when feature parity is reached.

---

## Current document types in the codebase (source of truth)

Frontend `DocumentType` currently includes:

- `DAILY_SCHEDULE`
- `WEEKLY_SCHEDULE`
- `FIRST_THEN`
- `CHOICE_BOARD`
- `ROUTINE_STEPS`
- `EMOTION_CARDS`
- `AAC_BOARD`
- `REWARD_TRACKER`

Backend `visual-documents` routes allow:

- DAILY_SCHEDULE, FIRST_THEN, CHOICE_BOARD, ROUTINE_STEPS, EMOTION_CARDS, REWARD_TRACKER

Weekly schedule is currently implemented separately via schedules + calendar assignment.

### Decision needed
- Do we want **AAC Board** as its own left-menu tab? (It exists as a document type and there is `documents/AAC_BOARD.md`.)
- Where do **Templates** live in the new IA?
  - option A: templates are inside each document-type tab
  - option B: keep a shared "Templates" tab

---

## Target left menu (parent)

Use the exact labels below as the canonical UI text (backed by `nav.*` keys).

1) Dashboard
  - Must include: child list + basic info (children are managed inside Dashboard)
  - Dashboard must also show: counts of parent-owned items per document category (see below)

---

Document-type tabs (build one by one):

- Daily schedule
- First / Then
- Choice board
- Routine steps
- Weekly schedule (done)
- Emotion cards
- Reward tracker
- AAC board

---

Tools/library pages:

- Pictograms (Pictogram Library)
- Create Activity cards

---

Account/device pages:

- Child devices & QR management
- Settings
- Admin (only visible for admin users; appears below Settings)

---

Temporary during refactor:

- Visual supports (keep while refactoring, remove later)

---

## Target navigation (child)

- Child view remains separate and minimal (QR login only).
- Keep a single child route experience (e.g., "My Calendar"), unless/until we intentionally expand.
- Kids should not see parent login/register flows.

---

## Routes (no backwards compatibility)

Pick one canonical route per menu entry and do not redirect from old paths.

Suggested route scheme:

- `/dashboard`
- `/children` (optional management page; not a main sidebar tab)

Document types:
- `/daily-schedule`
- `/first-then`
- `/choice-board`
- `/routine-steps`
- `/weeklyschedule`
- `/emotion-cards`
- `/reward-tracker`
- `/aac-board`

Tools:
- `/pictograms`
- `/activity-cards`

Devices/settings:
- `/child-devices`
- `/settings`
- `/admin` (admin only)

Temporary:
- `/visual-supports`

Child:
- `/my-calendar`
- `/qr-login` (entry only; not a parent menu item)

---

## Phase 0 — "Placeholder navigation" (first visible milestone)

- [x] Add placeholder pages/routes for each target menu item (parent-only unless stated).
- [x] Update the sidebar to show the new grouped sections and items.
- [x] Ensure Weekly schedule remains functional and reachable at its canonical route.
- [x] Remove legacy redirects (no backwards compatibility).
- [x] Confirm role guards:
  - parent-only pages require parent session
  - admin link shown only for admin
  - child-only pages require child session

Acceptance criteria:
- Sidebar matches the target menu structure.
- Every menu item opens a page (even if it's "Coming soon").

---

## Phase 1 — Child devices & QR management (move out of Children)

Goal: a single place for all child device tokens, QR generation, and device controls.

- [x] Page shows list of all children
- [x] For each child:
  - [x] Show QR code (downloadable)
  - [x] Show active devices
  - [x] Show last-used timestamps and metadata (where available)
  - [x] Provide revoke device + revoke all
  - [x] Provide basic "logs" view (at minimum: last used + created)
- [x] Remove QR + devices UI from Children page (once replacement is complete)

Backend notes:
- Existing endpoints already exist for per-child QR + devices.
- May need a new endpoint for "all devices across all children" if we want one combined log view.

---

## Phase 2 — Create Activity cards (user-owned library)

Goal: parent can manage their own activity cards (not global/system ones).

- [x] List all activity cards belonging to the logged-in parent
- [x] Add new activity card
- [x] Edit an activity card
- [x] Delete an activity card
- [x] Clearly distinguish system/default cards vs user cards if needed

Backend notes:
- There are existing `visual-documents/activity-cards` routes for list/create/delete.
- Update endpoint added: `PUT /visual-documents/activity-cards/{id}`.

---

## Phase 3+ — Document-type tabs (migrate out of Visual supports)

For each document type, repeat:

follow each recomendation from: documents/Visuel_boards.md

Alle document types has to have a Schema in the top and content files below like in: Weekly schedule i dont know if that makes sense for all but lets take one document at the time.

- [ ] Tab page with list of user documents for that type
- [ ] Create new document
- [ ] Edit existing document
- [ ] Delete document
- [ ] Template flow decision (per-type templates or shared templates)
- [ ] "Good enough" print button (to be replaced by new print system)

Recommended order (low coupling → high coupling):

1. First / Then ✅ (started)
2. Choice board
3. Routine steps
4. Emotion cards
5. Reward tracker
6. Daily schedule
7. AAC board

Weekly schedule stays separate (already migrated).

---

## Dashboard: category counts

- [ ] Add counts per document-type category (for the logged-in parent)
- [ ] Include Weekly schedules count
- [ ] Include Activity cards count
- [ ] Include device count (optional)

Acceptance criteria:
- Dashboard shows a quick overview: "you have X weekly schedules, Y first/then boards, ...".

---

## Deleting Visual supports (final milestone)

- [ ] Confirm feature parity for all document types currently supported
- [ ] Remove Visual supports page + routes
- [ ] Remove visual-support specific copy/UI from navigation
- [ ] Clean up dead code paths

Acceptance criteria:
- No remaining parent workflows depend on `/visual-supports`.

---

## i18n / naming checklist

- [ ] Add `nav.*` keys for every new menu item so the sidebar uses i18n consistently:
  - `nav.daily_schedule`
  - `nav.first_then`
  - `nav.choice_board`
  - `nav.routine_steps`
  - `nav.weekly_schedule` (already exists)
  - `nav.emotion_cards`
  - `nav.reward_tracker`
  - `nav.aac_board`
  - `nav.activity_cards`
  - `nav.child_devices`
  - `nav.admin`
- [ ] Ensure page `<h1>` titles match the sidebar label.

---

## Permission model checklist

- Parent session cookie required for all parent tabs.
- Admin link only visible when role is admin.
- Kid QR session required for child view; no normal login for kids.

---

## Risks / gotchas

- Document types already exist in multiple places (frontend editor + backend validation). Keep them aligned.
- Visual supports may have hidden flows (templates, print options, palette management) that need a deliberate home.
- If printing is replaced later, avoid building per-tab print logic too deeply—keep it swappable.
