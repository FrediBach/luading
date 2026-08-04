-- Mutable Instruments Marbles
-- A control-rate Disting NT recreation of Marbles' looping random rhythms and voltages.
--
-- Independently written from the behavior documented in the Mutable Instruments
-- Marbles manual and informed by the MIT-licensed firmware by Emilie Gillet:
-- https://pichenettes.github.io/mutable-instruments-documentation/modules/marbles/manual/
-- https://github.com/pichenettes/eurorack/tree/master/marbles
--
-- Disting adaptation:
--   Inputs 1/2 are explicit t/X clock triggers and input 3 resets sequence
--   positions. Inputs 4-10 modulate the panel-style controls; input 11 is the
--   sampled voltage for external processing mode. Outputs are t1, t2, t3,
--   X1, X2, X3, and Y. Trigger outputs use +5 V.
--
-- The script preserves the central musical model: a jittered master clock,
-- complementary/ratio/drum t modes, independently clocked X channels, voltage
-- distribution shaping, slew/quantization, and 1-16 decision deja-vu loops.
-- It runs at Disting's 1 ms Lua cadence, so it does not reproduce Marbles'
-- sample-rate ramp extraction, analogue I/O, hardware entropy, or exact DSP.
--
-- Copyright 2015 Emilie Gillet.
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

local INPUT_T_CLOCK = 1
local INPUT_X_CLOCK = 2
local INPUT_RESET = 3
local INPUT_DEJA_CV = 4
local INPUT_RATE_CV = 5
local INPUT_T_BIAS_CV = 6
local INPUT_JITTER_CV = 7
local INPUT_SPREAD_CV = 8
local INPUT_X_BIAS_CV = 9
local INPUT_STEPS_CV = 10
local INPUT_EXTERNAL_CV = 11

local OUTPUT_T1 = 1
local OUTPUT_T2 = 2
local OUTPUT_T3 = 3
local OUTPUT_X1 = 4
local OUTPUT_X2 = 5
local OUTPUT_X3 = 6
local OUTPUT_Y = 7

local P_CLOCK = 1
local P_RATE = 2
local P_RATE_RANGE = 3
local P_JITTER = 4
local P_T_BIAS = 5
local P_T_MODE = 6
local P_GATE_LENGTH = 7
local P_GATE_VARIATION = 8
local P_T_DEJA = 9
local P_X_CLOCK = 10
local P_X_RANGE = 11
local P_SPREAD = 12
local P_X_BIAS = 13
local P_STEPS = 14
local P_X_MODE = 15
local P_X_DEJA = 16
local P_DEJA = 17
local P_LENGTH = 18
local P_EXTERNAL_PROCESS = 19
local P_Y_DIVISION = 20
local P_Y_SPREAD = 21
local P_Y_BIAS = 22
local P_Y_STEPS = 23

local CLOCK_INTERNAL = 1
local CLOCK_INPUT = 2
local T_MODE_COIN = 1
local T_MODE_RATIOS = 2
local T_MODE_DRUMS = 3
local X_CLOCK_STREAMS = 1
local X_CLOCK_T2 = 2
local X_CLOCK_INPUT = 3
local X_MODE_SAME = 1
local X_MODE_OPPOSED = 2
local X_MODE_TILT = 3
local SWITCH_OFF = 1
local SWITCH_ON = 2

local LOOP_SIZE = 16
local GATE_VOLTAGE = 5
local RATE_RANGE_MULTIPLIERS = { 0.25, 1, 4 }
local Y_DIVISIONS = { 64, 32, 16, 8, 4, 2, 1 }
local T_MODE_NAMES = { "COIN", "RATIO", "DRUM" }
local X_CLOCK_NAMES = { "STREAM", "T2", "INPUT" }

local DEFAULT_PARAMETERS = {
    CLOCK_INTERNAL, 120, 2, 0, 0, T_MODE_COIN, 50, 0, SWITCH_ON,
    X_CLOCK_STREAMS, 2, 70, 0, 0, X_MODE_SAME, SWITCH_ON,
    -100, 8, SWITCH_OFF, 3, 70, 0, -80,
}

