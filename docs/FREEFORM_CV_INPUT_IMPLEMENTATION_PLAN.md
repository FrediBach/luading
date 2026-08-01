# Freeform CV input implementation plan

## Status

Implemented on 2026-08-01. Automated verification is complete; live browser
interaction acceptance remains pending because the available browser-control
runtime reported no browser backends.

Verification completed:

- focused emulation, editor-model, rendering, and annotation tests passed;
- complete suite: 85 files and 445 tests passed;
- coverage thresholds passed at 96.56% statements, 91.04% branches, 100%
  functions, and 98.21% lines; and
- `npm run check` passed linting, coverage, TypeScript, and the production build.

## Goal

Add a browser-local **Freeform CV** signal-generator shape that lets a user
build a repeating voltage progression by adding, selecting, moving, editing,
and removing control points on a waveform canvas.

The feature should make a useful custom CV possible in a few pointer actions,
while retaining exact numeric editing, keyboard access, deterministic worker
sampling, clock sync, and the existing Disting NT Lua lifecycle.

This is a simulator input convenience. It does not add a Disting Lua constant,
callback, metadata form, or hardware capability, and it must not be presented
as part of the firmware-facing Lua contract.

## Product decisions

The first version will use the following interaction and signal contract:

- **Freeform CV is a signal-generator shape.** It appears beside Manual / DC,
  Sine LFO, Triangle LFO, and the other shapes in an input inspector. It is not
  a third route beside Signal generator and Web MIDI.
- **It is available on every input channel.** Disting input buses carry
  voltages; the declared `kCV`, `kGate`, or `kTrigger` kind continues to decide
  how Lua sees that voltage and which edge callbacks run.
- **The waveform repeats.** Its horizontal axis is one cycle from phase `0` to
  phase `1`. The existing free-running frequency or clock division determines
  cycle duration, and the existing Phase control shifts playback.
- **Points store output volts directly.** The vertical editor range is
  `-10 V` through `+10 V`, matching the existing manual-voltage control. A
  point at `3.25 V` produces `3.25 V`; users do not need to calculate a
  normalized point plus amplitude and offset.
- **Interpolation is linear.** The worker linearly interpolates between
  adjacent points at the 1 ms control step. The start and end points may have
  different voltages, allowing an intentional discontinuity at the cycle seam.
- **Cycle-boundary points always exist.** A point at phase `0` and a point at
  phase `1` are required. Their voltages can move, but their horizontal
  positions cannot. Interior points move on both axes.
- **A new waveform begins safely at 0 V.** Selecting Freeform CV for the first
  time creates two boundary points, both at `0 V`, rather than immediately
  injecting a non-zero signal.
- **The point count is bounded.** The first version supports at most 64 points,
  including the two boundary points. This is ample for hand-edited CV while
  bounding structured-clone traffic and 1 kHz sampling work.
- **Editing uses predictable steps.** Normal keyboard movement uses `1%` of a
  cycle horizontally and `0.1 V` vertically; Shift uses `0.1%` and `0.01 V`.
  Interior neighbors keep at least `0.1%` of a cycle between them.
- **Configuration remains session state.** As with current input routes, direct
  UI changes reset when another Lua program is loaded. The existing copyable
  Lua-comment default mechanism will be extended so a script author can opt in
  to restoring a freeform shape and its points on load.

## User experience

### Selecting the shape

Add a `Freeform CV` entry and waveform glyph to the existing Signal generator
picker. Selecting it should preserve previously edited freeform points already
held by that input's generator configuration; the first selection uses the
flat `0 V` default.

The input tile should show:

- the normal recent worker trace;
- the new waveform glyph;
- the current sampled voltage;
- frequency or clock division as its primary compact control; and
- `Freeform CV · <rate>` or `Freeform CV · <division>` in the footer.

The live trace remains the authoritative tile visualization. It shows what Lua
actually received, including phase, clock state, and the 1 ms sampling cadence,
rather than merely redrawing the configured point curve.

### Waveform editor

When Freeform CV is selected, render a dedicated `FreeformCvEditor` in the
input inspector between timing controls and the Phase control.

