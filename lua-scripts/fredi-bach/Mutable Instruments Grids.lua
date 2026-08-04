-- Mutable Instruments Grids
-- Six-output Disting NT recreation of the topographic drum sequencer.
--
-- This adaptation preserves the original 5x5 rhythm map, bilinear pattern
-- interpolation, density thresholds, accents, per-pattern chaos, Euclidean
-- mode, clock resolutions, swing, and alternate ACC/CLK/RST output layout.
-- Inputs 1/2 are clock and reset. Inputs 3-6 add 0-5 V CV to Map X, Map Y,
-- Chaos, and all three Fill controls, matching the original normalized CVs.
--
-- Copyright 2011, 2012 Emilie Gillet.
-- Disting NT adaptation copyright 2026 Fredi Bach.
-- SPDX-License-Identifier: GPL-3.0-or-later
--
-- This program is free software: you can redistribute it and/or modify it
-- under the terms of the GNU General Public License as published by the Free
-- Software Foundation, either version 3 of the License, or (at your option)
-- any later version.
--
-- This program is distributed in the hope that it will be useful, but WITHOUT
-- ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
-- FITNESS FOR A PARTICULAR PURPOSE. See <https://www.gnu.org/licenses/>.
--
-- Based on upstream revision 08460a69a7e1f7a81c5a2abcc7189c9a6b7208d4:
-- https://github.com/pichenettes/eurorack/tree/08460a69a7e1f7a81c5a2abcc7189c9a6b7208d4/grids

local resources = require 'MutableGridsData'

local P_CLOCK = 1
local P_BPM = 2
local P_RESOLUTION = 3
local P_MODE = 4
local P_SIGNAL = 5
local P_LAYOUT = 6
local P_SWING = 7
local P_MAP_X = 8
local P_MAP_Y = 9
local P_CHAOS = 10
local P_BD_FILL = 11
local P_SD_FILL = 12
local P_HH_FILL = 13

local CLOCK_INTERNAL = 1
local CLOCK_EXTERNAL = 2
local MODE_GRIDS = 1
local MODE_EUCLIDEAN = 2
local SIGNAL_TRIGGER = 1
local SIGNAL_GATE = 2
local LAYOUT_INDIVIDUAL = 1
local LAYOUT_ALTERNATE = 2
local SWING_ON = 2

local INPUT_CLOCK = 1
local INPUT_RESET = 2
local INPUT_X_CV = 3
local INPUT_Y_CV = 4
local INPUT_CHAOS_CV = 5
local INPUT_FILL_CV = 6

local OUTPUT_BD = 1
local OUTPUT_SD = 2
local OUTPUT_HH = 3
local OUTPUT_AUX_1 = 4
local OUTPUT_AUX_2 = 5
local OUTPUT_AUX_3 = 6

local OUTPUT_COUNT = 6
local STEPS_PER_PATTERN = 32
local PULSES_PER_STEP = 3
local PULSE_SECONDS = 0.001
local OUTPUT_HIGH = 5
local PPQN = { 4, 8, 24 }
local TICK_INCREMENT = { 6, 3, 1 }
local DEFAULTS = {
    CLOCK_INTERNAL, 120, 3, MODE_GRIDS, SIGNAL_TRIGGER,
    LAYOUT_INDIVIDUAL, 1, 50, 50, 0, 50, 50, 50,
}

-- The upstream array is indexed first by X and then by Y.
local DRUM_MAP = {
    { 11, 9, 1, 10, 12 },
    { 16, 8, 14, 13, 7 },
    { 19, 15, 5, 6, 4 },
    { 24, 17, 22, 2, 3 },
    { 25, 20, 18, 21, 23 },
}

local stepIndex
local pulseIndex
local euclideanSteps
local perturbation
local outputHigh
local pulseRemaining
local internalRemaining
local internalGateRemaining
local pendingExternalClock
local lastClockMode
local latestInputs
local controls

