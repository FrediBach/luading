local num = require "ntlib.num"
local M = {}
local Env = {}; Env.__index = Env

local defaults = { delay = 0, attack = 0.01, hold = 0, decay = 0.2, sustain = 0.7, release = 0.3 }
local function create(kind, opts)
  opts = opts or {}
  local self = { kind = kind, curve = num.clamp(opts.curve or 0, -1, 1), retrigger = opts.retrigger or "restart", loop = opts.loop == true, level = 0, stage = "idle", progress = 0, gateHigh = false, cycles = 0, startLevel = 0, releaseStart = 0, times = {} }
  for key, value in pairs(defaults) do self.times[key] = math.max(0, opts[key] == nil and value or opts[key]) end
  self.sustain = num.clamp(opts.sustain == nil and defaults.sustain or opts.sustain, 0, 1)
  if kind == "ad" then self.sustain, self.times.release = 0, self.times.decay
  elseif kind == "ar" or kind == "asr" then self.times.decay, self.sustain = 0, 1 end
  if self.retrigger ~= "restart" and self.retrigger ~= "continue" and self.retrigger ~= "ignore" then error("invalid envelope retrigger mode", 3) end
  return setmetatable(self, Env)
end
function M.ad(opts) return create("ad", opts) end
function M.ar(opts) return create("ar", opts) end
function M.asr(opts) return create("asr", opts) end
function M.adsr(opts) return create("adsr", opts) end
function M.dahdsr(opts) return create("dahdsr", opts) end

function Env:_enter(stage)
  self.stage, self.progress = stage, 0
  if stage == "attack" then self.startLevel = self.level
  elseif stage == "release" then self.releaseStart = self.level end
end
function Env:trigger()
  if self.stage ~= "idle" and self.retrigger == "ignore" then return self end
  if self.retrigger == "restart" then self.level = 0 end
  if self.times.delay > 0 and self.kind == "dahdsr" then self:_enter("delay") else self:_enter("attack") end
  return self
end
function Env:gate(value)
  value = value == true
  if value and not self.gateHigh then self:trigger() elseif not value and self.gateHigh and self.kind ~= "ad" then self:release() end
  self.gateHigh = value; return self
end
function Env:release() if self.stage ~= "idle" then self:_enter("release") end return self end
local function shaped(progress, curve)
  if curve == 0 then return progress end
  return num.curve(progress, curve)
end
function Env:_complete()
  if self.stage == "delay" then self:_enter("attack")
  elseif self.stage == "attack" then
    self.level = 1
    if self.times.hold > 0 and self.kind == "dahdsr" then self:_enter("hold")
    elseif self.kind == "ar" or self.kind == "asr" then self:_enter(self.gateHigh and "sustain" or "release")
    else self:_enter("decay") end
  elseif self.stage == "hold" then self:_enter("decay")
  elseif self.stage == "decay" then
    self.level = self.sustain
    if self.kind == "ad" then
      self.cycles = self.cycles + 1
      if self.loop then self.level = 0; self:_enter("attack") else self:_enter("idle") end
    elseif self.gateHigh then self:_enter("sustain") else self:_enter("release") end
  elseif self.stage == "release" then
    self.level = 0; self.cycles = self.cycles + 1
    if self.loop and self.kind == "ad" then self:_enter("attack") else self:_enter("idle") end
  end
end
function Env:process(dt)
  dt = math.max(0, dt)
  local remaining = dt
  while remaining > 0 and self.stage ~= "idle" and self.stage ~= "sustain" do
    local duration = self.times[self.stage] or 0
    if duration <= 0 then self:_complete()
    else
      local advance = math.min(remaining / duration, 1 - self.progress)
      self.progress, remaining = self.progress + advance, remaining - advance * duration
      local x = shaped(self.progress, self.curve)
      if self.stage == "attack" then self.level = self.startLevel + (1 - self.startLevel) * x
      elseif self.stage == "decay" then self.level = 1 + (self.sustain - 1) * x
      elseif self.stage == "release" then self.level = self.releaseStart * (1 - x) end
      if self.progress >= 1 then self:_complete() end
    end
  end
  return self.level, self.stage
end
function Env:reset() self.level, self.stage, self.progress, self.gateHigh, self.cycles = 0, "idle", 0, false, 0; return self end
function Env:isActive() return self.stage ~= "idle" end
function Env:setCurve(value) self.curve = num.clamp(value, -1, 1); return self end
function Env:setTimes(values) for _, key in ipairs{ "delay", "attack", "hold", "decay", "release" } do if values[key] ~= nil then self.times[key] = math.max(0, values[key]) end end return self end
function Env:setSustain(value) self.sustain = num.clamp(value, 0, 1); return self end

return M