The editor should contain:

- a responsive SVG plot with a zero line, light voltage grid, start/end cycle
  labels, and a connected polyline;
- visible control points with larger transparent hit targets for touch;
- the selected point's cycle position in percent and voltage in volts;
- exact `ValueField` inputs for the selected point;
- **Add point**, **Remove point**, and **Reset waveform** actions; and
- a short instruction such as “Click or tap to add; drag a point to move.”

Pointer behavior:

1. Clicking or tapping empty plot space adds a selected point at that phase and
   voltage.
2. Pressing an existing point selects it and captures the pointer.
3. Dragging updates the point continuously. Interior points move horizontally
   and vertically; boundary points move vertically only.
4. An interior point cannot cross its neighbors. Clamp it to a small phase gap
   so point identity and interpolation order remain stable during a drag.
5. Pointer release or lost capture flushes the final value and ends the drag.
6. **Remove point** deletes only an interior selected point. **Reset waveform**
   asks for no destructive modal confirmation because it only replaces the
   current two-boundary-point generator shape and is immediately visible.

Keyboard and exact editing behavior:

- Every point is focusable and named with its index, phase percentage, and
  voltage.
- Left/Right moves an interior point by one phase step; Up/Down moves any point
  by one voltage step. Shift applies the same fine-adjustment convention as
  existing controls.
- Delete or Backspace removes a selected interior point.
- **Add point** gives keyboard-only users a deterministic operation: insert a
  point at the midpoint of the largest phase gap, with its voltage initialized
  from the current interpolated curve.
- The selected-point fields allow exact phase and voltage entry. Phase is
  read-only for the two boundary points.
- Focus, selection, and instructions must not rely on point color alone.

At the 64-point limit, disable **Add point**, keep all editing/removal actions
available, and expose a concise accessible explanation.

### Generator controls

Freeform CV uses the existing timing controls unchanged:

- free-running mode from `0.001 Hz` through `100 Hz`;
- clock-sync divisions from `2 bars` through `1/32`; and
- phase from `0%` through `100%`.

Hide Amplitude, Offset, Pulse width, Steps, and Seed for this shape. Point
voltages are already absolute, so showing Amplitude and Offset would make the
editor's voltage labels ambiguous.

### Responsive layout

- Keep the existing 470 px desktop inspector target where it fits.
- Let the SVG use the full inspector width rather than a fixed bitmap size.
- Preserve useful plotting space in the phone-width bottom sheet; action and
  exact-value controls may wrap to two rows.
- Use coarse-pointer media rules for at least 24 CSS pixel point hit targets
  without making the visible point markers disproportionately large.
- Set `touch-action: none` only on the interactive plotting surface so dragging
  a point is stable without disabling scrolling for the whole inspector.

## Data and signal model

### Shared types

Extend `src/disting/types.ts` with:

```ts
export interface FreeformCvPoint {
  phase: number
  volts: number
}
```

Add `'freeform'` to `SignalShape` and add a required
`freeformPoints: FreeformCvPoint[]` field to `SignalSourceConfig`.

Keeping the point array required gives every normalized configuration a
complete shape and avoids optional checks at the worker boundary. Update
`defaultSignalSource()` and all focused test factories to include independent
copies of the default point array.

Do not add a new `WorkerRequest` variant. The existing `setInputSource` request
already carries `SignalSourceConfig`, and browser structured cloning supports
the plain point objects.

### Normalization invariants

Implement point normalization with the rest of reusable signal behavior in
`src/disting/emulation/signal-sources.ts`. Normalization must:

1. ignore entries with a non-finite phase or voltage;
2. clamp phase to `[0, 1]` and voltage to `[-10, 10]`;
3. sort points by phase;
4. coalesce duplicate phases deterministically, with the last supplied value
   winning;
5. add a phase-`0` boundary using the first valid voltage when it is missing;
6. add a phase-`1` boundary using the last valid voltage when it is missing;
7. fall back to the two flat `0 V` boundary points when no valid data remains;
8. retain both boundaries while reducing oversized input to the 64-point limit
   by selecting evenly distributed interior entries in phase order; and
