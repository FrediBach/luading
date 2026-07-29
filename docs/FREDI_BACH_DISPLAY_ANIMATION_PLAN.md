# Fredi Bach example display animation plan

## Goal

Give every example in `lua-scripts/fredi-bach/` a display that explains the
musical behavior through motion, not just labels and meters. The target is the
playful clarity associated with Teenage Engineering instruments: one memorable
visual metaphor, a strong silhouette, restrained text, and motion tied directly
to the signal state.

This document is an implementation plan, not a proposal to change any
algorithm's audio, CV, gate, MIDI, or preset behavior.

## Display language shared by all examples

### Hardware contract

- Design for the Disting NT's 256x64 pixel, 16-shade display.
- Update animation at the documented `draw()` cadence of 30 fps. Signal
  processing remains in the 1 ms `step()` cadence and edge callbacks.
- Use only the documented draw primitives: integer or smooth lines, boxes,
  rectangles and circles, plus standard and tiny text.
- Keep coordinates on screen, use the firmware-derived font metrics, and avoid
  symbols that are not known to exist in the display fonts.
- Drawing is read-only presentation. Musical state and event timestamps are
  captured in `step()`, `gate()`, `trigger()`, or `midi()` and consumed by
  `draw()`.

### Composition

- The center 190-220 pixels are the "stage" for the visual metaphor.
- Reserve a narrow edge or bottom strip for the two or three values needed to
  interpret the picture. Do not repeat all parameter values.
- Prefer a recognizable shape over a title. Show the algorithm name only when
  the metaphor is not self-explanatory.
- Shade roles are consistent: 1-3 background structure, 4-7 history or inactive
  state, 8-11 live signal, 12-14 emphasis, and 15 the current event/playhead.
- A gate or trigger produces a two- or three-frame flash with a fast attack and
  short decay. Continuous CV uses smoothing to prevent single-pixel chatter.

### Motion

- Motion is signal-driven. Free-running motion is used only when the algorithm
  itself is free-running.
- Event animations use elapsed time, not draw-frame counters, so dropped display
  frames do not change the result.
- Histories use fixed-size ring buffers allocated in `init()`. No unbounded
  traces, table churn, or random decisions are introduced in `draw()`.
- Reset establishes a visually obvious home pose. Idle screens settle instead
  of continuing decorative motion.
- Parameter changes should visibly alter the metaphor: probability tilts a
  splitter, slew rate changes stair speed, distribution moves beats, and so on.

### Information hierarchy

Every screen must answer these questions in order:

1. What is the algorithm doing right now?
2. What event or value caused that result?
3. Which one or two settings explain the behavior?

Exact values remain available through the normal parameter UI. The custom view
only repeats a value when it is essential to understand the animation.

## Per-example plans

The sections are ordered alphabetically to match the directory.

### 1. Amen Break Drum Triggers

Status: Implemented

**Concept: spinning break record.** Replace the generic step ring with a compact
four-track drum record whose grooves make the Amen pattern visible.

- **Composition:** Put a 16-position record at x=84, with four concentric lanes
  for kick, snare, closed hat, and open hat. Use the right 125 pixels for four
  horizontal "speaker" bars labelled K, S, H, and O. In 32-step mode, alternate
  short and long tick marks instead of drawing unreadably small dots.
- **Animation:** A bright needle rotates to `current_step`. Upcoming hits are
  dim groove notches; the selected pattern and density determine their
  brightness. A fired lane sends a three-frame pulse from the needle to its
  speaker bar. Accent voltage controls pulse thickness or brightness.
- **Parameter expression:** Pattern CV subtly morphs notch positions and shades;
  swing bends the off-beat tick angles clockwise; density fades ghost notches
  in and out. External-clock idle leaves the needle parked and slowly fades the
  last hit.
- **Telemetry:** Show `01/16` or `01/32` and either measured clock status or
  internal BPM in the bottom-right. Avoid a permanent title.
- **State required:** Cache the currently resolved four-lane hit map, per-lane
  flash ages, last clock time, and an accent flash value. Reset clears the
  flashes and returns the needle to twelve o'clock.

### 2. Analog Drift CV Script

Status: Implemented

**Concept: a particle wandering around a tuning center.** The screen should feel
like Brownian movement observed through a small laboratory window.

- **Composition:** Draw a large target at x=150, y=34 with crosshairs at the
  undrifted input CV. A bright particle shows the drifted output, followed by a
  12-20 point fading trail. A thin left-side ruler shows drift-only voltage.
- **Animation:** Map the combined slow LFO drift to x and a secondary component
  or its recent derivative to y, producing an organic two-dimensional path
  rather than the current one-axis dot. The target moves only when CV In moves;
  the particle breathes slightly with Character.
- **Parameter expression:** Amount scales the trail's radius, Speed changes its
  traversal rate, and Character changes the trail from smooth arcs to irregular
  corners. At zero Amount the particle rests exactly on the crosshair.
- **Telemetry:** Bottom strip shows signed drift in millivolts and total output
  voltage. Use a tiny `DRIFT` label only beside the signed value.
- **State required:** A fixed trail ring, a smoothed display position, and the
  previous displayed drift for the vertical derivative. Do not add noise in
  `draw()`; reuse the algorithm's deterministic drift components.

### 3. Arpeggio Weaver LFO Routing

**Concept: a four-thread musical loom.** Four moving note threads are woven into
one output ribbon by a shuttle controlled by the LFO.

- **Composition:** Four thin lanes enter from the left. Each lane contains its
  current arpeggio notes as rising/falling beads. Near x=176, a vertical shuttle
  selects one lane, and a single bright ribbon exits to the right with the
  current output note.
