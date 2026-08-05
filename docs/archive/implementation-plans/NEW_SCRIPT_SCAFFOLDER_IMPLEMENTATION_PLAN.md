# New-script scaffolder implementation plan

> **Historical snapshot.** Archived on 2026-08-05 after implementation. This
> plan preserves the decisions and verification state from the work; current
> behavior belongs in the workbench guide, architecture, testing strategy, and
> conformance ledger.

## Status

Implemented on 2026-08-05.

Verification completed:

- focused generator and production Wasmoon-boundary tests passed 8 tests;
- focused dialog, command-bar, responsive, project-library, and project-model
  tests passed 34 tests;
- `npm run test:conformance` passed 8 tests;
- `npm test` passed 116 files and 641 tests;
- `npm run check` passed linting, coverage thresholds, TypeScript, the complete
  test suite, and the production build;
- coverage passed at 96.76% statements, 91.01% branches, 100% functions, and
  98.43% lines; and
- live browser interaction, visual, touch, narrow-viewport, and platform-focus
  checks remain unverified because the browser runtime reported zero available
  browser backends after the required discovery and troubleshooting checks.

## Goal

Replace the command bar's immediate **New** action with a dedicated scaffolding
dialog that serves two audiences:

1. **Quick start** creates the current minimal, working one-input/one-output
   script with no required decisions.
2. **Guided setup** walks through identity, inputs, outputs, parameters,
   front-panel behavior, preset-related features, and other optional callbacks
   before showing the exact Lua source that will be created.

Every step can be skipped. Every newly added row begins with a valid default.
A user who does not know what to choose can accept the defaults and still get a
loadable, editable script rather than an incomplete form or invalid Lua.

The generated source is a starting point, not a second source of truth. Once the
project is created it behaves like any other local script: the editor owns its
text, autosave persists it, and reopening the scaffolder does not attempt to
reverse-engineer or update it.

## Current behavior and boundaries

The current path is deliberately small:

```text
New button
  -> DistingPlayground.createNewScript()
  -> useProjectLibrary.createNew()
  -> New Script.lua + NEW_DISTING_SCRIPT
  -> local project is selected, saved, and loaded
```

`NEW_DISTING_SCRIPT` in `src/disting/workbench/script-file.ts` is a valid
one-`kCV`/one-`kLinear` pass-through script. The project library already owns
filename collision handling, replacement protection, IndexedDB creation,
recovery journaling, active-document replacement, and the resulting load. The
scaffolder must reuse all of that behavior.

The new draft and dialog remain main-thread presentation state. Generation is a
pure TypeScript operation. The generated text crosses the existing project and
worker boundaries exactly as hand-written editor text does. This feature does
not add a worker message, browser-storage schema, Lua global, or runtime
adapter.

The authoritative contract inputs are:

- the Disting NT Lua Scripting 1.12 manual for header comments, `init()` I/O,
  parameter forms, lifecycle callbacks, custom algorithm UI, MIDI filtering,
  and `serialise()`;
- `src/disting/validation/api-manifest.ts` for supported constants, lifecycle
  names, provenance, and editor-facing descriptions;
- `src/disting/validation/contract-validator.ts` for the raw forms Luading
  accepts and blocks; and
- `src/disting/emulation/parameter-presets.ts` for the existing
  `luading.parameterPresets` simulator extension.

## Product decisions

### One dialog, two paths

Opening **New** presents a modal titled **Create Lua script**. Its first view
contains two choices:

- **Quick start** — one CV input, one linear output, and pass-through `step()`
  logic. Name, short description, and author are editable, but already contain
  useful defaults. Its primary action is **Create simple script**.
- **Guided setup** — starts the stepper with the same draft defaults. Its
  primary action is **Customize script**.

Both paths use the same draft schema, normalization, validation, and generator.
There must not be a separately maintained quick-start string that can drift
from guided output.

Switching between paths while the dialog is open preserves the draft. Closing
the dialog discards it. Version one does not persist unfinished scaffolds.

### Defaults

The initial draft is always valid:

