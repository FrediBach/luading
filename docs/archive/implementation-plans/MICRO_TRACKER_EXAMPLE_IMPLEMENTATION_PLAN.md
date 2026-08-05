# Micro Tracker example implementation plan

> **Historical snapshot.** Archived on 2026-08-05 after implementation. This
> plan preserves the original product decisions and acceptance matrix; current
> behavior belongs in the workbench guide and testing strategy.

## Status

Implemented on 2026-08-05.

Verification completed:

- `micro-tracker.test.ts` passed 19 real-Wasmoon tests covering the fixed
  contract, state normalization, transport and scheduling, deterministic
  probability, custom controls, safe editing, persistence, and all display
  states;
- the 50-script Luading community corpus, official corpus, 73-script syntax,
  source-index and simulator-annotation corpora, bundled parameter-preset
  corpus, display/runtime integration tests, and documentation guardrails
  passed;
- serialized regression sizes were 6,959 bytes for the default state and 6,466
  bytes for the all-maximal-value state; the busiest Grid frame emitted 52 draw
  commands;
- `npm run test:conformance` passed 8 tests;
- `npm test` passed 118 files and 662 tests;
- `npm run check` passed linting, 96.76% statement / 91.01% branch / 100%
  function / 98.43% line coverage, TypeScript, all 662 tests, and the
  production build;
- one initial coverage run hit an unrelated existing ADDAC 508 Wasmoon
  wall-clock timeout; its unchanged focused file passed 8 tests and the full
  `npm run check` rerun then passed;
- live browser validation was unavailable because required browser discovery
  returned zero backends; and
- physical Disting NT validation was unavailable, so no OLED, voltage, timing,
  preset-capacity, or hardware-performance claim was made.

## Goal

Add **Micro Tracker**, a bundled four-track step tracker that demonstrates how
far a hardware-portable Disting NT Lua script can take a 256x64 display, two
encoders, three pots, and two documented push controls without relying on a
browser-specific editor.

The result will be a playable instrument rather than a static UI demo. A user
will be able to compose notes and per-step performance data, run the sequence
from an internal or external clock, arrange patterns into a short song, mute
tracks, copy and clear data safely, and save the authored material in preset
state. Four pitch/gate pairs will make the tracker useful as a compact
polyphonic or multi-voice Eurorack sequencer.

The example is also intended as a real stress case for Luading's existing Lua
boundary, custom control dispatch, 1 ms scheduler, saved-state handling, and
display renderer. It will not add a tracker feature to the React workbench or
claim that browser timing measures Disting NT performance.

## User promise

After implementation:

- **Micro Tracker** appears automatically in the **Luading** bundled-script
  group and remains an ordinary, exportable `.lua` file;
- a complete default pattern plays immediately without requiring an external
  editor or companion module;
- the essential edit, transport, arrangement, and recovery workflow is usable
  through callbacks documented for algorithm custom UIs in the 1.12 manual;
- four tracks each produce one V/oct pitch output and one stepped gate/accent
  output;
- every step can contain a note, rest, or tie plus velocity, probability, and
  one-to-four ratchets;
- eight patterns of sixteen rows can be edited and placed in a sixteen-slot
  looping song order;
- internal and external clocks, reset, transpose CV, deterministic
  probability, track mute, copy/paste, clear, and one-level undo have explicit
  behavior;
- preset state round-trips the authored song and settings without persisting
  transient pulses, held controls, or half-completed UI gestures;
- every display state remains legible and in bounds at 256x64 pixels; and
- automated evidence is clearly separated from live-browser and real-hardware
  evidence.

## Scope boundary

Version one is one bundled Lua algorithm plus focused tests and documentation.
It will not require a new worker message, React control, storage field, API
global, manifest entry, or simulator-only source schema.

Expected files are:

- new `lua-scripts/fredi-bach/Micro Tracker.lua`;
- new `src/disting/validation/micro-tracker.test.ts`;
- updated project corpus expectations in
  `src/disting/validation/community-scripts.test.ts`;
- a user-facing section in `docs/WORKBENCH_GUIDE.md`;
- a Lua-boundary test description in `docs/TESTING.md`;
- an entry or cross-reference in
  `docs/plans/FREDI_BACH_DISPLAY_ANIMATION_PLAN.md` so that plan remains
  exhaustive for bundled examples; and
