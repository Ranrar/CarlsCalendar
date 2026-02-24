Below is a structured visual and technical specification for each board type.
This focuses on layout behavior, rendering rules, constraints, and functional scope.

---

# Board System Specification

Each board type represents a structured visual communication pattern.
All boards must:

* Be printable (A4 portrait default)
* Support responsive web layout
* Use consistent pictogram sizing rules
* Support language localization
* Be renderable without animation
* Support high-contrast mode

All timestamps must be stored in ISO 8601 (UTC) in backend and localized in frontend.

---

# DAILY_SCHEDULE

## Visual Structure

Layout:

* Single vertical column
* Maximum 10 rows per page
* Equal row height
* Optional time label (small, left-aligned)
* Large pictogram + text block
* Optional fixed “Finished” zone at bottom

Visual hierarchy:

* Pictogram dominant
* Text secondary
* Time tertiary (small, subtle)

Example structure:

```
---------------------------------
| 08:30 | [🧩] School           |
---------------------------------
| 10:00 | [🍎] Break            |
---------------------------------
...
---------------------------------
|          Finished             |
---------------------------------
```

## Layout Rules

* Row height must be uniform
* Max 10 rows (overflow → new page)
* Time indicator optional (toggle)
* Finished zone:

  * Fixed bottom area
  * Visually separated
  * Accepts drag/drop if interactive mode enabled

## Functional Requirements

Parent:

* Create/edit rows
* Reorder via drag-and-drop
* Toggle time visibility
* Enable/disable finished zone

Child:

* View only
* Optional “mark as done” if enabled by parent

---

# WEEKLY_SCHEDULE

## Visual Structure

Layout:

* Fixed grid
* 5-day (Mon–Fri) or 7-day (Mon–Sun)
* Day headers in top row
* Uniform cell sizes
* Subtle day color token (header only)

Example structure:

```
| Mon | Tue | Wed | Thu | Fri |
--------------------------------
| 🏫  | 🏫  | 🏫  | 🏫  | 🏫  |
| ⚽  |     | 🎵  |     | 🎨  |
```

## Layout Rules

* Fixed column count (5 or 7)
* All pictograms same size
* No hierarchy styling inside grid
* No uneven cell growth
* Vertical scroll allowed if many items

## Functional Requirements

Parent:

* Assign daily schedules to each day
* Toggle 5-day / 7-day mode
* Reuse templates
* Print week

Child:

* Navigate week forward/backward
* View day details
* See ISO week number

---

# FIRST_THEN

## Visual Structure

Layout:

* Two equal columns
* Strictly two slots
* Header labels: “First” / “Then”
* Extra-large pictogram area

Example:

```
| First        | Then         |
--------------------------------
|     🪥       |      📱      |
| Brush Teeth  | Tablet Time  |
```

## Layout Rules

* Exactly two items
* No additional rows allowed
* Equal width columns
* No hierarchy
* Large visual emphasis

## Functional Requirements

Parent:

* Define two items only
* Toggle text visibility
* Print single-page

Child:

* View only
* Optional visual transition state (if first marked done → highlight second)

---

# CHOICE_BOARD

## Visual Structure

Layout:

* 2 to 4 equal cells
* Grid-based
* No visual hierarchy
* Equal sizing mandatory

Example (2x2):

```
| 🍎 | 🍌 |
| ⚽ | 🎨 |
```

## Layout Rules

* Parent selects cell count (2, 3, or 4)
* All cells identical size
* No ranking, no emphasis
* Optional selection border/icon

## Functional Requirements

Parent:

* Add/remove choices
* Define max choices (2–4)
* Enable selection tracking (optional)

Child:

* Tap to select
* Selection indicated visually only
* No persistent storage unless enabled

---

# ROUTINE_STEPS

## Visual Structure

Layout:

* Vertical numbered list
* Strict linear order
* Optional checkbox per step

Example:

```
1. 🪥 Brush Teeth   [ ]
2. 👕 Get Dressed   [ ]
3. 🎒 Pack Bag      [ ]
```

## Layout Rules

* Mandatory numbering
* Fixed order (drag reorder in parent mode only)
* No branching
* Clear step separation

## Functional Requirements

Parent:

* Add unlimited steps (print splits pages)
* Enable/disable checkboxes
* Reorder steps

Child:

* Optional check marking (if enabled)
* Cannot reorder

---

# EMOTION_CARDS

## Visual Structure

Layout:

* One card per item
* Large pictogram
* Large emotion label
* Minimal extra text

Multi-card mode:

* A4 sheet compositor
* Even grid distribution
* Optional cut lines

Example card:

```
-------------------
|      😡         |
|      Angry      |
-------------------
```

## Layout Rules

* Each card standalone component
* Uniform dimensions
* High contrast text
* Printable bleed-safe margins

## Functional Requirements

Parent:

* Create/edit emotions
* Choose sheet layout (2x2, 3x3, etc.)
* Toggle cut lines
* Export printable PDF

Child:

* View only
* Optional tap-to-highlight mode

---

# REWARD_TRACKER

## Visual Structure

Layout:

* Horizontal linear slots (5–10)
* Clear empty vs filled state
* Fixed final reward tile

Example:

```
⭐ ⭐ ⭐ ☆ ☆  →  🍦
```

## Layout Rules

* Slot count configurable (5–10)
* Equal spacing
* Filled state visually distinct
* Final reward tile visually separated

## Functional Requirements

Parent:

* Define slot count
* Define reward endpoint
* Reset tracker
* Enable auto-reset (optional)

Child:

* See progress
* Optional manual “add star” (if enabled)

---

# Shared Technical Constraints

## Rendering

* All boards must support:

  * Web view
  * Print view
  * PDF export
* CSS print styles mandatory
* No animation required

## Accessibility

* High contrast mode
* Large font option
* No flashing or motion
* Clear focus states

## Data Model Concept

Each board should contain:

* id
* parent_user_id
* child_id (nullable for templates)
* board_type
* layout_config (JSON)
* content_items (JSON or relational)
* created_at (ISO 8601 UTC)
* updated_at

---

# Architectural Principle

Board type defines:

* Semantic intent
* Layout constraints
* Interaction model
* Rendering rules

Layout is not decoration.
It is behavioral structure.

Each board must enforce its constraints at backend level, not only in frontend UI.

This prevents invalid state creation and guarantees predictable structure for children.
