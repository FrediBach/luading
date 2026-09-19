# ntlib — Disting NT Lua Library: Complete API Definition

2026-09-19 · @Someone

## 1. Scope and design principles

`ntlib` is a pure-Lua support library for Disting NT scripts. It targets Lua 5.4 with no `io`, no `os`, no FFI and no C extensions, so identical source runs on hardware and in the browser simulator.

**What it covers.** The control-rate concerns that every NT script reinvents: voltage and pitch arithmetic, quantisation, clock tracking, gate scheduling, envelopes and LFOs, deterministic randomness, sequencing, parameter plumbing, MIDI, and drawing widgets for the 256x64 display.

**What it deliberately excludes.** Audio-rate DSP. `step` is a control-rate callback and `draw` runs at 30fps, so anything needing per-sample processing belongs in a C++ plug-in. Also excluded: file I/O, coroutine schedulers, and any abstraction that hides the host API. Scripts still write their own `init`, `step` and `draw`. The library supplies parts, not a framework.

**Constraints that shape every decision.**

- **`step` is hot.** Allocation there causes GC pauses that show up as timing jitter. Every `:process()` method allocates nothing: it returns scalars via multiple return values, or writes into a caller-supplied table.
- **Memory is finite.** Modules are independently requireable, so a script that needs the quantiser does not pay for MIDI and drawing code.
- **Determinism is a feature.** Given the same seed and input sequence, the library produces byte-identical output. This is what makes golden-file testing in the simulator possible.
- **Nothing is hidden.** Every object exposes its state as plain fields so scripts can serialise it or draw it without accessors.

## 2. Conventions

**Units.** One canonical unit per quantity, no exceptions and no unit suffixes in argument names.

| Quantity | Unit | Notes |
| --- | --- | --- |
| Voltage | volts, float | The universal interchange type. Never normalised 0..1. |
| Time | seconds, float | Matches the `dt` handed to `step`. Milliseconds appear only in parameter display. |
| Frequency | Hz, float |  |
| Phase | 0..1, float | Wrapping, never radians. |
| Pitch class | 0..11, integer | 0 = C. |
| MIDI note | 0..127, float allowed | 60 = middle C. |
| Collection index | 1-based, integer | Lua-native. |

**Naming.**

- Modules are lowercase single words: `require 'ntlib.quant'`.
- Constructors are `.new(opts)` and take a single options table with defaults for every field.
- Methods are camelCase. Predicates read as questions: `:isRunning()`, `:isLost()`.
- Pure functions live on the module (`volts.toHz`), stateful behaviour lives on objects (`q:process`).

**The object pattern.** Every stateful type follows the same shape:

```lua
local obj = mod.new{ ... }   -- validates, allocates once, at init time
obj:process(...)             -- allocation-free, call every step
obj:reset()                  -- return to initial state without reallocating
obj:set<Field>(v)            -- runtime reconfiguration, allocation-free
```

**Errors.** Constructors validate their options and raise with `error()` on bad input, because a typo at init should fail loudly in the simulator. `:process()` never validates and never raises: out-of-range input is clamped or wrapped. A script that throws inside `step` on hardware is a dead script.

**Allocation rules.** No `:process()` creates a table, a closure, a string, or a varargs pack. Functions that logically return several values use Lua multiple returns. Functions that logically return a collection take an output table as their last argument and return it:

```lua
rhythm.euclidInto(pattern, 5, 16, 0)   -- fills pattern, returns it
```

**Shared tables.** Constants such as `quant.SCALES.major` and `theory.CHORDS.min7` are shared and must not be mutated. Each such module provides a `copyOf(t)` when a mutable version is needed.

**Nothing global.** The library never touches globals, never reseeds `math.random`, and never installs metatables on standard types. The NT shares one Lua state across all scripts, so a library that leaks globals will break someone else's algorithm.

## 3. Installation and module layout

The firmware's Lua search path is `/programs/lua/?;/programs/lua/?.lua;/programs/lua/lib/?;/programs/lua/lib/?.lua`, so the library installs as a directory under `lib`:

```
/programs/lua/lib/ntlib/init.lua
/programs/lua/lib/ntlib/num.lua
/programs/lua/lib/ntlib/volts.lua
/programs/lua/lib/ntlib/quant.lua
/programs/lua/lib/ntlib/signal.lua
/programs/lua/lib/ntlib/clock.lua
/programs/lua/lib/ntlib/gate.lua
/programs/lua/lib/ntlib/env.lua
/programs/lua/lib/ntlib/lfo.lua
/programs/lua/lib/ntlib/rand.lua
/programs/lua/lib/ntlib/rhythm.lua
/programs/lua/lib/ntlib/seq.lua
/programs/lua/lib/ntlib/theory.lua
/programs/lua/lib/ntlib/param.lua
/programs/lua/lib/ntlib/state.lua
/programs/lua/lib/ntlib/midi.lua
/programs/lua/lib/ntlib/draw.lua
/programs/lua/lib/ntlib/test.lua
```

The numeric module is `num`, not `math`, so that `local math = require 'ntlib.math'` can never shadow the standard library in a user's script.

**Two ways to require.** Direct, which is what scripts should do:

```lua
local volts = require 'ntlib.volts'
local quant = require 'ntlib.quant'
```

Or through the root module, which lazily loads submodules on first field access via `__index`, costing nothing for modules never touched:

```lua
local nt = require 'ntlib'
local v = nt.volts.toHz(1.0)   -- loads ntlib.volts here, once
```

**Dependency graph.** Kept shallow on purpose, so the amalgamator can drop unused leaves.

| Module | Depends on |
| --- | --- |
| `num`, `rand`, `gate`, `state`, `test` | nothing |
| `volts`, `signal`, `clock`, `env`, `param`, `draw` | `num` |
| `lfo` | `num`, `rand` |
| `quant`, `theory`, `midi` | `num`, `volts` |
| `rhythm`, `seq` | `num`, `rand` |

**Single-file build.** `tools/amalgamate.lua` takes a list of module names, resolves dependencies, and emits one file wrapping each module in `package.preload`. This covers people who would rather paste one file into their script folder than manage a directory, and it is also how the simulator ships the library into its virtual filesystem.

```
lua tools/amalgamate.lua volts quant clock gate > ntlib-single.lua
```

An `ntlib-full.lua` containing every module is published with each release.

## 4. `ntlib.num` — numeric utilities

Stateless, allocation-free, the base everything else is written against.

**Range and mapping**

```lua
num.clamp(x, lo, hi)                      --> number
num.map(x, inLo, inHi, outLo, outHi)      --> number, unclamped
num.mapClamped(x, inLo, inHi, outLo, outHi)
num.lerp(a, b, t)                         --> a + (b-a)*t
num.unlerp(a, b, x)                       --> inverse of lerp
num.wrap(x, lo, hi)                       --> wraps into [lo, hi)
num.fold(x, lo, hi)                       --> reflects at the bounds
num.round(x)                              --> nearest integer, half away from zero
num.snap(x, step)                         --> nearest multiple of step
num.sign(x)                               --> -1, 0 or 1
num.approx(a, b, eps)                     --> boolean
```

