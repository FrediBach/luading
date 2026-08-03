# Workbench guide

Luading uses a fixed-height development workbench so the editor, simulated
Disting controls, parameters, and active I/O stay close together. The simulator
still runs at `/`; the layout does not change the Disting NT Lua contract. See
[CONFORMANCE_STATUS.md](CONFORMANCE_STATUS.md) for current fidelity boundaries
and hardware-confirmation needs.

## Main regions

The command bar groups related controls into four predictable zones: script
project actions, execution and test-signal clock controls, script status, and
workbench utilities. On narrower viewports these zones move onto two or three
rows instead of turning the bar into a horizontally scrolling strip. This
keeps script selection and execution prominent while leaving a stable utility
zone for additions such as sharing. The controls include Lua file
import/export, Run/Reload and Pause/Resume, preset-state save, script health,
runtime status, workspace presets, MIDI routing, appearance, and About.

The center workspace is a resizable editor/instrument split on desktop. Drag
the divider, focus it and use the arrow keys, or double-click it to restore the
default ratio. The display preview starts in a reserved dock above the
instrument pane. Below 900 px, its dock sits below the Editor/Instrument tabs
so switching views never hides it. The dock participates in layout and does
not cover code, controls, or diagnostics. Drag its header, or focus the header
and use the arrow keys, to turn it into a viewport-clamped floating panel; use
**Dock** or press Escape from the move handle to return it to the responsive
dock.

The instrument rack contains the hardware controls, script parameters, inputs,
outputs, scope assignments, and opt-in Web Audio.
Input and output banks reserve a four-channel footprint, so scripts with fewer
channels keep the same tile width and minimum bank height without showing fake
controls.

### Script parameter presets

A script can declare ordered, named snapshots of all its script parameters in
a Luading-only member of the top-level returned table:

```lua
return {
  luading = {
    parameterPresets = {
      { name = "Slow", values = { 0.25, 20, 1 } },
      { name = "Fast", values = { 4.00, 100, 2 } },
    },
  },

  init = function(self)
    return {
      parameters = {
        { "Rate", 1, 1000, 100, kHz, kBy100 },
        { "Depth", 0, 100, 50, kPercent },
        { "Shape", { "Triangle", "Square" }, 1 },
      },
    }
  end,
}
```

Each preset needs a unique non-empty name and exactly one finite value for every
`init().parameters` entry, in the same order. Numeric values use the scaled
units visible in `self.parameters`; enums use 1-based option indices. Values
must be inside their declared ranges.

When valid presets exist, the Parameters header shows a compact preset
dropdown with the accessible name **Parameter preset**. Choosing a preset
applies the complete parameter vector atomically and works while the runtime is
paused. When a script also needs parameter-page navigation, the header wraps
the selector and paging controls together instead of clipping either control in
a narrow rack column.
The selector shows **Custom** whenever the current values no longer exactly
match a named preset, including after a control edit or Lua `setParameter()`
call. Initial load never auto-applies a preset; normal parameter defaults still
win, and reload does not remember the previous selection.

Use the Luading-only **Randomize all parameters** dice button in the Parameters
header to choose a new valid value for every script parameter, including
parameters on other pages. Numeric values stay on their declared scaled steps
and inside their minimum and maximum; enum parameters always select a declared
option.

Malformed preset declarations appear as non-blocking simulator diagnostics.
They do not stop an otherwise hardware-valid script from running. Disting NT
firmware does not interpret `luading.parameterPresets`; the snapshots do not
include `self.state`, system/routing parameters, signals, clock, audio/MIDI
routes, outputs, or workspace layout, and they are separate from **Save state**.
Every bundled parameterized example includes several ready-to-use snapshots;
parameterless examples do not show the selector.

### Simulator I/O defaults

A script can seed Luading's browser-only input generators and output audio
routes with trailing comments on individual `init()` entries:

```lua
inputs = {
  kCV,      -- Type: Gate, Synced: true, Division: 1/4
  kTrigger, -- Type: Trigger, Synced: true, Division: 1/8
},
outputs = {
  kStepped, -- Type: Kick Trigger
  kLinear,  -- Type: Synth Note
},
```

Input `Type` accepts the signal-generator names shown in the input inspector.
`Synced` accepts `true` or `false`, and `Division` accepts `2 bars`, `1 bar`, or
`1/2` through `1/32`. Output `Type` accepts `Off`, `Kick Trigger`,
`Snare Trigger`, `Hi-hat Trigger`, `Synth Note`, or `Synth Trigger`. Unknown or
missing values retain the normal defaults. These comments are Luading hints
only: they remain valid ordinary Lua comments and do not change Disting NT
behavior or the table returned by `init()`.

Right-click an input or output tile and choose **Copy Lua entry** to copy its
current generator or WebAudio setting as a complete, paste-ready `init()` table
entry. Web MIDI routes are browser connections and cannot be represented by
these source annotations; their context menu explains that limitation instead.

