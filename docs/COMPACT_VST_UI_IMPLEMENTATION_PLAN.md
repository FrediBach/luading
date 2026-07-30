# Compact VST-Style UI Implementation Plan

## Status

Implementation in progress. This document describes a presentation and
interaction redesign; it does not change the documented Disting NT Lua
contract.

### Progress ledger

Last updated: 2026-07-30

Current milestone: command bar completion and utilities.

| Session | Status | Notes |
| --- | --- | --- |
| 1. Baseline and interaction contract | Partial | Source/CSS inventory, workflow inventory, density targets, and interaction rules are documented. Before screenshots and viewport measurements remain pending because a controllable browser was unavailable in the implementation session. |
| 2. Workbench shell | Implemented; visual QA pending | Added the fixed-height shell, compact command bar, persisted split/drawer layout state, keyboard-accessible resizers, instrument rack, tabbed bottom drawer, and status bar. Existing device, patch, audio, scope, quality, console, and performance behavior was recomposed without changing worker messages. |
| 3. Shared control primitives | Implemented; visual QA pending | Added the project-local icon set, tooltip, corner action, icon toggle, exact value field, popover, tile, rotary, endless encoder, push rotary, momentary button, segmented selector, meter, signal glyph, and downsampled mini signal plot. Pure interaction math and server-rendered accessibility semantics are covered by focused tests. |
| 4. Disting device face | Implemented; visual QA pending | Replaced the three native pot sliders, two encoder button groups, and four hardware buttons with pushable rotary controls, endless encoders, and momentary buttons. Added the compact display bezel and save-state control. Typed pot turns, encoder turns, pushes, and releases retain the existing `uiEvent` request contract. |
| 5. Parameter bank | Implemented; visual QA pending | Replaced native parameter sliders with paged custom controls. Documented scales determine exact steps; bipolar values use center-detented rotaries; unscaled values use stepped rotaries; short enums use segmented controls; long enums use searchable custom menus. Default reset and exact numeric entry are available, and enum indices remain 1-based. |
| 6. Input channel tiles | Implemented; visual QA pending | Replaced the full input patch bay with compact channel tiles and contextual inspectors. Tiles show actual downsampled worker traces, current voltage, generator shape, timing, direct primary values, sync, and trigger fire. Inspectors expose every signal shape plus frequency/division, amplitude, offset, phase, pulse width, step count, manual voltage, and deterministic seed where applicable. |
| 7. Output tiles and WebAudio | Implemented; browser QA pending | Replaced the output row and separate audio router with traced output tiles, channel-local destination popovers, and a shared audio master with enable, level, waveform, and error states. Target-viewport and live WebAudio activation/error checks remain pending because no controllable browser was available. |
| 8. Scope workspace | Implemented; browser QA pending | Replaced the legacy scope panel with a drawer-native workspace, compact toolbar, routed legend chips, responsive graph, focused-probe highlighting, and input/output tile assignment. First-free assignment never overwrites occupied probes; a chooser makes replacements explicit. Live resize and target-viewport checks remain pending because no controllable browser was available. |
| 9. Problems, console, performance | Implemented; browser QA pending | Added compact health/diagnostic, typed console, and browser-local performance workspaces. Lists are bounded; console filtering, copy, clear-view, and autoscroll controls are present; new blocking diagnostics and runtime errors open the relevant drawer tab. |
| 10. Command bar and utilities | Partial | Script selection, Run, Pause/Resume, health, and runtime state are in the command bar. The global test-signal clock now has a compact custom control in the I/O deck; final command-bar placement, MIDI, workspace presets, shortcuts, and About remain pending. |
| 11. Responsive and accessibility | Partial | Split and drawer resizers are keyboard accessible, focus styles are present, and an interim narrow layout is retained. Editor/Instrument responsive modes and full accessibility QA are pending. |
| 12. Performance and release gate | Partial | Removed frame-driven Monaco marker resets, scheduled simulator frames as non-urgent React work, froze inactive drawer workspaces while preserving local state, bounded scope rendering to 1,000 extrema-preserving points, and downsampled output traces before rendering. Live browser profiling and final legacy cleanup remain pending. |

Implemented files:

- `src/disting/workbench/WorkbenchShell.tsx`
- `src/disting/workbench/CommandBar.tsx`
- `src/disting/workbench/SplitPane.tsx`
- `src/disting/workbench/InstrumentRack.tsx`
- `src/disting/workbench/BottomDrawer.tsx`
- `src/disting/workbench/StatusBar.tsx`
- `src/disting/workbench/useWorkbenchLayout.ts`
- `src/disting/workbench/workbench-layout.ts`
- `src/disting/workbench/workbench-layout.test.ts`
- `src/disting/workbench/drawer-panel.ts`
- `src/disting/workbench/drawer-panel.test.ts`
- `src/disting/workbench/workbench.css`
- `src/disting/controls/control-math.ts`
- `src/disting/controls/ControlIcon.tsx`
- `src/disting/controls/Tooltip.tsx`
- `src/disting/controls/CornerAction.tsx`
- `src/disting/controls/IconToggle.tsx`
- `src/disting/controls/ValueField.tsx`
- `src/disting/controls/ControlPopover.tsx`
- `src/disting/controls/ControlTile.tsx`
- `src/disting/controls/RotaryControl.tsx`
- `src/disting/controls/EndlessEncoder.tsx`
- `src/disting/controls/PushRotaryControl.tsx`
- `src/disting/controls/MomentaryButton.tsx`
- `src/disting/controls/SegmentedSelector.tsx`
- `src/disting/controls/LevelMeter.tsx`
- `src/disting/controls/SignalShapeGlyph.tsx`
- `src/disting/controls/MiniSignalPlot.tsx`
- `src/disting/controls/controls.css`
- focused tests in `src/disting/controls/control-math.test.ts` and
  `src/disting/controls/control-rendering.test.tsx`
- `src/disting/device/DistingDeviceFace.tsx`
- `src/disting/device/DistingDisplayBezel.tsx`
- `src/disting/device/HardwareControlBank.tsx`
- `src/disting/device/SaveStateControl.tsx`
- `src/disting/device/hardware-controls.ts`
- `src/disting/device/device.css`
- focused tests in `src/disting/device/hardware-controls.test.ts` and
  `src/disting/device/device-rendering.test.tsx`