**Signal shaping**

```lua
num.uni2bi(x)                             --> 0..1 to -1..1
num.bi2uni(x)                             --> -1..1 to 0..1
num.xfade(a, b, t)                        --> linear crossfade
num.xfadeEqualPower(a, b, t)
num.curve(x, k)                           --> bends 0..1 through itself; k in -1..1, 0 is linear
num.softClip(x, limit)                    --> cubic soft saturation
num.deadzone(x, width)                    --> zero near centre, rescaled outside; for attenuverters
num.pan(x)                                --> l, r  (constant power, x in -1..1)
```

**Levels**

```lua
num.db2lin(db)
num.lin2db(x)                             --> clamped at -120 dB for x <= 0
```

**Easing.** `num.ease` is a table of functions over 0..1, used mainly by display code and envelope curves:

```lua
num.ease.linear   num.ease.inQuad   num.ease.outQuad   num.ease.inOutQuad
num.ease.inCubic  num.ease.outCubic num.ease.inOutCubic
num.ease.inSine   num.ease.outSine  num.ease.inOutSine
num.ease.inExpo   num.ease.outExpo  num.ease.inOutExpo
```

**Voltage constants.** These describe the module's jacks, not a limit the library imposes:

```lua
num.V_MAX  = 10.0
num.V_MIN  = -10.0
num.clampV(v)                             --> clamp(v, V_MIN, V_MAX)
```

## 5. `ntlib.volts` — pitch and voltage

Everything here is 1V/octave arithmetic. Two reference points are configurable: which MIDI note sits at 0V, and the frequency of A4.

**Constants**

```lua
volts.PER_OCTAVE   = 1.0
volts.PER_SEMITONE = 1/12
volts.PER_CENT     = 1/1200
volts.NAMES_SHARP  = { [0]='C','C#','D','D#','E','F','F#','G','G#','A','A#','B' }
volts.NAMES_FLAT   = { [0]='C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B' }
```

**Tuning.** Module-level functions use a default tuning of MIDI 48 (C3) at 0V and A4 = 440 Hz. A script can change the default, or make an independent tuning object when it needs two at once.

```lua
volts.setDefault{ midiAt0V = 48, a4 = 440.0 }
local t = volts.tuning{ midiAt0V = 36, a4 = 432.0 }   -- same method set as the module
```

**Conversions.** All accept and return floats, so fractional semitones and glides work.

```lua
volts.toHz(v)          volts.fromHz(hz)
volts.toMidi(v)        volts.fromMidi(n)
volts.toSemis(v)       volts.fromSemis(s)      -- semitones relative to 0V
volts.toCents(v)       volts.fromCents(c)
volts.ratio(v)         --> 2^v, the frequency ratio of an interval
volts.interval(a, b)   --> b - a, in volts
```

**Transposition**

```lua
volts.transpose(v, semitones)      --> v + semitones/12
volts.detune(v, cents)
volts.octave(v, n)                 --> v + n
```

**Decomposition.** Allocation-free, safe in `step`:

```lua
volts.pitchClass(v)    --> 0..11
volts.octaveOf(v)      --> integer octave number under the current tuning
volts.split(v)         --> pitchClass, octave, centsOffset
```

**Naming.** These build strings, so call them from `draw` or `ui`, never from `step`. `noteName` caches its most recent result and returns the cached string when the inputs are unchanged, which makes the common case of a display that updates rarely free after the first frame.

```lua
volts.noteName(v, opts)      --> "C#3"   opts = { flats = false, octave = true, cents = false }
volts.noteNameMidi(n, opts)
volts.parseNote("Eb2")       --> volts, or nil plus an error string
```

## 6. `ntlib.quant` — quantiser

**Scale representation.** A scale is a 12-bit integer mask with bit 0 as the root, which makes membership tests a single `&` and makes scales cheap to serialise and to send over CV-controlled selection.

```lua
quant.SCALES = {
  chromatic, major, naturalMinor, harmonicMinor, melodicMinor,
  dorian, phrygian, lydian, mixolydian, aeolian, locrian,
  majorPent, minorPent, blues, wholeTone, octatonicHW, octatonicWH,
  majorTriad, minorTriad, dom7, min7, maj7,
}
quant.SCALE_NAMES              -- ordered array of display names, for a kEnum parameter
quant.SCALE_LIST               -- masks in the same order as SCALE_NAMES

quant.maskFromIntervals{0,2,4,5,7,9,11}   --> integer mask
quant.maskToIntervals(mask, out)          --> out, filled (setup only)
quant.contains(mask, pitchClass)          --> boolean
quant.count(mask)                         --> number of notes in the scale
quant.rotate(mask, n)                     --> mask rotated by n semitones
```

**The quantiser object**

```lua
local q = quant.new{
  scale      = quant.SCALES.naturalMinor,
  root       = 0,          -- pitch class 0..11
  hysteresis = 0.015,      -- volts of stickiness at note boundaries
  transpose  = 0,          -- semitones, applied after quantisation
  octaveSize = 12,         -- only differs for microtonal scales
}
```

**Processing.** The stateful call is the one to use on a CV input, because it will not chatter when the input sits on a boundary. Hysteresis widens the current note's capture window by the given voltage in both directions, so an input has to genuinely move before the output changes.

```lua
q:process(v)      --> vq, degree, changed
                  --   vq      quantised volts
                  --   degree  1-based index into the scale
                  --   changed true only on the step where the note moved
q:nearest(v)      --> vq        stateless, ignores hysteresis
q:reset()         -- forget the held note
```

**Reconfiguration.** All allocation-free, safe to call every step from a parameter or CV:

```lua
q:setScale(mask)
q:setRoot(pitchClass)
q:setHysteresis(v)
q:setTranspose(semitones)
```

**Degrees.** Useful for sequencers that store scale degrees rather than voltages, so a pattern survives a scale change:

```lua
q:degreeToVolts(degree, octave)   --> volts
q:voltsToDegree(v)                --> degree, octave
q:steps(v, n)                     --> volts n scale steps above v (negative n descends)
```

**Microtonal.** A quantiser can be built from an explicit cents table instead of a mask. The table lists degrees within one period; the period defaults to 1200 cents but can be set for Bohlen-Pierce and similar.

```lua
local q = quant.fromCents({0, 111, 204, 316, 386, 498, 702, 814, 884, 996}, { period = 1200 })
```

Everything above works identically on a cents-based quantiser, with `degree` indexing the cents table.

## 7. `ntlib.signal` — conditioning and edge detection

