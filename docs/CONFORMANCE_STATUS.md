# Disting NT Lua conformance status

This is the current ledger for Luading's Disting NT Lua support boundaries. It
describes user-visible capability, evidence, implementation/test references,
and remaining hardware-confirmation needs. Update it whenever public Lua
support or a known fidelity gap changes.

This ledger is not a replacement for the official
[Disting NT Lua Scripting 1.12 PDF](Disting%20NT%20Lua%20Scripting%201.12.pdf).
Use the evidence hierarchy in the [documentation map](README.md). The detailed
function, constant, lifecycle, provenance, and simulator-support catalog lives
in [`api-manifest.ts`](../src/disting/validation/api-manifest.ts) and is not
duplicated here.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| **Full** | The documented behavior in scope is implemented with focused automated evidence. It does not imply hardware verification unless stated. |
| **Partial** | A useful subset is implemented, but a documented behavior, transition, or integration remains missing. |
| **Approximation** | Browser or simulator behavior intentionally substitutes for hardware behavior. |
| **Mock** | Calls are accepted and surfaced deterministically, but the physical operation does not occur. |
| **Unsupported** | The documented surface is not available in its intended context. |

Evidence labels below mean **Manual 1.12**, **official corpus**, **simulator
extension**, or **hardware**. No entry currently claims hardware verification
unless its evidence cell explicitly says so.

## Lua runtime and lifecycle

| ID | Capability | Status and evidence | User-visible consequence | Implementation and tests | Hardware confirmation |
| --- | --- | --- | --- | --- | --- |
| RUN-01 | Lua chunks, `self`, core algorithm lifecycle, modules, and restored state before `init()` | **Full** — Manual 1.12 | Algorithm scripts use the real Wasmoon boundary and documented `self` calling convention. | [`lua-runtime.ts`](../src/disting/emulation/lua-runtime.ts), [`lua-runtime.test.ts`](../src/disting/emulation/lua-runtime.test.ts) | No for the documented host contract; exact firmware patch parity is RUN-05. |
| RUN-02 | 1 ms sampling, trigger/gate ordering, and sparse callback updates | **Full** — Manual 1.12 | Trigger rising edges and both gate edges run before `step()`; omitted output entries retain their previous voltage. | [`disting.worker.ts`](../src/disting/disting.worker.ts), [`callback-output.test.ts`](../src/disting/emulation/callback-output.test.ts), [`runtime-helpers.test.ts`](../src/disting/emulation/runtime-helpers.test.ts) | No for ordering; electrical thresholds are RUN-06. |
| RUN-03 | Blocking raw contract validation before normalization | **Full** — Manual 1.12 | Invalid I/O, parameter, callback, MIDI, or `init()` forms fail the load instead of becoming stable simulator-only behavior. | [`contract-validator.ts`](../src/disting/validation/contract-validator.ts), [`contract-validator.test.ts`](../src/disting/validation/contract-validator.test.ts), [`disting.worker.ts`](../src/disting/disting.worker.ts) | No. |
| RUN-04 | Lifecycle and custom-UI callback type validation | **Full** — Manual 1.12 plus provenance-labelled corpus/extension callbacks | Non-function lifecycle members, including custom control callbacks, are rejected. Static regions, editor snippets, and contract checks derive from one lifecycle catalog. | [`api-manifest.ts`](../src/disting/validation/api-manifest.ts), [`contract-validator.ts`](../src/disting/validation/contract-validator.ts), [`static-validator.ts`](../src/disting/validation/static-validator.ts) | No. |
| RUN-05 | Exact Lua 5.4.6 patch compatibility | **Partial** — Manual 1.12 specifies 5.4.6; simulator uses Wasmoon 1.16.0 reporting Lua 5.4 | Normal Lua 5.4 syntax is exercised, but patch-level parser, library, GC, and error differences are not pinned. | [`package.json`](../package.json), [`syntax-validator.test.ts`](../src/disting/validation/syntax-validator.test.ts), [`lua-runtime.test.ts`](../src/disting/emulation/lua-runtime.test.ts) | Not a hardware measurement; dependency-source/build provenance is required. |
| RUN-06 | Gate and trigger electrical threshold/hysteresis | **Approximation** — simulator assumption | Inputs become high at `>= 1 V` with no hysteresis. Noisy values near the threshold may produce behavior that differs from hardware. | [`runtime-helpers.ts`](../src/disting/emulation/runtime-helpers.ts), [`runtime-helpers.test.ts`](../src/disting/emulation/runtime-helpers.test.ts) | **Yes:** measure threshold and hysteresis on hardware or obtain an authoritative electrical specification. |
| RUN-07 | JSON-compatible `serialise()` state validation | **Partial** — Manual 1.12 | Cycles are rejected, but `NaN`, infinities, functions, `undefined`, and sparse values can be silently rewritten by JSON conversion. | [`runtime-helpers.ts`](../src/disting/emulation/runtime-helpers.ts), [`runtime-helpers.test.ts`](../src/disting/emulation/runtime-helpers.test.ts) | No. |

