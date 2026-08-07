-- Mutable Instruments Stages
-- A single-envelope, eight-segment Disting NT recreation of Mutable Instruments Stages.
--
-- Independently written from the behavior documented in the Mutable Instruments
-- Stages manual and informed by the MIT-licensed firmware by Emilie Gillet:
-- https://pichenettes.github.io/mutable-instruments-documentation/modules/stages/manual/
-- https://github.com/pichenettes/eurorack/tree/master/stages
--
-- Disting adaptation:
--   Input 1 is the group gate. Inputs 2-9 are the TIME/LEVEL CV inputs for
--   segments 1-8. Output 1 is the envelope; outputs 2-9 are the corresponding
--   segment activity ramps. Parameters replace the eight sliders, secondary
--   knobs, type buttons, and loop gesture.
--
-- This preserves Stages' multi-segment Ramp, Step, and Hold grammar, target
-- rules, loop escape, and trigger-advanced Steps. It deliberately implements
-- one group only. It does not reproduce isolated-segment modes, jack-detected
-- grouping, chaining, clocked LFO/oscillator modes, extended sequencing,
-- analogue calibration, or the firmware's 31.25 kHz processing. Timing and
-- curves are control-rate approximations at Disting's 1 ms Lua cadence.
--
-- Copyright 2017 Emilie Gillet.
--
-- Permission is hereby granted, free of charge, to any person obtaining a copy
-- of this software and associated documentation files (the "Software"), to deal
-- in the Software without restriction, including without limitation the rights
-- to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
-- copies of the Software, and to permit persons to whom the Software is
-- furnished to do so, subject to the following conditions:
--
-- The above copyright notice and this permission notice shall be included in
-- all copies or substantial portions of the Software.
--
-- THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
-- IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
-- FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
-- AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
-- LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
-- OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
-- SOFTWARE.

local INPUT_GATE = 1

local OUTPUT_ENVELOPE = 1
local OUTPUT_ACTIVITY_FIRST = 2

local P_STAGE_COUNT = 1
local P_LOOP_START = 2
local P_LOOP_END = 3
local P_FIRST_STAGE = 4

local TYPE_RAMP = 1
local TYPE_STEP = 2
local TYPE_HOLD = 3

local MAX_STAGES = 8
local MAX_LEVEL = 8
local MIN_CV_LEVEL = -8
local MIN_TIME = 0.001
local MAX_TIME = 16
local MAX_GLIDE = 8

local TYPE_NAMES = { "RAMP", "STEP", "HOLD" }
local TYPE_MARKS = { "R", "S", "H" }

local DEFAULT_PARAMETERS = {
    4, 4, 3,
    TYPE_RAMP, 30, -25,
    TYPE_RAMP, 45, 25,
    TYPE_HOLD, 60, -40,
    TYPE_RAMP, 55, 20,
    TYPE_RAMP, 50, 0,
    TYPE_RAMP, 50, 0,
    TYPE_RAMP, 50, 0,
    TYPE_RAMP, 50, 0,
}

local latestInputs
local activeStage
local currentLevel
local startLevel
local targetLevel
local elapsed
local segmentDuration
local gateHigh

local function clamp(value, minimum, maximum)
    return math.max(minimum, math.min(maximum, value))
end

local function round(value)
    if value >= 0 then return math.floor(value + 0.5) end
    return math.ceil(value - 0.5)
end

local function finiteNumber(value)
    return type(value) == "number" and value == value
        and value ~= math.huge and value ~= -math.huge
end

local function indexable(value)
    local valueType = type(value)
    return valueType == "table" or valueType == "userdata"
end

local function parameter(self, index)
    if self.parameters and self.parameters[index] ~= nil then
        return self.parameters[index]
    end
    return DEFAULT_PARAMETERS[index]
end

local function stageParameter(index, offset)
    return P_FIRST_STAGE + (index - 1) * 3 + offset
end

local function stageCount(self)
    return clamp(round(parameter(self, P_STAGE_COUNT)), 1, MAX_STAGES)
end