-- Independently authored kick/snare-like pairs for the DRUM t mode. Values
-- are bit masks: bit 1 fires t1 and bit 2 fires t3.
local DRUM_PATTERNS = {
    { 1, 0, 0, 0, 3, 0, 0, 0 },
    { 1, 0, 1, 0, 2, 0, 1, 0 },
    { 1, 0, 0, 1, 2, 0, 1, 0 },
    { 1, 2, 1, 0, 2, 0, 1, 2 },
    { 3, 0, 1, 2, 3, 1, 2, 1 },
}

local tSequence
local xSequences
local pulseRemaining
local pendingTEvents
local outputBuffer
local latestInputs
local xCurrent
local xTarget
local yCurrent
local yTarget
local yClockCount
local tTimeUntilTick
local masterPeriod
local masterCount
local drumStep
local lastTDecision
local clockFlash
local xFlash
local resetFlash

local function clamp(value, minimum, maximum)
    return math.max(minimum, math.min(maximum, value))
end

local function round(value)
    if value >= 0 then return math.floor(value + 0.5) end
    return math.ceil(value - 0.5)
end

local function parameter(self, index)
    if self.parameters and self.parameters[index] ~= nil then
        return self.parameters[index]
    end
    return DEFAULT_PARAMETERS[index]
end

local function sequenceValue(sequence, index)
    if sequence[0] ~= nil then return sequence[index - 1] end
    return sequence[index]
end

local function isIndexable(value)
    local valueType = type(value)
    return valueType == "table" or valueType == "userdata"
end

local function copyDecision(value)
    if type(value) ~= "table" then return value end
    local copy = {}
    for key, item in pairs(value) do copy[key] = item end
    return copy
end

local function freshTDecision()
    return {
        choice = math.random(),
        jitter = math.random() * 2 - 1,
        width1 = math.random() * 2 - 1,
        width3 = math.random() * 2 - 1,
        pattern = math.random(),
    }
end

local function freshXDecision(externalVoltage)
    return {
        a = math.random(),
        b = math.random(),
        external = externalVoltage or 0,
    }
end

local function newSequence(factory)
    local sequence = { loop = {}, writeHead = 1, step = 0 }
    for index = 1, LOOP_SIZE do sequence.loop[index] = factory() end
    return sequence
end

local function validTDecision(value)
    return isIndexable(value)
        and type(value.choice) == "number"
        and type(value.jitter) == "number"
        and type(value.width1) == "number"
        and type(value.width3) == "number"
        and type(value.pattern) == "number"
end

local function validXDecision(value)
    return isIndexable(value)
        and type(value.a) == "number"
        and type(value.b) == "number"
        and type(value.external) == "number"
end

local function restoreSequence(candidate, factory, validator)
    if not isIndexable(candidate)
        or not isIndexable(candidate.loop)
        or type(candidate.writeHead) ~= "number"
        or type(candidate.step) ~= "number"
        or candidate.writeHead < 1
        or candidate.writeHead > LOOP_SIZE
        or candidate.step < 0
        or candidate.step > LOOP_SIZE then
        return newSequence(factory)
    end

    local restored = {
        loop = {},
        writeHead = math.floor(candidate.writeHead),
        step = math.floor(candidate.step),
    }
    for index = 1, LOOP_SIZE do
        local value = sequenceValue(candidate.loop, index)
        if not validator(value) then return newSequence(factory) end
        restored.loop[index] = copyDecision(value)
    end
    return restored
end

-- Negative deja-vu values probabilistically replace the oldest decision,
-- zero walks a locked loop, and positive values probabilistically jump within
-- that loop. The squared response leaves a generous lock region around zero.
local function nextDecision(sequence, dejaVu, length, factory)
    length = clamp(round(length), 1, LOOP_SIZE)
    sequence.step = sequence.step % length
    local mutationProbability = (math.abs(dejaVu) / 100) ^ 2
    local mutate = math.random() < mutationProbability

    if mutate and dejaVu < 0 then
        local value = factory()
        sequence.loop[sequence.writeHead] = copyDecision(value)
        sequence.writeHead = (sequence.writeHead % LOOP_SIZE) + 1
        sequence.step = length
        return value
    end

    if mutate and dejaVu > 0 then
        sequence.step = math.random(1, length)
    else
        sequence.step = (sequence.step % length) + 1
    end

    local start = (sequence.writeHead - 1 - length) % LOOP_SIZE
    local index = ((start + sequence.step - 1) % LOOP_SIZE) + 1
    return copyDecision(sequence.loop[index])
