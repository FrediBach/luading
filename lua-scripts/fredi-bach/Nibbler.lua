-- Nibbler
-- A control-rate recreation of Schlappi Engineering's four-bit accumulator.
--
-- Inspired by the Schlappi Engineering Nibbler hardware module and manual:
-- https://schlappiengineering.com/products/nibbler-preorder
--
-- The script models the modulo-16 accumulator, synchronous/asynchronous
-- outputs, add/subtract control, bit shifting, carry, four gate outputs, and
-- two 0-10 V stepped outputs. Disting NT samples Lua inputs every 1 ms, so this
-- is intended for sequencing, rhythm, and control-rate modulation rather than
-- transistor-level or audio-rate CMOS emulation.
--
-- Disting cannot detect whether Shift Data is physically patched. Use the
-- Shift source parameter to choose the hardware's normalled Rotate path or the
-- Shift Data input explicitly.
--
-- This is an independent software recreation and is not affiliated with or
-- endorsed by Schlappi Engineering.

local WORD_MASK = 0x0f
local GATE_VOLTAGE = 10.0
local DAC_STEP = GATE_VOLTAGE / WORD_MASK

local INPUT_CLOCK = 1
local INPUT_RESET = 2
local INPUT_SUB = 3
local INPUT_GATE_1 = 4
local INPUT_GATE_2 = 5
local INPUT_GATE_4 = 6
local INPUT_GATE_8 = 7
local INPUT_SHIFT = 8
local INPUT_SHIFT_DATA = 9
local INPUT_DATA_XOR = 10
local INPUT_CARRY_IN = 11

local PARAM_ADD_1 = 1
local PARAM_ADD_2 = 2
local PARAM_ADD_4 = 3
local PARAM_ADD_8 = 4
local PARAM_OPERATION = 5
local PARAM_MODE = 6
local PARAM_OFFSET = 7
local PARAM_SHIFT_SOURCE = 8

local OPERATION_ADD = 1
local MODE_SYNC = 1
local SHIFT_SOURCE_ROTATE = 1

local OFFSET_STEPS = { 0, 2, 4, 8 }
local BIT_INPUTS = {
    { parameter = PARAM_ADD_1, input = INPUT_GATE_1, weight = 1 },
    { parameter = PARAM_ADD_2, input = INPUT_GATE_2, weight = 2 },
    { parameter = PARAM_ADD_4, input = INPUT_GATE_4, weight = 4 },
    { parameter = PARAM_ADD_8, input = INPUT_GATE_8, weight = 8 },
}

local register = 0
local carryHigh = false
local gateHigh = {}

local function parameter(self, index, fallback)
    if self.parameters and self.parameters[index] ~= nil then
        return self.parameters[index]
    end
    return fallback
end

local function modeIsAsync(self)
    return parameter(self, PARAM_MODE, MODE_SYNC) ~= MODE_SYNC
end

local function subtractionIsActive(self)
    local switchSubtract = parameter(self, PARAM_OPERATION, OPERATION_ADD) ~= OPERATION_ADD
    return switchSubtract ~= (gateHigh[INPUT_SUB] == true)
end

local function inputWord(self)
    local word = 0
    for _, bit in ipairs(BIT_INPUTS) do
        local switchHigh = parameter(self, bit.parameter, 1) == 2
        if switchHigh or gateHigh[bit.input] then
            word = word | bit.weight
        end
    end

    if gateHigh[INPUT_CARRY_IN] then
        word = word | 1
    end
    return word
end

local function accumulatorResult(self)
    local word = inputWord(self)
    local raw = subtractionIsActive(self) and (register - word) or (register + word)
    return raw & WORD_MASK, raw < 0 or raw > WORD_MASK
end

local function visibleWord(self)
    if modeIsAsync(self) then
        return accumulatorResult(self)
    end
    return register
end

local function gateVoltage(value, bit)
    return (value & bit) ~= 0 and GATE_VOLTAGE or 0.0
end

local function outputs(self)
    local value = visibleWord(self)
    local offsetIndex = parameter(self, PARAM_OFFSET, 1)
    local offset = OFFSET_STEPS[offsetIndex] or 0
    local offsetValue = (value + offset) & WORD_MASK

    return {
        value * DAC_STEP,
        offsetValue * DAC_STEP,
        carryHigh and GATE_VOLTAGE or 0.0,
        gateVoltage(value, 8),
        gateVoltage(value, 4),
        gateVoltage(value, 2),
        gateVoltage(value, 1),
    }
end

local function shiftRegister(self)
    local incoming
    if parameter(self, PARAM_SHIFT_SOURCE, SHIFT_SOURCE_ROTATE) == SHIFT_SOURCE_ROTATE then
        incoming = (register & 8) ~= 0 and 1 or 0
    else
        incoming = gateHigh[INPUT_SHIFT_DATA] and 1 or 0
    end

    if gateHigh[INPUT_DATA_XOR] then
        incoming = incoming ~ 1
    end

    register = ((register << 1) & WORD_MASK) | incoming
    carryHigh = false
end

local function clockRegister(self)
    if gateHigh[INPUT_SHIFT] then
        shiftRegister(self)
        return
    end

    local nextValue, overflow = accumulatorResult(self)
    register = nextValue
    carryHigh = overflow
end

