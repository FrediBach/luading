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
The Display designer uses a compact monitor-icon command with a hover/focus
tooltip so the script selector retains space for the current example name.
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

### Melody Range Quantizer

The bundled **Melody Range Quantizer** rounds incoming V/oct pitch to the
nearest semitone and clamps it between **Min Note** and **Max Note**. A note
below the active range plays the minimum; a note above it plays the maximum.
Pitch uses C4/MIDI note 60 as 0 V, and the Gate input is passed through to the
second output.

Dedicated **Min CV** and **Max CV** inputs move their boundaries by twelve
semitones per volt at 100% amount. The default **Min CV Amt** is -100% while
**Max CV Amt** is +100%, so sending the same positive envelope to both inputs
opens the range downward and upward from the default C4 unison. Each boundary
is rounded to a note and kept inside MIDI 0-127; if modulation crosses the two
boundaries, the script orders them before applying the clamp.

### Probability Mixer

The bundled **Probability Mixer** routes each input gate to complementary Pass
or Reject outputs using a weighted blend of eight probability processes:
Independent, Markov, without-replacement Bag, accumulating Hazard, Weighted
cycle, Random walk, Alternating, and Streaky. **Base** is the shared density
around which the processes operate; the other eight parameters are mixer
weights, not additional percentages that must sum to 100.

Each source proposes a current pass probability. The mixer subtracts their
weighted failure distances from certainty and normalizes by the total weight:
`100 - sum(weight * (100 - source)) / sum(weight)`. For example, Base 50%,
Independent 100%, and Markov 15% is mostly an ordinary 50% Bernoulli gate with
a small tendency toward Markov-shaped phrases. If all weights are zero, the
script falls back to Base alone.

Gate input 1 is held on exactly one output until its falling edge. Trigger
input 2 resets the process histories, shuffled bag, counters, and both outputs.
The without-replacement source contains sixteen positions and rounds Base to
the nearest number of hits in that window. Preset state stores the shuffled
bag, histories, random walk, and pseudorandom generator position so the mixed
process continues exactly after restoration.

### Traffic-inspired Trigger Scene Selector

