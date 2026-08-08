# Testing strategy

Luading treats the bundled Disting NT Lua Scripting 1.12 manual as the
conformance source for simulator behavior. Tests are split into layers so a
failure points to the boundary that changed. Current capability and evidence
limits are tracked in [CONFORMANCE_STATUS.md](CONFORMANCE_STATUS.md).

## Test layers

### Manual conformance

`src/disting/conformance/` pins the documented firmware-facing contract:

- 1 ms control steps and 30 fps display updates
- 256x64 pixels and 16 display shades
- input, output, parameter-unit, and scale constants
- the documented global Lua API and draw-only function contexts
- structured API parameters, overload arity, return metadata, provenance, and
  the core algorithm lifecycle catalog

Run only this layer with:

```bash
npm run test:conformance
```

This layer primarily pins catalog metadata and selected invariants. It does not
invoke every registered API through the production simulation worker, so a
passing conformance test does not turn a partial, approximate, mock, or
unsupported adapter into full behavioral support.

### Emulator units

Tests beside `src/disting/emulation/*.ts` cover:

- numeric and typed bus declarations
- sparse input/output names and sparse callback output updates
- stepped and linear output metadata
- integer, scaled, and enum parameters
- the fixed Lua Script parameter offset, system/routing indices, and quantized
  global parameter writes
- every parameter unit
- trigger rising edges and gate rising/falling edges
- MIDI message classification, type filters, channel filters, and byte clamping
- JSON-friendly preset state
- Luading-only parameter-preset parsing, scaled/enum validation, canonical
  vectors, active/Custom matching, and atomic script-relative batch updates
- contract errors blocking script execution while warnings remain non-blocking
- integer and antialiased drawing commands, shades, alignment, and the standard
  parameter line
- firmware-derived standard/tiny font metrics, glyph coverage, fallback,
  baseline placement, clipping and overflow detection, exact `#02F1EF`
  full-bright pixels, and 16-shade text quantization
- I2C and MIDI output adapters
- Disting MIDI destination masks, physical-output deduplication, Web MIDI
  permission states, port snapshots, hot-plug reconciliation, input delivery,
  output failures, and cleanup
- MIDI input port/channel/message filtering, CC and pitch-bend voltage scaling,
  note pitch and velocity, polyphonic held gates, threshold crossings, atomic
  multi-input updates, and queued one-control-step trigger pulses
- exclusive Off/WebAudio/Web MIDI output routes, CC and 14-bit pitch-bend
  quantization, continuous-message deduplication/rate limiting, V/oct note
  changes before simultaneous gate edges, and active-note cleanup
- audited API support-level classification and compatibility diagnostics
- clocked/free-running signal sources and oscilloscope triggering
- Freeform CV point repair, bounds, copy isolation, phase-aware linear
  interpolation, cycle seams, editor-model operations, accessible rendering,
  and simulator-default annotation round trips

### Lua boundary integration

The Lua runtime tests execute scripts in Wasmoon rather than mocking Lua tables.
They verify `self` binding, restored state before `init`, lifecycle callbacks,
custom UI callbacks, `setupUi`, MIDI, serialization, syntax errors, and
`package.preload` modules. They also verify that nested top-level
`luading.parameterPresets` metadata crosses the real table boundary in source
order and that batch parameter synchronization updates Lua `self.parameters`.

The reusable test engine in
`src/disting/testing/lua-test-environment.ts` installs the same Disting constants
and global API names used by the simulator. Many functions use controlled or
no-op test adapters; this environment proves Lua-boundary compatibility, not
every production worker adapter's behavior.

`melody-range-quantizer.test.ts` loads the bundled pitch processor through the
Wasmoon bridge. It pins the four-input/two-output contract, nearest-semitone
quantization, minimum/maximum clamping, bipolar CV-depth behavior, gate
passthrough, and bounded custom display. These tests establish script behavior
at the documented 1 ms callback boundary; they do not measure oscillator
tuning, converter accuracy, or electrical behavior on Disting NT hardware.

`configurable-swing-sequence.test.ts` loads the bundled microtiming clock
processor through the Wasmoon bridge. It pins its sixteen-position parameter
surface, repeating two- and four-step delay patterns, reset/cancellation
behavior, pulse timing, and bounded custom display. Timing assertions use the
documented 1 ms callback cadence; they do not claim sub-millisecond scheduling
or prediction of future external clock edges.

