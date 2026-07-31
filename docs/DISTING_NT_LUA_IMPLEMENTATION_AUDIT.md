# Disting NT Lua 1.12 simulator implementation audit

Date: 2026-07-31

## Executive summary

Luading has a solid Lua execution boundary and implements much of the local,
single-algorithm development loop: Lua 5.4 execution through Wasmoon, `self`
binding, `init`/`step`/`trigger`/`gate`/`draw`, 1-based callback data, sparse
output updates, typed input edges, parameter metadata, MIDI filtering, drawing
primitives, firmware-derived fonts, and JSON state restoration before `init`.

It is not yet a faithful simulator of the full contract in
[`Disting NT Lua Scripting.md`](Disting%20NT%20Lua%20Scripting.md). The largest
gaps are:

1. The firmware-wide parameter namespace is absent. Every script gets
   `self.parameterOffset = 0`, and the routing/program parameters described by
   the manual do not exist.
2. There is no 28-bus, multi-algorithm preset pipeline. `getBusVoltage()` reads
   the script's logical input array, while preset APIs operate on one fixed
   `Looper` fixture.
3. `kLinear` is metadata and presentation only; output interpolation between
   1 ms callbacks is not emulated.
4. saved state does not include parameter values, although the manual says
   firmware stores parameter values automatically.
5. separate UI scripts, the shared machine-wide Lua instance, the documented
   library search path, and the interactive Lua console are not implemented.

The current conformance and corpus tests all pass, but they do not establish
behavioral conformance for these areas. In particular, the conformance test
checks API names and support metadata, while the corpus test environment
installs most Disting globals as no-op functions.

## Scope and method

This audit used the Markdown 1.12 manual as the contract source and reviewed:

- `src/disting/disting.worker.ts`
- `src/disting/emulation/`
- `src/disting/validation/`
- `src/disting/testing/`
- `src/disting/device/`, `src/disting/io/`, `src/disting/drawer/`, and
  `src/disting/workbench/`
- the manual-conformance, emulator, validation, rendering, and corpus tests

The local Vite server started successfully. A live interactive browser pass
could not be completed because the environment had no connected controllable
browser backend. UI findings below therefore come from the React event flow,
renderer implementation, and rendering tests rather than a visual browser
session.

No Disting NT hardware was available. Items whose behavior is not fully
specified by the 1.12 Lua manual are explicitly marked as requiring hardware
confirmation.

Validation run during the audit:

- `npm run test:conformance`: 1 file, 5 tests passed.
- focused emulator/validation/UI tests: 18 files, 88 tests passed.
- Wasmoon reported `_VERSION` as `Lua 5.4`; that value does not prove the patch
  release is 5.4.6.

## What is already implemented well

The following behavior has a clear implementation and focused coverage:

- scripts execute as Lua chunks and return a program table;
- lifecycle methods are invoked with the program table as `self`;
- restored `self.state` is installed before `init`;
- `step()` receives a 1-based Lua input table and a 1 ms `dt`;
- sparse output tables preserve unspecified output voltages;
- rising trigger edges and both gate edges use 1-based input numbers;
- numeric and typed input/output declarations are normalized;
- sparse input/output names receive documented defaults;
- integer, scaled, and enum parameter metadata is presented to the UI;
- the documented constants and global function names are registered;
- MIDI type and channel filters are applied before `midiMessage`;
- `sendMIDI`, `sendI2CCommand`, and `sendI2CGetter` have explicit mock adapters;
- draw suppression, integer and smooth primitives, text alignment, baselines,
  clipping, and firmware-derived font atlases have focused tests;
- callback execution is isolated in a worker and protected by a timeout;
- bundled libraries are loadable through `package.preload`;
- all bundled scripts cross the Wasmoon runtime boundary in corpus tests.

These are valuable foundations. Most of the high-priority work is in the preset,
bus, parameter, state, and UI orchestration around that boundary.

## Findings

Severity reflects the chance that the simulator gives a hardware-incompatible
result:

- **High**: a script can behave materially differently or be incorrectly
  accepted.
- **Medium**: an incomplete API, lifecycle, or playground behavior can mislead
  testing.
- **Low**: a smaller validation, documentation, or verification gap.