9. return fresh point objects so `SignalBank.configs` remains a defensive deep
   copy.

The UI should maintain a minimum phase gap between neighboring points, but the
core normalizer must remain safe for malformed, stale, or hand-authored
configuration that bypasses the editor.

### Sampling

Refactor the cycle calculation in `signalValueAt()` only as much as needed to
reuse it for Freeform CV. For `shape === 'freeform'`:

1. derive the cycle and wrapped phase with the existing free/clock timing and
   Phase setting;
2. locate the adjacent normalized points around the wrapped phase;
3. return an exact point voltage when the phase matches a point; otherwise
   return the linear interpolation; and
4. never apply the generic amplitude or offset fields.

Sampling remains pure and deterministic. The worker will continue to sample
the source first, detect typed edges second, and call Lua callbacks in the
documented order. A freeform waveform driving a `kGate` or `kTrigger` input
therefore uses the existing threshold and edge logic without a special path.

### Source replacement and copying

Update `SignalBank.set()`, `SignalBank.configure()`, and `SignalBank.configs`
through the shared normalizer so point arrays cannot alias React or caller
state. Switching an input to Web MIDI should retain the existing behavior of
disabling the generator in the worker. Returning to Signal generator currently
creates the kind-appropriate default source; do not introduce hidden
cross-route persistence as part of this feature.

## UI model and component boundaries

### Pure editing helpers

Create `src/disting/io/freeform-cv-editor.ts` for browser-independent editing
operations:

- plot-coordinate to phase/voltage conversion and clamping;
- adding a point in sorted order;
- finding the largest gap for keyboard insertion;
- moving an interior or boundary point under the neighbor-gap rules;
- removing an interior point;
- selection-index adjustment after add/remove; and
- creation of the SVG polyline/path from phase-aware points.

Keep interpolation and malformed-config normalization in `emulation/`; the UI
helpers should operate on already normalized points and express interaction
policy only.

### React editor

Create `src/disting/io/FreeformCvEditor.tsx` as a controlled component that
accepts points and emits the next point array. It should own only transient UI
state: selected point, active pointer ID, plot bounds, and an in-progress drag
draft.

During a drag, publish previews no more than once per animation frame and flush
the last draft on release. This keeps the waveform and live input responsive
without posting hundreds of full arrays per browser event burst. Cancel a
scheduled frame during unmount and handle lost pointer capture so a stale drag
cannot keep mutating the input.

The component must resynchronize when its `points` prop changes outside the
active drag, including shape reset and script reload. It must not mutate the
prop array.

### Inspector integration

Update `src/disting/io/InputChannelInspector.tsx` to:

- render the editor only for `shape === 'freeform'`;
- continue rendering sync/frequency/division controls because Freeform CV is a
  timed source;
- render only Phase from the generic rotary controls for this shape; and
- route editor changes through the existing generator `onChange` callback.

Update `src/disting/io/input-source-controls.ts` so:

- `inputUsesTiming()` returns true for Freeform CV;
- `inputUsesPulseWidth()` and `inputUsesStepCount()` remain false;
- `inputIsStepped()` returns false;
- `inputShapeDefaults()` preserves an existing point array and creates a fresh
  flat default if it receives a legacy/malformed configuration; and
- `inputPlotRange()` includes every configured point voltage as well as recent
  trace extrema.

Update `src/disting/controls/SignalShapeGlyph.tsx` with a recognizable
multi-point line glyph. Update `SIGNAL_SHAPES` in
`src/disting/emulation/signal-sources.ts` with the user-facing label
`Freeform CV`.

### Styling

Add feature styles to `src/disting/io/io.css`, using existing workbench tokens
for grid, curve, selected/focused point, labels, errors, and buttons. Do not add
canvas-specific colors or a second theme system. Ensure the curve, grid, focus
ring, and selected point remain distinguishable in every existing theme and
text-size setting.

## Lua-comment simulator defaults

The annotation remains a browser-only hint and never changes the Lua table.
Extend the existing format with a compact point encoding:

```lua
kCV, -- Type: Freeform CV, Synced: true, Division: 1/4, Points: 0@0|0.25@5|0.75@-2|1@0
```

Implementation rules:

- add `Freeform CV` to the recognized input type names in
  `src/disting/emulation/simulator-defaults.ts`;
- parse `Points` as pipe-separated `phase@volts` pairs;
- run parsed points through the same core normalizer rather than trusting the
  comment;
- ignore a malformed individual pair and use the safe flat default when no
  valid pair remains;
- serialize finite numbers with a stable compact representation that
  round-trips normal UI values without locale dependence;
- include points only for the Freeform CV type in
  `src/disting/io/io-default-entries.ts`; and
- keep the existing `Synced` and `Division` fields. As today, an exact
  free-running frequency is not part of the annotation format.

The copied entry can be long for a dense waveform, but the 64-point bound keeps
it finite. Document that these comments are Luading hints, not Disting metadata.

## File-by-file implementation outline

### Core and worker-facing data

- `src/disting/types.ts`
  - add `FreeformCvPoint`, the `freeform` shape, and required points.
- `src/disting/emulation/signal-sources.ts`
  - add catalog/default data, point normalization, interpolation, sampling,
    and deep-copy behavior.
- `src/disting/disting.worker.ts`
  - no new message or scheduling branch is expected; confirm that the existing
    normalized `signals.set()` path is sufficient.
- `src/disting/DistingPlayground.tsx`
  - no state-model change is expected; confirm point arrays flow through the
    existing controlled `InputChannelRoute` and `setInputSource` request.

### Input UI

- `src/disting/io/freeform-cv-editor.ts`
  - add pure interaction and coordinate helpers.
- `src/disting/io/FreeformCvEditor.tsx`
  - add the accessible SVG editor and transient drag state.
- `src/disting/io/InputChannelInspector.tsx`
  - insert shape-specific editor and controls.
- `src/disting/io/input-source-controls.ts`
  - update control visibility, defaults, interpolation classification, and
    plot range.
- `src/disting/io/InputChannelTile.tsx`
  - rely on catalog/timing helpers for label and tile behavior; add only a
    shape-specific change if testing exposes one.
- `src/disting/controls/SignalShapeGlyph.tsx`
  - add the new exhaustive glyph branch.
- `src/disting/io/io.css`
  - add desktop, narrow, touch, focus, and disabled states.

### Defaults and documentation

- `src/disting/emulation/simulator-defaults.ts`
  - parse the Freeform CV type and point list.
- `src/disting/io/io-default-entries.ts`
  - serialize the point list in a paste-ready entry.
- `docs/ARCHITECTURE.md`
  - record freeform point normalization/interpolation as browser-local signal
    generation and preserve the worker boundary description.
- `src/disting/ARCHITECTURE.md`
  - add the point-based source to the lower-level `signal-sources.ts` ownership
    notes without moving editor interaction policy into emulation.
- `docs/TESTING.md`
  - add custom point normalization, interpolation, and editor-model coverage to
    the emulator/UI test matrix.
- `docs/WORKBENCH_GUIDE.md`
  - explain how to create/edit a waveform, its timing behavior, keyboard
    controls, voltage range, and `Points` annotation syntax.
- `README.md`
  - update the editable-input feature summary only if the existing concise
    wording benefits from naming freeform CV explicitly.

## Implementation sequence

### Increment 1: data contract and deterministic sampling

1. Add the shared point type, shape, required default points, constants, and
   normalization rules.
2. Add linear point sampling to `signalValueAt()` using the existing timing and
   phase calculation.
3. Deep-copy points through `SignalBank` configuration getters/setters.
4. Add focused emulation tests and run:

   ```bash
   npx vitest run src/disting/emulation/signal-sources.test.ts
   ```

Exit condition: malformed configs normalize safely and tests pin exact
free-running, clocked, phased, breakpoint, interpolated, and cycle-seam values.

### Increment 2: pure editor behavior

1. Add point insertion, movement, removal, selection, coordinate conversion,
   largest-gap insertion, and path-generation helpers.