`trigger-scene-selector.test.ts` loads the bundled Traffic-inspired scene
selector through the Wasmoon bridge. It pins the three-gate/four-output
contract, input 1-to-3 priority, next-active fallback, last-scene latching,
summed gate voltage, live parameter refresh, and bounded custom display. These
tests establish the independently authored selector behavior described in the
workbench guide; they do not claim parity with Traffic's hardware, alternate
modes, electrical response, or gate threshold.

`micro-tracker.test.ts` loads the bundled four-track tracker through that same
Wasmoon bridge. It pins the fixed three-input/eight-output contract, dense
pattern and Song state normalization, JSON-friendly defensive serialization,
internal and external clocks, swing pairs, reset ordering, V/oct transpose,
velocity accents, rests, ties, deterministic probability continuation,
ratchets, retrigger lows, mutes, Pattern queuing, Song looping, the documented
custom-control grammar, confirmed destructive edits, value-owned copy/undo,
and bounded rendering for every view. Its 1 ms timing, JSON byte counts, and
draw-command limits are simulator regression evidence. They do not establish
physical output accuracy, preset capacity, front-panel feel, OLED readability,
or CPU/heap headroom on Disting NT hardware.

`addac-508-swell-physics.test.ts` loads the bundled hardware-inspired water
surface through Wasmoon. It pins the five-input/seven-output contract,
still-water levels, exact Scrolling-mode path delay, Evolving-mode spatial
separation, average and comparator outputs, Fold/Thru/Limit bounds, CV depth
mapping, serialized phase continuity, and bounded custom display. These tests
establish the independently authored control-rate model described in the
workbench guide; they do not compare its unpublished wave coefficients,
control curves, electrical behavior, or timing with physical ADDAC508 hardware.

`wind-meadow-physics.test.ts` loads the bundled wind-and-grass model through
Wasmoon. It pins the five-input/seven-output contract, exact no-wind rest,
directional symmetry under steady flow, stronger deflection from more flexible
grass, CV depth mapping, serialized oscillator continuity, and a bounded custom
display. These tests establish the deterministic control-rate model described
in the workbench guide; they do not validate computational-fluid-dynamics or
plant-mechanics accuracy, Disting hardware timing beyond the documented 1 ms
callback cadence, or live visual smoothness in a particular browser.

`strudel-mini-player.test.ts` loads the bundled hardcoded mini-notation player
through that same Wasmoon bridge. It pins structural syntax, time modifiers,
weights and ties, replication, seeded choice and degradation, Euclidean
rhythms, polymeters, feet, ranges, colon velocity, polyphonic output, cycle
pulses, and bounded parser failures. These tests establish the Lua parser and
scheduler behavior; they do not compare audio, browser timing, or pseudorandom
sequences with a particular Strudel build.

`vermona-random-rhythm.test.ts` loads the bundled hardware-inspired recreation
through the Wasmoon bridge. It pins its dual-section metadata, exclusive Seq
subdivision grid, full-resolution and straight-clock division modes, swing,
independent external clocks, reset muting, +10 V/10 ms pulses, Dice-pattern
state round trips, and bounded custom display. These tests establish the
script's control-rate scheduling and Lua-table behavior; they do not claim
panel, electrical-threshold, random-generator, or sub-millisecond timing parity
with Vermona hardware.

`mutable-instruments-marbles.test.ts` loads the bundled control-rate Marbles
adaptation through Wasmoon. It pins the eleven-input/seven-output contract,
complementary coin bias and gate timing, independent three-value X decision
loops, non-destructive reset, root-octave quantization, negative-Steps slew,
preset-state round trips, and bounded custom display. These tests establish
the Lua adaptation described in the workbench guide; they do not compare its
jitter, ratio clocks, distributions, quantizer, random source, or 1 ms timing
with Mutable Instruments hardware or the sample-rate firmware.

`mutable-instruments-stages.test.ts` loads the bundled single-envelope Stages
recreation through the Wasmoon bridge. It pins the one-Gate/eight-CV and
envelope/activity contract, Ramp progression, gate-held sustain and final-stage
loops, Step sampling/advancement, CV level modulation, JSON-friendly active
state restoration, the usual envelope-family presets, and bounded dynamic
display commands. These tests establish the independently written 1 ms segment
model described in the workbench guide. They do not compare the approximated
time/curve/CV mappings, activity signals, retrigger transitions, OLED rendering,
or CPU headroom with the 31.25 kHz Stages firmware or Disting NT hardware.