- **Animation:** Each clock advances beads in the relevant divided lane. The
  shuttle follows the continuous weave position; in stepped mode it snaps only
  when a complete note permits switching. A pending switch is a dim ghost
  shuttle at the destination lane. A new output note launches a bright bead
  along the exit ribbon.
- **Parameter expression:** Pattern determines bead direction, divider controls
  lane speed, octave count sets lane height, and external/internal LFO mix moves
  the shuttle. The LFO shape is visible in a tiny 32-pixel trace behind the
  shuttle.
- **Telemetry:** Show current arpeggio number, output note, and scale/root in a
  bottom strip. Lane labels are only `1` through `4`; pattern names appear
  briefly when their parameter is focused.
- **State required:** Per-lane last and current positions for interpolation,
  shuttle display position, pending-switch age, and a short output-bead queue.
  Preserve the existing serialized musical state; display-only history need not
  be serialized.

### 4. Cat Purr Synthesizer

**Concept: a sleeping cat whose breathing and throat vibration are the control
signals.** This is the most figurative screen and should be immediately charming.

- **Composition:** Use lines and circles to draw a curled cat silhouette: head
  at x=72, body ellipse implied by two arcs, and tail curled at x=180. Three tiny
  output whiskers on the right act as VCO, VCF, and VCA meters.
- **Animation:** The body expands and contracts with `breathPhase`; two throat
  lines vibrate at a visually aliased, intensity-scaled purr phase; eyes close
  while running and open when gated mode is stopped. Each Purr Gate makes the
  whiskers flash outward. Organic variation causes small ear and tail motion,
  not random pixels.
- **Parameter expression:** Purr Rate controls throat-line speed, Breath Rate
  controls body motion, Intensity changes silhouette brightness, Variation
  changes micro-motion, and VCA Floor sets the minimum body fill.
- **Telemetry:** Show `FREE` or `GATED` in one corner and `RUN` or `STOP` in the
  other. Label the three whisker meters only when necessary; their vertical
  order remains constant.
- **State required:** Smoothed body radius, tail offset, and three short output
  peak holds. All motion derives from existing purr, breath, VCF, VCA, and gate
  state.

### 5. Clock Speed Up Script

**Concept: a clock tunnel rushing toward the viewer.** Acceleration should feel
physical before the multiplier is read.

- **Composition:** Draw six concentric rectangular or circular clock rings
  centered at x=128, y=34. A narrow bottom strip carries base BPM, multiplier,
  and target BPM. Use sparse cardinal tick marks rather than text in the hero
  area.
- **Animation:** Each output clock expands a ring from the center and fades it
  at the edge. As the multiplier rises, ring spacing compresses and launches
  become more frequent. The easing curve controls the apparent tunnel motion.
  Gate release snaps the tunnel to a calm single ring, matching the algorithm's
  immediate return to pass-through.
- **Parameter expression:** Ramp Time is shown by a faint radial progress arc;
  Max Speed is a fixed outer target ring; Easing changes the density curve of
  the rings rather than merely appearing as a word.
- **Telemetry:** Show base BPM on the left, a large `x1.00` or current multiplier
  at center, and current BPM on the right. `PASS`/`ACCEL` is a tiny corner tag.
- **State required:** Output clock flash timestamps, smoothed display
  multiplier, and measured-period validity. Before two input clocks establish a
  tempo, show a waiting crosshair instead of an invented BPM.

### 6. Complexity CV Generator

**Concept: eight streams filling a shared complexity reservoir.** Input activity
becomes a literal accumulation that crosses a gate threshold.

- **Composition:** Eight narrow pipes descend from the top into one wide tank.
  Each pipe has a droplet/slug for its decaying activity. The tank fill is
  `smoothedComplexity`; the threshold is a bold line across the tank.
- **Animation:** A gate edge sends a bright droplet down its pipe. Recent
  activity leaves a fading column, while the tank surface rises with attack and
  falls with decay. Crossing the threshold makes a small outlet valve open and
  emits a gate flash on the right.
- **Parameter expression:** Mode changes pipe response profiles, Response changes
  the tank's fill curve, Activity Window controls droplet persistence, and
  Invert flips the outlet indicator vertically while leaving the activity story
  intact.
- **Telemetry:** Show complexity percent inside the tank and output voltage next
  to the valve. The mode code (`STD`, `DRM`, `AMB`, `RCT`) sits in a corner.
- **State required:** Per-input event flash ages and peak holds, plus a short
  threshold-crossing flash. Reuse existing activity and complexity envelopes;
  do not create a second behavior model for display.

### 7. Configurable Gate Extender

**Concept: an elastic strip that stretches a short input gate and then recoils
through the protected gap.**

- **Composition:** An input peg at x=28 feeds a horizontal elastic strip to an
  output peg at x=226. Mark the natural input fall, requested extension end, and
  enforced gap as positions on the same timeline.
- **Animation:** On input rise, the strip lights end to end. On input fall, its
  leading portion dims but the output end stays taut until the extension timer
  expires. During `GAP`, the strip retracts toward the output peg, and a new
  input bump visibly presses against it without creating an output.
- **Parameter expression:** Effective Extend Time controls the strip's bright
  length; CV bends the strip up or down around the baseline; Min Gap is a
  hatched/dotted recovery segment.
- **Telemetry:** Show effective extension and gap values in the bottom corners.
  State is conveyed by the strip; `IDLE`, `HIGH`, or `GAP` is only a small tag.
