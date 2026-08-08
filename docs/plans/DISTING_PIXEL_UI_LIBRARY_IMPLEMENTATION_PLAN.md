# Disting NT pixel UI library implementation plan

## Status

Proposed on 2026-08-08. No component library behavior described here is
implemented unless a later status update says otherwise.

This is the next authoring layer above the existing
[Display designer](DISPLAY_UI_DESIGNER_IMPLEMENTATION_PLAN.md). The designer
already has primitives, tokens, runtime-preview bindings, local symbols with
named states, multiple screens, deterministic command compilation, and Lua
generation. This plan turns those capabilities into a curated catalog of
Disting-specific components and screen recipes.

## Goal

Add a built-in **Disting UI kit** to the Display designer so a script author can
insert compact, stateful components for common Eurorack concepts instead of
drawing every jack, fader, gate lamp, sequencer cell, or signal-operation glyph
from scratch.

Each component must:

- fit the Disting NT's 256x64, 16-shade display language;
- expose named state inputs that can be previewed in the designer and connected
  to real script state after source handoff;
- compile into the designer's existing primitives and ordinary documented Lua
  drawing calls;
- remain editable as local symbols, bindings, groups, and primitives after it
  is inserted;
- have predictable current and worst-state draw-call metrics;
- remain legible without colour and at the physical display's pixel density;
  and
- avoid implying that Luading has added a component runtime, firmware API,
  patch-detection facility, or calibrated Disting performance model.

The first useful release should cover the vocabulary needed to draw a compact
four-channel utility, modulation source, router, step sequencer, or drum
machine. More specialized synthesis diagrams can follow from the same catalog
contract.

## Hardware and simulator boundary

The official
[Disting NT Lua Scripting 1.12 manual](../Disting%20NT%20Lua%20Scripting%201.12.pdf)
defines a 256x64 display, origin at the top-left, and shades 0 through 15.
Library artwork may use the documented integer and smooth line/circle, box,
filled rectangle, standard text, and tiny text behavior already supported by
the designer. Designer-only polygon, Bézier, animated-line, and pixel-box
elements are acceptable only because the generator expands them to ordinary
drawing calls.

The kit is a browser authoring convenience:

- it adds no Lua global, callback, metadata field, or `require` dependency;
- it does not cross the simulation-worker protocol;
- it does not inspect or mutate the running script;
- it does not automatically bind a design to `self`, parameters, inputs,
  outputs, or preset state;
- it does not change `api-manifest.ts` or conformance support claims; and
- generated source remains the same one-way, user-owned clipboard handoff as
  the rest of the Display designer.

The Disting cannot generally know that a physical jack is patched. A component's
`patched` state therefore means "the script knows or has been configured to
treat this route as connected"; it must never be inferred merely from a changing
or non-zero bus voltage. Likewise, a trigger flash, peak hold, clock lock, or
signal history must be captured by algorithm state outside `draw()`. Drawing
reads that state and must not become a second behavioral model.

Smooth primitives retain the simulator's documented approximation warning.
Core kit artwork should prefer integer primitives and pixel boxes so the most
frequently used components have deterministic pixels.

## Product model

### A catalog of editable recipes, not opaque widgets

A catalog entry is a validated recipe that materializes a normal fragment of a
display-design document. The fragment may contain:

- one local symbol and one instance for an atomic component;
- one local symbol and several instances for repeated cells;
- several symbols, instances, top-level primitives, bindings, tokens, and one
  group for a larger assembly; or
- a complete new screen recipe.

Insertion remaps every ID and Lua name collision-safely and commits one undo
transaction. Once inserted, the result has no live dependency on the built-in
catalog. It can be edited, renamed, detached, regrouped, duplicated, exported,
and generated exactly like hand-authored designer content. A future Luading
release must not silently restyle an existing design.

This materialized-copy approach means the initial library does not require a
version-10 display-design file. If later work persists catalog provenance,
linked updates, component-specific inspector data, or formal per-instance
property overrides, that work requires a separately planned file-version
migration.

### Independent state by default

Every fresh catalog insertion receives its own namespaced bindings. Two input
jacks inserted separately can therefore show different activity and connection
states. Two step rows can use different patterns and playheads.

Normal **Duplicate instance** retains today's symbol semantics: artwork and any
definition-level dynamic values are shared. Add **Make independent copy** for
the common case where the duplicated component should receive cloned symbol
definitions, choices, mappings, and used bindings. The confirmation summary
must say which values will stop being shared.

Assemblies deliberately reuse one visual symbol where only instance state is
different. For example, a 16-step row uses one step-cell definition and sixteen
choice-bound instances. It does not store sixteen copies of the pixel art.

### Component recipe contract

Implement built-in recipes as typed TypeScript data/factories under a dedicated
`display-designer/component-library/` area. A recipe has at least:

```ts
interface DisplayComponentRecipe {
  id: string
  version: 1
  name: string
  category: DisplayComponentCategory
  description: string
  tags: string[]
  density: 'micro' | 'compact' | 'regular' | 'screen'
  footprint: { width: number; height: number }
  compatibleDisplayModes: Array<'parameter-line' | 'full-screen'>
  inputs: DisplayComponentInput[]
  scenarios: DisplayComponentScenario[]
  materialize(context: DisplayComponentInsertContext): DisplayDesignFragment
}
```

The exact implementation can use builders rather than serializable functions,
but the validator must see the same closed metadata. Recipe IDs and versions
are stable for tests and release notes; they are not firmware identifiers.