- the normal plan-map/archive updates in `docs/README.md`.

`src/disting/script-examples.ts` already discovers the file through its glob,
so it should not receive a tracker-specific registration. `api-manifest.ts`,
the worker protocol, the emulator, React presentation code,
`docs/ARCHITECTURE.md`, and `docs/CONFORMANCE_STATUS.md` should remain unchanged
unless implementation uncovers a genuine shared defect or support-status
change. Any such defect will be split into its own focused increment rather
than hidden inside the example.

## Evidence and hardware constraints

The design will follow these existing contract facts from the official
[Disting NT Lua Scripting 1.12 PDF](../../Disting%20NT%20Lua%20Scripting%201.12.pdf),
the manifest, and the current architecture:

- `step()` runs at the documented 1 ms cadence; input edge callbacks run before
  it, so clock/reset callbacks will queue intent and `step()` will apply it
  after sampling current CV inputs.
- `draw()` targets approximately 30 fps on a 256x64, 16-shade display. Drawing
  will consume state only; it will not advance transport, mutate patterns, or
  make random decisions.
- The documented algorithm custom-UI surface includes pot 1-3 turns, encoder
  1-2 turns, Pot 3 push/release, and Encoder 2 push/release. `setupUi()` returns
  normalized pot positions for soft takeover.
- The manual describes preset-provided `self.state` before `init()` and
  JSON-friendly data returned from `serialise()`.
- Lua arrays are 1-based. Flat cell indices will be converted only by named Lua
  helpers; tests and worker protocol rules remain unchanged.
- Sparse output retention will not be used as an implicit pulse scheduler. The
  script will return a preallocated, complete eight-output buffer from
  `step()` so every gate transition is explicit.

The visible simulator controls `button1` through `button4`, Encoder 1 push, and
Pot 1/2 push are deliberately excluded from the essential interaction model.
They are not documented as algorithm custom-UI callbacks in Manual 1.12.
Adding them merely as unlabeled shortcuts would make the browser experience
better than the claimed hardware workflow and weaken the example's purpose.

## Product decisions

### The tracker is a custom-UI instrument, not a parameter matrix

Micro Tracker will declare no script parameters. Hundreds of note/event values
do not fit the Disting parameter-page model, and mirroring them into parameters
would make indexing, preset vectors, and front-panel navigation worse.

All tracker content and settings will live in script-owned state, be edited by
the custom UI, and be returned by `serialise()`. This keeps the interaction
model identical in Luading and on hardware while exercising the state contract
for the kind of structured data it is meant to support.

The three pots remain meaningful performance controls:

- Pot 1 selects the pattern being edited;
- Pot 2 sets internal tempo; and
- Pot 3 sets swing, while pressing Pot 3 starts or stops transport.

`setupUi()` will derive all three positions from restored state. The plan will
not work around Luading's known UI re-entry limitation; live validation will
record it separately from script behavior.

### Fixed geometry beats arbitrary configuration

Version one will use fixed limits:

| Dimension | Size | Reason |
| --- | ---: | --- |
| Tracks | 4 | Fits four readable display columns and four pitch/gate pairs. |
| Patterns | 8 | Supports variation and a song bank without an oversized preset. |
| Rows per pattern | 16 | Familiar musical unit with cheap wrapped navigation. |
| Song slots | 16 | Enough arrangement depth for a demo while remaining editable on screen. |
| Ratchets per row | 1-4 | Expressive at the 1 ms cadence without an unbounded event queue. |

These limits will be named constants, not scattered literals. Version one will
not offer variable track counts, arbitrary pattern lengths, per-pattern time
signatures, or dynamically allocated cells.

### The default content teaches the feature

Pattern 1 will contain a short, consonant four-track demonstration that exposes
rests, ties, velocity accents, one probability event, and one ratchet without
producing chaotic output on first load. Patterns 2-8 will be blank except for
one or two deliberately documented variations if needed to make the default
song meaningful.

The default song order will reference the populated patterns and terminate
with an end marker. In Song mode, the first end marker loops to slot 1; it does
not stop transport. Transport stop is always explicit, so an accidentally
short order cannot leave the device silently stopped with no explanation.

The implementation will be independently authored. It will not copy another
tracker's source, branding, font, note layout, or effect codes.

