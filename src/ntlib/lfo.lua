local num = require "ntlib.num"
local volts = require "ntlib.volts"
local rand = require "ntlib.rand"
local M = {}
local Phasor = {}; Phasor.__index = Phasor

function M.phasor(opts) opts = opts or {}; return setmetatable({ freq = opts.freq or 1, phase = num.wrap(opts.phase or 0, 0, 1), initialPhase = num.wrap(opts.phase or 0, 0, 1) }, Phasor) end
function Phasor:process(dt) local before = self.phase; local raw = before + self.freq * math.max(0, dt); self.phase = num.wrap(raw, 0, 1); return self.phase, raw >= 1 or raw < 0 end
function Phasor:setFreq(hz) self.freq = hz; return self end
function Phasor:setPeriod(seconds) if seconds == 0 then self.freq = 0 else self.freq = 1 / seconds end return self end
function Phasor:setPitch(v) self.freq = volts.toHz(v); return self end
function Phasor:sync(phase) self.phase = num.wrap(phase or 0, 0, 1); return self end
function Phasor:reset() self.phase = self.initialPhase; return self end

function M.sine(ph) return math.sin(2 * math.pi * num.wrap(ph, 0, 1)) end
function M.tri(ph, skew) ph, skew = num.wrap(ph, 0, 1), num.clamp(skew == nil and 0.5 or skew, 0, 1); if skew <= 0 then return 1 - 2 * ph elseif skew >= 1 then return -1 + 2 * ph elseif ph < skew then return -1 + 2 * ph / skew end return 1 - 2 * (ph - skew) / (1 - skew) end
function M.saw(ph) return 1 - 2 * num.wrap(ph, 0, 1) end
function M.ramp(ph) return -1 + 2 * num.wrap(ph, 0, 1) end
function M.pulse(ph, width) if num.wrap(ph, 0, 1) < num.clamp(width or 0.5, 0, 1) then return 1 end return -1 end
function M.expo(ph, k) return 2 * num.curve(1 - num.wrap(ph, 0, 1), num.clamp(k or 0.5, -1, 1)) - 1 end
function M.logistic(ph, k) local x = num.wrap(ph, 0, 1); local amount = math.max(0.001, math.abs(k or 6)); local lo = 1 / (1 + math.exp(amount * 0.5)); local hi = 1 / (1 + math.exp(-amount * 0.5)); return 2 * ((1 / (1 + math.exp(-amount * (x - 0.5))) - lo) / (hi - lo)) - 1 end

local Lfo = {}; Lfo.__index = Lfo
local shapes = { sine = M.sine, tri = M.tri, saw = M.saw, ramp = M.ramp, pulse = M.pulse, expo = M.expo, logistic = M.logistic }
function M.new(opts)
  opts = opts or {}; local shape = opts.shape or "sine"
  if type(shape) ~= "function" and not shapes[shape] then error("unknown LFO shape", 2) end
  return setmetatable({ phasor = M.phasor(opts), shape = shape, amp = opts.amp or 5, offset = opts.offset or 0, bipolar = opts.bipolar ~= false, param = opts.param or 0.5 }, Lfo)
end
function Lfo:process(dt) local phase = self.phasor:process(dt); local fn = type(self.shape) == "function" and self.shape or shapes[self.shape]; local value = fn(phase, self.param); if not self.bipolar then value = (value + 1) * 0.5 end return self.offset + self.amp * value end
function Lfo:setShape(shape) if type(shape) ~= "function" and not shapes[shape] then error("unknown LFO shape", 2) end self.shape = shape; return self end
function Lfo:setAmp(value) self.amp = value; return self end
function Lfo:setParam(value) self.param = value; return self end
function Lfo:setFreq(value) self.phasor:setFreq(value); return self end
function Lfo:sync(phase) self.phasor:sync(phase); return self end
function Lfo:reset() self.phasor:reset(); return self end

local RandomShape = {}; RandomShape.__index = RandomShape
local function randomShape(kind, opts)
  opts = opts or {}; local rng = opts.rng or rand.new()
  return setmetatable({ kind = kind, phasor = M.phasor(opts), rng = rng, min = opts.min or -5, max = opts.max or 5, interp = opts.interp or "cubic", previous = rng:range(opts.min or -5, opts.max or 5), target = rng:range(opts.min or -5, opts.max or 5) }, RandomShape)
end
function M.sampleHold(opts) return randomShape("hold", opts) end
function M.smoothRandom(opts) return randomShape("smooth", opts) end
function RandomShape:process(dt)
  local phase, wrapped = self.phasor:process(dt)
  if wrapped then self.previous, self.target = self.target, self.rng:range(self.min, self.max) end
  if self.kind == "hold" then return self.target end
  local t = self.interp == "cubic" and (phase * phase * (3 - 2 * phase)) or phase
  return num.lerp(self.previous, self.target, t)
end
function RandomShape:sync(phase) self.phasor:sync(phase); self.previous, self.target = self.target, self.rng:range(self.min, self.max); return self end
function RandomShape:setFreq(value) self.phasor:setFreq(value); return self end

local Drift = {}; Drift.__index = Drift
function M.drift(opts) opts = opts or {}; return setmetatable({ rng = opts.rng or rand.new(), rate = math.max(0, opts.rate or 0.1), min = opts.min or -5, max = opts.max or 5, value = opts.value or 0, velocity = 0 }, Drift) end
function Drift:process(dt) self.velocity = self.velocity + self.rng:range(-1, 1) * self.rate * dt; self.velocity = self.velocity * math.exp(-self.rate * dt); self.value = num.fold(self.value + self.velocity * dt, self.min, self.max); return self.value end
function Drift:reset(value) self.value, self.velocity = value or 0, 0; return self end

return M