- `src/disting/device/ParameterBank.tsx`
- `src/disting/device/ParameterControl.tsx`
- `src/disting/device/parameter-controls.ts`
- focused tests in `src/disting/device/parameter-controls.test.ts` and
  `src/disting/device/parameter-rendering.test.tsx`
- `src/disting/io/IoDeck.tsx`
- `src/disting/io/InputChannelTile.tsx`
- `src/disting/io/InputChannelInspector.tsx`
- `src/disting/io/input-source-controls.ts`
- `src/disting/io/OutputChannelTile.tsx`
- `src/disting/io/OutputRoutingPopover.tsx`
- `src/disting/io/AudioMasterControl.tsx`
- `src/disting/io/output-audio-controls.ts`
- `src/disting/io/useOutputAudio.ts`
- `src/disting/io/ScopeAssignmentButton.tsx`
- `src/disting/io/io.css`
- focused tests in `src/disting/io/input-source-controls.test.ts`,
  `src/disting/io/input-rendering.test.tsx`,
  `src/disting/io/output-audio-controls.test.ts`, and
  `src/disting/io/output-rendering.test.tsx`
- `src/disting/drawer/ScopeWorkspace.tsx`
- `src/disting/drawer/ScopeToolbar.tsx`
- `src/disting/drawer/ScopeLegend.tsx`
- `src/disting/drawer/scope-controls.ts`
- `src/disting/drawer/ProblemsWorkspace.tsx`
- `src/disting/drawer/QualitySummary.tsx`
- `src/disting/drawer/DiagnosticsList.tsx`
- `src/disting/drawer/ConsoleWorkspace.tsx`
- `src/disting/drawer/PerformanceWorkspace.tsx`
- `src/disting/drawer/drawer-workspaces.ts`
- `src/disting/drawer/drawer.css`
- focused tests in `src/disting/drawer/scope-controls.test.ts` and
  `src/disting/drawer/scope-rendering.test.tsx`
- focused tests in `src/disting/drawer/drawer-workspaces.test.ts` and
  `src/disting/drawer/workspace-rendering.test.tsx`
- `src/disting/workbench/HealthBadge.tsx`
- `src/disting/editor/diagnostic-markers.ts`
- `src/disting/editor/diagnostic-markers.test.ts`
- `src/disting/io/trace-values.ts`

Verification completed through Session 9:

- focused workbench layout tests: 4 passed;
- focused control math and rendering tests: 11 passed;
- focused device mapping/rendering tests: 7 passed;
- focused parameter metadata/rendering tests: 8 passed;
- focused input helper/rendering tests: 9 passed;
- focused output helper/rendering tests: 6 passed;
- focused scope assignment/rendering tests: 7 passed;
- focused drawer workspace helper/rendering tests: 8 passed;
- TypeScript project build: passed;
- lint: passed;
- complete test suite: 52 files and 234 tests passed;
- coverage thresholds: passed; and
- production build through `npm run check`: passed.

The next implementation session is Session 10: complete the command bar and
utilities, including MIDI, workspace presets, shortcuts, and About content.
Visual QA of the shell, custom controls, and Session 9 drawer workspaces at the
target viewports remains required. A local Vite server was available during
Session 9, but the browser-control runtime reported no connected browser
backend, so viewport and live interaction claims remain intentionally pending.
The same limitation prevented an interactive running-versus-paused typing and
heap comparison after the targeted responsiveness remediation.

## Objective

Replace the current vertically stacked website-style interface with a compact,
fixed-height development workbench inspired by audio plug-ins and software
instruments.

The redesigned interface should:

- keep the editor, simulated Disting controls, parameters, and active I/O
  visible together;
- combine controls with the channel or feature they affect;
- use purpose-built controls with labels, live visual feedback, exact values,
  and small corner actions;
- move scope, diagnostics, logs, and performance data into a collapsible bottom
  drawer;
- avoid document-level scrolling on normal desktop displays;
- preserve the existing worker boundary and all Disting-facing behavior; and
- remain fully operable with a mouse, trackpad, and keyboard.

This is a compact professional tool, not a photorealistic recreation of the
hardware. Visual richness should come from signal traces, meters, control arcs,
state indicators, and clear grouping rather than decorative skeuomorphism.

## Non-goals

- Do not change the Lua lifecycle, callbacks, API, constants, parameter
  normalization, display behavior, MIDI filtering, preset behavior, or bus
  semantics.
- Do not present browser performance as calibrated Disting NT CPU usage.
- Do not replace the Monaco editor or move Lua execution onto the main thread.
- Do not introduce patch cables or a general modular-synthesis graph in the
  first version.
- Do not hide exact numeric values behind visual controls.
- Do not require touch-first behavior at the expense of desktop density.
- Do not rewrite emulator modules merely to support presentation changes.

## Current layout problems

The current application renders several large, independent sections:

1. a 72 px top bar;
2. a marketing-style introduction and runtime feature strip;
3. a two-column editor and simulated-device workbench;
4. a permanently expanded script-quality report under the editor;
5. a full-width input patch bay;
6. a full-width WebAudio router;
7. a full-width scope with separate routing and control rows;
8. four large runtime metric cards; and
9. a separate event log or error console.

This makes related controls spatially distant. For example, an output's current
voltage, scope assignment, and WebAudio destination are located in three
different sections. Input timing also requires several website form controls
instead of presenting timing as one property of the input channel.

The mobile breakpoint compounds the problem by stacking the major workbench
columns and all following sections vertically.

## Target information architecture

