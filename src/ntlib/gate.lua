local num = require "ntlib.num"
local M = {}
local Gate = {}; Gate.__index = Gate

function M.new(opts)
  opts = opts or {}
  local length = opts.length or 0.01
  if length < 0 then error("gate length must be non-negative", 2) end
  return setmetatable({ length = length, voltage = opts.voltage or 5, retriggerGap = math.max(0, opts.retriggerGap or 0.001), state = false, busy = false, held = false, remaining = 0, gapRemaining = 0, pendingLength = 0, ratchetRemaining = 0, ratchetSpacing = 0, ratchetLength = length, nextRatchet = 0 }, Gate)
end
function Gate:trigger(length)
  length = math.max(0, length or self.length)
  self.held, self.ratchetRemaining = false, 0
  if self.state and self.retriggerGap > 0 then self.state, self.gapRemaining, self.pendingLength = false, self.retriggerGap, length
  else self.state, self.remaining, self.pendingLength = true, length, 0 end
  self.busy = true; return self
end
function Gate:open() self.state, self.held, self.busy, self.remaining, self.gapRemaining = true, true, true, 0, 0; return self end
function Gate:close() self.state, self.held, self.busy, self.remaining, self.gapRemaining, self.ratchetRemaining = false, false, false, 0, 0, 0; return self end
function Gate:ratchet(count, spacing, length)
  count = math.max(0, math.floor(count)); spacing = math.max(0, spacing or 0); length = math.max(0, length or self.length)
  self.ratchetRemaining, self.ratchetSpacing, self.ratchetLength, self.nextRatchet = math.max(0, count - 1), spacing, length, spacing
  if count > 0 then self:trigger(length); self.ratchetRemaining = count - 1; self.nextRatchet = spacing end
  return self
end
function Gate:process(dt)
  dt = math.max(0, dt)
  if self.gapRemaining > 0 then
    self.gapRemaining = self.gapRemaining - dt
    if self.gapRemaining <= 0 then self.state, self.remaining, self.gapRemaining = true, self.pendingLength, 0 end
  elseif self.state and not self.held then
    self.remaining = self.remaining - dt
    if self.remaining <= 0 then self.state, self.remaining = false, 0 end
  end
  if self.ratchetRemaining > 0 then
    self.nextRatchet = self.nextRatchet - dt
    if self.nextRatchet <= 0 then
      local remaining, overshoot = self.ratchetRemaining, -self.nextRatchet
      self:trigger(self.ratchetLength)
      self.ratchetRemaining, self.nextRatchet = remaining - 1, math.max(0, self.ratchetSpacing - overshoot)
    end
  end
  self.busy = self.state or self.gapRemaining > 0 or self.ratchetRemaining > 0
  return self.state and self.voltage or 0, self.state
end
function Gate:reset() return self:close() end

local Bank = {}; Bank.__index = Bank
function M.bank(opts)
  opts = opts or {}; local channels = math.floor(opts.channels or 1)
  if channels < 1 then error("gate bank channels must be positive", 2) end
  local self = setmetatable({ channels = channels, gates = {} }, Bank)
  for i = 1, channels do self.gates[i] = M.new(opts) end
  return self
end
local function channel(self, index) local gate = self.gates[math.floor(index)]; if not gate then error("gate channel out of range", 3) end return gate end
function Bank:trigger(index, length) channel(self, index):trigger(length); return self end
function Bank:open(index) channel(self, index):open(); return self end
function Bank:close(index) channel(self, index):close(); return self end
function Bank:ratchet(index, count, spacing, length) channel(self, index):ratchet(count, spacing, length); return self end
function Bank:closeAll() for i = 1, self.channels do self.gates[i]:close() end return self end
function Bank:process(dt, out, offset) offset = offset or 0; for i = 1, self.channels do out[offset + i] = self.gates[i]:process(dt) end return out end
function Bank:isBusy(index) return channel(self, index).busy end
function Bank:reset() return self:closeAll() end

return M