local function clamp(value, minimum, maximum)
    return math.max(minimum, math.min(maximum, value))
end

local function parameter(self, index)
    local values = self.parameters
    return values and values[index] or DEFAULTS[index]
end

local function percentToByte(value)
    return math.floor(clamp(value, 0, 100) * 2.55 + 0.5)
end

local function controlByte(self, parameterIndex, inputIndex)
    local cv = latestInputs[inputIndex] or 0
    return percentToByte(parameter(self, parameterIndex) + cv * 20)
end

local function refreshControls(self, inputs)
    latestInputs = inputs or latestInputs
    local commonFill = (latestInputs[INPUT_FILL_CV] or 0) * 20
    controls.x = controlByte(self, P_MAP_X, INPUT_X_CV)
    controls.y = controlByte(self, P_MAP_Y, INPUT_Y_CV)
    controls.chaos = controlByte(self, P_CHAOS, INPUT_CHAOS_CV)
    controls.density[1] = percentToByte(parameter(self, P_BD_FILL) + commonFill)
    controls.density[2] = percentToByte(parameter(self, P_SD_FILL) + commonFill)
    controls.density[3] = percentToByte(parameter(self, P_HH_FILL) + commonFill)
end

-- Exact avrlib U8Mix behavior: weights sum to 255 and the low byte is dropped.
local function u8Mix(a, b, balance)
    return math.floor((a * (255 - balance) + b * balance) / 256)
end

local function readDrumMap(step, instrument, x, y)
    local i = math.floor(x / 64)
    local j = math.floor(y / 64)
    local xBalance = (x % 64) * 4
    local yBalance = (y % 64) * 4
    local offset = instrument * STEPS_PER_PATTERN + step + 1
    local a = resources.nodes[DRUM_MAP[i + 1][j + 1]][offset]
    local b = resources.nodes[DRUM_MAP[i + 2][j + 1]][offset]
    local c = resources.nodes[DRUM_MAP[i + 1][j + 2]][offset]
    local d = resources.nodes[DRUM_MAP[i + 2][j + 2]][offset]
    return u8Mix(
        u8Mix(a, b, xBalance),
        u8Mix(c, d, xBalance),
        yBalance
    )
end

local function euclideanPattern(length, density)
    return resources.euclidean[(length - 1) * 32 + density + 1]
end

local function resetOutputs()
    for output = 1, OUTPUT_COUNT do
        outputHigh[output] = false
        pulseRemaining[output] = 0
    end
    internalGateRemaining = 0
end

local function outputVoltages()
    local outputs = {}
    for output = 1, OUTPUT_COUNT do
        outputs[output] = outputHigh[output] and OUTPUT_HIGH or 0
    end
    return outputs
end

local function fire(self, output)
    outputHigh[output] = true
    if parameter(self, P_SIGNAL) == SIGNAL_TRIGGER then
        pulseRemaining[output] = PULSE_SECONDS
    end
end

local function randomizePerturbation(self)
    local randomness = parameter(self, P_SWING) == SWING_ON and 0
        or math.floor(controls.chaos / 4)
    for instrument = 1, 3 do
        perturbation[instrument] = math.floor(
            math.random(0, 255) * randomness / 256
        )
    end
end

local function evaluateDrums(self)
    if stepIndex == 0 then randomizePerturbation(self) end

    local accents = { false, false, false }
    for instrument = 1, 3 do
        local level = math.min(
            255,
            readDrumMap(stepIndex, instrument - 1, controls.x, controls.y)
                + perturbation[instrument]
        )
        if level > 255 - controls.density[instrument] then
            fire(self, instrument)
            accents[instrument] = level > 192
        end
    end

    if parameter(self, P_LAYOUT) == LAYOUT_ALTERNATE then
        if accents[1] or accents[2] or accents[3] then
            fire(self, OUTPUT_AUX_1)
        end
        if stepIndex == 0 then fire(self, OUTPUT_AUX_3) end
    else
        for instrument = 1, 3 do
            if accents[instrument] then fire(self, instrument + 3) end
        end
    end
