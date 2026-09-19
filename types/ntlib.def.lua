---@meta

---@class ntlib
---@field VERSION string
---@field VERSION_NUM integer
local ntlib = {}
---@param version string
---@return ntlib
function ntlib.require(version) end

---@class ntlib.Rng
---@field a integer
---@field b integer
local Rng = {}
---@return number
function Rng:next() end
---@param lo integer
---@param hi integer
---@return integer
function Rng:int(lo, hi) end
---@param lo number
---@param hi number
---@return number
function Rng:range(lo, hi) end
---@return integer, integer
function Rng:state() end

---@class ntlib.Quantiser
---@field scale integer
---@field root integer
---@field hysteresis number
local Quantiser = {}
---Quantise a voltage with hysteresis.
---@param voltage number
---@return number voltage
---@return integer degree
---@return boolean changed
function Quantiser:process(voltage) end
---@param voltage number
---@return number voltage
function Quantiser:nearest(voltage) end
---@param degree integer
---@param octave? integer
---@return number voltage
function Quantiser:degreeToVolts(degree, octave) end
function Quantiser:reset() end

---@class ntlib.Gate
---@field busy boolean
local Gate = {}
---@param length? number
function Gate:trigger(length) end
function Gate:open() end
function Gate:close() end
---@param dt number
---@return number voltage
---@return boolean state
function Gate:process(dt) end

---@class ntlib.Envelope
---@field level number
---@field stage 'idle'|'delay'|'attack'|'hold'|'decay'|'sustain'|'release'
---@field cycles integer
local Envelope = {}
function Envelope:trigger() end
---@param high boolean
function Envelope:gate(high) end
function Envelope:release() end
---@param dt number
---@return number level
---@return string stage
function Envelope:process(dt) end

---@class ntlib.Clock
---@field bpm number
---@field period number
---@field phase number
---@field beat integer
---@field running boolean
---@field external boolean
local Clock = {}
function Clock:pulse() end
---@param dt number
---@return number phase
---@return integer beat
---@return number bpm
function Clock:process(dt) end

---@class ntlib.Playhead
---@field index integer
---@field length integer
local Playhead = {}
---@return integer index
---@return boolean wrapped
function Playhead:advance() end

---@class ntlib.ParameterBuilder
local ParameterBuilder = {}
function ParameterBuilder:int(name, min, max, default, opts) end
function ParameterBuilder:volts(name, min, max, default, opts) end
function ParameterBuilder:ms(name, min, max, default, opts) end
function ParameterBuilder:hz(name, min, max, default, opts) end
function ParameterBuilder:percent(name, min, max, default, opts) end
function ParameterBuilder:semis(name, min, max, default, opts) end
function ParameterBuilder:db(name, min, max, default, opts) end
function ParameterBuilder:enum(name, choices, default, opts) end
function ParameterBuilder:bool(name, default, opts) end
function ParameterBuilder:bus(name, opts) end
---@return table[]
function ParameterBuilder:build() end
---@return table<string, number|string|boolean>
function ParameterBuilder:read(script) end

return ntlib
