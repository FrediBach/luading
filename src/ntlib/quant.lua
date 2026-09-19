local num = require "ntlib.num"
local M = {}

local function mask(intervals)
  local value = 0
  for i = 1, #intervals do value = value | (1 << (intervals[i] % 12)) end
  return value
end

M.SCALES = {
  chromatic = mask{ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 },
  major = mask{ 0, 2, 4, 5, 7, 9, 11 }, naturalMinor = mask{ 0, 2, 3, 5, 7, 8, 10 },
  harmonicMinor = mask{ 0, 2, 3, 5, 7, 8, 11 }, melodicMinor = mask{ 0, 2, 3, 5, 7, 9, 11 },
  dorian = mask{ 0, 2, 3, 5, 7, 9, 10 }, phrygian = mask{ 0, 1, 3, 5, 7, 8, 10 },
  lydian = mask{ 0, 2, 4, 6, 7, 9, 11 }, mixolydian = mask{ 0, 2, 4, 5, 7, 9, 10 },
  aeolian = mask{ 0, 2, 3, 5, 7, 8, 10 }, locrian = mask{ 0, 1, 3, 5, 6, 8, 10 },
  majorPent = mask{ 0, 2, 4, 7, 9 }, minorPent = mask{ 0, 3, 5, 7, 10 },
  blues = mask{ 0, 3, 5, 6, 7, 10 }, wholeTone = mask{ 0, 2, 4, 6, 8, 10 },
  octatonicHW = mask{ 0, 1, 3, 4, 6, 7, 9, 10 }, octatonicWH = mask{ 0, 2, 3, 5, 6, 8, 9, 11 },
  majorTriad = mask{ 0, 4, 7 }, minorTriad = mask{ 0, 3, 7 }, dom7 = mask{ 0, 4, 7, 10 },
  min7 = mask{ 0, 3, 7, 10 }, maj7 = mask{ 0, 4, 7, 11 },
}
M.SCALE_NAMES = { "Chromatic", "Major", "Natural Minor", "Harmonic Minor", "Melodic Minor", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Aeolian", "Locrian", "Major Pentatonic", "Minor Pentatonic", "Blues", "Whole Tone", "Octatonic H-W", "Octatonic W-H", "Major Triad", "Minor Triad", "Dominant 7", "Minor 7", "Major 7" }
local scaleKeys = { "chromatic", "major", "naturalMinor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "aeolian", "locrian", "majorPent", "minorPent", "blues", "wholeTone", "octatonicHW", "octatonicWH", "majorTriad", "minorTriad", "dom7", "min7", "maj7" }
M.SCALE_LIST = {}
for i = 1, #scaleKeys do M.SCALE_LIST[i] = M.SCALES[scaleKeys[i]] end

function M.copyOf(t) local out = {}; for k, v in pairs(t) do out[k] = v end return out end
function M.maskFromIntervals(intervals) return mask(intervals) end
function M.maskToIntervals(value, out)
  out = out or {}; local n = 0
  for i = 0, 11 do if value & (1 << i) ~= 0 then n = n + 1; out[n] = i end end
  for i = n + 1, #out do out[i] = nil end
  return out
end
function M.contains(value, pitchClass) return value & (1 << (math.floor(pitchClass) % 12)) ~= 0 end
function M.count(value) local n = 0; for i = 0, 11 do if value & (1 << i) ~= 0 then n = n + 1 end end return n end
function M.rotate(value, n)
  n = math.floor(n) % 12
  return ((value << n) | (value >> (12 - n))) & 0xfff
end

local Quant = {}; Quant.__index = Quant
local function validateMask(value)
  value = math.tointeger(value)
  if not value or value < 1 or value > 0xfff then error("scale must be a non-empty 12-bit mask", 3) end
  return value
end
local function rebuild(self)
  if self.cents then self.degrees = #self.cents; return end
  self.intervals = self.intervals or {}
  M.maskToIntervals(self.scale, self.intervals)
  self.degrees = #self.intervals
end
function M.new(opts)
  opts = opts or {}
  local self = setmetatable({
    scale = validateMask(opts.scale or M.SCALES.chromatic), root = math.floor(opts.root or 0) % 12,
    hysteresis = math.max(0, opts.hysteresis or 0.015), transpose = opts.transpose or 0,
    octaveSize = opts.octaveSize or 12, period = (opts.octaveSize or 12) * 100,
  }, Quant)
  if self.octaveSize <= 0 then error("octaveSize must be positive", 2) end
  rebuild(self); return self
end
function M.fromCents(cents, opts)
  opts = opts or {}
  if type(cents) ~= "table" or #cents == 0 then error("cents must be a non-empty table", 2) end
  local copy, last = {}, -math.huge
  for i = 1, #cents do
    local value = cents[i]
    if type(value) ~= "number" or value < 0 or value <= last then error("cents must be ascending non-negative numbers", 2) end
    copy[i], last = value, value
  end
  local period = opts.period or 1200
  if period <= last then error("period must exceed the last degree", 2) end
  local self = setmetatable({ cents = copy, period = period, octaveSize = period / 100, root = opts.root or 0, hysteresis = math.max(0, opts.hysteresis or 0.015), transpose = opts.transpose or 0 }, Quant)
  rebuild(self); return self
end
function Quant:_degreeCents(index) if self.cents then return self.cents[index] end return self.intervals[index] * 100 end
function Quant:degreeToVolts(degree, octave)
  degree, octave = math.floor(degree), math.floor(octave or 0)
  local periodOffset = math.floor((degree - 1) / self.degrees)
  local index = (degree - 1) % self.degrees + 1
  return (self.root * 100 + (octave + periodOffset) * self.period + self:_degreeCents(index) + self.transpose * 100) / 1200
end
function Quant:_nearestRaw(v)
  local cents = v * 1200 - self.root * 100
  local periodIndex = math.floor(cents / self.period)
  local within = cents - periodIndex * self.period
  local bestIndex, bestCents, bestDistance = 1, self:_degreeCents(1), math.huge
  for offset = -1, 1 do
    for i = 1, self.degrees do
      local candidate = self:_degreeCents(i) + offset * self.period
      local distance = math.abs(within - candidate)
      if distance < bestDistance or (distance == bestDistance and candidate < bestCents) then bestIndex, bestCents, bestDistance = i, candidate, distance end
    end
  end
  local absolute = self.root * 100 + periodIndex * self.period + bestCents
  local output = (absolute + self.transpose * 100) / 1200
  local absolutePeriod = periodIndex + math.floor(bestCents / self.period)
  return output, bestIndex, absolutePeriod
end
function Quant:nearest(v) return self:_nearestRaw(v) end
function Quant:process(v)
  local output, degree, octave = self:_nearestRaw(v)
  if self.held ~= nil and output ~= self.held then
    local boundary = (self.held + output) * 0.5 - self.transpose / 12
    if math.abs(v - boundary) <= self.hysteresis then return self.held, self.heldDegree, false end
  end
  local changed = self.held == nil or output ~= self.held
  self.held, self.heldDegree, self.heldOctave = output, degree, octave
  return output, degree, changed
end
function Quant:reset() self.held, self.heldDegree, self.heldOctave = nil, nil, nil end
function Quant:setScale(value) self.scale = validateMask(value); self.cents = nil; self.period = self.octaveSize * 100; rebuild(self); self:reset(); return self end
function Quant:setRoot(value) self.root = math.floor(value) % 12; self:reset(); return self end
function Quant:setHysteresis(value) self.hysteresis = math.max(0, value); return self end
function Quant:setTranspose(value) self.transpose = value; self:reset(); return self end
function Quant:voltsToDegree(v)
  local _, degree, octave = self:_nearestRaw(v)
  return degree, octave
end
function Quant:steps(v, n)
  local _, degree, octave = self:_nearestRaw(v)
  return self:degreeToVolts(degree + math.floor(n), octave)
end

return M
