# Display UI designer implementation plan

## Status

Proposed on 2026-08-05. No behavior described by this document is implemented
until the relevant increment and its verification have landed.

Use the progress table below as the cross-session handoff record. An increment
may be marked complete only after its focused tests pass and the evidence is
recorded in this document.

| Increment | Status | Verification/evidence |
| --- | --- | --- |
| 1. Pure document model, validation, and history | Proposed | Not started |
| 2. Command compiler and deterministic Lua generation | Proposed | Not started |
| 3. Dialog shell, entry point, and static-property editing | Proposed | Not started |
| 4. Direct manipulation, layers, and keyboard workflow | Proposed | Not started |
| 5. Dynamic bindings and state preview | Proposed | Not started |
| 6. Design-file portability and source handoff | Proposed | Not started |
| 7. Responsive/accessibility polish and documentation | Proposed | Not started |
| 8. Final regression, browser, and hardware validation | Proposed | Not started |

## Goal

Add a compact, Figma-like display designer to Luading in which every drawable
element corresponds to the limited Disting NT Lua display vocabulary. Users
will work directly on a magnified 256x64 artboard, organize and inspect
elements, preview the firmware-facing raster, optionally mark properties as
dynamic, and generate readable ordinary Lua as a starting point for further
programming.

The designer deliberately does not attempt to import or preserve arbitrary SVG.
It makes valid target primitives easy to author and exposes approximations and
resource cost instead of hiding unsupported vector features behind lossy
conversion.

The feature is a browser authoring convenience. Disting NT firmware will not
receive a new global, callback, metadata field, scene format, or retained-mode
graphics system. Only the generated calls to existing drawing functions have
meaning on hardware.

## User promise

After version one lands:

- **Display designer** in the workbench opens a focused, full-size authoring
  dialog without pausing, replacing, or mutating the running Lua script;
- the central artboard always represents the hardware-defined 256x64 display,
  with the origin and coordinates visible at high zoom;
- the palette contains only targetable Disting primitives: integer and smooth
  lines, outlined and filled boxes, integer and smooth outline circles,
  standard text, and tiny text;
- geometry, text alignment, baselines, shade values, clipping, draw order, and
  the standard parameter-line option are previewed through the same reusable
  display behavior as the simulator wherever the current conformance model is
  authoritative;
- unsupported concepts such as Bézier paths, arbitrary rotation, gradients,
  images, masks, custom fonts, thick strokes, and filled circles cannot appear
  accidentally in a design;
- every element remains editable through exact properties even when pointer
  manipulation is inconvenient or unavailable;
- generated Lua is deterministic, readable, uses only existing
  firmware-facing draw calls, and can be copied as a self-contained `draw`
  callback;
- dynamic properties generate explicit local placeholder values and TODOs for
  connecting them to `self`, inputs, parameters, or other script state; the
  designer does not invent a runtime binding API;
- opening or saving a versioned `.luading-display.json` design is explicit and
  never changes the current script, local project, simulation, or diagnostics;
- closing or replacing a changed design requires an explicit discard decision
  unless the scene is still empty or its latest revision has been downloaded;
- command counts, smooth-command counts, element counts, and generated UTF-8
  size remain visible as descriptive metrics, never as fabricated Disting CPU
  percentages or undocumented hardware limits; and
- simulator smooth-rasterization uncertainty and any unavailable browser or
  hardware checks remain visible rather than being presented as exact device
  proof.

## Evidence and target vocabulary

The official Disting NT Lua Scripting 1.12 PDF remains the contract authority.
The initial designer palette maps as follows:

| Designer element | Generated call | Coordinate behavior | Notes |
| --- | --- | --- | --- |
| Pixel line | `drawLine(x1, y1, x2, y2, shade)` | Integer endpoints | Hardware-safe default for straight edges. |
| Smooth line | `drawSmoothLine(x1, y1, x2, y2, shade)` | Finite floating-point endpoints | Browser preview is an approximation of firmware antialiasing. |
| Outline box | `drawBox(x1, y1, x2, y2, shade)` | Integer inclusive corners | Width and height shown as `abs(end-start) + 1`. |
| Filled box | `drawRectangle(x1, y1, x2, y2, shade)` | Integer inclusive corners | The only initial filled-area primitive. |
| Pixel circle | `drawCircle(x, y, radius, shade)` | Integer centre/radius | Outline only. |
| Smooth circle | `drawSmoothCircle(x, y, radius, shade)` | Finite floating-point centre/radius | Outline only; preview fidelity is approximate. |
| Standard text | `drawText(x, y, text, shade, alignment)` | Integer anchor/baseline | Uses the firmware-derived standard font. |
| Tiny text | `drawTinyText(x, y, text, shade, alignment)` | Integer anchor/baseline | Uses the firmware-derived tiny 3x5 font. |

Shade is always an integer from 0 through 15 in the authoring model even
though the runtime adapter currently clamps broader numeric inputs. This keeps
generated source inside the documented 16-shade contract.

`drawSmoothBox` will not appear in the initial palette. The current repository
has official-corpus/console evidence for it, but Manual 1.12 does not list it
consistently with the documented drawing surface. Adding it later requires a
deliberate provenance decision rather than silently treating it as equivalent
to the manual-backed primitives.

`drawParameterLine`, `drawStandardParameterLine`, and `drawAlgorithmUI` are not
freeform canvas elements. The standard line is represented as an artboard mode;
the other delegation functions remain ordinary APIs authored in Lua.