| Choice | Default |
| --- | --- |
| Script name | `New Script` |
| Filename | Derived as `New Script.lua`; existing allocation adds ` 2`, ` 3`, etc. |
| Description | `Passes input 1 to output 1. Replace the example logic below.` |
| Author | `Your Name` |
| Inputs | One `kCV` input named `Input` |
| Outputs | One `kLinear` output named `Output` |
| Parameters | None |
| Front-panel behavior | Standard parameter UI; no custom handlers |
| Display | Standard display; no `draw()` callback |
| MIDI input | Off |
| Named parameter snapshots | None |
| Additional saved state | Off |

The quick-start output should retain the current scaffold's behavior and short
orientation comments. A golden test should pin it byte-for-byte unless an
intentional template revision updates the expectation.

Optional means that a section or entity may be omitted. Once the user adds a
specific input, output, parameter, preset, or MIDI configuration, that entity
must be valid before creation. The dialog should never silently discard a
partially configured row.

### Algorithm scripts only in version one

This workbench currently loads algorithm scripts. The dialog therefore creates
algorithm scripts only. It does not offer a UI-script mode, module bundling,
multi-algorithm preset construction, browser route setup, test generation, or
installation to a MicroSD card.

The draft shape should include a `scriptKind: 'algorithm'` discriminator so a
future UI-script scaffolder can be added without overloading algorithm-only
control rules.

### Hardware and simulator provenance stays visible

The custom algorithm UI documented by Manual 1.12 includes:

- `pot1Turn`, `pot2Turn`, and `pot3Turn`;
- `encoder1Turn` and `encoder2Turn`;
- `pot3Push`/`pot3Release`; and
- `encoder2Push`/`encoder2Release`.

Other press callbacks have weaker provenance in the current manifest, and
`button1` through `button4` callbacks are Luading simulator extensions for an
algorithm script. The controls step will therefore have two groups:

1. **Disting NT algorithm controls** lists only manual-backed events and is the
   normal path.
2. **Luading-only control events** is collapsed and off by default. Enabling it
   exposes the additional events with a persistent **Simulator extension**
   badge, a hardware-portability warning in Review, and an adjacent source
   comment in generated Lua.

This lets the user ask for button scaffolding without implying that Manual 1.12
defines those callbacks for a hardware algorithm script. The UI catalog should
reference lifecycle names and provenance in `api-manifest.ts`, with a test that
fails if a selected entry disappears or its provenance changes.

### “Preset” is split into two explicit features

The dialog must not use a single ambiguous **Presets** switch:

- **Named parameter starting points (Luading only)** generates the existing
  `luading.parameterPresets` declaration. These are ordered, named, complete
  parameter vectors for the simulator's preset selector. They are not a full
  Disting preset and are ignored by hardware.
- **Save extra state with the Disting preset** generates a manual-backed
  `serialise(self)` scaffold. Ordinary parameter values are already handled by
  the Disting preset system; this hook is only for additional JSON-friendly
  script state.

The Review step and generated comments repeat the Luading-only label for named
snapshots. Hardware preset persistence does not receive such a label.

## Guided setup flow

The stepper contains seven short steps. **Back**, **Next**, **Skip**, and
**Review** remain in a consistent footer; the final action is available only
from Review. Step labels and position are announced as, for example,
“Step 3 of 7: Outputs.”

### Step 1 — Basics

Fields:

- **Name** — used for the first header comment and returned-table `name`.
- **Short description** — used for the second header comment. It is normalized
  to one comment line because the module reads the first two comments before
  loading the script.
- **Author** — used for returned-table `author`.
- **Filename preview** — derived from the name through the existing
  `luaDownloadFilename()` rules and shown read-only. The project library remains
  authoritative and may add a collision suffix at creation time.

Blank identity fields revert to their defaults on blur and during final
normalization, so none is required. Length guidance is advisory rather than a
new firmware contract. The source generator must escape Lua string values and
must neutralize embedded newlines in the two header comments.

### Step 2 — Inputs

Show an ordered list with add, remove, and keyboard-accessible move controls.
Each row has:

- a name, defaulting to `Input N`; and
- a type: **CV** (`kCV`, default), **Gate** (`kGate`), or **Trigger**
  (`kTrigger`).

Zero inputs is valid. The list is capped at 28, matching the hardware bus
limit. Lua order is display order and becomes the 1-based input index; the UI
does not display or store a separate editable index.

Selecting a gate or trigger automatically causes the corresponding `gate()` or
`trigger()` scaffold to be emitted. This avoids a generated script that
declares edge detection but has no receiver. The callback includes a TODO and
returns the shared sparse output table when outputs exist.

### Step 3 — Outputs

Show the same ordered-list affordances. Each row has:

- a name, defaulting to `Output N`; and
- a mode: **Linear** (`kLinear`, default) or **Stepped** (`kStepped`).

Zero outputs is valid and the list is capped at 28. Help text explains that
linear means firmware interpolation between control updates, while stepped
holds each update; Luading's current interpolation limitation remains linked
to the conformance documentation rather than being hidden by the wizard.

Generated starter behavior is deterministic:

- with at least one input and output, `step()` passes input 1 to output 1;
- with outputs but no inputs, `step()` explicitly initializes output 1 to
  `0.0`;
- with no outputs, `step()` remains a no-return TODO scaffold; and
- additional outputs remain at their prior voltage until the author adds
  sparse assignments, with a comment explaining that retention rule.

The generator must not zero-fill every output on every step because sparse
output retention is part of the firmware contract.

### Step 4 — Parameters

Parameters are an ordered list with two discriminated forms.

**Numeric parameter** fields:

- name, default `Parameter N`;
- minimum, maximum, and default in the value the script will see;
- unit, selected from the manual-backed parameter-unit constants; and
- precision: whole, tenths, hundredths, or thousandths, mapping to no scale,
  `kBy10`, `kBy100`, or `kBy1000`.

The UI works in script-visible values. The generator converts them to the raw
integer fields required by Lua parameter metadata. A value that cannot be
represented exactly at the selected precision is an inline error; it is not
rounded silently.

**Choice parameter** fields:

- name, default `Parameter N`;
- an ordered, non-empty list of choice labels, initially `Off` and `On`; and
- a default choice, stored and emitted as its 1-based index.

Zero parameters is valid. Newly added numeric parameters default to
`0 … 100`, default `50`, unit `kPercent`, and whole precision. Newly added
choice parameters default to `Off`/`On` with `Off` selected.

Inline validation covers finite numbers, integer raw representations,
minimum/maximum order, defaults within range, non-empty names and choices, and
documented unit/scale constants. Duplicate parameter names remain allowed
because the Lua contract allows ordered definitions and the existing named
snapshot schema addresses parameters by index.

### Step 5 — Hardware controls

The default selection is **Use the standard parameter UI**, which emits no
`ui()` override or event callbacks.

Choosing **Build a custom algorithm UI** reveals control events grouped by
physical control:

- Pot 1, Pot 2, Pot 3 turn;
- Encoder 1 and Encoder 2 turn;
- the manual-backed Pot 3 and Encoder 2 push/release pairs; and
- the separately disclosed simulator-extension events.

Selecting any custom control emits `ui(self) -> true` and one stub per selected
event. Selecting any pot turn also emits `setupUi()` with valid normalized
default positions so soft takeover has a clear starting point. Push/release
pairs are selected together in the simple UI; an advanced expander may split
them for authors who need only one edge.

The step warns that opting into custom UI replaces standard parameter-control
behavior; the generated TODOs do not automatically manipulate parameters.

### Step 6 — Extras and preset behavior

All options default off.

#### Custom display

**Add a `draw()` callback** emits a minimal `drawText()` example using the
script name and returns `true` only when the user selects **Use the whole
display**. The default custom-display choice retains the standard parameter
line by returning nothing.

#### MIDI input

**Receive MIDI** reveals:

- manual-backed message filters: note, CC, bend, aftertouch, poly pressure,
  and program change; and
- a channel-parameter selector.

