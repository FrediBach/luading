# Workbench guide

Luading uses a fixed-height development workbench so the editor, simulated
Disting controls, parameters, and active I/O stay close together. The simulator
still runs at `/`; the layout does not change the Disting NT Lua contract.

## Main regions

The command bar contains script selection, Lua Run/Reload and Pause/Resume, the
separate test-signal clock, preset-state save, script health, runtime status,
workspace presets, conditional MIDI input, and About.

The center workspace is a resizable editor/instrument split on desktop. Drag
the divider, focus it and use the arrow keys, or double-click it to restore the
default ratio. The instrument rack contains the display and hardware controls,
script parameters, inputs, outputs, scope assignments, and opt-in Web Audio.

Scope, Problems, Console, and Performance share the bottom drawer. Select the
active tab again to collapse it. The drawer handle supports pointer drag and
keyboard resizing. Drawer filters and other local view state are retained while
switching tabs.

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
| Go to symbol in the script | Command/Ctrl+Shift+O |
| Go to local definition | F12 |
| Rename a resolved local symbol | F2 |
| Pause or resume Lua | Command/Ctrl+Alt+P |
| Code, Patch, Monitor, Compact preset | Command/Ctrl+Alt+1 through 4 |
| Scope, Problems, Console, Performance drawer | Command/Ctrl+Alt+Shift+1 through 4 |

Shortcuts that intentionally apply while editing are fully modified to avoid
capturing ordinary Monaco keystrokes. Workspace presets change presentation
only; they do not change script, simulator, preset, or audio state.

## Editor navigation

Monaco's Go to Symbol outline lists lifecycle callbacks, local
functions, algorithm metadata, `init()` metadata sections, and named script
parameters. Go to Definition and Rename Symbol work for confidently resolved
local variables, local functions, and callback parameters. Rename does not
rewrite globals, object members, table keys, strings, or comments.

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
