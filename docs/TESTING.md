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
- every parameter unit
- trigger rising edges and gate rising/falling edges
- MIDI message classification, type filters, channel filters, and byte clamping
- JSON-friendly preset state
- integer and antialiased drawing commands, shades, alignment, and the standard
  parameter line
- firmware-derived standard/tiny font metrics, glyph coverage, fallback,
  baseline placement, clipping and overflow detection, exact `#02F1EF`
  full-bright pixels, and 16-shade text quantization
- I2C and MIDI output adapters
- clocked/free-running signal sources and oscilloscope triggering

### Lua boundary integration

The Lua runtime tests execute scripts in Wasmoon rather than mocking Lua tables.
They verify `self` binding, restored state before `init`, lifecycle callbacks,
custom UI callbacks, `setupUi`, MIDI, serialization, syntax errors, and
`package.preload` modules.

The reusable test engine in
`src/disting/testing/lua-test-environment.ts` installs the same Disting constants
and global API surface used by the simulator.

### Script corpus regression

All bundled scripts are loaded and exercised:

- 23 scripts from `lua-scripts/expert-sleepers/`
- 35 scripts from `lua-scripts/fredi-bach/`

The corpus tests call applicable `init`, `step`, `trigger`, `gate`, `draw`,
custom UI, MIDI, and serialization callbacks and verify callback values survive
the JavaScript/Lua boundary.

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
