# Workbench guide

Luading uses a fixed-height development workbench so the editor, simulated
Disting controls, parameters, and active I/O stay close together. The simulator
still runs at `/`; the layout does not change the Disting NT Lua contract.

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
default ratio. The instrument rack contains the display and hardware controls,
script parameters, inputs, outputs, scope assignments, and opt-in Web Audio.
Input and output banks reserve a four-channel footprint, so scripts with fewer
channels keep the same tile width and minimum bank height without showing fake
controls.

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

Scope, Problems, Console, and Performance share the bottom drawer. Select the
active tab again to collapse it. The drawer handle supports pointer drag and
keyboard resizing. Drawer filters and other local view state are retained while
switching tabs. Scope legend chips show compact source identifiers such as
**IN 1** and **OUT 1**; hover a source to see its full signal name. Use the
scope's **Pause** control to capture the current time slice. Trigger, scale, and
probe controls remain available while the trace and its displayed channel
values are frozen; choose **Resume** to return to the live trace. Pausing the
scope does not pause the Lua runtime.

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