### Editing is explicit and recoverable

There will be no always-live value encoder in the grid. The user first selects
a row and track, then deliberately enters a cell editor before a turn can
change musical data. Clear-row and overwrite-pattern operations require a
confirmation screen whose initial choice is **No**.

One-level undo will cover the last committed cell, row, pattern, song-slot,
mute, or encoder-edited setting mutation. A cell editing visit is one
transaction: the entry snapshot is recorded once, multiple encoder turns may
refine it, and leaving the editor commits one undo item. Song and Settings
turns are similarly grouped until the cursor changes or the view closes.
Direct Pot 1-3 performance changes are deliberately not undoable because the
documented absolute-pot callbacks provide no gesture-start/gesture-end pair to
group reliably. Copy state and undo history are runtime conveniences and will
not be serialized.

### Playback and editing positions stay separate

The editor owns `selectedPattern`, `cursorRow`, and `cursorTrack`. The sequencer
owns `playingPattern`, `playRow`, and `songSlot`. Moving the cursor never jumps
the sounding sequence.

In Pattern mode, choosing a pattern while stopped changes the playing pattern
immediately. While running, it queues the new pattern for the next pattern
boundary and shows both current and queued IDs. In Song mode, Pot 1 changes
only the pattern being edited; song playback continues to follow the order
table.

Edits to a row that has already been scheduled affect its next visit. The
script will not attempt to rewrite pulses already pending in the current row.

### Determinism is part of the instrument contract

Probability will use a small script-owned 32-bit pseudorandom generator. No
random decision will happen in `draw()`. The generator state will be
serialized, while an explicit reset will reseed it from the saved Seed setting
so a reset produces repeatable playback.

Tests will pin decisions and restored continuation for a chosen seed without
claiming that the sequence matches firmware `math.random()` or another
tracker.

## Firmware-facing I/O contract

### Inputs

| Input | Kind | Meaning |
| ---: | --- | --- |
| 1 | `kTrigger` | External row clock. Used only when Clock is External. |
| 2 | `kTrigger` | Reset transport position and deterministic random stream. |
| 3 | `kCV` | V/oct transpose sampled at each accepted note onset and added to saved transpose. |

Clock and reset will include Luading signal-generator comments that remain
ordinary Lua comments on hardware. Transpose CV will default to a neutral
generator.

`trigger()` will only set bounded pending flags and capture external clock
arrival timing. It will not emit notes directly. The next `step()` will process
reset before clock, sample Transpose CV, and schedule the row. A simultaneous
reset and clock therefore plays row 1 with the current transpose.

### Outputs

| Output | Kind | Meaning |
| ---: | --- | --- |
| 1, 3, 5, 7 | `kStepped` | Tracks 1-4 V/oct pitch. |
| 2, 4, 6, 8 | `kStepped` | Tracks 1-4 gate/accent voltage. |

Pitch is `(MIDI note - 60) / 12 + savedTranspose / 12 + transposeCV`, sampled
on an accepted note onset and clamped to `[-10, 10]` volts. A tie holds that
pitch even if Transpose CV subsequently moves. Gate/accent is mapped from
velocity 1-127 into `[5, 10]` volts, so even the quietest event remains an
unambiguous gate in the simulator's current threshold model. Muting or
stopping a track always drives its gate output to 0 V; pitch holds its last
value.

The script will not describe a stepped gate output as a calibrated envelope or
velocity DAC. The higher voltage is simply a useful accent convention.

## Tracker data model

### Cell representation

Each cell has four integer fields:

| Field | Range | Display | Meaning |
| --- | --- | --- | --- |
| Note | `-2`, `-1`, or MIDI `24-96` | `===`, `...`, or e.g. `C#4` | Tie, rest, or note onset. |
| Velocity | `1-127` | two hexadecimal digits in the detail view | Gate/accent level. |
| Probability | `0-100` | percentage | Chance that a note onset is accepted. |
| Ratchet | `1-4` | `x1`-`x4` | Evenly spaced triggers inside the row. |

Rest is the safe default. Velocity, probability, and ratchet remain populated
behind a rest so entering a note does not require rebuilding the other fields.
Tie never makes a probability decision and never starts a new note. It extends
an already sounding gate; if the track is silent, it remains silent.