## Parameters and preset state

| ID | Capability | Status and evidence | User-visible consequence | Implementation and tests | Hardware confirmation |
| --- | --- | --- | --- | --- | --- |
| PAR-01 | Lua Script firmware-wide parameter namespace | **Full** for the loaded Lua Script — Manual 1.12 and official preset evidence | `self.parameterOffset` is 85; global APIs see Program, 28 input routes, 28 output bus/mode pairs, then script parameters, while `self.parameters` remains script-relative. | [`parameter-model.ts`](../src/disting/emulation/parameter-model.ts), [`parameter-model.test.ts`](../src/disting/emulation/parameter-model.test.ts) | Helpful for firmware revisions, but not required for current manual-backed indexing. |
| PAR-02 | Numeric, scaled, and enum parameter quantization | **Full** — Manual 1.12 | Raw numeric definitions require integer fields; unscaled writes quantize to integers and scaled writes to `1 / scale`. | [`contract-validator.ts`](../src/disting/validation/contract-validator.ts), [`parameter-model.ts`](../src/disting/emulation/parameter-model.ts), focused tests beside both | No. |
| PAR-03 | Automatic parameter persistence with script state | **Partial** — Manual 1.12 | Save state restores JSON-normalized `self.state`, but changed parameter values reset to metadata defaults on reload. | [`disting.worker.ts`](../src/disting/disting.worker.ts), [`DistingPlayground.tsx`](../src/disting/DistingPlayground.tsx) | No. |
| PAR-04 | Standard pot page/parameter/value navigation | **Partial** — Manual 1.12 | Pot 1 groups parameters, but pot 2 selects across the complete list instead of remaining within the selected page. | [`disting.worker.ts`](../src/disting/disting.worker.ts), [`parameter-model.ts`](../src/disting/emulation/parameter-model.ts) | Helpful for fine interaction details; the missing page state is already clear from the manual. |
| PAR-05 | Script-declared named parameter snapshots | **Simulator extension** — not a Manual 1.12 metadata field | An optional `luading.parameterPresets` table exposes ordered complete parameter vectors in the workbench. Applying one atomically updates script-relative values and `self.parameters`; it does not persist selection or model a complete Disting preset. | [`parameter-presets.ts`](../src/disting/emulation/parameter-presets.ts), [`parameter-presets.test.ts`](../src/disting/emulation/parameter-presets.test.ts), [`bundled-parameter-presets.test.ts`](../src/disting/validation/bundled-parameter-presets.test.ts), [`ParameterPresetSelector.tsx`](../src/disting/device/ParameterPresetSelector.tsx), [`disting.worker.ts`](../src/disting/disting.worker.ts) | No. Hardware is expected to ignore the extra returned-table member; no hardware behavior is claimed. |

## Buses and multi-algorithm presets

| ID | Capability | Status and evidence | User-visible consequence | Implementation and tests | Hardware confirmation |
| --- | --- | --- | --- | --- | --- |
| PRE-01 | Preset algorithm discovery and companion parameters | **Partial** — Manual 1.12 | APIs see the loaded Lua Script plus one deterministic Looper fixture, not an editable multi-algorithm preset with displayed names, routing, duplicates, and variable groups. | [`preset-api.ts`](../src/disting/emulation/preset-api.ts), [`preset-api.test.ts`](../src/disting/emulation/preset-api.test.ts), [`disting.worker.ts`](../src/disting/disting.worker.ts) | No for the missing model; hardware examples would help edge-case parity. |
| PRE-02 | Twenty-eight bus snapshots and `getBusVoltage()` at preset positions | **Partial** — Manual 1.12 | The adapter reads the loaded script's logical input array for algorithm zero/current script and returns zero for companions. It cannot observe buses before, between, and after real algorithms. | [`disting.worker.ts`](../src/disting/disting.worker.ts), [`api-manifest.ts`](../src/disting/validation/api-manifest.ts) | No for core semantics; hardware confirmation may be needed for underspecified edge cases. |

