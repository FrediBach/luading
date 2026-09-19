import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadLuaProgramRuntime, registerLuaModules } from '../disting/emulation/lua-runtime'
import { runtimeModules } from '../disting/ntlib-modules'
import { createDistingLuaTestEngine } from '../disting/testing/lua-test-environment'

const directory = join(process.cwd(), 'src/ntlib')
const sources = Object.fromEntries(readdirSync(directory)
  .filter((name) => name.endsWith('.lua'))
  .map((name) => [
    name === 'init.lua' ? 'ntlib' : `ntlib.${basename(name, '.lua')}`,
    readFileSync(join(directory, name), 'utf8'),
  ]))

const engines: Awaited<ReturnType<typeof createDistingLuaTestEngine>>[] = []
afterEach(() => {
  for (const engine of engines.splice(0)) engine.global.close()
})

async function run(source: string) {
  const lua = await createDistingLuaTestEngine()
  engines.push(lua)
  await registerLuaModules(lua, sources)
  return lua.doString(source)
}

describe('ntlib core modules', () => {
  it('loads lazily and checks semantic versions', async () => {
    expect(await run(`
      local nt = require 'ntlib'
      return { nt.VERSION, nt.require('1.0') == nt, nt.num.round(-1.5) }
    `)).toEqual(["1.0.0", true, -2])
  })

  it('provides numeric and voltage conversions', async () => {
    expect(await run(`
      local n, v = require 'ntlib.num', require 'ntlib.volts'
      return { n.wrap(-1, 0, 12), n.fold(13, 0, 10),
        v.toMidi(1), v.fromMidi(60), v.noteNameMidi(61), v.parseNote('C3')
      }
    `)).toEqual([11, 7, 60, 1, 'C#4', 0])
  })

  it('quantises masks and cents scales with stable state', async () => {
    expect(await run(`
      local q = require 'ntlib.quant'
      local major = q.new{ scale = q.SCALES.major, hysteresis = 0.02 }
      local a, da, ca = major:process(0.01)
      local b, db, cb = major:process(0.045)
      local micro = q.fromCents({0, 200, 700})
      local nearest = micro:nearest(0.17)
      return { q.count(q.SCALES.major), a, da, ca, b, db, cb, nearest }
    `)).toEqual([7, 0, 1, true, 0, 1, false, 1 / 6])
  })

  it('has deterministic independent random generators', async () => {
    expect(await run(`
      local r = require 'ntlib.rand'
      local a, b = r.new(42), r.new(42)
      local same = true
      for i = 1, 20 do if a:next() ~= b:next() then same = false end end
      local bag = r.bag{ rng = a, items = {1, 2, 3} }
      local seen = {}
      for i = 1, 3 do seen[bag:next()] = true end
      return { same, seen[1] and seen[2] and seen[3], bag.remaining }
    `)).toEqual([true, true, 0])
  })

  it('conditions scalar signals without host dependencies', async () => {
    expect(await run(`
      local s = require 'ntlib.signal'
      local gate = s.schmitt{}
      local _, r1 = gate:process(1.1)
      local state, _, f1 = gate:process(0.4)
      local slew = s.slew{ rise = 2, fall = 1 }
      return { r1, state, f1, slew:process(10, 0.5), s.rateFor(2, 10) }
    `)).toEqual([true, false, true, 1, 5])
  })
})

