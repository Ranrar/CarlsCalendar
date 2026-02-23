# Carls Calendar Frontend UI Manual

This manual defines how UI should look and behave across the frontend.

## 1) Layout foundations

### Shared page width
- Use `--layout-max-width` from `src/styles/variables.css`.
- Standard page wrapper: `<main class="container page-content">...</main>`.
- `container` and `page-content` both use the shared max-width token.

### Spacing
- Top-level page spacing comes from `.page-content`:
  - top: `2rem`
  - bottom: `3rem`
- Do not add custom page-wide `max-width` inline styles unless there is a strict, approved exception.

### Surface and color tokens
- Always use design tokens from `variables.css` (`--bg-surface`, `--bg-raised`, `--border`, `--text`, etc.).
- Avoid undefined tokens like `--surface`.

### Typography (text size)
- Base font size is `16px` (`html { font-size: 16px; }`).
- Use global heading scale:
  - `h1`: `2rem`
  - `h2`: `1.5rem`
  - `h3`: `1.25rem`
- Default body text uses the app font stack and base size (`1rem`) with `line-height: 1.6`.
- Preferred supporting sizes from current UI patterns:
  - Lead text (`.page-lead`): `1.0625rem`
  - Standard labels/help text: `0.875rem`
  - Small meta text: `0.75rem`-`0.8125rem`
- Keep a clear hierarchy: heading > body > metadata. Avoid ad-hoc inline font-size values unless there is a specific UI reason.

### Text color system
- Use semantic text tokens (not hardcoded hex values) for normal UI copy:
  - Primary content: `var(--text)`
  - Secondary copy: `var(--text-muted)`
  - Tertiary/meta copy: `var(--text-dim)`
- Interactive/accent text:
  - Links and highlights: `var(--accent)` (or approved accent variants)
- Status/feedback text:
  - Error text may use the existing error color pattern (`.error-msg`) for consistency.
  - Success and informational text should follow existing component classes/tokens, not one-off colors.
- Ensure contrast in both dark and light themes by relying on shared tokens from `variables.css`.

## 2) Logged-in UI (app shell)

When authenticated, the app runs inside:
- `.app-shell`
- `.app-topbar`
- `.app-body`
- `.sidebar`
- `.app-content` (contains routed `#page`)

### Behavior
- Desktop: sticky topbar + sticky sidebar.
- Tablet: sidebar becomes drawer.
- Mobile: bottom navigation appears (`.bottom-nav`).

### Routed pages (logged in)
All logged-in pages should render content inside:
- `<main class="container page-content">...</main>`

This now includes:
- Dashboard
- Children
- Schedules
- Calendar
- Pictograms
- Settings

## 3) Public pages

Public pages should also prefer:
- `<main class="container page-content">...</main>`

Only landing-style pages may intentionally use a custom full-bleed section layout.

## 4) Modals

### Base modal system
- Use `.modal-backdrop` + `.modal` for standard forms/dialogs.
- Keep button rows in `.modal-actions`.

### Rich modals
- For custom modals (like pictogram detail), match baseline modal principles:
  - backdrop blur
  - visible border and elevation
  - close button style consistent with auth modal
  - responsive width and height constraints

## 5) Cards, lists, and overflow

- Cards must prevent text/image overflow using clipping (`overflow: hidden`) where needed.
- Long text should use truncation or wrap strategy intentionally.
- Empty/loading/error states should remain inside content width and use consistent typography.

## 6) Page implementation checklist

Before merging UI changes:
1. Uses `<main class="container page-content">` unless explicitly exempt.
2. No inline page `max-width` overrides.
3. Uses tokenized colors/backgrounds.
4. Works in dark and light themes.
5. Works at desktop/tablet/mobile breakpoints.
6. Modal interactions close on backdrop and Escape when appropriate.

## 7) Accessibility baseline

- Keep semantic headings (`h1` once per page).
- Buttons/links must have clear labels.
- Dialogs require `aria-modal="true"` and meaningful labels.
- Keyboard navigation must work for tabs, cards, and modal controls.

## 8) Maintenance rule

If adding a new page:
- Start from existing pattern in `Parent/Dashboard.ts` or `Parent/Settings.ts`.
- Do not introduce per-page width systems.
- Reuse global classes first; add new classes only when truly needed.

## 9) Responsive breakpoints

Use existing breakpoints from `global.css` and avoid introducing new ones unless necessary:
- Desktop: `>= 1024px`
- Tablet: `768px - 1023px`
- Mobile: `<= 767px`

Behavior expectations:
- Sidebar is fixed on desktop and becomes a drawer at tablet/mobile sizes.
- Bottom navigation is shown on mobile.
- Page content should remain readable without horizontal scrolling.

## 10) Interactive states and feedback

- Every interactive element should define at least:
  - default
  - hover
  - focus-visible (keyboard)
  - disabled (when applicable)
- Reuse global transition timing via `var(--transition)`.
- Use consistent patterns for feedback:
  - loading text/spinners in-place
  - empty state blocks
  - inline error text (`.error-msg`)
  - success/info via existing toast/status patterns

## 11) Forms and validation rules

- Labels are required for all inputs/selects/textarea.
- Place validation text close to the relevant field or form action area.
- Do not rely on color alone for validation; include clear text messages.
- Keep button labels action-oriented ("Save", "Delete", "Assign", etc.).
- Prefer existing form layout helpers (`.form-stack`, `.modal-actions`, `.form-grid`) before creating new ones.

## 12) Content and localization guidance

- UI must support at least English and Danish without layout breakage.
- Avoid hardcoded strings in components/pages when translations exist.
- Plan for longer translated labels:
  - avoid fixed-width buttons for text-heavy actions
  - allow wrapping where appropriate
- Date/time should follow user preferences from Settings.

## 13) Print and export behavior

- Printable views must use `print.css` conventions.
- Ensure print output respects the selected paper size preference.
- Remove non-essential UI chrome in print mode (navigation, modal controls, etc.).

## 14) UI QA checklist (before merge)

1. Visual check in both dark and light themes.
2. Responsive check at desktop/tablet/mobile widths.
3. Keyboard-only navigation check (including modals and tabs).
4. No text clipping/overflow in cards, chips, table cells, and buttons.
5. Form validation and error/success feedback verified.
6. No hardcoded page-width overrides or undefined design tokens.