local function stageType(self, index)
    return clamp(round(parameter(self, stageParameter(index, 0))), TYPE_RAMP, TYPE_HOLD)
end

local function stagePrimary(self, index)
    return clamp(parameter(self, stageParameter(index, 1)), 0, 100)
end

local function stageSecondary(self, index)
    return clamp(parameter(self, stageParameter(index, 2)), -100, 100)
end

local function stageCv(index)
    return latestInputs[index + 1] or 0
end

local function stageLevel(self, index)
    return clamp(stagePrimary(self, index) * 0.08 + stageCv(index), MIN_CV_LEVEL, MAX_LEVEL)
end

local function exponentialTime(position, minimum, maximum)
    local normalized = clamp(position, 0, 1)
    return minimum * ((maximum / minimum) ^ normalized)
end

local function rampDuration(self, index)
    local base = exponentialTime(stagePrimary(self, index) / 100, MIN_TIME, MAX_TIME)
    return clamp(base * (2 ^ stageCv(index)), MIN_TIME, MAX_TIME)
end

local function holdDuration(self, index)
    local normalized = (stageSecondary(self, index) + 100) / 200
    return exponentialTime(normalized, MIN_TIME, MAX_TIME)
end

local function glideDuration(self, index)
    local secondary = stageSecondary(self, index)
    if secondary <= -100 then return 0 end
    return exponentialTime((secondary + 100) / 200, MIN_TIME, MAX_GLIDE)
end

local function loopBounds(self)
    local count = stageCount(self)
    local choice = round(parameter(self, P_LOOP_START))
    if choice <= 1 then return nil, nil end
    local first = clamp(choice - 1, 1, count)
    local last = clamp(round(parameter(self, P_LOOP_END)), first, count)
    return first, last
end

local function loopContainsStep(self, first, last)
    if not first or not last then return false end
    for index = first, last do
        if stageType(self, index) == TYPE_STEP then return true end
    end
    return false
end

local function rampUsesBreakpoint(self, index)
    local count = stageCount(self)
    return index > 1 and index < count and stageType(self, index + 1) == TYPE_RAMP
end

local function rampTarget(self, index)
    local count = stageCount(self)
    if count == 1 then return 0 end
    if index == 1 then return MAX_LEVEL end
    if index == count then return 0 end

    local followingType = stageType(self, index + 1)
    if followingType == TYPE_HOLD or followingType == TYPE_STEP then
        return stageLevel(self, index + 1)
    end

    return (stageSecondary(self, index) + 100) * 0.04
end

local function shapedProgress(progress, shape)
    progress = clamp(progress, 0, 1)
    shape = clamp(shape, -100, 100)
    if shape < 0 then
        local exponent = 1 + (-shape / 100) * 3
        return progress ^ exponent
    elseif shape > 0 then
        local exponent = 1 + (shape / 100) * 3
        return 1 - ((1 - progress) ^ exponent)
    end
    return progress
end

local function rampProgress(self, index, progress)
    if rampUsesBreakpoint(self, index) then return progress end
    return shapedProgress(progress, stageSecondary(self, index))
end

local function resetRuntime()
    latestInputs = {}
    for index = 1, MAX_STAGES + 1 do latestInputs[index] = 0 end
    activeStage = 0
    currentLevel = 0
    startLevel = 0
    targetLevel = 0
    elapsed = 0
    segmentDuration = 0
    gateHigh = false
end

local function restoreRuntime(self)
    resetRuntime()
    local state = self.state
    if not indexable(state)
        or not finiteNumber(state.activeStage)
        or not finiteNumber(state.currentLevel)
        or not finiteNumber(state.startLevel)
        or not finiteNumber(state.targetLevel)
        or not finiteNumber(state.elapsed)
        or not finiteNumber(state.segmentDuration)
        or type(state.gateHigh) ~= "boolean" then
        return
    end

    activeStage = clamp(math.floor(state.activeStage), 0, stageCount(self))
    currentLevel = clamp(state.currentLevel, MIN_CV_LEVEL, MAX_LEVEL)
    startLevel = clamp(state.startLevel, MIN_CV_LEVEL, MAX_LEVEL)
    targetLevel = clamp(state.targetLevel, MIN_CV_LEVEL, MAX_LEVEL)
    elapsed = math.max(0, state.elapsed)
    segmentDuration = math.max(0, state.segmentDuration)
    gateHigh = state.gateHigh