- **State required:** Input rise/fall timestamps, a short rejected/retrigger bump
  flash, and smoothed effective time. Use the existing `state`, `time`,
  `gapEndTime`, and last CV as authoritative.

### 8. Deja Vu Memory Script

**Concept: a looping memory tape with note beads.** A repeated note is visibly
pulled from the loop; a new note is recorded onto it.

- **Composition:** Draw an oval tape loop around two reels. Up to 32 stored notes
  appear as small beads around the loop, with vertical position or shade
  encoding pitch. An input chute enters on the left and an output chute exits on
  the right.
- **Animation:** New notes travel from the input chute onto the write head, push
  older memory along the loop, then exit. A deja-vu choice lights one existing
  bead, carries a ghost copy to the read head, and sends it to output. Gate
  duration lights the output chute.
- **Parameter expression:** Memory Size changes the number of tape slots;
  Probability changes the brightness/size of the read head. CV modulation moves
  those targets smoothly without changing recorded notes until the algorithm
  does so.
- **Telemetry:** Show input and output note names or voltages at their chutes,
  plus `used/size` in the bottom center. A recalled note gets a short `DEJA`
  flash rather than a permanent title.
- **State required:** Expose the stored pitch values to `draw()` if they are not
  already accessible, recall source index, last decision timestamp, and a
  two-stage bead travel animation. Musical buffer mutation remains unchanged.

### 9. Drunken Walk Arpeggio

**Concept: a tiny walker stumbling up and down a staircase of notes.**

- **Composition:** Draw 2-8 stair blocks whose heights are the configured note
  offsets, not just numbered boxes. The walker is a two-line figure or bright
  pair of feet on `currentStep`; the current note name floats above it.
- **Animation:** Each clock makes the figure lean in the chosen direction, step
  to the next block, and settle. Bounce mode visibly rebounds from the wall;
  Wrap drops through one edge and reappears at the other; Sticky bumps the wall
  and stays. A gate flash radiates from the landed step.
- **Parameter expression:** Forward probability tilts a small balance bar under
  the stairs. Probability CV moves the weight, while the last chosen direction
  is shown by the walker's lean rather than a separate arrow.
- **Telemetry:** Bottom corners show edge mode and effective forward percentage.
  Root and current note are integrated into the staircase labels.
- **State required:** Previous/current step, transition start time, wall-hit
  flash, and previous effective probability. Musical random decisions are
  never repeated or recomputed in `draw()`.

### 10. Drunken Walk Sequencer

**Concept: a marble rolling between numbered signal cups.** It differentiates
this switch from the note-oriented staircase above.

- **Composition:** Arrange 2-8 shallow cups on one horizontal rail. The marble
  sits in the active cup; a thin signal line enters from the left and exits only
  beneath the selected cup. Cup fill shows the last sample-and-hold value in
  S&H mode.
- **Animation:** On clock, the marble arcs between cups in the selected
  direction. Wrap sends it through an edge portal; Bounce makes it ricochet.
  Gate mode flashes the active output cup, while S&H mode makes the cup retain a
  height/shade proportional to its held value.
- **Parameter expression:** Effective probability is a small gravity arrow
  beneath the rail. Step CV is a bright dot on a miniature 1-8 scale.
- **Telemetry:** Show `GATE` or `S&H`, edge mode, and effective probability in
  the bottom strip. The active output number is already obvious from the cup.
- **State required:** Previous/current step, transition age, sampled values
  normalized for display, and output flash ages. Preserve serialized held
  values and current position.

### 11. Euclidean Gate Skip Algorithm

**Concept: a Euclidean roulette wheel feeding a pass/skip fork.**

- **Composition:** Put the E(hits,steps) pattern on a wheel at x=80. A playhead
  sits at twelve o'clock. A short track exits the wheel and splits into bright
  `OUT` and dim `SKIP` bins at the right.
- **Animation:** Each incoming gate rotates the wheel one slot. A pattern hit
  releases a token; the probability decision sends it down one fork. Passed and
  skipped tokens leave independent short trails, making complementary outputs
  obvious.
- **Parameter expression:** Offset rotates the wheel's pattern under the fixed
  playhead. Probability moves the fork's pivot between OUT and SKIP. Hits and
  rests are solid and hollow nodes.
- **Telemetry:** Show `E(h,s)` and effective probability. Replace lifetime pass
  and skip counts with a compact recent ratio or retain counts only in a tiny
  footer.
- **State required:** Last decision, decision flash age, per-branch token
  position, and a fixed recent-decision bit history for the ratio display.

### 12. Euclidean Rhythm Distribution

**Concept: magnetic rhythm beads sliding along a timeline.** This makes the
distribution control visibly different from a conventional Euclidean ring.

- **Composition:** Draw `steps` sockets across a slightly curved rail. `hits`
  bright beads occupy sockets; a magnet icon sits left, center, or right
  according to Distribution. Current step is a vertical scanning beam.
- **Animation:** When distribution CV changes, beads slide from their previous
  sockets to the newly calculated ones over 120-180 ms. Clock moves the scan
  beam; a hit makes its bead pop upward and sends a pulse to Trigger, while a
  rest drops a pulse toward Inverted.
- **Parameter expression:** Rotation moves the rail beneath a fixed origin
  notch. Distribution physically moves the magnet and bead clustering.
  Trigger Length controls how long the emitted pulse remains visible.
- **Telemetry:** Show `E(h,s)`, `FRONT`, `EUCLID`, `BACK`, or an intermediate
  percent, plus current step in a corner.
- **State required:** Previous and target hit positions, morph start time,
  playhead position, and trigger/inverted flash ages. Pattern calculation stays
  exactly as implemented.