### Dense storage

Patterns will use four dense numeric arrays—notes, velocities,
probabilities, and ratchets—each with exactly
`8 * 16 * 4 = 512` entries. A named helper will map
`pattern, row, track` to the single 1-based index. Dense arrays are chosen over
per-cell tables because they reduce allocation and serialize predictably as
JSON arrays.

The version-one saved state will contain only JSON-friendly values:

```lua
{
  version = 1,
  settings = {
    clock = 1,
    tempo = 120,
    rowsPerBeat = 2,
    gate = 60,
    swing = 0,
    transpose = 0,
    mode = 1,
    seed = 2026,
  },
  notes = { ...512 integers... },
  velocities = { ...512 integers... },
  probabilities = { ...512 integers... },
  ratchets = { ...512 integers... },
  song = { ...16 integers... },
  selectedPattern = 1,
  cursorRow = 1,
  cursorTrack = 1,
  mutes = { false, false, false, false },
  rng = 2026,
}
```

Song entries are `0` for the first/end marker or `1-8` for a pattern. Restore
will require `version == 1`, validate exact dense-array lengths, accept only
finite integers/booleans in the declared ranges, and copy values into fresh
owned tables. Invalid fields receive documented defaults; a badly malformed
top-level state falls back to the complete demo rather than partially aliasing
untrusted tables.

Transport state, playback position, output voltages, pending ratchets, gate-off
deadlines, current view, confirmation state, held-button timers, copy buffer,
toast, and undo record will not be serialized. A restored tracker starts
stopped at row 1, with all gates low.

The focused test will assert a bounded JSON byte size as a regression guard,
not as a claim about Disting NT preset capacity. Real hardware save/reload is a
separate validation item.

## Clock, gate, and event scheduling

### Internal clock

The internal clock supports 30-300 BPM and one, two, or four rows per beat.
`step()` accumulates `dt` and consumes due rows with a small fixed catch-up cap.
The maximum documented setting is twenty rows per second, far below the 1 ms
control cadence.

Swing alternates `base * (1 + swing/100)` for odd rows and
`base * (1 - swing/100)` for even rows, preserving `2 * base` across each
pair. At 0% the intervals are equal. At the maximum 60% setting the short row
is still 40% of base and remains bounded. Changing tempo or swing updates the
next unscheduled interval without rescaling a pulse that is already active.

Starting internal transport resets to row 1 and schedules it immediately.
Stopping clears all pending ratchets and gate deadlines and drives every gate
low. Starting external transport arms the next incoming clock instead of
inventing an event.

### External clock

Each accepted external trigger advances exactly one row. External trigger
intervals are measured for ratchet spacing, but Swing is intentionally ignored
because the incoming clock already defines the row timing and the script cannot
move an event earlier than an unknown future edge.

Before two external edges have established an interval, ratchets use the
current internal tempo and rows-per-beat setting as a documented fallback. A
new external clock cancels any remaining ratchets from the previous row before
scheduling the new one. This prevents stale bursts from crossing a suddenly
faster clock.

### Row evaluation

At a row event, each of the four tracks is evaluated in fixed track order:

1. A muted track cancels its pending events and lowers its gate.
2. A rest cancels pending events and lowers the gate.
3. A tie preserves the current pitch/gate state and creates no probability or
   ratchet event.
4. A note consumes one deterministic probability decision.
5. A rejected note behaves as a rest for that row.
6. An accepted note updates pitch and schedules one to four gate onsets evenly
   across the row interval.
7. Gate duration is the saved Gate percentage of one ratchet subdivision,
   capped so retriggers have at least one complete 1 ms low step.

If a new note arrives while the previous gate is high, the scheduler first
emits a 1 ms low state and then raises the new gate. The same rule applies
between ratchets. The final ratchet remains high across following tie rows and
falls on the first rest, rejected note, mute, stop, reset, or replacement note.

Scheduling will use fixed per-track arrays for at most four ratchet onsets and
gate-off times. The implementation will not allocate tables in every
`step()`, append to an unbounded queue, or use draw frames as a clock.

### Pattern and song advancement

Pattern mode wraps after row 16. A queued pattern becomes active only at that
boundary.

