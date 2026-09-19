local num = require "ntlib.num"
local rand = require "ntlib.rand"
local M = {}

function M.euclid(hits, steps, rotation, out)
  steps = math.max(1, math.floor(steps)); hits = num.clamp(math.floor(hits), 0, steps); rotation = math.floor(rotation or 0)
  out = out or {}
  for i = 1, steps do out[i] = (((i - 1 - rotation) * hits) % steps) < hits end
  for i = steps + 1, #out do out[i] = nil end
  return out
end
M.euclidInto = M.euclid
function M.euclidBits(hits, steps, rotation)
  steps = math.max(1, math.min(32, math.floor(steps))); hits = num.clamp(math.floor(hits), 0, steps); rotation = math.floor(rotation or 0)
  local bits = 0; for i = 1, steps do if (((i - 1 - rotation) * hits) % steps) < hits then bits = bits | (1 << (i - 1)) end end return bits
end
function M.fromString(text, out) out = out or {}; for i = 1, #text do local c = text:sub(i, i); out[i] = c == "x" or c == "X" end; for i = #text + 1, #out do out[i] = nil end; return out end
function M.toString(pattern) local out = {}; local source = pattern.values or pattern; local steps = pattern.steps or #source; for i = 1, steps do out[i] = source[i] and "x" or "." end return table.concat(out) end

local Pattern = {}; Pattern.__index = Pattern
function M.pattern(opts)
  opts = opts or {}; local steps = math.max(1, math.floor(opts.steps or 16))
  local self = setmetatable({ steps = steps, values = {}, base = {}, ranks = {}, densityAmount = 1 }, Pattern)
  M.euclid(opts.hits or 0, steps, opts.rotation or 0, self.values); self:_captureBase(); return self
end
function Pattern:_captureBase() for i = 1, self.steps do self.base[i] = self.values[i] == true; self.ranks[i] = nil end self.densityAmount = 1 end
function Pattern:at(i) return self.values[(math.floor(i) - 1) % self.steps + 1] == true end
function Pattern:set(i, value) i = (math.floor(i) - 1) % self.steps + 1; self.values[i], self.base[i] = value == true, value == true; return self end
function Pattern:toggle(i) return self:set(i, not self:at(i)) end
function Pattern:euclid(hits, steps, rotation) self.steps = math.max(1, math.floor(steps or self.steps)); M.euclid(hits, self.steps, rotation, self.values); self:_captureBase(); return self end
function Pattern:rotate(n)
  n = math.floor(n) % self.steps
  for _ = 1, n do local last = self.values[self.steps]; for i = self.steps, 2, -1 do self.values[i] = self.values[i - 1] end self.values[1] = last end
  self:_captureBase(); return self
end
function Pattern:invert() for i = 1, self.steps do self.values[i] = not self.values[i] end self:_captureBase(); return self end
function Pattern:clear() for i = 1, self.steps do self.values[i] = false end self:_captureBase(); return self end
function Pattern:fill() for i = 1, self.steps do self.values[i] = true end self:_captureBase(); return self end
function Pattern:count() local count = 0; for i = 1, self.steps do if self.values[i] then count = count + 1 end end return count end
function Pattern:density(amount, rng)
  amount = num.clamp(amount, 0, 1); rng = rng or rand.new(1)
  if #self.ranks ~= self.steps then local order = {}; for i = 1, self.steps do order[i] = i end; rng:shuffle(order); for rank = 1, self.steps do self.ranks[order[rank]] = rank end end
  local baseHits = 0; for i = 1, self.steps do if self.base[i] then baseHits = baseHits + 1 end end
  local target = math.floor(amount * self.steps + 0.5)
  local keep, need = math.min(target, baseHits), math.max(0, target - baseHits)
  for i = 1, self.steps do
    local order = 1
    for j = 1, self.steps do
      if self.base[j] == self.base[i] and self.ranks[j] < self.ranks[i] then order = order + 1 end
    end
    self.values[i] = self.base[i] and order <= keep or not self.base[i] and order <= need
  end
  self.densityAmount = amount; return self
end

local Poly = {}; Poly.__index = Poly
function M.poly(opts)
  opts = opts or {}; if type(opts.lengths) ~= "table" or #opts.lengths == 0 then error("poly requires lengths", 2) end
  local self = setmetatable({ lengths = {}, positions = {}, patterns = opts.patterns }, Poly)
  for i = 1, #opts.lengths do self.lengths[i], self.positions[i] = math.max(1, math.floor(opts.lengths[i])), 1 end
  return self
end
function Poly:advance() for i = 1, #self.lengths do self.positions[i] = self.positions[i] % self.lengths[i] + 1 end return self end
function Poly:at(track) local pattern = self.patterns and self.patterns[track]; if pattern then if pattern.at then return pattern:at(self.positions[track]) end return pattern[self.positions[track]] == true end return self.positions[track] == 1 end
function Poly:reset() for i = 1, #self.positions do self.positions[i] = 1 end return self end

return M