Required input metadata:

| Input kind | Contract | Typical roles |
| --- | --- | --- |
| Number | Normalized 0-1 preview, with documented source range and per-property mappings | value, effective value, phase, peak, position, probability, modulation depth |
| Boolean | True/false preview with an explicit visual meaning | active, patched, selected, muted, bypassed, clipped, locked, recording |
| Choice | Stable Lua values mapped completely to symbol states | off/on/accent, signal kind, routing destination, transport state |
| Text | Bounded preview string and expected formatting note | label, note name, voltage, tempo, ratio |

Each input also declares whether it is required, its default, a suggested Lua
name, concise connection guidance, and every primitive/property it affects.
The materializer gives related binding display names a readable component
prefix and keeps them adjacent in document order, so the existing State panel
remains understandable without persisting hidden catalog ownership.

### State composition rules

Avoid a Cartesian product of variants. Use the existing designer features in a
consistent way:

1. A symbol's named state handles one mutually exclusive structural choice,
   such as `off`/`on`/`accent` or `stopped`/`playing`/`recording`.
2. Boolean bindings reveal orthogonal overlays such as selection brackets,
   patch rings, clip marks, or a short activity flash.
3. Number bindings move a handle, set a fill extent, select a shade, or place a
   cursor.
4. Text bindings provide labels and exact values only when pixels allow.
5. The primitive draw order establishes precedence. The default order is
   structure, value, activity, selected/focus, warning, then clip/error.

The most severe visible condition must remain recognizable: `error/clipped`
overrides warning, warning overrides ordinary activity, and disabled/muted uses
a distinct outline or strike rather than shade alone. Selection is an editor or
script state, not a replacement for the component's semantic state.

No symbol may exceed the current 16-state bound. If a design needs more than
one independent choice axis, split it into an assembly of components or express
the secondary axis with boolean/number/text inputs.

### Preview scenarios and real-state usage

Every recipe provides at least `Default`, `Active`, and `Edge case` scenarios.
A scenario changes all of the recipe's preview bindings together without adding
undo history. Examples are `Unpatched`, `Patched +5 V`, `Clipping`, `Step 5
accented`, and `External clock searching`.

The gallery shows a static thumbnail plus a manual scenario selector. It does
not autoplay decorative motion. Animated examples follow the user's reduced-
motion preference and have an explicit pause action.

The catalog details and a session-only post-insert **Integration** receipt list
each generated placeholder and its intended domain. Reopening a version-9 file
retains the readable binding names and generic generated TODOs, not hidden
catalog ownership or rich recipe guidance. Persisting that guidance would
require the separately planned file-version decision described above. The
Integration guidance should teach connections such as:

- normalize a `-5 V..+5 V` bipolar signal to `0..1` for a meter;
- derive a gate lamp from a boolean gate state, not raw draw-frame history;
- keep a two- or three-frame trigger flash counter in `trigger()` or `step()`;
- set a playhead from the algorithm's current step index;
- calculate peak hold and clipping in control state, then only render them; and
- format voltage, note, ratio, or tempo strings before `drawText()`.

The disclosure remains guidance and TODO comments. It must not add an arbitrary
runtime-expression language to the design document or pretend to safely edit
the user's active Lua source.

## Pixel design language

### Grid, density, and shade roles

Use an 8-pixel composition grid with 4-pixel subunits. Atomic glyphs may occupy
7x7, 9x9, or 12x12 pixels where optical centering requires odd dimensions.
Reference footprints are targets, not new validation limits:

- **Micro:** 7-12 pixels on the longest side; used inside rows and matrices.
- **Compact:** about 16x12 or 24x12; icon plus very short label.
- **Regular:** about 32x16 or 48x20; independent control or meter.
- **Screen:** 120-256 pixels wide; a complete lane, rack, or page recipe.

Default semantic shades follow the display language already used by project
examples:

| Role | Default shade range |
| --- | --- |
| Empty/background | 0 |
| Guides, rails, disabled structure | 1-3 |
| Inactive outlines and history | 4-6 |
| Labels and ordinary values | 7-10 |
| Live signal or enabled state | 11-13 |
| Accent, playhead, focus | 14-15 |

Recipes should create document tokens for repeated shades, spacing, and sizes
only when the values are genuinely shared within the inserted fragment. Avoid
flooding a design with one-use tokens.

### Naming and accessibility

- Use short visible labels that survive the standard and tiny font metrics.
- Never rely on a glyph alone when its meaning is uncommon; pair it with a tiny
  label or expose a labelled surrounding tile.
- Active, muted, selected, warning, and clipped states must differ by shape,
  fill, outline, strike, or marker as well as brightness.
- Catalog search includes plain-language and modular-synthesis aliases.
- Gallery items, scenarios, state controls, and insertion results have useful
  accessible names and live announcements.
- The two drum-art styles are called **Classic analog** and **Punchy hybrid** in
  the UI. Search may recognize `808-like` and `909-like`, but artwork must be
  original and must not reproduce logos or panel trade dress.

## Component catalog

The reference footprints below may be tuned during pixel-art review. State
names and usage contracts are part of the intended public authoring behavior.

### 1. Layout, labels, and status