end

local function effectiveDejaVu(self)
    local cv = latestInputs[INPUT_DEJA_CV] or 0
    return clamp(parameter(self, P_DEJA) + cv * 20, -100, 100)
end

local function effectiveRate(self)
    local cv = latestInputs[INPUT_RATE_CV] or 0
    local range = RATE_RANGE_MULTIPLIERS[parameter(self, P_RATE_RANGE)] or 1
    return clamp(parameter(self, P_RATE) * range * (2 ^ cv), 1, 2000)
end

local function effectiveTBias(self)
    return clamp(
        parameter(self, P_T_BIAS) + (latestInputs[INPUT_T_BIAS_CV] or 0) * 20,
        -100,
        100
    )
end

local function effectiveJitter(self)
    return clamp(
        parameter(self, P_JITTER) + (latestInputs[INPUT_JITTER_CV] or 0) * 20,
        0,
        100
    )
end

local function effectiveXControls(self, channel)
    local spread = clamp(
        parameter(self, P_SPREAD) + (latestInputs[INPUT_SPREAD_CV] or 0) * 20,
        0,
        100
    )
    local bias = clamp(
        parameter(self, P_X_BIAS) + (latestInputs[INPUT_X_BIAS_CV] or 0) * 20,
        -100,
        100
    )
    local steps = clamp(
        parameter(self, P_STEPS) + (latestInputs[INPUT_STEPS_CV] or 0) * 20,
        -100,
        100
    )

    local amount = 1
    local mode = parameter(self, P_X_MODE)
    if mode == X_MODE_OPPOSED then
        amount = channel == 2 and 1 or -1
    elseif mode == X_MODE_TILT then
        amount = channel - 2
    end

    return clamp(50 + (spread - 50) * amount, 0, 100),
        clamp(bias * amount, -100, 100),
        clamp(steps * amount, -100, 100)
end

local function shapeDistribution(decision, spread, bias)
    local bell = (decision.a + decision.b) * 0.5
    local value

    if spread <= 50 then
        value = 0.5 + (bell - 0.5) * (spread / 50)
    elseif spread <= 70 then
        local blend = (spread - 50) / 20
        value = bell + (decision.a - bell) * blend
    elseif spread < 100 then
        local amount = (spread - 70) / 30
        local centered = decision.a * 2 - 1
        local exponent = 1 - amount * 0.85
        value = 0.5 + 0.5 * (centered < 0 and -1 or 1)
            * (math.abs(centered) ^ exponent)
    else
        value = decision.a < 0.5 and 0 or 1
    end

    local skew = math.abs(bias) / 100
    if bias > 0 then
        value = 1 - ((1 - value) ^ (1 + skew * 4))
    elseif bias < 0 then
        value = value ^ (1 + skew * 4)
    end
    return clamp(value, 0, 1)
end

local function inScale(note, allowed)
    local pitchClass = note % 12
    if pitchClass < 0 then pitchClass = pitchClass + 12 end
    for index = 1, #allowed do
        if pitchClass == allowed[index] then return true end
    end
    return false
end

local function quantizeVoltage(voltage, amount)
    local allowed
    if amount <= 20 then
        allowed = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 }
    elseif amount <= 50 then
        allowed = { 0, 2, 4, 5, 7, 9, 11 }
    elseif amount <= 75 then
        allowed = { 0, 2, 4, 7, 9 }
    elseif amount <= 92 then
        allowed = { 0, 7 }
    else
        allowed = { 0 }
    end

    local target = voltage * 12
    local nearest = round(target)
    local best = nearest
    local bestDistance = math.huge
    for note = nearest - 12, nearest + 12 do
        if inScale(note, allowed) then
            local distance = math.abs(target - note)
            if distance < bestDistance then
                best = note
                bestDistance = distance
            end
        end
    end
    return best / 12
end

local function voltageRange(range)
    if range == 1 then return 0, 2 end
    if range == 3 then return -5, 5 end
    return 0, 5
end

local function mapXVoltage(self, channel, decision)
    local spread, bias, steps = effectiveXControls(self, channel)
    local voltage

    if parameter(self, P_EXTERNAL_PROCESS) == SWITCH_ON then
        local transposition = (spread / 100) * (bias / 100) * 5
        voltage = decision.external + transposition
    else
        local minimum, maximum = voltageRange(parameter(self, P_X_RANGE))
        voltage = minimum
            + shapeDistribution(decision, spread, bias) * (maximum - minimum)
        voltage = clamp(voltage, minimum, maximum)
    end

    if steps > 0 then voltage = quantizeVoltage(voltage, steps) end
    return voltage