### 13. FM Control Voltage Helper

**Concept: four ratio gear trains driven by one carrier gear.** The picture
should communicate frequency relationships before the offsets are read.

- **Composition:** Put a carrier gear at x=58, y=34 and four smaller output gears
  in a 2x2 grid to the right. Teeth can be suggested with radial tick marks;
  connecting belts show that every output follows the same V/Oct input.
- **Animation:** The carrier rotates slowly for display only when input changes
  or remains valid; each output gear rotates at the selected ratio, with
  direction and speed wrapped to remain legible. A pitch jump sends a bright
  impulse down all four belts.
- **Parameter expression:** Gear diameter and an embedded `n:d` label express
  each ratio. The CV offset is a small signed tick on a shared ruler under the
  gears, preserving the exact information from the current screen.
- **Telemetry:** Show input voltage at the carrier and each output's ratio plus
  signed octave offset beside its gear. Full output voltages are available in
  routing and do not all need permanent text.
- **State required:** Display rotation phases, last input voltage, and a
  pitch-change impulse age. Rotation is illustrative; offset calculations and
  output CVs remain authoritative.

### 14. Feedback Tamer Script

**Concept: a waveform passing through a pair of protective jaws.** The jaws
close as feedback becomes unsafe.

- **Composition:** A short scrolling input waveform enters from the left. At
  x=150, upper and lower wedge lines form a limiter mouth; the controlled
  waveform and CV leave on the right. A threshold line is drawn just before the
  mouth.
- **Animation:** Envelope level scales the incoming wave. Above threshold, the
  jaws close according to gain reduction and the outgoing wave visibly
  shrinks. Peak hold is a fading spark at the tallest crest. Attack and release
  should be legible as fast closure and slower reopening.
- **Parameter expression:** Threshold moves the warning line, Ratio changes jaw
  leverage, side-chain HPF changes low-frequency motion in the displayed input
  trace only if that value already exists. Avoid implying calibrated audio
  metering beyond the algorithm's own envelope.
- **Telemetry:** Show threshold, gain reduction percent, and CV output. Replace
  `PASS/TAMING/LIMITING` text with jaw pose plus a small status tag for
  accessibility.
- **State required:** A fixed envelope-history ring, peak age, and smoothed jaw
  position. Do not sample browser audio or label the visualization as hardware
  CPU/audio calibration.

### 15. Gate Cutter Configurable

**Concept: scissors repeatedly cutting gaps in a moving gate ribbon.**

- **Composition:** A ribbon travels left-to-right across the center. A simple
  two-blade scissor icon sits at x=142. Above it, up to `Max Cuts` tiny notches
  show planned/completed cuts.
- **Animation:** While waiting, the ribbon advances toward the scissors. At
  `Time to Cut`, the blades close for one or two frames, the ribbon separates,
  and a dark gap of `Cut Length` passes the output. The scissors reopen and the
  cycle repeats. Input fall lets the remaining ribbon exit and returns to idle.
- **Parameter expression:** Time to Cut controls solid ribbon length between
  notches; Cut Length controls gap width; Max Cuts sets the visible notch count.
  This makes the timing pattern readable without a generic progress bar.
- **Telemetry:** Bottom strip shows `cut n/N` and either the remaining wait or
  gap time. Output state is the presence or absence of ribbon at the right edge.
- **State required:** Last state-transition timestamp, blade phase, and cut
  flash age. Existing timer and count remain the source of truth.

### 16. Gate Humanizer - Randomized Delays

**Concept: four performers landing slightly behind a conductor's beat.**

- **Composition:** Draw a conductor line at x=28 and four horizontal lanes.
  Each input event is a hollow footstep at the line; its delayed output is a
  filled footstep farther right. The lane length represents Max Delay.
- **Animation:** A pending rise walks from the conductor to its randomized delay
  position, then flashes the output lane. The falling edge uses the same
  horizontal offset, so paired footsteps or a connecting bar demonstrate that
  gate length is preserved. Four channels animate independently.
- **Parameter expression:** Amount compresses or expands the spread of landing
  positions; Max Delay changes the ruler length. The last randomized delay is
  encoded by position first and tiny text second.
- **Telemetry:** Label lanes `1-4`; show each last delay under its landing mark
  only while active or recently triggered. Put `amount/max` in a small footer.
- **State required:** Per-channel pending rise/fall times already exist; add
  event ages and an output landing flash. No new randomness may occur during
  display rendering.

### 17. Gate Suppressor Script

**Concept: a turnstile that reopens only after the minimum-distance timer.**

- **Composition:** Incoming gate tokens approach from the left. A three-arm
  turnstile occupies the center; passed tokens leave right, while suppressed
  tokens bounce into a small bin below. A recovery arc surrounds the turnstile.
- **Animation:** A passed gate rotates the turnstile 120 degrees and drains the
  recovery arc from bright to dim. A gate that arrives before recovery makes the
  arm recoil and sends its token downward. When the arc completes, the
  turnstile gives a subtle ready pulse.
- **Parameter expression:** Effective minimum distance sets arc duration; CV
  bends a bipolar needle above the arc. This replaces the detached numeric CV
  meter with a direct cause-and-effect picture.
- **Telemetry:** Show remaining recovery time, effective minimum distance, and
  compact pass/suppress counts. Output-high is the bright token on the exit
  track.
- **State required:** Event decision timestamp, turnstile angle, recovery
  fraction, and bounce/pass token animations. Use existing current time, last
  gate end, stored CV, and counts.

### 18. Grid Quantizer