## Stepped and linear outputs

| ID | Capability | Status and evidence | User-visible consequence | Implementation and tests | Hardware confirmation |
| --- | --- | --- | --- | --- | --- |
| OUT-01 | Output-mode metadata and sparse output retention | **Full** — Manual 1.12 | `kStepped`/`kLinear` declarations survive normalization and absent callback entries hold their prior value. | [`lua-contract.ts`](../src/disting/emulation/lua-contract.ts), [`callback-output.ts`](../src/disting/emulation/callback-output.ts), focused tests beside both | No. |
| OUT-02 | `kLinear` interpolation between 1 ms callbacks | **Partial** — Manual 1.12 | Linear and stepped outputs currently update only at control boundaries; intermediate bus values are not emulated. | [`disting.worker.ts`](../src/disting/disting.worker.ts), [`lua-contract.test.ts`](../src/disting/emulation/lua-contract.test.ts) | No for the documented distinction; interpolation sampling details may benefit from hardware evidence. |
| OUT-03 | Scope rendering of stepped versus linear outputs | **Partial** — simulator presentation | Output tiles use hold paths for stepped outputs, but the main scope joins every probe with straight segments. A stepped output can look like a ramp. | [`OutputChannelTile.tsx`](../src/disting/io/OutputChannelTile.tsx), [`ScopeWorkspace.tsx`](../src/disting/drawer/ScopeWorkspace.tsx) | No. |

## Display and smooth primitives

| ID | Capability | Status and evidence | User-visible consequence | Implementation and tests | Hardware confirmation |
| --- | --- | --- | --- | --- | --- |
| DSP-01 | Integer primitives, standard/tiny text, clipping, shades, and parameter line | **Full** — Manual 1.12 and firmware-derived font assets | Documented integer drawing and text behavior produces deterministic 256x64 commands/rasterization with 16 shade values. | [`display-api.ts`](../src/disting/emulation/display-api.ts), [`display-renderer.ts`](../src/disting/emulation/display-renderer.ts), display/font/bounds tests | Helpful for pixel-reference comparison, but no open documented mismatch is known. |
| DSP-02 | Required colour arguments for documented primitives | **Full** for contract metadata, editor, and static validation — Manual 1.12 | The six documented primitive signatures require colour and invalid direct call arity is diagnosed. The runtime adapter remains permissive for compatibility but valid scripts do not depend on that fallback. | [`api-manifest.ts`](../src/disting/validation/api-manifest.ts), [`api-manifest.test.ts`](../src/disting/validation/api-manifest.test.ts), [`static-validator.test.ts`](../src/disting/validation/static-validator.test.ts) | Only needed if claiming the permissive fallback exists on hardware. |
| DSP-03 | `drawAlgorithmUI(index)` delegation | **Partial** — Manual 1.12 | The function draws a labelled placeholder instead of the selected algorithm's custom UI. | [`display-api.ts`](../src/disting/emulation/display-api.ts), [`display-api.test.ts`](../src/disting/emulation/display-api.test.ts) | No for the missing delegation model; visual parity later needs hardware references. |
| DSP-04 | System display modes and algorithm-view history | **Partial** — Manual 1.12 | Non-algorithm modes are labelled placeholders, and returning to `"algorithm"` does not restore the last parameter/custom-UI view exactly. | [`disting.worker.ts`](../src/disting/disting.worker.ts), [`display-api.ts`](../src/disting/emulation/display-api.ts) | Helpful for exact navigation history and system-screen visuals. |
| DSP-05 | `setupUi()` on each first UI appearance | **Partial** — Manual 1.12 | Soft-takeover positions are read only during script load; UI re-entry does not invoke `setupUi()` or resynchronize pots. | [`disting.worker.ts`](../src/disting/disting.worker.ts), [`lua-runtime.test.ts`](../src/disting/emulation/lua-runtime.test.ts) | No for the documented transition; hardware may clarify repeated-entry edge cases. |
| DSP-06 | Smooth primitive rasterization | **Approximation** — Manual 1.12 API, browser implementation | Smooth lines, boxes, and circles use Canvas 2D antialiasing rather than a deterministic 16-shade firmware framebuffer algorithm, so pixels may vary by browser. | [`display-renderer.ts`](../src/disting/emulation/display-renderer.ts), [`display-renderer.test.ts`](../src/disting/emulation/display-renderer.test.ts), manifest support metadata | **Yes:** compare a defined primitive corpus with hardware. |
| DSP-07 | Draw cadence, event-triggered redraws, and truthiness | **Partial** — Manual 1.12 plus simulator scheduling | Scheduled drawing targets 30 fps, but loads, parameters, UI, and MIDI may invoke extra draws. Only exact boolean `true` suppresses the standard line. Scripts with draw side effects can diverge. | [`disting.worker.ts`](../src/disting/disting.worker.ts), [`lua-runtime.ts`](../src/disting/emulation/lua-runtime.ts) | **Yes:** measure event redraw behavior and non-boolean truthy returns on hardware. |