Song mode reads the current song slot, plays its pattern for sixteen rows, then
advances. Entry `0` loops to slot 1. If slot 1 is `0`, Pattern 1 is used as a
safe fallback and the display shows an empty-order warning. Reset returns to
song slot 1 and row 1.

## Control grammar

The interaction model has five persistent views and two transient overlays.
It will be implemented as an explicit finite-state model rather than a set of
loosely coupled booleans.

| View | Encoder 1 turn | Encoder 2 turn | Encoder 2 short press | Encoder 2 long press | Pot 3 press |
| --- | --- | --- | --- | --- | --- |
| Grid | Move row | Move track | Open Cell | Open Commands | Start/stop |
| Cell | Select field | Change value | Commit and return | Open Commands | Start/stop |
| Song | Move slot | Change pattern/end | Return to Grid | Open Commands | Start/stop |
| Settings | Move setting | Change value | Return to Grid | Open Commands | Start/stop |
| Help | Scroll page | No action | Return to Grid | Return to Grid | Start/stop |
| Commands | Move command | No action | Activate command | Close commands | Start/stop |
| Confirm | Choose No/Yes | For Clone, choose destination; otherwise choose No/Yes | Apply choice | Cancel | Start/stop |

Pot 1 always selects the edit pattern, Pot 2 always changes internal tempo, and
Pot 3 always changes swing. Their meanings do not change by view.

Encoder 2 press handling is deterministic:

- release before 500 ms with no turn is a short press;
- crossing 500 ms with no turn opens Commands exactly once;
- turning Encoder 2 while it is held marks the gesture as a chord, prevents a
  short/long action on release, and applies a coarse increment in Cell,
  Settings, or Song; and
- release always clears held/chord state, including after a view change.

Coarse Cell increments are one octave for Note, 16 for Velocity, 10 for
Probability, and one for Ratchet. Fine increments are one unit or one semitone.
All turns clamp at field bounds rather than wrapping into a destructive
sentinel. Grid row and track navigation wraps because it is non-destructive.

The Commands list is context-aware but uses a stable order:

1. Copy cell;
2. Paste cell;
3. Clear cell;
4. Clear row;
5. Clone pattern;
6. Toggle track mute;
7. Song;
8. Settings;
9. Undo;
10. Help.

Paste is disabled until a cell has been copied. Clear row and Clone pattern
open Confirm. In a Clone confirmation, Encoder 2 selects any destination other
than the source pattern while Encoder 1 retains the safe No/Yes choice. Clone
never silently overwrites. Disabled commands remain visible with a reason, so
an encoder press cannot appear to do nothing.

## Display architecture

### Shared visual language

- Use integer `drawBox`, `drawLine`, and `drawRectangle` plus standard/tiny
  text. Smooth primitives are unnecessary for a tracker grid and would add
  browser-dependent antialiasing.
- Shades 1-3 are structure, 4-7 inactive data, 8-11 ordinary live data, 12-14
  focus or queued state, and 15 cursor/playhead/action.
- Every view has one dominant selection, one playback indicator, and no more
  than one transient message.
- No unsupported glyphs, scrolling marquees, decorative animation, or
  draw-frame counters will be used.
- Formatting helpers will return bounded ASCII strings. Long labels will be
  shortened deliberately rather than clipped.

### Grid view

The grid reserves:

- y=0-7 for status (`P03`, Pattern/Song, row, Run/Stop, BPM or EXT);
- y=8-14 for four track headers and mute markers;
- y=15-58 for four visible tracker rows; and
- y=59-63 for tiny contextual help or a transient result.

The left 22 pixels show hexadecimal row numbers. The remaining 234 pixels form
four equal track columns. Each cell shows `...`, `===`, or a three-character
note plus tiny probability/ratchet marks. A box indicates the edit cursor; a
separate bright left marker indicates the playhead. If the playhead is outside
the cursor-centered four-row viewport, the header still shows its exact row.

The viewport follows the cursor, not playback. This prevents a running
sequence from pulling the edited cell away every row. Playback never mutates
the edit cursor.

### Cell view

The header shows pattern, row, and track. Four full-width rows show Note,
Velocity, Probability, and Ratchet with the selected field inverted. A fifth
line explains `TURN`, `HOLD+TURN`, or `PUSH BACK` using tiny text. Current gate
and pitch state remain visible as compact telemetry without displacing fields.