At least one message type is required after MIDI is enabled. The channel
selector can point to an existing compatible whole-number parameter spanning
`0 … 16`, or choose **Add MIDI Channel parameter**, which inserts
`{ "MIDI Channel", 0, 16, 0 }` and keeps a stable draft ID reference if rows are
reordered. Removing or changing a referenced parameter creates an actionable
cross-step error; it never silently changes the index. Generation converts the
stable reference to the final 1-based parameter index and emits a
`midiMessage(self, message)` TODO callback.

MIDI output and browser Web MIDI routing are out of scope; those are not script
scaffold metadata.

#### Named parameter starting points

This option is disabled, with an explanation, until at least one parameter
exists. Each snapshot has a unique non-empty name and one value editor per
parameter. A new snapshot starts with every parameter's declared default.
Numeric values use script-visible scaled values; choices use a dropdown but
generate their 1-based indices.

Removing or reordering parameters updates snapshots by stable draft ID. A
snapshot cannot be partial. Generated Lua uses the existing ordered
`luading.parameterPresets` shape and includes a nearby
`-- Luading simulator extension` comment.

#### Additional saved state

**Save extra state with the Disting preset** emits a valid `serialise(self)`
callback returning an empty table with comments showing where JSON-friendly
numbers, strings, booleans, tables, and arrays belong. It also adds an `init()`
comment noting that restored `self.state` is available before `init()` runs.
It does not invent state fields or imply that browser workspace state is saved.

### Step 7 — Review and create

Review shows:

- the final allocated filename preview;
- counts and types for inputs, outputs, and parameters;
- selected lifecycle callbacks and controls;
- separate **Disting NT** and **Luading extension** feature summaries;
- all validation errors as links that return to the relevant step and focus the
  field; and
- a read-only, selectable Lua source preview generated by the same function
  used on submission.

The primary action is **Create script**. On activation:

1. normalize and validate the draft once more;
2. generate filename and source deterministically;
3. call the project library's existing protected creation path;
4. keep the dialog open if replacement is declined or validation fails; and
5. close it only after the project library reports that the new in-memory
   project became active.

As today, a storage failure may still leave an explicitly degraded or unsaved
in-memory project. The dialog closes because creation succeeded; the existing
save-status UI communicates the durability result.

## Draft, validation, and generation model

Add pure workbench types along these lines:

```ts
type ScaffoldInputKind = 'cv' | 'gate' | 'trigger'
type ScaffoldOutputKind = 'linear' | 'stepped'
type ScaffoldPrecision = 1 | 10 | 100 | 1000

type ScaffoldParameter =
  | {
      id: string
      kind: 'numeric'
      name: string
      minimum: number
      maximum: number
      defaultValue: number
      unit: DistingParameterUnitName
      precision: ScaffoldPrecision
    }
  | {
      id: string
      kind: 'choice'
      name: string
      choices: Array<{ id: string; label: string }>
      defaultChoiceId: string
    }

interface ScriptScaffoldDraft {
  version: 1
  scriptKind: 'algorithm'
  name: string
  description: string
  author: string
  inputs: Array<{ id: string; name: string; kind: ScaffoldInputKind }>
  outputs: Array<{ id: string; name: string; kind: ScaffoldOutputKind }>
  parameters: ScaffoldParameter[]
  controls: {
    customUi: boolean
    callbacks: DistingLifecycleName[]
    allowSimulatorExtensions: boolean
  }
  extras: {
    display: 'standard' | 'custom-with-parameter-line' | 'custom-full'
    midi?: { parameterId: string; messages: DistingMidiMessageType[] }
    serialise: boolean
    parameterPresets: Array<{
      id: string
      name: string
      valuesByParameterId: Record<string, number>
    }>
  }
}
```

Exact exported types can be smaller, but the following properties are
non-negotiable:

- collection members have stable UI IDs;
- the model never treats a TypeScript array position as a Lua index until
  generation;
- cross-step references use IDs, not mutable array offsets;
- simulator-extension consent is explicit; and
- the version field makes an eventual persisted/shareable draft format
  possible without implying that drafts are persisted now.

