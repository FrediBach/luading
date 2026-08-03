# Script parameter presets implementation plan

> **Historical snapshot.** Archived on 2026-08-03 after implementation. This
> plan preserves the decisions and verification state from that work; current
> behavior belongs in the workbench guide, architecture, testing strategy, and
> conformance ledger.

## Status

Implemented on 2026-08-03.

Verification completed:

- focused schema/model, real Wasmoon boundary, parameter UI, source-index,
  editor, documentation, and bundled-corpus tests passed;
- `npm run test:conformance` passed 8 tests;
- `npm test` passed 90 files and 491 tests;
- `npm run check` passed linting, coverage, TypeScript, the complete test suite,
  and the production build;
- coverage passed at 96.63% statements, 90.93% branches, 100% functions, and
  98.28% lines; and
- live browser interaction checks remain unverified because the browser runtime
  reported zero available backends after its required discovery check.

## Goal

Let a Lua algorithm declare ordered, named snapshots of its script-defined
parameter values in the table returned by the script. Luading will show those
snapshots beside the parameter controls and apply one on demand.

This is a Luading simulator extension. Disting NT firmware will ignore the
extra returned-table member, and Luading must not present it as a documented
firmware metadata field, a complete Disting preset, or parameter persistence.

## Evidence and existing boundaries

The Disting NT Lua Scripting 1.12 manual establishes that:

- the script returns a table containing its metadata and lifecycle callbacks;
- `init()` declares script parameters and their defaults;
- current scaled parameter values are exposed through the 1-based,
  script-relative `self.parameters` table; and
- hardware presets automatically store parameter values, while `serialise()`
  stores additional JSON-friendly `self.state`.

Manual 1.12 does not define named parameter snapshots inside an algorithm
script. The feature therefore belongs below the simulator-extension boundary.
It does not close the existing full-preset/bus gap (`PRE-01`/`PRE-02`) and does
not implement automatic parameter persistence (`PAR-03`).

Current ownership remains unchanged:

- the simulation worker owns the parameter model and authoritative values;
- the Lua runtime bridge owns `self.parameters`;
- `DistingPlayground` mirrors values and coordinates typed worker messages;
- device components only render typed preset metadata and callbacks; and
- browser storage is not involved.

## Proposed Lua source contract

Use a namespaced top-level extension so the declaration is visibly distinct
from firmware metadata:

```lua
return {
  name = "Vector LFO",
  author = "Example",

  luading = {
    parameterPresets = {
      {
        name = "Slow and subtle",
        values = { 0.25, 20, 1 },
      },
      {
        name = "Fast and wide",
        values = { 4.00, 100, 2 },
      },
    },
  },

  init = function(self)
    return {
      parameters = {
        { "Rate", 1, 1000, 100, kHz, kBy100 },
        { "Depth", 0, 100, 50, kPercent },
        { "Shape", { "Triangle", "Square" }, 1 },
      },
    }
  end,
}
```

Version-one rules:

- `luading.parameterPresets` is an ordered 1-based Lua sequence. Source order
  is display order.
- Each entry is a table with a non-empty, unique string `name` and a `values`
  sequence.
- `values` contains exactly one finite number for every `init().parameters`
  entry, in the same order. Sparse or partial presets are not supported.
- Values use the same script-visible scaled units as `self.parameters` and
  `setParameter()`. Enum values use their documented 1-based indices.
- Values must already be within the parameter's scaled range. Accepted values
  then pass through the existing quantization rules, so excess precision on a
  scaled numeric value is canonicalized consistently with an ordinary write.
- A missing `luading` table or missing `parameterPresets` field means that the
  script declares no parameter presets.
- Other `luading` fields remain ignored and reserved for possible future
  simulator extensions.
- Duplicate value vectors are allowed, but the first matching preset is shown
  as active. Duplicate names are invalid.

The explicit record form is preferable to a name-keyed Lua map because it
preserves order across the Lua/JavaScript boundary. Indexed values are
preferable to parameter-name maps because Disting scripts may legally declare
duplicate parameter names.

## Load-time validation and normalization

Add a pure `src/disting/emulation/parameter-presets.ts` model. It will parse the
raw Wasmoon-converted `program.luading` value after the firmware-facing program
and raw `init()` result have passed their existing blocking validation, but
before preset values are exposed to the UI.

The model will return:

```ts
export interface ScriptParameterPreset {
  name: string
  values: number[]
}

export interface ParameterPresetResult {
  presets: ScriptParameterPreset[]
  diagnostics: ScriptDiagnostic[]
}
```