end

local function evaluateEuclidean(self)
    if (stepIndex & 1) ~= 0 then return end

    local resets = { false, false, false }
    local lengths = {
        math.floor(controls.x / 8) + 1,
        math.floor(controls.y / 8) + 1,
        math.floor(controls.chaos / 8) + 1,
    }
    for instrument = 1, 3 do
        local length = lengths[instrument]
        while euclideanSteps[instrument] >= length do
            euclideanSteps[instrument] = euclideanSteps[instrument] - length
        end
        local density = math.floor(controls.density[instrument] / 8)
        local pattern = euclideanPattern(length, density)
        if (pattern & (1 << euclideanSteps[instrument])) ~= 0 then
            fire(self, instrument)
        end
        resets[instrument] = euclideanSteps[instrument] == 0
    end

    if parameter(self, P_LAYOUT) == LAYOUT_ALTERNATE then
        if resets[1] or resets[2] or resets[3] then
            fire(self, OUTPUT_AUX_1)
        end
        if resets[1] and resets[2] and resets[3] then
            fire(self, OUTPUT_AUX_3)
        end
    else
        for instrument = 1, 3 do
            if resets[instrument] then fire(self, instrument + 3) end
        end
    end
end

local function evaluate(self)
    resetOutputs()
    if parameter(self, P_LAYOUT) == LAYOUT_ALTERNATE then
        fire(self, OUTPUT_AUX_2)
    end
    if pulseIndex ~= 0 then return end

    if parameter(self, P_MODE) == MODE_EUCLIDEAN then
        evaluateEuclidean(self)
    else
        evaluateDrums(self)
    end
end

local function tickClock(self, increment)
    evaluate(self)
    pulseIndex = pulseIndex + increment
    while pulseIndex >= PULSES_PER_STEP do
        pulseIndex = pulseIndex - PULSES_PER_STEP
        if (stepIndex & 1) == 0 then
            for instrument = 1, 3 do
                euclideanSteps[instrument] = euclideanSteps[instrument] + 1
            end
        end
        stepIndex = (stepIndex + 1) % STEPS_PER_PATTERN
    end
end

local function resetPattern()
    stepIndex = 0
    pulseIndex = 0
    euclideanSteps = { 0, 0, 0 }
    perturbation = { 0, 0, 0 }
    pendingExternalClock = false
    resetOutputs()
end

local function internalInterval(self)
    local resolution = parameter(self, P_RESOLUTION)
    local interval = 60 / parameter(self, P_BPM) / PPQN[resolution]
    if parameter(self, P_MODE) == MODE_GRIDS
        and parameter(self, P_SWING) == SWING_ON then
        local amount = math.floor(controls.chaos * 43 / 256) / 128
        local direction = (stepIndex & 2) == 0 and 1 or -1
        interval = interval * (1 + amount * direction)
    end
    return interval
end

local function expireTimedOutputs(self, dt)
    if parameter(self, P_SIGNAL) == SIGNAL_TRIGGER then
        for output = 1, OUTPUT_COUNT do
            if pulseRemaining[output] > 0 then
                pulseRemaining[output] = pulseRemaining[output] - dt
                if pulseRemaining[output] <= 0 then outputHigh[output] = false end
            end
        end
    elseif parameter(self, P_CLOCK) == CLOCK_INTERNAL
        and internalGateRemaining > 0 then
        internalGateRemaining = internalGateRemaining - dt
        if internalGateRemaining <= 0 then resetOutputs() end
    end
end