### Strudel mini-notation stress player

The bundled **Strudel Mini Notation Player** is a self-contained Disting NT Lua
script with one hardcoded pattern. It parses and schedules the mini-notation
forms documented by Strudel: fast and slow sequences (`[]` and `<>`), nesting,
rests, stacks, weights and ties, replication, speed multiplication and division,
cycle choice, degradation, and Euclidean rhythms. It also accepts the current
symbol-cheat-sheet forms for polymeters and fixed steps (`{}` and `%`), feet
(`.`), numeric ranges (`..`), and colon payloads.

One pattern cycle is mapped to a four-beat bar. **Tempo** changes its BPM,
**Gate** sets note-gate duration as a percentage of each event, and **Seed**
makes choice and degradation repeatable. The reset input returns playback to
cycle zero. Outputs 1–8 are four V/oct pitch and gate pairs; output 9 pulses at
each cycle boundary. When more than four notes overlap, the player steals the
voice whose gate would end first and increments the on-screen drop count.

This example implements the [Strudel mini-notation language](https://strudel.cc/learn/mini-notation/),
not Strudel's JavaScript pattern functions, sample engine, synths, effects, or
browser scheduler. Random choices have deterministic seeded semantics but do
not promise the same pseudorandom sequence as a particular Strudel release.
The colon adapter treats a numeric second value as gate velocity, so `60:0.8`
emits MIDI note 60 as 0 V with a 4 V gate. To change the pattern in this first
version, edit the `MINI_NOTATION` constant in the script and reload it.

### Freeform CV

Choose **Freeform CV** in an input's Signal generator inspector to create a
repeating voltage progression directly. Click or tap empty space in the graph
to add a point, drag a point to move it, or select it and enter exact phase and
voltage values. The two cycle-boundary points move vertically but stay at 0%
and 100%; interior points move on both axes and cannot cross their neighbors.
Point voltages range from -10 V to +10 V and adjacent points use linear
interpolation.

The normal Rate/Clock sync and Phase controls determine playback. A free-running
waveform uses simulation time; a synced waveform uses the shared test-signal
clock and holds its position while that clock is stopped. Freeform CV can also
drive inputs declared as `kGate` or `kTrigger`; the normal typed edge detection
still determines Lua callbacks.

For keyboard editing, focus a point and use Left/Right for phase or Up/Down for
voltage. Hold Shift for fine steps, and use Delete or Backspace to remove an
interior point. **Add point** inserts on the current curve in its largest gap,
and **Reset waveform** returns to a flat 0 V cycle. A waveform can contain up to
64 points.

Copied Lua defaults store the browser-only points as `phase@volts` pairs:

```lua
kCV, -- Type: Freeform CV, Synced: true, Division: 1/4, Points: 0@0|0.25@5|0.75@-2|1@0
```

Like the other input defaults, this is an ordinary Lua comment and is invisible
to the script and to Disting NT hardware. Direct input edits remain session
state and reset when a different Lua program loads unless copied into such a
default annotation.

Scope, Problems, Console, and Performance share the bottom drawer. The Console
tab is a read-only event log for script prints, errors, MIDI, I2C, and display
events; it is not the Disting NT's interactive Lua shell and cannot evaluate
commands. Select the active tab again to collapse the drawer. The drawer handle
supports pointer drag and keyboard resizing. Drawer filters and other local
view state are retained while switching tabs. Scope legend chips show compact
source identifiers such as **IN 1** and **OUT 1**; hover a source to see its
full signal name. Use the scope's **Pause** control to capture the current time
slice. Trigger, scale, and probe controls remain available while the trace and
its displayed channel values are frozen; choose **Resume** to return to the
live trace. Pausing the scope does not pause the Lua runtime.

With **Sync** enabled, the Trigger menu can lock the scope to an automatic
voltage crossing, a selected probe and level, or the shared **Global clock**.
Global-clock sync uses the clock's recorded beat phase, so it remains stable
across tempo changes and while clock-synced inputs reset or reshape the plotted
signal. This is the most predictable view for scripts such as the bundled
Vector LFO. Disable **Sync** for a continuously moving latest-time window.

At widths below 900 CSS pixels, the center workspace becomes top-level Editor
and Instrument tabs instead of one long vertical page. Arrow keys, Home, and
End move between those tabs. Inspectors become bottom sheets at phone widths,
and coarse-pointer devices receive larger hit targets automatically.

## Shared control behavior

- Drag vertically to adjust a rotary value; hold Shift for fine adjustment.
- Use the mouse wheel or arrow keys for one step.
- Use Page Up and Page Down for larger changes, and Home or End for bounds.
- Double-click an adjustable value to restore its default.
- Select the numeric readout to type an exact value.
- Press Space or Enter for momentary buttons and toggles.
- Press Escape to close an inspector, popover, or menu.
- Use arrow keys, Home, and End to move among workbench or drawer tabs.

Exact values remain visible, and every custom numeric control exposes its name,
value, range, and disabled state to assistive technology. Toggles expose pressed
state; probe labels include their number and source rather than relying on color.
Runtime state announcements change only when the state changes, while new
blocking errors are announced and open the relevant drawer workspace.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Run or reload Lua | Command/Ctrl+Enter |
| Show or focus hover documentation | Command/Ctrl+K, then Command/Ctrl+I |
| Go to symbol in the script | Command/Ctrl+Shift+O |
| Go to local definition | F12 |
| Rename a resolved local symbol | F2 |
| Pause or resume Lua | Command/Ctrl+Alt+P |
| Code, Patch, Monitor, Compact preset | Command/Ctrl+Alt+1 through 4 |
| Scope, Problems, Console, Performance drawer | Command/Ctrl+Alt+Shift+1 through 4 |

Shortcuts that intentionally apply while editing are fully modified to avoid
capturing ordinary Monaco keystrokes. Workspace presets change presentation
only; they do not change script, simulator, preset, or audio state.

## Web MIDI

Web MIDI is optional and browser-local. It requires a browser that implements
the Web MIDI API and a secure context such as the HTTPS production deployment
or `localhost`. Browsers without Web MIDI support retain the simulator's manual
MIDI sender and all non-MIDI features.

After loading a program, open **MIDI** in the command bar and choose **Connect
Web MIDI**. Luading requests ordinary MIDI access only (`sysex: false`) after
this explicit action. The browser may prompt for permission. A denial is shown
as a MIDI status and does not pause or stop Lua; use the browser's site settings
if permission needs to be changed later.

The MIDI popover enables physical inputs and maps browser outputs to the four
documented Disting destinations: Breakout, Select Bus, USB, and Internal. An
input tile can then use Web MIDI for CC, pitch bend, note-to-V/oct, velocity,
note gate, or trigger conversion. An output tile can route exclusively to Off,
Web Audio, MIDI CC, MIDI pitch bend, or MIDI note/gate.

Port choices and channel routes reset when the loaded program changes. Luading
does not persist MIDI device identifiers. Its scheduling and MIDI-to-voltage
conversion happen in the browser and are simulator conveniences, not evidence
of Disting NT hardware timing fidelity.

## Text size

Use the **Aa** control in the command bar to choose Small, Standard, or Large
text. The preference is stored in the browser and applies to
workbench labels, controls, diagnostics, and the Lua editor. It is independent
of workspace density, so the Compact preset does not reduce text size. The
simulated Disting display keeps its hardware-defined bitmap typography.

## Editor navigation

Monaco's Go to Symbol outline lists lifecycle callbacks, local
functions, algorithm metadata, `init()` metadata sections, and named script
parameters. Go to Definition and Rename Symbol work for confidently resolved
local variables, local functions, and callback parameters. Rename does not
rewrite globals, object members, table keys, strings, or comments.

Hover over a Disting API or constant, supported Lua global/library member, Lua
keyword, lifecycle or metadata field, or resolved local symbol to see its
documentation. Hover appears after a short delay; a plain click only moves the
cursor. Use Command/Ctrl+K followed by Command/Ctrl+I to open or focus the same
documentation from the keyboard.

Callback bodies, local functions, and metadata tables spanning at least three
lines can be folded from the gutter. Formatting is not offered until a Lua
5.4-compatible formatter proves idempotent across every bundled script. Inlay
hints are not enabled because the compact editor does not yet expose an opt-in
preference for them.

## Accessibility and motion

All interactive controls have visible keyboard focus. Icon-only actions provide
programmatic names and visible tooltips. Popovers focus their first useful
control and return focus to their trigger when closed. Drawer and responsive
tabs use linked tab/tab-panel semantics with one tab stop per tab list.

Reduced-motion preferences remove control transitions, glow animation, and
signal emphasis effects that are not needed to communicate state. Active,
warning, error, routed, and paused states use text, borders, shapes, or icons in
addition to color.

## Performance interpretation

The Performance drawer reports the current browser's callback and scheduling
measurements. It is useful for finding simulator-local regressions, but it is
not calibrated Disting NT CPU usage. Real Disting NT hardware remains the final
authority.

## Importing and exporting scripts

Use **New** to replace the editor with a minimal, working one-input/one-output
script. Its short comments mark where to add shared state, I/O and parameters,
signal processing, and optional lifecycle callbacks.

Use **Import** in the command bar to open a local `.lua` file. Luading replaces
the editor contents and runs the imported script through the same isolated Lua
worker used for bundled scripts. Imported files do not inherit helper modules
from a previously selected bundled script.

Use **Export** to download the editor's current contents as a `.lua` file. This
exports the source exactly as shown in the editor; simulator state and workspace
layout are not included.
