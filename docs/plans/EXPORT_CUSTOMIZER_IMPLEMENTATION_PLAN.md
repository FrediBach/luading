# Export customizer implementation plan

## Status

Proposed on 2026-08-04. No behavior described by this document is implemented
until the relevant increment and its verification have landed.

## Goal

Add an OpenSCAD-customizer-like workflow for values that are awkward or
impossible to enter on Disting NT hardware, while keeping the editor, saved
project source, and live simulation unchanged.

A script author will mark a literal as export-customizable with a Luading-only
comment. When a user exports that script, Luading will present an appropriate
control, build a separate hardware-bound copy with the chosen value, optionally
preflight that generated copy in an isolated worker, and download it. The
customized value exists in the downloaded `.lua` file only; it is never written
back into Monaco, autosaved source, the active Lua VM, or the normal validation
version.

The first concrete use is the bundled **Strudel Mini Notation Player**. A user
will be able to paste a mini-notation pattern into a multiline field and export
a self-contained player whose `MINI_NOTATION` constant contains that pattern.
The downloaded script will need no browser helper or companion file when copied
to the module.

## User promise

After this work lands:

- scripts without export-customizer annotations keep today's one-click,
  byte-for-byte Export behavior;
- scripts with valid annotations offer a dedicated **Customize export** dialog;
- editing a customizer field does not change the editor text, dirty or fork a
  project, trigger autosave, reload the live worker, or alter the running sound;
- **Export original** always downloads the exact current editor source;
- **Export customized** changes only the annotated literal spans in a separate
  in-memory string and downloads it under the active script filename;
- arbitrary user text cannot escape its Lua literal and inject source around
  the annotated declaration;
- the generated copy can be checked through a fresh, non-running simulation
  worker without replacing or pausing the live simulation;
- a failed simulator preflight is explained and can be overridden explicitly,
  because simulator support is not universal hardware proof; and
- imported customized files remain ordinary, valid Lua files and can expose
  the same customizer again because their annotations remain in place.

The customizer is a browser authoring/export convenience. Disting NT does not
interpret the annotation, know about the dialog, or receive a new global API.
Only the resulting ordinary Lua literal has meaning on hardware.

## Product decisions

### Export-only means no live-source mutation

- The authoritative project source remains the current Monaco model and normal
  project-library source.
- Customizer input is separate main-thread draft state. It is not applied as a
  Monaco edit, a diagnostic quick fix, or a temporary project revision.
- The live simulation worker continues to run the source visible in the editor.
  It never receives customizer keystrokes or a customized source load.
- The generated source exists only long enough to preflight and create the
  download Blob. It is not silently imported, selected, or stored as a project.
- Closing the dialog and reopening it for the same document/source version may
  retain the in-memory draft for convenience. Switching documents, editing the
  source, or reloading the page discards it.
- Version one does not add IndexedDB fields, database migrations, recovery
  journal entries, or backup fields for export drafts. Named/persistent export
  profiles can be considered later without weakening the source boundary.

### Preserve normal Export as an explicit escape hatch

- With no recognized fields, the existing Export button immediately downloads
  the exact editor source through `createLuaScriptDownload()`.
- With at least one recognized field, Export opens the customizer dialog.
- **Export original** in that dialog calls the existing byte-for-byte path.
- **Export customized** uses the generated source. When every chosen value is
  identical to its decoded source default, it deliberately falls back to the
  byte-for-byte original source rather than needlessly reserializing literals.
- The active sanitized filename remains the default download filename for both
  paths. Version one does not silently add `-customized` or rename a hardware
  script.

### Start with text, design for later control kinds

Version one supports one field kind: `text`. This directly solves the mini-
notation use case and the broader class of long labels, lookup data, templates,
and other string constants that do not fit hardware parameters.

The normalized model uses a discriminated `kind` so future increments can add
finite numbers, booleans, choices, or files without changing how fields bind to
source spans. Those controls are not included now: ordinary finite numeric and
enum choices are usually better represented as real Disting parameters unless
they genuinely configure load-time structure.

### Use comments plus valid Lua literals

The annotation is a single-line Lua comment immediately above a top-level local
assignment. Its payload is strict JSON so quoting and future schema evolution
are deterministic:

```lua
-- @luading-export {"version":1,"id":"mini-notation","label":"Mini notation","kind":"text","description":"One Strudel cycle is a four-beat bar.","rows":9,"maxLength":4096}
local MINI_NOTATION = [==[<
  [c4 [d4 e4]*2 ~ f4]
  [g3,b3,e4]
>*2]==]
```

