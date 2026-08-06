# Display designer grid and snapping plan

> **Historical snapshot.** Archived on 2026-08-06 after implementation. This
> plan preserves the product decisions, increment evidence, and unavailable
> live-browser matrix; current behavior belongs in the architecture, workbench
> guide, and testing strategy.

## Status

Implemented on 2026-08-06. Focused model, snapping, rendering, interaction,
complete-suite, coverage, lint, TypeScript, and production-build checks pass.
Live browser acceptance was unavailable because this implementation session
had no attached in-app or Chrome browser backend; the unverified cells are
listed explicitly.

This is a browser-only display-designer follow-up. It does not change the
Disting NT Lua API, the simulation worker protocol, generated draw calls, or
hardware-conformance claims.

## Goal

Add a configurable uniform grid and pointer snapping to the 256x64 display
designer while preserving the interaction model a Figma user already knows:

- the grid definition belongs to the design;
- grid visibility is a view choice and does not change the design;
- snapping is independent of visibility;
- snapping assists direct manipulation without rewriting exact values;
- holding Control temporarily bypasses snapping during a pointer gesture; and
- the canvas shows an explicit guide when a snap is active.

The fixed Disting display and its integer-oriented drawing vocabulary remain
the product constraint. The feature will borrow Figma's interaction semantics,
not reproduce its responsive frame, constraint, or auto-layout systems.

## Current baseline

The designer already has a visual **Grid** toggle, but it is a CSS-only
one-logical-pixel overlay. It has no editable size, is not stored in a design
file, and does not participate in pointer placement.

Pointer creation, movement, and resizing currently pass through
`display-design-geometry.ts`:

- pixel primitives and mixed selections are rounded to whole logical pixels;
- smooth-only geometry is rounded to half pixels;
- pointer creation and resize are clamped to the artboard and, in parameter-
  line mode, below row 10;
- multi-selection movement is one semantic history transaction; and
- exact inspector edits, arrow-key nudges, alignment, and distribution are
  separate paths.

The dialog owns the open design, view toggles, pointer preview, selection, and
history on the main thread. No designer state crosses into either worker. This
ownership remains correct for the feature.

## Figma reference behavior

The behavior target is based on current official Figma documentation, checked
on 2026-08-06:

- Figma renamed “layout grid” to “layout guide” in May 2025. A uniform guide is
  a square grid with editable size, color, and opacity. Figma's default guide
  color is red at 10% opacity. See
  [Create layout guides](https://help.figma.com/hc/en-us/articles/360040450513-Create-layout-guides).
- Snap settings assist moving and resizing, show a guide while active, and can
  align object centers and outermost points. Control temporarily disables
  object/geometry snapping. See
  [Adjust alignment, rotation, position, and dimensions](https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions).
- Figma separates the pixel-grid visibility toggle from **Snap to pixel grid**;
  the pixel grid need not be visible for snapping to work, and the pixel grid
  appears only at 400% or higher. See
  [Adjust your zoom and view options](https://help.figma.com/hc/en-us/articles/360041065034-Adjust-your-zoom-and-view-options).
- Figma treats nudge amounts as a separate preference. Grid-assisted pointer
  placement must therefore not silently change Luading's existing one-pixel
  and five-pixel keyboard nudges. See
  [Create a reusable icon grid](https://help.figma.com/hc/en-us/articles/18770195788951-Create-a-reusable-icon-grid).

Figma does not publish its snap tolerance, hysteresis, or target-priority
algorithm. Luading will use explicit screen-space rules and tune them during a
live comparison rather than claim an undocumented exact match.

## Recommended scope

### Ship one uniform layout grid

Version one of this follow-up will support one uniform square grid on the
fixed display artboard. The grid will start at logical origin `(0, 0)` and
continue across the whole 256x64 frame.

The initial grid will use:

- size `8`, because it divides both Disting display dimensions cleanly;
- color `#ff0000`; and
- opacity `10%`.

Size, color, and opacity will be editable. Size will be a whole logical-pixel
value from 1 through 64. Adding, changing, and removing the grid will be
undoable design edits.

This deliberately excludes multiple stacked guides and Figma's column/row
guide types. Those features serve responsive frames more than a single fixed
hardware display and would make snap priority harder to understand. The model
will name the concept `layoutGrid` so row, column, or multiple-guide support can
be added later through an explicit schema version rather than overloaded now.

### Keep the pixel grid distinct

The existing one-pixel visual overlay will be renamed **Pixel grid**. It is a
view aid, not the configurable layout grid. To match Figma, it will be visible
only when each logical pixel occupies at least four CSS pixels. At lower zoom,
the checked preference remains visible in View options with explanatory text,
but the dense overlay is suppressed.

The configurable **Layout grid** remains visible at every zoom when enabled.
Its definition is part of the design; its current show/hide state is not.

### Separate four kinds of state

| State | Owner | Undoable/dirty | Persistence |
| --- | --- | --- | --- |
| Layout-grid definition: size, color, opacity | Display design document | Yes | Downloaded design file |
| Show layout grid | Dialog view state | No | Mounted workbench session |
| Show pixel grid | Dialog view state | No | Mounted workbench session |
| Snap to layout grid | Dialog preference state | No | Mounted workbench session, including across opened designs |

The initial defaults will be no layout grid, layout-grid visibility on, pixel
grid off, and snap-to-layout-grid on. Adding a grid therefore makes it visible
and immediately useful, while opening an older design does not add authoring
data that was never present.

## User interaction contract

### Artboard properties

When no layer is selected, the Properties panel will show an **Artboard**
section instead of only “Select a layer”. It will contain a Figma-like
**Layout grid** row:

- **Add layout grid** creates the default uniform grid;
- the settings disclosure edits size, color, and opacity;
- the row has a show/hide control for the current view; and
- **Remove layout grid** is an undoable design edit.

Changing grid settings never moves existing artwork. Grid changes create one
history transaction per committed field edit, not one per keystroke.

The same document grid is shown while editing a symbol state because Luading's
symbol editor reuses the one fixed artboard and symbol states do not own nested
frames.

### View options

The crowded top-level **Grid**, **Pixels**, and **Geometry** buttons will become
a keyboard-accessible **View options** menu beside Zoom. It will contain:

- Pixel preview;
- Geometry;
- Pixel grid;
- Layout grid; and
- Snap to layout grid.

Items will use checked menu semantics, retain visible focus, close with Escape,
and return focus to the trigger. Layout-grid visibility and snapping are
disabled with explanatory text when the document has no layout grid.

The menu and tooltips will expose Figma-compatible shortcuts where the browser
can intercept them safely:

- Command/Ctrl+`'`: Pixel grid;
- Command/Ctrl+Shift+`'`: Snap to layout grid;
- Control+G and Control+Shift+4: Layout grid visibility aliases for Figma's
  macOS and Windows shortcuts.

Shortcuts will not fire while an input, textarea, select, or editable region is
being edited. The visible controls remain authoritative for keyboard layouts
where the quote-key shortcut is unavailable.

### Snapping behavior

Snap to layout grid applies only to pointer creation, movement, and resizing.
It does not alter:

- exact inspector commits;
- arrow-key nudges;
- alignment or distribution commands;
- duplication;
- imported values; or
- grid settings changes.

The grid may be hidden while snapping remains enabled. During an active
gesture, holding Control bypasses only layout-grid snapping. It does not bypass
whole/half-pixel primitive quantization, display bounds, or reserved parameter-
line rows. Touch and coarse-pointer users can use the persistent snap toggle.

Snapping does not normalize an existing selection merely because the setting
was enabled. A document changes only through an actual editing command.

### Snap targets by gesture

| Gesture | Candidate geometry |
| --- | --- |
| Create line or box | Start point and live endpoint, independently on x and y |
| Create text | Text anchor on x and baseline on y |
| Create circle | Centre on x/y; east radius handle on x |
| Move one or many layers | Selection left/centre/right and top/middle/bottom bounds |
| Resize line | Dragged endpoint |
| Resize box | Dragged corner |
| Move circle centre | Centre |
| Resize circle radius | East radius handle on x |
| Move text anchor | Anchor and baseline |

Multi-selection will snap as one rigid selection and preserve the relative
offsets between layers. The nearest eligible candidate on each axis wins.
Leading edge, trailing edge, then centre is the deterministic tie order. A
centre target whose correction cannot be represented at the selection's
whole- or half-pixel precision is ineligible rather than silently introducing
invalid geometry.

Dynamic properties retain their current direct-manipulation rules. A snap
indicator will be emitted only when the affected literal geometry can actually
move to the target; the UI must not claim a snap that a binding prevented.

### Magnetic threshold and feedback

Snapping will use screen-space distance so it feels consistent at Fit through
4x zoom and under browser zoom:

1. Compute the ordinary unsnapped gesture at the primitive's required whole-
   or half-pixel precision.
2. Convert each candidate-to-nearest-grid distance through the current measured
   artboard rectangle.
3. Enter a snap within 6 CSS pixels.
4. Retain the active snap until the pointer moves more than 8 CSS pixels away.
5. Apply x and y independently, then re-run display-mode constraints.
6. Suppress a guide if the constraint changed the result away from its target.

The 6/8-pixel values are starting points, not Figma claims. Live comparison at
every designer zoom will decide whether they need tuning.

An active snap will draw a non-rasterized guide line above the grid and below
selection handles, plus a compact coordinate label such as `x 32` or `y 24`.
The guide will use more than color alone: a stronger stroke and label distinguish
it from ordinary grid lines. Pointer-move feedback will not spam an ARIA live
region. The committed result will be available through the existing selection
status and exact inspector fields.

### Cancellation and modifier changes

Gesture state will retain raw logical start/current points separately from the
snapped preview. Every pointer move will rebuild the preview from the base
document, raw pointer data, current Control state, and active snap hysteresis.
This allows Control to turn snapping off and back on during one drag without
accumulating coordinate error.

Pointer up will include the final point and modifier state before committing.
Pointer cancel and Escape will discard the preview, active snap targets, and
guide feedback without adding history. Safari control-click handling will be
checked so a temporary bypass during a left-pointer drag does not open a
context menu and cancel the transaction.

## Document format and migration

The grid definition must round-trip with a downloaded design, so this feature
will introduce display-design schema version 2 rather than adding an unknown
key to the strict version-1 format.

The canonical version-2 addition will be equivalent to:

```ts
interface DisplayDesignLayoutGrid {
  kind: 'uniform'
  size: number
  color: string
  opacity: number
}

interface DisplayDesignDocumentV2 {
  // Existing fields remain unchanged.
  version: 2
  layoutGrid: DisplayDesignLayoutGrid | null
}
```

Validation will require:

- `kind === 'uniform'`;
- integer size from 1 through 64;
- a normalized six-digit hexadecimal RGB color; and
- integer opacity from 1 through 100.

Version-1 files will remain openable. The file boundary will validate the old
shape, migrate it to version 2 with `layoutGrid: null`, and then use only the
canonical version-2 type internally. Downloads will always emit deterministic
version-2 JSON. Unsupported future versions and malformed grid fields will
remain non-destructive open failures.

The current `DisplayDesignDocumentV1` name appears throughout the designer.
The implementation will introduce a canonical `DisplayDesignDocument` alias
for version 2 and keep the version-1 interface only at the migration boundary.
This avoids leaving a misleading V1 name attached to newly serialized data.

A design containing only a layout grid is nonempty and prompts before discard.
Undoing its addition back to the canonical empty document removes that prompt.
Opening a migrated version-1 file will be clean in memory; downloading it is
the explicit way to save the version-2 representation.

The grid is authoring metadata only. Compilation, metrics, findings, preview
commands, and generated Lua will ignore it. Golden tests will prove that adding
or editing a grid does not change the generated callback.

## Implementation structure

### Pure model and file boundary

Extend:

- `display-design-model.ts` with the version-2 canonical type, grid defaults,
  edit helpers, and limits;
- `display-design-validation.ts` with strict grid validation and version-1 to
  version-2 migration;
- `display-design-file.ts` with migration-aware parse/status results and
  deterministic version-2 serialization; and
- `display-design-history.ts` only through its canonical document type.

ID allocation does not change because the first grid is a singleton document
property.

### Pure snapping engine

Add `display-design-snapping.ts` beside the existing geometry module. It will:

- generate logical grid-line coordinates;
- convert logical deltas to screen-space distances using the measured artboard
  rectangle;
- rank axis candidates deterministically;
- filter corrections by whole/half-pixel precision;
- carry active-axis hysteresis between preview samples; and
- return both corrected geometry and render-only snap-guide metadata.

The module must not import React, DOM globals, Canvas, or worker types. Existing
primitive quantization and display-mode constraints remain in
`display-design-geometry.ts`; the snapping module composes them instead of
duplicating them.

Use a target union such as `kind: 'layout-grid'` in the return metadata so a
later snap-to-object feature can add target kinds without changing gesture
ownership.

### Dialog and rendering

Update `DisplayDesignerDialog.tsx` to:

- own view visibility and snap preference separately from document history;
- expose Artboard grid settings when no layer is selected;
- use a checked View-options menu;
- pass raw pointer samples and Control state into gesture preview;
- retain current snap targets in gesture state; and
- render layout lines and active guides in the existing SVG geometry overlay.

Update `display-designer.css` for non-scaling grid/guide strokes, coordinate
labels, menu layout, 4x pixel-grid visibility, responsive Properties content,
coarse-pointer targets, high browser zoom, and reduced motion. Snapping itself
will use no animation.

No changes belong in `disting.worker.ts`, `DistingPlayground.tsx`,
`api-manifest.ts`, the display renderer, or the Lua generator beyond tests that
prove they remain unaffected.

## Delivery increments and required checks

### 1. Schema version 2 and grid model

Implement the canonical type, defaults, validation, migration, deterministic
serialization, history behavior, and generated-Lua invariance.

Focused checks:

```bash
npx vitest run \
  src/disting/workbench/display-designer/display-design-model.test.ts \
  src/disting/workbench/display-designer/display-design-validation.test.ts \
  src/disting/workbench/display-designer/display-design-file.test.ts \
  src/disting/workbench/display-designer/display-design-history.test.ts \
  src/disting/workbench/display-designer/display-design-generator.test.ts
```

### 2. Pure snapping engine

Implement grid-line generation, candidate selection, representable precision,
screen-space thresholds, hysteresis, and post-constraint verification.

Pure tests must cover:

- sizes 1, 8, and 64;
- fractional client bounds at Fit and every explicit zoom;
- negative/off-canvas bounds and artboard edges;
- whole- and half-pixel elements;
- independently snapped x/y axes;
- candidate and tie priority;
- multi-selection rigidity;
- circle centre/radius semantics;
- parameter-line constraints;
- Control bypass and re-entry;
- hidden-grid snapping; and
- dynamic geometry without false guide metadata.

Focused check:

```bash
npx vitest run \
  src/disting/workbench/display-designer/display-design-geometry.test.ts \
  src/disting/workbench/display-designer/display-design-snapping.test.ts
```

### 3. Artboard properties, View options, and grid rendering

Add the no-selection Artboard inspector, checked menu, shortcuts, SVG grid,
snap-guide visuals, responsive behavior, and accessible names/states.

Server-render and jsdom tests will pin:

- no-grid/add/edit/remove states;
- view preferences remaining outside dirty/history state;
- exact grid field validation and one transaction per commit;
- checked/disabled menu semantics, keyboard navigation, Escape, and focus
  return;
- shortcut focus protection;
- pixel-grid suppression below 4x;
- layout-grid rendering at every zoom; and
- grid metadata leaving preview commands, findings, metrics, and Lua unchanged.

Focused check:

```bash
npx vitest run \
  src/disting/workbench/display-designer/display-designer-rendering.test.tsx \
  src/disting/workbench/display-designer/display-designer-dialog.test.tsx \
  src/disting/workbench/display-designer/display-designer-layout.test.ts
```

### 4. Pointer integration

Connect raw pointer samples to snapping for creation, move, and resize. Preserve
one transaction per completed gesture and cancellation without history.

Interaction tests will cover all primitive gesture types, single and multiple
selection, hidden-grid snapping, Control changes mid-drag, final pointer-up
modifier state, cancellation, undo/redo, and no cumulative rounding drift.

Focused check:

```bash
npx vitest run src/disting/workbench/display-designer
```

### 5. Documentation and complete verification

After implementation:

- update `docs/WORKBENCH_GUIDE.md` with the Grid/Pixel grid distinction,
  snapping scope, Control bypass, shortcuts, exact-field/nudge behavior, and
  schema-v2 file compatibility;
- update `docs/ARCHITECTURE.md` so the state-ownership row distinguishes the
  document-owned layout grid from dialog view/snap preferences;
- update `docs/TESTING.md` with the snapping guarantees and live limitations;
  and
- update this plan's status and exact evidence after each increment.

Then run:

```bash
npm test
npm run check
```

`npm run test:conformance` is not required solely for this browser-only
authoring feature because neither public Lua behavior nor support metadata
changes. Any unexpected generator or display-contract change stops this plan
and re-enters the normal conformance workflow.

## Implementation evidence

- Increment 1: schema version 2, strict uniform-grid validation, version-1
  migration, deterministic serialization, history, and generated-Lua
  invariance landed. The five focused files passed with 45 tests.
- Increment 2: the pure snapping engine landed with grid-line generation,
  screen-space thresholding, hysteresis, deterministic candidate priority,
  precision filtering, multi-selection constraints, and guide verification.
  Geometry plus snapping passed with 21 tests.
- Increment 3: Artboard properties, checked View options, shortcuts, SVG grid
  and guides, measured Pixel-grid suppression, and responsive/accessibility CSS
  landed. Rendering, dialog, and layout checks passed.
- Increment 4: creation, movement, resize, hidden-grid snapping, Control
  bypass/re-entry, final pointer-up sampling, and cancellation are integrated.
  The complete display-designer directory passed with 13 files and 111 tests.
- Increment 5: current Workbench, Architecture, and Testing documentation was
  updated. `npm test` passed 131 files and 774 tests. `npm run check` passed
  lint, the same 774-test coverage run, TypeScript, and the production build;
  coverage was 96.82% statements, 91.18% branches, 100% functions, and 98.43%
  lines.

Live acceptance attempt on 2026-08-06: the local Vite application started at
`http://127.0.0.1:5173/`, but browser discovery returned no available in-app or
Chrome session. Consequently every live-browser cell below remains unverified
in this environment; automated DOM/CSS coverage is not substituted for it.

## Live browser acceptance

Automated DOM tests do not prove layout, real pointer capture, Canvas/SVG visual
alignment, context-menu behavior, or perceived snap feel. Record these cells
before completion:

| Environment | Required checks |
| --- | --- |
| Chromium desktop | Add/edit/remove grid; Fit and 1x-4x rendering; every create/move/resize target; multi-selection; hidden-grid snap; Control bypass during a drag; shortcuts; undo/redo and dirty/download behavior. |
| Firefox desktop | Fractional client bounds, zoom/scroll interaction, pointer capture/cancel, guide/handle layering, quote-key shortcuts, and version-1 file migration. |
| Safari desktop | Control-click bypass without an unwanted context menu, pointer cancellation, color/opacity controls, focus return, file migration/download, and pixel-grid threshold. |
| 721-900 px and no more than 720 px | Artboard stays visible; Artboard settings remain reachable through Properties; View options do not overflow; forced Fit still snaps with screen-space tolerance. |
| Coarse pointer/touch | Grid settings meet target sizes; drag and scroll do not conflict; persistent snap toggle replaces the unavailable Control modifier. |
| Keyboard only | Add/edit/remove grid, operate checked menu, use supported shortcuts, inspect exact snapped values, undo/redo, and reach every fallback control. |
| Browser zoom and largest text size | Menu, labels, coordinate badge, settings, and artboard scrolling remain usable without clipped actions. |
| Reduced motion | No motion is required to perceive a snap; guide appearance/disappearance remains immediate. |

Also compare the interaction directly with the current Figma Design canvas for
independent visibility/snapping, Control bypass, pointer target choice, guide
feedback, and exact-field/nudge independence. Record the Figma date and browser
because undocumented tolerance details may change.

Hardware validation is not applicable: the grid never enters generated Lua or
the runtime. A representative generated callback should still pass the existing
real Wasmoon/display-boundary tests to prove that authoring metadata is inert.

## Explicit non-goals

- snap to other objects, centres, equal spacing, or smart-selection gaps;
- free rulers or draggable guides;
- multiple, column, row, stretch, margin, gutter, or offset guides;
- auto layout, constraints, responsive artboards, or reflow;
- changing the one/five-pixel keyboard nudge amounts;
- snapping exact inspector values or automatically repairing existing artwork;
- storing view/snap preferences in the design file;
- changing preview commands, metrics, findings, generated Lua, or firmware
  behavior; and
- claiming an exact Figma snap algorithm where Figma has not documented it.

## Completion criteria

The feature is complete only when:

- version-1 design files migrate non-destructively and version-2 grid metadata
  round-trips deterministically;
- grid definition, visibility, and snap preference have the documented owners;
- every supported pointer gesture snaps with stable screen-space behavior and
  one semantic history transaction;
- Control bypass, cancellation, exact fields, keyboard nudges, reserved rows,
  whole/half-pixel precision, and multi-selection remain correct;
- the visual grid and active guides align with the raster/geometry overlays at
  every supported zoom;
- generated Lua and runtime behavior are unchanged;
- focused tests, the complete suite, and `npm run check` pass;
- current architecture, testing, and workbench documentation are updated; and
- every unavailable live-browser cell is reported precisely rather than
  implied complete.