| Component | Reference footprint | State inputs | Intended usage |
| --- | --- | --- | --- |
| Panel/frame | 32x16 through screen width | `normal`, `focused`, `disabled`, `warning`; optional title text | Bound a functional area, channel, or modal state. Focus adds corner brackets; warning adds a distinct top marker. |
| Section header | 32x7 or wider | label text; `active`, `disabled` | Tiny title with optional underline. Use for `CLOCK`, `CV`, `OUT`, or a screen section, not long prose. |
| Divider/ruler | Variable | `normal`, `active`; optional tick count | Separate zones or establish a voltage/time scale. Active uses one bright reference tick. |
| Label/value row | 40x9 or wider | label text, value text; `focused`, `stale`, `error` | Compact parameter, voltage, note, ratio, or tempo readout. Error replaces the value with a visible marker rather than shade alone. |
| Status lamp | 7x7 or 9x9 | `off`, `on`, `pulse`, `warning`, `error`; optional level | Generic gate, activity, sync, or health indicator. `pulse` is supplied by script state and does not self-time in `draw()`. |
| State badge | 16x8 or wider | text; `inactive`, `active`, `warning`, `error` | Short states such as `EXT`, `INT`, `RUN`, `MUTE`, `ARM`, or `CV`. Active inverts fill/text. |
| Tabs/segmented selector | 32x9 or wider | choice, `focused`, `disabled` | Two to four modes or pages. The selected segment is filled and has a marker so low contrast remains readable. |
| Page indicator | 16x5 through 48x5 | position, count, `wrapped` | Dots or short blocks for screen/pattern pages. `wrapped` flashes end markers when the script crosses the boundary. |
| Focus/selection brackets | Bounds of target | `visible`, `warning` | Orthogonal overlay for a selected channel, step, or route. Do not encode the target's signal state here. |
| Empty/unavailable marker | 12x9 or larger | message text; `empty`, `waiting`, `unavailable`, `error` | Explicit fallback for no clock, no preset target, unavailable MIDI, or missing data instead of an invented value. |

### 2. Patch points and routing

| Component | Reference footprint | State inputs | Intended usage |
| --- | --- | --- | --- |
| Input jack | 9x9 micro; 24x14 labelled | `unpatched`, `patched`, `active`, `overrange`, `disabled`; level | Show a logical input. The inward notch distinguishes it from an output even at the same shade. |
| Output jack | 9x9 micro; 24x14 labelled | `idle`, `connected`, `active`, `clipped`, `disabled`; level | Show a generated signal or bus output. An outward notch and optional fill indicate direction/activity. |
| Bidirectional/utility jack | 9x9 or 24x14 | `input`, `output`, `thru`, `disabled`; active | For configurable I/O or a route whose direction is a script choice. Do not use when direction is fixed. |
| Stereo/paired jacks | 24x12 | left/right patched and active; `linked`, `split`, `disabled` | Compact L/R or paired CV display. A bridge shows linked operation; separate outlines show split mode. |
| Normalled pair | 20x20 | upper/lower patched; `normalled`, `broken`, `active` | Explain a default internal route broken by a configured/known connection. This is semantic script state, not hardware jack sensing. |
| Labelled port tile | 28x16 or 36x16 | label, signal kind, direction, activity, level, warning | Standard channel tile combining a jack, short name, signal badge, and one activity mark. Primary building block for I/O overviews. |
| Patch link/flow line | Variable | `idle`, `flowing`, `selected`, `blocked`, `feedback`; direction and speed | Connect ports or processors. `flowing` uses the existing animated-line expansion; blocked adds a cross; feedback adds a return hook. |
| Bus rail and tap | Variable | `idle`, `active`, `overrange`; tap selection | Show several channels sharing a Disting bus or clock. Keep it a diagram, not a claim about physical cable identity. |
| Split/multiple node | 12x12 | `idle`, `active`, `partial`, `disabled` | One-to-many routing. Partial highlights only the active branch when the assembly supplies branch booleans. |
| Merge/mix node | 12x12 | `idle`, `active`, `saturated`, `disabled` | Many-to-one sum or mix. Saturation uses a clipped apex marker. |
| Router/switch | 20x14 | destination choice, `switching`, `disabled`, `error` | One-of-N signal routing, sequential switch, or mux. The chosen branch is geometrically connected. |
| Routing matrix cell | 7x7 or 9x9 | `off`, `on`, `modulated`, `selected`, `conflict` | One crosspoint in a matrix. Use an assembly for row/column labels and a shared focus cursor. |
| Send/return loop | 28x14 | `open`, `closed`, `feedback`, `bypassed`, `overload` | Effects loop, feedback tamer, or recirculating CV/audio route. Feedback is visibly directional. |

### 3. Controls and parameter displays

