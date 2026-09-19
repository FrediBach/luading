local num = require "ntlib.num"
local rand = require "ntlib.rand"
local M = {}
local directions = { forward = true, reverse = true, pendulum = true, pingpong = true, random = true, brownian = true, shuffle = true }

local Playhead = {}; Playhead.__index = Playhead
function M.new(opts)
  opts = opts or {}; local direction = opts.direction or "forward"
  if not directions[direction] then error("invalid sequencer direction", 2) end
  local self = setmetatable({ length = math.max(1, math.floor(opts.length or 8)), first = math.max(1, math.floor(opts.first or 1)), direction = direction, rng = opts.rng, motion = 1 }, Playhead)
  if (direction == "random" or direction == "brownian" or direction == "shuffle") and not self.rng then error("random direction requires rng", 2) end
  self.index = self.first; self:_rebuildBag(); return self
end
function Playhead:_last() return self.first + self.length - 1 end
function Playhead:_rebuildBag() if self.direction == "shuffle" and self.rng then local items = {}; for i = self.first, self:_last() do items[#items + 1] = i end self.bag = rand.bag{ rng = self.rng, items = items } end end
function Playhead:advance()
  local old, wrapped = self.index, false; local last = self:_last()
  if self.direction == "forward" then self.index = self.index + 1; if self.index > last then self.index, wrapped = self.first, true end
  elseif self.direction == "reverse" then self.index = self.index - 1; if self.index < self.first then self.index, wrapped = last, true end
  elseif self.direction == "pendulum" or self.direction == "pingpong" then
    if self.direction == "pingpong" and ((self.index == last and self.motion > 0) or (self.index == self.first and self.motion < 0)) then self.motion = -self.motion
    else self.index = self.index + self.motion; if self.index >= last then self.index, self.motion = last, -1; wrapped = true elseif self.index <= self.first then self.index, self.motion = self.first, 1; wrapped = true end end
  elseif self.direction == "random" then self.index = self.rng:int(self.first, last); wrapped = self.index < old
  elseif self.direction == "brownian" then self.index = self.index + self.rng:sign(); if self.index > last then self.index, wrapped = self.first, true elseif self.index < self.first then self.index, wrapped = last, true end
  else self.index = self.bag:next(); wrapped = self.bag.remaining == 0 end
  return self.index, wrapped
end
function Playhead:retreat() local direction = self.direction; self.direction = direction == "forward" and "reverse" or direction == "reverse" and "forward" or direction; local i, wrapped = self:advance(); self.direction = direction; return i, wrapped end
function Playhead:jump(i) self.index = num.clamp(math.floor(i), self.first, self:_last()); return self end
function Playhead:reset() self.index, self.motion = self.first, 1; self:_rebuildBag(); return self end
function Playhead:setDirection(name) if not directions[name] then error("invalid sequencer direction", 2) end; if (name == "random" or name == "brownian" or name == "shuffle") and not self.rng then error("random direction requires rng", 2) end self.direction = name; self:_rebuildBag(); return self end
function Playhead:setLength(n) self.length = math.max(1, math.floor(n)); self.index = num.clamp(self.index, self.first, self:_last()); self:_rebuildBag(); return self end
function Playhead:setFirst(i) local relative = self.index - self.first; self.first = math.max(1, math.floor(i)); self.index = num.clamp(self.first + relative, self.first, self:_last()); self:_rebuildBag(); return self end

local Track = {}; Track.__index = Track
function M.track(opts) opts = opts or {}; local self = setmetatable({ length = math.max(1, math.floor(opts.length or 16)), values = {} }, Track); for i = 1, self.length do self.values[i] = opts.default or 0 end return self end
function Track:_index(i) return (math.floor(i) - 1) % self.length + 1 end
function Track:get(i) return self.values[self:_index(i)] end
function Track:set(i, value) self.values[self:_index(i)] = value; return self end
function Track:fill(value) for i = 1, self.length do self.values[i] = value end return self end
function Track:randomise(rng, lo, hi) for i = 1, self.length do self.values[i] = rng:range(lo, hi) end return self end
function Track:shift(n) n = math.floor(n) % self.length; for _ = 1, n do local last = self.values[self.length]; for i = self.length, 2, -1 do self.values[i] = self.values[i - 1] end self.values[1] = last end return self end
function Track:copyFrom(other) for i = 1, self.length do self.values[i] = other:get(i) end return self end
function Track:swap(i, j) i, j = self:_index(i), self:_index(j); self.values[i], self.values[j] = self.values[j], self.values[i]; return self end

local Recorder = {}; Recorder.__index = Recorder
function M.recorder(opts) opts = opts or {}; local size = math.max(2, math.floor(opts.size or 512)); return setmetatable({ size = size, values = {}, times = {}, index = 0, filled = 0, duration = 0 }, Recorder) end
function Recorder:push(value, dt) self.index = self.index % self.size + 1; self.values[self.index], self.times[self.index] = value, math.max(0, dt); self.filled = math.min(self.size, self.filled + 1); self.duration = 0; for i = 1, self.filled do self.duration = self.duration + (self.times[i] or 0) end return self end
function Recorder:atIndex(i) if i < 1 or i > self.filled then return nil end return self.values[(self.index - i) % self.size + 1] end
function Recorder:at(secondsAgo)
  if self.filled == 0 then return nil end
  local elapsed, previous = 0, self:atIndex(1)
  for i = 1, self.filled do local index = (self.index - i) % self.size + 1; local dt = self.times[index] or 0; local value = self.values[index]; if secondsAgo <= elapsed + dt then local t = dt == 0 and 0 or (secondsAgo - elapsed) / dt; return num.lerp(previous, value, num.clamp(t, 0, 1)) end; elapsed, previous = elapsed + dt, value end
  return self:atIndex(self.filled)
end
function Recorder:clear() self.index, self.filled, self.duration = 0, 0, 0; return self end
function Recorder:last() return self:atIndex(1) end
function Recorder:min() if self.filled == 0 then return nil end local value = math.huge; for i = 1, self.filled do value = math.min(value, self:atIndex(i)) end return value end
function Recorder:max() if self.filled == 0 then return nil end local value = -math.huge; for i = 1, self.filled do value = math.max(value, self:atIndex(i)) end return value end
function Recorder:mean() if self.filled == 0 then return nil end local total = 0; for i = 1, self.filled do total = total + self:atIndex(i) end return total / self.filled end

return M