**Concept: loose events falling onto a four-lane timing grid.**

- **Composition:** Four vertical lanes end on a horizontal clock rail. Incoming
  events appear above the rail at arbitrary heights; pending events wait there.
  Each master clock is a scanning flash along the rail.
- **Animation:** Between clocks, a received event falls toward but stops just
  above the next grid line. On clock, all pending tokens snap onto the rail and
  launch downward as outputs. In Gate mode, a token stretches into a vertical
  bar until input fall; in Trigger mode it becomes a fixed short dash.
- **Parameter expression:** Trigger length determines dash height/lifetime.
  Mode changes the output glyph from dash to elastic bar, making the choice
  visible without relying on a title.
- **Telemetry:** Lane numbers sit at the bottom. Show `TRIG 10ms` or `GATE` in
  one corner and a clock heartbeat in the other.
- **State required:** Per-channel input event age, pending age, output launch
  age, and current input/output high states. Use elapsed time so all events snap
  on the actual clock callback, not the nearest draw frame.

### 19. Loudness Compensation Fix

**Concept: a pitch-to-level balancing scale.** A keyboard weight on one side is
countered by compensation on the other.

- **Composition:** A large seesaw spans the display. The input note is a weight
  sliding along the left half; the compensation/output weight moves vertically
  on the right. Behind it, a dim miniature curve shows the configured mapping.
- **Animation:** As pitch changes, the input weight glides to its new note and
  the beam tilts according to slope. The output weight settles after the
  response curve and limits are applied. When a min/max clamp is reached, the
  weight gently touches a stop and flashes.
- **Parameter expression:** Slope sets beam direction and tilt; Reference is the
  fulcrum; curve type changes the dim guide curve; min/max outputs are physical
  stops. Base Level is the neutral beam height.
- **Telemetry:** Show input note/voltage on the left and signed compensation plus
  output voltage on the right. Curve name can sit beside the fulcrum.
- **State required:** Smoothed input/output display positions, clamp-hit age,
  and current mapping points. The plotted curve may be recomputed only on
  parameter change and cached, avoiding per-frame table allocation.

### 20. Melody Bernoulli Gate

**Concept: a pinball diverter routing each melody note into voice A or B.**

- **Composition:** An input ball enters at top center and hits a pivoting
  triangular diverter. Curved tracks lead to large A and B cups at the lower
  corners. The two held CV values are shown as pitch-height marks inside their
  cups.
- **Animation:** Each gate rise drops a ball, tilts the diverter to `lastRoute`,
  and rolls the ball into the chosen cup. The chosen gate/cup flashes. Toggle
  mode leaves that cup latched bright until the other fires; Gate mode follows
  the incoming gate duration.
- **Parameter expression:** Effective probability, including CV, biases the
  diverter's resting angle toward B. A 50% center notch provides reference.
- **Telemetry:** Show effective probability at the pivot, note or CV in each
  cup, and compact A/B routing counts. Mode is a tiny tag.
- **State required:** Ball travel phase, route decision timestamp, effective
  probability, and gate/cup flash ages. Capture the decision once in `gate()`;
  never perform the Bernoulli draw again for animation.

### 21. Min Max Gate Length Control

**Concept: a gate pulse stretched between minimum and maximum timing pegs.**

- **Composition:** Draw a horizontal time ruler with a MIN peg and MAX peg. The
  input pulse is a thin upper band; output is a thick elastic lower band sharing
  the same origin.
- **Animation:** Both bands grow while input is high. If input falls before MIN,
  the thin band stops but the output band continues to the MIN peg. If input
  remains beyond MAX, a stop block cuts the output band while the input band
  keeps growing dimly. A short reset motion occurs after the full low-high cycle.
- **Parameter expression:** Effective min/max positions are placed on a
  logarithmic or piecewise time scale so common short values remain visible.
  Disabled min and infinite max move offscreen with clear open-ended glyphs.
- **Telemetry:** Show elapsed time near the growing edge and effective min/max in
  the bottom corners. `ACTIVE`, `EXTEND`, or `MAX` is a small state tag only.
- **State required:** Input/output rise and fall timestamps, effective CV-adjusted
  limits, and a max-stop flash. Update the plan's visuals from effective values,
  not just the base parameters currently shown.

### 22. Note Compressor CV Control

**Concept: an accordion keyboard squeezing notes into a movable range.**

- **Composition:** A one-octave-styled horizontal keyboard strip spans the
  screen. Two accordion jaws mark effective min/max. Input arrives as a hollow
  note bead above; output leaves as a bright bead below.
- **Animation:** When range changes, the jaws slide. Clamp makes an outside bead
  hit the nearest jaw; Fold makes it bounce back into the range; Scale stretches
  or compresses the bead's journey proportionally. Draw a 120-180 ms motion
  path between input and output so each mode is visually distinct.
- **Parameter expression:** Min/Max CV physically move the jaws; range width is
  obvious. Octave ticks and boundary note labels preserve pitch context.
- **Telemetry:** Show mode, input note, and output note. Gate is a brief glow
  along the keyboard rather than a detached `G` box.
- **State required:** Previous/current effective boundaries, input/output note
  transition age, mode-specific path control point, and gate flash. Preserve
  exact CV output; animation interpolation is display-only.

### 23. Note Mirror Quantizer Module

**Concept: a note reflected across a mirror, forming a butterfly-like shape.**

- **Composition:** Make the mirror a bright horizontal line through the center.
  An input bead moves on the left vertical pitch axis and its output reflection
  moves symmetrically on the right. Two connecting arcs form wings around the
  mirror point.