The host calls `gate` and `trigger` for inputs declared as `kGate` and `kTrigger`, but scripts routinely need edges from a `kCV` input, and they always need smoothing. Everything here processes one scalar per call.

**Schmitt trigger.** Standard Eurorack thresholds by default.

```lua
local s = signal.schmitt{ hi = 1.0, lo = 0.5 }
s:process(v)     --> state, rising, falling
s:reset(state)   -- state defaults to false
s.state          -- current boolean, readable directly
```

**Edge detector** for values that are already boolean, such as a comparison result:

```lua
local e = signal.edge()
e:process(bool)  --> rising, falling
```

**Slew limiter.** Rates are volts per second, which keeps behaviour independent of the distance travelled. `signal.rateFor(seconds, range)` converts a "time to cross this range" figure into a rate, for scripts whose parameter is expressed in time.

```lua
local sl = signal.slew{ rise = 10.0, fall = 10.0, shape = 'linear' }  -- or 'exp'
sl:process(target, dt)   --> v
sl:reset(v)
sl:setRates(rise, fall)
sl.arrived               -- true when the output has reached the target
```

In `exp` mode the rates are interpreted as time constants in seconds, and `arrived` uses a small epsilon since exponential approach never truly lands.

**Smoothing and filtering**

```lua
local lp = signal.onepole{ cutoff = 20 }     -- Hz
lp:process(x, dt)  --> y
lp:setCutoff(hz)
lp:reset(x)

local dc = signal.dcblock{ cutoff = 2 }
dc:process(x, dt)  --> y

local f = signal.follower{ attack = 0.005, release = 0.2 }   -- seconds
f:process(x, dt)   --> envelope of |x|
```

**Discrete helpers**

```lua
local d = signal.debounce{ time = 0.005 }
d:process(bool, dt)  --> stable boolean, changed

local c = signal.changed{ eps = 1e-4 }
c:process(v)         --> boolean, true only when v moved past eps

local sh = signal.sampleHold()
sh:process(v, trigger)  --> held value

local w = signal.window{ size = 64 }
w:push(v)
w:min()  w:max()  w:mean()  w:last()
```

`signal.window` is the ring buffer that `draw.scope` reads, so a script gets a running display for free by pushing each step's value into one.

## 8. `ntlib.clock` — clock tracking and generation

The hardest part of a clocked script is behaving well between pulses. This module estimates tempo from incoming pulses, runs a phase estimate forward so `draw` can animate smoothly at 30fps, and falls back to an internal clock when the input goes away.

**Construction**

```lua
local c = clock.new{
  ppqn      = 1,      -- pulses per quarter note arriving at the input
  bpm       = 120,    -- internal tempo, also the starting estimate
  timeout   = 2.0,    -- seconds without a pulse before the clock is considered lost
  smoothing = 0.25,   -- 0 = trust the last interval exactly, 1 = never adapt
  minBpm    = 20,
  maxBpm    = 400,
}
```

**Driving it.** Call `:pulse()` from `trigger` or from a Schmitt trigger's rising edge, and `:process(dt)` once per `step`.

```lua
c:pulse()            -- one rising edge arrived
c:process(dt)        --> phase, beat, bpm
                     --   phase 0..1 through the current pulse interval
                     --   beat  monotonically increasing pulse count
                     --   bpm   current estimate
```

Between pulses the phase advances at the estimated rate. When a pulse arrives early or late, the phase is not snapped: it is pulled toward zero over a few milliseconds so that anything driven by the phase does not jump. Set `smoothing = 0` and `resync = 'hard'` for scripts that would rather have exactness than smoothness.

**State fields.** All plain readable fields, safe to serialise:

```lua
c.bpm          c.period        -- seconds per pulse
c.running      c.external      -- true when tracking an external clock
c.confidence   -- 0..1, how consistent recent intervals have been
c.beat         c.phase
```

**Methods**

```lua
c:setBpm(x)          -- sets the internal tempo; ignored while external
c:setInternal(bool)  -- force free-run, or allow external takeover again
c:setPpqn(n)
c:isLost()           --> true once timeout has elapsed with no pulse
c:reset()            -- phase to zero, beat to zero, keep the tempo estimate
c:tapBpm()           --> estimate from the last few pulses, ignoring smoothing
```

**Derived clocks.** A divider is a lightweight object fed by its parent, so several can share one tempo estimate. Swing delays every second output tick by a fraction of the tick interval.

```lua
local d = c:divider{ div = 4, mult = 1, swing = 0.0, phase = 0.0 }
d:process(dt)   --> ticked, index, phase
d:reset()
d:set{ div = 3, swing = 0.15 }
```

`div` divides the parent rate, `mult` multiplies it. Multiplication is predictive: it subdivides the current estimated interval, so a 4x multiplier produces four evenly spaced ticks per input pulse, with the error from a tempo change absorbed at the next pulse.

## 9. `ntlib.gate` — gate and trigger outputs

The trailing edge of a gate is the thing scripts get wrong. This module owns the timer so `step` can stay simple.

**Single channel**

```lua
local g = gate.new{
  length       = 0.01,    -- seconds, default trigger length
  voltage      = 5.0,
  retriggerGap = 0.001,   -- forced low period when retriggered while already high
}

g:trigger(length)   -- length optional, overrides the default for this one shot
g:open()            -- hold high indefinitely
g:close()
g:process(dt)       --> v, state
g.busy              -- true while high or in a retrigger gap
```

The retrigger gap exists because a downstream envelope will not re-fire if the gate never goes low. Set it to zero for a legato voice.

**Bank.** Most scripts drive several gate outputs, so the bank writes straight into the table returned from `step`, with an offset to place it among other outputs.

```lua
local bank = gate.bank{ channels = 4, length = 0.01, voltage = 5.0 }

bank:trigger(ch, length)
bank:open(ch)   bank:close(ch)
bank:closeAll()
bank:process(dt, out, offset)   --> out
                                --   writes channels into out[offset+1 .. offset+n]
                                --   offset defaults to 0
bank:isBusy(ch)
```

**Ratchets.** A queued burst on one channel, which is otherwise a fiddly bit of state to hand-roll:

```lua
bank:ratchet(ch, count, spacing, length)   -- spacing in seconds between onsets
g:ratchet(count, spacing, length)
```

A new `:trigger()` or `:ratchet()` on a channel replaces any queue still pending on it.

**Clock-relative lengths.** When a script wants gate length as a fraction of the step rather than an absolute time, compute it from the clock and pass it in:

```lua
bank:trigger(1, clk.period * 0.5)
```

## 10. `ntlib.env` — envelopes

All envelope types share one interface and output 0..1, leaving the script to scale into volts. They advance on `dt`, so they behave identically at any step rate, which matters because the simulator and the hardware do not necessarily agree on it.

**Shared interface**