| Component | Reference footprint | State inputs | Intended usage |
| --- | --- | --- | --- |
| Momentary button/pad | 12x9 or 16x12 | `released`, `pressed`, `latched`, `disabled`; focus | Trigger, reset, tap, record, or perform action. Pressed is filled; latched adds a persistent corner mark. |
| Toggle switch | 16x8 | boolean value; `focused`, `disabled` | On/off, invert, freeze, or mute. Thumb position and label change, not shade alone. |
| Three-way switch | 20x8 | left/centre/right choice; `focused`, `disabled` | Polarity, range, direction, or three-mode selection. Use tabs for four or more choices. |
| Horizontal fader | 32x9 or 48x9 | value; `focused`, `disabled`, `modulated`, `at-limit`; optional effective value | Rate, probability, density, level, or mix. An optional ghost handle shows the base value while the bright handle shows the effective value. |
| Vertical fader | 9x28 or 12x40 | value; same as horizontal | Channel levels, envelopes, or compact mixer banks. Provide a zero/baseline tick when meaningful. |
| Bipolar fader | 40x9 or 9x32 | bipolar value; `focused`, `disabled`, `at-limit` | Offset, pan, attenuversion, swing, or signed CV. The centre zero mark is always visible. |
| Range slider | 48x10 | minimum, maximum, current; `focused`, `invalid`, `clamped` | Note/voltage window, min/max gate time, or comparator window. Crossing handles produce `invalid`; a script-clamped range uses end stops. |
| Rotary knob | 16x16 | value/angle; `focused`, `disabled`, `modulated`, `at-limit` | Compact continuous control or a visual echo of a pot. Use sparingly because linear faders read more precisely at this resolution. |
| Encoder ring | 16x16 | position or choice; `turning`, `pressed`, `focused` | Disting encoder activity, stepped selection, or page navigation. A separate centre mark communicates push state. |
| XY pad/vector point | 32x24 or 48x32 | x, y; `focused`, `clipped`, `trail` | Vector mix, two-axis CV, joystick, or random walk. Optional trail is an advanced recipe requiring script-maintained history. |
| Soft-takeover control | 40x11 | target value, physical value; `waiting`, `caught`, `moving`, `disabled` | Show pot pickup explicitly. Waiting draws separate target and pot markers; caught merges them. This does not fix the simulator's separate `setupUi()` re-entry limitation. |
| Numeric/unit readout | 24x9 or wider | value text, unit text; `normal`, `changing`, `invalid`, `overflow` | Voltage, frequency, BPM, milliseconds, percentage, dB, ratio, or note number. Formatting stays in user script state. |
| Choice readout | 32x9 or wider | text/choice; `focused`, `pending`, `invalid` | Scale, waveform, mode, source, or destination. Pending uses opposing chevrons without changing the committed label. |

### 4. Signal vocabulary

These entries are primarily badges and original pixel glyphs. They can be
inserted alone or used by port tiles, meters, and processor assemblies.

| Component | Choices/states | Intended usage |
| --- | --- | --- |
| Signal-type badge | `audio`, `unipolar-cv`, `bipolar-cv`, `pitch-1v-oct`, `gate`, `trigger`, `clock`, `envelope`, `lfo`, `noise-random`, `midi`, `i2c`, `bus`, `unknown`; active/disabled/error overlays | Identify what a port, lane, or processor expects. The choice is normally structural; activity is independent. |
| Waveform glyph | `sine`, `triangle`, `saw-up`, `saw-down`, `square`, `pulse`, `stepped`, `sample-hold`, `noise`, `envelope`; phase and active inputs | Show an oscillator/LFO shape or selected waveform. Phase is a cursor, not a redrawn simulated oscillator. |
| Polarity/range badge | `positive`, `negative`, `bipolar`, `inverted`, `zero-centred`, `clamped`; warning | Qualify CV and control ranges. Use alongside numeric limits when the exact range matters. |
| Direction badge | `in`, `out`, `thru`, `send`, `return`, `feedback`; active | Compact arrow vocabulary when a full jack is unnecessary. |
| Unit badge | `V`, `st`, `oct`, `Hz`, `BPM`, `ms`, `s`, `%`, `dB`, `x`, `steps`; invalid | Pair with value readouts. The unit is not responsible for conversion or formatting. |
| Channel/voice badge | channel number/text; `active`, `muted`, `solo`, `selected` | Consistent channel identity in mixers, sequencers, and multi-output displays. |

### 5. Signal manipulation and utility blocks

All processor blocks share a compact tile form with input/output stubs. Common
visual states are `idle`, `processing`, `bypassed`, `selected`, `saturated`, and
`error`. The operation itself is fixed when inserted unless choices are listed.

| Component family | Included operations | Additional state/value inputs | Intended usage |
| --- | --- | --- | --- |
| Level and polarity | attenuator, attenuverter, gain, VCA, offset, invert | amount, signed amount, gain, offset, control activity | Make amplitude and polarity transformations visible. Attenuverter always shows a centre-zero axis. |
| Mix and crossfade | sum, average, mixer, crossfade, ring/multiply | balance, per-input activity, output level | Explain how several signals combine. Saturation marks the output edge, not every input. |
| Bounds and shaping | clamp, limiter, window, half-wave rectify, full-wave rectify, fold | lower/upper threshold, in-window, clipped, fold activity | Voltage constraints and waveshaping. Use a tiny transfer-shape glyph rather than a text abbreviation alone. |
| Time response | slew, low-pass smoothing, delay, gate delay, gate length, pulse-width | rise/fall or duration, pending, output high | Note slew, humanization, gate extension, envelope timing, and smoothing. |
| Sampling | sample-and-hold, track-and-hold, latch, shift register | sampling, holding, stage/bit count, clock pulse | Show acquisition versus hold as distinct geometry. Shift-register assemblies add bit cells. |
| Quantization | pitch quantizer, grid quantizer, step quantizer, scale mask | input/output position, accepted/rejected, scale text | Pitch and discrete-voltage processing. Pair with a note ladder when exact notes matter. |
| Comparison | comparator, window comparator, zero-crossing, min, max | A/B values, threshold/window, result high | Show both operands and the boolean result. Window comparator uses two visible threshold rails. |
| Logic | AND, OR, XOR, NOT, NAND, NOR | input highs, output high, pulse | Gate and trigger logic. Inputs and output have separate state marks; truth is not encoded only in the tile shade. |
| Probability | Bernoulli A/B, probability gate, skip, random select | probability, chosen branch, fired/skipped | Random routing and Euclidean gate skip. The chosen branch is explicit for the most recent event. |
| Switching/routing | 1-to-N mux, N-to-1 selector, sequential switch, sample router | selected route, pending route, clock pulse | Dynamic signal routing. Reuse the routing switch when no processing body is needed. |
| Clock transform | divide, multiply, swing, ratchet, burst, clock speed ramp | ratio, phase, locked/searching, pulse | Clock utilities. Never display an invented BPM before a period is known. |
| Feedback utility | send/return, feedback amount, freeze, tamer/limiter | feedback level, frozen, unstable, clipped | Delay/loop displays and feedback safety views. `unstable` is script-derived, not an automatic hardware judgement. |

