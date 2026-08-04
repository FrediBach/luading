-- Buchla 266 Source of Uncertainty
-- A loose control-rate recreation of the classic fluctuating, quantized, and stored random voltages.
--
-- This independently authored Disting NT adaptation follows the functional
-- layout documented for the Buchla Model 266 Source of Uncertainty. It is not
-- a circuit model or source port. The original audio-rate noise sources,
-- integrator, and sample-and-hold utilities are intentionally omitted because
-- a Lua script running at the documented 1 ms control cadence cannot reproduce
-- their full behavior.
--
-- Inputs 1 and 2 clock the quantized and stored sections. Inputs 3-6 modulate
-- the two fluctuating rates, quantization amount, and stored distribution.
-- Outputs span 0-10 V except for the pitch-oriented quantized outputs: N+1 uses
-- one-volt intervals and 2^N uses semitone intervals.

local INPUT_QUANTIZED_PULSE = 1
local INPUT_STORED_PULSE = 2
local INPUT_RATE_A_CV = 3
local INPUT_RATE_B_CV = 4
local INPUT_QUANTIZATION_CV = 5
local INPUT_DISTRIBUTION_CV = 6

local OUTPUT_FLUCTUATING_A = 1
local OUTPUT_FLUCTUATING_B = 2
local OUTPUT_N_PLUS_ONE = 3
local OUTPUT_TWO_TO_N = 4
local OUTPUT_STORED_EQUAL = 5
local OUTPUT_STORED_WEIGHTED = 6

local P_RATE_A = 1
local P_RATE_B = 2
local P_QUANTIZATION = 3
local P_DISTRIBUTION = 4

local DEFAULT_PARAMETERS = { 0.5, 2.0, 3, 0 }
local MIN_RATE = 0.05
local MAX_RATE = 50
local MIN_QUANTIZATION = 1
local MAX_QUANTIZATION = 6
local DISPLAY_HISTORY_SIZE = 28
local DISPLAY_SAMPLE_PERIOD = 0.03
local RANDOM_MODULUS = 2147483647
local RANDOM_MULTIPLIER = 48271

local latestInputs
local outputs
local fluctuating
local quantizedPulsePending
local storedPulsePending
local randomState
local displayHistory
local displayHistoryIndex
local displaySampleCountdown
local quantizedFlash
local storedFlash
local effectiveQuantization
local effectiveDistribution

local function clamp(value, minimum, maximum)
    return math.max(minimum, math.min(maximum, value))
end

local function round(value)
    return math.floor(value + 0.5)
end

local function parameter(self, index)
    if self.parameters and self.parameters[index] ~= nil then
        return self.parameters[index]
    end
    return DEFAULT_PARAMETERS[index]
end

local function isIndexable(value)
    local valueType = type(value)
    return valueType == "table" or valueType == "userdata"
end

local function validVoltage(value, maximum)
    return type(value) == "number" and value >= 0 and value <= maximum
end

-- Park-Miller keeps the random sequence serialisable and independent from the
-- process-wide Lua random source. All intermediate products remain exact in a
-- Lua number's integer precision range.
local function randomUnit()
    randomState = (randomState * RANDOM_MULTIPLIER) % RANDOM_MODULUS
    return (randomState - 1) / (RANDOM_MODULUS - 1)
end

local function effectiveRate(self, parameterIndex, inputIndex)
    local baseRate = parameter(self, parameterIndex)
    local cv = latestInputs[inputIndex] or 0
    return clamp(baseRate * (2 ^ cv), MIN_RATE, MAX_RATE)
end

local function currentQuantization(self)
    return clamp(
        round(parameter(self, P_QUANTIZATION) + (latestInputs[INPUT_QUANTIZATION_CV] or 0)),
        MIN_QUANTIZATION,
        MAX_QUANTIZATION
    )
end

local function currentDistribution(self)
    return clamp(
        parameter(self, P_DISTRIBUTION)
            + (latestInputs[INPUT_DISTRIBUTION_CV] or 0) * 20,
        -100,
        100
    )
end

local function updateFluctuating(channel, rate, dt)
    -- One-pole filtered uncertainty is a control-rate approximation of the
    -- continuously varying probable-rate sections, not an analogue noise model.
    local alpha = 1 - math.exp(-2 * math.pi * rate * dt)
    local destination = randomUnit() * 10
    fluctuating[channel] = fluctuating[channel]
        + (destination - fluctuating[channel]) * alpha
end

local function quantizeIndex(randomValue, stateCount)
    return math.min(stateCount - 1, math.floor(randomValue * stateCount))
end