```text
┌──────────────────────── Command bar: 44–48 px ────────────────────────┐
│ Script ▾  Run  Pause │ Clock 120 BPM ▶ │ Save │ Health │ Status │ ⋯ │
├──────────────────────────────┬─────────────────────────────────────────┤
│                              │ Disting device face                     │
│                              │ ┌──────── display ────────┐ controls    │
│ Lua editor                   ├─────────────────────────────────────────┤
│                              │ Parameter bank                          │
│                              ├─────────────────────────────────────────┤
│                              │ Inputs                 Outputs          │
│                              │ [tile] [tile]           [tile] [tile]   │
├──────────────────────────────┴─────────────────────────────────────────┤
│ Scope │ Problems 3 │ Console │ Performance             drawer handle  │
│               Collapsible and vertically resizable content            │
├──────────────────────────────── Status bar: 20–24 px ──────────────────┤
│ Lua 5.4 · 1 kHz step · 30 fps draw · cursor/runtime detail            │
└────────────────────────────────────────────────────────────────────────┘
```

### Desktop sizing targets

- Command bar: 44–48 px high.
- Status bar: 20–24 px high.
- Editor: initially 60% of workbench width.
- Instrument rack: initially 40% of workbench width.
- Editor/rack divider: keyboard-accessible and draggable.
- Bottom drawer: 30–34 px collapsed; 180–240 px initially open.
- Instrument rack sections: 8 px internal spacing, 4–8 px corner radii.
- Channel tiles: approximately 112–128 px wide and 100–116 px high.
- Custom-control pointer targets: at least 28×28 px on desktop.
- No document-level scrolling at 1280×720 or larger.

Individual editor, rack, inspector, and drawer regions may scroll when their
content exceeds the available space.

## Interaction language

All custom controls should follow the same interaction rules:

- Drag vertically to adjust a continuous value.
- Hold Shift while dragging for fine adjustment.
- Use the mouse wheel while the control is hovered or focused for one step.
- Use arrow keys for one step and Page Up/Page Down for a larger step.
- Press Home/End for the minimum/maximum where appropriate.
- Double-click a value control to restore its default.
- Click the numeric value to enter an exact value.
- Click a tile body to open its inspector.
- Click a corner action to toggle one clearly named feature.
- Press Escape or click outside to close a popover or inspector.
- Use tooltips to explain icons, but never rely on a tooltip to communicate
  essential state.

Active, inactive, warning, and error states must differ by more than color.
Use a combination of fill, border, indicator shape, icon, and text. All
interactive components require visible focus states and accessible names.

## Control anatomy

A standard control tile contains four layers:

1. **Identity:** channel number, name, and kind at the top.
2. **Visualization:** live trace, meter, waveform glyph, step position, or
   control arc in the center.
3. **Value:** exact formatted numeric or enum value at the bottom.
4. **Feature actions:** applicable icon buttons in consistent corners.

Corner actions should have stable meanings:

- top-right: enable, monitor, or audio state;
- bottom-right: scope assignment;
- top-left, when not occupied by identity: sync or link state; and
- bottom-left: momentary action such as firing a trigger.

Not every tile should display every action. Unavailable actions are omitted,
not disabled without explanation.

## New component architecture

The names below are recommended component boundaries. Small presentational
pieces may remain colocated until reuse justifies separate files.

### Workbench shell

#### `WorkbenchShell`

Owns the fixed-height application layout. It composes the command bar,
editor/rack split, bottom drawer, and status bar. It should not own simulator
behavior.

Responsibilities:

- calculate the available viewport height;
- prevent document-level desktop scrolling;
- apply compact, comfortable, or touch density;
- coordinate focus when regions are opened or collapsed; and
- expose workspace preset and responsive-mode state.

#### `CommandBar`

The always-visible command surface. It contains script selection, run controls,
clock transport, state save, health status, runtime state, and utilities.

It replaces the current top bar, editor panel header actions, global clock
header, and device save-state button.

#### `ScriptMenu`

Compact script/example selector that displays the current program name. Its
popover groups bundled scripts using the current example groups. It should
support keyboard search without changing script-loading semantics.

#### `RunControls`

Contains Run/Reload and Pause/Resume. It presents loading and error states
without changing the worker lifecycle. Keyboard shortcuts should remain visible
in tooltips and menus.

#### `ClockTransport`

Displays global clock running state and BPM in one compact control.

Direct actions:

- start/stop clock;
- drag or type BPM;
- optional tap tempo; and
- open a small menu for reset or future clock options.

The simulator's Run/Pause state and the test-signal clock state are distinct
and must be labelled distinctly.

#### `SaveStateControl`

Replaces the device-panel Save State text button. It shows unsaved/saved state
with an icon and accessible text and sends the existing `serialise` request.

#### `HealthBadge`

Shows a compact result such as `92 A · 2 warnings`. Selecting it opens the
Problems drawer tab. Errors should be announced and may open the drawer
automatically.

#### `RuntimeStatus`

Shows booting, loading, running, paused, or error state. It may include
simulated time in a tooltip or expanded popover.

#### `WorkspacePresetMenu`

Applies saved layout presets:

- Code: editor dominant, drawer collapsed;
- Patch: balanced editor and rack;
- Monitor: rack and scope dominant; and
- Compact: maximum control density.

The preset changes presentation state only.

#### `SplitPane`

Provides the editor/rack divider.

Requirements:

- pointer drag;
- arrow-key resizing when focused;
- sensible minimum sizes;
- double-click reset;
- persisted ratio; and
- no iframe-style overlays or event traps over Monaco.

#### `InstrumentRack`

Scrollable container for the device face, parameter bank, and I/O deck. It
provides the visual chassis and section grouping but does not duplicate the
state held by `DistingPlayground`.

#### `StatusBar`

Compact technical status area. It may show Lua/WASM version, control and draw
rates, editor cursor position, and the browser-local timing disclaimer. It
replaces the large introductory runtime strip.

#### `BottomDrawer`

Collapsible, vertically resizable drawer shared by Scope, Problems, Console,
and Performance.

Requirements:

- preserve active tab and height;
- support collapsed, open, and maximized states;
- retain tab content state when switching;
- open the relevant tab for errors or selected diagnostics; and
- restore focus to the invoking control when closed.

#### `DrawerTabs`

Tab list with count/status badges. It must implement standard accessible tab
keyboard behavior and avoid mounting duplicate scope or diagnostics state.

### Shared control primitives

#### `ControlTile`

Shared frame for parameter and channel controls. It provides identity,
visualization, value, corner-action slots, selected state, focus handling, and
inspector anchoring.