### Song, Settings, and Help

Song shows four order slots around the cursor, their pattern/end values, and a
separate playback slot marker. Settings shows four items at a time from Clock,
Tempo, Rows/Beat, Gate, Swing, Transpose, Mode, and Seed. Help uses two or three
fixed pages covering Grid, Cell, and transport gestures; it is not a complete
manual embedded in 64 pixels.

### Commands, confirmation, and feedback

Commands is a full-screen four-row menu, not a translucent overlay that leaves
unreadable grid fragments underneath. Confirmation displays the exact target
(`CLEAR ROW 0A?`, `CLONE P02 > P06?`) with No selected initially.

Copy, paste, clear, undo, mute, queued-pattern, reset, and empty-song results
use a bounded 800 ms status message driven by control-step time. The message
does not delay or alter musical events.

`draw()` returns `true` so the tracker owns all 64 rows. Every view will have a
focused command-list test plus text-overflow checks; the grid test will also
bound primitive count so an accidental all-pattern render cannot land.

## Runtime invariants

- All musical and UI state remains inside the Lua VM owned by the simulation
  worker; React only sends existing typed control events and renders existing
  draw commands.
- `trigger()` records pending clock/reset intent. `step()` is the sole owner of
  scheduled row evaluation, random decisions, pulse transitions, time, and the
  complete output buffer.
- Reset is processed before clock, and current transpose input is sampled
  before the row is evaluated.
- All pattern arrays remain exactly 512 entries and all song/mute arrays retain
  their fixed lengths after every operation and restore.
- The copy buffer contains a value copy of one cell, never an alias into the
  pattern arrays.
- One undo record owns value copies only and cannot reference a restored-state
  table.
- `draw()` is side-effect-free apart from emitting draw commands.
- No callback depends on browser wall time, frame count, object identity, or
  simulator-only globals.
- Every loop in `step()` has a small constant bound. Full-pattern loops occur
  only during initialization, explicit editing commands, or serialization.

## Failure handling

- Invalid restored state falls back visibly and safely; it never produces a
  partial array that can crash playback later.
- A malformed cell encountered despite restore validation is treated as a
  rest and repaired on the next committed edit/serialization pass.
- Unknown view or command values return to Grid.
- Clock-source changes stop transport, clear gates, reset interval history,
  and require an explicit restart.
- A tempo/division value outside its range is clamped at the setting boundary.
- A zero/invalid PRNG state is replaced with the saved non-zero Seed.
- A full Song order without an end marker wraps after slot 16; an end marker in
  slot 1 falls back to Pattern 1 and presents a warning.
- Runtime callback errors remain ordinary Luading runtime diagnostics; the
  script will not catch and hide programming errors with broad `pcall()`.

## Implementation increments and required tests

Tests are mandatory after every coherent increment.

### 1. Contract, fixed state, and serialization

- Add the required two leading description comments, returned name/author,
  named constants, I/O metadata, empty custom UI, default demo builder,
  flat-index helpers, settings/state normalization, and version-one
  `serialise()`.
- Restore `self.state` before constructing volatile runtime state.
- Keep output and scheduling buffers preallocated from initialization.

Focused Wasmoon tests will cover:

- exact three-input/eight-output names and kinds, zero parameters, callback
  availability, and custom UI opt-in;
- default array lengths/ranges and the known demo cells;
- exact flat-index mapping at all pattern/row/track corners;
- valid state round-trip with defensive copies;
- malformed version, wrong lengths, holes, non-numbers, infinities,
  out-of-range values, invalid booleans, zero seed, and unknown extra data;
- volatile-state exclusion and stopped/all-gates-low restore; and
- JSON compatibility plus a recorded byte-size regression ceiling.

Run the new focused test after this increment.

### 2. Deterministic transport and four-track scheduler

- Implement internal clock accumulation, paired swing intervals, external
  pending clocks and interval measurement, reset ordering, Pattern/Song
  advancement, transpose, PRNG probability, mutes, notes/rests/ties, ratchets,
  gate lengths, retrigger low steps, and the complete output buffer.
- Keep the maximum due-event work fixed by track and ratchet constants.

Focused tests will cover:

- exact internal row times at representative BPM/division values;
- long/short swing pairs preserving total time;
- external clocks using same-step transpose and fallback/measured ratchet
  spacing while ignoring internal swing;