local function updateQuantized(self)
    effectiveQuantization = currentQuantization(self)

    -- The N+1 output uses a centre-weighted distribution and whole volts.
    local bell = (randomUnit() + randomUnit() + randomUnit()) / 3
    outputs[OUTPUT_N_PLUS_ONE] = quantizeIndex(
        bell,
        effectiveQuantization + 1
    )

    -- The 2^N output is evenly distributed in chromatic 1/12 V steps.
    local chromaticStates = 2 ^ effectiveQuantization
    outputs[OUTPUT_TWO_TO_N] = quantizeIndex(
        randomUnit(),
        chromaticStates
    ) / 12
    quantizedFlash = 0.12
end

local function weightedStoredValue(distribution)
    local amount = math.abs(distribution) / 100
    local sample = randomUnit()
    local centred = (sample + randomUnit() + randomUnit()) / 3
    local extreme
    if distribution < 0 then
        extreme = sample ^ 5
    else
        extreme = 1 - ((1 - sample) ^ 5)
    end
    return (centred * (1 - amount) + extreme * amount) * 10
end

local function updateStored(self)
    effectiveDistribution = currentDistribution(self)
    outputs[OUTPUT_STORED_EQUAL] = randomUnit() * 10
    outputs[OUTPUT_STORED_WEIGHTED] = weightedStoredValue(effectiveDistribution)
    storedFlash = 0.12
end

local function pushDisplaySample()
    displayHistoryIndex = (displayHistoryIndex % DISPLAY_HISTORY_SIZE) + 1
    displayHistory[displayHistoryIndex] = {
        fluctuating[1],
        fluctuating[2],
    }
end

local function historySample(age)
    local index = ((displayHistoryIndex - age - 1) % DISPLAY_HISTORY_SIZE) + 1
    return displayHistory[index]
end

local function restoreState(self)
    local state = self.state
    if not isIndexable(state) then return false end
    if type(state.randomState) ~= "number"
        or state.randomState < 1
        or state.randomState >= RANDOM_MODULUS
        or not validVoltage(state.fluctuatingA, 10)
        or not validVoltage(state.fluctuatingB, 10)
        or not validVoltage(state.nPlusOne, 6)
        or not validVoltage(state.twoToN, 63 / 12)
        or not validVoltage(state.storedEqual, 10)
        or not validVoltage(state.storedWeighted, 10) then
        return false
    end

    randomState = math.floor(state.randomState)
    fluctuating[1] = state.fluctuatingA
    fluctuating[2] = state.fluctuatingB
    outputs[OUTPUT_N_PLUS_ONE] = state.nPlusOne
    outputs[OUTPUT_TWO_TO_N] = state.twoToN
    outputs[OUTPUT_STORED_EQUAL] = state.storedEqual
    outputs[OUTPUT_STORED_WEIGHTED] = state.storedWeighted
    return true
end