end

local function mapYVoltage(self, decision)
    local spread = parameter(self, P_Y_SPREAD)
    local bias = parameter(self, P_Y_BIAS)
    local steps = parameter(self, P_Y_STEPS)
    local voltage = -5 + shapeDistribution(decision, spread, bias) * 10
    if steps > 0 then voltage = quantizeVoltage(voltage, steps) end
    return clamp(voltage, -5, 5)
end

local function smoothValue(current, target, steps, dt)
    if steps >= 0 then return target end
    local slewSeconds = 0.01 + ((-steps / 100) ^ 2) * 1.99
    local amount = clamp(dt / slewSeconds, 0, 1)
    return current + (target - current) * amount
end

local function clockY(self)
    yClockCount = yClockCount + 1
    local division = Y_DIVISIONS[parameter(self, P_Y_DIVISION)] or 16
    if yClockCount % division ~= 0 then return end
    yTarget = mapYVoltage(self, freshXDecision())
end

local function clockX(self, channel)
    local dejaVu = parameter(self, P_X_DEJA) == SWITCH_ON
        and effectiveDejaVu(self)
        or -100
    local externalVoltage = latestInputs[INPUT_EXTERNAL_CV] or 0
    local decision = nextDecision(
        xSequences[channel],
        dejaVu,
        parameter(self, P_LENGTH),
        function() return freshXDecision(externalVoltage) end
    )
    xTarget[channel] = mapXVoltage(self, channel, decision)
    xFlash[channel] = 0.10
    if channel == 2 then clockY(self) end
end

local function setTPulse(self, output, duration)
    pulseRemaining[output] = math.max(pulseRemaining[output], duration)
    clockFlash[output] = 0.10

    local xClock = parameter(self, P_X_CLOCK)
    if xClock == X_CLOCK_STREAMS then
        clockX(self, output)
    elseif xClock == X_CLOCK_T2 and output == OUTPUT_T2 then
        for channel = 1, 3 do clockX(self, channel) end
    end
end

local function variedGateLength(self, decisionValue, period)
    local mean = parameter(self, P_GATE_LENGTH) / 100
    local variation = parameter(self, P_GATE_VARIATION) / 100
    local width = clamp(mean + decisionValue * variation * 0.49, 0.01, 0.99)
    return math.max(0.001, period * width)
end

local function queueTPulse(self, output, delay, duration)
    if delay <= 0 then
        setTPulse(self, output, duration)
    else
        pendingTEvents[#pendingTEvents + 1] = {
            output = output,
            delay = delay,
            duration = duration,
        }
    end
end

local function ratioForBias(bias, reverse)
    local ratios = { 0.25, 1 / 3, 0.5, 1, 2, 3, 4 }
    local position = clamp(round((bias + 100) / 200 * 6) + 1, 1, 7)
    if reverse then position = 8 - position end
    return ratios[position]
end

local function scheduleRatioLane(self, output, ratio, widthValue, period)
    if ratio < 1 then
        local divisor = round(1 / ratio)
        if masterCount % divisor == 1 % divisor then
            queueTPulse(
                self,
                output,
                0,
                variedGateLength(self, widthValue, period * divisor)
            )
        end
        return
    end

    local multiplier = round(ratio)
    local subPeriod = period / multiplier
    for index = 0, multiplier - 1 do
        queueTPulse(
            self,
            output,
            index * subPeriod,
            variedGateLength(self, widthValue, subPeriod)
        )
    end
end