- **Animation:** On gate, the input bead flies to its pitch, touches the central
  mirror point, and the output bead unfolds to the reflected pitch. Quantize On
  makes the right bead snap to discrete scale rails; Off allows continuous
  position.
- **Parameter expression:** Mirror CV slides the mirror line. Scale rails appear
  only when quantization is enabled, and their pattern communicates the chosen
  scale more usefully than a permanent scale label.
- **Telemetry:** Put input and output note names beside their beads and the
  mirror note at center. Show the scale name in the footer only in Quantize mode.
- **State required:** Previous/current note positions, mirror-line smoothing,
  gate animation age, and optionally cached visible scale rails.

### 24. Note Range Limiter Script

**Concept: MIDI notes moving through a fenced pitch corridor.**

- **Composition:** A horizontal 0-127 pitch rail has two tall fence posts for
  effective min/max. Incoming MIDI notes are moving beads entering from the
  left; legal notes pass through the corridor to the right.
- **Animation:** Suppress makes an illegal bead hit the fence and dissolve into
  a short `Filtered` spark. Clamp makes it slide along the fence to the boundary
  before exiting. Oct Fold makes it loop around the rail in 12-semitone arcs
  until it lands inside. Held notes remain as dim beads at their output pitches.
- **Parameter expression:** Min/Max CV moves fence posts; mode changes the
  transformation path. MIDI channel filtering should leave non-matching notes
  absent rather than implying they were suppressed by range.
- **Telemetry:** Boundary note names sit under the posts, mode in the center,
  and active-note count in a corner. A filtered trigger is a brief spark on its
  output icon.
- **State required:** Per-active-note input/output values already exist; add last
  processed path type, event age, suppressed-note pitch, and fold-hop count for
  the short animation.

### 25. Note Slew Limiter

**Concept: a note elevator climbing a semitone staircase toward a target floor.**

- **Composition:** Draw a vertical stack of 12 visible semitone steps in the
  center, scrolling octaves as necessary. A bright elevator car is the current
  output; a hollow target marker sits at the destination.
- **Animation:** Each allowed slew step moves the car exactly one stair and
  leaves a short fading trail. Up Only and Down Only add a physical ratchet on
  the forbidden side; a blocked target makes the ratchet flex without moving
  the car. Arrival produces a soft one-frame landing flash.
- **Parameter expression:** Effective Slew Rate controls car cadence; Slew CV is
  a tiny speed lever. Quantize In uses discrete labeled stairs; unquantized mode
  can show the target between stairs while the output still follows implemented
  behavior.
- **Telemetry:** Show current and target note/voltage, direction mode, and
  semitone distance. The moving car is the primary progress indicator.
- **State required:** Last/current display semitone, movement timestamp, arrival
  flash, blocked-direction flash, and effective slew rate.

### 26. Note Triggered CV Output System

**Concept: a target key waiting for the matching MIDI note.**

- **Composition:** Draw a small one-octave keyboard centered on the effective
  target note, with the target key outlined like a bullseye. An incoming MIDI
  note appears as a reticle above its relative key.
- **Animation:** A matching note makes the reticle drop onto the target, expands
  a trigger ring, holds the key bright for Gate, and fills a velocity plume
  upward. Note-off releases the key. A non-matching note passes as a faint
  reticle and fades without suggesting an output.
- **Parameter expression:** Note CV slides the target keyboard under a fixed
  center sight; CV Range determines how many side keys are visible. Trigger
  length controls the ring decay.
- **Telemetry:** Show base note in one corner, effective target note at center,
  and velocity value beside its plume. MIDI channel is a small tag when not
  omni.
- **State required:** Last received note and match result, note-event age,
  trigger age, held target state, and velocity peak. If the current code does
  not retain non-matching notes, add display-only observation without changing
  MIDI filtering or output behavior.

### 27. Pattern Evolver

**Concept: an original rhythm strand mutating into an evolved strand, like
animated DNA.**

- **Composition:** Two horizontal rows are connected by short diagonal links:
  original on top and evolved below. Filled nodes are hits. The current step is
  a bright vertical scanner, and mutation sites use crossed or broken links.
- **Animation:** During recording, new nodes stamp onto the top strand and a
  scanner searches for the loop point. In evolve mode, each cycle moves the
  scanner across both strands. A mutation flashes at its step, then the lower
  node flips, skips, adds, or shifts with a mode-specific 100-200 ms motion.
- **Parameter expression:** Probability determines a subtle instability/jitter
  of prospective lower nodes, `Every N Cyc` appears as a cycle dial, and Mode
  changes the mutation glyph. Min/Max Length become bookends during recording.
- **Telemetry:** Show `REC` plus captured length, or `EVOLVE` plus cycle count
  and mutation mode. Keep EOC as a full-strand flash.
- **State required:** Last mutation index/type/timestamp, recording stamp age,
  cycle flash, and previous evolved pattern for transition rendering. Serialize
  only musical pattern state as today.

### 28. Probabilistic Note Repeater

**Concept: a tape head choosing between recording a new note and replaying the
last loop.**

- **Composition:** An input note enters a central tape head. The upper route
  writes it to a small one-note loop; the lower route circles the old bead back
  to output. Output exits right, with pitch encoded by bead height.
- **Animation:** `NEW` sends the incoming bead through the write head, replaces
  the bead on the loop, and exits bright. `RPT` diverts the input bead into a
  dim discard path while the stored bead completes one loop and exits. Gate
  duration lights the output tape.
- **Parameter expression:** Pass-new probability moves a selector flap between
  the write and loop paths. At 100% the loop lies open; at 0% it visibly locks
  after the first note.