- simultaneous reset/clock, stop/start, clock-source changes, and all-gate-low
  cancellation;
- V/oct pitch, semitone setting, transpose CV, output clamps, and 5-10 V
  velocity mapping;
- rest, tie, replacement-note low step, mute, rejected probability, and
  ratchet/gate-off behavior at 1 ms boundaries;
- deterministic probability, reset reseeding, and serialized continuation;
- queued Pattern-mode changes, Song order/end-marker wrapping, empty-order
  fallback, and reset to slot/row 1; and
- worst-case 300 BPM, four rows/beat, four tracks, and four ratchets without an
  unbounded queue or timeout.

Run the focused test after this increment.

### 3. Control state machine and safe editing

- Implement Grid, Cell, Song, Settings, Help, Commands, and Confirm states.
- Add exact short/long/chord handling for Encoder 2, fixed pot behavior,
  transport push, copy/paste, clear, clone, mute, and one-level transactional
  undo.
- Implement `setupUi()` from restored pattern/tempo/swing values.

Focused tests will cover:

- wrapped Grid navigation and non-wrapped value editing;
- every fine/coarse field increment and sentinel boundary;
- short release, 499 ms release, 500 ms long transition, held turn, release
  cleanup, repeated presses, and view changes while held;
- constant pot meanings, normalized setup positions, exact tempo/swing/pattern
  endpoints, and Pot 3 transport behavior;
- editing/playback position independence and queued pattern selection;
- copy-by-value, disabled paste, clear-cell undo, one-transaction cell edits,
  destructive confirmation defaulting to No, clone targets, mute cancellation,
  and replacement of the single undo record;
- Song and Settings edits plus Help/Commands return paths; and
- serialization during every transient state producing only committed durable
  data.

Run the focused test and the existing Lua-runtime custom-UI tests after this
increment.

### 4. Complete 256x64 display

- Implement the shared status formatter and all seven display states.
- Keep the Grid viewport cursor-centered and the playhead independent.
- Add bounded transient feedback driven by control-step time.

Focused tests will render and inspect:

- default, selected, muted, queued, running, external-clock, probability, tie,
  rest, ratchet, and offscreen-playhead Grid frames;
- all four Cell fields at minimum/maximum values;
- first/middle/last Song and Settings windows;
- every Commands disabled/enabled state;
- No/Yes confirmation and each Help page;
- expired versus active transient messages;
- no text overflow in any state; and
- a stable upper bound on draw-command count for the busiest frame.

Where useful, rasterize representative frames with the production display
renderer for local visual review. Do not make browser antialiasing or screenshot
pixels the semantic assertion for integer primitives.

Run the focused test and existing display-bound/rendering tests after this
increment.

### 5. Bundle integration, documentation, and final polish

- Confirm glob discovery under the Luading group and update the hard-coded
  community corpus count.
- Add the Micro Tracker behavior, controls, I/O, persistence, and limitations
  to `WORKBENCH_GUIDE.md`.
- Add the focused boundary guarantees and their limits to `TESTING.md`.
- Update the display-animation plan so its “every example” promise includes
  the completed tracker screen rather than silently omitting a new script.
- Keep `THIRD_PARTY_NOTICES.md` unchanged unless implementation introduces
  imported material.
- Keep this plan active until all acceptance criteria land. On completion,
  move it to `docs/archive/implementation-plans/`, add a dated historical
  banner with exact verification results, and update `docs/README.md`.

Run the focused tracker test, community and official corpus tests,
documentation tests, and conformance tests after this increment.

## Live browser validation

Automated Lua-boundary tests do not prove real pointer/keyboard control feel or
display readability. Validate the current production workbench in at least one
available browser and record the exact matrix:

- selecting Micro Tracker from the bundled Luading group and loading without
  diagnostics;
- hardware bank showing only Pot 1-3, Encoder 1-2, Encoder 2 push, and Pot 3
  push callbacks actually used by the script;
- mouse, keyboard, and coarse-pointer operation of both encoders and both push
  gestures;
- 499/500 ms short-versus-long behavior feeling usable rather than fragile;
- uninterrupted internal playback while navigating every screen;
- external clock and reset through normal signal generators, not the known
  direct-trigger shortcut when checking callback ordering;