This work does not change `api-manifest.ts`, `DistingDisplayApi`, or conformance
support levels merely to make the designer more capable. If implementation
discovers a target mismatch, resolve it through the normal evidence and
conformance workflow before changing the generated vocabulary.

## Product decisions

### The product name is Display designer

“Micro Figma” describes the interaction ambition, not the user-facing name or
scope. The feature should be labelled **Display designer** so it does not imply
Figma file compatibility, collaboration, arbitrary vector editing, or a
relationship with Figma.

### Correct by construction beats SVG compatibility

The designer starts from the Disting primitive vocabulary. It does not contain
an SVG DOM, path parser, vector boolean operations, raster fallback, or a hidden
conversion layer. This has three intended consequences:

1. every visible layer can be expressed as generated Lua;
2. editing concepts stay close to the code a script author will maintain; and
3. limitations are encountered while designing rather than after export.

SVG import can be investigated later as a lossy trace/reference feature. It is
not a dependency for version one and must not distort the core scene model.

### The design document is not the Lua source

The designer owns a separate, versioned, browser-only document. It does not
parse the active editor source, attempt to recover a scene from arbitrary Lua,
or remain synchronized after code is copied.

Version one uses a deliberate one-way handoff:

```text
Display design -> preview commands -> generated draw callback -> user code
```

Edits in Monaco after that handoff belong to the user. Reopening a design uses
its `.luading-display.json` file, not the generated Lua. The JSON file is an
authoring artifact and must never be described as something Disting hardware
can load.

### No implicit editor mutation

The primary handoff action is **Copy draw callback**. It copies exactly the
source shown in the preview. Version one does not search for an existing
`draw` member, replace a source range, add a managed generated block, or make a
Monaco workspace edit.

Direct source insertion is deferred until Luading can prove the current source
version, the intended returned table, the absence or deliberate replacement of
an existing callback, and a safe edit range. Clipboard handoff keeps the first
release useful without making a brittle source transformation look safe.

### Two explicit display modes

Every design chooses one mode:

- **Keep standard parameter line** reserves rows 0-9 and previews the standard
  line above the custom design area. Generated `draw` returns no value, so the
  normal line remains enabled.
- **Use full display** exposes rows 0-63 and generates `return true` to suppress
  the standard parameter line.

In parameter-line mode, new elements and pointer drags are constrained to rows
10-63. Exact property entry or an imported document may retain off-canvas or
reserved-area geometry for deliberate clipping, but the designer reports it as
a local warning. Switching from full display to parameter-line mode never
silently shifts or deletes elements; it shows affected-element warnings and
offers a separate, undoable **Move design below parameter line** action.

The preview of the standard parameter line should reuse an extracted pure
parameter-line command builder from `display-api.ts` so the designer and
simulator do not maintain two pixel layouts. That extraction must be
behavior-neutral and retain focused display-adapter tests.

### Preview fidelity is explicit

The artboard has two overlays over the same rendered display:

- **Pixels** shows the command raster enlarged with `image-rendering: pixelated`.
- **Geometry** shows selection bounds, endpoints, centres, baselines, anchors,
  reserved rows, and the logical pixel grid.

Integer primitive preview is simulator regression evidence. Smooth line and
circle pixels use the existing Canvas 2D approximation and carry a persistent
**Approximate smoothing** note whenever a design contains them. The designer
must not introduce a second smoother that looks better but disagrees with the
normal simulated display.

### Portability is explicit, not automatic persistence

Version one adds **Open design** and **Download design** for a strict,
versioned `.luading-display.json` document. It does not change the IndexedDB
project schema, recovery journal, local-project backups, or `.lua` import/export
format.

The open designer keeps its draft in React state. Closing and reopening the
dialog during the same mount may retain that draft for convenience, but page
reload is not labelled as durable storage. A dirty design cannot be discarded,
replaced, or reset without confirmation.

Project-attached designs, autosave, backup inclusion, and recovery can be
planned later if explicit design files prove too cumbersome. That later work
must define source/design divergence and project conflict behavior before
adding storage fields.

### Start with primitives; add components only after bindings are stable

Reusable meters, gates, dials, step rows, and waveform frames are attractive,
but they are generated compositions rather than firmware primitives. Version
one first establishes primitive editing and bindings. A later increment may
add a small component gallery that expands into ordinary editable elements;
components must not become opaque runtime widgets or simulator globals.

## Version-one document model

Add a pure authoring domain under
`src/disting/workbench/display-designer/`. The model stays independent of
React, DOM APIs, canvas, workers, project storage, and the Lua VM.

The serialized shape should make its browser-only nature and version explicit:

```ts
interface DisplayDesignDocumentV1 {
  kind: 'luading-display-design'
  version: 1
  name: string
  displayMode: 'parameter-line' | 'full-screen'
  elements: DisplayDesignElement[]
  groups: DisplayDesignGroup[]
  bindings: DisplayDesignBinding[]
}

interface DisplayDesignGroup {
  id: string
  name: string
}

interface DisplayDesignElementBase {
  id: string
  name: string
  groupId?: string
  shade: DisplayScalar
  visible: DisplayVisibility
}
```

`elements` is the canonical back-to-front draw order. Groups are one-level
authoring labels; an element belongs to at most one group, groups cannot nest,
and group membership does not change draw order. This keeps reordering,
generation, and selection predictable while still allowing a layers panel to
collapse or select related elements.

Element variants hold only properties accepted by their target call:

```ts
type DisplayDesignElement =
  | { kind: 'line'; smooth: boolean; x1: DisplayScalar; y1: DisplayScalar;
      x2: DisplayScalar; y2: DisplayScalar } & DisplayDesignElementBase
  | { kind: 'box'; fill: boolean; x1: DisplayScalar; y1: DisplayScalar;
      x2: DisplayScalar; y2: DisplayScalar } & DisplayDesignElementBase
  | { kind: 'circle'; smooth: boolean; x: DisplayScalar; y: DisplayScalar;
      radius: DisplayScalar } & DisplayDesignElementBase
  | { kind: 'text'; tiny: boolean; x: DisplayScalar; y: DisplayScalar;
      text: DisplayText; align: 'left' | 'centre' | 'right' }
      & DisplayDesignElementBase
```

The actual implementation may refine property names, but it must retain the
discriminated model and avoid optional fields that allow impossible
combinations such as a filled smooth box or filled circle.

### Identity and ordering

- IDs are stable, unique opaque strings generated by an injected ID factory.
- User-visible names are independent of IDs and need not be unique.
- Duplicate creates a new ID and a human-readable copy name.
- Reordering changes only the `elements` sequence; drawing follows that order
  exactly.
- Group rename/collapse is authoring state. Collapse need not be serialized;
  membership and group name are.
- All model operations return new defensive values and never mutate caller
  arrays or imported JSON objects.

### Static values and dynamic values

Static geometry is the default. A scalar becomes dynamic only through an
explicit property action:

```ts
type DisplayScalar =
  | { kind: 'literal'; value: number }
  | {
      kind: 'number-binding'
      bindingId: string
      from: number
      to: number
      quantize: 'none' | 'integer'
    }

type DisplayVisibility =
  | { kind: 'visible' }
  | { kind: 'boolean-binding'; bindingId: string; invert: boolean }

type DisplayText =
  | { kind: 'literal'; value: string }
  | { kind: 'text-binding'; bindingId: string }
```

A number binding supplies a normalized 0-1 preview value. Each property maps
that value between its own `from` and `to`, allowing one binding to move several
elements differently. Integer-only properties force integer quantization;
smooth coordinates may remain fractional. Shade mappings are clamped and
rounded to 0-15.

There is no arbitrary expression language. Binding names become local Lua
placeholder identifiers, and generation rejects names that cannot be mapped
uniquely and deterministically to safe identifiers.

### Binding definitions

```ts
type DisplayDesignBinding =
  | {
      kind: 'number'
      id: string
      name: string
      luaName: string
      previewValue: number
    }
  | {
      kind: 'boolean'
      id: string
      name: string
      luaName: string
      previewValue: boolean
    }
  | {
      kind: 'text'
      id: string
      name: string
      luaName: string
      previewValue: string
    }
```

The designer exposes preview values as test controls only. Generated code starts
each binding with its current preview value and a TODO comment, for example:

```lua
local level = 0.65 -- TODO: connect this placeholder to self or a parameter.
level = math.max(0.0, math.min(1.0, level))
```

This is intentionally ordinary user-owned Lua. No `luading` table, hidden
adapter, global binding lookup, or worker message is generated.

### Validation and resource bounds

Add a pure `validateDisplayDesign()` boundary that accepts `unknown`, returns a
normalized defensive document plus findings when possible, and never throws on
malformed imported data.

Version-one workbench resource bounds are:

- at most 512 elements;
- at most 64 groups;
- at most 64 bindings;
- at most 512 Unicode code points in one text element or text preview value;
- names from 1 through 80 Unicode code points after trimming;
- finite coordinates and mapping endpoints between -4096 and 4096;
- a non-negative finite circle radius no greater than 4096;
- a maximum decoded JSON file size of 1 MiB; and
- at most 100 retained undo transactions.

These are browser/editor safety bounds, not Disting hardware capacity claims.
Files above the bounds are rejected rather than truncated. Unknown keys,
unknown versions, duplicate IDs, dangling group/binding references, impossible
element variants, non-finite values, unsafe Lua identifiers, and invalid enum
values receive deterministic findings.

Findings are local designer findings, not `ScriptDiagnostic` values. They do not
enter Problems, quality scoring, validation-worker state, or source-version
navigation. Each finding includes a stable rule ID, severity, optional element
or binding ID, and optional property so the designer can focus the relevant
control.

Blocking errors prevent command/Lua generation but do not prevent the user from
repairing the in-memory draft. Warnings cover deliberate clipping, reserved-row
overlap, empty text, shade-zero overdraw, smooth preview approximation, and
elements that are completely outside the artboard.

## Compilation and Lua generation

### One pure compiler for preview and source

Add a pure compiler that resolves the selected binding preview values and
produces:

```ts
interface CompiledDisplayDesign {
  commands: DrawCommand[]
  commandSources: Array<{
    elementId: string
    firstCommand: number
    commandCount: number
  }>
  findings: DisplayDesignerFinding[]
  metrics: {
    elementCount: number
    drawCallCount: number
    smoothCallCount: number
    generatedUtf8Bytes: number
  }
}
```

Hidden elements emit no command at their current preview state. Every primitive
otherwise emits exactly one command in version one. Parameter-line preview
commands are UI context and are excluded from the design's draw-call metric.

The preview passes `commands` to the existing `renderDistingDisplay()` path.
The designer must not rasterize fonts or target primitives independently.
Geometry overlays use the scene model and `commandSources`; they are editor
chrome and never enter generated output.