describe('ntlib timing modules', () => {
  it('tracks clock pulses and derives divisions', async () => {
    expect(await run(`
      local clock = require 'ntlib.clock'
      local c = clock.new{ bpm = 120, smoothing = 0, resync = 'hard' }
      c:pulse()
      for i = 1, 500 do c:process(0.001) end
      c:pulse()
      local d = c:divider{ div = 2 }
      local tick, index, phase = d:process(0.001)
      return { math.floor(c.bpm + 0.5), c.external, c.beat, tick, index, phase }
    `)).toEqual([120, true, 2, true, 1, 0])
  })

  it('schedules gate tails, retrigger gaps, and bank outputs', async () => {
    expect(await run(`
      local gate = require 'ntlib.gate'
      local g = gate.new{ length = 0.01, voltage = 7, retriggerGap = 0.001 }
      g:trigger(); local a = g:process(0.005)
      g:trigger(); local b = g:process(0.0005); local c = g:process(0.0005)
      local bank, out = gate.bank{ channels = 2 }, {}
      bank:open(2); bank:process(0.001, out)
      return { a, b, c, out[1], out[2] }
    `)).toEqual([7, 0, 7, 0, 5])
  })

  it('runs envelopes and deterministic LFO shapes', async () => {
    const values = await run(`
      local env, lfo = require 'ntlib.env', require 'ntlib.lfo'
      local e = env.adsr{ attack = 0.1, decay = 0.1, sustain = 0.5, release = 0.1, curve = 0 }
      e:gate(true); local a = e:process(0.05); local b = e:process(0.1)
      e:gate(false); local c = e:process(0.1)
      local p = lfo.phasor{ freq = 2 }; local ph, wrapped = p:process(0.25)
      return { a, b, c, e.stage, ph, wrapped, lfo.tri(0.5, 0.5) }
    `) as number[]
    expect(values.slice(0, 3)).toEqual([0.5, 0.75, 0])
    expect(values.slice(3)).toEqual(['idle', 0.5, false, 1])
  })
})

describe('ntlib pattern modules', () => {
  it('generates, edits, and serialises rhythms', async () => {
    expect(await run(`
      local rhythm = require 'ntlib.rhythm'
      local p = rhythm.pattern{ steps = 8, hits = 3 }
      local before = p:count()
      p:rotate(1); p:toggle(1)
      local text = rhythm.toString(p)
      local roundtrip = rhythm.fromString(text)
      return { before, #text, p:count(), roundtrip[1] }
    `)).toEqual([3, 8, 4, true])
  })

  it('advances playheads, tracks, and timestamped recorders', async () => {
    expect(await run(`
      local seq = require 'ntlib.seq'
      local s = seq.new{ length = 3, direction = 'pendulum' }
      local a = s:advance(); local b = s:advance(); local c = s:advance()
      local t = seq.track{ length = 3, default = 0 }; t:set(1, 1):set(2, 2):shift(1)
      local r = seq.recorder{ size = 4 }; r:push(1, 0.1):push(3, 0.1)
      return { a, b, c, t:get(1), t:get(2), r:last(), r:mean() }
    `)).toEqual([2, 3, 2, 0, 1, 3, 2])
  })

  it('constructs and voice-leads scale-aware chords', async () => {
    expect(await run(`
      local theory, quant = require 'ntlib.theory', require 'ntlib.quant'
      local chord = {}; local n = theory.chord(0, 'min7', chord)
      theory.invert(chord, n, 1)
      local triad = {}; theory.triadOn(quant.SCALES.major, 2, triad)
      return { n, chord[1], chord[4], triad[1], triad[2], triad[3], theory.romanNumeral(quant.SCALES.major, 6) }
    `)).toEqual([4, 3, 12, 2, 5, 9, 'vi'])
  })
})