#### `CornerAction`

Small icon toggle or momentary button used inside tiles. It normalizes active,
pressed, unavailable, warning, tooltip, and accessible-label behavior.

#### `RotaryControl`

Continuous or stepped rotary control with an SVG value arc, indicator, exact
value field, pointer capture, keyboard control, and reset behavior.

It accepts numeric mapping and formatting functions so Disting parameter
scaling remains outside the visual primitive.

#### `EndlessEncoder`

Relative rotary input that emits discrete negative or positive turns instead of
an absolute value. Dragging and the wheel should convert movement into the same
`-1` or `+1` messages already sent by the simulated encoders.

#### `PushRotaryControl`

Composes a rotary control with a push action for the three simulated pots. It
must visually distinguish turning from pressing and preserve push/release event
ordering.

#### `MomentaryButton`

Reusable press-and-release button for the four hardware buttons and trigger
fire actions.

Requirements:

- pointer cancellation safety;
- keyboard Space/Enter behavior;
- clear pressed visualization; and
- no stuck pressed state if focus or pointer capture is lost.

#### `ValueField`

Exact-value readout and inline editor. It handles units, validation, commit,
cancel, clamping, and formatting without losing the last valid value.

#### `IconToggle`

General toolbar-style toggle for sync, audio, scope, and similar binary
features. Use `aria-pressed` and visible state text in its tooltip.

#### `SegmentedSelector`

Compact selector for small enum sets such as waveform or trigger edge. Long
enums should use a popover list instead.

#### `MiniSignalPlot`

Small SVG or canvas plot derived from actual trace data. It supports bipolar CV,
unipolar gates, triggers, and stepped outputs.

The plot must:

- downsample rather than render all 5,000 trace points;
- avoid allocations on every animation frame where practical;
- use the existing delivered trace instead of inventing signal state; and
- expose a textual current-value equivalent for accessibility.

#### `SignalShapeGlyph`

Static compact glyph for manual, sine, triangle, saw, square, gate, trigger,
sequencer, arpeggio, sample-and-hold, and noise sources. It identifies the
configured generator when a live trace is temporarily unavailable.

#### `LevelMeter`

Compact voltage/activity representation used when a full trace is unnecessary.
It supports bipolar center indication and gate/trigger state.

#### `ControlPopover`

Positioned inspector/popover used for advanced channel settings, output routing,
MIDI tools, and workspace menus.

It should:

- remain within the viewport;
- return focus to its trigger;
- close on Escape and outside click;
- avoid covering the value being adjusted when possible; and
- switch to a sheet at narrow widths.

#### `Tooltip`

Consistent delayed tooltip for icon meaning, current state, and keyboard hints.
It must not be the only source of required instructions.

#### `ControlIcon`

Project-local SVG icon wrapper. Add a purpose-built icon set for play, pause,
reload, clock, sync, speaker, scope, reset, save, warning, error, drawer, menu,
trigger, MIDI, and workspace modes. Do not reuse the unrelated social symbols
in the current public icon sheet.

### Simulated Disting surface

#### `DistingDeviceFace`

Compact representation of the simulated module. It composes the display,
hardware controls, UI-mode indicator, and optional MIDI utility entry point.

The face should preserve the relative grouping of the display and physical
controls without claiming to be a dimensionally exact hardware drawing.

#### `DistingDisplayBezel`

Wraps the existing `DistingDisplay` canvas in a compact bezel with program name,
Custom UI/Standard UI state, and optional simulated-time readout.

The underlying 256×64 rendering and 16-shade behavior remain unchanged.

#### `HardwareControlBank`

Arranges three `PushRotaryControl` instances, two `EndlessEncoder` instances,
and four `MomentaryButton` instances. It translates primitive events into the
existing `DistingUiControl` messages.

#### `ParameterBank`

Responsive bank of script parameters directly below the device face.

Responsibilities:

- choose a control presentation from parameter metadata;
- maintain 1-based user-facing parameter language where relevant;
- support paged or horizontally scrollable banks for large scripts; and
- avoid remounting controls on every frame.

#### `ParameterControl`

Adapts a `ParameterDefinition` and current value to `RotaryControl`,
`SegmentedSelector`, or a popover enum selector.

Rules:

- continuous numeric range: continuous rotary;
- range spanning negative and positive: center-detented rotary;
- integer range: stepped rotary;
- short enum: segmented or stepped rotary;
- long enum: compact value button plus searchable popover.

### Unified I/O deck

#### `IoDeck`

Contains compact input and output channel groups. It replaces the independent
input patch bay, output voltage row, and WebAudio routing section.

The deck header contains only group labels and global audio state. It must not
repeat a large generic panel heading.

#### `InputChannelTile`

Shows:

- input number, script name, and CV/gate/trigger kind;
- current voltage;
- configured signal shape;
- actual mini trace or activity visualization;
- sync state when timing is applicable;
- scope assignment and probe color; and
- a trigger-fire action for trigger inputs.

Its primary adjustment is context-sensitive:

- Manual/DC: voltage;
- free LFO: frequency;
- clocked source: division;
- gate/trigger: rate or division with pulse activity; and
- sequencer/arpeggio: rate or division with current step.

Selecting the body opens `InputChannelInspector`.

#### `InputChannelInspector`

Contains advanced signal-generator settings currently rendered as a grid of
native form fields:

- signal shape;
- clocked/free timing;
- clock division or frequency;
- amplitude;
- offset;
- phase;
- pulse width;
- step count;
- deterministic seed; and
- exact manual voltage.

Only settings applicable to the selected shape are shown. Sync is a direct
toggle rather than a separate Timing select. Changing shape should continue to
use documented shape defaults and the existing `setInputSource` request.

#### `OutputChannelTile`

Shows:

- output number, script name, and stepped/linear kind;
- exact voltage;
- actual trace or gate activity;
- scope assignment and probe color;
- audio enabled state; and
- current audio destination when routed.

Selecting the audio corner opens `OutputRoutingPopover`.

#### `OutputRoutingPopover`

Moves per-output WebAudio destination selection next to the output it affects.
It offers the current destinations: off, kick, snare, hi-hat, synth note, and
synth trigger.