The directive is intentionally not a returned `luading` table member:

- discovery must not execute an untrusted chunk;
- a table describes values but cannot safely identify the exact source span to
  replace;
- retaining UI metadata in a runtime table would add avoidable memory and
  table-conversion work to the hardware-bound script; and
- a comment is ignored by both Lua and Disting firmware while remaining
  available to the browser exporter.

Placeholder syntax that makes the editor source invalid, arbitrary template
expressions, regular-expression replacement, and identifier-wide replacement
are rejected approaches. The editor source must always be runnable Lua, and the
exporter must replace one scanner-proven literal token only.

## Version-one annotation contract

### Directive fields

The JSON object accepts exactly these fields:

| Field | Required | Rules |
| --- | --- | --- |
| `version` | yes | Integer `1`. Unknown versions produce one local warning and no field. |
| `id` | yes | Unique, stable kebab-case identifier matching `[a-z][a-z0-9-]{0,63}`. |
| `label` | yes | Trimmed visible label, 1-80 Unicode characters. |
| `kind` | yes | Exactly `"text"` in version one. |
| `description` | no | Trimmed help text, at most 240 characters. |
| `rows` | no | Integer 2-20; defaults to `6`. It is a presentation hint, not a value limit. |
| `maxLength` | no | Integer 1-65,536; defaults to `4,096`. It limits Unicode code points. |

Unknown keys produce a warning and omit that field rather than silently
ignoring a typo. JSON must remain on the directive's one physical line; a long
description should be concise rather than spread across comment lines.

`maxLength` is a workbench resource bound, not a claim that every value below it
will fit Disting NT memory. The dialog also reports UTF-8 byte length and states
that hardware storage/memory limits still depend on the complete script and
firmware.

### Binding rules

A directive is recognized only when all of these conditions hold:

1. it is a normal `--` line comment, not text inside a string or long comment;
2. it is at Lua chunk scope;
3. the next non-empty source line is exactly one top-level declaration shaped
   as `local IDENTIFIER = STRING_LITERAL`, with an optional trailing comment;
4. the initializer is one standalone short-quoted or long-bracket Lua string,
   not concatenation, a function call, interpolation, multiple assignment, or
   a table field; and
5. neither the directive span nor literal span overlaps another field.

Requiring a direct top-level local makes the replacement reviewable on the
module and avoids changing a shadowed local or a value selected dynamically at
runtime. An author can assign that local into tables or use it from callbacks
normally after the declaration.

The directive stays attached to the literal in the exported file. Because the
exporter accepts both quoted and long-bracket strings, a customized file can be
imported and customized again even if safe serialization chose a different Lua
string form.

### Text-value rules

- The displayed default is the literal's actual decoded Lua string, not its raw
  quotes or long-bracket delimiters.
- Long-bracket decoding follows Lua's initial-newline rule and newline
  normalization so the field shows the value the script receives.
- Short-string decoding supports the Lua 5.4 escapes needed to reproduce the
  literal exactly. An invalid escape is a malformed declaration and is never
  guessed.
- User input may contain quotes, brackets, equals signs, backslashes, newlines,
  non-ASCII text, and strings resembling Lua source.
- NUL, unpaired UTF-16 surrogates, and values beyond `maxLength` are rejected
  with an inline error. They are not truncated.
- The exporter normalizes user-entered textarea newlines to LF inside the new
  literal. Every byte outside replaced literal spans retains the source's
  original newline and whitespace bytes.

The Strudel field itself performs only generic text validation. Strudel grammar
errors are discovered by the optional generated-copy preflight, because the
generic customizer must not embed knowledge of one example's language.

## Discovery, diagnostics, and source versions

### Reusable source scanner

`source-index.ts` already scans Lua comments, quoted strings, long-bracket
strings, identifiers, and balanced blocks, but its token scanner is private and
discards comments. Extract the scanner primitives into a pure
`src/disting/validation/lua-source-scanner.ts` before adding customizer logic.

The shared scanner should expose immutable token/comment spans and completeness
without turning the source index into a general Lua parser. Existing source-
index output must remain byte-for-byte equivalent for the corpus after the
extraction.

Add `src/disting/validation/export-customizer.ts` with pure discovery and
normalization:

```ts
interface ExportTextCustomizerField {
  kind: 'text'
  id: string
  label: string
  description?: string
  variableName: string
  defaultValue: string
  rows: number
  maxLength: number
  directiveRange: SourceRange
  valueRange: SourceRange
  valueStartOffset: number
  valueEndOffset: number
  originalLiteral: string
}

interface ExportCustomizerDiscovery {
  sourceVersion: number
  complete: boolean
  fields: ExportTextCustomizerField[]
  diagnostics: ScriptDiagnostic[]
}
```

Offsets are UTF-16 source-string offsets used only against the exact source
version that produced them. User-visible locations remain 1-based ranges.
Returned arrays and values are defensive copies in source order.

### Validation-worker result

Run discovery beside syntax validation and source indexing in
`validation.worker.ts`. Extend `ValidationWorkerResponse` with the normalized
customizer discovery. `DistingPlayground` accepts it only through the existing
current-version check and clears it immediately on a source edit or document
replacement.

On an Export click while validation is still pending, synchronously run the
same pure discovery function against `sourceRef.current` and the current
version. This keeps Export available without accepting stale worker offsets.

Malformed directives produce stable `export-customizer-*` diagnostics with:

- `origin: 'static'`;
- `target: 'local'`;
- severity `warning`;
- category `clarity`;
- zero score penalty; and
- the narrowest directive or literal range available.

Valid independent fields remain available when another directive is malformed.
A malformed field is omitted; it is never exported with a guessed target.
Warnings may appear in Problems and the dialog, but never block the otherwise
valid script from loading or running. Add no entry to `api-manifest.ts`, because
the directive is not a Disting global, constant, callback, or Lua metadata
field.

## Safe export transformation

Add `src/disting/workbench/export-customizer.ts` for value validation, Lua
literal serialization, and source transformation. Keep DOM download mechanics
in `script-file.ts`/`DistingPlayground`; the transformer itself remains pure.

The primary operation should make all required evidence explicit:

```ts
interface ExportCustomizerSelection {
  id: string
  value: string
}

interface CustomizedExportResult {
  source: string
  changedFieldIds: string[]
  utf8Bytes: number
}

function createCustomizedExport(
  source: string,
  sourceVersion: number,
  discovery: ExportCustomizerDiscovery,
  selections: readonly ExportCustomizerSelection[],
): CustomizedExportResult
```

Before replacing anything, it must verify:

- discovery version equals the current source version;
- every field ID is known exactly once and every declared field has one
  selection;
- every selected value passes its field bounds;
- spans are ordered, in range, and non-overlapping; and
- `source.slice(valueStartOffset, valueEndOffset) === originalLiteral` for every
  field.

Any mismatch aborts transformation with a local error and asks the user to
close/reopen the dialog. It must never fall back to searching for an identifier
or the old value.

Apply replacements from the highest offset to the lowest so earlier spans stay
stable. Outside those spans, the output string must equal the input exactly.

### Lua string serialization

Implement and test one canonical `serializeLuaString()` boundary:

1. Prefer a readable long-bracket literal when it represents the value exactly.
2. Choose the smallest equals-sign depth whose closing delimiter does not occur
   in the value; never assume `[=[...]=]` is safe.
3. Account for Lua's ignored newline immediately after a long-bracket opener.
   If a value starts with a newline or contains controls unsuitable for that
   form, use a quoted literal with explicit Lua escapes.
4. Escape quotes, backslashes, newlines, carriage returns, tabs, and remaining
   control bytes deterministically in quoted form.
5. Verify through real Wasmoon tests that evaluating the emitted literal returns
   the exact original JavaScript string.

This serializer, rather than input filtering, is the injection boundary. A
pattern containing `]==]`, `"; os.execute(...)`, or another directive must
remain data when the generated script runs.

## Customized-copy preflight

The dialog offers **Check and export** as its primary customized action.
Preflight uses a disposable instance of the existing production simulation
worker:

1. generate the customized source entirely in memory;
2. create a fresh worker that is distinct from `workerRef.current`;
3. after `ready`, send `load` with generated source, the active document's
   module snapshot, and no restored state;
4. do not send `start`, browser routes, MIDI port identities, input-generator
   edits, or saved state;
5. accept `loaded` or `error` only from that owned worker and while the source
   version and customization-run ID are current; and
6. terminate the worker on success, failure, cancel, source/document change,
   timeout, dialog close, or component unmount.

This reuses production chunk evaluation, `init()`, raw contract validation,
module loading, and adapter registration. It catches Lua errors and domain
parsers that run during `init()`, including malformed Strudel notation, without
resetting the live VM. Hardware-event messages from the disposable worker are
captured as preflight details and never forwarded to Web MIDI, Web Audio, the
live Console, or physical devices.