### 6. Meters, ranges, and graphs

| Component | Reference footprint | State inputs | Intended usage |
| --- | --- | --- | --- |
| Unipolar bar meter | 32x7 through 120x9 | value, optional peak; `idle`, `active`, `clipped`, `stale` | 0-1 level, probability, density, progress, or positive CV. Peak hold is supplied by the script. |
| Bipolar bar meter | 48x9 or wider | signed value, optional positive/negative peaks; `clipped`, `stale` | Signed CV, drift, offset, pan, or modulation. A permanent centre line prevents ambiguity. |
| Vertical channel meter | 7x32 or 9x48 | value, peak; `muted`, `solo`, `clipped` | Mixer banks and multi-output monitors. Can be paired with channel badges and faders. |
| Segmented meter | 32x7 or wider | value, segment count; `clipped`, `warning` | Discrete stages, CPU-independent load categories, step count, or coarse level. Never label browser timing as hardware CPU. |
| Gate/trigger activity | 12x9 | `low`, `high`, `rise-flash`, `fall-flash`, `disabled` | Gate polarity and edge events. Edge flashes need counters maintained outside `draw()`. |
| Threshold/window meter | 64x10 | input, lower, upper, result; `clamped`, `invalid` | Comparator, note range, gate window, or safe voltage region. |
| Modulation range meter | 48x10 | base, effective, minimum, maximum; `clipped` | Show a parameter plus applied CV/modulation. Base and effective markers must remain distinguishable. |
| Envelope contour | 48x24 or 80x32 | attack, decay, sustain, release, current phase/level; `gated`, `finished`, `invalid` | ADSR, AR, multi-stage envelope, or slew. Current phase is a bright point on the geometry. |
| Phase/clock ring | 20x20 or 32x32 | phase, division markers; `running`, `stopped`, `searching`, `locked` | LFO phase, clock cycle, Euclidean rotation, or loop position. It consumes more pixels/calls than a linear phase bar. |
| Note/range ladder | 48x16 or wider | input note, output note, min/max, quantized/rejected | Quantizer, range limiter, transposer, or note compressor. Text shows the current note only when space permits. |
| XY/vector meter | 32x24 or 48x32 | x, y, radius/limit; `clipped`, `stale` | Vector mix, two-channel CV, drift, or uncertainty. Distinct from the interactive-looking XY control by its lack of focus state. |
| Sparkline/scope strip | 64x16 or wider | history data, zero line, threshold; `running`, `frozen`, `overflow` | Advanced component for script-maintained ring buffers. Deferred until the designer has a safe bounded data-series recipe; a static waveform icon must not masquerade as live history. |

### 7. Sequencing, clocks, and musical state

| Component | Reference footprint | State inputs | Intended usage |
| --- | --- | --- | --- |
| Step cell | 7x7, 9x9, or 12x9 | `off`, `on`, `accent`, `tie`, `ratchet`, `probability`, `ghost`, `muted`; selected | Reusable atomic step. Each state has a different interior mark; playhead is preferably a separate overlay. |
| Value step cell | 9x16 or 12x20 | value, gate state; `current`, `selected`, `clipped` | Pitch/CV sequences where bar height matters more than an on/off mark. |
| Playhead cursor | Variable | position; `stopped`, `running`, `recording`, `queued` | Bright line/brackets over a row or grid. A normalized/integer binding maps to step position. |
| 8/16-step row | 120x9 or 240x9 | one choice per step, playhead, loop start/end; `running`, `recording` | Common x0x-style gate/pattern row. Materializes one cell symbol, repeated instances, and a separate playhead/loop overlay. |
| Gate lane | 120x12 or 240x12 | step states, current step, output high, muted | Sequencer gate overview with a lane label and live output mark. |
| Pitch/CV lane | 120x20 or 240x20 | per-step values, active steps, current step, range | Mini bar/piano-roll lane. Use on its own screen when sixteen values would make other controls unreadable. |
| Probability/accent lane | 120x12 or 240x12 | per-step probability/accent values, fired/skipped event | Show authored likelihood separately from the most recent random decision. |
| Loop-range bracket | Width of row | start, end; `active`, `pending`, `invalid` | Mark sequence loop boundaries. A reversed/invalid range is a visible error, not silently reordered artwork. |
| Pattern/page strip | 32x8 or wider | pattern index/count; `queued`, `playing`, `dirty` | Song/pattern navigation. Queued and playing have separate markers. |
| Euclidean ring | 32x32 through 56x56 | length, fills, rotation, current step, hit; `running`, `muted` | Compact Euclidean rhythm overview. Because draw cost scales with steps, metrics must expose the chosen maximum. |
| Stage strip | 120x24 or wider | stage types/levels, current stage, gate, loop range | Multi-stage envelope/sequencer inspired by common Eurorack segment generators. Stage kind choices use ramp/hold/step glyphs. |
| Tracker row | 120x9 or wider | note, gate, effect text; `current`, `selected`, `muted`, `empty` | One micro-tracker event row. A screen recipe supplies several rows and scrolling context. |
| Mini keyboard/note row | 64x12 or wider | active notes, root, scale mask, input/output note | Quantizer and chord displays. White/black-key distinction uses shape and spacing rather than actual colour. |
| Transport strip | 48x9 or wider | `stopped`, `playing`, `paused`, `recording`, `armed`, `waiting-clock`; tempo/position text | Sequencers, loopers, and clocked tools. Waiting-clock is explicit and must not show a fabricated tempo. |

