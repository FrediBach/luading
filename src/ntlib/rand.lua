local num = require "ntlib.num"
local M = {}
local DEFAULT_SEED = 0x4e544c4942
local MASK53 = 0x1fffffffffffff

local Rng = {}
Rng.__index = Rng

local function mix(x)
  x = x ~ (x >> 30); x = x * 0xbf58476d1ce4e5b9
  x = x ~ (x >> 27); x = x * 0x94d049bb133111eb
  return x ~ (x >> 31)
end
function M.new(seed) return setmetatable({}, Rng):seed(seed or DEFAULT_SEED) end
function Rng:seed(seed)
  if type(seed) ~= "number" then error("seed must be an integer", 2) end
  seed = math.tointeger(seed) or math.floor(seed)
  self.a, self.b = mix(seed), mix(seed + 0x9e3779b97f4a7c15)
  if self.a == 0 and self.b == 0 then self.b = 1 end
  return self
end
function Rng:next()
  local x, y = self.a, self.b
  self.a = y
  x = x ~ (x << 23)
  self.b = x ~ y ~ (x >> 17) ~ (y >> 26)
  return (((self.b + y) >> 11) & MASK53) / 9007199254740992
end
function Rng:int(lo, hi)
  lo, hi = math.ceil(lo), math.floor(hi)
  if hi < lo then lo, hi = hi, lo end
  return lo + math.floor(self:next() * (hi - lo + 1))
end
function Rng:range(lo, hi) return lo + (hi - lo) * self:next() end
function Rng:bool() return self:next() < 0.5 end
function Rng:chance(p) return self:next() < num.clamp(p, 0, 1) end
function Rng:sign() if self:bool() then return -1 end return 1 end
function Rng:pick(t) if #t == 0 then return nil end return t[self:int(1, #t)] end
function Rng:shuffle(t) for i = #t, 2, -1 do local j = self:int(1, i); t[i], t[j] = t[j], t[i] end return t end
function Rng:state() return self.a, self.b end
function Rng:setState(a, b)
  a, b = math.tointeger(a), math.tointeger(b)
  if not a or not b or (a == 0 and b == 0) then error("invalid random state", 2) end
  self.a, self.b = a, b; return self
end

function M.uniform(rng, lo, hi) return rng:range(lo, hi) end
function M.triangular(rng, lo, hi) return lo + (hi - lo) * (rng:next() + rng:next()) * 0.5 end
function M.gaussian(rng, mean, sd) return mean + sd * ((rng:next() + rng:next() + rng:next() + rng:next() + rng:next() + rng:next()) - 3) end
function M.exponential(rng, mean) return -mean * math.log(math.max(1e-15, 1 - rng:next())) end

local Weighted = {}; Weighted.__index = Weighted
function M.weights(opts)
  if type(opts) ~= "table" or not opts.rng or type(opts.weights) ~= "table" then error("weights requires rng and weights", 2) end
  local self = setmetatable({ rng = opts.rng, cumulative = {}, values = {} }, Weighted)
  for i = 1, #opts.weights do self.values[i] = math.max(0, opts.weights[i]) end
  self:_rebuild(); return self
end
function Weighted:_rebuild() local total = 0; for i = 1, #self.values do total = total + self.values[i]; self.cumulative[i] = total end self.total = total end
function Weighted:pick()
  if self.total <= 0 then return 1 end
  local x = self.rng:next() * self.total
  for i = 1, #self.cumulative do if x < self.cumulative[i] then return i end end
  return #self.cumulative
end
function Weighted:set(i, weight) self.values[i] = math.max(0, weight); self:_rebuild(); return self end

local Walk = {}; Walk.__index = Walk
function M.walk(opts)
  opts = opts or {}; if not opts.rng then error("walk requires rng", 2) end
  return setmetatable({ rng = opts.rng, min = opts.min or -1, max = opts.max or 1, step = opts.step or 0.1, mode = opts.mode or "clamp", value = opts.value or 0 }, Walk)
end
function Walk:next()
  local v = self.value + self.rng:sign() * self.step
  if self.mode == "wrap" then v = num.wrap(v, self.min, self.max)
  elseif self.mode == "reflect" then v = num.fold(v, self.min, self.max)
  else v = num.clamp(v, self.min, self.max) end
  self.value = v; return v
end
function Walk:set(v) self.value = num.clamp(v, self.min, self.max); return self end

local Bag = {}; Bag.__index = Bag
function M.bag(opts)
  if type(opts) ~= "table" or not opts.rng or type(opts.items) ~= "table" or #opts.items == 0 then error("bag requires rng and non-empty items", 2) end
  local self = setmetatable({ rng = opts.rng, items = {}, order = {}, remaining = 0 }, Bag)
  for i = 1, #opts.items do self.items[i] = opts.items[i]; self.order[i] = i end
  return self:refill()
end
function Bag:refill() self.rng:shuffle(self.order); self.remaining = #self.order; return self end
function Bag:next() if self.remaining == 0 then self:refill() end local value = self.items[self.order[self.remaining]]; self.remaining = self.remaining - 1; return value end

local Markov = {}; Markov.__index = Markov
function M.markov(opts)
  if type(opts) ~= "table" or not opts.rng or not tonumber(opts.size) then error("markov requires rng and size", 2) end
  local self = setmetatable({ rng = opts.rng, size = math.floor(opts.size), matrix = {}, state = opts.state or 1 }, Markov)
  for i = 1, self.size do self.matrix[i] = {}; for j = 1, self.size do self.matrix[i][j] = math.max(0, opts.matrix and opts.matrix[i] and opts.matrix[i][j] or 0) end end
  return self
end
function Markov:next()
  local row, total = self.matrix[self.state], 0
  for i = 1, self.size do total = total + row[i] end
  local threshold, choice = self.rng:next() * total, 1
  if total > 0 then local cumulative = 0; for i = 1, self.size do cumulative = cumulative + row[i]; if threshold < cumulative then choice = i; break end end end
  self.state = choice; return choice
end
function Markov:setState(i) self.state = num.clamp(math.floor(i), 1, self.size); return self end
function Markov:set(from, to, weight) self.matrix[from][to] = math.max(0, weight); return self end

local Turing = {}; Turing.__index = Turing
function M.turing(opts)
  opts = opts or {}; if not opts.rng then error("turing requires rng", 2) end
  local self = setmetatable({ rng = opts.rng, register = opts.bits or 1 }, Turing)
  self:setLength(opts.length or 16); self:setProb(opts.prob or 0.5); return self
end
function Turing:setLength(n) self.length = num.clamp(math.floor(n), 2, 32); self.mask = (1 << self.length) - 1; self.register = self.register & self.mask; return self end
function Turing:setProb(p) self.prob = num.clamp(p, 0, 1); return self end
function Turing:step()
  local out = self.register & 1
  local feedback = out
  if self.rng:chance(self.prob) then feedback = 1 - feedback end
  self.register = ((self.register >> 1) | (feedback << (self.length - 1))) & self.mask
  return out
end
function Turing:value(bits) bits = num.clamp(math.floor(bits or 8), 1, self.length); local mask = (1 << bits) - 1; return ((self.register >> (self.length - bits)) & mask) / mask end
function Turing:write(bits) self.register = math.tointeger(bits) & self.mask; return self end
function Turing:read() return self.register end

return M