end

local function activateStage(self, index)
    if index < 1 or index > stageCount(self) then
        activeStage = 0
        elapsed = 0
        segmentDuration = 0
        return
    end

    activeStage = index
    elapsed = 0
    startLevel = currentLevel
    local kind = stageType(self, index)

    if kind == TYPE_RAMP then
        if stageCount(self) == 1 then
            currentLevel = MAX_LEVEL
            startLevel = MAX_LEVEL
        end
        targetLevel = rampTarget(self, index)
        segmentDuration = rampDuration(self, index)
    elseif kind == TYPE_HOLD then
        targetLevel = stageLevel(self, index)
        currentLevel = targetLevel
        startLevel = targetLevel
        segmentDuration = holdDuration(self, index)
    else
        targetLevel = stageLevel(self, index)
        segmentDuration = glideDuration(self, index)
        if segmentDuration == 0 then currentLevel = targetLevel end
    end
end

local function advanceStage(self)
    if activeStage == 0 then return end
    local completed = activeStage
    local loopFirst, loopLast = loopBounds(self)
    if loopFirst and completed == loopLast then
        local trappedByStep = loopContainsStep(self, loopFirst, loopLast)
        if gateHigh or loopLast == stageCount(self) or trappedByStep then
            activateStage(self, loopFirst)
            return
        end
    end
    activateStage(self, completed + 1)
end

local function updateCurrentStage(self)
    if activeStage == 0 then return end
    local kind = stageType(self, activeStage)
    if kind == TYPE_RAMP then
        local progress = segmentDuration > 0 and elapsed / segmentDuration or 1
        local shaped = rampProgress(self, activeStage, progress)
        currentLevel = startLevel + (targetLevel - startLevel) * shaped
    elseif kind == TYPE_HOLD then
        currentLevel = targetLevel
    elseif segmentDuration == 0 then
        currentLevel = targetLevel
    else
        local progress = clamp(elapsed / segmentDuration, 0, 1)
        currentLevel = startLevel + (targetLevel - startLevel) * progress
    end
end

local function processEnvelope(self, dt)
    local remainingDt = math.max(0, dt)
    local guard = 0

    while activeStage > 0 and remainingDt > 0 and guard < 32 do
        guard = guard + 1
        local kind = stageType(self, activeStage)
        if kind == TYPE_STEP then
            elapsed = math.min(segmentDuration, elapsed + remainingDt)
            updateCurrentStage(self)
            remainingDt = 0
        else
            local remainingSegment = math.max(0, segmentDuration - elapsed)
            if remainingDt < remainingSegment then
                elapsed = elapsed + remainingDt
                updateCurrentStage(self)
                remainingDt = 0
            else
                elapsed = segmentDuration
                updateCurrentStage(self)
                remainingDt = remainingDt - remainingSegment
                advanceStage(self)
                if remainingSegment == 0 and remainingDt == 0 then remainingDt = -1 end
            end
        end
    end
end

local function activityLevel(self, index)
    if activeStage ~= index then return 0 end
    local kind = stageType(self, index)
    if kind == TYPE_STEP then
        if segmentDuration == 0 then return 0 end
        return MAX_LEVEL * (1 - clamp(elapsed / segmentDuration, 0, 1))
    end
    if segmentDuration == 0 then return 0 end
    return MAX_LEVEL * (1 - clamp(elapsed / segmentDuration, 0, 1))
end

local function outputValues(self)
    local outputs = { [OUTPUT_ENVELOPE] = currentLevel }
    for index = 1, MAX_STAGES do
        outputs[OUTPUT_ACTIVITY_FIRST + index - 1] = activityLevel(self, index)
    end
    return outputs
end

