# Visual Support Document Types — Technical Implementation Specification

Status: Draft v1 (2026-02-22)  
Scope: CarlsCalendar frontend (`frontend/src`), backend (`backend/src`), MariaDB migrations (`database/migrations`)

---

## 1) Product Intent (Non-negotiables)

This feature set prioritizes:

1. Predictability
2. Visual clarity
3. Minimal cognitive load
4. Consistent layout across document types
5. Print-first design (A4 default)

Design principle: **Stability over aesthetics. Clarity over cleverness. Consistency over flexibility.**

---

## 2) Legal & Source Constraints (ARASAAC)

ARASAAC resources are licensed under **CC BY-NC-SA** and ARASAAC terms indicate **non-commercial use only** unless explicit permission is obtained.

### Required implementation safeguards

- Add attribution line in all generated print documents:
  - `Pictograms author: Sergio Palao. Origin: ARASAAC (https://arasaac.org). License: CC BY-NC-SA. Owner: Government of Aragón (Spain).`
- Store attribution metadata with templates/documents so exports are always compliant.
- Add admin-level setting: `ALLOW_ARASAAC_CONTENT` (default true in current private deployment).
- Add explicit disclaimer in UI and export footer for ARASAAC-origin pictograms.

### Integration source

ARASAAC OpenAPI: `https://api.arasaac.org/arasaac_v1.json`  
Current backend already has local-first ARASAAC integration in `backend/src/routes/pictograms.rs` and `backend/src/services/pictograms.rs`.

---

## 3) Fit to Current Stack

Current stack is:

- Frontend: Vite + TypeScript modules (no React/Vue runtime)
- Backend: Rust + Axum + sqlx + MariaDB
- Existing routes: schedules/templates/pictograms already present
- Existing print layer: `frontend/src/styles/print.css` + `frontend/src/components/Print.ts`

### Architectural decision

Implement a **framework-agnostic shared layout engine** in TypeScript, consumed by page modules and print/export renderers. This avoids introducing React/Vue and keeps consistency with current codebase.

---

## 4) Canonical DocumentType Enum

Use this enum in both frontend and backend:

- `DAILY_SCHEDULE`
- `WEEKLY_SCHEDULE`
- `FIRST_THEN`
- `CHOICE_BOARD`
- `ROUTINE_STEPS`
- `EMOTION_CARDS`
- `REWARD_TRACKER`

`AAC_BOARD` is specified in `documents/AAC_BOARD.md`.

Backend representation: SQL `ENUM` or constrained `VARCHAR` + validator.
Frontend representation: TypeScript union + runtime guard.

---

## 5) Shared Layout Engine Specification

Create new frontend module namespace:

- `frontend/src/visual-support/engine/`
  - `types.ts`
  - `tokens.ts`
  - `grid.ts`
  - `render-pictogram.ts`
  - `render-text.ts`
  - `layout-measure.ts`
  - `print-render.ts`
  - `pdf-export.ts`

### 5.1 Engine contracts

#### `LayoutTokens`
- spacing scale (e.g., 4/8/12/16/24)
- margins (print safe default 15mm)
- typography scale
- contrast presets
- optional low-stimulation palette

#### `DocumentLayoutSpec`
- `documentType`
- `page`: `A4 | LETTER`
- `orientation`: `portrait | landscape`
- `grid`: rows/columns/fixed cell dimensions
- `pictogramStyle`: fixed provider + rendering options
- `textPosition`: always `below`
- `movable`: bool (for cut/laminate mode)
- `printOptions`: crop marks, cut lines, attribution footer

#### `LayoutEngine.render(spec, data)`
Returns deterministic render tree (no auto-reflow surprises):
- stable item ordering
- fixed cell coordinates
- overflow policy (`clip | paginate | reject` based on type)

### 5.2 Hard global rules enforced by engine

- One pictogram style per document
- Label always below pictogram
- High contrast by default
- No gradients/shadows/decorative effects
- Consistent spacing/margins
- Pictogram print height minimum: 12-16mm
- Layout stability (same input => same coordinates)
- A4/Letter print compatibility

---

## 6) Document Type Layout Definitions

Define each as `DocumentLayoutPreset` in:

- `frontend/src/visual-support/presets/*.ts`

### DAILY_SCHEDULE
- vertical list
- max 10 rows per page
- optional small time indicator
- optional finished zone (fixed bottom area)

### WEEKLY_SCHEDULE
- fixed 5-day or 7-day grid
- day headers top row
- uniform pictogram sizes
- subtle day color tokens only

### FIRST_THEN
- 2 equal columns (First / Then)
- exactly 2 item slots
- extra-large pictogram area

### CHOICE_BOARD
- 2-4 equal cells
- no hierarchy styling
- optional selection indicator icon/border only

### ROUTINE_STEPS
- vertical numbered rows
- optional checkbox
- strict linear flow

### EMOTION_CARDS
- card-per-item model
- sheet compositor for multi-card A4
- cut lines optional