```lua
e:trigger()          -- fire from the start
e:gate(bool)         -- gate high or low, for sustaining types
e:release()          -- jump to the release stage
e:process(dt)        --> level, stage
e:reset()            -- silent and idle, no output change until next trigger
e.level              -- current 0..1
e.stage              -- 'idle' | 'delay' | 'attack' | 'hold' | 'decay' | 'sustain' | 'release'
e:isActive()         --> stage ~= 'idle'
e:setCurve(k)        -- -1 logarithmic, 0 linear, +1 exponential
```

**Types**

```lua
env.ad{ attack = 0.005, decay = 0.4, curve = 0.6, loop = false }
env.ar{ attack = 0.01,  release = 0.3, curve = 0.6 }
env.asr{ attack, release }                      -- sustains at 1 while gated
env.adsr{ attack, decay, sustain = 0.7, release, curve }
env.dahdsr{ delay, attack, hold, decay, sustain, release, curve }
```

**Retrigger behaviour.** Named explicitly because the three options sound quite different and the choice is usually a design decision, not a detail:

```lua
env.ad{ ..., retrigger = 'restart' }   -- back to zero and attack (default)
env.ad{ ..., retrigger = 'continue' } -- attack from the current level
env.ad{ ..., retrigger = 'ignore' }   -- a trigger during the envelope does nothing
```

**Runtime changes.** Time changes take effect immediately without glitching the current stage: the remaining portion of the stage is rescaled rather than restarted.

```lua
e:setTimes{ attack = 0.02, decay = 0.5 }
e:setSustain(level)
```

**Looping.** With `loop = true` an AD envelope free-runs as a shape generator, which makes it a sync-able LFO with independent rise and fall. `e.cycles` counts completed loops, and `:process` returns `stage == 'attack'` on the wrap step so a script can emit an end-of-cycle trigger.

## 11. `ntlib.lfo` — phasors and shapes

Split in two deliberately: a phasor that owns time and sync, and pure shape functions over phase. Scripts that need something unusual drive their own shape from a phasor; scripts that want an LFO use the wrapper.

**Phasor**

```lua
local p = lfo.phasor{ freq = 1.0, phase = 0.0 }
p:process(dt)      --> phase, wrapped
                   --   wrapped is true on the step where phase crossed 1
p:setFreq(hz)
p:setPeriod(seconds)
p:setPitch(v)      -- volts, via volts.toHz, for a v/oct LFO
p:sync(phase)      -- hard sync, phase defaults to 0
p:reset()
p.phase            -- readable, for display
```

Negative frequencies run the phasor backwards, which is how reverse ramps are made.

**Shapes.** Pure functions of phase, returning -1..1, no state, no allocation:

```lua
lfo.sine(ph)
lfo.tri(ph, skew)      -- skew 0..1, 0.5 is symmetrical, 0 and 1 are ramps
lfo.saw(ph)            -- falling
lfo.ramp(ph)           -- rising
lfo.pulse(ph, width)   -- width 0..1
lfo.expo(ph, k)        -- exponential decay shape
lfo.logistic(ph, k)    -- S-curve
```

**Wrapper.** A phasor plus a shape plus output scaling, which covers most uses:

```lua
local l = lfo.new{
  shape    = 'sine',    -- any shape name above, or a function(ph, param)
  freq     = 1.0,
  amp      = 5.0,       -- volts, peak
  offset   = 0.0,       -- volts
  bipolar  = true,      -- false gives 0..amp
  param    = 0.5,       -- skew, width or k, depending on shape
  phase    = 0.0,
}
l:process(dt)   --> volts
l:setShape(name)  l:setAmp(v)  l:setParam(x)
l:sync(phase)
```

**Random shapes.** These need state and a source of randomness, so they are objects rather than functions. Both take an `rng` from `ntlib.rand`, which keeps them reproducible.

```lua
local sh = lfo.sampleHold{ freq = 4, rng = rng, min = -5, max = 5 }
sh:process(dt)   --> volts

local sm = lfo.smoothRandom{ freq = 0.5, rng = rng, interp = 'cubic', min = -5, max = 5 }
sm:process(dt)   --> volts

local dr = lfo.drift{ rng = rng, rate = 0.1, min = -5, max = 5 }   -- slow bounded wander
dr:process(dt)   --> volts
```

Both `sampleHold` and `smoothRandom` accept `:sync()` so they can be clocked from `ntlib.clock` instead of free-running.

## 12. `ntlib.rand` — deterministic randomness

The library never uses `math.random`. A script's randomness should be reproducible across a reload, a preset recall, and a simulator test run, and the NT's shared Lua state means reseeding the global generator would affect other algorithms.

**Generator.** xorshift128+, producing 53-bit doubles, with state small enough to serialise into a preset.

```lua
local rng = rand.new(seed)     -- seed is any integer; omitted means a fixed default
rng:next()          --> [0, 1)
rng:int(lo, hi)     --> integer in [lo, hi]
rng:range(lo, hi)   --> float in [lo, hi)
rng:bool()
rng:chance(p)       --> true with probability p
rng:sign()          --> -1 or 1
rng:pick(t)         --> a random element of array t
rng:shuffle(t)      --> t, shuffled in place (setup only; touches every element)
rng:seed(n)
rng:state()         --> a, b       two integers
rng:setState(a, b)
```

**Weighted choice.** Build the table once, sample it cheaply:

```lua
local w = rand.weights{ rng = rng, weights = {5, 3, 1, 1} }
w:pick()            --> index 1..4
w:set(i, weight)    -- updates the cumulative table in place
```

**Distributions**

```lua
rand.uniform(rng, lo, hi)
rand.triangular(rng, lo, hi)       -- centre-biased, good for humanising
rand.gaussian(rng, mean, sd)       -- two-sum approximation, no logs
rand.exponential(rng, mean)
```

**Random walk**

```lua
local w = rand.walk{ rng = rng, min = -5, max = 5, step = 0.5,
                     mode = 'clamp' }   -- 'clamp' | 'wrap' | 'reflect'
w:next()      --> value
w:set(v)
w.value
```

**Shuffle bag.** Draws without replacement until exhausted, then reshuffles. This is what makes a "random" sequencer feel less repetitive than plain sampling.

```lua
local bag = rand.bag{ rng = rng, items = {1,2,3,4,5,6,7,8} }
bag:next()      --> item
bag:refill()
bag.remaining
```

**Markov chain.** A square transition matrix of weights; rows need not be normalised.

```lua
local m = rand.markov{ rng = rng, size = 4, matrix = {
  {0, 3, 1, 0},
  {1, 0, 2, 1},
  {0, 1, 0, 3},
  {2, 0, 1, 0},
}}
m:next()        --> state index
m:setState(i)
m:set(from, to, weight)
```

**Turing machine.** The shift register from the classic module, because a surprising number of scripts want it.

