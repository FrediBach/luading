local M = {}
local Schema = {}; Schema.__index = Schema
local formats = { u8 = ">I1", i8 = ">i1", u16 = ">I2", i16 = ">i2", u32 = ">I4", i32 = ">i4", f32 = ">f", f64 = ">d", bool = ">I1" }
local limits = { u8 = { 0, 0xff }, i8 = { -0x80, 0x7f }, u16 = { 0, 0xffff }, i16 = { -0x8000, 0x7fff }, u32 = { 0, 0xffffffff }, i32 = { -0x80000000, 0x7fffffff } }
local function fieldFormat(field)
  local kind, size = field[2], field[3]
  if formats[kind] then return formats[kind] end
  if kind == "bits" then if size <= 8 then return ">I1" elseif size <= 16 then return ">I2" elseif size <= 32 then return ">I4" end end
  if kind == "str" and size and size > 0 then return ">c" .. math.floor(size) end
  error("unsupported state field type: " .. tostring(kind), 3)
end
function M.schema(opts)
  if type(opts) ~= "table" or not math.tointeger(opts.version) or opts.version < 1 or type(opts.fields) ~= "table" then error("schema requires a positive version and fields", 2) end
  local self = setmetatable({ version = opts.version, fields = opts.fields, migrate = opts.migrate or {}, format = ">I2" }, Schema)
  local names = {}; for i = 1, #self.fields do local field = self.fields[i]; if names[field[1]] then error("duplicate state field", 2) end; names[field[1]] = true; self.format = self.format .. fieldFormat(field) end
  return self
end
local function defaultFor(field) if field[4] ~= nil then return field[4] end; if field[2] == "str" then return "" elseif field[2] == "bool" then return false end return 0 end
function Schema:defaults() local out = {}; for i = 1, #self.fields do out[self.fields[i][1]] = defaultFor(self.fields[i]) end return out end
function Schema:save(data)
  local values = { self.version }
  for i = 1, #self.fields do local field = self.fields[i]; local value = data[field[1]]; if value == nil then value = defaultFor(field) end; if field[2] == "bool" then value = value and 1 or 0; elseif limits[field[2]] then value = math.max(limits[field[2]][1], math.min(limits[field[2]][2], math.floor(value))); elseif field[2] == "bits" then value = math.floor(value) & ((1 << field[3]) - 1); elseif field[2] == "str" then value = tostring(value):sub(1, field[3]) end; values[#values + 1] = value end
  return string.pack(self.format, table.unpack(values))
end
function Schema:load(blob)
  if type(blob) ~= "string" then return nil, "state must be a string" end
  local ok, stored, position = pcall(string.unpack, ">I2", blob)
  if not ok then return nil, "invalid or truncated state" end
  if stored < 1 then return nil, "invalid state version" end
  if stored > self.version then return nil, "state was written by a newer schema" end
  local out = {}
  for i = 1, #self.fields do
    local field = self.fields[i]
    local unpacked, value, nextPosition = pcall(string.unpack, fieldFormat(field), blob, position)
    if unpacked then position = nextPosition else value = defaultFor(field) end
    if field[2] == "bool" then value = value ~= 0 elseif field[2] == "str" then value = value:gsub("%z+$", "") end
    out[field[1]] = value
  end
  for version = stored, self.version - 1 do local migration = self.migrate[version]; if migration then out = migration(out) or out end end
  return out
end
function Schema:size() return string.packsize(self.format) end
function M.packBits(values, n) local bits = 0; for i = 1, math.min(n or #values, 32) do if values[i] then bits = bits | (1 << (i - 1)) end end return bits end
function M.unpackBits(bits, n, out) out = out or {}; for i = 1, n do out[i] = bits & (1 << (i - 1)) ~= 0 end; for i = n + 1, #out do out[i] = nil end; return out end

return M