Large assemblies must report binding use before insertion. A 16-step row usually
needs sixteen choice bindings plus a playhead; a four-lane 16-step grid can
exceed the current 64-binding safety bound. The first release should ship
single-lane 8/16-step recipes and a two- or three-lane drum recipe. A four-lane
16-step recipe requires either validated higher authoring bounds or a separately
designed bounded pattern/vector binding; it must not quietly weaken validation.

### 8. Drum-machine components

#### Original drum glyph packs

Provide two consistent original pixel-art families:

- **Classic analog** (`808-like` search alias): rounder envelopes, sparse
  transients, and softer decay silhouettes.
- **Punchy hybrid** (`909-like` search alias): sharper attack marks, layered
  noise/body silhouettes, and more angular shells.

Both families contain kick, snare, clap, rim/claves, closed hi-hat, open hi-hat,
low/mid/high tom, cymbal/ride, cowbell, shaker/maraca, and generic percussion.
Each glyph is recognizable at 12x12 or 16x14 and also has a one- or two-letter
fallback label (`K`, `S`, `CP`, `CH`, `OH`, and so on).

The artwork is explanatory, not an attempt to reproduce a named product's panel
graphics. Style is selected at insertion time, not treated as live script state.

| Component | State inputs | Intended usage |
| --- | --- | --- |
| Drum voice glyph | `idle`, `hit`, `accent`, `muted`; selected/solo overlays and hit level | Identify a voice and flash its actual event. Muted adds a strike; accent adds an outer attack ring. |
| Drum voice tile | label, glyph family/instrument, level; `idle`, `hit`, `accent`, `muted`, `solo`, `clipped` | Channel overview combining voice identity, event flash, and a small output meter. |
| Drum step cell | `off`, `hit`, `accent`, `flam`, `roll`, `probability`, `ghost`, `muted`; selected | Pattern entry with rhythm-specific states. `roll` uses repeated interior ticks; `flam` uses a double transient mark. |
| 8/16-step drum lane | step states, playhead, lane muted/solo, most-recent hit | A voice glyph/label followed by x0x-style cells. Event flash occurs at the lane header and current cell. |
| Drum overview | per-voice hit/accent/mute/level; clock state and step | Two to four large voice tiles for performance monitoring when the full pattern is unnecessary. |
| Radial groove/rhythm ring | pattern hits, current step, swing/rotation, per-lane flash | Compact multi-lane rhythm visualization such as a break or Euclidean groove. High draw cost and dense 32-step states require an explicit gallery warning. |
| Fill/roll indicator | density/rate; `idle`, `armed`, `firing`, `finished` | Ratchets, bursts, fills, and rolls. Separate armed state from a currently firing event. |

Recommended state precedence for a drum cell is: invalid/error, muted, current
accent, current hit, accent, hit/roll/flam, ghost/probability, off. The playhead
outline remains visible over every valid state. Script code owns hit-flash age;
the component only displays the supplied state.

### 9. System and integration status

| Component | States | Intended usage |
| --- | --- | --- |
| Clock-source badge | `internal`, `external-searching`, `external-locked`, `stopped`, `invalid` | Make clock provenance and lock validity explicit. |
| MIDI activity | `idle`, `receiving`, `sending`, `filtered`, `error` | Show script-level MIDI behavior. It does not expose browser device identity to Lua. |
| I2C activity | `idle`, `sending`, `waiting`, `received`, `timeout`, `error` | Visualize a script's I2C transaction state without performing I2C from `draw()`. |
| Preset/state marker | `clean`, `changed`, `saving`, `saved`, `error` | Script-owned saved-state or preset feedback. Do not reuse Luading's project-save status inside firmware-facing artwork. |
| Warning/error banner | warning/error choice, short text, dismiss/latched | A compact screen-level fault treatment. Text is required; brightness alone is insufficient. |
| Busy/progress indicator | progress; `idle`, `working`, `complete`, `error` | Bounded operations known to the script. Avoid indefinite decorative animation when no work is occurring. |

## Screen recipes

Screen recipes are starting compositions, not nested components. They
materialize ordinary local content so every part remains editable.

| Recipe | Contents | Key scenarios |
| --- | --- | --- |
| Four-channel I/O monitor | Four labelled input tiles, four output tiles, bipolar meters, clip marks, signal badges | idle, normal CV, gate activity, one clipped channel |
| Utility processor | Input jack, processor tile, amount/bipolar fader, output jack, input/output meters | bypassed, processing, saturated, disabled |
| Modulation source | Waveform glyph, rate control, phase meter, unipolar/bipolar output choices | stopped, free-running, synced, reset |
| Clock utility | Source badge, lock state, phase bar/ring, divide/multiply readout, gate output | no clock, acquiring, locked, running, lost clock |
| Routing switch | Input column, router body, destination outputs, flow lines, mode/readout | static route, switching, blocked route, error |
| Routing matrix | Row/column port labels, matrix cells, selection cursor, activity rails | empty, configured, modulated, conflict |
| 16-step sequencer | Transport, step row, playhead, loop bracket, probability or value lane | stopped, playing, recording, queued pattern |
| Three-voice drum machine | Classic analog or Punchy hybrid voice labels, three 16-step lanes, playhead, mute/solo states | idle, playing, accented hit, fill, muted lane |
| Envelope/Stages | Gate input, stage strip or ADSR contour, current-point marker, output meter | idle, attack, sustain, release, loop |
| Quantizer/range tool | Pitch input/output, note ladder, scale badge, range handles, gate lamp | accepted note, clamped note, rejected gate, invalid range |