Use a pure reducer or equivalent immutable update helpers for adding, removing,
reordering, and changing discriminated rows. Keep normalization and validation
out of React so tests can exercise all dependencies without rendering the
dialog.

Proposed pure API:

```ts
createDefaultScriptScaffold(): ScriptScaffoldDraft
normalizeScriptScaffold(draft): ScriptScaffoldDraft
validateScriptScaffold(draft): ScaffoldFinding[]
generateScriptScaffold(draft): {
  ok: true
  filename: string
  source: string
  summary: ScaffoldSummary
} | {
  ok: false
  findings: ScaffoldFinding[]
}
```

`generateScriptScaffold()` normalizes and validates defensively, returning a
discriminated failure instead of throwing from the React event handler. Its
successful output supplies both Review and final creation.

### Source-generation rules

- Output is deterministic for equal semantic drafts. Draft-only IDs never
  appear in Lua.
- The first two source lines are always the normalized name and description
  comments expected by the module.
- Every user string passes through one Lua quoted-string encoder. Cover quotes,
  backslashes, control characters, Unicode, comment markers, and newlines.
- Metadata tables use ordered dense Lua sequences. Generated indexes are
  1-based only in source.
- `inputs`, `outputs`, names, parameters, MIDI, and `luading` are omitted when
  their feature is absent instead of emitting meaningless empty structures.
- Type constants and lifecycle callback names come from a curated catalog
  checked against `api-manifest.ts`; arbitrary user text can never become a Lua
  identifier or constant.
- Numeric parameter raw values are integers. Scale constants are emitted only
  when precision is not whole. `kNone` may be omitted only when doing so remains
  unambiguous and keeps generated style consistent.
- A shared local `outputs` table is emitted only when at least one output
  exists. Edge and step callbacks return it sparsely.
- Gate and trigger callbacks are emitted exactly once when their matching input
  kind exists.
- Custom UI callbacks are emitted only when `ui()` returns true.
- `luading.parameterPresets` is emitted only with at least one valid snapshot
  and carries a simulator-extension comment.
- TODO comments explain where author logic belongs without claiming that a
  placeholder implements that behavior.
- The result must compile in Lua 5.4, pass static validation without errors,
  pass raw contract validation without errors, and load through the production
  Wasmoon bridge.

## Component and ownership design

Add focused files under `src/disting/workbench/`:

- `script-scaffold.ts` — types, defaults, catalog mapping, normalization,
  validation, Lua escaping, generator, and summaries;
- `script-scaffold.test.ts` — pure and real-Wasmoon generator tests;
- `NewScriptDialog.tsx` — modal shell, path selection, stepper, review, and
  submit state;
- `new-script-dialog-model.test.ts` or co-located tests — reducer, cross-step
  dependencies, and validation navigation; and
- `new-script-dialog-rendering.test.tsx` — semantic structure and accessible
  labels/states.

If `NewScriptDialog.tsx` becomes difficult to scan, split presentation by step
only after the shared draft model is stable. Do not create one state owner per
step.

Integration changes:

- `ScriptFileActions.tsx` owns the New-button ref and dialog open/closed state.
  It receives active project filenames for the collision-aware preview. Import
  and Export remain unchanged.
- `CommandBar.tsx` accepts an async `onCreateScript(scaffold)` callback instead
  of an immediate no-argument New action.
- `DistingPlayground.tsx` generates the final source, clears file errors, and
  awaits protected project creation.
- `useProjectLibrary.ts` accepts caller-provided generated filename/source for
  the `new` origin while retaining the existing allocation, replacement,
  journal, storage, and activation path. It does not import wizard UI types.
- `script-file.ts` retains import/export filename helpers. The quick-start
  constant should be derived from or tested against the default generator so
  there is one canonical scaffold.
- `workbench.css` supplies modal, stepper, row-editor, compatibility badge,
  review, source-preview, narrow-height, and narrow-width styles using existing
  workbench tokens.

No change is planned for `disting.worker.ts`, `src/disting/types.ts`, IndexedDB
records, backups, recovery journals, `api-manifest.ts` support claims, or the
simulation protocol.

