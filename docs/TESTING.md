# Testing strategy

Luading treats the bundled Disting NT Lua Scripting 1.12 manual as the
conformance source for simulator behavior. Tests are split into layers so a
failure points to the boundary that changed.

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
- audited API support-level classification and compatibility diagnostics
- clocked/free-running signal sources and oscilloscope triggering

### Lua boundary integration

The Lua runtime tests execute scripts in Wasmoon rather than mocking Lua tables.
They verify `self` binding, restored state before `init`, lifecycle callbacks,
custom UI callbacks, `setupUi`, MIDI, serialization, syntax errors, and
`package.preload` modules.

The reusable test engine in
`src/disting/testing/lua-test-environment.ts` installs the same Disting constants
and global API surface used by the simulator.

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
versions, and immediate removal of outdated syntax findings. All 58 bundled
scripts also compile through the same editor validation path on one engine.

Source-index tests cover inline and referenced lifecycle functions, returned
program and `init()` tables, metadata and nested MIDI fields, numeric and enum
parameter positions, balanced API arguments, local/function declarations,
partial results for malformed source, and representative Lua 5.4 syntax. They
also require all 58 bundled scripts to produce a complete structural index and
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

### Script corpus regression

All bundled scripts are loaded and exercised:

- 23 scripts from `lua-scripts/expert-sleepers/`
- 35 scripts from `lua-scripts/fredi-bach/`

The corpus tests call applicable `init`, `step`, `trigger`, `gate`, `draw`,
custom UI, MIDI, and serialization callbacks and verify callback values survive
the JavaScript/Lua boundary. Every bundled script must also pass contract
validation; known-invalid metadata is corrected in the bundled copy rather than
added to an expected-error allowlist.

## Commands

```bash
npm test                 # One complete test run
npm run test:watch       # Watch mode during development
npm run test:conformance # Manual contract only
npm run test:coverage    # Tests plus coverage thresholds and HTML report
npm run check            # Lint, coverage, and production build
```

The HTML coverage report is written to `coverage/index.html`.

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