- eight output tiles changing as four pitch/gate pairs;
- Save state, edit, reload, and restored content/PRNG continuation;
- display readability docked, floating, narrow, at high browser zoom, and in
  light/dark themes; and
- no overflow, stuck gate, repeated long-press action, or stale paused display.

Any paused-state staleness attributable to current UI-05 will be reported as a
known simulator limitation, not patched inside the script.

## Disting NT hardware validation

When hardware is available, record firmware version, preset routing, script
hash, and exact reproduction steps. The minimum matrix is:

- load the exported standalone file from MicroSD and confirm zero dependency on
  Luading metadata or modules;
- verify every essential gesture using only the documented algorithm custom-UI
  controls;
- inspect all seven display states for clipping, contrast, and readable note
  names on the physical OLED;
- measure representative C4/C5 pitch outputs and minimum/maximum gate/accent
  voltages with known routing;
- compare internal tempo, one swing pair, external row clocking, reset, ties,
  and four ratchets against a recorded trigger source;
- run the worst-case four-track/four-ratchet pattern at 300 BPM and four rows
  per beat, watching for missed UI input, display stalls, or output errors;
- save the preset, reload it, and verify patterns, song, settings, mutes, and
  random continuation while transient transport state resets; and
- switch away from and back to the algorithm UI to check `setupUi()` soft
  takeover on the named firmware.

Browser performance telemetry will not be used as evidence of hardware CPU or
heap headroom. If hardware is unavailable, the implementation handoff will say
so explicitly and will not describe the stress case as hardware-validated.

## Final verification workflow

Completion requires the focused commands recorded during each increment plus:

```bash
npm run test:conformance
npm test
npm run check
```

Also record:

- the focused Micro Tracker test command and exact test count;
- community and official corpus results;
- serialized default/maximal-state byte sizes as simulator regression data;
- busiest-frame draw-command count;
- the live-browser matrix completed or unavailable; and
- any physical Disting NT result separately with firmware and reproduction
  details.

## Acceptance criteria

The example is complete when:

- the standalone script implements the fixed four-track/eight-pattern tracker
  without new simulator APIs or hidden browser-only control dependencies;
- all authoring and transport tasks can be completed through the documented
  algorithm custom-UI callback subset chosen by this plan;
- the default demo, state normalization, flat arrays, and JSON-friendly
  serialization are deterministic, bounded, and covered through real Wasmoon;
- internal/external clocking, reset ordering, notes/rests/ties, probability,
  ratchets, gates, transpose, mutes, pattern queuing, and Song mode satisfy the
  explicit 1 ms behavior above;
- editing is separated from playback, destructive actions are confirmed, and
  copy/undo operations own values rather than aliases;
- all display states answer where playback is, what is selected, and what a
  control action will change without clipping or excessive command counts;
- the project and official script corpora still load and exercise callbacks;
- Workbench, testing, display-plan, and documentation-map text accurately
  describe the result and its evidence limits;
- focused, conformance, complete, coverage, TypeScript, lint, and production
  build checks pass through `npm run check`; and
- unavailable browser or hardware validation is reported exactly.

## Out of scope for version one

- A React tracker editor, piano roll, computer-keyboard note entry, MIDI learn,
  clipboard integration, drag/drop, file import, or tracker-specific worker
  protocol.
- Audio synthesis, samples, wavetable playback, MIDI output, recording incoming
  CV/MIDI, live step recording, or automation lanes.
- More than four tracks, eight patterns, sixteen rows, sixteen song slots, or
  four ratchets.
- Per-track clock division, polymeter, microtiming, scales, chord cells, effect
  commands, conditional triggers beyond probability, parameter locks, or
  pattern names.
- Multiple undo levels, redo, persistent clipboard/undo, edit history, or
  crash-recovery beyond normal preset state.
- Using Luading's `button1`-`button4`, Encoder 1 push, or Pot 1/2 push callbacks
  as required controls unless future hardware evidence promotes them for
  algorithm scripts and the conformance catalog is updated first.
- Estimating Disting NT CPU, heap, preset capacity, electrical thresholds, or
  timing accuracy from Wasmoon, browser telemetry, JSON size, or display frame
  rate.
- Claiming visual, timing, electrical, or persistence parity with another
  tracker product.
