local M = {
  VERSION = "1.0.0",
  VERSION_NUM = 10000,
}

local modules = {
  num = true, volts = true, quant = true, signal = true, clock = true,
  gate = true, env = true, lfo = true, rand = true, rhythm = true,
  seq = true, theory = true, param = true, state = true, midi = true,
  draw = true, test = true,
}

local function versionNumber(version)
  local major, minor, patch = tostring(version):match("^(%d+)%.?(%d*)%.?(%d*)$")
  if not major then return nil end
  return tonumber(major) * 10000 + (tonumber(minor) or 0) * 100 + (tonumber(patch) or 0)
end

function M.require(version)
  local wanted = versionNumber(version)
  if not wanted then error("invalid ntlib version: " .. tostring(version), 2) end
  if M.VERSION_NUM < wanted then
    error("ntlib " .. tostring(version) .. " or newer is required; installed version is " .. M.VERSION, 2)
  end
  return M
end

return setmetatable(M, {
  __index = function(t, key)
    if not modules[key] then return nil end
    local value = require("ntlib." .. key)
    rawset(t, key, value)
    return value
  end,
})