Each recipe must fit either the full 256x64 screen or the 54-row custom area it
declares. Recipes that require full-screen mode say so before insertion. Inserting
a full-screen recipe into parameter-line mode offers an explicit mode switch or
cancels; it never silently hides rows beneath the standard parameter line.

## Gallery and insertion workflow

Add a **Components** panel beside Symbols. It contains:

1. search by component name, alias, signal type, operation, and use case;
2. categories for Layout, Patch & routing, Controls, Signals, Processors,
   Meters, Sequencing, Drums, Status, and Screen recipes;
3. density and compatible-display-mode filters;
4. a pixel-accurate preview at 1x and a magnified preview;
5. scenario controls and a short list of exposed inputs;
6. footprint, current draw calls, maximum-state draw calls, bindings, symbols,
   and primitives that insertion will consume;
7. **Insert at centre** plus drag-to-place where pointer input is available;
8. a blocking preflight when document limits, reserved rows, or bounds would be
   exceeded; and
9. a post-insert selection, announcement, and Integration disclosure.

Keyboard users can search, move through a roving grid/list, change scenarios,
inspect details, and insert without entering the artboard. Drag-to-place is an
enhancement, not the only workflow.

Insertion placement uses the active screen and current display mode. It tries
the visible artboard centre, then the next open 8-pixel-grid position. If no
in-bounds placement exists, the user chooses between an explicit clipped insert
and cancel. Recipes never rearrange existing artwork automatically.

## Resource and quality budgets

Budgets are authoring heuristics, never hardware performance guarantees.

- Atomic micro components should normally compile to at most 8 visible drawing
  calls in their worst state; regular controls should normally remain below 16.
- A complete screen recipe should target fewer than 160 currently visible calls
  and must show its exact maximum in the gallery. Higher-cost radial, curve, or
  dense-grid recipes carry a visible cost note rather than a `safe`/`unsafe`
  label.
- Core glyphs should avoid smooth calls. A component using smoothing declares it
  and inherits the existing preview-approximation finding.
- Pixel boxes are optimized by the existing deterministic optimizer and their
  optimized command count is the displayed cost.
- Generated source must omit unused library recipes and unused local
  definitions exactly as it omits other unused symbols.
- Recipe validation checks the current document limits before insertion. It
  must not partially add a fragment or silently drop state inputs.

## Implementation increments

### 1. Catalog contract, validator, and materializer

- Define recipe/input/scenario/fragment types and stable IDs.
- Add factories for collision-safe namespaced bindings, tokens, symbols,
  choices, groups, and screen-owned elements.
- Validate footprints, display-mode compatibility, complete state mappings,
  unique IDs/names, input defaults, scenario values, bounds, and current
  document resource limits.
- Materialize an insert as one immutable document/history transaction.
- Add **Make independent copy** with exact binding/reference cloning.
- Prove that inserting a recipe, serializing version 9, reopening it, compiling
  it, and generating Lua loses no state or artwork.

Focused tests: pure materializer/validation/history tests plus file round trips,
compiler/generator parity, and real Wasmoon/display-boundary cases for every
input kind.

### 2. Gallery, preview, and insertion experience

- Add the Components panel, category/search filters, scenario preview, metrics,
  details, insertion preflight, centre placement, drag placement, and
  Integration disclosure.
- Reuse the production display compiler/renderer for thumbnails; do not maintain
  hand-drawn CSS approximations.
- Keep each inserted component's namespaced state bindings adjacent and expose
  their usage from the selected symbol/assembly without changing the underlying
  document semantics.
- Cover wide, medium, narrow, coarse-pointer, keyboard-only, and reduced-motion
  behavior.

Focused tests: pure search/filter/placement tests, server rendering, jsdom
keyboard and insertion tests, accessible names/states, undo/redo, and explicit
failure with no partial mutation.

### 3. Foundations, patching, and controls pack

- Implement the layout/status, patch/routing, and control tables above.
- Establish the shade tokens, micro/compact/regular density rules, input/output
  direction silhouettes, state precedence, and standard naming.
- Include the four-channel I/O monitor and utility-processor recipes.
- Review every component at physical 1x scale before accepting the magnified
  artwork.

Focused tests: all scenarios rasterize within declared bounds; input/output and
state pairs differ structurally; generated commands equal Wasmoon output; and
gallery costs equal compiler metrics.

### 4. Signal vocabulary, processor, and meter pack

- Implement signal/waveform/unit badges, utility-operation blocks, scalar
  meters, range displays, envelope, phase, note ladder, and XY meter.
- Defer live sparkline/history insertion until a bounded data-series design is
  approved; ship its catalog entry only when it can visualize real supplied
  history rather than a decorative placeholder.
- Include modulation-source, clock-utility, routing-switch, matrix, envelope,
  and quantizer screen recipes.