`buchla-266-source-of-uncertainty.test.ts` loads the bundled control-rate 266
adaptation through Wasmoon. It pins the six-input/six-output contract,
rate-dependent fluctuating movement, same-step quantization and distribution
CV, whole-volt N+1 states, semitone 2^N states, low/high stored-voltage
tendencies, serialised pseudorandom continuation, and bounded custom display.
These tests establish the independently authored model described in the
workbench guide; they do not compare analogue noise, random distributions,
voltage tolerances, control curves, or 1 ms timing with Buchla hardware.

`automatonnetz.test.ts` loads the bundled Ornament & Crime adaptation through
the Wasmoon bridge. It pins the 5x5 wrapping and fractional vector movement,
all six involutive triad transforms, cell offset/inversion processing, root-CV
quantization, reset and clear behavior, 5 V one-step trigger output,
arpeggio/strum state, custom encoder editing, serialization, and bounded grid
display. The tests compare the script with the published manual and
MIT-licensed firmware logic; they do not claim parity with the original ADC,
DAC, panel, random generator, or sub-millisecond ISR timing.

`mutable-instruments-grids.test.ts` loads the bundled GPL-licensed Grids port
and its packed data module through the Wasmoon `require` boundary. It pins the
six-input/six-output contract, upstream rhythm-node interpolation and threshold
behavior, accents, 24 PPQN quantization, external gate duration, the original
Euclidean lookup table, transparent reset, internal clock cadence, and bounded
map/lane display. The packed resource import was audited byte-for-byte against
the revision and `resources.cc` hash recorded in `THIRD_PARTY_NOTICES.md`; the
tests do not claim AVR, ADC, panel, random-sequence, electrical-threshold, or
sub-millisecond timing parity with Grids hardware.

Editor contract tests also expand the default API, lifecycle, and complete-script
snippets and compile them with Wasmoon without executing the returned chunks.
This keeps snippets syntactically valid at their default placeholder values and
checks that constants exposed by the runtime stay aligned with the canonical
language catalog.

The editor language tests compile the local `disting-lua` Monarch definition,
pin its Lua 5.4 operators and long-bracket states, exercise representative
indentation rules, and verify that language and IntelliSense registration is
idempotent and isolated from ordinary Lua models.

Syntax-validation tests use a persistent Wasmoon engine to cover valid source,
malformed tokens and EOF errors, Lua 5.4 syntax, long strings and comments,
non-execution of returned chunks, serialized engine reuse, stale source
versions, and immediate removal of outdated syntax findings. The entire bundled
corpus also compiles through the same editor validation path on one engine.

Source-index tests cover inline and referenced lifecycle functions, returned
program and `init()` tables, metadata and nested MIDI fields, numeric and enum
parameter positions, balanced API arguments, local/function declarations,
partial results for malformed source, and representative Lua 5.4 syntax. They
also require the entire bundled corpus to produce a complete structural index and
verify that semantic diagnostic locations are resolved only for the matching
model version.

IntelliSense context tests exercise missing-field suppression, every lifecycle
family, input/output/unit/scale filtering, all three parameter snippets, MIDI
messages, display modes, text alignment, documented `self` members, scoped
locals and callback parameters, and suppression inside comments and strings.
Provider-adapter tests pin exact replacement ranges, parameter-specific hover,
API/keyword/lifecycle/metadata/local hover content, balanced nested signature
arguments, and overload selection. A feature-wiring regression test pins the
Monaco UI contributions needed to render each registered provider. Default API,
lifecycle, complete-script, metadata, and parameter snippets are compiled with
Wasmoon after placeholder expansion.

Navigation tests pin outline entries for lifecycle callbacks, local functions,
metadata sections and named parameters; folding ranges for function bodies and
large metadata tables; and scope-aware definition/rename behavior. Fixtures
cover shadowed bindings and require fields, table keys, globals, comments, and
strings to remain outside local-symbol edits. Monaco adapter tests also pin
language isolation, model-versioned edits, invalid-name rejection, idempotent
registration, and disposal.