WebAudio remains a browser monitoring convenience and must never feed state
back into the simulation.

#### `AudioMasterControl`

Global WebAudio enable and master-level control. It lives in the I/O deck
header or command bar, not in a separate panel.

It retains browser activation/error handling and shows a clear distinction
between audio disabled, enabled, and unavailable.

#### `ScopeAssignmentButton`

Shared corner action for input and output channels.

Recommended first-version behavior:

- click unassigned channel: assign it to the first free probe;
- click assigned channel: focus/highlight that scope channel;
- menu action: choose a specific probe or unassign it; and
- show the probe color on the channel tile.

This avoids silently replacing an existing probe when all four are occupied.

### Drawer workspaces

#### `ScopeWorkspace`

Hosts the existing trace rendering and scope model inside the bottom drawer. It
composes the graph, compact toolbar, and channel legend.

The pure trigger and window-selection behavior in `emulation/scope-model.ts`
should remain reusable and presentation-independent.

#### `ScopeToolbar`

One compact row containing:

- sync/free-run toggle;
- automatic or explicit trigger source;
- rising/falling edge;
- manual trigger level when applicable;
- trigger lock status;
- horizontal scale; and
- vertical scale.

Common settings remain directly visible. Less common settings may use a
popover.

#### `ScopeLegend`

Compact colored chips for the four probes. Each chip shows channel identity and
current voltage and can reroute or unpatch that probe.

#### `ProblemsWorkspace`

Combines the quality score, summary, category breakdown, and diagnostics list.
Selecting a source diagnostic reveals its editor range using the existing
reveal request.

#### `QualitySummary`

Compact score, grade, validation state, compatibility profile, and error,
warning, and note counts. Category detail may collapse when vertical space is
limited.

#### `DiagnosticsList`

Virtualized or bounded list of findings with severity, message, detail,
suggestion, target, line/callback, and penalty. It replaces the permanently
expanded findings list under the editor.

#### `ConsoleWorkspace`

Displays runtime errors, Lua logs, and hardware events. It supports clear,
copy, pause-autoscroll, and filters for Lua, MIDI, I2C, display mode, and
errors.

Clearing the visible console must not alter worker or preset state.

#### `PerformanceWorkspace`

Compact presentation of average, p95, worst step, dropped steps, local budget,
and callback-level metrics.

The browser-local disclaimer must remain permanently visible in this workspace.

### Utility components

#### `MidiEventTool`

Compact MIDI message sender shown only for scripts declaring MIDI input. The
first version may retain three byte fields and Send while improving formatting,
hex display, validation, and common-message presets.

It should live in a device-face utilities popover rather than occupying a full
row.

#### `AboutPopover`

Contains the explanatory material removed from the introductory hero:

- one persistent Lua 5.4 VM;
- 1 ms control steps;
- 30 fps drawing;
- worker isolation; and
- the distinction between simulator behavior and real hardware authority.

## State ownership

`DistingPlayground` should remain the main-thread coordinator during the first
implementation sessions. New components receive state and callbacks rather
than communicating with workers directly.

### Simulator state

Continue to own in `DistingPlayground`:

- loaded program;
- runtime status and errors;
- input source configuration and live input values;
- parameter values;
- output values;
- trace;
- display commands;
- runtime statistics;
- scope probes;
- MIDI bytes;
- saved preset state;
- diagnostics; and
- worker lifecycle.

### Presentation state

Move into a dedicated `useWorkbenchLayout` hook or small context:

- editor/rack split ratio;
- active drawer tab;
- drawer height and collapsed state;
- workspace preset;
- control density;
- active inspector/popover;
- selected parameter bank page; and
- responsive Editor/Instrument mode.

Persist only stable presentation preferences in local storage. Do not persist
transient runtime, Lua, input voltage, error, or pointer-drag state through the
layout store.

### Feature-local state

Keep close to the feature:

- WebAudio router instance, enable state, routes, waveform, and audio errors;
- scope trigger mode, source, edge, level, and zoom;
- console filters and autoscroll; and
- inline value-entry drafts.

## Suggested source layout

```text
src/disting/
  workbench/
    WorkbenchShell.tsx
    CommandBar.tsx
    SplitPane.tsx
    InstrumentRack.tsx
    BottomDrawer.tsx
    StatusBar.tsx
    useWorkbenchLayout.ts
  controls/
    ControlTile.tsx
    CornerAction.tsx
    RotaryControl.tsx
    EndlessEncoder.tsx
    PushRotaryControl.tsx
    MomentaryButton.tsx
    ValueField.tsx
    IconToggle.tsx
    SegmentedSelector.tsx
    MiniSignalPlot.tsx
    SignalShapeGlyph.tsx
    LevelMeter.tsx
    ControlPopover.tsx
    Tooltip.tsx
    ControlIcon.tsx
  device/
    DistingDeviceFace.tsx
    DistingDisplayBezel.tsx
    HardwareControlBank.tsx
    ParameterBank.tsx
    ParameterControl.tsx
    MidiEventTool.tsx
  io/
    IoDeck.tsx
    InputChannelTile.tsx
    InputChannelInspector.tsx
    OutputChannelTile.tsx
    OutputRoutingPopover.tsx
    AudioMasterControl.tsx
    ScopeAssignmentButton.tsx
  drawer/
    ScopeWorkspace.tsx
    ScopeToolbar.tsx
    ScopeLegend.tsx
    ProblemsWorkspace.tsx
    QualitySummary.tsx
    DiagnosticsList.tsx
    ConsoleWorkspace.tsx
    PerformanceWorkspace.tsx
  styles/
    tokens.css
    workbench.css
    controls.css
    device.css
    io.css
    drawer.css
```

This is a destination structure, not a requirement to create every file before
it is needed. Extract incrementally and avoid files that contain only a trivial
wrapper.

## Design tokens

Create explicit tokens before implementing custom controls:

```css
--workbench-command-height
--workbench-status-height
--workbench-drawer-collapsed-height
--space-1 through --space-4
--control-target
--control-radius
--panel-radius
--surface-canvas
--surface-panel
--surface-raised
--surface-recessed
--line-subtle
--line-active
--text-primary
--text-secondary
--signal-primary
--signal-warning
--signal-error
--probe-1 through --probe-4
--control-arc-width
--focus-ring
```