2. Test boundary locking, neighbor clamping, voltage limits, maximum points,
   and deterministic selection changes.
3. Run:

   ```bash
   npx vitest run src/disting/io/freeform-cv-editor.test.ts
   ```

Exit condition: all interaction state transitions are testable without DOM or
worker mocks.

### Increment 3: accessible waveform editor and inspector integration

1. Build `FreeformCvEditor` with SVG pointer capture, keyboard operations,
   exact fields, actions, and animation-frame publishing.
2. Add the shape to the picker and glyph catalog.
3. Integrate timing/phase visibility and hide irrelevant controls.
4. Update plot-range and tile behavior.
5. Add responsive styles and server-rendered accessibility assertions.
6. Run focused control and input tests:

   ```bash
   npx vitest run src/disting/controls/control-rendering.test.tsx \
     src/disting/io/input-source-controls.test.ts \
     src/disting/io/input-rendering.test.tsx
   ```

Exit condition: the shape is selectable, its editor renders with named
controls, and existing signal shapes and input routes still render correctly.

### Increment 4: default annotation round-trip

1. Add parser aliases and the point-list parser.
2. Add stable point-list serialization for the tile context menu.
3. Cover valid, malformed, clamped, oversized, and copied-entry round trips.
4. Run:

   ```bash
   npx vitest run src/disting/emulation/simulator-defaults.test.ts \
     src/disting/io/io-default-entries.test.ts \
     src/disting/io/io-default-context-menu.test.tsx
   ```

Exit condition: copying a Freeform CV input entry and loading it from an
`init()` comment restores the normalized waveform, timing mode, and division.

### Increment 5: documentation, regression, and release gate

1. Update architecture, testing, and workbench documentation.
2. Run the complete suite:

   ```bash
   npm test
   ```

3. Run the complete project gate:

   ```bash
   npm run check
   ```

`npm run test:conformance` is not required solely for this feature because no
public Lua contract changes. Run it if implementation work unexpectedly changes
firmware-facing metadata, lifecycle behavior, or API declarations.

Exit condition: all bundled scripts still load through Wasmoon, coverage gates
pass, lint passes, and the production build succeeds.

## Automated test matrix

### Emulation

- flat defaults for CV, gate, and trigger source configurations include
  independent point arrays;
- invalid numbers, out-of-range volts/phases, unsorted input, duplicate phases,
  missing boundaries, empty input, and more than 64 points normalize
  deterministically;
- normalization does not mutate its input;
- exact boundary and interior points return exact voltage;
- midpoint values interpolate linearly;
- phase offset, free-running timing, and every clock division reuse existing
  cycle semantics;
- different start/end voltages create the intended cycle-seam discontinuity;
- a clock-synced waveform holds when the shared clock is stopped while a
  free-running waveform continues under the existing simulation-time rules;
- `SignalBank.configs` cannot be used to mutate stored point objects; and
- external Web MIDI source replacement still resets generator/external state.

### Pure editor model

- pointer coordinates map to the correct phase and voltage at every plot edge;
- adding a point sorts it and selects its new index;
- keyboard addition chooses the largest gap and initializes on the existing
  line;
- endpoint horizontal positions remain locked;
- interior movement respects neighbors and the minimum phase gap;
- voltage changes clamp to `-10 V` and `+10 V`;
- deletion cannot remove boundary points and chooses a predictable next
  selection;
- the 64-point limit blocks insertion without blocking edits; and
- SVG path generation uses real phase spacing rather than treating points as
  equally spaced.

### Rendering and accessibility

- the picker and glyph tests enumerate Freeform CV;
- the inspector shows editor, timing, and phase controls for the new shape;
- amplitude, offset, pulse width, steps, and seed are absent for the new shape;
- point controls have names containing phase and voltage;
- Add, Remove, and Reset expose correct disabled states;
- a freeform tile shows live trace, current voltage, glyph, and timing label;
- other shapes retain their current controls; and
- Web MIDI input rendering is unchanged.

### Simulator defaults