describe('ntlib host utility modules', () => {
  it('builds host declarations and reads named scaled values', async () => {
    expect(await run(`
      local param = require 'ntlib.param'
      local p = param.builder()
      p:int('Steps', 1, 16, 8):volts('Offset', -10, 10, 0):ms('Gate', 1, 500, 20):enum('Mode', {'Up', 'Down'}, 1):bool('Latch', false)
      local definitions = p:build()
      local self = { parameters = { 12, 1.25, 50, 2, 2 } }
      local values = p:read(self)
      local stepsChanged = p:changed(self, 'steps')
      p:read(self)
      return { #definitions, definitions[2][6], values.steps, values.offset, values.gate, values.modeName, values.latch, stepsChanged, p:changed(self, 'steps'), p:anyChanged(self) }
    `)).toEqual([5, 100, 12, 1.25, 0.05, 'Down', true, true, false, true])
  })

  it('round-trips typed versioned state and bit fields', async () => {
    expect(await run(`
      local state = require 'ntlib.state'
      local s = state.schema{ version = 2, fields = { {'flags', 'bits', 8}, {'note', 'i8'}, {'name', 'str', 6}, {'on', 'bool'} } }
      local packed = s:save{ flags = 5, note = -12, name = 'abcdefghi', on = true }
      local value = assert(s:load(packed)); local bits = {}; state.unpackBits(value.flags, 3, bits)
      return { #packed, s:size(), value.note, value.name, value.on, bits[1], bits[2], bits[3] }
    `)).toEqual([11, 11, -12, 'abcdef', true, true, false, true])
  })

  it('parses and builds MIDI while allocating and releasing voices', async () => {
    expect(await run(`
      local midi = require 'ntlib.midi'
      local kind, ch, note, vel = midi.parse(0x92, 64, 100)
      local a, b, c = midi.bend(1, 8192)
      local va = midi.voices{ count = 2, steal = 'oldest' }
      local v1 = va:on(60, 100); local v2 = va:on(64, 90); local v3, stolen = va:on(67, 80)
      local released = va:off(64)
      return { kind, ch, note, vel, a, b, c, v1, v2, v3, stolen, released }
    `)).toEqual([2, 3, 64, 100, 0xe0, 0, 64, 1, 2, 1, 60, 2])
  })

  it('loads the complete modular surface and draws through host primitives', async () => {
    expect(await run(`
      local names = {'num','volts','quant','signal','clock','gate','env','lfo','rand','rhythm','seq','theory','param','state','midi','draw','test'}
      for i = 1, #names do assert(require('ntlib.' .. names[i])) end
      local calls = 0
      drawBox = function(...) calls = calls + 1 end
      drawRectangle = function(...) calls = calls + 1 end
      drawLine = function(...) calls = calls + 1 end
      drawCircle = function(...) calls = calls + 1 end
      drawText = function(...) calls = calls + 1 end
      drawTinyText = function(...) calls = calls + 1 end
      local draw = require 'ntlib.draw'
      draw.bar(0, 10, 20, 6, 0.5)
      draw.steps(0, 20, 40, 4, {true, false, true, false}, 2)
      draw.label(0, 40, 'OK')
      return { #names, calls, draw.textWidth('III', 'normal') }
    `)).toEqual([17, 7, 8])
  })

  it('runs deterministic scripts in the headless Lua harness', async () => {
    expect(await run(`
      local test = require 'ntlib.test'
      local script = { init = function() return { outputs = 1 } end, step = function(self, dt, inputs) return { (inputs[1] or 0) + dt } end }
      local h = test.harness{ script = script, stepRate = 1000 }
      h:setInput(1, 2):run(0.003)
      local rec = h:record(1); h:run(0.002)
      return { h.time, h:output(1), rec:min(), rec:max(), rec:mean() }
    `)).toEqual([0.005, 2.001, 2.001, 2.001, 2.001])
  })
})

describe('ntlib example', () => {
  it('runs the complete quantised sequencer across the production Lua boundary', async () => {
    const lua = await createDistingLuaTestEngine()
    engines.push(lua)
    await registerLuaModules(lua, runtimeModules({}))
    const source = readFileSync(join(process.cwd(), 'examples/ntlib/quant-seq.lua'), 'utf8')
    const runtime = await loadLuaProgramRuntime(lua, source)
    expect(runtime.init?.()).toMatchObject({ inputs: [2], outputs: [0, 1] })
    runtime.setParameters([8, 2, 0, 20])
    runtime.trigger?.(1)
    const output = runtime.step?.(0.001, [0]) as number[]
    expect(output).toHaveLength(2)
    expect(Number.isFinite(output[0])).toBe(true)
    expect(output[1]).toBe(5)
    expect(runtime.draw?.()).toBe(true)
    runtime.close?.()
  })
})