return {
    name = "Source of Uncertainty",
    author = "Fredi Bach",

    -- Luading simulator extension; ignored by Disting NT.
    luading = {
        parameterPresets = {
            { name = "Classic", values = { 0.5, 2.0, 3, 0 } },
            { name = "Slow Drift", values = { 0.05, 0.15, 2, 0 } },
            { name = "High Tendency", values = { 1.0, 8.0, 6, 80 } },
            { name = "Low Tendency", values = { 4.0, 16.0, 1, -80 } },
        },
    },

    init = function(self)
        latestInputs = { 0, 0, 0, 0, 0, 0 }
        outputs = { 5, 5, 0, 0, 5, 5 }
        fluctuating = { 5, 5 }
        quantizedPulsePending = false
        storedPulsePending = false
        randomState = (os.time() % (RANDOM_MODULUS - 1)) + 1
        displayHistory = {}
        displayHistoryIndex = DISPLAY_HISTORY_SIZE
        displaySampleCountdown = DISPLAY_SAMPLE_PERIOD
        quantizedFlash = 0
        storedFlash = 0
        effectiveQuantization = parameter(self, P_QUANTIZATION)
        effectiveDistribution = parameter(self, P_DISTRIBUTION)

        restoreState(self)
        outputs[OUTPUT_FLUCTUATING_A] = fluctuating[1]
        outputs[OUTPUT_FLUCTUATING_B] = fluctuating[2]
        for index = 1, DISPLAY_HISTORY_SIZE do
            displayHistory[index] = { fluctuating[1], fluctuating[2] }
        end

        return {
            inputs = {
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/4
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/4
                kCV,      -- Type: Sine LFO, Synced: true, Division: 2 bars
                kCV,      -- Type: Triangle LFO, Synced: true, Division: 1 bar
                kCV,      -- Type: Manual / DC
                kCV,      -- Type: Triangle LFO, Synced: true, Division: 2 bars
            },
            inputNames = {
                "Quantized Pulse",
                "Stored Pulse",
                "Rate A CV",
                "Rate B CV",
                "Quantization CV",
                "Distribution CV",
            },
            outputs = {
                kLinear,  -- Type: Off
                kLinear,  -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
            },
            outputNames = {
                "Fluctuating A",
                "Fluctuating B",
                "N+1",
                "2^N",
                "Stored Equal",
                "Stored Weighted",
            },
            parameters = {
                { "Rate A", 5, 5000, 50, kHz, kBy100 },
                { "Rate B", 5, 5000, 200, kHz, kBy100 },
                { "Quantization N", 1, 6, 3, kNone },
                { "Distribution", -100, 100, 0, kPercent },
            },
        }
    end,

    trigger = function(self, input)
        if input == INPUT_QUANTIZED_PULSE then
            quantizedPulsePending = true
        elseif input == INPUT_STORED_PULSE then
            storedPulsePending = true
        end
        return {}
    end,

    step = function(self, dt, inputs)
        for index = 1, 6 do latestInputs[index] = inputs[index] or 0 end

        updateFluctuating(1, effectiveRate(self, P_RATE_A, INPUT_RATE_A_CV), dt)
        updateFluctuating(2, effectiveRate(self, P_RATE_B, INPUT_RATE_B_CV), dt)
        outputs[OUTPUT_FLUCTUATING_A] = fluctuating[1]
        outputs[OUTPUT_FLUCTUATING_B] = fluctuating[2]

        if quantizedPulsePending then
            updateQuantized(self)
            quantizedPulsePending = false
        else
            effectiveQuantization = currentQuantization(self)
        end
        if storedPulsePending then
            updateStored(self)
            storedPulsePending = false
        else
            effectiveDistribution = currentDistribution(self)
        end

        quantizedFlash = math.max(0, quantizedFlash - dt)
        storedFlash = math.max(0, storedFlash - dt)
        displaySampleCountdown = displaySampleCountdown - dt
        while displaySampleCountdown <= 0 do
            pushDisplaySample()
            displaySampleCountdown = displaySampleCountdown + DISPLAY_SAMPLE_PERIOD
        end

        return outputs
    end,

    serialise = function(self)
        return {
            randomState = randomState,
            fluctuatingA = fluctuating[1],
            fluctuatingB = fluctuating[2],
            nPlusOne = outputs[OUTPUT_N_PLUS_ONE],
            twoToN = outputs[OUTPUT_TWO_TO_N],
            storedEqual = outputs[OUTPUT_STORED_EQUAL],
            storedWeighted = outputs[OUTPUT_STORED_WEIGHTED],
        }
    end,

    draw = function(self)
        drawTinyText(4, 6, "SOURCE OF UNCERTAINTY", 15)
        drawTinyText(252, 6, "266", 10, "right")
        drawLine(0, 9, 255, 9, 4)
        drawLine(87, 10, 87, 63, 3)
        drawLine(171, 10, 171, 63, 3)

        drawTinyText(4, 16, "FLUCTUATING", 10)
        drawTinyText(91, 16, "QUANTIZED", quantizedFlash > 0 and 15 or 10)
        drawTinyText(175, 16, "STORED", storedFlash > 0 and 15 or 10)

        for age = DISPLAY_HISTORY_SIZE - 1, 1, -1 do
            local older = historySample(age)
            local newer = historySample(age - 1)
            local x1 = 4 + (DISPLAY_HISTORY_SIZE - 1 - age) * 3
            local x2 = x1 + 3
            drawLine(x1, 61 - older[1] * 3.5, x2, 61 - newer[1] * 3.5, 12)
            drawLine(x1, 61 - older[2] * 3.5, x2, 61 - newer[2] * 3.5, 6)
        end
        drawTinyText(4, 24, string.format("A %.2f", fluctuating[1]), 15)
        drawTinyText(47, 24, string.format("B %.2f", fluctuating[2]), 8)

        drawTinyText(91, 25, string.format("N %d", effectiveQuantization), 8)
        drawTinyText(91, 35, string.format("N+1 %.2f", outputs[OUTPUT_N_PLUS_ONE]), 15)
        drawTinyText(91, 45, string.format("2^N %.2f", outputs[OUTPUT_TWO_TO_N]), 15)
        local states = 2 ^ effectiveQuantization
        for index = 0, math.min(states - 1, 15) do
            local x = 92 + index * 4
            local active = round(outputs[OUTPUT_TWO_TO_N] * 12) % math.min(states, 16)
            drawRectangle(x, 53, x + 2, 59, index == active and 15 or 3)
        end

        drawTinyText(175, 25, string.format("D %+d", round(effectiveDistribution)), 8)
        drawTinyText(175, 35, string.format("EQ %.2f", outputs[OUTPUT_STORED_EQUAL]), 15)
        drawTinyText(175, 45, string.format("WT %.2f", outputs[OUTPUT_STORED_WEIGHTED]), 15)
        drawBox(176, 53, 250, 59, 3)
        drawRectangle(177, 54, 177 + outputs[OUTPUT_STORED_WEIGHTED] * 7.2, 58, 10)
        return true
    end,
}