Diagnostic-action tests apply exact domain edits for header comments, returned
identity fields, edge and MIDI callbacks, categorized constants, drawing
colour, MIDI metadata, and direct parameter writes. Generated callback and
metadata results compile with Wasmoon, while unsafe diagnostic classes are
required to expose no action. Marker tests cover range clamping, separate
origin owners, concise messages, and contract-profile source labels; the Monaco
adapter test pins workspace edits and model isolation.

### Production API-adapter behavior

Focused tests exercise the reusable adapters used by the production worker,
including parameter/preset queries, display commands, hardware event recording,
MIDI filtering/routing, external input batches, signal sources, and callback
output application. The worker also compares its registered Disting API names
with the manifest when a runtime loads.

There is no single end-to-end harness that invokes every documented global
through `disting.worker.ts`. A focused adapter test proves the shared behavior
it calls, but not registration, orchestration, scheduling, or every interaction
with the loaded runtime. Changes to a production global should therefore test
the reusable adapter and, where practical, the worker/runtime path that exposes
it.

### Script corpus regression

All bundled scripts in these collections are loaded and exercised:

- `lua-scripts/expert-sleepers/`
- `lua-scripts/fredi-bach/`

Every parameterized bundled example must also expose multiple valid
`luading.parameterPresets`. A dedicated real-Wasmoon corpus test parses those
snapshots against the normalized parameter definitions, including scaled and
enum values; parameterless scripts must not declare snapshots.

The corpus tests call applicable `init`, `step`, `trigger`, `gate`, `draw`,
custom UI, MIDI, and serialization callbacks and verify callback values survive
the JavaScript/Lua boundary. Every bundled script must also pass contract
validation; known-invalid metadata is corrected in the bundled copy rather than
added to an expected-error allowlist.

Corpus coverage does not prove the production behavior of every Disting global,
complete preset/bus semantics, visual parity, or real hardware I/O.

### React rendering and UI models

Server-rendering tests use `renderToStaticMarkup()` to pin component structure,
accessible names and states, responsive branch selection, routing/status text,
parameter-preset simulator disclosure, active/Custom selection, and control
semantics. Pure tests cover layout reducers, viewport decisions,
shortcuts, scope selection, editors, formatters, and interaction math.

Display-designer geometry tests pin logical/client transforms at every offered
zoom, fractional artboard bounds, integer and half-pixel snapping, reserved-row
constraints, hit testing, reversed geometry, handles, off-canvas translation,
multi-selection bounds, alignment, distribution, and draw-order translation.
Dedicated layout-grid snapping tests pin grid sizes 1, 8, and 64; fractional
Fit and explicit-zoom client bounds; independent axes; artboard edges;
leading/trailing/centre priority; representable whole/half-pixel corrections;
6/8 CSS-pixel hysteresis; Control bypass and re-entry; rigid multi-selection;
reserved-row post-constraints; hidden-grid operation; and suppression of false
guides for dynamic geometry.
Its jsdom interaction tests dispatch pointer and keyboard events to pin pointer
capture requests, gesture cancellation, one-transaction undo, multi-selection,
groups, final pointer-up modifiers, checked View-options semantics, shortcut
focus protection, Artboard grid editing, hidden-grid snapping, and protected
shortcuts. They deliberately do not claim real pointer
capture, CSS layout, scrolling, focus-ring visibility, touch behavior, or
Canvas visual fidelity.

Display-designer binding tests pin safe Lua-local allocation, keywords and
collisions, stable usage discovery across scene and symbol primitives,
number/boolean/text/choice binding creation, reverse mappings, integer and
smooth quantization, shade clamping, visibility inversion, shared bindings,
and delete-to-static conversion. Generator tests compare number, boolean, and
text preview commands with the real Wasmoon/display boundary at multiple
values. jsdom tests cover inspector attachment and detachment, State-panel
preview updates, used-binding confirmation, rename preservation, and ordered
choice editing; they do not turn browser preview controls into a firmware
binding API.