Focused tests: signed/unsigned mapping endpoints, centre-zero behavior,
threshold crossings, clipping markers, choice coverage, helper reuse, and
repeat-draw stability through the production Lua boundary.

### 5. Sequencing and drum pack

- Implement step/value cells, cursor, rows, lanes, loop/pattern/transport,
  Euclidean ring, stage strip, tracker row, and mini keyboard.
- Draw and review both original drum glyph families and all listed instruments.
- Implement drum voice, step, lane, overview, radial groove, and fill/roll
  components plus the three-voice drum screen recipe.
- Measure 8/16/32-step and multi-lane document/binding/draw costs. Do not ship a
  recipe that bypasses current limits; propose a separate bounded collection
  model if the evidence requires one.

Focused tests: every step state, playhead overlap, loop endpoints, accent/mute
precedence, glyph distinguishability, repeated instance mappings, collision-safe
multiple insertions, and real-Lua command parity across consecutive frames.

### 6. Documentation, examples, and integration guidance

- Add a concise Workbench guide section for finding, previewing, inserting,
  editing, making independent, and wiring component state.
- Add one bundled demonstration design file only if there is an established
  place for non-script examples; otherwise document reproducible recipe steps.
- Add small Lua connection examples for a gate flash, bipolar meter, soft
  takeover control, step row/playhead, and drum hit/accent.
- Update Architecture and Testing for the materializer, gallery ownership, and
  new guarantees. Conformance changes only if implementation changes public Lua
  behavior, which this plan does not require.

### 7. Full regression and live validation

- Run focused designer, generator, display, file, and rendering suites after
  each coherent increment.
- Run the official/community script corpus if source-generation or reusable
  display helpers change.
- Run `npm test` after implementation and `npm run check` before handoff.
- Complete live-browser checks at wide, 721-900 px, no-more-than-720 px, coarse
  pointer, keyboard-only, reduced motion, browser zoom, and largest supported
  text size.
- Record any unavailable browser cell exactly.
- On available Disting hardware, load a representative generated screen on a
  named firmware version: input/output jack states, bipolar fader/meter,
  animated route, 16-step row, and one Classic analog/Punchy hybrid drum lane.
  Record reproduction steps and pixel/photo differences. Hardware validation
  is required before claiming exact visual parity, especially for smooth calls;
  it is not required to describe the catalog as a browser authoring extension.

## Automated verification matrix

| Layer | Required evidence |
| --- | --- |
| Recipe schema | Unknown kinds, invalid defaults/scenarios, duplicate IDs, incomplete mappings, oversize fragments, and incompatible display modes fail deterministically. |
| Materialization | IDs/Lua names remap collision-safely; insertion is atomic; two fresh inserts have independent bindings; normal and independent duplication follow their documented sharing rules. |
| Model/file | Inserted content is valid version-9 data, survives canonical JSON round trips, and opens without catalog code or provenance. |
| Compiler | Every scenario expands to bounded ordinary draw commands with exact current/maximum metrics and source locations. |
| Generator/Lua | Generated helpers and binding placeholders execute through the production Wasmoon/display bridge and match preview commands for all state/input kinds. |
| Raster | Each state stays inside its declared footprint except documented connector overhang; paired states differ in shape; shade values remain 0-15. |
| React/accessibility | Search, filters, scenario controls, details, preflight, insert, undo, and Integration disclosure work by keyboard and have non-colour state communication. |
| Regression | Existing hand-authored primitives, symbols, bindings, screens, files, generated source, workbench layout, and corpus scripts remain unchanged unless deliberately updated. |

Raster tests should compare exact shade matrices for integer/pixel-box components
and command geometry for variable-size assemblies. Do not rely only on broad
image snapshots that are difficult to diagnose. Smooth components use command
tests plus the existing approximation disclosure.

## Acceptance criteria

The first complete library release is accepted when:

- the catalog contains the core components in sections 1-8, except items
  explicitly marked advanced/deferred;
- a user can build the ten listed screen recipes from catalog entries without
  drawing a new foundational glyph;
- every component documents all state inputs, defaults, preview scenarios,
  source domains, and intended usage;
- fresh insertions visualize independent state, while shared and independent
  duplication are explicit;
- each inserted result is ordinary editable designer content and a valid
  version-9 file with no opaque dependency on the catalog;
- generated Lua uses only documented calls or existing deterministic helper
  expansions and executes through the real Lua/display boundary;
- current and worst-state costs are visible but never described as hardware CPU
  or safety measurements;
- patch presence, clock validity, event flashes, histories, peaks, and clipping
  are driven by user script state rather than guessed in `draw()`;
- active/muted/selected/warning/error states remain distinguishable without
  colour and at physical 1x scale;
- relevant documentation and active-plan status are current;
- focused tests, `npm test`, and `npm run check` pass; and
- unavailable live-browser or hardware verification is reported precisely.

## Deliberately deferred

- a firmware-side widget/component library or Lua `require` package;
- automatic binding to the active script or live worker state;
- arbitrary runtime expressions in design files;
- parsing existing Lua back into components;
- linked catalog instances that receive later library updates;
- cloud/shared component libraries, marketplace packs, or remote assets;
- nested symbols or recursive component composition;
- automatic physical patch-cable detection;
- unbounded waveform/history buffers or data-driven arbitrary paths;
- automatic raising of designer resource limits to fit dense grids;
- exact branded 808/909 panel artwork, logos, typography, or trade dress; and
- any claim that browser draw metrics predict Disting CPU usage.