## UI scripts and workbench transitions

| ID | Capability | Status and evidence | User-visible consequence | Implementation and tests | Hardware confirmation |
| --- | --- | --- | --- | --- | --- |
| UI-01 | Custom UI callbacks for the loaded algorithm script | **Full** within single-algorithm scope — Manual 1.12 plus provenance-labelled extensions | Pot, encoder, and button events dispatch through the algorithm `self` lifecycle, with type validation and editor support. | [`api-manifest.ts`](../src/disting/validation/api-manifest.ts), [`lua-runtime.ts`](../src/disting/emulation/lua-runtime.ts), [`contract-validator.test.ts`](../src/disting/validation/contract-validator.test.ts) | Helpful for callbacks observed only in official scripts or exposed as simulator extensions. |
| UI-02 | Separate UI scripts and machine-wide shared Lua state | **Unsupported** — Manual 1.12 | Luading loads one algorithm script into one fresh worker/engine. UI-script lifecycle, shared globals, concurrent algorithms, and console-shared state are unavailable. | [`DistingPlayground.tsx`](../src/disting/DistingPlayground.tsx), [`lua-runtime.ts`](../src/disting/emulation/lua-runtime.ts) | No for the missing feature; hardware is useful when implementing shared-state lifetime. |
| UI-03 | `exit()` in its documented UI-script context | **Unsupported** — Manual 1.12 | The intended script type is unavailable. A compatibility adapter remains registered for algorithm scripts but is explicitly marked non-conformant. | [`api-manifest.ts`](../src/disting/validation/api-manifest.ts), [`disting.worker.ts`](../src/disting/disting.worker.ts), [`api-manifest.test.ts`](../src/disting/validation/api-manifest.test.ts) | No until UI scripts exist. |
| UI-04 | Manual trigger control through normal input-edge semantics | **Partial** — simulator workbench control | The button directly calls `trigger()` instead of generating a sampled pulse, so input voltage, scope trace, bus reads, high-state tracking, and normal callback ordering can disagree. | [`disting.worker.ts`](../src/disting/disting.worker.ts), [`DistingPlayground.tsx`](../src/disting/DistingPlayground.tsx) | No. |
| UI-05 | State publication while paused | **Partial** — simulator workbench behavior | Parameter and direct-trigger changes can remain visually stale; a frame request can also be dropped while another frame awaits acknowledgement without a deferred dirty frame. | [`disting.worker.ts`](../src/disting/disting.worker.ts), [`frame-commit.ts`](../src/disting/frame-commit.ts) | No. |

## MIDI and I2C

| ID | Capability | Status and evidence | User-visible consequence | Implementation and tests | Hardware confirmation |
| --- | --- | --- | --- | --- | --- |
| IO-01 | Lua MIDI receive filters and variable-length messages | **Full** — Manual 1.12 | Direct or physical Web MIDI bytes are filtered by message type and channel parameter before `midiMessage()`. The worker accepts two-byte channel messages. | [`runtime-helpers.ts`](../src/disting/emulation/runtime-helpers.ts), [`midi-routing.ts`](../src/disting/emulation/midi-routing.ts), focused tests beside both | Helpful with real devices; protocol behavior is automated. |
| IO-02 | Manual MIDI event utility | **Partial** — simulator workbench control | The utility requires exactly three bytes and offers only note/control-change presets, so program change and channel pressure cannot be tested with their true length there. Physical/direct messages are unaffected. | [`midi-event.ts`](../src/disting/workbench/midi-event.ts), [`MidiEventTool.tsx`](../src/disting/workbench/MidiEventTool.tsx), [`midi-event.test.ts`](../src/disting/workbench/midi-event.test.ts) | No. |
| IO-03 | `sendMIDI()` destination masks and physical output | **Partial** — Manual 1.12 plus browser approximation | Logical destination bits and byte clamping are preserved and can route to Web MIDI, but browser permissions, selected ports, and scheduling substitute for Disting physical outputs. | [`hardware-api.ts`](../src/disting/emulation/hardware-api.ts), [`midi-routing.ts`](../src/disting/emulation/midi-routing.ts), [`web-midi.ts`](../src/disting/emulation/web-midi.ts) | Real-device validation is required per the [MIDI runbook](MIDI_MANUAL_VALIDATION.md), but it does not make browser timing hardware timing. |
| IO-04 | MIDI/send arity metadata and validation | **Full** — Manual 1.12 | `sendMIDI()` requires one to three bytes after the destination mask; editor/static validation rejects calls outside that range. I2C table/variadic forms are structured as overloads. | [`api-manifest.ts`](../src/disting/validation/api-manifest.ts), [`api-manifest.test.ts`](../src/disting/validation/api-manifest.test.ts), [`static-validator.ts`](../src/disting/validation/static-validator.ts) | No. |
| IO-05 | Physical I2C command/getter behavior | **Mock** — Manual 1.12 API | Commands are clamped and logged; getters return deterministic zero-filled bytes. No I2C transaction occurs. | [`hardware-api.ts`](../src/disting/emulation/hardware-api.ts), [`hardware-api.test.ts`](../src/disting/emulation/hardware-api.test.ts), manifest support metadata | **Yes** for any future physical-adapter or timing claim. |