Display-designer symbol tests pin selection-to-relative-coordinate conversion,
origin overrides, shared definitions, fresh IDs, ordered and blank states,
stable Lua values, defaults, complete choice maps, explicit synchronization,
state replacement, detach expansion, used-symbol deletion choices, and
instance bounds. Compiler tests cover translated state expansion, source maps,
and current/maximum-state metrics. Generator tests load immediately evaluated
helper closures through the real Wasmoon/display boundary for multiple states
and origins, compare commands with the pure compiler, exercise unknown-state
fallback, and repeat the returned callback. jsdom covers creation, definition
context, state editing, literal/dynamic instance controls, explicit detach,
destructive confirmation, and undo across scene/symbol contexts; it does not
prove live Canvas layout, pointer capture, or assistive-technology behavior.

Display-design expression and token tests pin the bounded arithmetic grammar,
precedence-aware printing, token-ID rename safety, evaluation and division
failures, immutable usage/substitution operations, collision-safe names, and
formula-preserving geometry and symbol transformations. Compiler/generator
tests compare token formulas, tokenized binding endpoints, shared symbol helpers,
renames, integer/smooth boundaries, and repeated callbacks with commands emitted
through the production Wasmoon/display bridge.

Display-design file tests pin canonical version-4 root, token, pixel-box, and AST
key ordering and bytes, the trailing newline, strict version-1/version-2/version-3 migration,
layout-grid validation and round trips, future-version/size/type rejection,
unsafe file-name repair, generated-Lua invariance, and defensive parsing without
partial documents. jsdom covers read and parse
failure without scene replacement, discard-before-open confirmation,
collision-safe editing after open, Blob download dispatch and failure, exact
clipboard writes, clipboard rejection, and the selected manual-copy fallback.
These tests do not exercise a native file picker, download shelf, clipboard
permission prompt, or durable storage because design files are explicit
browser handoffs rather than project persistence.

Pixel-box optimizer tests rasterize every emitted region back into the source
shade matrix, cover solid, striped, framed-overdraw, and all-16-shade inputs,
and reject inconsistent dimensions. Compiler and real Wasmoon/display-boundary
tests verify that one logical pixel-box source maps to the same optimized
`drawLine`/`drawRectangle` sequence in preview and generated Lua. Geometry and
jsdom coverage verify gesture creation, shade-preserving resize/move behavior,
per-cell painting, accessibility labels, and live draw-call counts.

The pure display-designer layout model pins the 900/720 CSS-pixel boundaries,
stable lower-panel order, and wrapping Home/End/arrow tab navigation. Server
rendering covers wide, medium, and narrow branches, the Tokens panel, linked roving tabs and
panels, narrow Fit zoom, persistent browser-extension/smoothing disclosure,
non-colour pressed/finding states, live status semantics, coarse-pointer target
rules, and reduced-motion CSS. jsdom operates responsive and symbol-state tab
keyboards and checks formula commit/cancel/error behavior, token creation,
rename/source navigation/delete/undo, and accessible labels/states for sliders,
switches, shade swatches, findings, metrics, and announcements.

CSS assertions and jsdom do not prove actual reflow, hit-target dimensions,
horizontal overflow, browser zoom, text enlargement, virtual-keyboard effects,
screen-reader output, or reduced-motion preference application. Live display-
designer acceptance therefore records wide desktop, 721-900 px, no-more-than-
720 px, coarse pointer, keyboard-only, reduced motion, browser zoom, and the
largest supported text-size preference. An unavailable browser backend is
reported explicitly rather than treated as a passing cell.

These tests do not run browser effects, CSS layout, pointer capture, focus
movement, Monaco's live UI, Web Audio activation, Web MIDI permissions, or a
screen reader. User-interface changes need the applicable live browser checks
in addition to model and rendering coverage.

The new-script scaffolder adds a pure draft/validation/generation layer beside
its React coverage. Generator tests pin the default quick-start source, I/O and
parameter forms, callback provenance, exact scale conversion, Lua string
escaping, optional MIDI/state/display metadata, and Luading-only parameter
snapshots. Representative generated scripts compile, validate, load, and
invoke callbacks through the production Wasmoon bridge. Interactive DOM tests
cover both creation paths, guided changes, extension gating, source review,
async submission, and focus return. As with other React tests, CSS layout,
platform focus behavior, touch input, and screen-reader announcements still
require live browser acceptance.

### Local project persistence