Use density modifiers rather than scattered media-query overrides:

```text
data-density="compact"
data-density="comfortable"
data-density="touch"
```

## Multi-session implementation plan

Each session below should leave the repository in a working state and conclude
with focused verification. Later sessions may be split further if review
uncovers unexpected interaction or accessibility complexity.

### Session 1: Baseline, measurements, and interaction contract

**Goal:** Establish measurable targets and lock the intended behavior before
moving components.

Tasks:

1. Capture desktop layouts at 1440×900, 1280×720, and 1024×768.
2. Capture the current narrow layout at approximately 768 and 390 px.
3. Record current workflows for loading, running, pausing, changing an input,
   firing a trigger, changing a parameter, routing audio, assigning a scope
   probe, opening a diagnostic, saving state, and sending MIDI.
4. Create a compact wireframe or developer-only static prototype for the shell,
   one input tile, one output tile, and the drawer.
5. Confirm the density targets and accessible interaction rules in this
   document.
6. Identify any uncommitted user changes before implementation and avoid
   overlapping them.

Deliverables:

- approved shell geometry;
- approved channel-tile anatomy;
- before screenshots and measurement notes; and
- a short checklist for regression comparison.

Verification:

- no production behavior changes;
- existing test suite remains unchanged and passing if run.

### Session 2: Workbench tokens and fixed-height shell

**Goal:** Replace the page flow with the fixed workbench while retaining current
controls.

Tasks:

1. Add design tokens and density modes.
2. Implement `WorkbenchShell`, `CommandBar`, `SplitPane`,
   `InstrumentRack`, `BottomDrawer`, `DrawerTabs`, and `StatusBar`.
3. Remove the introductory hero from the daily workspace.
4. Move explanatory runtime information to a temporary About popover or status
   bar.
5. Place the existing editor on the left and existing device content on the
   right.
6. Place the existing scope, quality panel, console, and metrics into drawer
   tabs without redesigning their internals.
7. Persist split ratio, drawer height, drawer state, and active tab.
8. Ensure Monaco resizes correctly after split or drawer changes.

Deliverables:

- fixed-height desktop workbench;
- resizable editor/rack split;
- functional bottom drawer; and
- no loss of existing controls.

Focused verification:

- layout-state reducer/hook tests;
- split and drawer clamping tests;
- manual Monaco resize and keyboard divider test;
- `npm test`.

### Session 3: Shared control primitives

**Goal:** Build and validate the interaction foundation before converting
feature controls.

Tasks:

1. Implement `ControlIcon`, `Tooltip`, `CornerAction`, `IconToggle`,
   `ValueField`, and `ControlPopover`.
2. Implement `RotaryControl`, `EndlessEncoder`, `PushRotaryControl`, and
   `MomentaryButton`.
3. Implement `ControlTile`, `SegmentedSelector`, `LevelMeter`,
   `SignalShapeGlyph`, and a non-live `MiniSignalPlot` fixture mode.
4. Add reduced-motion behavior and high-contrast focus treatments.
5. Verify pointer capture cancellation and keyboard operation.
6. Add a developer control gallery if that materially speeds visual review;
   do not expose it as a production route.

Deliverables:

- reusable, accessible control library;
- visual states for idle, hover, focus, active, warning, error, and disabled;
  and
- numeric and enum formatting adapters.

Focused verification:

- value/angle and step mapping tests;
- clamping and default-reset tests;
- pointer movement to relative encoder-step tests;
- value-field parse/commit/cancel tests;
- momentary push/release ordering tests;
- manual keyboard and screen-reader smoke test;
- `npm test`.

### Session 4: Disting device face

**Goal:** Replace website form controls for the simulated hardware with a
compact physical control surface.

Tasks:

1. Implement `DistingDeviceFace`, `DistingDisplayBezel`, and
   `HardwareControlBank`.
2. Place the existing 256×64 canvas in the bezel without altering rendering.
3. Replace three pot range inputs with `PushRotaryControl`.
4. Replace the two `− / Push / +` groups with `EndlessEncoder`.
5. Replace the four numbered buttons with `MomentaryButton`.
6. Preserve custom UI versus standard UI labelling.
7. Move Save State to `SaveStateControl`.
8. Keep the existing `uiEvent` event values and ordering.

Deliverables:

- complete compact simulated front panel;
- mouse, wheel, drag, and keyboard hardware interactions; and
- unchanged worker message contract.

Focused verification:

- control-to-`DistingUiControl` adapter tests;
- push/release cancellation tests;
- manual custom-UI bundled-script smoke test;
- display pixel-size and scaling check;
- `npm test`.

### Session 5: Parameter bank

**Goal:** Convert script parameters to dense, metadata-driven controls.

Tasks:

1. Implement `ParameterBank` and `ParameterControl`.
2. Define the control-selection rules for continuous, bipolar, integer, and
   enum parameters.
3. Add exact entry, unit formatting, fine adjustment, and reset to the script
   default.
4. Add paging or horizontal bank scrolling for scripts with many parameters.
5. Prevent live frame updates from remounting or stealing focus from active
   controls.
6. Verify enum values retain their existing 1-based mapping.

Deliverables:

- compact parameter bank under the device face;
- correct controls for every supported parameter form; and
- reliable behavior with large parameter sets.

Focused verification:

- parameter-to-control-kind tests;
- enum index/value mapping tests;
- step-size and reset tests;
- focused-control update test;
- bundled examples with continuous, scaled, integer, and enum parameters;
- `npm test`.

### Session 6: Input channel tiles and inspectors

**Goal:** Replace the full input patch bay with compact, channel-centric
controls.

Tasks:

1. Implement `IoDeck`, `InputChannelTile`, `InputChannelInspector`,
   `SignalShapeGlyph`, and live `MiniSignalPlot`.
2. Show identity, kind, current voltage, configured shape, timing state, and
   live trace on every tile.
3. Implement the sync corner toggle and context-sensitive primary control.
4. Move advanced signal fields into the inspector.
5. Add trigger Fire as a momentary corner action.
6. Preserve shape defaults, clock division values, signal normalization, and
   deterministic seed behavior.