## Libraries, headers, and interactive console

| ID | Capability | Status and evidence | User-visible consequence | Implementation and tests | Hardware confirmation |
| --- | --- | --- | --- | --- | --- |
| LIB-01 | `require` and the documented `/programs/lua` search path | **Partial** — Manual 1.12 and bundled corpus | Bundled example libraries load through `package.preload`, but users cannot attach a virtual project filesystem or resolve all four documented MicroSD paths. | [`script-examples.ts`](../src/disting/script-examples.ts), [`lua-runtime.ts`](../src/disting/emulation/lua-runtime.ts), corpus tests | No for the documented paths; case/filesystem nuances may need hardware or SD-card confirmation. |
| LIB-02 | Interactive Lua console sharing the live Lua instance | **Unsupported** — Manual 1.12 | The drawer called Console is a read-only event log for prints, errors, MIDI, I2C, and display events; it cannot evaluate Lua, recall commands, or install programs. | [`ConsoleWorkspace.tsx`](../src/disting/drawer/ConsoleWorkspace.tsx), [`DistingPlayground.tsx`](../src/disting/DistingPlayground.tsx) | No until implemented. |
| LIB-03 | Two leading script comments as name/description metadata | **Partial** — Manual 1.12 | Static validation and quick fixes require two leading comments, but multiline header forms are not fully parsed and the preload UI does not expose the description independently of the executed program table. | [`static-validator.ts`](../src/disting/validation/static-validator.ts), [`diagnostic-actions.ts`](../src/disting/validation/diagnostic-actions.ts), focused tests beside both | Helpful for exact multiline parsing and firmware truncation/presentation rules. |

## Timing and performance claims

| ID | Capability | Status and evidence | User-visible consequence | Implementation and tests | Hardware confirmation |
| --- | --- | --- | --- | --- | --- |
| TIM-01 | `getCpuCycleCount()` | **Approximation** — Manual 1.12 API, browser implementation | The adapter scales browser wall time into an unsigned 32-bit 600 MHz-shaped value. It is useful for compatibility but is not a Disting CPU counter. | [`disting.worker.ts`](../src/disting/disting.worker.ts), manifest support metadata | **Yes** for hardware counter semantics; browser values can never calibrate processor load by themselves. |
| TIM-02 | Callback timing and 1 ms budget telemetry | **Approximation** — simulator extension | Average, p95, maximum, callback breakdown, and dropped steps describe the current browser, Wasmoon build, and workload only. | [`disting.worker.ts`](../src/disting/disting.worker.ts), [`PerformanceWorkspace.tsx`](../src/disting/drawer/PerformanceWorkspace.tsx) | Hardware profiling is a separate activity and must not be inferred from these values. |

## Test confidence boundaries

| Layer | Current guarantee | Important limit |
| --- | --- | --- |
| Manual conformance | Pins catalog names, constants, structured signatures, provenance, support metadata, and core lifecycle metadata. | It does not invoke every production worker adapter or prove placeholder/mock behavior. |
| Emulator units | Pin pure boundary, normalization, display, signal, parameter, routing, and state-model behavior. | They do not prove worker orchestration or hardware behavior alone. |
| Lua-boundary tests | Use real Wasmoon chunk loading and lifecycle/table conversion. | The reusable test environment uses controlled/no-op adapters for many Disting globals. |
| Bundled corpus | All bundled scripts compile, validate, load, and exercise applicable callbacks through the runtime bridge. | It does not prove every production adapter, visual parity, or complete preset behavior. |
| Browser/manual validation | Can establish environment-specific layout, permission, Web Audio, and Web MIDI behavior. | Results are not automatically Disting hardware evidence. |

