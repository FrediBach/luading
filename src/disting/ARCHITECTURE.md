# Disting NT emulation structure

This file contains lower-level emulator implementation notes. See
[`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) for the canonical
project-wide architecture and system boundaries.

The emulator is split at the same boundaries as the hardware-facing script API:

- `disting.worker.ts` owns scheduling only: the 1 ms control loop, 30 fps draw loop,
  Lua VM lifetime, trace batching, and messages to the UI.
- `emulation/lua-runtime.ts` owns the JavaScript/Lua invocation boundary. One
  persistent Lua callback thread and instruction-timeout hook are reused for the
  runtime lifetime; scalar step inputs are rebuilt into the firmware-facing Lua
  table inside the VM.
- `emulation/lua-contract.ts` translates Disting NT constants and `init()` metadata
  into typed host data. Lua-specific table conventions stop at this boundary.
- `emulation/signal-sources.ts` owns the global musical clock and deterministic
  modular signal generators. Clocked sources share one continuous beat position;
  free-running sources use simulation time.
- `emulation/display-api.ts` is the Lua drawing API adapter. It applies the Disting
  coordinate, colour, and default-parameter-line rules while producing renderer-
  independent commands.
- `emulation/preset-api.ts` provides the companion-algorithm model used by the
  algorithm and parameter query functions. The loaded Lua script occupies preset
  slot 1 and the deterministic companion fixtures follow it.
- `emulation/hardware-api.ts` validates and records I2C and MIDI output. Physical
  buses are deliberately not accessed: I2C getters return zero-filled responses,
  while all outbound traffic is surfaced in the hardware event log.
- `emulation/display-font.ts` measures and rasterizes the standard and tiny text
  faces from generated atlases. The source faces are the Selawik and pixelmix
  fonts embedded in Disting NT 1.12 firmware; rendering is independent of
  browser font availability. Both faces use their atlas bitmap-top metrics
  directly relative to the script-supplied baseline.
- `emulation/display-bounds.ts` checks rasterized text extents against the
  256x64 framebuffer so clipped user-script text is reported without changing
  the hardware's clipping behavior.
- `emulation/display-renderer.ts` rasterizes commands onto the native 256x64
  canvas. Integer primitives use pixel algorithms, smooth primitives retain
  floating-point antialiasing, and font coverage is quantized to the 16-shade
  black-to-`#02F1EF` display palette.
- `emulation/scope-model.ts` performs automatic trigger selection, edge
  interpolation, and pre/post-trigger windowing independently of React.
- `emulation/trace-history.ts` owns the bounded main-thread trace history. Its
  samples live in native private fields and consumers receive a scalar revision,
  preventing React development instrumentation from cloning the nested history
  into every component-render performance measure.
- `workbench/`, `controls/`, `device/`, `io/`, and `drawer/` form the
  presentation boundary below `DistingPlayground`. Layout state and feature
  inspectors stay in React, while all simulator actions return through typed
  coordinator callbacks.
- `io/IoDeck.tsx` and `drawer/ScopeWorkspace.tsx` are controls over typed worker
  messages and trace data. They do not contain signal-generation or Lua
  behavior; reusable triggering and window selection remain in
  `emulation/scope-model.ts`.
- `io/useOutputAudio.ts` maps output channels to opt-in WebAudio voices and keeps
  browser activation, route, level, and waveform state local to the I/O deck.
  `emulation/audio-routing.ts` extracts control-step-accurate rising edges and
  V/oct note changes from the dense trace, while `emulation/web-audio.ts` owns
  the browser audio graph and synthesized drum/synth voices.
- `editor/DistingCodeEditor.tsx` keeps source text in Monaco's model rather than
  React state. Monaco is loaded during an idle window, uses its own editor-service
  worker, and remains a separate production chunk from the simulation worker.
- `editor/disting-intellisense.ts` contains the Lua 5.4 and Disting NT completion,
  hover, signature, and lifecycle-snippet catalog. It does not import or message
  the simulation worker.
- `validation/api-manifest.ts` is the Disting NT Lua 1.12 API catalog shared by
  IntelliSense, simulator-compatibility checks, and the validation rules.
- `validation.worker.ts` runs debounced source checks away from React and the
  simulation loop. Findings are versioned so results for stale editor revisions
  are discarded.
- `validation/contract-validator.ts` validates the raw `init()` result before
  `lua-contract.ts` normalizes it for the simulator. Runtime output checks and
  lifecycle timing remain in `disting.worker.ts`, where the actual behavior can
  be observed.
- `validation/score.ts` is the only place that converts findings into the
  100-point quality score. Hardware-valid APIs that the simulator does not
  implement are compatibility notes and never reduce the score.

## Runtime data flow

For every 1 ms step:

1. The signal bank samples all configured sources.
2. Voltage edges are converted to Disting `trigger()` and `gate()` callbacks based
   on the input types declared by the script.
3. The script's `step()` callback runs.
4. Sparse callback results update only the supplied output slots.
5. The clock and simulation time advance.
6. Periodic snapshots capture every input and output, allowing scope probes to be
   rerouted without restarting the emulation.

Front-panel pot, encoder, and button messages are dispatched to custom UI callbacks
when `ui()` opts in, or to the standard parameter controls otherwise. MIDI input is
filtered by the `init().midi` declaration before `midiMessage()` is called.
`serialise()` snapshots are JSON-normalized in the worker and can be restored as
`self.state` on the next load.

## Extending the emulator

Add a signal shape to the `SignalShape` union, the `SIGNAL_SHAPES` catalog, and the
exhaustive switch in `signalValueAt()`. New worker features should be represented
as typed messages in `types.ts`; React components should never reach into worker
state. New Disting drawing functions belong in `DistingDisplayApi`, not in the
canvas component.

New Disting API entries belong in `validation/api-manifest.ts`; the editor
consumes that catalog. Keep editor state local to `DistingCodeEditor` so typing
cannot rerender the live display, scope, I/O controls, or runtime telemetry.

New validation rules should have a stable rule ID, an explicit target
(`hardware`, `simulator`, or `local`), and a bounded score penalty. Syntax and
contract errors make a script invalid rather than assigning it a numeric grade.
Heuristic advice should be a warning or informational finding, never a contract
error. Token-based API checks are also warnings because they cannot prove that a
name has not been shadowed; the worker promotes an issue to an error only after
observing the actual global call or an invalid callback value.