local function fireTMode(self, decision, period)
    local mode = parameter(self, P_T_MODE)
    local bias = effectiveTBias(self)
    if mode == T_MODE_COIN then
        local probabilityT1 = (bias + 100) / 200
        if decision.choice < probabilityT1 then
            setTPulse(self, OUTPUT_T1, variedGateLength(self, decision.width1, period))
        else
            setTPulse(self, OUTPUT_T3, variedGateLength(self, decision.width3, period))
        end
    elseif mode == T_MODE_RATIOS then
        scheduleRatioLane(
            self,
            OUTPUT_T1,
            ratioForBias(bias, false),
            decision.width1,
            period
        )
        scheduleRatioLane(
            self,
            OUTPUT_T3,
            ratioForBias(bias, true),
            decision.width3,
            period
        )
    else
        drumStep = (drumStep % 8) + 1
        local density = math.abs(bias) / 100
        local patternIndex = clamp(
            1 + math.floor((decision.pattern * 0.35 + density * 0.65) * #DRUM_PATTERNS),
            1,
            #DRUM_PATTERNS
        )
        local mask = DRUM_PATTERNS[patternIndex][drumStep]
        if bias < -50 and mask == 3 then mask = 1 end
        if bias > 50 and mask == 3 then mask = 2 end
        if mask % 2 == 1 then
            setTPulse(self, OUTPUT_T1, variedGateLength(self, decision.width1, period))
        end
        if mask >= 2 then
            setTPulse(self, OUTPUT_T3, variedGateLength(self, decision.width3, period))
        end
    end
end

local function masterTick(self)
    local dejaVu = parameter(self, P_T_DEJA) == SWITCH_ON
        and effectiveDejaVu(self)
        or -100
    local decision = nextDecision(
        tSequence,
        dejaVu,
        parameter(self, P_LENGTH),
        freshTDecision
    )
    lastTDecision = decision
    masterCount = masterCount + 1
    local straightPeriod = 60 / effectiveRate(self)
    local jitter = effectiveJitter(self) / 100
    -- This bounded error-correcting approximation captures the manual's
    -- lag/catch-up feel without claiming the firmware's sample-rate DSP.
    masterPeriod = straightPeriod * clamp(1 + decision.jitter * jitter * 0.45, 0.2, 2)
    setTPulse(self, OUTPUT_T2, masterPeriod * 0.5)
    fireTMode(self, decision, masterPeriod)
    return masterPeriod
end

local function processPendingTEvents(self, dt)
    for index = #pendingTEvents, 1, -1 do
        local event = pendingTEvents[index]
        event.delay = event.delay - dt
        if event.delay <= 0 then
            setTPulse(self, event.output, event.duration)
            table.remove(pendingTEvents, index)
        end
    end
end

local function resetPositions()
    tSequence.step = 0
    for channel = 1, 3 do xSequences[channel].step = 0 end
    tTimeUntilTick = 0
    masterCount = 0
    drumStep = 0
    yClockCount = 0
    pendingTEvents = {}
    resetFlash = 0.2
end

local function initializeState(self)
    math.randomseed(os.time())
    local restored = isIndexable(self.state) and self.state or nil
    tSequence = restoreSequence(
        restored and restored.tSequence,
        freshTDecision,
        validTDecision
    )
    xSequences = {}
    for channel = 1, 3 do
        local candidate = restored
            and isIndexable(restored.xSequences)
            and sequenceValue(restored.xSequences, channel)
            or nil
        xSequences[channel] = restoreSequence(
            candidate,
            freshXDecision,
            validXDecision
        )
    end

    pulseRemaining = { 0, 0, 0 }
    pendingTEvents = {}
    outputBuffer = { 0, 0, 0, 0, 0, 0, 0 }
    latestInputs = { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 }
    xCurrent = { 0, 0, 0 }
    xTarget = { 0, 0, 0 }
    yCurrent = restored and type(restored.yCurrent) == "number"
        and clamp(restored.yCurrent, -5, 5)
        or 0
    yTarget = restored and type(restored.yTarget) == "number"
        and clamp(restored.yTarget, -5, 5)
        or 0
    yClockCount = 0
    tTimeUntilTick = 0
    masterPeriod = 0.5
    masterCount = 0
    drumStep = 0
    lastTDecision = freshTDecision()
    clockFlash = { 0, 0, 0 }
    xFlash = { 0, 0, 0 }
    resetFlash = 0
end

local function copySequenceState(sequence)
    local loop = {}
    for index = 1, LOOP_SIZE do loop[index] = copyDecision(sequence.loop[index]) end
    return {
        loop = loop,
        writeHead = sequence.writeHead,
        step = sequence.step,
    }
end

return {
    name = "Mutable Instruments Marbles",
    author = "Luading",

    -- Luading simulator extension; ignored by Disting NT.
    luading = {
        parameterPresets = {
            {
                name = "Classic Random",
                values = {
                    1, 120, 2, 0, 0, 1, 50, 0, 2,
                    1, 2, 70, 0, 0, 1, 2, -100, 8, 1, 3, 70, 0, -80,
                },
            },
            {
                name = "Locked Melody",
                values = {
                    1, 100, 2, 5, 0, 1, 35, 10, 2,
                    2, 1, 55, -20, 65, 1, 2, 0, 8, 1, 3, 60, 0, -60,
                },
            },
            {
                name = "Mutating Drums",
                values = {
                    1, 128, 2, 18, 35, 3, 18, 35, 2,
                    1, 2, 85, 10, 0, 3, 2, -35, 7, 1, 4, 75, 0, -90,
                },
            },
            {
                name = "External Shift",
                values = {
                    2, 120, 2, 0, 0, 1, 50, 0, 1,
                    3, 3, 70, 0, 25, 1, 2, 0, 4, 2, 3, 70, 0, -80,
                },
            },
        },
    },

    init = function(self)
        initializeState(self)
        return {
            inputs = {
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/4
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/4
                kTrigger, -- Type: Trigger, Synced: true, Division: 1 bar
                kCV,      -- Type: Sine LFO, Synced: true, Division: 2 bars
                kCV,      -- Type: Triangle LFO, Synced: true, Division: 2 bars
                kCV,      -- Type: Sine LFO, Synced: true, Division: 1 bar
                kCV,      -- Type: Triangle LFO, Synced: true, Division: 1 bar
                kCV,      -- Type: Sine LFO, Synced: true, Division: 2 bars
                kCV,      -- Type: Triangle LFO, Synced: true, Division: 2 bars
                kCV,      -- Type: Sine LFO, Synced: true, Division: 4 bars
                kCV,      -- Type: Note Sequencer (V/Oct), Synced: true, Division: 1/4
            },
            inputNames = {
                "t Clock", "X Clock", "Reset", "Deja CV", "Rate CV",
                "t Bias CV", "Jitter CV", "Spread CV", "X Bias CV",
                "Steps CV", "External CV",
            },
            outputs = {
                kStepped, -- Type: Kick Trigger
                kStepped, -- Type: Hi-hat Trigger
                kStepped, -- Type: Snare Trigger
                kLinear,  -- Type: Synth Note
                kLinear,  -- Type: Synth Note
                kLinear,  -- Type: Synth Note
                kLinear,  -- Type: Off
            },
            outputNames = { "t1", "t2", "t3", "X1", "X2", "X3", "Y" },
            parameters = {
                { "t Clock", { "Internal", "Input" }, CLOCK_INTERNAL },
                { "Rate", 10, 480, 120, kBPM },
                { "Rate range", { "/4", "1x", "4x" }, 2 },
                { "Jitter", 0, 100, 0, kPercent },
                { "t Bias", -100, 100, 0, kPercent },
                { "t Mode", { "Coin", "Ratios", "Drums" }, T_MODE_COIN },
                { "Gate length", 1, 99, 50, kPercent },
                { "Gate variation", 0, 100, 0, kPercent },
                { "t Deja vu", { "Off", "On" }, SWITCH_ON },
                { "X Clock", { "t streams", "t2 all", "Input" }, X_CLOCK_STREAMS },
                { "X Range", { "0-2V", "0-5V", "+/-5V" }, 2 },
                { "Spread", 0, 100, 70, kPercent },
                { "X Bias", -100, 100, 0, kPercent },
                { "Steps", -100, 100, 0, kPercent },
                { "X Mode", { "Same", "Opposed", "Tilt" }, X_MODE_SAME },
                { "X Deja vu", { "Off", "On" }, SWITCH_ON },
                { "Deja vu", -100, 100, -100, kPercent },
                { "Length", 1, 16, 8, kNone },
                { "External process", { "Off", "On" }, SWITCH_OFF },
                { "Y Division", { "/64", "/32", "/16", "/8", "/4", "/2", "1x" }, 3 },
                { "Y Spread", 0, 100, 70, kPercent },
                { "Y Bias", -100, 100, 0, kPercent },
                { "Y Steps", -100, 100, -80, kPercent },
            },
        }
    end,

    trigger = function(self, input)
        if input == INPUT_T_CLOCK and parameter(self, P_CLOCK) == CLOCK_INPUT then
            masterTick(self)
        elseif input == INPUT_X_CLOCK and parameter(self, P_X_CLOCK) == X_CLOCK_INPUT then
            for channel = 1, 3 do clockX(self, channel) end
        elseif input == INPUT_RESET then
            resetPositions()
        end

        for output = OUTPUT_T1, OUTPUT_T3 do
            outputBuffer[output] = pulseRemaining[output] > 0 and GATE_VOLTAGE or 0
        end
        for channel = 1, 3 do outputBuffer[channel + 3] = xCurrent[channel] end
        outputBuffer[OUTPUT_Y] = yCurrent
        return outputBuffer
    end,

    step = function(self, dt, inputs)
        for index = 1, 11 do latestInputs[index] = inputs[index] or 0 end

        for output = OUTPUT_T1, OUTPUT_T3 do
            pulseRemaining[output] = math.max(0, pulseRemaining[output] - dt)
            clockFlash[output] = math.max(0, clockFlash[output] - dt)
        end
        for channel = 1, 3 do xFlash[channel] = math.max(0, xFlash[channel] - dt) end
        resetFlash = math.max(0, resetFlash - dt)
        processPendingTEvents(self, dt)

        if parameter(self, P_CLOCK) == CLOCK_INTERNAL then
            tTimeUntilTick = tTimeUntilTick - dt
            local guard = 0
            while tTimeUntilTick <= 0 and guard < 8 do
                tTimeUntilTick = tTimeUntilTick + masterTick(self)
                guard = guard + 1
            end
        end

        for channel = 1, 3 do
            local _, _, steps = effectiveXControls(self, channel)
            xCurrent[channel] = smoothValue(xCurrent[channel], xTarget[channel], steps, dt)
        end
        yCurrent = smoothValue(yCurrent, yTarget, parameter(self, P_Y_STEPS), dt)

        for output = OUTPUT_T1, OUTPUT_T3 do
            outputBuffer[output] = pulseRemaining[output] > 0 and GATE_VOLTAGE or 0
        end
        for channel = 1, 3 do outputBuffer[channel + 3] = xCurrent[channel] end
        outputBuffer[OUTPUT_Y] = yCurrent
        return outputBuffer
    end,

    serialise = function(self)
        local xState = {}
        for channel = 1, 3 do xState[channel] = copySequenceState(xSequences[channel]) end
        return {
            tSequence = copySequenceState(tSequence),
            xSequences = xState,
            yCurrent = yCurrent,
            yTarget = yTarget,
        }
    end,

    draw = function(self)
        drawText(4, 7, "MARBLES", 15)
        local rateText = parameter(self, P_CLOCK) == CLOCK_INTERNAL
            and string.format("%d", round(effectiveRate(self)))
            or "EXT"
        drawText(220, 7, rateText, 10)

        drawText(4, 20, "t", 10)
        drawText(16, 20, T_MODE_NAMES[parameter(self, P_T_MODE)] or "?", 15)
        drawText(72, 20, string.format("B%+d", round(effectiveTBias(self))), 8)
        drawText(120, 20, string.format("J%d", round(effectiveJitter(self))), 8)
        drawText(166, 20, string.format("D%+d", round(effectiveDejaVu(self))), 8)
        drawText(224, 20, string.format("L%d", round(parameter(self, P_LENGTH))), 15)

        for output = 1, 3 do
            local x = 8 + (output - 1) * 24
            drawBox(x, 27, x + 14, 34, clockFlash[output] > 0 and 15 or 4, true)
            drawText(x + 4, 33, tostring(output), clockFlash[output] > 0 and 0 or 12)
        end
        if resetFlash > 0 then drawText(82, 33, "RESET", 15) end

        drawLine(0, 39, 255, 39, 4)
        drawText(4, 50, "X", 10)
        drawText(16, 50, X_CLOCK_NAMES[parameter(self, P_X_CLOCK)] or "?", 8)
        for channel = 1, 3 do
            local x = 82 + (channel - 1) * 57
            drawBox(x, 43, x + 51, 59, xFlash[channel] > 0 and 9 or 3, false)
            drawText(x + 3, 49, "X" .. channel, 10)
            drawText(x + 3, 57, string.format("%+.2f", xCurrent[channel]), 15)
        end
        return true
    end,
}
