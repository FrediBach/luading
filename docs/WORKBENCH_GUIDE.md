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
The bundled-script selector groups first-party project examples under
**Luading** and upstream official examples under **Expert Sleepers**.

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

### Buchla 266 Source of Uncertainty recreation

The bundled **Source of Uncertainty** example is an independently authored,
control-rate adaptation of the random-voltage sections documented for the
[Buchla Model 266](https://sourceofuncertainty.com/products/model-266) and
[266t](https://tiptopaudio.com/manuals/Buchla_%26_Tiptop_Audio_266t.pdf). It
provides two continuously fluctuating outputs, the classic paired quantized
outputs, and two stored random outputs.

**Rate A** and **Rate B** set the fluctuating sections from 0.05-50 Hz. Their CV
inputs use a one-volt-per-octave rate multiplier. The script generates these
voltages by low-pass filtering a serialisable pseudorandom stream; this captures
the idea of a voltage-controlled probable rate of change without claiming the
statistics or analogue response of a physical 266.

The Quantized Pulse input selects both stepped pitch outputs. **N+1** has N+1
centre-weighted states at whole-volt intervals, while **2^N** has 2^N evenly
distributed states at semitone intervals. **Quantization N** and its CV input
choose N from 1-6, with the CV adding one step per volt. The Stored Pulse input
updates an equal-probability 0-10 V output and a weighted 0-10 V output.
**Distribution** moves the weighted result from a low tendency through a
centre tendency to a high tendency; Distribution CV adds 20 percentage points
per volt. Both pulse events are completed in `step()` after current CV inputs
are sampled, so modulation arriving with a pulse affects that pulse.

Preset state stores the pseudorandom sequence position and all six current
voltages, allowing the next uncertain decision to continue after restoration.
The original module's audio-rate coloured-noise sources, integrator, and
sample-and-hold section are intentionally omitted. The fluctuating outputs run
at Disting NT's documented 1 ms Lua cadence, and none of the random
distributions, voltage tolerances, or control curves have been validated
against physical Buchla hardware.

### Configurable swing sequence

The bundled **Configurable Swing Sequence** delays successive external clock
triggers by a repeating pattern of up to sixteen microtiming values. **Length**
chooses the active loop size, and **Step 01** through **Step 16** express delay
as a percentage of one measured input-clock interval. Thus `0%, 20%` represents
the pattern `{ 0, 0.2 }`, while `0%, 0%, 20%, 0%` delays only the third position
of each four-step loop. The included presets provide those two patterns and a
straight eight-step clock.

Input 1 supplies the clock, input 2 resets the loop so the next clock uses step
one, and the single output emits a +5 V trigger with the selected **Pulse**
length. The first clock after loading passes immediately because an interval
has not yet been measured. Microtiming is delay-only: an external clock cannot
be moved earlier without knowing its future arrival. The script uses Disting
NT's documented 1 ms `step()` cadence, so scheduled triggers are quantized to
the next control step rather than claiming sub-millisecond timing.

### Matrix Variation Generator

The bundled **Matrix Variation** example is an independent Disting NT
recreation of the central musical idea in Darwin Grosse's ArdCore AC18
Variation Generator. A clock advances through an original sixteen-column,
ten-row gate matrix. Each active cell emits a +5 V trigger on its corresponding
lane, giving ten related rhythm outputs from one clock.

**Row Offset** rotates which source rhythm feeds each output, while **Column
Offset** rotates the phase read from the matrix. The Row CV and Column CV inputs
add one wrapped offset step per volt, including negative movement for bipolar
modulation. **Pulse** sets the retriggerable gate duration from 1-250 ms. Reset
makes a simultaneous or subsequent clock read step one, and the display shows
the shifted matrix, current playback/source columns, offsets, and pulse state.

The script is a control-rate adaptation rather than an ArdCore source port: it
uses an independently authored pattern and Disting NT's documented 1 ms Lua
cadence. Clock handling is completed in `step()` so a clock edge uses the CV
values sampled in that same control step.

### Particle Bursts recreation

The bundled **Particle Bursts** example is an independent Disting NT adaptation
of the trigger-variation ideas documented in Patching Panda's
[Particles manual](https://patchingpanda.com/wp-content/uploads/Particles_manual.pdf).
Four trigger inputs feed four processed outputs. The Clock input measures the
base interval, Reset clears pending bursts and returns sequenced shifting to its
original position, and output 5 produces a new 0-10 V random value on every
clock. Dedicated Rate, Shift, Probability, Absorb, and Gater CV inputs modulate
the matching global controls.

**Repetitions** is the total number of candidate pulses including the original.
The candidates are evenly spread across the selected **Distribution** of 16-64
measured clock intervals; for example, two pulses at C16 place the repeat eight
clock intervals after the original. Before a clock interval has been measured,
the script uses 125 ms. **Triplets: Filtered** steps triplet-derived repetition
choices down to the previous straight choice. Each channel's repeat limit caps
the global or CV-selected menu position.

**Probability** may remove any candidate, including the original, while
**Absorb** applies only to repeats. Their per-channel limits cap the effective
global/CV percentage. The Gater alternates passing and muted blocks at its
selected clock division, again capped per channel. Fixed shift rotates the
input/output mapping by a stable amount; Forward and Random choose a new base
rotation on each clock, with Shift CV added afterward. A channel in **Bypass**
passes only its original trigger directly to the same-numbered output, ignoring
shift and variation, while **Mute** suppresses it completely.

This loose recreation is not a source port, hardware emulation, or panel-level
clone. It replaces the module's sliders, button gestures, LEDs, SD-card saving,
and mode menus with explicit script parameters and Luading presets. It does not
implement the manual's cross-channel repetition-choke matrix. Pulse scheduling
is quantized to Disting NT's documented 1 ms Lua cadence, and the original
module's unpublished probability distributions and electrical timing have not
been measured on hardware.

### ADDAC 508 Swell Physics recreation

The bundled **ADDAC 508 Swell Physics** example independently recreates the
behavior described in the [ADDAC508 user guide](https://www.addacsystem.com/contents/productdownload/ADDAC508_SwellPhysics_A_1-compressed.pdf).
Its deterministic water surface sums one primary swell and four progressively
shorter, differently directed Gerstner-style vertical wave components.
**Swell** sets the height and can drive the normalized surface beyond its
ordinary range, while **Agitation** mixes in the secondary waves. **Spread**
and **Speed** set the sampling distance and simulation rate.

In **Scrolling** mode, all four buoys follow exactly the same path. Spread is a
quadratic delay control from coincident sampling to two seconds between
adjacent buoys. In **Evolving** mode, the buoys sample the corners of a square
that grows with Spread; increasing Spread and Agitation therefore makes their
paths less related. **Fold**, **Thru**, and **Limit** are explicit parameter
choices for the manual's three clipping behaviors rather than a hidden panel
switch gesture.

Outputs 1-4 carry the buoy heights, output 5 their arithmetic average, output 6
is +5 V while output 1 is below output 2, and output 7 is +5 V while output 3
is above output 4. **Bipolar** maps the clipped surface to -5 to +5 V;
**Positive** maps it to 0-10 V. Gain scales that base voltage and Offset is
then added. Inputs 1-4 modulate Swell, Agitation, Spread, and Speed through
individual bipolar depth parameters. **Aux target** routes input 5 to Offset
at one volt per input volt or to Gain at 20 percentage points per input volt,
before the shared Aux depth is applied.

This is not a source port or a claim of exact ADDAC508 output matching: the
hardware's wave coefficients, control curves, random or evolving state, and
electrical implementation are not published in the manual. The script's wave
field and scaling choices are original, run at Disting NT's documented 1 ms Lua
cadence, and have not been validated against physical ADDAC508 hardware.

### Wind Meadow Physics

The bundled **Wind Meadow Physics** example applies the spatial-field approach
of the Swell Physics recreation to wind moving over grass. Four meadow patches
are modelled as damped angular springs. Their aerodynamic torque is
proportional to signed squared relative wind speed, while spring stiffness and
damping return the grass toward vertical and control its overshoot. The wind
field combines steady flow, broad gust envelopes, and three shorter turbulent
eddies. Spatial phase offsets advect those features across the meadow rather
than giving every patch unrelated motion.

**Wind**, **Gusts**, and **Turbulence** set the three airflow components.
**Flexibility** reduces the grass's restoring stiffness, **Damping** controls
how long it sways after a change, and **Travel** sets how quickly weather
features cross the four patches. **Direction** reverses the airflow sign and
which edge is windward. Inputs 1-5 modulate Wind, Gusts, Turbulence,
Flexibility, and Travel through individual bipolar depth parameters.

Outputs 1-4 carry the signed bend of the four patches in the -5 to +5 V range,
and output 5 is their arithmetic mean. Output 6 exposes the instantaneous wind
at the windward edge, also limited to -5 to +5 V. Output 7 is +5 V while any
patch sees a strong gust. The custom display animates individual two-segment
grass blades from the four simulated patch angles, adds turbulence-dependent
flutter and travelling wind streaks, and shows mean bend and gust state.

This deterministic creative model is not computational fluid dynamics,
calibrated plant mechanics, or a hardware recreation. It runs at Disting NT's
documented 1 ms Lua cadence; its coefficients and visualization are original,
and its output should be treated as musically useful control-rate physics.

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

### Nibbler recreation

The bundled **Nibbler** example recreates the control-rate behavior of
[Schlappi Engineering's four-bit accumulator](https://schlappiengineering.com/products/nibbler-preorder).
Its first four parameters stand in for the ADD 1, 2, 4, and 8 switches. The
Operation, Mode, and Offset parameters reproduce the add/subtract,
synchronous/asynchronous, and second stepped-output phase switches.

Inputs expose Clock, Reset, Sub, the four weighted gate inputs, Shift, Shift
Data, Data XOR, and Carry In. Outputs expose the two 0-10 V stepped words,
Carry, and the 8, 4, 2, and 1 bits as 0/10 V gates. In asynchronous mode the
adder result responds immediately to switch and gate changes; Clock and Shift
are XORed for the register edge, matching the hardware's independent shift
operation. The display shows the active word, both stepped levels, mode,
direction, offset, and carry state.

The **Shift source** parameter is an adapter for a physical distinction the
Disting bus cannot observe: choose **Rotate** for the Nibbler's normalled top-bit
feedback, or **Data in** to replace it with the Shift Data input. This Lua
version runs at the documented 1 ms script cadence, so it is useful for
sequences, rhythms, and control-rate modulation but does not reproduce the
original discrete CMOS module's audio-rate timing or analogue voltage
imperfections.

### Vermona randomRHYTHM recreation

The bundled **Vermona Random Rhythm** example is an independent recreation of
the sequencing behavior documented for Vermona's
[randomRHYTHM](https://www.vermona.com/en/products/modules/product/randomrhythm/).
It has two rhythm sections, each with probability controls for quarter,
eighth, sixteenth, and eighth-note-triplet events. **Dice** mode stores and
repeats one field of random values, while **Realtime** draws a new value for
each event. The 3/4 setting loops the first three beats of the four-beat field,
so combining 3/4 and 4/4 sections produces the shifting relationship described
in the original manual.

Each section exposes five +10 V, 10 ms trigger outputs: a logical-sum **Seq**
output and separate **1/4**, **1/8**, **1/16**, and **1/3** outputs. With
**Offbeat** on, the separate outputs use the non-overlapping positions that
form Seq: quarters on the beat, eighths between quarters, sixteenths between
the quarter/eighth grid, and triplets excluding their quarter-note overlap.
With Offbeat off, each separate output uses its complete labelled resolution.
**Div out: Clock** bypasses probability only on the four separate outputs, so
they become clock multipliers while Seq remains probabilistic. Bipolar Swing
moves the sixteenth events before or after their straight positions.

The two Clock inputs expect quarter-note triggers. Set a section's **Clock**
parameter to **Input** to follow one; otherwise its BPM parameter drives an
independent internal clock. The shared Reset gate can restart a Dice pattern,
mute all five outputs while held, or be ignored independently by each section.
The Dice 1 and Dice 2 trigger inputs stand in for the original panel buttons
and generate a new four-beat random field without restarting playback.

This script recreates the rhythm logic, not the physical panel or electrical
implementation. Disting's 1 ms control cadence quantizes event timing, its own
typed-input edge behavior replaces Vermona's specified +2 V input threshold,
and the separate clock inputs are not automatically normalled to one another.
The internal BPM parameters replace the original tap-tempo gesture.

### Mutable Instruments Marbles recreation

The bundled **Mutable Instruments Marbles** example adapts the musical model
documented in the [Marbles manual](https://pichenettes.github.io/mutable-instruments-documentation/modules/marbles/manual/)
and its [MIT-licensed firmware](https://github.com/pichenettes/eurorack/tree/master/marbles).
It couples a master `t2` clock to complementary, ratio, or independently
authored drum-style `t1`/`t3` streams. The internal clock offers 10-480 BPM,
quarter/normal/quadruple ranges, bounded jitter, and variable gate length.
Choose **t Clock: Input** to clock it one-for-one from input 1. All three gate
outputs use +5 V.

The shared **Deja vu** control runs from fresh material at -100, through a
locked loop at 0, to random jumps within the loop at +100. Values away from
the lock use a squared probability response, so small offsets mutate or
reorder a loop slowly. **Length** selects 1-16 stored decisions, while the
separate **t Deja vu** and **X Deja vu** switches decide which half uses the
history. Each X channel advances its own history, so a three-decision length
can create a longer composite pattern when X1-X3 follow their corresponding t
streams. Reset restarts all read positions without erasing the stored values,
and **Save state** preserves the decision buffers.

X1-X3 can follow t1/t2/t3 independently, all follow t2, or advance together
from input 2. Their ranges are 0-2 V, 0-5 V, or -5 to +5 V. **Spread** moves
from a fixed centre through bell-shaped and uniform distributions to binary
extremes; **X Bias** skews the distribution. Positive **Steps** progresses
from chromatic quantization through C major, pentatonic, root/fifth, and root
octaves. Negative Steps applies increasingly slow slew. **X Mode** applies the
controls identically, opposes the outer channels to X2, or tilts them from X1
to X3. External processing samples input 11 instead of fresh voltages. Y is an
independent -5 to +5 V random source, is never affected by Deja vu, and has
its own X2 clock division, spread, bias, and steps controls.

Inputs 4-10 add CV to Deja vu, Rate (1 V/oct), t Bias, Jitter, Spread, X Bias,
and Steps. Disting cannot detect whether a jack is patched, so the two clock
sources and external-processing mode are explicit parameters. This is a 1 ms
control-rate adaptation: the jitter and ratio clocks, probability
distributions, slew, and scale carving are musical approximations rather than
ports of Marbles' sample-rate DSP. External t clocks remain 1:1 instead of
repurposing Rate as a divider/multiplier; the external-CV path omits the
firmware's 3 ms tolerance and shift-register special case; and the drum
patterns are independently authored. Browser or Lua randomness does not model
the original hardware entropy source.

### Mutable Instruments Grids recreation

The bundled **Mutable Instruments Grids** example ports the rhythm-generation
behavior and original GPL-licensed data from Mutable Instruments'
[Grids firmware](https://github.com/pichenettes/eurorack/tree/master/grids).
Its **Grids** mode bilinearly interpolates between the firmware's 25 rhythm-map
nodes. **Map X** and **Map Y** select the region, the three **Fill** parameters
apply the original density thresholds, and **Chaos** chooses one perturbation
per instrument at the beginning of each 32-step pattern. Levels above the
firmware's fixed accent threshold also fire the corresponding accent output.

The first three +5 V outputs are BD, SD, and HH. In **ACC 1/2/3** layout,
outputs 4-6 carry their individual accents. In **ACC/CLK/RST** layout, those
outputs instead carry a shared accent, the active clock, and the pattern reset.
**Triggers** last one 1 ms Disting control step. **Gates** follow the falling
edge of an external clock or use a 50% duty cycle with the internal clock.

Select a 40-240 BPM internal clock or drive the Clock gate input externally.
The **Resolution** parameter reproduces the firmware's 4, 8, and 24 PPQN input
granularities; lower resolutions skip map positions instead of reconstructing
missing pulses. Internal-clock swing uses **Chaos** as its amount, as on Grids,
and is disabled in Euclidean mode. Reset returns the generator to its first
step without retriggering it.

In **Euclidean** mode, Map X, Map Y, and Chaos become the three 1-32 step cycle
lengths, while the Fill controls set their densities. The port reads the
original 32×32 Euclidean lookup table and emits events on sixteenth-note
boundaries. In individual layout the auxiliary outputs mark each lane's cycle
reset; in alternate layout they become shared reset, clock, and simultaneous
three-lane reset.

Inputs 3-6 add 0-5 V to Map X, Map Y, Chaos, and all Fill controls, clamped to
their panel ranges. The script includes the upstream map and Euclidean data
byte-for-byte, but it does not emulate Grids' AVR, ADC response, analogue input
thresholds, tap-tempo button, LEDs, or sub-millisecond interrupt timing.
Disting's 1 ms scheduling quantizes the internal clock, swing, and pulse edges.

### Automatonnetz recreation

The bundled **Automatonnetz** example adapts Ornament & Crime's
[Automatonnetz vector sequencer](https://ornament-and-cri.me/user-manual-v1_3/#anchor-automatonnetz)
to Disting NT. A clock moves through a wrapping 5x5 grid by the selected `dx`
and `dy` vector. The available eighth-, seventh-, sixth-, fifth-, quarter-,
third-, and half-cell fractions act as clock divisions because a cell is
evaluated only when the integer grid position changes. Values above half the
five-cell grid travel the shorter way backwards.

Every cell stores a neo-Riemannian `P`, `L`, `R`, `N`, `S`, or `H` transform,
a reset or null transform, a -12 to +12 semitone offset, an inversion, and one
of eight mutation masks. A mutation randomizes the selected parts of the cell
after its current values have been applied, allowing the grid to rewrite
itself without changing the chord produced on that visit. **Clear** can zero
the grid, fill it with one-time random transforms, or give every cell a random
transform event. The complete grid and current musical state are stored by
**Save state**.

The example uses a custom UI rather than script parameters. Encoder 1 selects
a cell; pushing it toggles between the grid and cell pages. Encoder 2 selects a
setting; push it to enter or leave value editing. Pot 3 push resets the current
position to the origin, and pot 2 push advances one grid clock manually. The
display distinguishes the selected cell from the currently playing cell and
shows the four output pitches.

Inputs are Grid clock, Arp clock, Reset, Arp inhibit, Clear grid, Root CV, and
Inversion CV. Reset follows the original gate behavior: hold it while a Grid
clock arrives. Root CV is quantized to semitones; Inversion CV adds one
inversion step per volt in this Disting adaptation. Outputs 2-4 carry the
transformed triad. Output 1 can carry the current root, a 5 V one-control-step
transform trigger, a repeating arpeggio, or a one-pass strum. Arp inhibit
blocks only the Arp clock.

The transform and grid behavior follows the MIT-licensed Ornament & Crime 1.3
firmware, but the Disting mapping is not an emulation of the original panel,
ADC calibration, DAC range, or sub-millisecond ISR. In particular, the extra
Clear grid input replaces the original long-press gesture and the simulator's
1 ms control loop samples pitch CV for the pending clock action.

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