A successful check means only that the generated copy initialized in the
current Luading simulator. It is not hardware conformance or a memory-capacity
guarantee.

If preflight fails or exceeds the existing bounded initialization timeout, the
dialog shows the error and does not download automatically. It then offers
**Export anyway** as an explicit secondary action because an unsupported or
approximate simulator adapter must not become an authority that forbids a
potentially valid hardware script. Syntax/serializer invariant failures are
not overridable; those indicate Luading could not safely construct a file.

Repeated preflight of unchanged source and values may reuse the result while
the dialog remains open. Any field edit invalidates that result. Only one
preflight worker may exist at a time.

## Workbench experience

### Entry point and dialog

Keep the command-bar action labelled **Export**. Its tooltip becomes
**Export Lua script** for ordinary source and **Customize and export Lua
script** when fields are available. Do not add another permanent command-bar
button.

The dialog contains:

- the active filename and a clear **Export customization** heading;
- a short statement that values affect the downloaded copy only;
- one field section per declaration in source order;
- a labelled textarea, description, character/UTF-8 byte count, and reset
  control for each version-one text field;
- **Reset all to source**, **Export original**, **Cancel**, and **Check and
  export** actions;
- preflight progress and success/failure text; and
- a compact list of malformed annotations, with source-navigation actions when
  ranges are current.

The field's initial value is its decoded source default. The reset action always
returns to that source value, not to a prior successful export. The dialog
shows how many fields differ from source and disables customized export when a
field is invalid.

Use an accessible modal-dialog pattern with a labelled description, focus moved
to the first field, trapped Tab navigation, Escape/Cancel handling, and focus
returned to Export. Status uses a polite live region. Errors are associated
with their fields and use text/icons in addition to color. Large text, narrow
viewports, touch/coarse pointers, reduced motion, multiline paste, and keyboard-
only operation are required acceptance cases.

If discovery contains warnings but no valid fields, Export still downloads the
original source and surfaces a concise console/Problems notice. It must not open
an empty modal or silently guess author intent.

### Draft lifetime

`DistingPlayground` owns a small draft keyed by active document identity and
source version. Closing and reopening the modal within that version restores
the entered values. A source edit or document replacement clears the discovery,
draft, preflight state, and generated source together.

Successful export does not clear the draft immediately, allowing a user to
make several hardware variants during the same session. No status may call it
“saved,” because it is neither project source nor durable storage.

## State ownership and failure containment

| State | Owner | Must not affect |
| --- | --- | --- |
| Directive discovery and spans | Validation result for one source version; synchronous pure fallback on Export | Lua VM, project source, hardware contract |
| Dialog values and dirty comparison | Main-thread export-customizer coordinator | Monaco undo stack, autosave revision, live worker |
| Generated source | Ephemeral main-thread string | Project store, recovery journal, editor model |
| Preflight VM and result | Disposable simulation worker plus main-thread run identity | Live simulation worker, routes, traces, console, saved state |
| Download Blob and URL | Main thread | Worker protocol and Lua API |

Failure handling is fail-closed at the transformation boundary:

- stale or mismatched spans produce no customized file;
- malformed directives never produce fields;
- invalid input produces no generated source or preflight worker;
- worker startup/load failure leaves the live worker untouched;
- cancel and unmount terminate the disposable worker and revoke any created
  object URL; and
- failure to create/click the download is reported through the existing file
  error and Console path without altering the project.

## Strudel Mini Notation Player migration

Annotate only the existing `MINI_NOTATION` local. Do not turn the notation into
a Disting parameter, `self.state`, module dependency, or `luading` runtime
field.

The bundled script changes should include:

- the version-one `@luading-export` directive with a descriptive label,
  multiline row hint, and bounded length;
- delimiter layout that makes the visible source default match the decoded
  field value without a confusing structural blank line;
- display/help text that says the pattern is export-customizable rather than
  permanently hardcoded; and
- unchanged parser, scheduler, output, parameter, preset, and serialization
  behavior for the bundled default pattern.

Replace the regex-based `sourceWithPattern()` helper in
`strudel-mini-player.test.ts` with the production discovery and transformation
functions. That turns every existing alternate-pattern case into a regression
test for the real export path before the generated script crosses Wasmoon.

Add focused assertions that:

- the bundle exposes exactly one field with ID `mini-notation`;
- its decoded default recreates the current stress pattern;
- exporting a representative user pattern leaves the bundled source constant;
- the transformed copy passes syntax, `init()`, contract validation, and
  expected scheduling behavior through the real Lua boundary; and
- a malformed pattern reaches the script's bounded parser error during
  preflight instead of becoming a transformer error.

## Implementation increments and required tests

Tests are mandatory after every coherent increment.

### 1. Shared scanner extraction and directive discovery

- Extract the existing lexical scanner without changing source-index output.
- Add line-comment spans and chunk/block-depth information needed by directive
  binding.
- Implement strict JSON schema validation, top-level declaration binding,
  short/long string decoding, normalized fields, and local diagnostics.
- Add discovery to the versioned validation response and clear it on edits.

Focused coverage must include comments versus strings/long comments, CRLF and
LF, every long-bracket equals depth, escaped quoted strings, top-level versus
nested locals, adjacency, multiple assignment, concatenation, computed values,
duplicate IDs, unknown versions/kinds/keys, all bounds, malformed JSON,
incomplete source, independent valid fields beside invalid fields, exact ranges,
defensive copies, and stale response rejection.

Run focused scanner, source-index, validation protocol, syntax/static, score,
and complete bundled source-index corpus tests after this increment.

### 2. Literal serializer and pure transformer

- Add selection validation, canonical Lua string serialization, span
  verification, descending replacement, changed-field reporting, and UTF-8
  byte counts.
- Keep `createLuaScriptDownload()` byte-for-byte for original exports.
- Expose a separate customized-download input rather than changing the helper's
  meaning implicitly.

Focused pure tests must cover zero/one/many replacements, unchanged fallback,
field order versus reverse replacement order, adjacent declarations, stale
versions, missing/duplicate/unknown selections, tampered lexemes, overlap,
length boundaries, NUL/surrogate rejection, quotes, slashes, all newline/control
escapes, Unicode, delimiter-looking content at several equals depths, and exact
preservation of every non-literal byte.

Add real Wasmoon boundary tests that evaluate emitted strings and prove exact
round trips for adversarial values. Run focused script-file, transformer,
syntax, and Lua-runtime tests after this increment.

### 3. Export dialog and coordinator

- Add the export-customizer dialog, field model, draft lifecycle, reset paths,
  validation/count presentation, and responsive styles.
- Change the existing Export callback to choose ordinary download, warning-only
  ordinary download, or dialog based on current synchronous discovery.
- Keep draft/generated state separate from project-library and editor state.
- Wire current diagnostic ranges to the existing source-reveal mechanism.

Add pure model and server-rendering tests for no fields, one/multiple fields,
defaults, changed counts, reset, invalid values, warnings, button states,
accessible names/descriptions/errors, live status, original-export callback,
focus-return intent, and narrow layout. Add a coordinator test proving field
edits do not call editor change, project edit/autosave, live-worker postMessage,
or Run/Reload.

Run focused command-bar, script-file, dialog/model, responsive-rendering,
project-library, and storage-durability tests after this increment.

### 4. Isolated generated-copy preflight

- Add a small main-thread preflight controller around a disposable production
  simulation worker.
- Track worker identity, run ID, source version, value revision, timeout,
  cancellation, warnings, success, and failure.
- Ignore/capture all non-load hardware and frame messages; never connect the
  worker to browser adapters.
- Add explicit **Export anyway** behavior after simulator-only failure.

Use an injected fake Worker/controller test to cover ready/load order, no
`start`, correct modules and absent restored state, success, contract warnings,
Lua error, timeout, cancel, field edit, source edit, document change, stale
worker, stale run, double run, dialog close, unmount, and guaranteed terminate.
Where the test environment permits, add a production-worker smoke test;
otherwise record that exact boundary for live browser validation.

Run focused worker protocol/coordinator, Lua runtime, contract, adapter-surface,
and official/project corpus tests after this increment.

### 5. Strudel integration, documentation, and final polish

- Annotate the bundled Strudel constant and update its on-device wording.
- Migrate alternate-pattern tests from regex substitution to the production
  export transformer.
- Add customizer discovery coverage to the bundled-script corpus without
  requiring every script to declare a field.
- Update `WORKBENCH_GUIDE.md` with the authoring schema, user workflow,
  draft lifetime, original/customized distinction, preflight meaning, and
  Strudel example.
- Update `ARCHITECTURE.md` with discovery, main-thread draft ownership,
  ephemeral transformation, disposable-worker preflight, and stale-result
  rules.