### Deterministic source format

Generation returns one callback-table member suitable for pasting into a
returned algorithm table:

```lua
draw = function(self)
  -- Generated by Luading Display designer; edit freely after copying.
  local level = 0.65 -- TODO: connect this placeholder to self or a parameter.
  level = math.max(0.0, math.min(1.0, level))

  -- Meter frame
  drawBox(18, 24, 90, 31, 5)
  drawRectangle(19, 25, math.floor(19 + 70 * level), 30, 15)

  return true
end,
```

Rules:

- element order is source call order;
- groups and element names become short comments only when that improves
  orientation; comments never affect identifiers;
- numeric formatting is stable, locale-independent, finite, and removes
  negative zero;
- integer calls contain integer expressions at their final boundary;
- smooth calls retain useful fractional precision without noisy binary tails;
- shade expressions are clamped and integer-quantized;
- literal and preview text uses a reusable, tested Lua-string serializer;
- binding locals appear once, in binding order, before draw calls;
- unused bindings are omitted with a warning rather than emitted as dead code;
- parameter-line mode omits a return value; full-screen mode emits exactly
  `return true`;
- no simulator-only source marker or metadata is added; and
- identical normalized documents always produce byte-identical source.

The current `luaQuotedString()` helper in `script-scaffold.ts` should be moved
to a small reusable workbench source-generation module rather than copied.
This extraction must keep scaffold golden output unchanged. Do not make this
plan depend on the separate export-customizer plan landing first; coordinate
the shared serializer if both increments touch the same seam.

### Real Lua-boundary verification

Generator tests alone are insufficient. Representative generated callbacks
must be embedded in minimal valid algorithm scripts, loaded through the
production Wasmoon bridge, invoked through `draw()`, and observed through
`DistingDisplayApi`.

Boundary fixtures must cover:

- every static primitive and both text fonts;
- escaped quotes, backslashes, newlines, non-ASCII text, and fallback glyphs;
- both display modes and exact boolean suppression behavior;
- numeric, boolean, and text binding placeholders;
- reversed box endpoints and clipped geometry;
- shade-zero overdraw and layer order; and
- generated output after duplicate/reorder/delete operations.

The resulting command sequence should match the pure compiler for the same
preview state. This proves JavaScript-to-Lua-to-display-call compatibility; it
does not prove physical rasterization or device performance.

## Workbench experience

### Entry point and dialog lifetime

Add a labelled **Display designer** command to the workbench utilities section.
It opens a portal-based modal over the workbench and returns focus to its
trigger on close. Opening it does not change running/paused state, source
version, selected project, worker lifetime, display mode, current parameters,
or the normal simulated display dock.

The dialog owns its authoring state below `DistingPlayground`; the coordinator
should receive only the minimum callbacks needed for entry and clipboard/file
handoff. It must not accumulate scene reducer and pointer-gesture details.

The dialog follows the established modal guarantees:

- `role="dialog"`, `aria-modal="true"`, labelled title and description;
- initial focus on the first useful authoring control;
- trapped Tab/Shift+Tab focus;
- Escape requests close and opens an in-dialog discard confirmation when
  needed;
- backdrop close follows the same discard rule;
- body scroll is restored exactly; and
- focus returns to the command that opened it.

### Desktop layout

At wide viewports the dialog uses four stable regions:

```text
+-----------------------------------------------------------------------+
| Display designer | mode | zoom | grid | undo/redo | open/download    |
+------------+----------------------------------------+-----------------+
| Tools and  |                                        | Inspector       |
| layers     |          256 x 64 artboard             | exact values    |
|            |          pixels + geometry             | bindings        |
+------------+----------------------------------------+-----------------+
| Preview values | Findings | Metrics | Generated Lua / Copy callback   |
+-----------------------------------------------------------------------+
```

The canvas remains the primary region, not a miniature between oversized
property panels. Layers and inspector columns may collapse independently. The
bottom source/finding area uses tabs or a bounded resizable panel so generated
code never forces the artboard out of view.

### Responsive layout

- Above 900 CSS pixels: layers, artboard, and inspector use the desktop grid.
- From 721-900 pixels: the artboard stays visible while Layers, Properties,
  State, Findings, and Lua become a tabbed lower panel.
- At 720 pixels and below: the dialog fills the viewport, tools wrap or
  horizontally scroll as one labelled toolbar, the artboard uses **Fit** zoom,
  and the lower panels remain keyboard-operable tabs.
- Coarse pointers receive at least the existing touch-density hit target.
- The logical display never changes aspect ratio or resolution to fit a
  viewport; only its CSS zoom changes.

Responsive behavior is derived through pure viewport/layout helpers where
possible and receives the same server-render/pure-model coverage as the rest of
the workbench. Live browser testing remains required for real CSS dimensions,
scrolling, pointer capture, and virtual keyboards.

### Toolbar and creation behavior

The toolbar contains:

- Select;
- Pixel line;
- Smooth line;
- Outline box;
- Filled box;
- Pixel circle;
- Smooth circle;
- Standard text; and
- Tiny text.

The active tool has visible text or an accessible tooltip, `aria-pressed`, and
a non-colour indicator. Tools remain selected for repeated creation until
Select is chosen or Escape cancels the current gesture.

Pointer creation rules:

- line/box tools drag between logical endpoints;
- circle tools drag from centre to radius;
- text tools click an anchor, create a valid default label, select it, and
  focus the text property;