- a copied Freeform CV entry parses back to the same normalized points;
- clock sync and division round-trip with points;
- parsing is locale-independent;
- malformed pairs are ignored safely;
- point limits and voltage clamps apply to hand-authored annotations; and
- all existing generator and output annotations retain their current
  round-trip behavior.

## Manual acceptance matrix

After automated checks pass, verify in a real browser:

1. Load a Lua script with a CV input, select Freeform CV, add three points, and
   confirm the tile trace and scope follow the drawn progression.
2. Drag points while running and paused; confirm no stuck pointer state,
   scrolling trap, runtime error, or visibly stale final value.
3. Exercise free timing, clock sync, every division boundary, shared-clock
   stop/start, and Phase.
4. Drive `kGate` and `kTrigger` inputs with a waveform that crosses the existing
   threshold and confirm callbacks keep the documented edge behavior.
5. Edit every point using only keyboard and exact value fields, including add,
   move, delete, reset, and focus recovery.
6. Check mouse, trackpad, and coarse-pointer/touch interaction at desktop,
   below 900 px, and phone-width layouts.
7. Check all themes and Small/Standard/Large text settings for curve, grid,
   selected point, focus ring, and label contrast.
8. Copy the Lua default entry, paste it into an `init().inputs` entry, reload,
   and confirm the waveform returns.
9. Switch Generator → Web MIDI → Generator and load a different script;
   confirm the existing reset rules remain clear and deterministic.
10. Create 64 points and drag continuously while the scope is open; confirm
    worker input, React rendering, and pointer feedback remain responsive.

Record browser-specific limitations as browser-local findings. Do not describe
interaction latency or browser timing as Disting NT hardware performance.

## Acceptance criteria

The feature is complete when:

- a user can create a custom repeating CV with pointer or keyboard without
  editing Lua;
- every point exposes exact phase and voltage editing;
- worker output matches the normalized piecewise-linear curve at the 1 ms
  control cadence in both free and clocked modes;
- malformed or oversized point arrays cannot produce `NaN`, an exception, or
  unbounded worker work;
- the editor works at desktop and narrow layouts with mouse, touch, and
  keyboard;
- copied simulator-default comments restore the freeform configuration without
  changing the Lua-visible contract;
- existing generator shapes, Web MIDI routes, edge callbacks, traces, and
  bundled Lua scripts remain regression-safe;
- relevant architecture, testing, and user documentation is updated; and
- `npm test` and `npm run check` pass.

## Non-goals for the first version

- Bezier handles, curves, tension, or spline interpolation.
- Per-segment stepped/linear modes.
- One-shot envelopes, gate-triggered playback, sustain stages, or recording a
  live MIDI/CV gesture.
- Amplitude/offset post-processing for absolute-voltage point data.
- Unlimited points or pencil-style high-density drawing.
- Sharing waveforms between channels, a waveform preset library, undo history,
  import/export files, or cross-script browser persistence.
- A new Lua API, Disting constant, parameter, bus kind, or preset-state field.
- Claims that browser rendering or sampling performance reproduces Disting NT
  processor timing.

These can be considered later without changing the first version's stored
phase/voltage point format.

## Risks and mitigations

- **Drag traffic overwhelms React or the worker.** Bound points to 64, publish
  at most once per animation frame, and flush exactly once on release.
- **Point order changes during drag.** Clamp interior phases between neighbors
  instead of silently reordering active points.
- **Malformed comments produce invalid signals.** Use the same finite checks,
  bounds, sorting, duplicate handling, endpoint repair, and point cap at every
  entry path.
- **The editor curve and worker output diverge.** Keep interpolation in the
  emulation module as the authority; initialize keyboard-added points with that
  same interpolation rule and test exact samples.
- **A dense curve is inaccessible.** Provide focusable named points, exact
  selected-point fields, deterministic keyboard insertion, and explicit
  removal/reset actions.
- **The feature is mistaken for firmware behavior.** Label it as a signal
  generator and document the annotation as a Luading-only comment hint.
- **Required point arrays create shallow-copy bugs.** Construct fresh defaults,
  deep-copy from `SignalBank.configs`, and add mutation regression tests.