- **Telemetry:** Show input and output note/voltage beside their ports and
  effective probability at the selector. The animation itself replaces the
  large `NEW/RPT` word, though a tiny tag can remain.
- **State required:** Decision timestamp, input/output bead positions, stored
  note display value, and gate state. Use `lastWasNew` as the recorded decision.

### 29. Reactive Arpeggio

**Concept: a held note grows a musical vine; clock pulses grow new leaves.**

- **Composition:** The input/base note is a seed at lower left. A vine curves
  upward or downward through scale-degree leaves toward the right. The current
  arpeggio output is a bright leaf; inactive future steps are dim buds.
- **Animation:** Gate rise plants or resets the seed. Every clock grows one leaf
  in the selected direction and sends a gate sparkle from it. Up-Down makes the
  vine fold back; Random sprouts to a valid scale rail without smooth fake
  pitch movement. Gate fall lets the vine fade to its seed.
- **Parameter expression:** Steps controls bud count, Octave Range controls vine
  height, Scale shapes the vertical rail spacing, and Direction determines its
  growth gesture. Reset Mode determines whether a new seed or the next clock
  clears the vine.
- **Telemetry:** Show root/scale near the seed, output note near the active leaf,
  and `step/steps` in a corner.
- **State required:** Previous/current arp step, leaf birth timestamps, gate
  pulse ages, and last output note. Positions derive from actual quantized
  output pitches.

### 30. Song Mode LFOs

**Concept: an arrangement orbit with an illuminated active sector and a ramp
comet.**

- **Composition:** Represent the complete cycle as a thin orbit around an
  off-center hub. Active bars form a brighter arc. A comet marks the current
  bar, while 1-16 beat dots orbit in a small inner ring.
- **Animation:** Each clock advances the beat dots; crossing a bar moves the
  comet to the next segment with a short eased sweep. Inside the active arc, the
  comet grows a tail whose length/brightness is the ramp value. Gate opening
  illuminates the whole sector; reset snaps to the offset origin.
- **Parameter expression:** Cycle Bars sets segment density, Active Bars and
  Offset place the illuminated sector, Offset From reverses the anchor marker,
  and Ramp Shape changes the comet tail envelope across that sector.
- **Telemetry:** Show `bar/cycle`, ramp voltage, and a small `ACTIVE` tag. When a
  cycle is too long for distinct segments, group marks at musically useful
  intervals rather than drawing subpixel lines.
- **State required:** Previous/current beat and bar, transition start time, gate
  edge flash, and smoothed ramp-tail length.

### 31. Stutter Gate Processor

**Concept: a gate ribbon entering a rapid mechanical slicer.**

- **Composition:** A wide input ribbon enters from the left, passes under a
  vertical blade, and exits as `effectiveCount` evenly spaced strips. A small
  EOC spark sits at the far right.
- **Animation:** On a stutter decision the blade sweeps across the ribbon,
  exposing alternating high/low segments as the existing stutter phase
  advances. Completed slices fall slightly and dim; the current segment pops
  bright. Pass-through keeps the blade raised and sends one intact ribbon
  across.
- **Parameter expression:** Stutter Count sets slice count, Stutter Time controls
  conveyor speed, Gate % controls visible strip width, and probability rests the
  blade closer to or farther from the ribbon. CV effects nudge count and blade
  tension.
- **Telemetry:** Show `PASS` or `STUTTER`, effective `xN`, total time, and
  optional compact CV deltas. EOC is communicated primarily by the exit spark.
- **State required:** Existing phase/count/decision fields are sufficient for
  the main motion; add decision age, blade position, and EOC flash age.

### 32. Triangle LFO Generator

**Concept: a bank of mathematical pendulums moving at related rates.**

- **Composition:** Fit 1-8 pendulums across the screen. Each has a fixed pivot,
  a line to a bright bob, and a faint triangular guide behind it. A small
  multiplier sits above each pivot.
- **Animation:** Bob x-position follows triangle phase, while a slight y arc
  makes the bank feel mechanical without misrepresenting the bipolar output.
  Reset aligns every bob visibly. Intensity contracts motion toward each pivot;
  Speed CV changes all periods together.
- **Parameter expression:** Pi, Fibonacci, Golden, Prime, and Harmonic spreads
  use a tiny family glyph plus the exact multiplier. The relative motion itself
  is the main explanation of spread.
- **Telemetry:** Show spread name and base frequency in the footer. Highlight
  the selected number of active pendulums; inactive outputs are not drawn.
- **State required:** Existing phases are authoritative. Add no independent
  display oscillator; compute bob positions directly from phase and cache
  multipliers only when parameters change.

### 33. Triangle LFO Window Comparator

**Concept: a firefly moving through a breathing window.**

- **Composition:** LFO A and B are two curved horizontal boundaries enclosing a
  softly shaded band. LFO C is a bright firefly at center x with a short trail.
  A small gate lamp is embedded in the band rather than detached at the edge.
- **Animation:** The two bounds breathe vertically with their phases. The
  firefly follows C; entering the band blooms the shading and lamp, leaving it
  collapses both. Auto-sort lets boundaries pass through each other without
  flipping the filled region; Normal mode can show the signed ordering.
- **Parameter expression:** Phase CV visibly shifts the three motions relative
  to one another; Rate controls common speed; Amplitude changes travel height.
  Window Mode is expressed by whether boundary identities swap or retain labels.
- **Telemetry:** Tiny `A`, `B`, and `C` labels follow their lines; show rate and
  `IN/OUT` in corners. Do not add redundant large ON/OFF text.