The bundled **Trigger Scene Selector** adapts the core patching idea described
in the [Jasmine & Olive Trees Traffic manual](https://jasmineandolivetrees.com/pages/traffic-manual):
three inputs select three rows of user-defined CV values, while a fourth output
combines the selector gates. Each row exposes separate **CV A**, **CV B**, and
**CV C** parameters with a bipolar -8 V to +8 V range and 0.01 V resolution.

Inputs are declared as gates so the summed output can preserve the duration of
short triggers or longer gates. When inputs overlap, Trig 1 has priority over
Trig 2, which has priority over Trig 3. Releasing the higher-priority input
reveals the next active scene; after every input returns low, the most recently
selected scene remains latched while **Trigger Sum** returns to 0 V. Parameter
edits update the latched scene without requiring another input edge.

This independently authored example implements only that base selector/OR
concept. It does not reproduce Traffic's panel, electrical behavior, alternate
modes, random scene scrambling, sixteen-step Groove sequence, chaining, or
firmware configuration, and it has not been compared with physical hardware.

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

### Micro Tracker

The bundled **Micro Tracker** is a self-contained four-track step sequencer
whose complete authoring workflow fits the documented algorithm custom UI. It
ships with a playable two-pattern demo, eight patterns of sixteen rows, and a
sixteen-slot looping Song order. Each cell stores a note, rest, or tie plus
velocity/accent, probability, and one to four ratchets. The four pitch/gate
pairs use outputs 1/2, 3/4, 5/6, and 7/8. Pitch is V/oct; the stepped gate
output maps velocity to a 5-10 V accent convention rather than claiming to be
a calibrated velocity DAC.

In the Grid, Encoder 1 moves the row and Encoder 2 moves the track. A short
Encoder 2 press opens the selected cell; Encoder 1 then chooses Note,
Velocity, Probability, or Ratchet and Encoder 2 changes it. Hold Encoder 2
while turning for coarse edits. Holding Encoder 2 for 500 ms without turning
opens Commands, which provides copy/paste, clear cell, confirmed clear row,
confirmed pattern clone, track mute, Song, Settings, one-level undo, and Help.
Destructive confirmations start on **No**. Pot 1 always selects the edit
pattern, Pot 2 sets 30-300 BPM, Pot 3 sets 0-60% swing, and pressing Pot 3
starts or stops transport. These meanings do not change between screens.

Input 1 is the external row clock, input 2 resets the playback position and
seeded probability stream, and input 3 supplies V/oct transpose sampled at an
accepted note onset. Settings choose internal or external clock, one, two, or
four rows per beat, gate percentage, Pattern or Song playback, saved semitone
transpose, and the deterministic seed. Internal swing alternates long/short
row intervals; external timing and ratchet spacing follow measured input
clocks and intentionally ignore Swing. Pattern selection while running queues
the new pattern for the next sixteen-row boundary, while Song playback follows
its order independently from the pattern being edited.

**Save state** preserves patterns, performance fields, Song order, settings,
mutes, cursor, selected pattern, and pseudorandom continuation. Reload starts
stopped at row 1 with all gates low; held controls, menus, pending ratchets,
clipboard, and undo are deliberately transient. The example is an ordinary
exportable Lua file and does not use the simulator-only buttons, Encoder 1
push, Pot 1/2 push, a React tracker editor, or browser timing as a Disting NT
performance claim. Live browser control feel and physical display, voltage,
timing, preset-capacity, and worst-case CPU behavior still require their
separate validation environments.

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

### LUT logic router

The bundled **LUT Logic Router** builds its complete gate I/O schema from one
hardcoded `LUT` string. Each non-empty line is an output bit word, ordered by
the binary input state from all-low to all-high. The number of inputs is the
base-2 logarithm of the line count, and the number of outputs is the width of
each line. Input 1 is the most-significant bit; output bit 1 controls Out 1.
`1` produces 5 V and `0` produces 0 V.

The included eight-line, four-bit table is a three-input 1-to-4 router. In 1 is
the enable input, while In 2 and In 3 select one of the four outputs. Replacing
only the string with another generated table automatically changes the input
and output counts and their names on reload. Blank lines and surrounding
whitespace are ignored; all populated lines must contain only `0` and `1`,
have equal widths, and total a power-of-two row count. Invalid tables fail in
`init()` instead of running with a partially inferred schema. The Disting NT
limit of 28 inputs and 28 outputs is enforced.

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

### Mutable Instruments Stages recreation

The bundled **Mutable Instruments Stages** example is an independently written,
single-envelope adaptation of the segment grammar documented in the
[Stages manual](https://pichenettes.github.io/mutable-instruments-documentation/modules/stages/manual/)
and informed by its
[MIT-licensed firmware](https://github.com/pichenettes/eurorack/tree/master/stages).
It provides one group of one to eight segments. Input 1 is the group Gate;
inputs 2-9 are the TIME/LEVEL CV inputs for segments 1-8. Output 1 is the
0-8 V envelope, and outputs 2-9 are 8-to-0 V activity ramps for the individual
segments.

Each stage has the original three types and primary/secondary control model.
For a **Ramp**, Primary sets an exponential 1 ms-16 s time and its CV changes
time at one octave per volt; Secondary moves from accelerating through linear
to decelerating. When an interior Ramp is followed by another Ramp, Secondary
sets the 0-8 V breakpoint instead, matching Stages' special target rule. The
first Ramp rises to 8 V, the last falls to 0 V, and adjacent Hold or Step levels
anchor Ramp targets. A single Ramp is the original Decay special case. For a
**Hold**, Primary plus CV sets the level and Secondary sets its 1 ms-16 s
duration. For a **Step**, Primary plus CV sets the sampled level and Secondary
sets glide; the segment then waits for the next Gate rising edge.

**Loop start** and **Loop end** replace the panel button gesture. A loop repeats
while Gate is high and moves directly to the segment after the loop when Gate
falls. A loop ending on the final active segment runs forever. As on Stages, a
Step inside a loop traps the envelope there and subsequent rising edges advance
it. Gate rising retriggers an ordinary running envelope, or advances one that
is waiting at a Step.

The Luading presets cover Decay, AD, AR, ASR, AHR, ADSR, delayed ADSR,
rest-level ADSR, AHDSR, AD1D2SR, and AD1D2SR1R2, plus a trapezoid LFO and two
Step sequences. The custom display draws the complete programmed contour,
loop span, segment types, live stage, gate state, output voltage, and playhead.

This is a 1 ms control-rate recreation, not a port of the 31.25 kHz firmware.
It deliberately omits multiple jack-detected groups, isolated-segment utility
modes, module chaining, tempo-synchronised LFOs, audio oscillators, and the
firmware 1.2 extended sequencer. Exponential times, curve shapes, CV scaling,
activity ramps, and retrigger transitions are musical approximations; Disting's
`kLinear` interpolation remains subject to the limitation in
[CONFORMANCE_STATUS.md](CONFORMANCE_STATUS.md#stepped-and-linear-outputs).

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

## Display designer

Open **Display designer** from the workbench utilities to author a separate,
browser-only 256×64 display design. Opening the full-size dialog does not pause
the Lua runtime, change the active script, or replace the normal simulated
display. The current implementation supports pixel and smooth lines, outlined
and filled boxes, pixel boxes, pixel and smooth outline circles, regular outline
polygons, multi-point Bézier curves, standard text, and tiny text. Choose a primitive tool and drag on the artboard to create repeatedly, or
use its **Add default** action for a keyboard-only starting shape. The inspector
remains the exact path for coordinates, text, alignment, and one of the 16
documented shades.

A **Polygon** stores an integer centre and radius plus a **Detail (sides)** value
from 3 through 256. Low detail deliberately exposes the straight facets;
increasing it shortens the facets until they reach the display's pixel scale.
Generated Lua emits one local `drawPolygon(x, y, radius, sides, shade)` helper
only when a polygon is used. Each polygon call passes only those five drawing
inputs, and the helper expands them into ordinary integer `drawLine()` calls.
The compiler preview uses the same vertex orientation and rounding as that Lua
helper. Polygon detail therefore contributes one descriptive draw call per side.

A **Bézier curve** stores an ordered list of 2–16 control points plus a
**Detail (segments)** value from 1 through 256. Its first and last points are
the endpoints; every point in between shapes the general-degree curve. Low
detail deliberately shows the straight approximation segments, while higher
detail can reduce them to the display's pixel scale. Selected curves show both
their control polygon and a draggable handle for every point. Points can be
added, removed, or edited exactly in Properties. Generated Lua emits one local
`drawBezier(points, segments, shade)` helper only when a curve is used. Each
curve call passes only those three drawing inputs, and the helper uses de
Casteljau interpolation before issuing ordinary integer `drawLine()` calls.
The compiler uses the same interpolation, sampling, and rounding, so Bézier
detail contributes exactly one descriptive draw call per segment.

A **Pixel box** stores one of those 16 shades for every pixel in its rectangular
area. Select a paint shade and choose individual cells in the Properties grid,
or use **Fill all** and **Clear to shade 0** for bulk edits. Width/height edits
and artboard resize handles retain pixels that remain inside the overlapping
top-left area; newly exposed pixels start at shade 0. The grid scrolls for
larger boxes, and every cell is a labelled keyboard button as well as a visual
shade swatch.

Pixel boxes compile to ordinary non-antialiased `drawLine()` and
`drawRectangle()` calls. The optimizer compares horizontal, vertical, and
area-first same-shade rectangle partitions, and also tries a full-box shade
followed by exact overdraw. It chooses the candidate with the fewest calls,
including shade 0 where erasing is required. The Properties summary, preview,
metrics, generated Lua, and pixel boxes inside symbols all use that same
deterministic result.

Layers are shown front-to-back. Select on the artboard or in Layers, and use
Shift to build a multi-selection. With the Select tool, drag from empty
artboard space to select every layer fully enclosed by the area; drag in either
direction, or hold Shift to add the enclosed layers to the current selection.
Selected artwork can be dragged, nudged by
one pixel with the arrow keys or five with Shift+arrow, resized through
element-specific handles, aligned, distributed, duplicated, deleted, or moved
through draw order. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z undo and redo complete
gestures; editable fields protect their normal arrow, delete, and undo keys.
One-level groups provide atomic selection, movement, duplication, deletion, and
an editor-only hide/show switch; hiding a group never changes generated Lua.
Layer, group, and symbol rows keep these less-frequent actions in their **•••**
menu; right-clicking the row opens the same menu. A menu opened for an
unselected layer targets only that layer. A menu opened for a selected layer
targets the complete multi-selection where the operation supports it, exposing
alignment and distribution only when enough layers are selected. Group menus
provide select, rename, visibility, duplicate, ungroup, and delete-artwork
actions without permanently expanding every row.

Every coordinate, radius, and shade supports a literal, a design-token formula,
or a normalized runtime number binding. Design-token formulas use only finite
numbers, token Lua names, parentheses, unary minus, and `+`, `-`, `*`, and `/`;
they cannot call Lua, read `self`, or refer to another property. Runtime number
bindings retain editable **From** and **To** formulas and interpolate with their
normalized 0–1 preview. Integer primitives round at the final draw boundary,
smooth geometry may retain fractions, and shades are rounded and clamped to
0–15. Text can use a text binding and visibility can use a boolean binding with
optional inversion.

The separate **Tokens** panel owns ordered document-wide numeric design tokens.
Each token has a display name, collision-safe Lua name, exact value, usage list,
and generated-source location. **Create token from value** creates and attaches
one in a single undo step; a property can also attach an existing token or open
the formula editor. Formula edits remain local until Enter or blur accepts a
valid expression, while Escape restores the committed expression. Renaming a
token is reference-safe because formulas persist its opaque ID and reprint the
new Lua name. An unused token deletes directly. Deleting a used token requires
**Replace references with current value and delete**; only that token's leaves
become numbers, while other token links remain intact.

Boxes keep the firmware's inclusive `x1`, `y1`, `x2`, `y2` representation.
Beside the computed inclusive size, **Drive width with token/formula** and
**Drive height with token/formula** attach a size token while preserving normal
or reversed orientation and accounting for the inclusive `- 1`. These actions
require a static start coordinate; a runtime-bound start must be mapped through
the endpoint editors instead. Drag, nudge, align, distribute, resize, grid snap,
symbol creation, and static-origin detach add offsets to formulas and to both
runtime-binding endpoints instead of silently materializing preview numbers.

The **State** panel is reserved for runtime number, boolean, text, and choice
bindings; token edits are persisted authoring changes, not preview state. Its
slider, switch, text, and choice controls update every attached preview
immediately without adding undo entries. Binding names are converted
to deterministic safe Lua locals; keywords, generated dependencies, and name
collisions receive safe alternatives. The usage list shows every attached
property before rename or deletion. An unused binding deletes directly, while
a used binding requires explicit conversion of all uses to their current
preview; because the document has no permanently hidden static element,
converted visibility becomes always visible. Choice definitions also drive
dynamic symbol states.

The **Symbols** panel turns selected scene primitives into a local definition
and replaces them with a translation-only instance at their logical top-left
origin. Each symbol has ordered named states, one explicit default, and a
stable Lua helper name. **Edit symbol** enters a breadcrumb-labelled definition
context with an origin marker. State tabs can duplicate the current artwork,
add a blank state, change ordering, rename the visible state label, edit its
stable Lua value, or choose a new default. Definition edits update every
instance. Symbol rows expose edit/delete through their own **•••** menu, while
the current state menu contains duplicate, add-blank, reorder, make-default,
and delete actions. Symbol states contain primitives only; symbols cannot nest.

Instances choose a literal state or attach a choice binding with an explicit
choice-to-state map. **Make state dynamic** creates matching choices, while
**Sync choices with states** is the explicit, undoable way to adopt later state
changes; editing a definition never silently rewrites a shared choice binding.
Detaching keeps only the current preview state as ordinary scene layers after a
warning. Deleting a used state requires a replacement, and deleting a used
symbol requires either detaching all instances or deleting its instances.

Generated source emits only used tokens, once in document order under a design-
token comment at the top of an immediately evaluated closure. Token locals
precede each used symbol helper so formulas in shared helpers see the same
values; runtime-binding placeholders remain inside the returned 30 fps `draw`
callback. Designs with neither tokens nor symbols retain the simple callback
shape. Instances pass origin and state arguments, unknown values select the
declared default, and every helper branch expands to ordinary documented draw
calls. Unused definitions and tokens are omitted with findings. Token/reference
and draw-call metrics remain descriptive authoring counts.

The artboard always remains 256×64 logically while **Fit**, 1×, 2×, 3×, and 4×
only change its CSS size. Pointer hit targets are enlarged in screen space while
committed coordinates use integer snapping, or half-pixel snapping for smooth
primitives. Pointer creation and manipulation stay below row 10 in parameter-
line mode; exact fields may deliberately retain clipped or reserved-area
coordinates, which produce findings. **View options** independently controls
the simulator-backed **Pixel preview**, authoring **Geometry**, the one-logical-
pixel **Pixel grid**, the document's **Layout grid**, and **Snap to layout
grid**. The dense Pixel grid appears only when each logical pixel occupies at
least four CSS pixels; its checked preference remains available at lower zoom.
The configurable Layout grid remains visible at every zoom and can be hidden
without disabling snapping. Smooth pixels remain an approximation of firmware
antialiasing and appear with a finding whenever used.

With no layer selected, Properties shows the **Artboard** and can add one
uniform Layout grid, edit its whole-pixel size from 1–64, six-digit RGB colour,
and 1–100% opacity, or remove it. Grid definition edits are part of document
history and dirty state. Layout-grid visibility, Pixel-grid visibility, and
the snapping preference are session view choices and do not change the design.
The defaults are an 8-pixel red grid at 10% opacity, visible layout grids,
hidden Pixel grid, and enabled layout-grid snapping.

Layout-grid snapping applies only to pointer creation, movement, and resize.
It evaluates x and y independently in screen space, preserves a multi-layer
selection as one rigid shape, and shows a strong guide plus coordinate badge
while active. Hold Control during a gesture to bypass layout-grid snapping;
releasing it re-evaluates the raw pointer sample without accumulating rounding
error. Exact inspector commits, one/five-pixel keyboard nudges, alignment,
distribution, duplication, imports, and existing artwork are never rewritten
just because snapping is enabled. Command/Ctrl+`'` toggles the Pixel grid,
Command/Ctrl+Shift+`'` toggles snapping, and Control+G or Control+Shift+4 toggles
Layout-grid visibility when focus is not in an editable control.

Above 900 CSS pixels, Layers/Symbols and Properties/Tokens/State remain in independent
side columns. From 721 through 900 pixels, and at 720 pixels or below, the
artboard stays visible while a lower tab strip provides Layers, Symbols,
Properties, Tokens, State, Findings, Metrics, and Lua one panel at a time. Narrow mode
fills the viewport and locks the artboard to **Fit**; the underlying design is
still exactly 256×64. The primitive toolbar and lower tabs scroll horizontally
when needed. Their active states use text/borders as well as colour, arrow keys
wrap between tabs, and Home/End move to the first/last tab. Coarse-pointer
layouts enlarge controls and handles, and reduced-motion preferences remove
nonessential transition/animation timing.

**Keep standard parameter line** reserves rows 0–9 and previews the shared
standard-line command layout. **Use full display** exposes all 64 rows and adds
`return true` to the generated callback. Findings describe clipping, reserved
rows, empty text, shade-zero overdraw, and smoothing uncertainty. Metrics are
descriptive counts and source bytes, never Disting CPU or safety claims. The
dialog persistently labels the design files and preview controls as a browser-
only extension: Disting NT receives only the generated ordinary draw calls.

Use **Open design** to choose a versioned `.luading-display.json` authoring
file. Type, size, version, and document validation complete before the current
draft is replaced; a failed read or invalid file keeps the draft unchanged.
Version-1 files open with no layout grid or tokens, while version-2 files retain
their grid; both migrate numeric binding endpoints into static-scalar literal
wrappers. Version-3 files retain their tokens and grid, version-4 files retain
pixel boxes, and version-5 files retain polygons. Downloads always use strict
version 6, which adds multi-point Bézier curves,
with ordered `tokens` and a
`layoutGrid` that is either the uniform-grid definition or `null`. Use
**Download design** for a
deterministic JSON file with a safe name. A
dispatched download marks that exact revision as downloaded, while later edits
become changed again. Open/download never changes the active script, local
project, recovery journal, simulation, or diagnostics, and a downloaded design
is not a format that Disting hardware can load.

**Copy draw callback** copies exactly the generated source shown in the Lua
panel. If browser clipboard access is unavailable or denied, the designer
opens a focused, selected read-only source field for manual copying. Copying
does not insert, replace, or run editor source. Closing or replacing a changed,
nonempty draft requires explicit discard confirmation, and closing returns
focus to the command-bar trigger. The draft may remain in memory while the
workbench stays mounted, but only an explicit downloaded design file is durable
across page reloads.

## Importing and exporting scripts

Use **New** to open the script scaffolder. Nothing is replaced until the final
create action succeeds.

Choose **Quick start** for the familiar minimal, working one-CV-input and
one-linear-output pass-through script. Its name, short description, and author
already have defaults and may be changed before creation.

Choose **Guided setup** to step through Basics, Inputs, Outputs, Parameters,
Hardware controls, Extras & presets, and Review. Every section is optional and
every added row begins valid. Inputs can be CV, gate, or trigger; outputs can be
linear or stepped; parameters can be numeric with a documented unit/precision
or an ordered choice. The Review step shows the exact generated Lua and the
collision-safe filename before creating the independent local project.

The hardware-controls step defaults to the standard parameter UI. Its normal
custom choices are the algorithm callbacks documented by the Disting NT Lua
manual. Additional callbacks, including the front-panel button events exposed
by Luading for algorithm scripts, remain disabled until you accept their
non-manual status. Review and the generated source identify those callbacks as
non-portable instead of presenting them as documented hardware behavior.

Extras can scaffold custom drawing, filtered MIDI input, and additional
JSON-friendly state saved through the hardware `serialise()` callback. **Named
parameter starting points** generate `luading.parameterPresets`; they are a
Luading simulator extension, not full Disting presets, and are labelled that
way in the dialog and source. Ordinary script parameter values are already
handled by the Disting preset system.

Closing the dialog discards its temporary choices. After creation the source is
ordinary editor text: the scaffolder does not parse, reopen, or regenerate an
existing script. Existing local projects remain in **My Scripts**.

Use **Import** in the command bar to create a local project from a `.lua` file.
The imported script runs through the same isolated Lua worker used for bundled
scripts and does not inherit helper modules from a previously selected bundled
script. A colliding filename receives a numeric suffix; Import never overwrites
another project by filename.

Use **Export** to download the editor's current contents as a `.lua` file. This
exports the source exactly as shown in the editor; simulator state and workspace
layout are not included.

## My Scripts and local autosave

The script menu lists user-owned projects under **My Scripts**, followed by the
unchanged Luading and Expert Sleepers bundled groups. Search covers local
filenames and bundled names, IDs, and group names. New, Import, and the first
edit to a bundled example create local projects. Opening a bundled example
never modifies its packaged source; return to it later to start again from the
pristine template.

Source edits are queued for local IndexedDB storage after a short pause. The
script control distinguishes **Saving source…**, **Saved locally**, recovery,
unsaved, template, and conflict-copy states. **Saved locally** appears only
after the database transaction succeeds. It is unrelated to the device-facing
**Save state** action, which serializes Lua runtime state in memory for reload.
Run, document selection, New, Import, duplicate, and delete flush pending source
work before replacing the active document. Cursor position and scroll offsets
are restored per local project when possible.

Local projects can be renamed, duplicated, or soft-deleted from the script
menu. Delete immediately selects a remaining project or the default template
and offers **Undo deleted script**. Bundled templates cannot be renamed or
deleted. If two tabs save the same revision, Luading preserves the stale tab's
source in a newly named conflict copy instead of overwriting the newer project.

If durable project storage fails, the status explains whether the latest
active source is still protected by a small browser recovery journal. A project
that has neither database nor journal protection is explicitly unsaved, and
Luading asks for confirmation before replacing it. Use ordinary `.lua` Export
to keep the active source in that situation.

## Backups and browser-storage durability

**Back up all scripts** downloads every non-deleted local project in one
versioned `.luading-backup.json` file. **Restore backup** strictly validates a
complete file before adding anything. Restore is additive: equivalent ID
collisions can be skipped, other collisions receive a new ID and unique
filename, and existing local content is never overwritten implicitly. This is
separate from `.lua` Import and Export and does not contain Lua VM state,
parameter values, diagnostics, device routes, or workspace layout.

When the browser exposes the capability, **Protect local drafts** requests
persistent storage. A grant reduces automatic eviction risk but is not a
backup, and clearing site data can still remove projects. Local scripts belong
to the current browser profile and exact origin. Preview deployments, another
domain, another device, and private-browsing sessions do not automatically
share them. Keep a downloaded backup for work that matters.