Validation will inspect raw extension values before quantization. It will cover
the namespace shape, preset sequence, entry shape, name, duplicate name,
parameter count, finite values, scaled ranges, and enum indices. A malformed
preset entry will be omitted while independent valid entries remain available.

Extension findings will have stable rule IDs, `origin: 'contract'`,
`target: 'simulator'`, zero score penalty, and source locations under
`topLevel:luading.parameterPresets`. They will be warnings rather than blocking
hardware-contract errors: a Luading-only typo must not prevent a script that
the hardware would otherwise load from running. The Problems view will still
make the feature failure visible and actionable.

Do not add `luading`, `parameterPresets`, or a new global to
`api-manifest.ts`. That manifest remains the firmware-facing API catalog. The
editor documentation and conformance ledger must label this declaration as a
simulator extension.

## Shared data and worker protocol

Extend `LuaProgram` with `luading?: unknown` and `LoadedProgram` with a required
normalized `parameterPresets: ScriptParameterPreset[]`. Use an empty array for
scripts without the extension so presentation code has one complete shape.

Add a typed request and acknowledgement:

```ts
type WorkerRequest =
  | { type: 'applyParameterPreset'; index: number }
  // existing variants

type WorkerResponse =
  | {
      type: 'parameterPresetApplied'
      index: number
      parameterValues: number[]
      display: DrawCommand[]
    }
  // existing variants
```

The UI protocol index is 0-based. Conversion from the 1-based Lua sequence
happens only when the declaration crosses into TypeScript.

Add a batch operation to `LuaScriptParameterModel` which validates the complete
vector, updates only script-relative parameter entries, and returns canonical
values. The worker will then call `runtime.setParameters()` once. This makes a
preset application atomic with respect to the worker event loop and avoids one
Lua bridge crossing per parameter.

On `applyParameterPreset`, the worker will:

1. resolve the normalized preset by its 0-based protocol index;
2. apply and quantize the complete vector through the parameter model;
3. replace `program.parameters` and synchronize `self.parameters` once;
4. leave system/routing parameters and current parameter focus unchanged;
5. render the display once; and
6. acknowledge the canonical values and display commands.

The acknowledgement is necessary because a normal frame may already be in
flight, and a paused worker may not produce another frame promptly. The current
worker-identity check in `DistingPlayground` will continue to reject stale
responses from a replaced worker.

Applying a preset will not:

- invoke `init()` or replace the Lua VM;
- reset time, inputs, outputs, signal generators, clock, traces, or browser
  routes;
- update `self.state` or call `serialise()`;
- change Disting system/routing parameters; or
- persist the chosen preset across reloads.

`DistingPlayground` will clear the visible trace when the user applies a preset,
send the request, and accept the worker's canonical acknowledgement. Normal
frames remain authoritative if the script later calls `setParameter()`.

## Active-preset derivation

Do not store a separate authoritative "selected preset" value. Add a pure
helper which compares the current canonical parameter vector with each preset
and returns the first exact match. If none matches, the UI displays `Custom`.

This derived state handles all update paths consistently:

- initial parameter defaults can naturally match a declared preset;
- selecting a preset makes it active after the worker acknowledgement;
- turning an individual parameter normally changes the label to `Custom`;
- a Lua `setParameter()` call can move into or out of a named preset; and
- reloading starts from normal `init()` defaults and derives the label again.

No preset auto-applies during load. This avoids changing the existing default
parameter semantics merely because simulator-only metadata is present.

## User interface

Place the control in the Script parameters panel header, not in the command bar.
That location keeps it next to the values it changes and avoids confusion with
the existing workspace layout presets and hardware preset-state save action.

Add a small `ParameterPresetSelector` under `src/disting/device/` and render it
only when at least one valid preset exists. The first implementation can use a
native labelled select:

- visible label: `Parameter preset`;
- current unmatched option: `Custom`;
- options in source order;
- a visible `Luading only` or `Simulator` annotation; and
- an accessible description that hardware ignores the declaration.

Selection remains available while the runtime is paused. It is disabled during
load/error states through the same loaded-program gating as other parameter
controls. The panel header must continue to fit with parameter pagination at
desktop, narrow, and coarse-pointer breakpoints.

## Editor and diagnostic support

Add a top-level `luading` completion with a complete parameter-preset snippet.
Its completion detail and hover must say `Luading simulator extension` and
state that Disting NT hardware ignores it. Do not add it to the default complete
script scaffold, because the extension is optional.

Extend the source index only as needed to locate direct literal declarations:

- `topLevel:luading`;
- `topLevel:luading.parameterPresets`;
- each preset entry and its `name`/`values`; and
- each indexed value when statically locatable.