7. Downsample trace data for plots and memoize tiles to limit frame-time cost.
8. Remove the old `InputPatchBay` only after feature parity is confirmed.

Deliverables:

- full feature parity for every `SignalShape`;
- direct clocked/free timing switch;
- compact live channel overview; and
- no separate full-width patch-bay section.

Focused verification:

- applicable-field visibility tests for every signal shape;
- sync conversion and timing control tests;
- shape-default regression tests;
- trigger-fire worker request test;
- mini-plot downsampling tests;
- signal-source emulator tests;
- `npm test`.

### Session 7: Output tiles and integrated WebAudio routing

**Goal:** Combine output values, monitoring, audio routing, and scope entry
points.

Tasks:

1. Implement `OutputChannelTile`, `OutputRoutingPopover`, and
   `AudioMasterControl`.
2. Display actual output traces and exact voltages.
3. Add stepped/linear identity.
4. Move per-output destination selection to the tile popover.
5. Move audio enable and master level to the I/O header or command bar.
6. Preserve waveform selection in a compact global audio menu.
7. Preserve browser audio activation and error reporting.
8. Remove the old output row and `OutputAudioRouter` presentation after parity
   is confirmed.

Deliverables:

- unified input/output deck;
- channel-local audio routing;
- visible audio destinations and enable state; and
- no separate full-width audio section.

Focused verification:

- route selection and reset tests;
- audio enabled/disabled state tests;
- output-count change tests;
- WebAudio error-state manual test;
- audio-routing emulator tests;
- `npm test`.

### Session 8: Integrated scope workspace

**Goal:** Make the scope a compact drawer tool connected directly to channel
tiles.

Tasks:

1. Implement `ScopeWorkspace`, `ScopeToolbar`, `ScopeLegend`, and
   `ScopeAssignmentButton`.
2. Move routing from the large scope header into legend chips and tile corner
   actions.
3. Implement first-free-probe assignment without overwriting occupied probes.
4. Provide an explicit probe chooser when all probes are occupied.
5. Convert sync/free run and trigger edge to compact icon or segmented controls.
6. Retain automatic trigger selection, manual trigger level, lock status, and
   time/voltage zoom.
7. Ensure the graph responds to drawer resizing without distorting labels or
   traces.

Deliverables:

- compact scope drawer;
- channel-local scope assignment;
- preserved four-probe behavior; and
- no redundant routing header.

Focused verification:

- first-free and all-occupied assignment tests;
- unassign/focus behavior tests;
- scope trigger and window model tests;
- resize and collapsed-drawer manual test;
- `npm test`.

### Session 9: Problems, console, and performance workspaces

**Goal:** Remove permanently expanded secondary information while improving
access to errors and details.

Tasks:

1. Implement `ProblemsWorkspace`, `QualitySummary`, `DiagnosticsList`,
   `ConsoleWorkspace`, and `PerformanceWorkspace`.
2. Wire `HealthBadge` to the Problems tab.
3. Preserve source-range reveal behavior.
4. Open Problems or Console automatically for blocking errors.
5. Add console filters, copy, clear-view, and autoscroll controls.
6. Present runtime metrics in a compact row with callback detail on demand.
7. Keep the browser-local timing disclaimer visible.
8. Remove the old expanded quality, metric-card, and console sections.

Deliverables:

- complete secondary-tool drawer;
- always-visible compact health state;
- easier error navigation; and
- no secondary full-width sections below the workbench.

Focused verification:

- drawer-opening policy tests;
- diagnostic selection/reveal tests;
- console filter tests;
- quality-score and performance diagnostic tests;
- manual error, warning, log, MIDI, and I2C event checks;
- `npm test`.

### Session 10: Command bar completion and utilities

**Goal:** Finish the top-level workflow and remove remaining duplicated
headers.

Tasks:

1. Complete `ScriptMenu`, `RunControls`, `ClockTransport`,
   `SaveStateControl`, `RuntimeStatus`, `WorkspacePresetMenu`,
   `MidiEventTool`, and `AboutPopover`.
2. Add shortcuts for Run/Reload, Pause/Resume, drawer tabs, and workspace
   presets.
3. Ensure the signal clock and runtime transport cannot be confused.
4. Move MIDI byte entry into the utilities popover.
5. Remove obsolete panel headings and runtime strips.
6. Add accessible command names and shortcut hints.

Deliverables:

- one coherent command surface;
- compact MIDI tool;
- no duplicated Run, clock, save, status, or script controls; and
- complete Code, Patch, Monitor, and Compact workspace presets.

Focused verification:

- shortcut handling tests;
- script selection and load-state tests;
- clock versus runtime transport tests;
- saved-state status tests;
- MIDI validation and send tests;
- `npm test`.

### Session 11: Responsive behavior and accessibility

**Goal:** Make the compact workbench robust across viewport sizes and input
methods.

Tasks:

1. At 900–1199 px, reduce rack columns while preserving the split layout where
   practical.
2. Below 900 px, replace vertical stacking with top-level Editor and Instrument
   modes.
3. Convert popovers to sheets where narrow widths require them.
4. Apply touch density and larger hit targets at touch-oriented breakpoints.
5. Verify 200% browser zoom, long program names, long parameter names, and
   translated-like text expansion.
6. Verify logical focus order, focus restoration, accessible names, tab
   semantics, and live error announcements.
7. Verify reduced motion and adequate contrast.
8. Confirm that custom controls remain usable without a pointing device.

Deliverables:

- usable 390 px, 768 px, 1024 px, 1280 px, and 1440 px layouts;
- keyboard-complete workbench;
- documented accessibility decisions; and
- no document-level desktop scroll.

Focused verification:

- responsive layout-state tests;
- keyboard-only workflow;
- screen-reader smoke test;
- zoom and text-overflow visual review;
- reduced-motion review;
- `npm test`.

### Session 12: Performance, polish, documentation, and release gate

**Goal:** Remove legacy code, verify performance, and complete the redesign.

Tasks:

1. Profile main-thread rendering with the editor active, four live scope
   probes, and all channel plots visible.