See [TESTING.md](TESTING.md) for commands, coverage policy, and the full test
matrix.

## Hardware-confirmation backlog

| Priority | Question | Required evidence |
| --- | --- | --- |
| High | What trigger/gate threshold and hysteresis does the hardware expose to Lua callbacks? | Firmware version, controlled voltage sweep/noise test, rising/falling observations. |
| High | How are smooth primitives rasterized into the 16-shade framebuffer? | A fixed primitive corpus and captured hardware framebuffer/photos suitable for pixel comparison. |
| Medium | Does `draw()` run only at display cadence, or also after parameter/UI/MIDI events? Which Lua-truthy returns suppress the standard line? | Callback counter script covering idle, controls, MIDI, `true`, `false`, `nil`, numbers, and strings. |
| Medium | What exact Lua 5.4.6 source/build revision and standard-library configuration does firmware use? | Authoritative build metadata or hardware probes for relevant patch-level behavior. |
| Medium | How exactly does algorithm/parameter/custom-UI display history behave across every `setDisplayMode()` transition? | State-transition matrix on a named firmware version. |
| Low | Which control callbacks and compatibility constants observed in official scripts are stable hardware contract? | Minimal scripts on named firmware versions, then provenance promotion only when verified. |

## Migration crosswalk from the 2026-07-31 audit

This table records the one-time disposition of every historical F-01 through
F-28 finding. “Resolved” means the defect described by that finding is fixed;
it does not promote adjacent capabilities beyond the status recorded above.

| Audit finding | Re-audited result | Current ledger |
| --- | --- | --- |
| F-01 parameter namespace | Resolved for the loaded Lua Script | PAR-01 |
| F-02 28-bus/multi-algorithm preset | Still open | PRE-01, PRE-02 |
| F-03 linear interpolation | Still open | OUT-02 |
| F-04 automatic parameter persistence | Still open | PAR-03 |
| F-05 contract errors allowed to run | Resolved | RUN-03 |
| F-06 integer/scaled semantics | Resolved | PAR-02 |
| F-07 required primitive colours | Resolved in manifest, editor, and static validation | DSP-02 |
| F-08 `drawAlgorithmUI()` placeholder | Still open | DSP-03 |
| F-09 display modes/history | Still open | DSP-04 |
| F-10 `setupUi()` re-entry | Still open | DSP-05 |
| F-11 standard pot page state | Still open | PAR-04 |
| F-12 direct manual trigger | Still open | UI-04 |
| F-13 paused frame publication | Still open | UI-05 |
| F-14 scope ramps for stepped outputs | Still open | OUT-03 |
| F-15 true two-byte manual MIDI input | Still open | IO-02 |
| F-16 UI scripts/shared Lua state | Still open | UI-02 |
| F-17 interactive console | Still open | LIB-02 |
| F-18 documented library search path | Still open | LIB-01 |
| F-19 header metadata | Partially resolved: two comments are validated and fixable; parsing/presentation remains | LIB-03 |
| F-20 exact Lua 5.4.6 | Still unverified | RUN-05 |
| F-21 CPU/physical-I/O mocks | Disclosure resolved; underlying approximation/mock remains intentional | TIM-01, IO-03, IO-05 |
| F-22 smooth primitive framebuffer | Still open; hardware evidence required | DSP-06 |
| F-23 draw cadence/truthiness | Still open; hardware evidence required | DSP-07 |
| F-24 input threshold/hysteresis | Still open; hardware evidence required | RUN-06 |
| F-25 silent JSON rewriting | Still open | RUN-07 |
| F-26 lifecycle/UI callback validation | Resolved through the lifecycle manifest | RUN-04 |
| F-27 MIDI/send arity | Resolved through structured bounded arity | IO-04 |
| F-28 `exit()` context | Disclosure resolved; intended UI-script context remains unsupported | UI-03 |

The historical audit's T-01 and T-02 concerns remain explicit test boundaries,
T-03 maps to OUT-02/OUT-03, and every still-relevant T-04 regression gap maps
to a partial, approximation, mock, or unsupported entry above.