### F-01 — Firmware-wide parameter indices and system parameters are absent

**Severity:** High  
**Status:** Confirmed contract mismatch

The manual says script parameters are added after firmware-maintained program and
routing parameters. `self.parameters` is script-relative, while global parameter
APIs use firmware-wide indices; `self.parameterOffset` bridges those namespaces.

The worker hard-codes both:

- `program.algorithmIndex = 1`
- `program.parameterOffset = 0`

It then exposes only `metadata.parameters` through `getParameterCount`,
`getParameter`, `getParameterName`, `findParameter`, `focusParameter`, and the
standard parameter line
([`disting.worker.ts:216`](../src/disting/disting.worker.ts#L216),
[`disting.worker.ts:461`](../src/disting/disting.worker.ts#L461),
[`disting.worker.ts:353`](../src/disting/disting.worker.ts#L353),
[`disting.worker.ts:375`](../src/disting/disting.worker.ts#L375)).

Consequences:

- scripts cannot inspect or change their program/routing parameters;
- the numeric indices exercised in the simulator differ from hardware;
- `self.parameterOffset` logic is not meaningfully tested;
- `drawStandardParameterLine()` cannot display a system parameter;
- standard UI behavior is operating on a different parameter list.

**Recommendation:** model the Lua Script algorithm's system parameters, assign a
real offset, keep script-relative `self.parameters`, and route all global APIs
through the combined parameter list.

### F-02 — There is no 28-bus, multi-algorithm preset pipeline

**Severity:** High  
**Status:** Confirmed missing feature

The manual defines `getBusVoltage(algorithmIndex, busIndex)` over the 28 system
buses at each position in the preset. Algorithm indices range from zero through
the algorithm count, with the last position representing the final preset
output.

The simulator instead returns `inputs[busIndex]` for algorithm zero or the
current Lua script, and zero for every companion position
([`disting.worker.ts:403`](../src/disting/disting.worker.ts#L403)). `inputs` is
only the script's declared logical input list, not the 28 system buses.

The preset contains the current Lua script plus one hard-coded `Looper` fixture
with two parameters
([`preset-api.ts:19`](../src/disting/emulation/preset-api.ts#L19)). It has no bus
inputs, outputs, routing, customized display name, variable parameter groups, or
custom UI. As a result:

- `getAlgorithmCount()` is effectively fixed at two;
- bus voltages cannot be observed before and after real algorithms;
- `findAlgorithm()`/`findParameter()` cannot exercise a real preset, duplicate
  matches, or variable-parameter base/prefixed-name matching;
- `getAlgorithmName()` cannot test customized preset names.

**Recommendation:** introduce a configurable preset graph with 28 buses,
algorithm positions, routings, display names, parameter collections, and
per-position bus snapshots. Keep a small fixture preset as the default, but do
not hard-code API behavior to it.

### F-03 — `kLinear` outputs are not interpolated

**Severity:** High  
**Status:** Confirmed contract mismatch

The manual distinguishes stepped outputs from outputs linearly interpolated
between 1 ms `step()` calls. The simulator stores `outputKinds`, but both kinds
are updated in the same `outputs` array only when a callback returns a value
([`disting.worker.ts:147`](../src/disting/disting.worker.ts#L147),
[`disting.worker.ts:615`](../src/disting/disting.worker.ts#L615)). Trace samples
are captured at the same 1 ms control boundary. There is no interpolation state
or higher-rate bus evaluation.

`outputKinds` is otherwise used only to label an output and select a stepped or
straight mini-plot path
([`OutputChannelTile.tsx:74`](../src/disting/io/OutputChannelTile.tsx#L74),
[`OutputChannelTile.tsx:101`](../src/disting/io/OutputChannelTile.tsx#L101)).

This means the simulator cannot validate the main behavioral difference between
`kStepped` and `kLinear`.

**Recommendation:** retain previous/next values and timestamps for each linear
output, expose an interpolated bus value at an explicit simulation sample rate,
and test midpoint/end-point behavior separately from stepped output holds.

### F-04 — “Save state” does not save parameter values automatically

**Severity:** High  
**Status:** Confirmed contract mismatch

The manual says a script's parameter values are handled automatically and
`serialise()` adds arbitrary JSON-compatible state.

The worker's `serialise` response contains only `serialise()` output (or
`program.state`) ([`disting.worker.ts:744`](../src/disting/disting.worker.ts#L744)).
The React coordinator stores only that value and sends it back as `state`
([`DistingPlayground.tsx:164`](../src/disting/DistingPlayground.tsx#L164),
[`DistingPlayground.tsx:218`](../src/disting/DistingPlayground.tsx#L218),
[`DistingPlayground.tsx:295`](../src/disting/DistingPlayground.tsx#L295)).
On every load, parameter values are reset from metadata defaults
([`disting.worker.ts:479`](../src/disting/disting.worker.ts#L479)).

The control therefore reports “State saved” while changed parameter values will
not be restored.

**Recommendation:** use a versioned preset snapshot containing automatic
parameter values plus optional serialized script state. Restore the parameters
through the same normalization path used for live parameter changes.

### F-05 — Contract errors do not prevent non-hardware configurations from running

**Severity:** High  
**Status:** Resolved 2026-07-31

The contract validator already reported errors such as more than 28 buses,
invalid I/O shapes, bad parameter definitions, and non-table `init()` results.
Before this fix, the worker nevertheless called `describeProgram()`, configured
signal sources, posted `loaded`, and auto-started the script
([`disting.worker.ts:467`](../src/disting/disting.worker.ts#L467),
[`disting.worker.ts:474`](../src/disting/disting.worker.ts#L474),
[`DistingPlayground.tsx:236`](../src/disting/DistingPlayground.tsx#L236)).

For example, an input table longer than 28 produced an error but
`describeProgram()` still used its full length
([`lua-contract.ts:166`](../src/disting/emulation/lua-contract.ts#L166)).
An `init()` function returning a string was converted to empty metadata and
still loaded.

This previously allowed invalid scripts to produce stable simulator behavior
that hardware does not promise.

**Resolution:** the worker now closes the runtime and rejects the load before
metadata normalization whenever contract validation reports an error. All
contract diagnostics are returned to the Problems panel. Warnings and
informational findings remain non-blocking.

### F-06 — Numeric parameter integer semantics are not enforced

**Severity:** Medium  
**Status:** Confirmed contract mismatch

The manual says the numeric definition fields are integers and unscaled
parameter values are passed to Lua as integers. A scale constant divides those
integer fields and exposes the scaled value as a float.

The validator checks only for finite numbers, not integers
([`contract-validator.ts:267`](../src/disting/validation/contract-validator.ts#L267)).
The normalizer and `setParameter()` path retain arbitrary fractional values for
all non-enum parameters
([`lua-contract.ts:145`](../src/disting/emulation/lua-contract.ts#L145),
[`disting.worker.ts:267`](../src/disting/disting.worker.ts#L267)).

A definition such as `{ "Mode", 0, 10, 0.5, kNone }`, or a later
`setParameter(..., 1.25)`, therefore works in the simulator without a scale even
though it is outside the documented contract.

**Recommendation:** require integer raw min/max/default fields, quantize
unscaled writes to integers, and quantize scaled writes to `1 / scale`.

### F-07 — Several primitive colour arguments are incorrectly optional

**Severity:** Medium  
**Status:** Confirmed documented-signature mismatch

The manual documents colour as a required argument for `drawBox`, `drawCircle`,
`drawLine`, `drawRectangle`, `drawSmoothCircle`, and `drawSmoothLine`. Only text
functions explicitly make colour optional.

The API manifest marks primitive colours optional and the display adapter
defaults them to 15
([`api-manifest.ts:72`](../src/disting/validation/api-manifest.ts#L72),
[`display-api.ts:70`](../src/disting/emulation/display-api.ts#L70)). The editor
therefore suggests and accepts calls that the 1.12 manual does not guarantee on
hardware.

**Recommendation:** make the documented colour arguments required in the
manifest and adapter, or document the default as an explicitly verified hardware
extension if hardware testing proves it exists.

### F-08 — `drawAlgorithmUI()` is a placeholder, not the target algorithm's UI

**Severity:** Medium  
**Status:** Confirmed missing API behavior

The manual says `drawAlgorithmUI(index)` draws the specified algorithm's custom
GUI. The implementation writes the algorithm name and the literal text
“Simulated algorithm UI”
([`display-api.ts:217`](../src/disting/emulation/display-api.ts#L217)). The unit
test explicitly locks in the placeholder
([`display-api.test.ts:96`](../src/disting/emulation/display-api.test.ts#L96)).

**Recommendation:** allow preset algorithms to provide a display callback or
command source and delegate `drawAlgorithmUI()` to it. Mark this API as partial
until then.

### F-09 — Display-mode behavior is mostly cosmetic and `"algorithm"` loses history

**Severity:** Medium  
**Status:** Confirmed incomplete behavior

`setDisplayMode()` accepts the documented strings, but non-algorithm modes render
only a mode label plus the algorithm name
([`display-api.ts:47`](../src/disting/emulation/display-api.ts#L47),
[`disting.worker.ts:574`](../src/disting/disting.worker.ts#L574)).

The manual says `"algorithm"` returns to whichever of the current algorithm's
parameters or custom UI was most recently used. The worker does not track that
history; it selects custom UI whenever the program has one
([`disting.worker.ts:420`](../src/disting/disting.worker.ts#L420)).

**Recommendation:** model display navigation state independently from whether an
algorithm supports custom UI, and implement or clearly label placeholder system
screens.

### F-10 — `setupUi()` is only honored at initial load

**Severity:** Medium  
**Status:** Confirmed lifecycle gap

The manual says `setupUi()` is called whenever the algorithm UI appears for the
first time, for example after moving from overview to algorithm view.

The worker calls it once during load
([`disting.worker.ts:482`](../src/disting/disting.worker.ts#L482)). Later
`setDisplayMode("ui")`, `setDisplayMode("algorithm")`, and UI re-entry after
`exit()` do not call it. The only transport for returned pot positions is the
initial `loaded` message, so the main-thread pot positions also cannot be
resynchronized later.

**Recommendation:** add a UI-entry transition that invokes `setupUi()` and sends
new pot positions to the front panel every time the relevant view is entered.

### F-11 — Standard pot navigation does not preserve the selected page

**Severity:** Medium  
**Status:** Confirmed standard-UI bug

The manual describes pot 1 as parameter-page selection, pot 2 as parameter
selection within the page, and pot 3 as value.

The simulator has no page state. Pot 1 rounds the global parameter index down to
a group of three; pot 2 independently selects from the entire parameter list
([`disting.worker.ts:308`](../src/disting/disting.worker.ts#L308)). Turning pot 2
therefore discards the page implied by pot 1.

The missing system/routing parameters from F-01 make the standard UI diverge
further.

**Recommendation:** model the current parameter page and parameter-within-page
as separate state, backed by the complete firmware parameter list.

### F-12 — The manual “Fire trigger” control bypasses input-edge semantics

**Severity:** Medium  
**Status:** Confirmed playground bug

The manual contract says a trigger callback follows a monitored input edge. The
playground's trigger button directly invokes `runtime.trigger(index + 1)`
([`disting.worker.ts:785`](../src/disting/disting.worker.ts#L785)) instead of
producing a high input sample and passing through `detectInputEdges()`.

Consequences:

- the input voltage and scope do not show the trigger;
- `getBusVoltage()` can still report a low value inside the trigger callback;
- the callback can fire while the input is already high;
- input-high state is not updated;
- the event does not share ordering with a normal edge and `step()`.

**Recommendation:** turn the action into a short pulse on the selected signal
source and let the normal 1 ms edge path dispatch the callback.

### F-13 — Paused state-changing actions can leave the UI stale

**Severity:** Medium  
**Status:** Confirmed playground bug

Changing a parameter renders the worker display but does not post a frame
([`disting.worker.ts:775`](../src/disting/disting.worker.ts#L775)). The direct
trigger action updates outputs but neither renders nor posts a frame. When the
simulator is paused, no scheduler tick will publish those changes.

UI and MIDI events attempt to post a frame, but `postFrame()` drops the request
when another frame is awaiting acknowledgement and there is no deferred
“dirty frame” for the paused case
([`disting.worker.ts:643`](../src/disting/disting.worker.ts#L643),
[`disting.worker.ts:718`](../src/disting/disting.worker.ts#L718)).

**Recommendation:** mark state dirty and guarantee one frame after the current
acknowledgement, even while paused. Parameter and direct-trigger actions should
use the same publication path.

### F-14 — The oscilloscope draws stepped outputs as linear ramps

**Severity:** Medium  
**Status:** Confirmed presentation bug

The compact output tile honors `outputKinds` and adds horizontal hold segments
for stepped outputs. The main scope's `pathFor()` always joins samples with
straight `L` segments and does not receive the program or output kind
([`ScopeWorkspace.tsx:50`](../src/disting/drawer/ScopeWorkspace.tsx#L50)).

This visually contradicts the stepped/linear distinction even before the core
interpolation gap in F-03 is addressed.

**Recommendation:** render output probes with a zero-order hold for `kStepped`
and a straight interpolation for `kLinear`. Preserve edge points when
downsampling.

### F-15 — The MIDI input utility cannot produce true two-byte messages

**Severity:** Medium  
**Status:** Confirmed playground limitation

The manual's receive filters include program change and aftertouch/channel
pressure, which are two-byte channel messages. The worker accepts variable
length input, but the UI always displays three fields and
`parseMidiMessage()` requires exactly three bytes
([`midi-event.ts:48`](../src/disting/workbench/midi-event.ts#L48),
[`MidiEventTool.tsx:18`](../src/disting/workbench/MidiEventTool.tsx#L18)).

A script that checks `#message` therefore cannot be tested accurately for those
message types through the playground.

**Recommendation:** infer message length from the status byte, support one-,
two-, and three-byte messages, and add presets for all six documented filter
types.

### F-16 — Separate UI scripts and machine-wide shared Lua globals are absent

**Severity:** High for full-manual parity; Medium for Lua Script-only scope  
**Status:** Confirmed missing feature

The manual defines one Lua instance shared by Lua Script algorithms, UI scripts,
and console input. UI scripts have their own lifecycle: `init()` takes no
arguments and returns true or an error string; event and draw callbacks also take
no `self`.

Luading creates one worker and one Lua engine for one loaded algorithm script.
Every run terminates that worker and creates a new one
([`DistingPlayground.tsx:210`](../src/disting/DistingPlayground.tsx#L210),
[`DistingPlayground.tsx:315`](../src/disting/DistingPlayground.tsx#L315)). The
runtime wrapper is specifically the algorithm-script `program:self` lifecycle
([`lua-runtime.ts:153`](../src/disting/emulation/lua-runtime.ts#L153)).

There is no UI-script load mode, no concurrent algorithms, and no global state
shared across program installs or a console.

**Recommendation:** decide and document whether Luading targets only the Lua
Script algorithm. For full-manual parity, keep one engine alive for a preset,
load multiple algorithm chunks plus an optional UI script into it, and implement
the UI-script-specific callback contract.

### F-17 — The “Console” is an event log, not the documented interactive shell

**Severity:** Medium  
**Status:** Confirmed missing product surface

The manual's console tool accepts Lua commands, returns results, recalls command
history, supports multiline entry, and installs programs into a live Lua Script
algorithm.

Luading's console is a filterable read-only log for `print`, errors, MIDI, I2C,
and display events
([`ConsoleWorkspace.tsx:27`](../src/disting/drawer/ConsoleWorkspace.tsx#L27)).
It has no command input or evaluation request.

This is not a defect if the manual's separate console tool is intentionally out
of scope, but the workbench should avoid implying shell compatibility.

**Recommendation:** rename it “Event log” or implement a worker request that
evaluates console chunks in the persistent preset Lua engine.

### F-18 — The documented `require` search path is not available to user scripts

**Severity:** Medium  
**Status:** Confirmed missing feature

The manual documents:

`/programs/lua/?;/programs/lua/?.lua;/programs/lua/lib/?;/programs/lua/lib/?.lua`

The simulator registers bundled `lua-scripts/<group>/lib/*.lua` files through
`package.preload`
([`script-examples.ts:20`](../src/disting/script-examples.ts#L20),
[`lua-runtime.ts:118`](../src/disting/emulation/lua-runtime.ts#L118)). The editor
has no way to attach a new library or emulate the MicroSD paths, and modules from
other groups are unavailable.

**Recommendation:** add a virtual `/programs/lua` filesystem or project file
collection, set `package.path` to the documented value, and test both extension
and extensionless resolution in all four locations.

### F-19 — Script header metadata is validated only partially and not presented

**Severity:** Low  
**Status:** Confirmed feature/validation gap

The manual says the first two comments provide the pre-load script name and
description, including the multiline-comment form.

The static validator checks only whether the first non-empty line starts with
`--`; it never checks that a second description comment exists
([`static-validator.ts:377`](../src/disting/validation/static-validator.ts#L377)).
The loader does not parse either comment, and `LoadedProgram` has no description
field ([`types.ts:37`](../src/disting/types.ts#L37)).

The displayed program name instead comes from the returned table after the chunk
has executed.

**Recommendation:** parse the two comment fields without executing the script,
surface them before load, and validate both the short name and description.

### F-20 — Exact Lua 5.4.6 conformance is not pinned or tested

**Severity:** Medium verification risk  
**Status:** Unverified, not a confirmed version mismatch

The manual specifies Lua 5.4.6. The project pins Wasmoon 1.16.0 and labels the
runtime “Lua 5.4”, but no source or test establishes the embedded Lua patch
release. `_VERSION` also reports only `Lua 5.4`.

Patch-level changes can affect parser, standard-library, garbage-collector, and
error behavior.

**Recommendation:** record the Lua source revision used to build Wasmoon, add a
runtime build/version probe if available, and document whether exact 5.4.6 or
major/minor compatibility is the actual project guarantee.

### F-21 — CPU-cycle and physical-I/O APIs are compatibility mocks

**Severity:** Medium  
**Status:** Resolved as explicit compatibility disclosure 2026-07-31

`getCpuCycleCount()` scales browser `performance.now()` as if it were a 600 MHz
counter
([`disting.worker.ts:336`](../src/disting/disting.worker.ts#L336)). It preserves
the 32-bit wrap shape, but it measures wall time, not Disting CPU cycles.

I2C getters return zero-filled arrays, I2C commands only log events, and MIDI
output only logs up to three bytes
([`hardware-api.ts:33`](../src/disting/emulation/hardware-api.ts#L33)).

The architecture and About panel already warned that browser timing is not
calibrated hardware performance. The API manifest previously marked these
functions fully simulated and described the CPU function as the 600 MHz
counter.

**Resolution:** the API manifest now classifies every entry as `full`, `partial`,
`approximation`, `mock`, or `unsupported`. IntelliSense displays the support
level and its API-specific limitation, while static validation emits
non-penalizing simulator compatibility notes. CPU cycles and smooth vector
rasterization are labeled approximations; MIDI and I2C output are labeled
mocks. This resolves the disclosure problem, not the underlying hardware
emulation limitations.

### F-22 — Smooth vector primitives are not quantized to a deterministic 16-shade framebuffer

**Severity:** Medium visual-fidelity risk  
**Status:** Confirmed implementation approach; hardware comparison required

Text is rasterized and quantized explicitly, but smooth lines, boxes, and circles
are handed to browser Canvas 2D antialiasing
([`display-renderer.ts:97`](../src/disting/emulation/display-renderer.ts#L97),
[`display-renderer.ts:109`](../src/disting/emulation/display-renderer.ts#L109),
[`display-renderer.ts:136`](../src/disting/emulation/display-renderer.ts#L136)).
Browser-generated coverage is not converted back to the Disting's 16-shade
framebuffer and can vary by rendering engine.

**Recommendation:** rasterize smooth primitives into a 256×64 integer shade
buffer with a specified coverage algorithm, then render that buffer without
additional smoothing. Compare reference images with hardware.

### F-23 — Draw cadence and truthiness need a firmer contract

**Severity:** Low to Medium  
**Status:** Likely divergence; hardware confirmation recommended

The scheduled draw path targets 30 fps, but the worker also invokes `draw()` on
load, every front-panel event, every MIDI event, and every parameter change
([`disting.worker.ts:494`](../src/disting/disting.worker.ts#L494),
[`disting.worker.ts:718`](../src/disting/disting.worker.ts#L718),
[`disting.worker.ts:735`](../src/disting/disting.worker.ts#L735),
[`disting.worker.ts:775`](../src/disting/disting.worker.ts#L775)). A script with
side effects in `draw()` can therefore behave according to UI/MIDI event rate
rather than a 30 fps cadence.

The worker suppresses the standard line only when the result is exactly
JavaScript `true`
([`disting.worker.ts:586`](../src/disting/disting.worker.ts#L586)). The manual
contrasts Lua-false values with boolean true, but does not make it completely
clear whether other Lua-truthy values suppress the line.

**Recommendation:** test actual hardware draw counts during control and MIDI
events and test truthy non-boolean returns. Then encode the observed rule in a
scheduler test.

### F-24 — Trigger/gate threshold behavior is an undocumented simulator assumption

**Severity:** Low to Medium verification risk  
**Status:** Hardware confirmation required

`detectInputEdges()` uses a fixed `>= 1 V` high threshold
([`runtime-helpers.ts:76`](../src/disting/emulation/runtime-helpers.ts#L76)).
The Lua manual describes trigger and gate callbacks but does not specify the
electrical threshold or hysteresis.

The lack of hysteresis can also create repeated edges around exactly 1 V in a
noisy source.

**Recommendation:** verify threshold and hysteresis on hardware or in a
hardware-level specification. Until then, label this as a simulator assumption
and make it a named, tested policy rather than a default function argument.

### F-25 — JSON state validation silently rewrites some non-JSON values

**Severity:** Medium  
**Status:** Confirmed validation bug

The manual requires JSON-friendly state. `serialiseJsonState()` uses a
`JSON.stringify`/`JSON.parse` round trip and only reports an error when that
throws ([`runtime-helpers.ts:143`](../src/disting/emulation/runtime-helpers.ts#L143)).

JSON serialization does not throw for every invalid semantic value:

- `NaN` and infinities become `null`;
- object fields containing `undefined` or functions disappear;
- sparse/unsupported values can be rewritten.

The simulator can therefore save altered state without telling the user.

**Recommendation:** recursively validate allowed value types and finite numbers
before conversion, detect cycles, and report the exact state path that is not
JSON-compatible.

### F-26 — UI callback definitions are not contract-validated

**Severity:** Medium  
**Status:** Confirmed validation gap

The contract validator checks `ui`, `setupUi`, `midiMessage`, and `serialise`,
but not the documented control callbacks such as `pot1Turn`, `encoder2Turn`,
`pot3Push`, or `encoder2Release`
([`contract-validator.ts:5`](../src/disting/validation/contract-validator.ts#L5)).

At runtime, `callUi()` silently ignores a present non-function callback
([`lua-runtime.ts:168`](../src/disting/emulation/lua-runtime.ts#L168)). A typo
such as `pot3Turn = 1` therefore produces no contract diagnostic and no action.

The static validator recognizes callback regions only for `init`, `step`,
`trigger`, `gate`, and `draw`
([`static-validator.ts:22`](../src/disting/validation/static-validator.ts#L22)).
It cannot attribute API misuse inside custom UI, MIDI, setup, or serialization
callbacks; drawing calls there may be missed until that branch executes.

**Recommendation:** create one canonical lifecycle/callback manifest and use it
for runtime dispatch, contract validation, static callback regions,
IntelliSense, and tests.

### F-27 — MIDI/send API arity validation is too permissive

**Severity:** Low  
**Status:** Confirmed validation gap

The manual allows one, two, or three MIDI bytes after the destination mask.
The manifest models `sendMIDI(destinations, ...bytes)`, so static validation
accepts zero bytes and any number of bytes
([`api-manifest.ts:124`](../src/disting/validation/api-manifest.ts#L124)). The
hardware adapter silently truncates after three
([`hardware-api.ts:57`](../src/disting/emulation/hardware-api.ts#L57)).

**Recommendation:** support explicit min/max variadic arity in API metadata and
report calls outside the documented range.

### F-28 — `exit()` is implemented in the wrong available context

**Severity:** Low  
**Status:** Confirmed scope mismatch

The manual defines `exit()` for returning from a separate UI script. Separate UI
scripts are not implemented, but `exit()` is registered for algorithm scripts
and forces a custom algorithm UI into its parameter view
([`disting.worker.ts:427`](../src/disting/disting.worker.ts#L427)).

This gives an algorithm script behavior that the manual documents only for UI
scripts, while the intended context cannot use it.

**Recommendation:** make API availability/effect dependent on script type once UI
scripts are implemented. Until then, mark `exit()` unsupported rather than fully
simulated.

## Test and conformance findings

### T-01 — The manual conformance test proves catalog presence, not API behavior

The test named “manual conformance” checks:

- timing/display constants;
- that every documented global name is in `DISTING_API`;
- that every entry has support metadata;
- constant numeric values;
- metadata formatting.

It does not instantiate the production worker or invoke the registered global
adapters
([`manual-1.12.conformance.test.ts:48`](../src/disting/conformance/manual-1.12.conformance.test.ts#L48)).
It therefore passes for the placeholder and mock APIs in F-02, F-08, and F-21.

### T-02 — Corpus tests stub Disting APIs instead of exercising their production adapters

`createDistingLuaTestEngine()` installs every manifest function as a no-op, then
overrides selected getters with constant mock values
([`lua-test-environment.ts:13`](../src/disting/testing/lua-test-environment.ts#L13)).
Corpus tests do cross the real Wasmoon lifecycle wrapper, but calls to parameter,
preset, bus, display-mode, MIDI-output, I2C, and other Disting APIs do not cross
the production worker adapters.

This is weaker than the testing documentation's statement that bundled scripts
are exercised through the real API surface.

### T-03 — Output-mode coverage stops at metadata and plotting

Existing tests verify that `kStepped` and `kLinear` map to different labels and
plot paths. There is no behavioral interpolation test, because the core model
does not implement interpolation.

### T-04 — Missing high-value end-to-end cases

The following regression tests would have caught the highest-impact findings:

- nonzero `parameterOffset` with system and script parameters;
- parameter values automatically saved and restored alongside `self.state`;
- bus snapshots at algorithm indices 0, middle, and final output;
- stepped hold versus linear midpoint behavior;
- contract-error load blocking (covered);
- `setupUi()` on every UI-entry transition;
- standard pot page/parameter/value navigation;
- trigger-button input pulse and callback ordering;
- paused parameter/trigger frame publication;
- two-byte incoming MIDI messages;
- exact or explicitly accepted Lua patch version;
- custom UI callback type validation;
- finite JSON-state validation.

## Suggested implementation order

1. **Make validation trustworthy:** block contract-error execution, introduce API
   support levels, and stop marking mocks/placeholders fully simulated.
2. **Build the parameter model:** system parameters, nonzero
   `parameterOffset`, integer/scaled quantization, combined global indices, and
   automatic parameter persistence.
3. **Build the preset/bus model:** configurable algorithms, 28-bus snapshots,
   real `getBusVoltage`, displayed names, and parameter lookup behavior.
4. **Implement output modes:** stepped holds and linear interpolation in the
   emulation core, then make the scope consume that model.
5. **Fix event/UI state transitions:** standard pot pages, `setupUi()` re-entry,
   dirty-frame publication, and trigger pulses through the normal edge path.
6. **Complete or explicitly scope the remaining manual surfaces:** UI scripts,
   shared Lua globals, interactive console, virtual library filesystem, and
   display-mode/algorithm-UI delegation.
7. **Replace catalog-only conformance with production-boundary tests:** invoke
   every documented global through the same adapter registration used by the
   worker and add end-to-end lifecycle fixtures.

## Bottom line

Luading is already useful as a single-script Lua workbench, especially for
lifecycle execution, sparse outputs, typed input callbacks, parameter metadata,
MIDI filtering, and display development. It should not yet claim complete
Disting NT Lua 1.12 behavioral conformance. API support metadata now separates
fully implemented behavior, simplified fixtures, placeholders, browser
approximations, mocks, and unsupported surfaces.

The most important correction is architectural rather than cosmetic: represent
the same combined preset, bus, parameter, and state model that the firmware APIs
observe. Once that model exists, many current special cases in the worker become
straightforward adapters, and the conformance tests can measure real behavior
instead of catalog completeness.