local function advanceInternalClock(self, dt)
    local clockMode = parameter(self, P_CLOCK)
    if clockMode ~= lastClockMode then
        internalRemaining = 0
        lastClockMode = clockMode
        resetOutputs()
    end
    if clockMode ~= CLOCK_INTERNAL then return end

    internalRemaining = internalRemaining - dt
    while internalRemaining <= 0 do
        local interval = internalInterval(self)
        tickClock(self, TICK_INCREMENT[parameter(self, P_RESOLUTION)])
        internalRemaining = internalRemaining + interval
        if parameter(self, P_SIGNAL) == SIGNAL_GATE then
            internalGateRemaining = interval * 0.5
        end
    end
end

local function laneLevel(self, instrument, displayStep)
    if parameter(self, P_MODE) == MODE_GRIDS then
        local level = math.min(
            255,
            readDrumMap(displayStep, instrument - 1, controls.x, controls.y)
                + perturbation[instrument]
        )
        if level <= 255 - controls.density[instrument] then return 0 end
        return level > 192 and 15 or 8
    end

    if (displayStep & 1) ~= 0 then return 0 end
    local lengths = {
        math.floor(controls.x / 8) + 1,
        math.floor(controls.y / 8) + 1,
        math.floor(controls.chaos / 8) + 1,
    }
    local euclideanStep = math.floor(displayStep / 2) % lengths[instrument]
    local density = math.floor(controls.density[instrument] / 8)
    local pattern = euclideanPattern(lengths[instrument], density)
    return (pattern & (1 << euclideanStep)) ~= 0 and 12 or 0
end

local function drawMap()
    drawBox(4, 15, 50, 61, 5)
    for index = 1, 3 do
        local coordinate = 4 + index * 11.5
        drawLine(coordinate, 15, coordinate, 61, 2)
        drawLine(4, 15 + index * 11.5, 50, 15 + index * 11.5, 2)
    end
    local x = 5 + controls.x / 255 * 44
    local y = 16 + controls.y / 255 * 44
    drawRectangle(x - 1, y - 1, x + 1, y + 1, 15)
end

local function drawLanes(self)
    local names = { "BD", "SD", "HH" }
    for instrument = 1, 3 do
        local top = 13 + (instrument - 1) * 17
        drawTinyText(55, top + 6, names[instrument], 10)
        for displayStep = 0, STEPS_PER_PATTERN - 1 do
            local left = 72 + displayStep * 5
            local shade = laneLevel(self, instrument, displayStep)
            if shade > 0 then
                drawRectangle(left, top, left + 3, top + 7, shade)
            elseif displayStep % 2 == 0 then
                drawRectangle(left, top + 5, left + 3, top + 7, 2)
            end
            if displayStep == stepIndex then
                drawBox(left - 1, top - 1, left + 4, top + 8, 15)
            end
        end
    end
end

