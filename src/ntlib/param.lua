local num = require "ntlib.num"
local M = {}
local Builder = {}; Builder.__index = Builder

local units = {
  int = function() return kNone end, volts = function() return kVolts end, ms = function() return kMs end,
  hz = function() return kHz end, percent = function() return kPercent end, semis = function() return kSemitones end,
  db = function() return kDb end, bus = function() return kNone end,
}
local function keyFor(name) return name:lower():gsub("[^%w]", "") end
local function scaleFor(step)
  if not step or step >= 1 then return 1 end
  if step >= 0.1 then return kBy10 elseif step >= 0.01 then return kBy100 end
  return kBy1000
end
function M.builder() return setmetatable({ definitions = {}, entries = {}, values = {}, previous = {}, changedFlags = {}, built = false, lastSelf = nil }, Builder) end
function Builder:_add(kind, name, lo, hi, default, opts)
  if self.built then error("cannot add parameters after build", 3) end
  opts = opts or {}; local key = opts.name or keyFor(name)
  if key == "" or self.entries[key] then error("parameter accessor names must be unique", 3) end
  local scale = scaleFor(opts.step)
  local definition = { name, num.round(lo * scale), num.round(hi * scale), num.round(default * scale), units[kind](), scale }
  if scale == 1 then definition[6] = nil end
  self.definitions[#self.definitions + 1] = definition
  self.entries[key] = { index = #self.definitions, kind = kind, key = key, scale = scale }
  return self
end
function Builder:int(name, lo, hi, default, opts) return self:_add("int", name, lo, hi, default, opts) end
function Builder:volts(name, lo, hi, default, opts) opts = opts or { step = 0.01 }; if opts.step == nil then opts.step = 0.01 end return self:_add("volts", name, lo, hi, default, opts) end
function Builder:ms(name, lo, hi, default, opts) return self:_add("ms", name, lo, hi, default, opts) end
function Builder:hz(name, lo, hi, default, opts) return self:_add("hz", name, lo, hi, default, opts) end
function Builder:percent(name, lo, hi, default, opts) return self:_add("percent", name, lo, hi, default, opts) end
function Builder:semis(name, lo, hi, default, opts) return self:_add("semis", name, lo, hi, default, opts) end
function Builder:db(name, lo, hi, default, opts) return self:_add("db", name, lo, hi, default, opts) end
function Builder:enum(name, choices, default, opts)
  if self.built then error("cannot add parameters after build", 2) end
  if type(choices) ~= "table" or #choices == 0 then error("enum choices must be non-empty", 2) end
  opts = opts or {}; local key = opts.name or keyFor(name); if key == "" or self.entries[key] then error("parameter accessor names must be unique", 2) end
  local copy = {}; for i = 1, #choices do copy[i] = tostring(choices[i]) end
  self.definitions[#self.definitions + 1] = { name, copy, num.clamp(math.floor(default or 1), 1, #copy) }
  self.entries[key] = { index = #self.definitions, kind = "enum", key = key, choices = copy }
  return self
end
function Builder:bool(name, default, opts)
  local key = opts and (opts.name or keyFor(name)) or keyFor(name)
  self:enum(name, { "Off", "On" }, default and 2 or 1, opts)
  return self:_setBool(key)
end
function Builder:_setBool(key) self.entries[key].kind = "bool"; return self end
function Builder:bus(name, opts) return self:_add("bus", name, 0, 28, 0, opts) end
function Builder:build() self.built = true; return self.definitions end
function Builder:read(script)
  local parameters = script and script.parameters or {}
  self.anyChangedFlag = false
  for key, entry in pairs(self.entries) do
    local raw = parameters[entry.index]
    if raw == nil then local d = self.definitions[entry.index]; raw = (entry.kind == "enum" or entry.kind == "bool") and d[3] or d[4] / entry.scale end
    local value = raw
    if entry.kind == "ms" then value = raw / 1000 elseif entry.kind == "bool" then value = raw >= 2 end
    self.values[key] = value
    if entry.kind == "enum" then self.values[key .. "Name"] = entry.choices[math.floor(raw)] end
    local changed = self.previous[key] == nil or self.previous[key] ~= value
    self.changedFlags[key] = self.changedFlags[key] or changed
    self.anyChangedFlag, self.previous[key] = self.anyChangedFlag or self.changedFlags[key], value
  end
  self.lastSelf = script
  return self.values
end
function Builder:changed(script, key)
  if self.lastSelf ~= script then self:read(script) end
  local changed = self.changedFlags[key] == true
  self.changedFlags[key] = false
  self.anyChangedFlag = false; for _, value in pairs(self.changedFlags) do if value then self.anyChangedFlag = true; break end end
  return changed
end
function Builder:anyChanged(script)
  if self.lastSelf ~= script then self:read(script) end
  local changed = self.anyChangedFlag == true
  self.anyChangedFlag = false; for key in pairs(self.changedFlags) do self.changedFlags[key] = false end
  return changed
end

local Smooth = {}; Smooth.__index = Smooth
function M.smooth(opts) opts = opts or {}; return setmetatable({ time = math.max(0, opts.time or 0.02), value = opts.value, initialized = opts.value ~= nil }, Smooth) end
function Smooth:process(target, dt) if not self.initialized or self.time == 0 then self.value, self.initialized = target, true; return target end local a = 1 - math.exp(-math.max(0, dt) / self.time); self.value = self.value + a * (target - self.value); return self.value end
function Smooth:reset(value) self.value, self.initialized = value, value ~= nil; return self end

local Mod = {}; Mod.__index = Mod
function M.mod(opts)
  if type(opts) ~= "table" or type(opts.base) ~= "string" then error("mod requires a base accessor", 2) end
  return setmetatable({ base = opts.base, input = math.max(0, math.floor(opts.input or 0)), depth = opts.depth or 1, attenuverter = opts.attenuverter, min = opts.min or -math.huge, max = opts.max or math.huge, smoother = opts.slew and opts.slew > 0 and M.smooth{ time = opts.slew } or nil }, Mod)
end
function Mod:process(parameters, inputs, dt) local depth = self.attenuverter and (parameters[self.attenuverter] or 0) or 1; local cv = self.input > 0 and (inputs[self.input] or 0) or 0; local value = num.clamp((parameters[self.base] or 0) + cv * self.depth * depth, self.min, self.max); if self.smoother then return self.smoother:process(value, dt) end return value end

return M