```lua
local t = rand.turing{ rng = rng, length = 16, prob = 0.5 }
t:step()             --> bit (0 or 1), the bit shifted out
t:value(bits)        --> 0..1 read from the top `bits` of the register (default 8)
t:setLength(n)       -- 2..32
t:setProb(p)         -- 0 = locked, 0.5 = fully random, 1 = inverted loop
t:write(bits)        -- load the register directly, for preset recall
t:read()             --> the register as an integer
```

## 13. `ntlib.rhythm` — pattern generation

Patterns are arrays of booleans, 1-based. Generators fill a table the caller owns, so nothing allocates after setup.

**Euclidean**

```lua
rhythm.euclid(hits, steps, rotation, out)   --> out
                                            --   out is optional; omitted allocates
rhythm.euclidBits(hits, steps, rotation)    --> integer bitmask, for steps <= 32
```

The implementation is Bjorklund's algorithm with the recursion flattened, so it has no allocation and a bounded cost even at 32 steps.

**Pattern object.** Wraps a table with the bookkeeping a sequencer needs:

```lua
local p = rhythm.pattern{ steps = 16, hits = 5, rotation = 0 }
p:at(i)                  --> boolean, i wraps
p:set(i, bool)
p:toggle(i)
p:euclid(hits, steps, rotation)
p:rotate(n)              -- in place
p:invert()
p:clear()   p:fill()
p:count()                --> number of hits
p.steps
```

**Density.** Thinning and thickening a pattern deterministically, so a density CV sweeps smoothly rather than rerolling:

```lua
p:density(amount, rng)   -- amount 0..1 relative to the base pattern
```

Each step is assigned a fixed random rank when the base pattern is set. Raising density re-enables steps in rank order, lowering it removes them in reverse. Sweeping the control up and down retraces the same path.

**Text form.** For tests, presets and display:

```lua
rhythm.fromString('x..x..x.', out)   --> out    ('x' or 'X' is a hit, anything else a rest)
rhythm.toString(p)                   --> 'x..x..x.'
```

**Polymeter.** Several patterns of different lengths advanced by a shared tick:

```lua
local poly = rhythm.poly{ lengths = {3, 4, 5} }
poly:advance()        --> fires a callback-free result: use poly:at(track)
poly:at(track)        --> boolean for the current position of that track
poly:reset()
poly.positions        -- array of current indices, readable for display
```

## 14. `ntlib.seq` — sequencing

**Playhead.** Owns only the index and the direction logic. Scripts keep their own data tables and index them, which keeps the playhead usable for any number of parallel tracks.

```lua
local s = seq.new{
  length    = 8,
  first     = 1,
  direction = 'forward',
  rng       = rng,          -- required for the random directions
}

s:advance()      --> index, wrapped
s:retreat()      --> index, wrapped
s:jump(i)
s:reset()        -- back to first, direction state cleared
s.index
```

Directions: `forward`, `reverse`, `pendulum` (endpoints played once), `pingpong` (endpoints repeated), `random`, `brownian` (random walk of ±1), `shuffle` (a shuffle bag over the step indices, so every step plays once per cycle).

```lua
s:setDirection(name)
s:setLength(n)     -- current index is clamped into the new range, not reset
s:setFirst(i)
```

**Track.** A fixed-size value store with the operations a sequencer UI needs:

```lua
local t = seq.track{ length = 16, default = 0 }
t:get(i)   t:set(i, v)      -- i wraps
t:fill(v)
t:randomise(rng, lo, hi)
t:shift(n)                  -- rotate contents
t:copyFrom(other)
t:swap(i, j)
t.length
```

Tracks hold numbers, which may be volts, scale degrees or arbitrary ids. Storing degrees and quantising on output is the pattern worth recommending, since it lets a scale change reshape an existing pattern instead of only re-mapping it.

**Recorder.** A ring buffer with time, used for CV delay, looping and scope display:

```lua
local r = seq.recorder{ size = 512 }
r:push(v, dt)          -- append, advancing the internal timeline
r:at(secondsAgo)       --> interpolated value
r:atIndex(i)           --> raw sample, i counted back from the newest
r:clear()
r.filled               -- number of valid samples
r.duration             -- seconds currently held
```

`seq.recorder` satisfies the same read interface as `signal.window`, so either can be handed to `draw.scope`.

## 15. `ntlib.theory` — chords and harmony

All functions here work in semitones as integers. Converting to volts is `volts.fromSemis`, kept separate so the same code can drive MIDI output.

**Tables**

```lua
theory.INTERVALS = { P1=0, m2=1, M2=2, m3=3, M3=4, P4=5, TT=6, P5=7,
                     m6=8, M6=9, m7=10, M7=11, P8=12 }

theory.CHORDS = {
  maj = {0,4,7},      min = {0,3,7},      dim = {0,3,6},      aug = {0,4,8},
  sus2 = {0,2,7},     sus4 = {0,5,7},
  maj6 = {0,4,7,9},   min6 = {0,3,7,9},
  maj7 = {0,4,7,11},  min7 = {0,3,7,10},  dom7 = {0,4,7,10},
  dim7 = {0,3,6,9},   halfDim7 = {0,3,6,10}, minMaj7 = {0,3,7,11},
  add9 = {0,4,7,14},  maj9 = {0,4,7,11,14}, min9 = {0,3,7,10,14}, dom9 = {0,4,7,10,14},
}
theory.CHORD_NAMES     -- ordered display names, for a kEnum parameter
```

**Construction.** Writes into a caller table and returns the voice count, so it is safe in `step`:

```lua
theory.chord(root, quality, out)              --> n
theory.invert(out, n, inversion)              --> n     -- inversion may exceed n
theory.spread(out, n, octaves)                --> n      -- opens the voicing upward
theory.drop(out, n, which)                    --> n      -- drop-2, drop-3 voicings
theory.limitRange(out, n, lo, hi)             --> n      -- octave-folds into a range
```

**Voice leading.** Picks the inversion and octave placement of the next chord that moves the least from the previous one. This is the function that makes a chord script sound musical rather than blocky.

```lua
theory.leadTo(prev, prevN, next, nextN)       --> nextN, reordered in place
```

**Scale-aware operations.** These take a 12-bit mask from `ntlib.quant`, so the two modules compose:

```lua
theory.degreeToSemis(mask, degree)            --> semitones, degrees beyond the octave wrap upward
theory.semisToDegree(mask, semis)             --> degree, octave
theory.diatonicTranspose(mask, semis, degrees)--> semitones, staying in the scale
theory.triadOn(mask, degree, out)             --> n     -- the diatonic triad on that degree
theory.seventhOn(mask, degree, out)           --> n
```

**Naming.** Display-side, so these allocate strings:

```lua
theory.chordName(root, quality, inversion)    --> 'Am/C'
theory.romanNumeral(mask, degree)             --> 'vi'
theory.parseProgression('I-vi-IV-V', out)     --> out, an array of degrees
```

## 16. `ntlib.param` — parameters and modulation