### REWARD_TRACKER
- linear slots (5-10)
- clearly distinguished empty/filled states
- fixed reward endpoint tile

---

## 7) Data Model & Migrations

Use consolidated migrations:

- `database/migrations/001_initial_schema.sql` (baseline schema)
- `database/migrations/002_seed_retention_rules.sql` (baseline seed data)

### New tables

#### `visual_document_templates`
- `id` (uuid, pk)
- `owner_id` (fk users.id, nullable for global/admin templates)
- `name` (varchar)
- `document_type` (enum/varchar constrained)
- `is_system` (bool)
- `locale` (varchar(8), default `en`)
- `layout_spec_json` (json)
- `created_at`, `updated_at`

#### `visual_documents`
- `id` (uuid, pk)
- `owner_id` (fk users.id)
- `child_id` (fk child_profiles.id, nullable)
- `template_id` (fk visual_document_templates.id, nullable)
- `document_type`
- `title`
- `locale`
- `layout_spec_json` (json)
- `content_json` (json)  // items, labels, order, options
- `version` (int)        // optimistic concurrency
- `created_at`, `updated_at`

#### `visual_document_assets`
- `id` (uuid, pk)
- `document_id` (fk visual_documents.id)
- `asset_type` (`PICTOGRAM` | `IMAGE`)
- `source` (`ARASAAC` | `UPLOAD` | `SYSTEM`)
- `external_id` (e.g. arasaac id)
- `url_or_path`
- `attribution_json`

### Optional table

#### `visual_document_exports`
- `id` (uuid, pk)
- `document_id` (fk)
- `format` (`PDF` | `SVG`)
- `file_path`
- `checksum`
- `created_at`

---

## 8) Backend API Additions (Axum)

Add route module: `backend/src/routes/visual_documents.rs`

### Endpoints

- `GET /visual-documents/templates?type=&locale=`
- `POST /visual-documents/templates`
- `PUT /visual-documents/templates/{id}`
- `POST /visual-documents/templates/{id}/copy`

- `GET /visual-documents?child_id=&type=`
- `POST /visual-documents`
- `GET /visual-documents/{id}`
- `PUT /visual-documents/{id}`
- `DELETE /visual-documents/{id}`

- `POST /visual-documents/{id}/render/svg`
- `POST /visual-documents/{id}/export/pdf`

- (Removed in current implementation) dedicated `/positions` endpoint; placement is persisted in `content_json` slot ordering.

### Validation rules (backend-enforced)

- reject unknown `document_type`
- enforce per-type cardinality:
  - FIRST_THEN: exactly 2 items
  - CHOICE_BOARD: 2-4 items
  - DAILY_SCHEDULE: max 10 per page (or explicit pagination)
  - REWARD_TRACKER: 5-10 slots
- enforce pictogram minimum printed size (derived from layout units and page spec)
- strip unsupported styling options (no gradients/shadows)

---

## 9) Frontend UX & Module Plan

Add pages:

- `frontend/src/pages/Parent/VisualSupports.ts` (library/list)
- `frontend/src/pages/Parent/VisualSupportEditor.ts` (create/edit)
- `frontend/src/pages/Parent/VisualSupportTemplates.ts` (template gallery)

Add router paths:

- `/visual-supports`
- `/visual-supports/new`
- `/visual-supports/:id`
- `/visual-supports/templates`

### Reusable components

- `DocumentTypePicker`
- `TemplatePicker`
- `VisualSupportCanvas` (layout preview with fixed grid)
- `VisualSupportInspector` (text/options)
- `PrintSettingsPanel` (A4/Letter, cut lines, crop marks)
- `AttributionFooterPreview`

### Interaction constraints

- drag-drop allowed only when `movable=true`
- movement snaps to grid
- no auto-compaction or reflow that changes stable positions
- keyboard-accessible movement with deterministic step size

---

## 10) Print & PDF Strategy

## 10.1 Print CSS

Extend `frontend/src/styles/print.css`:

- dedicated classes per document type:
  - `.print-vs-daily`
  - `.print-vs-weekly`
  - `.print-vs-first-then`
  - etc.
- page size defaults:
  - A4 portrait for most
  - weekly supports optional landscape
- safe margin minimum `15mm`
- hide all app chrome (`nav`, dialogs, controls)
- optional crop/cut marks via pseudo-elements

## 10.2 Export strategy

Phase 1 (fast): browser print-to-PDF from deterministic print DOM.  
Phase 2 (server-grade): backend endpoint renders HTML/SVG to PDF with fixed engine (e.g., headless Chromium), ensuring reproducible output.

## 10.3 SVG quality

- render pictograms as high-resolution referenced assets
- preserve vector where available
- include fallback raster at print-safe resolution

---

## 11) Accessibility & Localization

Required:

- high contrast mode token set
- low-stimulation token set (reduced color intensity)
- text scaling without breaking grid guarantees
- no animation in print/export and reduced-motion preference respected
- multilingual labels using existing i18n (`frontend/src/i18n/*.json`)

Add i18n namespaces:

- `visual_support.*`
- `document_type.*`
- `print_options.*`

---

## 12) Template Catalog (Initial Seed)

Seed default templates (admin/system):

- Daily school morning routine
- Daily bedtime routine
- Weekly school overview (5-day)
- First/Then transition board
- Choice board (2 options, 4 options)
- Handwashing routine steps
- Emotion starter cards (happy/sad/angry/scared/calm)
See `documents/AAC_BOARD.md` for AAC template definitions.
- 5-slot and 10-slot reward trackers

Backend seed mechanism can mirror existing template strategy used in schedules.

---

## 13) Rollout Plan

Status snapshot (reviewed against current code on 2026-02-23).

### Phase A (MVP)
- ✅ Document types: `DAILY_SCHEDULE`, `FIRST_THEN`, `CHOICE_BOARD`, `ROUTINE_STEPS`
  - Implemented in parent editor: `frontend/src/pages/Parent/VisualSupports.ts`
  - Backend validation in: `backend/src/routes/visual_documents.rs`
- ✅ Template gallery + copy
  - Parent flow supports list/save/load/copy-from-template in `VisualSupports.ts`
  - Admin template manager exists in `frontend/src/pages/Admin/VisualTemplates.ts`
- ✅ Print CSS
  - Phase A print classes and print mode are implemented (`frontend/src/styles/print.css`, `frontend/src/components/Print.ts`)

### Phase B
- ✅ `WEEKLY_SCHEDULE`, `EMOTION_CARDS`, `REWARD_TRACKER`
  - Added to parent visual editor type tabs + layout presets
  - Persisted through existing document/template APIs and backend validation
- ✅ crop/cut marks
  - Added print options + print classes (`cut lines`, `crop marks`) for visual supports
- ✅ position persistence on save
  - Persisted directly in `content_json` slot ordering (no separate positions table/API)

Remaining Phase B refinement:
- Improve per-type specialized visual treatment (currently uses shared grid/card renderer).

### Phase C
- ❌ server-side PDF export endpoint
  - No backend `/render/svg` or `/export/pdf` endpoint currently implemented
- ❌ audit logs for exports (optional compliance extension)
  - Not implemented (blocked by missing export pipeline)

AAC board rollout/status is tracked in `documents/AAC_BOARD.md`.

### Recommended next steps
1. Extend parent editor with Phase B document renderers/presets.
2. Add cut/crop mark options in print CSS + UI toggles.
3. Introduce document position persistence model + endpoints.
4. Implement server-side export pipeline, then add export audit logging.

---

## 14) Quality Gates / Acceptance Criteria

1. Same document config renders identical layout across sessions.
2. No layout shifts when toggling language/theme (except expected text wrapping fallback rules).
3. Printed A4 output keeps safe margins >= 15mm.
4. Pictogram min printed height requirement always met.
5. FIRST_THEN always contains exactly two visual zones.
6. CHOICE_BOARD never exceeds 4 options.
7. Attribution appears in exported/printed output when ARASAAC assets are used.

---

## 15) Risks & Mitigations

- **Licensing misuse risk** → enforce attribution + add admin warning + non-commercial deployment note.
- **Layout drift risk** → centralized engine with deterministic coordinates and golden snapshot tests.
- **Print inconsistency risk** → strict print classes and per-type print regression tests.
- **Cognitive overload risk** → hard limits on items per type, no decorative UI in printable outputs.

---

## 16) Test Strategy

### Backend
- validator tests per document type
- persistence tests for template copy and position stability
- export endpoint contract tests

### Frontend
- render snapshot tests per `DocumentType`
- print stylesheet visual regression (A4 portrait/landscape)
- keyboard accessibility tests for editor interactions

### End-to-end
- create from template → customize → print preview → export PDF
- reopen document and verify stable placement and layout

---

## 17) Immediate Next Implementation Tasks

1. Implement dedicated per-type renderers for `WEEKLY_SCHEDULE`, `EMOTION_CARDS`, and `REWARD_TRACKER` in `frontend/src/pages/Parent/VisualSupports.ts` (beyond shared grid/card rendering).
2. Implement backend endpoints for deterministic exports:
  - `POST /visual-documents/{id}/render/svg`
  - `POST /visual-documents/{id}/export/pdf`
3. Add export audit logging once server-side export pipeline exists.
4. Add focused regression tests:
  - backend position persistence + type-cardinality tests
  - frontend print-variant visual regression for Phase B modes

AAC board immediate tasks are tracked in `documents/AAC_BOARD.md`.

---

## 18) Notes for This Repository

- This repo already has strong foundations for templates and pictogram retrieval.
- Avoid introducing heavy framework migrations (React/Vue) for this feature.
- Reuse existing i18n + schedule template UX patterns for consistency and faster delivery.