local function preset(name, count, loopFirst, loopLast, definitions)
    local values = { count, loopFirst and loopFirst + 1 or 1, loopLast or 1 }
    for index = 1, MAX_STAGES do
        local definition = definitions[index] or { TYPE_RAMP, 50, 0 }
        values[#values + 1] = definition[1]
        values[#values + 1] = definition[2]
        values[#values + 1] = definition[3]
    end
    return { name = name, values = values }
end

local function screenY(level)
    return round(49 - clamp(level, 0, MAX_LEVEL) * 4.25)
end

local function drawPlannedRamp(self, index, x1, x2, from, target)
    local previousX = x1
    local previousY = screenY(from)
    for sample = 1, 6 do
        local progress = sample / 6
        local shaped = rampProgress(self, index, progress)
        local level = from + (target - from) * shaped
        local x = round(x1 + (x2 - x1) * progress)
        local y = screenY(level)
        drawLine(previousX, previousY, x, y, 9)
        previousX = x
        previousY = y
    end
end

local function drawEnvelope(self)
    local count = stageCount(self)
    local left = 4
    local right = 251
    local width = (right - left) / count
    local plottedLevel = 0

    drawLine(left, screenY(0), right, screenY(0), 2)
    drawLine(left, screenY(MAX_LEVEL), right, screenY(MAX_LEVEL), 2)

    for index = 1, count do
        local x1 = round(left + (index - 1) * width)
        local x2 = round(left + index * width)
        local kind = stageType(self, index)
        if kind == TYPE_RAMP then
            if count == 1 then plottedLevel = MAX_LEVEL end
            local target = rampTarget(self, index)
            drawPlannedRamp(self, index, x1, x2, plottedLevel, target)
            plottedLevel = target
        else
            local target = stageLevel(self, index)
            drawLine(x1, screenY(plottedLevel), x1, screenY(target), kind == TYPE_STEP and 6 or 4)
            drawLine(x1, screenY(target), x2, screenY(target), kind == TYPE_STEP and 11 or 7)
            plottedLevel = target
        end

        if index < count then drawLine(x2, 14, x2, 51, 2) end
        drawTinyText(
            round((x1 + x2) / 2), 61,
            TYPE_MARKS[kind] .. tostring(index),
            activeStage == index and 15 or 7,
            "centre"
        )
    end

    local loopFirst, loopLast = loopBounds(self)
    if loopFirst and loopLast then
        local loopX1 = round(left + (loopFirst - 0.5) * width)
        local loopX2 = round(left + (loopLast - 0.5) * width)
        drawLine(loopX1, 11, loopX2, 11, 12)
        drawLine(loopX1, 9, loopX1, 13, 12)
        drawLine(loopX2, 9, loopX2, 13, 12)
    end

    if activeStage > 0 then
        local x1 = left + (activeStage - 1) * width
        local progress = segmentDuration > 0 and clamp(elapsed / segmentDuration, 0, 1) or 1
        if stageType(self, activeStage) == TYPE_STEP and progress >= 1 then progress = 0.92 end
        local x = round(x1 + width * progress)
        drawCircle(x, screenY(currentLevel), 2, 15)
    end
end

return {
    name = "Mutable Instruments Stages",
    author = "Luading",

    -- Luading simulator extension; ignored by Disting NT.
    luading = {
        parameterPresets = {
            preset("ADSR", 4, 3, 3, {
                { TYPE_RAMP, 30, -25 }, { TYPE_RAMP, 45, 25 },
                { TYPE_HOLD, 60, -40 }, { TYPE_RAMP, 55, 20 },
            }),
            preset("Decay", 1, nil, nil, {
                { TYPE_RAMP, 45, 25 },
            }),
            preset("AD", 2, nil, nil, {
                { TYPE_RAMP, 30, -25 }, { TYPE_RAMP, 55, 25 },
            }),
            preset("AR", 3, 2, 2, {
                { TYPE_RAMP, 30, -25 }, { TYPE_HOLD, 100, -100 },
                { TYPE_RAMP, 55, 20 },
            }),
            preset("ASR", 3, 2, 2, {
                { TYPE_RAMP, 30, -25 }, { TYPE_HOLD, 65, -100 },
                { TYPE_RAMP, 55, 20 },
            }),
            preset("AHR", 3, nil, nil, {
                { TYPE_RAMP, 30, -25 }, { TYPE_HOLD, 100, -20 },
                { TYPE_RAMP, 55, 20 },
            }),
            preset("Delayed ADSR", 5, 4, 4, {
                { TYPE_HOLD, 0, -25 }, { TYPE_RAMP, 30, -25 },
                { TYPE_RAMP, 45, 25 }, { TYPE_HOLD, 60, -40 },
                { TYPE_RAMP, 55, 20 },
            }),
            preset("Rest-level ADSR", 5, 3, 3, {
                { TYPE_RAMP, 30, -25 }, { TYPE_RAMP, 45, 25 },
                { TYPE_HOLD, 60, -40 }, { TYPE_RAMP, 55, 20 },
                { TYPE_HOLD, 15, -100 },
            }),
            preset("AHDSR", 5, 4, 4, {
                { TYPE_RAMP, 30, -25 }, { TYPE_HOLD, 100, -20 },
                { TYPE_RAMP, 45, 25 }, { TYPE_HOLD, 60, -40 },
                { TYPE_RAMP, 55, 20 },
            }),
            preset("AD1D2SR", 5, 4, 4, {
                { TYPE_RAMP, 30, -25 }, { TYPE_RAMP, 35, 70 },
                { TYPE_RAMP, 50, 20 }, { TYPE_HOLD, 45, -40 },
                { TYPE_RAMP, 55, 20 },
            }),
            preset("AD1D2SR1R2", 6, 4, 4, {
                { TYPE_RAMP, 30, -25 }, { TYPE_RAMP, 35, 70 },
                { TYPE_RAMP, 50, 20 }, { TYPE_HOLD, 45, -40 },
                { TYPE_RAMP, 40, -45 }, { TYPE_RAMP, 55, 20 },
            }),
            preset("Trapezoid LFO", 4, 1, 4, {
                { TYPE_RAMP, 45, -20 }, { TYPE_HOLD, 100, -35 },
                { TYPE_RAMP, 45, 20 }, { TYPE_HOLD, 0, -35 },
            }),
            preset("5 Step Sequence", 5, 1, 5, {
                { TYPE_STEP, 20, -100 }, { TYPE_STEP, 65, -100 },
                { TYPE_STEP, 40, -100 }, { TYPE_STEP, 90, -100 },
                { TYPE_STEP, 50, -100 },
            }),
            preset("Glide Sequence", 3, 1, 3, {
                { TYPE_STEP, 20, 0 }, { TYPE_STEP, 80, 0 },
                { TYPE_STEP, 45, 0 },
            }),
        },
    },

    init = function(self)
        restoreRuntime(self)
        return {
            inputs = {
                kGate, -- Type: Gate, Synced: true, Division: 1/4
                kCV,   -- Type: Sine LFO, Synced: true, Division: 2 bars
                kCV,   -- Type: Triangle LFO, Synced: true, Division: 2 bars
                kCV,   -- Type: Sine LFO, Synced: true, Division: 4 bars
                kCV,   -- Type: Triangle LFO, Synced: true, Division: 4 bars
                kCV,   -- Type: Sine LFO, Synced: true, Division: 1 bar
                kCV,   -- Type: Triangle LFO, Synced: true, Division: 1 bar
                kCV,   -- Type: Sine LFO, Synced: true, Division: 2 bars
                kCV,   -- Type: Triangle LFO, Synced: true, Division: 2 bars
            },
            inputNames = {
                "Gate", "S1 CV", "S2 CV", "S3 CV", "S4 CV",
                "S5 CV", "S6 CV", "S7 CV", "S8 CV",
            },
            outputs = {
                kLinear, -- Type: Synth Note
                kLinear, -- Type: Off
                kLinear, -- Type: Off
                kLinear, -- Type: Off
                kLinear, -- Type: Off
                kLinear, -- Type: Off
                kLinear, -- Type: Off
                kLinear, -- Type: Off
                kLinear, -- Type: Off
            },
            outputNames = {
                "Envelope", "S1 Activity", "S2 Activity", "S3 Activity",
                "S4 Activity", "S5 Activity", "S6 Activity", "S7 Activity",
                "S8 Activity",
            },
            parameters = {
                { "Stages", 1, 8, 4, kNone },
                { "Loop start", { "Off", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8" }, 4 },
                { "Loop end", 1, 8, 3, kNone },
                { "S1 Type", { "Ramp", "Step", "Hold" }, TYPE_RAMP },
                { "S1 Primary", 0, 100, 30, kPercent },
                { "S1 Secondary", -100, 100, -25, kPercent },
                { "S2 Type", { "Ramp", "Step", "Hold" }, TYPE_RAMP },
                { "S2 Primary", 0, 100, 45, kPercent },
                { "S2 Secondary", -100, 100, 25, kPercent },
                { "S3 Type", { "Ramp", "Step", "Hold" }, TYPE_HOLD },
                { "S3 Primary", 0, 100, 60, kPercent },
                { "S3 Secondary", -100, 100, -40, kPercent },
                { "S4 Type", { "Ramp", "Step", "Hold" }, TYPE_RAMP },
                { "S4 Primary", 0, 100, 55, kPercent },
                { "S4 Secondary", -100, 100, 20, kPercent },
                { "S5 Type", { "Ramp", "Step", "Hold" }, TYPE_RAMP },
                { "S5 Primary", 0, 100, 50, kPercent },
                { "S5 Secondary", -100, 100, 0, kPercent },
                { "S6 Type", { "Ramp", "Step", "Hold" }, TYPE_RAMP },
                { "S6 Primary", 0, 100, 50, kPercent },
                { "S6 Secondary", -100, 100, 0, kPercent },
                { "S7 Type", { "Ramp", "Step", "Hold" }, TYPE_RAMP },
                { "S7 Primary", 0, 100, 50, kPercent },
                { "S7 Secondary", -100, 100, 0, kPercent },
                { "S8 Type", { "Ramp", "Step", "Hold" }, TYPE_RAMP },
                { "S8 Primary", 0, 100, 50, kPercent },
                { "S8 Secondary", -100, 100, 0, kPercent },
            },
        }
    end,

    gate = function(self, input, rising)
        if input ~= INPUT_GATE then return outputValues(self) end
        gateHigh = rising
        if rising then
            if activeStage > 0 and stageType(self, activeStage) == TYPE_STEP then
                currentLevel = targetLevel
                advanceStage(self)
                if activeStage == 0 and stageCount(self) == 1 then activateStage(self, 1) end
            else
                activateStage(self, 1)
            end
        else
            local loopFirst, loopLast = loopBounds(self)
            if loopFirst and loopLast and activeStage >= loopFirst and activeStage <= loopLast
                and loopLast < stageCount(self)
                and not loopContainsStep(self, loopFirst, loopLast) then
                activateStage(self, loopLast + 1)
            end
        end
        return outputValues(self)
    end,

    step = function(self, dt, inputs)
        for index = 1, MAX_STAGES + 1 do latestInputs[index] = inputs[index] or 0 end
        processEnvelope(self, dt)
        return outputValues(self)
    end,

    serialise = function(self)
        return {
            activeStage = activeStage,
            currentLevel = currentLevel,
            startLevel = startLevel,
            targetLevel = targetLevel,
            elapsed = elapsed,
            segmentDuration = segmentDuration,
            gateHigh = gateHigh,
        }
    end,

    draw = function(self)
        drawText(4, 7, "STAGES", 15)
        drawTinyText(55, 6, gateHigh and "GATE HIGH" or "GATE LOW", gateHigh and 15 or 6)
        if activeStage > 0 then
            drawTinyText(120, 6, TYPE_NAMES[stageType(self, activeStage)] .. " " .. activeStage, 10)
        else
            drawTinyText(120, 6, "IDLE", 5)
        end
        drawText(252, 7, string.format("%+.2fV", currentLevel), 12, "right")
        drawEnvelope(self)
        return true
    end,
}