Host parameters are integers with a unit and an optional scaling factor, and scripts index them positionally out of `self.parameters`. That is fine for three parameters and miserable for fifteen. This module builds the declaration table and hands back named, scaled access.

**Builder.** Declaration order is parameter order.

```lua
local P = param.builder()

P:int   ('Steps',    1, 16, 8)
P:volts ('Offset',  -10, 10, 0, { step = 0.01 })   -- emits an integer range with kBy100
P:ms    ('Gate',     1, 500, 20)
P:hz    ('Rate',     1, 2000, 100, { step = 0.1 })
P:percent('Density', 0, 100, 75)
P:semis ('Transpose', -24, 24, 0)
P:db    ('Level',   -60, 6, 0)
P:enum  ('Mode',    { 'Up', 'Down', 'Random' }, 1)
P:bool  ('Latch',   false)
P:bus   ('CV In')                                   -- an input bus selector

P:build()   --> the array to place in init's return under `parameters`
```

Each declaration takes an optional trailing table: `{ step = 0.01 }` sets display resolution and the host scaling factor, `{ name = 'steps' }` overrides the derived accessor key.

**Access.** Keys are derived from the display name, lowercased with spaces removed. `P:read(self)` refills one persistent table and returns it, so it allocates nothing per step.

```lua
local p = P:read(self)
p.steps      --> integer
p.offset     --> volts, already divided by the scaling factor
p.gate       --> seconds, converted from the ms declaration
p.mode       --> integer index
p.modeName   --> 'Random'      (enum declarations also expose a name field)
p.latch      --> boolean
```

**Change detection.** Rebuilding derived state every step is wasteful when parameters move rarely:

```lua
if P:changed(self, 'scale') then q:setScale(quant.SCALE_LIST[p.scale]) end
if P:anyChanged(self) then rebuild() end
```

**Modulation.** The combination of a parameter, a CV input and an attenuverter is the most-repeated block of arithmetic in NT scripts:

```lua
local m = param.mod{
  base    = 'rate',        -- accessor key on the read table
  input   = 3,             -- 1-based input index, or 0 for none
  depth   = 1.0,           -- scaling from volts to parameter units
  attenuverter = 'ratedepth',  -- optional accessor key providing -1..1
  min = 1, max = 2000,
  slew = 0.01,             -- seconds of smoothing, 0 to disable
}

m:process(p, inputs, dt)   --> value, already clamped and smoothed
```

**Smoothing on its own**, for parameters that click when stepped:

```lua
local sm = param.smooth{ time = 0.02 }
sm:process(target, dt)   --> value
```

## 17. `ntlib.state` — preset serialisation

What a script stores in `serialise` has to survive the script being edited, so the module is built around an explicit schema and version.

**Schema**

```lua
local S = state.schema{
  version = 3,
  fields = {
    { 'pattern', 'bits',  32 },      -- packed bitfield, 32 steps
    { 'notes',   'i8',    16 },      -- 16 signed bytes
    { 'scale',   'u16'        },
    { 'root',    'u8'         },
    { 'bpm',     'f32'        },
    { 'rngA',    'u32'        },     -- generator state, so randomness survives recall
    { 'rngB',    'u32'        },
    { 'name',    'str',   16  },
  },
  migrate = {
    [1] = function(t) t.root = 0; return t end,
    [2] = function(t) t.bpm = t.tempo or 120; t.tempo = nil; return t end,
  },
}
```

Types: `u8 i8 u16 i16 u32 i32 f32 f64 bool bits str`. Everything is encoded with `string.pack`, which Lua 5.4 provides, giving a compact binary blob rather than a serialised table.

**Use**

```lua
serialise = function(self)
  return S:save(self.data)             --> string
end

-- in init, given the string the host hands back
local data, err = S:load(str)          --> table, or nil plus an error
if not data then data = S:defaults() end
```

`S:load` reads the stored version, runs each migration in order up to the current version, and returns the upgraded table. An unknown or future version returns `nil` plus a message rather than a half-filled table, so the script can fall back to defaults instead of loading nonsense.

**Helpers**

```lua
S:defaults()          --> a fresh table with every field zeroed or defaulted
S:size()              --> bytes a saved blob occupies
state.packBits(t, n)  --> integer, from an array of booleans
state.unpackBits(x, n, out) --> out
```

The bit helpers matter in practice because a 32-step pattern stored as a table of booleans costs far more preset space than one integer.

## 18. `ntlib.midi` — messages and voice allocation

**Parsing.** The host delivers raw bytes. Parsing returns multiple values and allocates nothing.

```lua
midi.parse(b0, b1, b2)   --> kind, channel, d1, d2
                         --   kind is an integer constant, not a string
midi.NOTE_OFF  midi.NOTE_ON  midi.POLY_AT  midi.CC  midi.PROGRAM
midi.CHAN_AT   midi.BEND     midi.SYSEX    midi.UNKNOWN
midi.CLOCK  midi.START  midi.CONTINUE  midi.STOP  midi.RESET

midi.isRealtime(b0)   --> boolean
midi.isNoteOn(kind, d2)   -- note-on with velocity 0 counts as note-off
```

**Building.** Multiple returns, ready to hand to the host's send function:

```lua
midi.noteOn(ch, note, vel)      --> b0, b1, b2
midi.noteOff(ch, note, vel)
midi.cc(ch, num, value)
midi.bend(ch, value14)          -- value14 is 0..16383, 8192 centred
midi.bendSemis(ch, semis, range)
midi.program(ch, n)
midi.cc14(ch, msbNum, value14)  --> two messages, six return values
midi.nrpn(ch, param, value, out)--> out, an array of byte triples (setup or rare use)
```

**Clock.** Consumes realtime bytes and produces a tempo, matching the interface of `ntlib.clock`'s tracker:

```lua
local mc = midi.clock{ ppqn = 24 }
mc:byte(b0)        --> ticked, started, stopped
mc:process(dt)     --> phase, beat, bpm
mc.running
```

**Note stack.** Monophonic behaviour done properly, with the priority modes hardware monosynths use:

```lua
local st = midi.noteStack{ size = 16, priority = 'last' }  -- 'last' | 'low' | 'high'
st:on(note, vel)   --> note, vel, retrigger   -- the note that should now sound
st:off(note)       --> note, vel, retrigger   -- note is nil when the stack empties
st:count()
st:panic()
```

**Voice allocator.** The piece most worth having in a library, because getting stealing and retriggering right is fiddly and every polyphonic script needs it.

```lua
local va = midi.voices{
  count     = 4,
  steal     = 'oldest',    -- 'oldest' | 'newest' | 'lowest' | 'highest' | 'quietest' | 'none'
  unison    = 1,           -- voices per note; 4 with count 4 is a mono unison patch
  detune    = 0.0,         -- volts spread across unison voices
  retrigger = true,        -- re-attack a voice that is reassigned the same note
  rotate    = true,        -- prefer the least recently used free voice
}

va:on(note, vel)   --> voice index, stolen   -- stolen is the note that was dropped, or nil
va:off(note)       --> voice index
va:panic()
va:voice(i)        --> note, velocity, active, age
va:forEach(fn)     -- setup and debugging only; allocates a closure at the call site
```