return {
    name = 'MI Grids',
    author = 'Fredi Bach / Emilie Gillet',

    -- Luading simulator extension; ignored by Disting NT.
    luading = {
        parameterPresets = {
            {
                name = 'Topographic',
                values = { 1, 120, 3, 1, 1, 1, 1, 50, 50, 0, 50, 50, 50 },
            },
            {
                name = 'Four on Floor',
                values = { 1, 120, 3, 1, 1, 1, 1, 35, 45, 0, 65, 50, 35 },
            },
            {
                name = 'Breakbeat',
                values = { 1, 138, 3, 1, 1, 1, 1, 75, 70, 30, 55, 65, 80 },
            },
            {
                name = 'Swung',
                values = { 1, 105, 3, 1, 1, 1, 2, 20, 80, 55, 55, 45, 70 },
            },
            {
                name = 'Euclidean',
                values = { 1, 120, 3, 2, 1, 1, 1, 47, 35, 19, 13, 16, 13 },
            },
            {
                name = 'External 8 PPQN',
                values = { 2, 120, 2, 1, 2, 2, 1, 50, 50, 0, 50, 50, 50 },
            },
        },
    },

    init = function(_self)
        outputHigh = { false, false, false, false, false, false }
        pulseRemaining = { 0, 0, 0, 0, 0, 0 }
        latestInputs = { 0, 0, 0, 0, 0, 0 }
        controls = { x = 128, y = 128, chaos = 0, density = { 128, 128, 128 } }
        internalRemaining = 0
        internalGateRemaining = 0
        pendingExternalClock = false
        lastClockMode = CLOCK_INTERNAL
        stepIndex = 0
        pulseIndex = 0
        euclideanSteps = { 0, 0, 0 }
        perturbation = { 0, 0, 0 }

        return {
            inputs = {
                kGate,    -- Type: Gate, Synced: true, Division: 1/16
                kTrigger, -- Type: Trigger, Synced: true, Division: 1 bar
                kCV,      -- Type: Manual / DC
                kCV,      -- Type: Manual / DC
                kCV,      -- Type: Manual / DC
                kCV,      -- Type: Manual / DC
            },
            inputNames = { "Clock", "Reset", "Map X", "Map Y", "Chaos", "Fill" },
            outputs = {
                kStepped, -- Type: Kick Trigger
                kStepped, -- Type: Snare Trigger
                kStepped, -- Type: Hi-hat Trigger
                kStepped, -- Type: Kick Trigger
                kStepped, -- Type: Snare Trigger
                kStepped, -- Type: Hi-hat Trigger
            },
            outputNames = { "BD", "SD", "HH", "ACC 1 / ACC", "ACC 2 / CLK", "ACC 3 / RST" },
            parameters = {
                { "Clock", { "Internal", "External" }, CLOCK_INTERNAL },
                { "BPM", 40, 240, 120, kBPM },
                { "Resolution", { "4 PPQN", "8 PPQN", "24 PPQN" }, 3 },
                { "Mode", { "Grids", "Euclidean" }, MODE_GRIDS },
                { "Signal", { "Triggers", "Gates" }, SIGNAL_TRIGGER },
                { "Aux layout", { "ACC 1/2/3", "ACC/CLK/RST" }, LAYOUT_INDIVIDUAL },
                { "Swing", { "Off", "On" }, 1 },
                { "Map X / Len 1", 0, 100, 50, kPercent },
                { "Map Y / Len 2", 0, 100, 50, kPercent },
                { "Chaos / Len 3", 0, 100, 0, kPercent },
                { "BD Fill", 0, 100, 50, kPercent },
                { "SD Fill", 0, 100, 50, kPercent },
                { "HH Fill", 0, 100, 50, kPercent },
            },
        }
    end,

    step = function(self, dt, inputs)
        refreshControls(self, inputs)
        expireTimedOutputs(self, dt)
        advanceInternalClock(self, dt)

        if pendingExternalClock and parameter(self, P_CLOCK) == CLOCK_EXTERNAL then
            pendingExternalClock = false
            tickClock(self, TICK_INCREMENT[parameter(self, P_RESOLUTION)])
        else
            pendingExternalClock = false
        end
        return outputVoltages()
    end,

    trigger = function(_self, input)
        if input == INPUT_RESET then resetPattern() end
        return outputVoltages()
    end,

    gate = function(self, input, rising)
        if input ~= INPUT_CLOCK then return outputVoltages() end
        if rising then
            pendingExternalClock = true
        elseif parameter(self, P_CLOCK) == CLOCK_EXTERNAL
            and parameter(self, P_SIGNAL) == SIGNAL_GATE then
            resetOutputs()
        end
        return outputVoltages()
    end,

    draw = function(self)
        drawText(4, 10, "GRIDS", 15)
        local mode = parameter(self, P_MODE) == MODE_GRIDS and "MAP" or "EUC"
        local clock = parameter(self, P_CLOCK) == CLOCK_INTERNAL
            and string.format("%d BPM", parameter(self, P_BPM))
            or PPQN[parameter(self, P_RESOLUTION)] .. " PPQN"
        drawTinyText(252, 8, mode .. "  " .. clock, 10, "right")
        drawMap()
        drawLanes(self)
        return true
    end,
}