Computed or locally referenced tables may fall back to the enclosing `luading`
range. Source locations and diagnostic navigation remain valid only for the
current source version.

## Implementation increments and focused tests

Tests are required after every increment.

### 1. Schema, parsing, and parameter model

- Add the shared preset types and pure parser/normalizer.
- Add batch script-value application to `LuaScriptParameterModel`.
- Cover valid order, scaled values, enum indices, quantization, duplicate value
  vectors, matching/default/custom derivation, and defensive copies.
- Cover every malformed shape, duplicate names, wrong vector length,
  non-finite/out-of-range values, invalid enums, zero-parameter scripts, and
  mixed valid/invalid entries.
- Assert extension diagnostics target the simulator, do not affect score, and
  do not block hardware-valid execution.

Run the focused emulation and contract tests after this increment.

### 2. Real Lua boundary and worker orchestration

- Prove a nested top-level `luading.parameterPresets` table crosses the real
  Wasmoon boundary with source order and 1-based values intact.
- Populate normalized presets during worker load and include their diagnostics
  in `loaded`.
- Add the batch request/acknowledgement and synchronize the Lua
  `self.parameters` table through the production runtime bridge.
- Test that application is atomic, quantized, script-relative, visible while
  paused, and does not touch `self.state`, system parameters, or I/O state.
- Test missing/outdated preset indices as safe no-ops and preserve stale-worker
  response rejection.

Run the focused Lua runtime, parameter, and worker/protocol tests after this
increment.

### 3. Parameter-panel UI

- Add the selector, active/custom derivation, coordinator handler, styling, and
  accessible simulator-only disclosure.
- Cover no-presets, one/many presets, active and custom states, source order,
  disabled state, parameter paging coexistence, and canonical acknowledgement
  updates with pure/rendering tests.
- Perform live checks for running and paused application, manual edits changing
  the label to Custom, keyboard selection, narrow layout, coarse pointer, and
  reduced motion. Report any unavailable browser matrix exactly.

Run focused device/coordinator rendering tests after this increment.

### 4. Editor and documentation

- Add simulator-labelled completion, hover, source indexing, semantic
  locations, and compile-tested snippet coverage.
- Update `WORKBENCH_GUIDE.md` with the source schema and load/apply/reload
  behavior.
- Update `ARCHITECTURE.md` for preset metadata ownership, request/response flow,
  and paused acknowledgement behavior.
- Update `TESTING.md` with parser, boundary, protocol, and UI guarantees.
- Add a simulator-extension `PAR-05` entry to `CONFORMANCE_STATUS.md`, explicitly
  distinguishing the feature from `PAR-03`, `PRE-01`, and `PRE-02`.
- Keep this plan active while work is underway. Once complete, move it to
  `docs/archive/implementation-plans/`, add a dated historical banner and exact
  verification results, and update `docs/README.md`.

Run focused editor, documentation, and conformance tests after this increment.

## Regression and completion workflow

Because this changes runtime load metadata and crosses the JavaScript/Lua
boundary, completion requires:

```bash
npm run test:conformance
npm test
npm run check
```

Also run both bundled-script corpus suites. Existing official and project
scripts must remain valid without adding an expected-error allowlist.

## Acceptance criteria

The feature is complete when:

- a script can declare multiple ordered named parameter snapshots using the
  documented `luading.parameterPresets` form;
- valid presets cross Wasmoon, appear in source order, and apply the exact
  canonical script-relative values in one worker operation;
- the Lua script, parameter controls, display, and active/custom label agree
  after application while running or paused;
- malformed extension data produces simulator-targeted, source-navigable,
  non-blocking diagnostics and never prevents otherwise valid hardware code
  from running;
- reload/default, manual edit, script-driven edit, serialization, and stale
  worker behavior match the decisions above;
- the UI and editor clearly label the field as Luading-only;
- relevant canonical documentation is updated;
- corpus, focused, conformance, complete suite, and `npm run check` pass; and
- any unavailable live browser validation is reported precisely.

## Out of scope for version one

- Complete Disting multi-algorithm presets, bus snapshots, routing, or companion
  algorithm editing.
- Saving, renaming, reordering, importing, or exporting presets from the UI.
- Capturing the current parameter values back into Lua source automatically.
- Sparse presets or parameter-name-keyed values.
- Automatically choosing a preset during load or persisting the last selection.
- Including `self.state`, signal generators, Web Audio, Web MIDI, clock, output
  voltages, or workspace layout in a parameter preset.
- Claiming that hardware recognizes `luading` or `parameterPresets`.