Voice fields are also exposed as parallel arrays (`va.notes`, `va.vels`, `va.active`, `va.ages`) so `step` can write pitch and gate outputs in a plain numeric loop.

**MPE.** A thin routing layer on top of the allocator:

```lua
local mpe = midi.mpe{ voices = va, masterChannel = 1, memberLow = 2, memberHigh = 16,
                      bendRange = 48 }
mpe:message(b0, b1, b2)   --> voice index or nil
mpe:pitch(i)              --> volts, note plus per-note bend
mpe:pressure(i)           --> 0..1
mpe:timbre(i)             --> 0..1
```

## 19. `ntlib.draw` — display widgets

The screen is 256x64 with colours 0..15. Widgets draw immediately using the host primitives; nothing is buffered and nothing is retained.

**Layout**

```lua
draw.W, draw.H            -- 256, 64
draw.TOP                  -- first y below the standard parameter line
draw.grey = { off=0, faint=2, dim=5, mid=8, bright=12, full=15 }

draw.textWidth(s, font)   --> pixels, from the built-in width tables
draw.fontHeight(font)
draw.centreX(s, font)     --> x for a horizontally centred string
draw.rows(n, top, gap)    --> y positions, into a reusable table
draw.cols(n, left, right, gap)
```

`font` is `'tiny'`, `'normal'` or `'smart'`, matching the host's three text calls.

**Text**

```lua
draw.label(x, y, s, colour, align)       -- align 'left' | 'centre' | 'right'
draw.value(x, y, label, s, colour)       -- label dim on the left, value bright on the right
draw.marquee(x, y, w, s, phase, colour)  -- scrolls a long string, phase 0..1
```

**Meters and bars**

```lua
draw.bar(x, y, w, h, v01, opts)
draw.meter(x, y, w, h, volts, opts)      -- opts.bipolar draws from a centre line
draw.slider(x, y, w, h, v01, opts)       -- with a handle
draw.knob(cx, cy, r, v01, opts)          -- arc, opts.start and opts.sweep in turns
draw.gauge(x, y, w, h, v01, opts)        -- segmented, opts.segments
```

**Signal displays**

```lua
draw.scope(x, y, w, h, buffer, opts)     -- buffer is signal.window or seq.recorder
                                         -- opts.min, opts.max, opts.mode 'line'|'fill'|'dots'
draw.envelope(x, y, w, h, env, opts)     -- an env object, or { a, d, s, r }
draw.curve(x, y, w, h, fn, opts)         -- samples fn(0..1) across the width
```

**Musical widgets**

```lua
draw.keyboard(x, y, w, h, mask, opts)    -- 12-note mini keyboard
                                         -- mask lights scale notes, opts.playing lights held notes
draw.steps(x, y, w, h, pattern, current, opts)
                                         -- pattern is booleans or a seq.track
                                         -- opts.values shades each step by value
draw.piano(x, y, w, h, lowNote, highNote, notes, opts)   -- wider keyboard for poly display
```

**Chrome**

```lua
draw.frame(x, y, w, h, colour)
draw.hline(y, x1, x2, colour)   draw.vline(x, y1, y2, colour)
draw.dither(x, y, w, h, level)  -- 0..4, a checker fill for backgrounds
draw.list(x, y, w, h, items, selected, scroll, opts)
draw.tabs(x, y, w, names, selected)
```

**String costs.** The expensive part of `draw` is producing strings, not pixels. Every widget takes strings already formatted; none calls `string.format` internally. For values that change rarely, the module provides a small memo so formatting happens only when the number moves:

```lua
local fmt = draw.formatter('%.2fV')
fmt(v)   --> a cached string, reformatted only when v changes
```

## 20. `ntlib.test` — headless harness

This module is not installed on the SD card. It runs in the simulator and in CI, and it is the reason the rest of the library insists on determinism.

**Harness.** Loads a script table and drives it with a fixed time step, so a run is exactly reproducible.

```lua
local h = test.harness{
  script   = 'examples/quantseq.lua',   -- path, or an already-loaded script table
  stepRate = 1000,                      -- steps per second
  seed     = 1,
}

h:setInput(n, volts)
h:pulse(n, width)          -- a trigger on input n
h:setParam(name, value)    -- by display name
h:step()                   -- one step of 1/stepRate
h:run(seconds)
h:output(n)                --> volts
h:outputs()                --> the whole array
h.time                     -- simulated seconds elapsed
```

**Input generators.** Attach a function of time to an input and let `:run` drive it:

```lua
h:drive(1, test.sig.clock(120))          -- 120 BPM pulse train
h:drive(2, test.sig.ramp(-5, 5, 4.0))    -- -5V to 5V over four seconds
h:drive(2, test.sig.sine(1.0, 5.0))
h:drive(3, test.sig.steps{0, 1, 2, 3, 4}, 0.25)
h:drive(4, test.sig.fromCsv('fixtures/cv.csv'))
```

**Recording outputs.** Captures make assertions about behaviour over time rather than at an instant:

```lua
local rec = h:record(1)      -- start recording output 1
h:run(2.0)
rec:events()                 --> array of { t, v } where the value changed
rec:edges(1.0)               --> rising-edge times above a threshold
rec:intervals(1.0)           --> gaps between those edges, for timing assertions
rec:min()  rec:max()  rec:mean()
```

**Display testing.** `h:frame()` renders one `draw` call into a framebuffer and returns it as a deterministic string, which makes golden files possible:

```lua
h:frame()                        --> 256x64 framebuffer object
h:frame():hash()                 --> stable hash of the frame
h:frame():toText()               --> ASCII art, for readable diffs in test output
test.matchGolden(h:frame(), 'quantseq/idle')
```

**Assertions and runner.** Output is TAP, so it works in CI and in a simulator panel.

```lua
test.suite('quantiser', function(t)
  t:case('snaps to the scale', function()
    local q = quant.new{ scale = quant.SCALES.major, root = 0 }
    t:near(q:nearest(0.1), 0.0, 1e-9)
    t:near(q:nearest(0.2), 2/12, 1e-9)
  end)

  t:case('does not chatter at a boundary', function()
    local q = quant.new{ scale = quant.SCALES.major, hysteresis = 0.02 }
    q:process(0.0)
    local changes = 0
    for i = 1, 100 do
      local _, _, changed = q:process(1/24 + (i % 2) * 0.001)
      if changed then changes = changes + 1 end
    end
    t:equal(changes, 0)
  end)
end)

test.run()   --> passes, failures; prints TAP
```