- **State required:** A 6-10 point trail for C, gate edge age, and smoothed y
  coordinates. Existing LFO values and gate state drive all motion.

### 34. XOR Drum Sequencer

**Concept: divider pistons feeding an XOR balance chamber.**

- **Composition:** Each active clock-divider layer is a small piston row on the
  left and center. Bright pulses travel from firing layers into a chamber at
  x=210. The chamber has two exits: XOR and inverse.
- **Animation:** On every clock, firing pistons punch rightward simultaneously.
  Pairs of pulses cancel in the chamber with a small crossed flash; an odd
  remainder exits through XOR, while the complementary state lights Inv. This
  directly teaches parity rather than showing unrelated boxes.
- **Parameter expression:** Layers controls piston count, Start Layer labels
  divider numbers, and both CVs slide a bracket around the active piston range.
  Step counter is a small odometer, not the hero.
- **Telemetry:** Show active range (for example `/2-/5`), step modulo pattern
  context, and the two output lamps. Keep labels short enough for 256 pixels.
- **State required:** Per-layer fired flags already encoded in `lastPattern`;
  add clock-event age, cancellation flash age, and output/inverse flash ages.

### 35. vector_mix

**Concept: a glowing puck stretching a triangular mixing membrane.** Keep the
useful triangle but turn it into a tactile, animated object.

- **Composition:** Enlarge the triangle to occupy most of the screen. Draw faint
  spokes from the puck to A, B, and C; spoke brightness and thickness represent
  barycentric weights. Use three compact level petals at the vertices instead
  of separate left-side bars.
- **Animation:** The puck glides with smoothing and leaves a short fading trail.
  Each vertex pulses as its weight increases; a near-solo vertex blooms into a
  larger ring. With internal LFO active, draw a dim orbit path and a moving
  phase notch so automated movement is clearly distinguished from input CV.
- **Parameter expression:** LFO Depth scales the orbit, offsets move its center,
  Response changes how spoke brightness grows, Out Range changes the vertex
  meter scale, and Smoothing changes trail curvature/lag.
- **Telemetry:** Show A/B/C percentages or voltages adjacent to vertices only
  when space permits; otherwise show the dominant source and its percentage in
  the footer. Mark `LFO` beside the orbit when active.
- **State required:** Existing smoothed display position and weights drive the
  puck. Add a fixed position trail and cached orbit samples; do not recalculate
  or randomize mixing weights in `draw()`.

## Implementation sequence

### Phase 1: shared conventions and test harness

1. Add small local helper functions only where they remove repeated math, such
   as clamp, lerp, elapsed-event brightness, note-to-position, and safe text
   placement. Do not create a simulator-only drawing API that real hardware
   scripts cannot call.
2. Define a consistent event-state pattern in the examples: timestamp or age
   updated by the musical callback, bounded history allocated in `init()`, and
   rendering performed in `draw()`.
3. Extend the bundled-script display tests so every updated example exercises
   idle, active, reset, and parameter-extreme frames through the production
   Wasmoon boundary.
4. Add frame-command assertions for out-of-bounds geometry, invalid shades,
   non-finite coordinates, and unsupported glyphs.

### Phase 2: implement by visual family

1. **Clock and rhythm:** Amen Break, both Euclidean examples, Clock Speed Up,
   Pattern Evolver, Song Mode LFOs, Stutter Gate, and XOR Drum Sequencer.
2. **Gate timing and routing:** Gate Extender, Gate Cutter, Gate Humanizer, Gate
   Suppressor, Grid Quantizer, Min/Max Gate Length, and Melody Bernoulli Gate.
3. **Pitch and melody:** Arpeggio Weaver, both Drunken Walk examples, Deja Vu,
   Note Compressor, Note Mirror, Note Range Limiter, Note Slew, Note Triggered
   CV, Probabilistic Note Repeater, and Reactive Arpeggio.
4. **Continuous modulation and dynamics:** Analog Drift, Cat Purr, Complexity
   CV, FM Helper, Feedback Tamer, Loudness Compensation, both Triangle LFO
   examples, and Vector Mix.

Implement and review one example at a time. Each coherent increment gets a
focused corpus/display test before moving to the next example.

### Phase 3: hardware legibility pass

- Test minimum and maximum parameter values, especially 32/64-step patterns,
  eight lanes, long cycles, narrow pitch ranges, and overlapping note labels.
- Verify integer rounding and clipping on the true 256x64 framebuffer.
- Verify animation remains interpretable at 30 fps and does not depend on the
  simulator's 20 fps main-thread frame delivery.
- Check full-bright pixels are reserved for live events and do not turn the
  whole display into an undifferentiated high-contrast field.
- Confirm idle and stopped states settle, reset poses are consistent, and
  external-clock screens do not imply motion while no clock is present.
- Run the complete bundled-script corpus through Wasmoon, then `npm test` and
  `npm run check`. These are required before the animation work is complete.

## Acceptance criteria for each example

An animation is complete when:

- a user can identify current state and the last meaningful decision without
  opening the parameter list;
- the primary motion is driven by real algorithm state, not decorative time;
- every output that matters to the example has a visible state or event;
- CV modulation changes the displayed effective value, not merely the base
  parameter;
- reset, idle, stopped, and extreme parameter states have deliberate poses;
- draw commands remain within the hardware framebuffer and use supported
  shades, primitives, and glyphs;
- display state is bounded and deterministic, with no musical random decisions
  or unbounded allocations in `draw()`; and
- the example remains loadable and executable through the production Wasmoon
  bridge and passes the required repository checks.