2. Memoize channel controls and downsample trace visuals where measurements
   justify it.
3. Verify that Monaco typing does not cause disruptive control or plot work.
4. Remove obsolete components and CSS after confirming no remaining imports.
5. Consolidate design tokens and remove superseded media-query rules.
6. Update architecture documentation for presentation boundaries if component
   ownership materially changed.
7. Add user-facing documentation or screenshots for the new workspace.
8. Execute the full regression and visual acceptance matrix.

Deliverables:

- production-ready compact interface;
- no dead legacy panel code;
- updated documentation;
- before/after comparison; and
- completed acceptance checklist.

Required verification:

```bash
npm test
npm run check
```

Run the following only if implementation work changed the public Lua contract:

```bash
npm run test:conformance
```

## Testing strategy

### Pure behavior tests

Prefer pure helpers for:

- pointer delta to value or encoder steps;
- value clamping and stepping;
- rotary value to angle;
- parameter metadata to control kind;
- exact-value parsing and formatting;
- scope first-free-probe assignment;
- layout-state persistence and clamping;
- trace downsampling; and
- diagnostic drawer-opening policy.

### Component interaction tests

Add component-level coverage where practical for:

- keyboard adjustment;
- `aria-pressed` toggle state;
- momentary push/release ordering;
- pointer cancellation;
- popover focus return;
- drawer tab semantics;
- exact value entry; and
- shortcut conflict prevention while Monaco has focus.

### Existing emulator tests

Retain existing tests for:

- input signal source normalization and sampling;
- scope trigger selection and windowing;
- audio routing;
- callback outputs;
- parameter and preset behavior;
- worker messages; and
- Wasmoon boundary behavior.

Presentation work should consume these behaviors rather than reimplement them.

### Manual visual matrix

Review at:

- 1440×900;
- 1280×720;
- 1024×768;
- 768×1024;
- 390×844;
- 200% browser zoom;
- reduced-motion mode; and
- keyboard-only operation.

Exercise scripts with:

- no parameters;
- many parameters;
- continuous and enum parameters;
- no inputs or outputs;
- multiple CV inputs;
- gate and trigger inputs;
- stepped and linear outputs;
- custom UI;
- MIDI input;
- serialization;
- runtime logs;
- validation errors; and
- runtime errors.

## Performance requirements

- Do not render all retained trace points inside every channel tile.
- Downsample mini plots to approximately one sample per horizontal pixel or
  less.
- Avoid creating new audio router or control instances during frame delivery.
- Keep active pointer-drag state local so a frame update does not interrupt it.
- Memoize channel tiles using the values they actually display.
- Preserve the editor model boundary; do not mirror every Monaco edit through
  unrelated control components.
- Measure browser-local UI performance separately from simulated callback
  telemetry.

## Accessibility requirements

- Every custom control has an accessible role, name, current value, minimum,
  maximum, and step where applicable.
- Toggles expose pressed state.
- Drawers and popovers manage and restore focus.
- All icon-only controls have visible tooltips and programmatic names.
- Keyboard users can perform every adjustment and momentary action.
- Exact numeric input is always available.
- Probe identity is not communicated by color alone.
- Running, paused, loading, and error states have text equivalents.
- Error announcements do not repeatedly interrupt users on every frame.
- Motion used for meters or active states respects reduced-motion settings.

## Acceptance criteria

The redesign is complete when:

- at 1440×900, the editor, display, hardware controls, parameters, and active
  I/O channels are usable without document scrolling;
- at 1280×720, Run/Pause, global clock, runtime state, display, and core channel
  controls remain visible, with the drawer collapsible;
- at narrow widths, users switch between Editor and Instrument instead of
  scrolling through every desktop panel;
- every input tile communicates signal type, timing mode when applicable,
  current voltage, and activity without opening its inspector;
- input sync, trigger fire, scope assignment, output monitoring, and audio
  routing are available directly from their channel tiles;
- all existing input signal shapes and settings remain available;
- all existing parameter forms remain adjustable with exact values;
- all simulated hardware controls preserve their current worker events;
- scope triggering and four-probe behavior remain intact;
- WebAudio remains opt-in and browser-local;
- errors and diagnostics remain easy to find and navigate;
- no common workflow requires visiting a separate full-width page section;
- custom controls work with pointer, wheel, keyboard, and exact entry;
- existing bundled scripts continue to load and execute through Wasmoon;
- `npm test` passes; and
- `npm run check` passes.

## Risks and mitigations

### Excessive custom-control complexity

Mitigation: finish and test the primitive interaction contract before converting
feature controls. Use one adjustment model everywhere.

### Dense UI becoming cryptic

Mitigation: keep labels and exact values visible, use consistent icon placement,
and provide stateful tooltips. Do not replace all text with icons.

### Too many popovers

Mitigation: keep the primary value and most common feature toggles on the tile.
Use inspectors only for secondary configuration.

### Main-thread rendering cost

Mitigation: downsample traces, memoize tiles, preserve the Monaco model boundary,
and profile with worst-case visible channels before final polish.

### Worker-contract regression

Mitigation: keep worker communication in `DistingPlayground` during the
redesign. New visual components receive typed callbacks and do not post messages
directly.

### Scope assignment ambiguity

Mitigation: assign only to a free probe automatically. Never silently replace
an occupied probe.

### Confusing simulator transport and signal clock

Mitigation: label Run/Pause as simulator execution and show the clock as a
separate BPM transport with distinct icons and tooltips.

### Responsive regression into vertical page stacking

Mitigation: use Editor/Instrument modes below 900 px and a sheet-style drawer,
not a single column containing every desktop section.

## Recommended first milestone

The first reviewable milestone should include:

1. the fixed-height workbench shell;
2. a functioning command bar;
3. the resizable editor/rack split;
4. the collapsible bottom drawer with existing scope and diagnostics content;
5. one production-quality input tile;
6. one production-quality output tile; and
7. the shared rotary, value, icon-toggle, mini-plot, and popover primitives used
   by those tiles.

This vertical slice validates geometry, density, live visualization,
interaction rules, accessibility, and state flow before every existing control
is converted.