## Dialog behavior and accessibility

Use a true modal dialog rather than stretching `ControlPopover` beyond its
anchored-popover role. Prefer the platform `<dialog>` element with
`showModal()` and a portal, provided the supported-browser check confirms
consistent behavior. Otherwise implement equivalent `role="dialog"`,
`aria-modal="true"`, backdrop, and focus containment explicitly.

Required behavior:

- `aria-labelledby` references the visible title and `aria-describedby`
  references a concise explanation;
- opening focuses the selected path's first useful control;
- Tab and Shift+Tab stay within the modal;
- Escape and the close button cancel and discard the draft;
- closing returns focus to the **New** button;
- step navigation moves focus to the new step heading or first invalid field;
- add/remove/reorder buttons include the entity name and position in their
  accessible names;
- errors are connected to fields with `aria-describedby` and summarized in an
  assertive region only after attempted navigation or submission;
- source preview is keyboard selectable but not an editable second editor;
- compatibility status is conveyed in text, not color alone;
- the body does not scroll behind the dialog;
- reduced motion removes step transitions; and
- at narrow widths or short viewport heights the dialog becomes a single
  scrolling column with a sticky, non-overlapping footer.

Clicking the backdrop may cancel because the draft is intentionally transient,
but it must not submit. If testing shows accidental cancellation is too easy on
touch screens, keep backdrop clicks inert and rely on Escape/Close.

## Validation and error presentation

`ScaffoldFinding` should contain a stable code, severity, step, optional entity
ID/field, and human-readable correction. It is a dialog model, not a
`ScriptDiagnostic`: scaffold findings must not enter Problems, quality scoring,
or source-version navigation before a source exists.

Errors block Review creation for:

- more than 28 inputs or outputs;
- invalid explicit names or empty enum choices;
- non-finite or unrepresentable numeric parameter values;
- invalid min/default/max relationships;
- a broken MIDI channel-parameter reference or no MIDI message selection;
- duplicate or empty named-snapshot names;
- missing, out-of-range, or invalid snapshot values; or
- a simulator-only callback selected without explicit extension consent.

Informational notes cover default substitution, sparse output behavior,
standard-vs-custom UI, and provenance. They do not create false validation
noise in the editor after generation.

## Implementation increments

Each increment ends with its focused tests before the next begins.

### Increment 1 — Pure scaffold contract and quick-start parity

1. Add the draft types, defaults, curated constant/callback catalog, Lua string
   encoder, normalization, validation, and deterministic generator.
2. Generate the existing simple script from the default draft and preserve its
   working pass-through semantics.
3. Add pure tests plus a production Wasmoon-boundary test for default output.
4. Test catalog entries against `api-manifest.ts` names, categories, and
   provenance.

Focused command:

```bash
npx vitest run src/disting/workbench/script-scaffold.test.ts
```

### Increment 2 — Project-creation seam

1. Extend the project-library `createNew` boundary to accept generated filename
   and source without teaching it scaffold concepts.
2. Retain flush-before-replace, unsaved confirmation, collision allocation,
   recovery journaling, and degraded-storage behavior.
3. Add hook tests for accepted creation, declined replacement, colliding names,
   and storage failure.

Focused command:

```bash
npx vitest run src/disting/workbench/useProjectLibrary.test.tsx src/disting/workbench/projects.test.ts
```

### Increment 3 — Modal shell and quick path

1. Wire **New** to the modal without creating or replacing a project on open.
2. Implement Quick start identity fields, default summary, cancel, async submit,
   double-submit protection, and focus restoration.
3. Add accessible rendering and interactive DOM tests.

Focused command:

```bash
npx vitest run src/disting/workbench/new-script-dialog-rendering.test.tsx src/disting/workbench/command-bar-rendering.test.tsx
```

### Increment 4 — Guided I/O and parameter steps

1. Add immutable row operations and navigation for Basics, Inputs, Outputs, and
   Parameters.
2. Implement inline/cross-row validation, exact scale conversion, and Review
   navigation.
3. Add generator cases for zero I/O, all I/O types, numeric units/scales,
   enums, reorder/remove operations, and hostile string content.
