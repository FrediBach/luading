local num = require "ntlib.num"
local M = {}

local Schmitt = {}; Schmitt.__index = Schmitt
function M.schmitt(opts)
  opts = opts or {}; local hi, lo = opts.hi or 1.0, opts.lo or 0.5
  if lo > hi then error("schmitt lo must not exceed hi", 2) end
  return setmetatable({ hi = hi, lo = lo, state = opts.state == true }, Schmitt)
end
function Schmitt:process(v)
  local before = self.state
  if before then if v <= self.lo then self.state = false end elseif v >= self.hi then self.state = true end
  return self.state, not before and self.state, before and not self.state
end
function Schmitt:reset(state) self.state = state == true; return self end

local Edge = {}; Edge.__index = Edge
function M.edge(initial) return setmetatable({ state = initial == true }, Edge) end
function Edge:process(value) local before = self.state; self.state = value == true; return not before and self.state, before and not self.state end
function Edge:reset(value) self.state = value == true; return self end

local Slew = {}; Slew.__index = Slew
function M.slew(opts)
  opts = opts or {}; local shape = opts.shape or "linear"
  if shape ~= "linear" and shape ~= "exp" then error("slew shape must be linear or exp", 2) end
  return setmetatable({ rise = math.max(0, opts.rise or 10), fall = math.max(0, opts.fall or 10), shape = shape, value = opts.value or 0, arrived = true }, Slew)
end
function M.rateFor(seconds, range) if seconds <= 0 then return math.huge end return math.abs(range or 1) / seconds end
function Slew:process(target, dt)
  dt = math.max(0, dt); local delta = target - self.value; local rate = delta >= 0 and self.rise or self.fall
  if self.shape == "exp" then
    if rate <= 0 or dt == 0 then self.arrived = math.abs(delta) <= 1e-6; return self.value end
    self.value = target + (self.value - target) * math.exp(-dt / rate)
    if math.abs(target - self.value) <= 1e-6 then self.value, self.arrived = target, true else self.arrived = false end
  else
    local amount = rate * dt
    if math.abs(delta) <= amount then self.value, self.arrived = target, true else self.value, self.arrived = self.value + num.sign(delta) * amount, false end
  end
  return self.value
end
function Slew:reset(value) self.value, self.arrived = value or 0, true; return self end
function Slew:setRates(rise, fall) self.rise, self.fall = math.max(0, rise), math.max(0, fall); return self end

local OnePole = {}; OnePole.__index = OnePole
function M.onepole(opts) opts = opts or {}; return setmetatable({ cutoff = math.max(0, opts.cutoff or 20), value = opts.value or 0 }, OnePole) end
function OnePole:process(x, dt) local a = 1 - math.exp(-2 * math.pi * self.cutoff * math.max(0, dt)); self.value = self.value + a * (x - self.value); return self.value end
function OnePole:setCutoff(hz) self.cutoff = math.max(0, hz); return self end
function OnePole:reset(x) self.value = x or 0; return self end

local Dc = {}; Dc.__index = Dc
function M.dcblock(opts) opts = opts or {}; return setmetatable({ cutoff = math.max(0, opts.cutoff or 2), x1 = 0, y1 = 0 }, Dc) end
function Dc:process(x, dt) local r = math.exp(-2 * math.pi * self.cutoff * math.max(0, dt)); local y = x - self.x1 + r * self.y1; self.x1, self.y1 = x, y; return y end
function Dc:reset() self.x1, self.y1 = 0, 0; return self end

local Follower = {}; Follower.__index = Follower
function M.follower(opts) opts = opts or {}; return setmetatable({ attack = math.max(0, opts.attack or 0.005), release = math.max(0, opts.release or 0.2), value = 0 }, Follower) end
function Follower:process(x, dt) local target = math.abs(x); local tau = target > self.value and self.attack or self.release; local a = tau <= 0 and 1 or 1 - math.exp(-math.max(0, dt) / tau); self.value = self.value + a * (target - self.value); return self.value end
function Follower:reset(x) self.value = math.abs(x or 0); return self end

local Debounce = {}; Debounce.__index = Debounce
function M.debounce(opts) opts = opts or {}; return setmetatable({ time = math.max(0, opts.time or 0.005), state = opts.state == true, candidate = opts.state == true, elapsed = 0 }, Debounce) end
function Debounce:process(value, dt)
  value = value == true
  if value ~= self.candidate then self.candidate, self.elapsed = value, 0 else self.elapsed = self.elapsed + math.max(0, dt) end
  local changed = false
  if self.candidate ~= self.state and self.elapsed >= self.time then self.state, changed = self.candidate, true end
  return self.state, changed
end

local Changed = {}; Changed.__index = Changed
function M.changed(opts) opts = opts or {}; return setmetatable({ eps = math.max(0, opts.eps or 1e-4), value = nil }, Changed) end
function Changed:process(v) if self.value == nil or math.abs(v - self.value) > self.eps then self.value = v; return true end return false end
function Changed:reset(v) self.value = v; return self end

local SampleHold = {}; SampleHold.__index = SampleHold
function M.sampleHold(value) return setmetatable({ value = value or 0, trigger = false }, SampleHold) end
function SampleHold:process(v, trigger) if trigger and not self.trigger then self.value = v end self.trigger = trigger == true; return self.value end
function SampleHold:reset(value) self.value, self.trigger = value or 0, false; return self end

local Window = {}; Window.__index = Window
function M.window(opts)
  local size = type(opts) == "table" and opts.size or opts or 64
  size = math.floor(size); if size < 1 then error("window size must be positive", 2) end
  return setmetatable({ size = size, values = {}, index = 0, filled = 0 }, Window)
end
function Window:push(v) self.index = self.index % self.size + 1; self.values[self.index] = v; self.filled = math.min(self.size, self.filled + 1); return self end
function Window:last() if self.filled == 0 then return nil end return self.values[self.index] end
function Window:atIndex(i) if i < 1 or i > self.filled then return nil end return self.values[(self.index - i) % self.size + 1] end
function Window:min() if self.filled == 0 then return nil end local v = math.huge; for i = 1, self.filled do v = math.min(v, self.values[i]) end return v end
function Window:max() if self.filled == 0 then return nil end local v = -math.huge; for i = 1, self.filled do v = math.max(v, self.values[i]) end return v end
function Window:mean() if self.filled == 0 then return nil end local total = 0; for i = 1, self.filled do total = total + self.values[i] end return total / self.filled end
function Window:clear() self.index, self.filled = 0, 0; return self end

return M