- Update `TESTING.md` with scanner/transformer/real-Lua guarantees and the live
  browser matrix.
- Add a clearly labelled simulator-extension row to
  `CONFORMANCE_STATUS.md`; state that the exported ordinary Lua value is the
  only hardware-facing result and that preflight is not hardware evidence.
- Keep `api-manifest.ts` unchanged.
- Keep this plan active until all criteria land. On completion, move it to
  `docs/archive/implementation-plans/`, add a dated historical banner and exact
  verification results, and update `docs/README.md`.

Run focused Strudel, bundled corpus, documentation, and conformance tests after
this increment.

## Live browser and hardware validation

The automated UI layers do not prove focus trapping, clipboard paste, native
download behavior, CSS layout, or real worker startup in browsers. Record this
matrix for Chromium, Firefox, and Safari where available:

- unannotated one-click Export remains byte-for-byte;
- annotated dialog open/close and focus return;
- multiline paste containing quotes and `]==]`;
- reset one/all and repeated same-session variants;
- successful preflight and download;
- malformed Strudel pattern, visible failure, edit, retry, and success;
- explicit Export original and Export anyway;
- edit/document switch during preflight;
- keyboard-only use, large text, narrow viewport, coarse pointer, and reduced
  motion; and
- downloaded file re-import, rediscovery, Run, and second export.

Copy at least one customized Strudel file to real Disting NT hardware when a
module is available. Record firmware version, source pattern, transfer steps,
expected first-cycle events, and observed result. This hardware check supports
the example workflow but does not make the browser customizer a firmware
feature, and lack of hardware access does not excuse implying a check occurred.

## Final verification workflow

Completion requires:

```bash
npm run test:conformance
npm test
npm run check
```

Also record:

- focused scanner/discovery and transformer commands;
- the adversarial Wasmoon string-round-trip result;
- Strudel generated-source and complete official/project corpus results;
- production build success;
- the exact live browser matrix completed or unavailable; and
- any real Disting NT result separately with firmware and reproduction steps.

## Acceptance criteria

The feature is complete when:

- a strict version-one comment can bind a text field to exactly one top-level
  local string literal without executing source;
- malformed or ambiguous annotations are source-located, local-only,
  non-blocking, and never guessed;
- customizer keystrokes cannot change Monaco, project/recovery state, source
  version, live simulation, routing, diagnostics for the live source, or saved
  VM state;
- original export remains exactly byte-for-byte and immediately available;
- customized export changes only verified literal spans and safely round-trips
  arbitrary accepted strings through real Lua;
- stale versions, changed lexemes, overlapping spans, invalid values, and
  serializer failures cannot produce a customized download;
- disposable-worker preflight initializes the generated source without
  starting or disturbing live simulation, and simulator failures remain
  explicitly overridable;
- the dialog is keyboard-accessible, responsive, clear without color, and
  honest about draft durability, preflight evidence, and hardware limits;
- the Strudel example exposes one mini-notation field and existing parser/
  scheduler tests exercise customized generated copies through Wasmoon;
- architecture, testing, workbench, conformance, and documentation-map updates
  accurately distinguish this browser extension from the Disting Lua API;
- focused, boundary, corpus, conformance, complete, coverage, build, and check
  workflows pass; and
- unavailable browser or hardware verification is reported exactly.

## Out of scope for version one

- Changing editor source, offering an “apply to source” action, or adding a
  Monaco quick fix that writes a chosen export value.
- Applying customized values to the live worker, previewing their musical
  output in the current simulation, or treating them as runtime parameters.
- Persisting drafts across reloads, IndexedDB migrations, backup/restore of
  drafts, named export profiles, sharing links, cloud sync, or accounts.
- Numeric sliders, checkboxes, enum dropdowns, color controls, file uploads,
  conditional fields, groups/tabs, dependency expressions, or computed
  templates.
- Replacing arbitrary expressions, table entries, module files, identifiers,
  multiple occurrences, or fields produced dynamically at runtime.
- Script-specific JavaScript validators or embedding the Strudel grammar in the
  generic customizer. Script-owned `init()` validation remains the preflight
  path.
- Estimating Disting NT heap, SD-card capacity, load time, or CPU use from
  browser byte counts or preflight timing.
- Exporting project backups, runtime `self.state`, parameters, routes, inputs,
  outputs, traces, diagnostics, or workspace settings into the `.lua` file.
- Changing official imported scripts merely to add Luading annotations.