4. Load representative generated outputs through Wasmoon and run static/raw
   contract validation.

Focused command:

```bash
npx vitest run src/disting/workbench/script-scaffold.test.ts src/disting/workbench/new-script-dialog-model.test.ts
```

### Increment 5 — Controls, MIDI, state, and parameter snapshots

1. Add documented custom-UI choices and clearly separated simulator-extension
   controls.
2. Add display, MIDI, `serialise()`, and named-snapshot editors.
3. Implement stable parameter references and dependent-value migration during
   reorder/remove/type changes.
4. Validate generated snapshots with the production parameter-preset parser and
   generated MIDI with the production contract validator.
5. Add provenance/disclosure rendering tests.

Focused command:

```bash
npx vitest run src/disting/workbench/script-scaffold.test.ts src/disting/emulation/parameter-presets.test.ts src/disting/validation/contract-validator.test.ts
```

### Increment 6 — Responsive polish, documentation, and release verification

1. Complete desktop, touch-density, narrow-width, short-height, light/dark, and
   reduced-motion styling.
2. Update `docs/WORKBENCH_GUIDE.md` with both creation paths, defaults,
   provenance labels, and transient-draft behavior.
3. Update `docs/TESTING.md` with the generator/Wasmoon guarantee and the modal's
   remaining browser-only acceptance scope.
4. Update this plan's status as increments land; when complete, archive it with
   a dated historical banner and update `docs/README.md`.
5. Run complete automated and live acceptance.

## Automated verification matrix

### Pure generator/model tests

- Default draft produces the pinned quick-start source and filename.
- Equal semantic drafts produce byte-identical Lua regardless of UI-only IDs.
- Blank optional identity values normalize to valid defaults.
- Zero inputs, outputs, and parameters generate a valid script.
- Twenty-eight inputs/outputs are accepted; twenty-nine are rejected.
- CV, gate, trigger, linear, and stepped constants map correctly and in order.
- Gate/trigger declarations add only their matching callbacks.
- Sparse-output comments and starter assignments do not zero-fill all outputs.
- Numeric parameters cover every manual-backed unit and all four precisions.
- Inexact scaled values, infinities, `NaN`, inverted ranges, and out-of-range
  defaults are rejected.
- Choice add/remove/reorder keeps the selected default by stable ID and emits a
  1-based default.
- Quotes, slashes, newlines, tabs, Unicode, `--`, and long-comment markers in
  every user string cannot break or inject Lua.
- Parameter reorder keeps MIDI and snapshot values attached to parameter IDs.
- Removing a referenced parameter creates a targeted error.
- Simulator-only callbacks require consent and produce source/UI disclosures.
- `draw()`, MIDI, `serialise()`, and `luading.parameterPresets` are omitted when
  disabled and valid when enabled.

### Lua-boundary and validation tests

Use `createDistingLuaTestEngine()` and `loadLuaProgramRuntime()` for a focused
representative matrix:

- quick-start pass-through;
- zero-I/O script;
- mixed CV/gate/trigger and stepped/linear I/O;
- numeric and choice parameters, including scaled values;
- custom algorithm UI with documented events;
- explicitly enabled simulator-only button event;
- MIDI receive with an auto-added channel parameter;
- saved-state and custom-display callbacks; and
- multiple named parameter snapshots.

For each applicable case, assert Lua compilation, expected raw `init()` shape,
no blocking contract diagnostics, no static errors, callback invocation through
the production bridge, and clean runtime closure. Parse named snapshots through
the production extension parser rather than duplicating its rules in the test.

### React and project integration tests

- **New** opens the dialog and does not replace the active document.
- Quick start can create without changing any field.
- Cancel, Escape, and close create nothing and restore New-button focus.
- Switching Quick/Guided preserves the draft only within the open session.
- Back/Next/Skip/Review expose correct step semantics and focus movement.
- Add/remove/reorder controls retain values and have specific accessible names.
- Invalid rows block creation and Review links focus the failing field.
- Submit is disabled while the async project creation is pending.
- Declining the existing unsaved-source confirmation keeps the dialog and old
  document open.