- non-smooth tools snap to integer pixels before committing;
- smooth tools default to half-pixel snapping, with exact finite values
  available in the inspector;
- a click without meaningful drag still creates a one-pixel line/box or a
  zero-radius circle only if the target function can represent it predictably;
  otherwise it cancels without adding history; and
- a creation drag produces one undo transaction at pointer release, not one per
  pointer move.

### Selection and direct manipulation

Version one supports single selection first, then Shift multi-selection in the
same increment as alignment controls. Selection may occur from the artboard or
layers panel. The status line announces the selected element name and logical
geometry without relying on a glowing outline alone.

Operations include:

- drag to move;
- endpoint handles for lines;
- corner handles for boxes;
- centre and radius handles for circles;
- anchor and baseline guides for text;
- arrow-key nudge by one logical pixel;
- Shift+arrow nudge by five logical pixels;
- Delete/Backspace with focus protection for text and numeric fields;
- duplicate;
- bring forward/send backward and move to front/back;
- multi-selection align left/centre/right/top/middle/bottom; and
- multi-selection horizontal/vertical distribution when at least three
  compatible bounds exist.

The inspector is always the authoritative exact-edit path. Pointer handles are
not the only way to repair, place, resize, or select an element. Moving a
multi-selection clamps nothing silently: artboard overflow is allowed and
reported.

### Layers and groups

The layers panel shows back-to-front order with the visually frontmost element
at the top, while preserving canonical draw order in the model. Reorder actions
must translate between those orientations in one tested helper.

Each row provides type, name, current visibility state, selection state, and a
context or disclosed action menu. Users can rename, duplicate, delete, reorder,
and assign elements to a one-level group. Group hide/show in the editor is an
authoring convenience; generated visibility comes only from each element's
explicit static or dynamic visibility model.

Group selection, movement, duplication, and deletion are atomic undo
transactions. Deleting a group asks whether to ungroup or delete its elements;
it never silently removes artwork.

### Inspector

The inspector is discriminated by element kind and exposes only meaningful
properties. It includes:

- stable element name and optional group;
- endpoints or centre/radius;
- computed inclusive box width/height;
- shade with a 0-15 swatch grid and numeric value;
- smooth/integer status as part of the element type, not an unsafe checkbox
  that could produce an unsupported variant;
- text, font, anchor, baseline, and left/centre/right alignment; and
- per-property **Make dynamic**, **Edit mapping**, or **Make static** actions.

Invalid intermediate text input stays local to the field until commit. It does
not poison the normalized document, command preview, or undo history. Blur or
Enter commits a valid value; Escape restores the last committed value.

### Undo and redo

Use a pure transaction reducer around the normalized document. It records the
document before and after a semantic operation, selection before and after, and
a short action label. Pointer move previews and individual keystrokes within an
uncommitted form field do not each create entries.

Required transactions include create, delete, duplicate, move, resize,
property commit, reorder, group/ungroup, alignment/distribution, binding
creation/update/removal, mode migration action, reset, and successful design
file open.

Command/Ctrl+Z performs undo; Command/Ctrl+Shift+Z and Ctrl+Y perform redo when
focus is not inside a native text undo context. New edits after undo discard
the redo branch. History is capped at 100 transactions without altering the
current document.

### Dynamic state preview

The State panel lists bindings in stable order. Numeric bindings use a 0-1
slider plus exact input, booleans use an accessible switch, and text bindings
use a bounded field. Changing a preview value updates commands immediately but
does not create a document history entry unless the binding definition itself
changes.

The inspector can create a binding or attach a compatible existing one. It must
show which other properties already use that binding before rename or delete.
Deleting a used binding requires choosing either:

- convert every use to its current preview value; or
- cancel.

There is no dangling-binding state created through the UI.

### Findings and metrics

Findings are grouped into errors and warnings with actions that select the
affected layer/property. The artboard also marks affected geometry where
useful, but no finding relies only on colour.

Metrics show:

- primitive elements;
- currently visible draw calls;
- maximum draw calls across boolean preview states when cheaply knowable;
- smooth calls;
- binding count; and
- generated source bytes.

No metric is labelled CPU, frame budget, safe, unsafe, or hardware-approved.
The explanatory text points users to physical-device measurement for actual
performance conclusions.

## State ownership and architecture

The feature does not change the simulation-worker contract.

```text
React/main thread
  DisplayDesignerDialog
    -> pure document reducer/history
    -> pure document validator
    -> pure command compiler
    -> existing display renderer
    -> pure Lua generator
    -> clipboard / explicit JSON file open/download

Simulation worker
  unchanged; receives generated code only after the user pastes and runs it
```

Ownership rules:

- the open design, selection, active tool, zoom, panel layout, preview binding
  values, dirty state, and undo history belong to the main-thread dialog;
- DOM pointer capture, clipboard, Blob downloads, and file selection stay on
  the main thread;
- normalization, geometry transforms, hit-test math, history transitions,
  compilation, metrics, and Lua generation are pure modules;
- `DistingPlayground` owns only whether the dialog is available/open if that is
  required to place the command; it does not own element edits;
- no design IDs, file names, groups, bindings, selection, or preview values
  enter `WorkerRequest`, `WorkerResponse`, Lua globals, `self`, or runtime
  diagnostics;
- the normal worker-owned display remains independent from the designer
  preview; and
- generated Lua crosses the existing worker boundary only after it becomes
  ordinary editor source and the user explicitly runs it.

Suggested files:

```text
src/disting/workbench/display-designer/
  display-design-model.ts
  display-design-validation.ts
  display-design-history.ts
  display-design-geometry.ts
  display-design-compiler.ts
  display-design-generator.ts
  display-design-file.ts
  DisplayDesignerDialog.tsx
  DisplayDesignerToolbar.tsx
  DisplayDesignerArtboard.tsx
  DisplayDesignerLayers.tsx
  DisplayDesignerInspector.tsx
  DisplayDesignerState.tsx
  DisplayDesignerReview.tsx
  display-designer.css
```

Files may be combined while small, but pure model/compiler/generator code must
not be buried inside the React dialog. Tests should stay beside their focused
module or existing workbench rendering suite.

## Design-file contract

**Download design** serializes the normalized document as UTF-8 JSON with two-
space indentation and a trailing newline. It downloads a sanitized name such as
`Envelope UI.luading-display.json`. Key and array order are deterministic so
files produce useful diffs.

**Open design** accepts only `.luading-display.json` or JSON MIME types, reads at
most 1 MiB, parses into `unknown`, and passes the result through the pure
validator. It never partially installs a malformed document. Findings appear
inside the designer, and the previous design remains intact on failure.

Opening a valid older version will eventually require an explicit pure
migration. Version one knows only version 1; unknown versions are rejected with
the exact supported version rather than guessed. Downloaded files contain no
source code, project IDs, editor cursor state, runtime values, hardware routes,
or browser device identity.

Download success updates the design's saved revision only after Blob creation
and download dispatch succeed. Browser download completion cannot be proven;
the UI should say **Download started**, not **Saved to disk**.

## Implementation increments and required tests

Each increment is intended to fit one focused implementation session. If a
session must split an increment, record the last passing test and the remaining
substep in the status table before handoff.

### 1. Pure document model, validation, and history

Implement:

- discriminated version-one document, element, group, and binding types;
- default empty document and injected stable-ID creation helpers;
- normalization and strict `unknown` validation;
- immutable CRUD, reorder, group, duplicate, mode, and selection operations;
- semantic transaction history with capped undo/redo; and
- local finding types and focus metadata.

Focused tests must cover:

- every valid element/binding variant;
- invalid/unknown versions, keys, enums, IDs, references, numbers, text, and
  resource limits;
- defensive copies and frozen-input safety;
- draw-order changes and layer-orientation translation;
- group delete choices;
- one history entry per semantic operation, redo invalidation, and history cap;
- stable default repair behavior; and
- mode switches preserving geometry.

Run the co-located model/validation/history tests immediately after this
increment.

### 2. Command compiler and deterministic Lua generation

Implement:

- binding resolution and property mapping;
- element-to-`DrawCommand` compilation;
- bounds/reserved-area findings and descriptive metrics;
- behavior-neutral extraction of standard parameter-line commands;
- reusable Lua quoted-string serialization;
- deterministic callback generation; and
- compiler-to-Wasmoon boundary fixtures.

Focused tests must cover the complete compilation and generation matrix defined
above. Existing scaffold source golden tests and display API/renderer/font/bounds
tests must remain unchanged and pass after shared-helper extraction.

Run:

```bash
npx vitest run \
  src/disting/workbench/display-designer/display-design-compiler.test.ts \
  src/disting/workbench/display-designer/display-design-generator.test.ts \
  src/disting/emulation/display-api.test.ts \
  src/disting/workbench/script-scaffold.test.ts
```

Use actual filenames if implementation consolidates modules, and record the
exact command in the status table.

### 3. Dialog shell, entry point, and static-property editing

Implement:

- workbench utility command and focus-return behavior;
- full-size portal dialog and discard confirmation;
- desktop layout and collapsible panels;
- primitive toolbar;
- static artboard preview through `renderDistingDisplay()`;
- layers list with single selection;
- discriminated exact inspector;
- shade palette, display mode, grid, zoom, and pixel/geometry overlays;
- findings/metrics panel; and
- generated-source preview using `LuaSourcePreview`.

Creation may initially use property defaults and layer actions before pointer
dragging lands in increment 4. That keeps this increment vertically complete:
a keyboard user can add, inspect, edit, reorder, delete, preview, and generate
every static primitive.

Add server-rendering and interactive DOM tests for command availability,
dialog semantics, focus return, close/discard behavior, tool state, property
editing, source updates, and source-preview accessibility. Run the focused
workbench tests after the increment.

### 4. Direct manipulation, layers, and keyboard workflow

Implement:

- pure logical/CSS coordinate transforms;
- creation gestures with pointer capture;
- geometry hit testing and enlarged screen-space targets;
- selection geometry and element-specific handles;
- move/resize gestures;
- multi-selection;
- align/distribute operations;
- reorder/group/duplicate/delete commands;
- undo/redo keyboard integration; and
- mouse, touch, and keyboard affordances.

Pure geometry tests must cover every zoom, fractional CSS bounds, reversed box
endpoints, circle radius calculation, pixel/half-pixel snapping, reserved rows,
multi-selection bounds, alignment, distribution, and off-canvas movement.
Interactive DOM tests should dispatch pointer/keyboard events but must not
pretend jsdom proves real layout or pointer capture.

Perform a live browser check for drag creation, handles, pointer cancellation,
scroll/zoom interaction, keyboard-only editing, focus visibility, and undo
transaction grouping before marking this increment complete.

### 5. Dynamic bindings and state preview

Implement:

- number, boolean, and text binding definitions;
- inspector create/attach/detach/mapping controls;
- State-panel preview controls;
- preview compilation for mapped/hidden/dynamic elements;
- deterministic binding-local generation and TODOs;
- safe Lua-identifier normalization/collision handling; and
- used-binding rename/delete behavior.

Focused tests must cover mapping direction, integer/smooth quantization, shade
clamping, visibility inversion, text escaping, one binding shared by many
properties, unused bindings, delete-to-static conversion, identifier keywords,
identifier collisions, and stable source ordering.

Add real Wasmoon-boundary cases for all three binding types and compare emitted
commands with the compiler at multiple preview values.

### 6. Design-file portability and source handoff

Implement:

- strict JSON serializer/parser and file-name sanitizer;
- file size/type/version validation;
- non-destructive Open design flow;
- deterministic Download design flow and dirty revision tracking;
- Copy draw callback with success/failure status; and
- an explicit selectable-source fallback when the Clipboard API is unavailable
  or denied.

Pure file tests must pin byte-for-byte JSON, trailing newline, ordering,
round-trip equivalence, malformed/oversized input, unknown versions, unsafe
file names, and defensive parsing. Interactive tests cover failed file reads,
preserving the prior scene, discard confirmation, download-start wording,
clipboard rejection, and selection fallback.

This increment must not change project storage, backup schemas, recovery
journals, `.lua` import/export, or the active editor model.

### 7. Responsive/accessibility polish and documentation

Implement:

- medium and narrow responsive branches;
- touch-density sizing and overflow behavior;
- accessible toolbar, layers, tabs, sliders, swatches, findings, metrics, and
  announcements;
- reduced-motion behavior;
- visible approximation and browser-only-extension disclosure;
- `WORKBENCH_GUIDE.md` user instructions;
- `ARCHITECTURE.md` main-thread ownership/file-flow updates;
- `TESTING.md` coverage and limitation updates; and
- updates to this plan's evidence/status table.

Do not update `CONFORMANCE_STATUS.md` or `api-manifest.ts` unless implementation
actually changes a support claim or uncovers a conformance gap. The existence of
an authoring UI does not improve firmware fidelity.

Add responsive server-rendering tests and accessibility-oriented component
tests. Live checks must cover wide desktop, 721-900 px, <=720 px, coarse pointer,
keyboard-only navigation, reduced motion, browser zoom, and the largest
supported text-size preference.

### 8. Final regression, browser, and hardware validation

Run the complete project workflow:

```bash
npm test
npm run check
```

`npm run check` must pass linting, coverage thresholds, TypeScript, the complete
test suite, and the production build before the feature is described as
complete. Record exact test totals and coverage results current to that run;
do not copy historical counts from another plan.

Complete the live matrix below where the environment is available and record
exact unavailable cells:

| Environment | Required observations |
| --- | --- |
| Chromium desktop | Open/close/focus, every tool, dragging, handles, layers, undo, bindings, copy, file round trip. |
| Firefox desktop | Canvas scaling, pointer capture, clipboard fallback, file round trip, keyboard editing. |
| Safari desktop | Canvas pixels/smooth preview, focus trap/return, file download, keyboard shortcuts. |
| Narrow viewport | Full-height dialog, Fit zoom, panel tabs, no trapped/offscreen action, virtual-keyboard-safe fields. |
| Coarse pointer/touch | Target sizes, creation/move/resize, scrolling without accidental drawing, cancellation. |
| Keyboard only | Reach/order/operate every tool, layer, property, finding, binding, and handoff action. |
| Reduced motion/high browser zoom | No required motion, usable reflow, visible focus and non-colour state. |

When a Disting NT and capture method are available, use a named firmware
version and record reproduction steps for this corpus:

- integer line, reversed line, box, filled rectangle, and outline circle;
- smooth line and smooth circle at fractional positions;
- all 16 shades in adjacent samples;
- standard/tiny text with left/centre/right alignment and clipped text;
- overlapping calls including shade-zero overdraw;
- parameter-line and full-screen callback modes; and
- one binding-generated callback after manually connecting its placeholder.

Compare geometry, clipping, baseline/alignment, shade ordering, and coarse
appearance. Pixel-identical smooth output is not an acceptance criterion until
the firmware rasterizer is characterized. Browser timing is not a substitute
for device CPU/heap measurement, and the designer must not infer safety from
Luading callback telemetry.

## Automated verification matrix

### Pure model and geometry

- strict document normalization and unknown-input rejection;
- stable IDs, names, ordering, grouping, selection, and defensive copies;
- finite bounds, inclusive box sizes, radius, text baselines, and clipping;
- coordinate transforms at every zoom and viewport offset;
- integer/half-pixel snapping and property commit behavior;
- semantic history transactions and undo/redo;
- multi-selection bounds, alignment, and distribution; and
- local findings with stable targets and no quality-score coupling.

### Compiler and generator

- every target primitive and shade;
- exact draw order and visibility;
- parameter-line/full-screen modes;
- compiler/source equivalence through Wasmoon;
- dynamic scalar, visibility, and text mappings;
- numeric and Lua string formatting;
- safe/colliding binding identifiers;
- stable source and JSON bytes; and
- descriptive metrics without performance claims.

### React and integration