Assertion set: `t:equal`, `t:near`, `t:truthy`, `t:falsy`, `t:throws`, `t:noAlloc(fn)`. The last runs a function and asserts that `collectgarbage('count')` did not grow, which is how the allocation-free promise in section 2 stays honest.

## 21. Tooling, versioning and licensing

**Type annotations.** Every public function carries LuaLS annotations, and the release ships two definition files:

- `types/ntlib.def.lua` for the library.
- `types/distingnt.def.lua` for the host API itself: the `drawXXX` functions, the `kCV`/`kGate`/`kTrigger` and `kLinear`/`kStepped` constants, the unit constants, and the shape of the table `init` returns.

The second file is worth shipping even to people who never use the library, and it is what gives the simulator's editor completion and inline errors.

```lua
---@class ntlib.Quantiser
---@field scale integer
---@field root integer
local Quantiser = {}

---Quantise a voltage, with hysteresis.
---@param v number volts
---@return number volts, integer degree, boolean changed
function Quantiser:process(v) end
```

**Versioning.** Semantic versioning, exposed for scripts that need to check:

```lua
ntlib.VERSION      -- '1.2.0'
ntlib.VERSION_NUM  -- 10200, for numeric comparison
ntlib.require('1.2')   -- raises if the installed library is older
```

A script that ships to other people should state the minimum version in a comment at the top, since the user's SD card holds whichever copy they installed.

**Repository layout**

```
src/ntlib/*.lua          the modules
types/*.def.lua          LuaLS definitions
tests/*.lua              suites run by ntlib.test
examples/*.lua           complete scripts, each covered by a test
tools/amalgamate.lua     single-file builder
tools/docgen.lua         reference generated from the annotations
```

**CI.** Plain Lua 5.4 runs the suites headless, luacheck runs with globals whitelisted for the host API (`drawText`, `kCV` and friends), and stylua enforces formatting. The allocation assertions run in CI too, so a regression that starts allocating in `step` fails the build rather than being discovered on hardware.

**Licence.** 0BSD or MIT. People will paste pieces of this into their own scripts and post those scripts on the forum, and a licence with an attribution requirement makes that awkward for no benefit.

**Simulator integration.** Three things worth wiring into luading specifically: automatic library injection so `require 'ntlib.x'` resolves without setup, automatic embedding of the runtime modules when an importing script is exported, source-derived completion/hover/signature support in the code editor (with the definition files retained for external LuaLS clients), and a test panel that runs a script's suite and shows framebuffer diffs for failed golden files.

## 22. Worked example

A clocked, quantised sequencer with a gate output. It exercises `param`, `clock`, `gate`, `quant`, `seq`, `rand` and `draw`, and shows the intended division of labour: the library owns timing and conversion, the script owns musical decisions.

```lua
local param = require 'ntlib.param'
local clock = require 'ntlib.clock'
local gate  = require 'ntlib.gate'
local quant = require 'ntlib.quant'
local volts = require 'ntlib.volts'
local seq   = require 'ntlib.seq'
local rand  = require 'ntlib.rand'
local draw  = require 'ntlib.draw'

local P = param.builder()
P:int    ('Steps',     1, 16, 8)
P:enum   ('Scale',     quant.SCALE_NAMES, 2)
P:int    ('Root',      0, 11, 0)
P:enum   ('Direction', { 'Forward', 'Reverse', 'Pendulum', 'Shuffle' }, 1)
P:ms     ('Gate',      1, 500, 20)
P:semis  ('Transpose', -24, 24, 0)

local DIRS = { 'forward', 'reverse', 'pendulum', 'shuffle' }

local rng, clk, out, q, play, track
local outs = { 0, 0 }
local pitchFmt = draw.formatter('%s')

return {
  name = 'Quant Seq',
  author = 'ntlib example',

  init = function(self)
    rng   = rand.new(0x5EED)
    clk   = clock.new{ ppqn = 1, timeout = 2.0 }
    out   = gate.new{ length = 0.02, voltage = 5.0 }
    q     = quant.new{ scale = quant.SCALES.naturalMinor, root = 0, hysteresis = 0.015 }
    play  = seq.new{ length = 8, rng = rng }
    track = seq.track{ length = 16, default = 0 }
    for i = 1, 16 do track:set(i, rng:int(-7, 7)) end   -- scale degrees, not volts

    return {
      inputs      = { kTrigger, kCV, kTrigger },
      outputs     = { kStepped, kLinear },
      inputNames  = { 'Clock', 'Transpose CV', 'Reset' },
      outputNames = { 'Pitch', 'Gate' },
      parameters  = P:build(),
    }
  end,

  trigger = function(self, input)
    if input == 1 then
      clk:pulse()
      play:advance()
      out:trigger(P:read(self).gate)
    elseif input == 3 then
      play:reset()
      clk:reset()
    end
  end,

  step = function(self, dt, inputs)
    local p = P:read(self)

    if P:changed(self, 'scale') then q:setScale(quant.SCALE_LIST[p.scale]) end
    if P:changed(self, 'root') then q:setRoot(p.root) end
    if P:changed(self, 'steps') then play:setLength(p.steps) end
    if P:changed(self, 'direction') then play:setDirection(DIRS[p.direction]) end

    clk:process(dt)

    local degree = track:get(play.index)
    local base   = q:degreeToVolts(degree, 0)
    outs[1]      = q:process(base + inputs[2] + volts.fromSemis(p.transpose))
    outs[2]      = out:process(dt)
    return outs
  end,

  draw = function(self)
    local p = P:read(self)

    draw.steps(2, 14, 252, 12, nil, play.index,
               { count = p.steps, values = track, colour = draw.grey.mid })

    draw.label(2, 40, pitchFmt(volts.noteName(outs[1])), draw.grey.full, 'left')
    draw.label(128, 40, quant.SCALE_NAMES[p.scale], draw.grey.dim, 'centre')
    draw.value(254, 40, 'BPM', clk.running and math.floor(clk.bpm + 0.5) or '--',
               draw.grey.dim)

    draw.keyboard(2, 48, 60, 14, q.scale, { root = p.root, playing = volts.pitchClass(outs[1]) })
    draw.meter(200, 48, 54, 14, outs[1], { bipolar = true })
    return true
  end,
}
```

**What the library is doing here.** Pulses become a tempo estimate that the display can show and that a divider could subdivide. The gate output's trailing edge is handled without the script tracking a timer. Pattern data is stored as scale degrees, so changing the scale parameter reshapes the melody rather than transposing it. The RNG is seeded, so the pattern is the same every time the script loads, and `rng:state()` could be written into `serialise` to keep it after a re-roll.

**Its test**, for the record, is about twenty lines: drive input 1 with `test.sig.clock(120)`, run four seconds, assert that output 2 produced eight rising edges with intervals of 0.5s, and that every value on output 1 is a member of the selected scale.