- A filename collision shows and creates the allocated suffix.
- A storage failure creates the same explicit degraded/unsaved state as current
  New behavior.
- Successful creation closes the dialog, activates the new project, and lets
  the existing coordinator load it.
- Import and Export behavior remains unchanged.

## Live browser acceptance

Record browser version, viewport, theme, density, input method, and result for:

| Scenario | Chromium | Firefox | Safari |
| --- | --- | --- | --- |
| Quick start with defaults | Required | Required | Required |
| Complete guided path | Required | Required | Required |
| Keyboard-only open, step, reorder, submit, cancel | Required | Required | Required |
| Focus containment and return | Required | Required | Required |
| Screen-reader title, step, error, and provenance announcements | Required on one available platform | Best effort | Best effort |
| 320 px narrow layout | Required | Required | Required |
| Short viewport with on-screen keyboard risk | Required | Best effort | Required |
| Touch-density add/remove/reorder | Required | Best effort | Required |
| Light/dark and reduced motion | Required | Required | Required |
| Declined unsaved replacement | Required | Required | Required |

Also create representative scripts, reload the page, select them from **My
Scripts**, run them, and export them. These checks validate browser workflow and
generated-source integration, not behavior on physical Disting NT hardware.
Any unavailable cell is reported exactly rather than implied complete.

## Required final commands

Because generated source uses the public Lua contract, run conformance even
though no runtime behavior is intended to change:

```bash
npm run test:conformance
npm test
npm run check
```

Do not describe the implementation as complete while any required command is
failing. No corpus behavior should change; if the generator work requires a
runtime or contract change after all, run the bundled corpus-focused tests in
the same increment and document why the boundary expanded.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| The wizard implies unsupported hardware button behavior | Separate manual-backed and simulator-only controls, require explicit consent, and annotate Review/source. |
| Quick and guided templates drift | One default draft and one generator; golden parity test. |
| User strings inject invalid Lua | One thoroughly tested quoted-string encoder and one-line header normalization. |
| Parameter scaling silently changes values | Edit script-visible values, require exact raw integer representation, and never round silently. |
| Reordering breaks MIDI/preset references | Stable draft IDs; convert to 1-based indexes only during generation. |
| Optional sections create invalid partial metadata | Valid defaults on add, local errors on explicit invalid edits, final full validation. |
| Generated stubs look like completed logic | Clear TODOs and summaries; implement only the default pass-through behavior. |
| Modal is unusable on small/touch layouts | Single-column scroll, sticky footer, touch-size controls, live matrix. |
| Opening New loses unsaved work | Do not replace on open; reuse `mayReplace()` only on final creation. |
| Scope grows into a visual programming system | One-way source generation; no parsing, regeneration, graph editor, or persistent draft in version one. |

## Non-goals

- Parsing an existing Lua script back into wizard fields.
- Reopening or editing the scaffold metadata after creation.
- Generating complete DSP, musical behavior, drawing, or state models from
  prose.
- Generating or configuring browser signal sources, Web MIDI routes, Web Audio,
  preset bus routing, or companion algorithms.
- Creating UI scripts or helper-module bundles in version one.
- Claiming that a simulator-only callback or named snapshot runs on hardware.
- Replacing editor validation; the generated source continues through the
  ordinary validation and load paths.

## Completion criteria

The scaffolder is complete when:

- **New** opens the modal and both Quick start and Guided setup work without a
  required decision;
- the default result preserves the current minimal working script behavior;
- every exposed manual-backed choice generates valid, appropriately typed Lua;
- simulator extensions are opt-in and visibly labelled in the dialog, Review,
  and generated source;
- project replacement, allocation, storage, recovery, autosave, and loading
  retain their existing behavior;
- focused pure, React, project, static, contract, and real-Wasmoon tests cover
  the changed behavior;
- the workbench and testing documentation reflects the shipped experience;
- required live-browser results and any unavailable matrix cells are recorded;
  and
- `npm run test:conformance`, `npm test`, and `npm run check` pass.
