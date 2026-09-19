local num = require "ntlib.num"
local M = {}
local Clock = {}; Clock.__index = Clock

function M.new(opts)
  opts = opts or {}
  local ppqn = math.floor(opts.ppqn or 1)
  local bpm = opts.bpm or 120
  if ppqn < 1 then error("ppqn must be positive", 2) end
  if bpm <= 0 then error("bpm must be positive", 2) end
  return setmetatable({
    ppqn = ppqn, bpm = bpm, period = 60 / (bpm * ppqn), timeout = math.max(0, opts.timeout or 2),
    smoothing = num.clamp(opts.smoothing or 0.25, 0, 1), minBpm = opts.minBpm or 20,
    maxBpm = opts.maxBpm or 400, resync = opts.resync or "soft", running = false,
    external = false, forcedInternal = false, confidence = 0, beat = 0, phase = 0,
    sincePulse = math.huge, intervals = {}, intervalIndex = 0, intervalCount = 0,
  }, Clock)
end

function Clock:pulse()
  if self.forcedInternal then return self end
  local interval = self.sincePulse
  if interval < math.huge and interval > 0 then
    local rawBpm = 60 / (interval * self.ppqn)
    if rawBpm >= self.minBpm and rawBpm <= self.maxBpm then
      local old = self.period
      self.period = interval * (1 - self.smoothing) + old * self.smoothing
      self.bpm = 60 / (self.period * self.ppqn)
      local errorRatio = math.abs(interval - old) / math.max(old, 1e-9)
      self.confidence = num.clamp(self.confidence * 0.75 + (1 - num.clamp(errorRatio, 0, 1)) * 0.25, 0, 1)
      self.intervalIndex = self.intervalIndex % 8 + 1
      self.intervals[self.intervalIndex] = interval
      self.intervalCount = math.min(8, self.intervalCount + 1)
    end
  end
  self.sincePulse, self.running, self.external = 0, true, true
  self.beat = self.beat + 1
  if self.resync == "hard" then self.phase, self.phaseCorrection = 0, 0
  else self.phaseCorrection = -self.phase end
  return self
end

function Clock:process(dt)
  dt = math.max(0, dt)
  self.sincePulse = self.sincePulse + dt
  if self.external and self.sincePulse > self.timeout then self.external, self.confidence = false, 0 end
  if not self.running then return self.phase, self.beat, self.bpm end
  self.phase = self.phase + dt / self.period
  if self.phaseCorrection and self.phaseCorrection ~= 0 then
    local amount = math.min(1, dt / 0.005)
    local correction = self.phaseCorrection * amount
    self.phase, self.phaseCorrection = self.phase + correction, self.phaseCorrection - correction
  end
  while self.phase >= 1 do
    self.phase = self.phase - 1
    if not self.external then self.beat = self.beat + 1 end
  end
  while self.phase < 0 do self.phase = self.phase + 1 end
  return self.phase, self.beat, self.bpm
end
function Clock:setBpm(value)
  if not self.external then self.bpm = num.clamp(value, self.minBpm, self.maxBpm); self.period = 60 / (self.bpm * self.ppqn) end
  return self
end
function Clock:setInternal(value) self.forcedInternal = value == true; if self.forcedInternal then self.external, self.running = false, true end return self end
function Clock:setPpqn(value) value = math.max(1, math.floor(value)); self.ppqn = value; self.period = 60 / (self.bpm * value); return self end
function Clock:isLost() return not self.external and self.sincePulse > self.timeout end
function Clock:isRunning() return self.running end
function Clock:reset() self.phase, self.beat, self.phaseCorrection = 0, 0, 0; return self end
function Clock:tapBpm()
  if self.intervalCount == 0 then return self.bpm end
  local total = 0; for i = 1, self.intervalCount do total = total + self.intervals[i] end
  return 60 / ((total / self.intervalCount) * self.ppqn)
end

local Divider = {}; Divider.__index = Divider
function Clock:divider(opts)
  opts = opts or {}
  return setmetatable({ parent = self, div = math.max(1, math.floor(opts.div or 1)), mult = math.max(1, math.floor(opts.mult or 1)), swing = num.clamp(opts.swing or 0, 0, 0.99), offset = opts.phase or 0, index = -1, phase = 0 }, Divider)
end
function Divider:process(_dt)
  local position = (self.parent.beat + self.parent.phase) * self.mult / self.div + self.offset
  local rawIndex = math.floor(position)
  local phase = position - rawIndex
  if rawIndex % 2 ~= 0 and self.swing > 0 then phase = math.max(0, (phase - self.swing) / (1 - self.swing)) end
  local ticked = rawIndex ~= self.index
  if ticked then self.index = rawIndex end
  self.phase = num.clamp(phase, 0, 1)
  return ticked, self.index, self.phase
end
function Divider:reset() self.index, self.phase = -1, 0; return self end
function Divider:set(opts) opts = opts or {}; if opts.div then self.div = math.max(1, math.floor(opts.div)) end; if opts.mult then self.mult = math.max(1, math.floor(opts.mult)) end; if opts.swing then self.swing = num.clamp(opts.swing, 0, 0.99) end; if opts.phase then self.offset = opts.phase end; return self end

return M