Pure project tests pin filename allocation, defensive record validation,
template forking, active fallback, editor-view normalization, backup ordering
and strict parsing, and recovery-journal cleanup. The deterministic in-memory
adapter pins the same atomic intent used by React, including revision
advancement, conflict copies, soft deletion/restore, and additive backup
imports.

The real `IndexedDbProjectStore` runs against a standards-compatible fake
IndexedDB implementation. These tests create schema version 1 and its indexes,
quarantine malformed records, exercise two store instances saving a stale
revision, verify atomic conflict-copy creation, import complete backups, and
close superseded connections on `versionchange`. Invalid backup parsing occurs
before opening its write transaction, while the adapter performs accepted
multi-project restore in one transaction.

The project-library hook runs in a DOM test environment with injected clocks,
IDs, storage, and short timers. It verifies hydration before source exposure,
first-edit template forks through the module boundary, debounced autosave,
flush-before-switch behavior, and editor-view saves that do not claim a source
revision. Generated scaffolds enter through the same protected creation path;
focused tests pin caller-provided filename/source handling and collision
allocation without adding scaffold concepts to storage. Interactive DOM tests
cover the My Scripts current row, project actions, save labels, empty state,
backup/restore filters, and durability guidance.

These automated browser substitutes do not prove real eviction policy,
`pagehide` completion, download dialogs, private-mode retention, or cross-origin
transfer. Release acceptance therefore records edit/reload, immediate switch,
close/reopen recovery, project actions, two-tab conflict, unavailable-storage,
backup transfer, persistent-storage, keyboard, and narrow-viewport results for
Chromium, Firefox, and Safari. Unavailable browser cells must be reported
explicitly.

### Browser and manual acceptance

There is no general browser end-to-end suite. Live acceptance is evidence for
the browser, viewport, input method, assistive technology, deployment, or
device recorded during that run; it is not automatically Disting hardware
evidence. Use the workbench guide as the user-behavior checklist and record any
unavailable browser matrix explicitly.

Web MIDI has an additional deployment/device runbook in
[`MIDI_MANUAL_VALIDATION.md`](MIDI_MANUAL_VALIDATION.md).

### Documentation guardrails

`src/documentation.test.ts` scans the repository documentation and fails when a
local Markdown link is broken, an active document points to a removed canonical
file or contains a developer-machine path, an archived document lacks its
historical label, the documentation map omits a required current reference, or
the documented test commands drift from `package.json`. These checks are
structural and intentionally do not pin test-file, test-case, or corpus counts.

## Commands

```bash
npm test                 # One complete test run
npm run test:watch       # Watch mode during development
npm run test:conformance # Manual contract only
npm run test:coverage    # Tests plus coverage thresholds and HTML report
npm run check            # Lint, coverage, and production build
```

The HTML coverage report is written to `coverage/index.html`.

## Web MIDI deployment and manual validation

`src/deployment-config.test.ts` pins the Vercel response policy to
`Permissions-Policy: midi=(self)` on every route. The production deployment is
HTTPS, satisfying Web MIDI's secure-context requirement. After deploying a
revision, verify the effective response rather than relying only on repository
configuration:

```bash
curl --fail --silent --show-error --head https://luading.vercel.app/ \
  | tr -d '\r' \
  | grep -i '^permissions-policy: midi=(self)$'
```

The command succeeds only when the response includes the expected policy. Then
complete and record the virtual-device matrix in
`docs/MIDI_MANUAL_VALIDATION.md`. Physical hardware checks use the same matrix
when a controller or MIDI interface is available. Automated fake-port tests
remain the repeatable regression layer; manual results are deployment- and
device-specific evidence.

## Coverage policy

Coverage includes the contract, validation, runtime-boundary, display, hardware,
signal, audio-routing, and oscilloscope core modules. The enforced global
minimums are:

- 95% lines
- 94% statements
- 88% branches
- 100% functions

UI component rendering and browser/Web Audio plumbing are excluded from these
core thresholds. Timing results also remain browser-local; conformance tests do
not claim to reproduce the Disting NT processor's execution speed.

## Adding a Disting API

When adding or changing a firmware-facing API:

1. Update `validation/api-manifest.ts`.
2. Add or update the relevant emulator unit test.
3. Add a manual conformance assertion when the public contract changes.
4. Add a Lua-boundary test when values cross between JavaScript and Lua.
5. Include a bundled example or focused fixture that exercises the behavior.
