# AAC Board — Technical Implementation Specification

Status: Draft v1 (2026-02-23)  
Scope: CarlsCalendar frontend (`frontend/src`), backend (`backend/src`), MariaDB migrations (`database/migrations`)

---

## 1) Purpose

This document contains all AAC-specific specification details that were split out from `documents/VISUAL_SUPPORT_TECH_SPEC.md`.

AAC board design goal: **stable, predictable symbol placement** with low cognitive load and clear print/export behavior.

---

## 2) Canonical Type

- Document type: `AAC_BOARD`
- Backend representation: constrained `VARCHAR`/enum validator value
- Frontend representation: TypeScript union value + runtime guard

---

## 3) Layout Definition

### AAC_BOARD
- fixed grid with optional category zones
- no dynamic re-sort
- placement must remain stable unless explicitly edited
- print-safe pictogram sizing and label-below-symbol style

---

## 4) Data Model (AAC-specific)

### Optional table: `visual_document_positions`

Use this only if AAC free-placement persistence is implemented server-side.

- `id` (uuid, pk)
- `document_id` (fk)
- `item_key` (varchar)
- `x`, `y`, `w`, `h` (grid units)
- unique (`document_id`, `item_key`)

Current implementation note:
- dedicated `/positions` API is not active
- placement persistence currently relies on `content_json` slot ordering for supported board types

---

## 5) API & Backend Notes

When AAC_BOARD workspace is implemented, backend should add AAC-specific persistence contracts in `backend/src/routes/visual_documents.rs`:

- either restore dedicated position persistence endpoints, or
- define equivalent AAC-specific payloads inside `content_json` with explicit validation semantics.

Validation expectations:
- reject unsupported `document_type`
- reject unstable auto-reordering behavior
- preserve deterministic ordering across save/load cycles

---

## 6) Template Catalog (AAC)

Planned AAC system seed template(s):
- Basic AAC core board
- (optional) category-based starter boards (home/school/food/emotions)

---

## 7) Rollout Status (AAC)

Status snapshot (2026-02-23):

- ❌ `AAC_BOARD` stable position workspace
	- Type is recognized in overall visual-support document taxonomy
	- Dedicated AAC authoring/editor behavior is not implemented yet
- ❌ AAC-specific persistence model (server-side)
	- No active dedicated positions endpoint/table usage in runtime
- ❌ AAC export-specific QA matrix
	- blocked by missing server-side export pipeline

---

## 8) Acceptance Criteria (AAC)

1. AAC board symbol positions remain stable unless explicitly edited.
2. Same AAC config renders identical layout across sessions.
3. No implicit reflow/re-sort may change symbol placement.
4. Print output preserves symbol-label pairing and visual order.

---

## 9) Immediate AAC Implementation Tasks

1. Implement `AAC_BOARD` authoring workspace/editor with stable placement semantics.
2. Decide persistence contract:
	 - reintroduce dedicated position endpoints/table, or
	 - encode explicit coordinate model in `content_json`.
3. Add backend validation rules for AAC stability invariants.
4. Add AAC-focused regression tests (save/load stability + print regression).
5. Integrate AAC path into server-side export pipeline once PDF/SVG endpoints are in place.

---

## 10) Cross-reference

General non-AAC visual support architecture, print strategy, and shared document types remain in:
- `documents/VISUAL_SUPPORT_TECH_SPEC.md`