local function asyncClockLevel()
    return (gateHigh[INPUT_CLOCK] == true) ~= (gateHigh[INPUT_SHIFT] == true)
end

local function resetRegister()
    register = 0
    carryHigh = false
end

local function initializeState()
    resetRegister()
    gateHigh = {}
end

return {
    name = "Nibbler",
    author = "Fredi Bach",

    -- Luading simulator extension; ignored by Disting NT.
    luading = {
        parameterPresets = {
            { name = "Count by 1", values = { 2, 1, 1, 1, 1, 1, 1, 1 } },
            { name = "Count by 3", values = { 2, 2, 1, 1, 1, 1, 2, 1 } },
            { name = "Descending 5", values = { 2, 1, 2, 1, 2, 1, 3, 1 } },
            { name = "Async phase", values = { 2, 1, 1, 2, 1, 2, 4, 2 } },
        },
    },

    init = function(self)
        initializeState()
        return {
            inputs = {
                kGate,    -- Type: Gate, Synced: true, Division: 1/8
                kTrigger, -- Type: Manual / DC
                kGate,    -- Type: Manual / DC
                kGate,    -- Type: Manual / DC
                kGate,    -- Type: Manual / DC
                kGate,    -- Type: Manual / DC
                kGate,    -- Type: Manual / DC
                kGate,    -- Type: Manual / DC
                kGate,    -- Type: Manual / DC
                kGate,    -- Type: Manual / DC
                kGate,    -- Type: Manual / DC
            },
            inputNames = {
                "Clock",
                "Reset",
                "Sub",
                "Gate 1",
                "Gate 2",
                "Gate 4",
                "Gate 8",
                "Shift",
                "Shift Data",
                "Data XOR",
                "Carry In",
            },
            outputs = {
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
            },
            outputNames = {
                "Stepped 1",
                "Stepped 2",
                "Carry",
                "Out 8",
                "Out 4",
                "Out 2",
                "Out 1",
            },
            parameters = {
                { "Add 1", { "Off", "On" }, 2 },
                { "Add 2", { "Off", "On" }, 1 },
                { "Add 4", { "Off", "On" }, 1 },
                { "Add 8", { "Off", "On" }, 1 },
                { "Operation", { "Add", "Subtract" }, 1 },
                { "Mode", { "Sync", "Async" }, 1 },
                { "Offset", { "0 deg", "45 deg", "90 deg", "180 deg" }, 1 },
                { "Shift source", { "Rotate", "Data in" }, 1 },
            },
        }
    end,

    trigger = function(self, input)
        if input == INPUT_RESET then
            resetRegister()
        end
        return outputs(self)
    end,

    gate = function(self, input, rising)
        local previousAsyncClock = asyncClockLevel()
        gateHigh[input] = rising
        local nextAsyncClock = asyncClockLevel()

        if modeIsAsync(self) then
            if nextAsyncClock and not previousAsyncClock then
                clockRegister(self)
            elseif previousAsyncClock and not nextAsyncClock then
                carryHigh = false
            end
        elseif input == INPUT_CLOCK then
            if rising then
                clockRegister(self)
            else
                carryHigh = false
            end
        end

        return outputs(self)
    end,

    step = function(self, _dt, _inputs)
        -- Recompute continuously so parameter changes update asynchronous
        -- outputs immediately while synchronous outputs retain the register.
        return outputs(self)
    end,

    draw = function(self)
        local value = visibleWord(self)
        local operation = subtractionIsActive(self) and "SUB" or "ADD"
        local mode = modeIsAsync(self) and "ASYNC" or "SYNC"
        local offsetIndex = parameter(self, PARAM_OFFSET, 1)
        local offsetLabels = { "0", "45", "90", "180" }

        drawTinyText(5, 7, "NIBBLER", 15)
        drawTinyText(251, 7, operation .. "  " .. mode, 7, "right")

        local weights = { 8, 4, 2, 1 }
        for index, weight in ipairs(weights) do
            local x = 5 + (index - 1) * 31
            local high = (value & weight) ~= 0
            drawBox(x, 16, x + 25, 45, high and 15 or 5)
            if high then
                drawRectangle(x + 3, 19, x + 22, 42, 12)
            end
            drawTinyText(x + 12, 59, tostring(weight), high and 15 or 6, "centre")
        end

        local firstHeight = math.floor(value * 30 / WORD_MASK + 0.5)
        local offset = OFFSET_STEPS[offsetIndex] or 0
        local secondValue = (value + offset) & WORD_MASK
        local secondHeight = math.floor(secondValue * 30 / WORD_MASK + 0.5)
        drawBox(139, 16, 158, 47, 5)
        drawBox(166, 16, 185, 47, 5)
        if firstHeight > 0 then
            drawRectangle(142, 45 - firstHeight, 155, 45, 15)
        end
        if secondHeight > 0 then
            drawRectangle(169, 45 - secondHeight, 182, 45, 10)
        end
        drawTinyText(148, 59, "S1", 8, "centre")
        drawTinyText(175, 59, "S2", 8, "centre")

        drawBox(197, 16, 251, 47, carryHigh and 15 or 5)
        drawTinyText(224, 29, "WORD " .. tostring(value), 15, "centre")
        drawTinyText(224, 41, carryHigh and "CARRY" or ("OFF " .. offsetLabels[offsetIndex]), carryHigh and 15 or 7, "centre")
        return true
    end,
}