- command bar entry and responsive placement;
- modal semantics, focus trap/return, and discard confirmation;
- toolbar selection and element creation through exact controls;
- layer selection/actions and inspector discrimination;
- pointer/keyboard event wiring around pure geometry helpers;
- State preview, Findings focus, metrics, and Lua preview;
- clipboard and file adapter success/failure; and
- source, project, simulation worker, and normal display remaining unchanged
  while the designer is used.

### Existing regression surfaces

- `display-api.test.ts`, `display-renderer.test.ts`, `display-font.test.ts`, and
  `display-bounds.test.ts` after shared preview helpers change;
- script-scaffolder generator/dialog golden tests after Lua-string helper
  extraction;
- command-bar and responsive rendering tests after adding the entry point;
- documentation guardrails after adding user/architecture/testing text; and
- the complete bundled corpus through `npm test` before handoff.

## Multi-session implementation protocol

At the start of every implementation session:

1. read this plan's status, the latest recorded evidence, and any listed open
   decisions;
2. inspect `git status` and preserve unrelated user changes;
3. choose one unfinished increment or an explicitly recorded subset;
4. run its nearest existing characterization tests before changing shared
   display, scaffold, command-bar, or project code; and
5. state which browser/hardware checks are possible in that environment.

At the end of every session:

1. run the focused tests required for the coherent increment;
2. update the progress table with the exact command/result and completion date;
3. add a short **Next session** note only when an increment is partial or a
   decision remains open;
4. update canonical documentation only for behavior that actually landed;
5. leave future behavior in future tense; and
6. do not mark the plan implemented or archive it until every acceptance
   criterion and required project check is satisfied.

When complete, add a dated historical banner, move this file to
`docs/archive/implementation-plans/`, update `docs/README.md`, and keep current
behavior in the canonical architecture, testing, workbench, and conformance
documents.

## Risks and mitigations

### The feature grows into a general vector editor

Keep the palette closed over documented Disting calls. Evaluate every proposed
tool by the ordinary Lua it generates. Defer paths, rotation, boolean geometry,
rich text, gradients, images, and plugins.

### The visual editor and generated source disagree

Compile one normalized document through one binding resolver. Compare compiler
commands with real Wasmoon-emitted commands for representative and generated
fixtures. Keep numeric/source formatting deterministic.

### The preview looks more authoritative than it is

Reuse the production renderer, show smooth approximation persistently, and
separate simulator regression evidence from physical hardware confirmation.

### Generated code is technically valid but unpleasant to edit

Prefer explicit calls, stable group/element comments, short locals, and a
self-contained callback over compressed tables or loops. Golden tests should
review readability as well as syntax.

### Pointer interaction becomes the only usable workflow

Make layers and exact inspector controls complete from the first UI increment.
Treat canvas gestures as an acceleration layer. Include keyboard-only and
coarse-pointer acceptance.

### Design work is lost

Track dirty revisions, confirm destructive close/open/reset actions, provide
deterministic design downloads, and never claim an in-memory draft is saved.
Revisit project-attached autosave only with an explicit persistence/conflict
design.

### Shared helper extraction causes runtime drift

Characterize existing display parameter-line commands and scaffold source
before extraction. Require unchanged focused tests and avoid changing public
API metadata as part of code reuse.

### Concurrent active plans touch the same coordinator or styles

The export customizer and automated-tests plans may also change command-bar,
dialog, coordinator, or workbench CSS seams. Re-read their landed state before
each shared-file increment, keep feature state below `DistingPlayground`, and
resolve overlaps without overwriting unrelated work.

## Acceptance criteria

Version one is complete only when:

- every palette element maps to one established Disting draw call and no
  unsupported combination can be created or imported;
- the artboard, inspector, layer order, parameter-line mode, shades, text
  baselines/alignment, clipping, and generated calls agree in automated tests;
- static and dynamic generated callbacks compile, load, and draw through the
  real Wasmoon/display boundary;
- the designer never mutates active source, project records, live simulation,
  worker protocol state, or the normal display preview;
- exact editing, pointer editing, layers, grouping, undo/redo, bindings,
  findings, metrics, copy, and design-file round trips work through accessible
  controls;
- smooth primitives and performance metrics are disclosed with their real
  evidence limits;
- wide, medium, narrow, coarse-pointer, keyboard, and reduced-motion behavior
  is verified where available and every unavailable cell is reported;
- the relevant canonical architecture, testing, and workbench documentation
  describes only the behavior that landed;
- `npm test` passes;
- `npm run check` passes; and
- this plan contains final evidence, is marked implemented, and is archived as
  a dated historical snapshot.

## Out of scope for version one

- SVG, Figma, PDF, bitmap, icon-library, or font-file import;
- freeform paths, Bézier handles, ellipses, arcs, rounded rectangles, filled
  circles, thick strokes, joins/caps, rotation, masks, clipping paths,
  gradients, opacity compositing, filters, or images;
- raster-to-rectangle conversion or compressed pixel art;
- parsing arbitrary Lua into a scene or maintaining bidirectional source sync;
- automatic insertion/replacement of a `draw` callback in the current editor;
- managed generated regions inside Lua source;
- project-attached design autosave, IndexedDB schema changes, backup inclusion,
  conflict copies, or recovery journals;
- multiplayer presence, comments, cloud storage, component libraries, plugins,
  or Figma file compatibility;
- nested groups, layout constraints, responsive Disting layouts, or animation
  timelines;
- simulator-only runtime draw helpers or new firmware-facing globals;
- claiming browser smooth pixels are firmware-identical; and
- estimating safe hardware CPU, heap, source-size, or draw-call limits without
  measured evidence.
