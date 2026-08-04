-- Probability Mixer
-- Mix eight probability processes into one complementary gate router.
--[[
Each process proposes a pass probability. Its Weight controls how strongly its
distance from certainty is subtracted from 100%:

  final = 100 - sum(weight * (100 - source)) / sum(weight)

The weights are normalized by their total, so they can be treated like mixer
levels. With Base at 50%, Independent at 100%, and Markov at 15%, the result is
mostly a normal 50% Bernoulli gate with a small phrase-shaped Markov influence.

Inputs:
  1. Gate  - routed to Pass or Reject
  2. Reset - resets all eight probability processes

Outputs:
  1. Pass   - follows accepted input gates
  2. Reject - follows rejected input gates
]]

local BAG_SIZE = 16
local HAZARD_STEPS = 8
local RNG_MODULUS = 2147483647
local RNG_MULTIPLIER = 48271

local ENGINE_NAMES = {
    "IND", "MRK", "BAG", "HAZ", "CYC", "WLK", "ALT", "STR"
}

-- Positive values accent a position; negative values de-emphasize it. The
-- average is zero, so this engine changes placement more than overall density.
local CYCLE_BIASES = {
    1.00, -0.70, 0.10, -0.55,
    0.70, -0.45, 0.25, -0.65,
    0.85, -0.60, 0.05, -0.40,
    0.60, -0.50, 0.20, -0.90
}

local rngState = 1
local stepIndex = 0
local lastPassed = false
local hasLastResult = false
local failureRun = 0
local markovActive = false
local walkProbability = 50
local bag = {}
local bagIndex = 1
local bagHits = 8
local selectedOutput = 0
local passCount = 0
local rejectCount = 0
local lastProbability = 50
local sourceProbabilities = {50, 50, 50, 50, 50, 50, 50, 50}

local function clamp(value, low, high)
    return math.max(low, math.min(high, value))
end

local function rounded(value)
    return math.floor(value + 0.5)
end

local function isIndexable(value)
    local valueType = type(value)
    return valueType == "table" or valueType == "userdata"
end

local function sequenceValue(sequence, index)
    if sequence[0] ~= nil then return sequence[index - 1] end
    return sequence[index]
end

local function validInteger(value, low, high)
    return type(value) == "number"
        and value == math.floor(value)
        and value >= low
        and value <= high
end

local function randomUnit()
    rngState = (rngState * RNG_MULTIPLIER) % RNG_MODULUS
    return rngState / RNG_MODULUS
end

local function refillBag(baseProbability)
    bagHits = clamp(rounded(BAG_SIZE * baseProbability / 100), 0, BAG_SIZE)
    bag = {}
    for index = 1, BAG_SIZE do
        bag[index] = index <= bagHits and 1 or 0
    end
    for index = BAG_SIZE, 2, -1 do
        local swapIndex = math.floor(randomUnit() * index) + 1
        bag[index], bag[swapIndex] = bag[swapIndex], bag[index]
    end
    bagIndex = 1
end

local function validBag(candidate)
    if not isIndexable(candidate) then return false end
    for index = 1, BAG_SIZE do
        local value = sequenceValue(candidate, index)
        if value ~= 0 and value ~= 1 then return false end
    end
    return true
end

local function copyBag(candidate)
    local result = {}
    for index = 1, BAG_SIZE do
        result[index] = sequenceValue(candidate, index)
    end
    return result
end

local function resetProcesses(baseProbability)
    stepIndex = 0
    lastPassed = false
    hasLastResult = false
    failureRun = 0
    markovActive = false
    walkProbability = baseProbability
    selectedOutput = 0
    passCount = 0
    rejectCount = 0
    lastProbability = baseProbability
    sourceProbabilities = {
        baseProbability, baseProbability, baseProbability, baseProbability,
        baseProbability, baseProbability, baseProbability, baseProbability
    }
    refillBag(baseProbability)
end

local function restoreProcesses(state)
    local seed = math.random(1, RNG_MODULUS - 1)
    if isIndexable(state)
        and validInteger(state.rngState, 1, RNG_MODULUS - 1) then
        seed = state.rngState
    end
    rngState = seed

    if not isIndexable(state) then
        resetProcesses(50)
        return
    end

    stepIndex = validInteger(state.stepIndex, 0, 1000000000)
        and state.stepIndex or 0
    lastPassed = state.lastPassed == true
    hasLastResult = state.hasLastResult == true
    failureRun = validInteger(state.failureRun, 0, HAZARD_STEPS)
        and state.failureRun or 0
    markovActive = state.markovActive == true
    walkProbability = type(state.walkProbability) == "number"
        and clamp(state.walkProbability, 0, 100) or 50
    bagIndex = validInteger(state.bagIndex, 1, BAG_SIZE)
        and state.bagIndex or 1
    bagHits = validInteger(state.bagHits, 0, BAG_SIZE)
        and state.bagHits or 8
    passCount = validInteger(state.passCount, 0, 1000000000)
        and state.passCount or 0
    rejectCount = validInteger(state.rejectCount, 0, 1000000000)
        and state.rejectCount or 0
    lastProbability = type(state.lastProbability) == "number"
        and clamp(state.lastProbability, 0, 100) or 50
    selectedOutput = 0

    if validBag(state.bag) then
        bag = copyBag(state.bag)
    else
        refillBag(50)
    end

    sourceProbabilities = {50, 50, 50, 50, 50, 50, 50, 50}
end

local function ensureBag(baseProbability)
    local wantedHits = clamp(
        rounded(BAG_SIZE * baseProbability / 100), 0, BAG_SIZE
    )
    if wantedHits ~= bagHits then refillBag(baseProbability) end
end

local function calculateSources(baseProbability)
    ensureBag(baseProbability)

    local span = math.min(baseProbability, 100 - baseProbability)
    local cyclePosition = (stepIndex % #CYCLE_BIASES) + 1
    local markovProbability
    if markovActive then
        -- Active phrases tend to continue.
        markovProbability = baseProbability
            + (100 - baseProbability) * 0.65
    else
        -- Inactive phrases are deliberately reluctant to start.
        markovProbability = baseProbability * 0.35
    end

    local alternatingProbability = baseProbability
    local streakyProbability = baseProbability
    if hasLastResult then
        if lastPassed then
            alternatingProbability = baseProbability * 0.45
            streakyProbability = baseProbability
                + (100 - baseProbability) * 0.55
        else
            alternatingProbability = baseProbability
                + (100 - baseProbability) * 0.55
            streakyProbability = baseProbability * 0.45
        end
    end

    sourceProbabilities = {
        baseProbability,
        clamp(markovProbability, 0, 100),
        bag[bagIndex] == 1 and 100 or 0,
        clamp(
            baseProbability
                + (100 - baseProbability) * failureRun / HAZARD_STEPS,
            0,
            100
        ),
        clamp(
            baseProbability + CYCLE_BIASES[cyclePosition] * span,
            0,
            100
        ),
        clamp(walkProbability, 0, 100),
        clamp(alternatingProbability, 0, 100),
        clamp(streakyProbability, 0, 100)
    }
end

local function mixProbability(self)
    local weightedFailure = 0
    local totalWeight = 0
    for engine = 1, #ENGINE_NAMES do
        local weight = self.parameters[engine + 1]
        if weight > 0 then
            weightedFailure = weightedFailure
                + weight * (100 - sourceProbabilities[engine])
            totalWeight = totalWeight + weight
        end
    end

    if totalWeight == 0 then return self.parameters[1] end
    return clamp(100 - weightedFailure / totalWeight, 0, 100)
end

local function advanceProcesses(baseProbability, passed)
    if passed then
        failureRun = 0
        passCount = passCount + 1
    else
        failureRun = math.min(HAZARD_STEPS, failureRun + 1)
        rejectCount = rejectCount + 1
    end
    lastPassed = passed
    hasLastResult = true

    markovActive = randomUnit() * 100 < sourceProbabilities[2]

    bagIndex = bagIndex + 1
    if bagIndex > BAG_SIZE then refillBag(baseProbability) end

    local centering = (baseProbability - walkProbability) * 0.20
    local movement = (randomUnit() * 2 - 1) * 10
    walkProbability = clamp(walkProbability + centering + movement, 0, 100)
end

return {
    name = "Probability Mixer",
    author = "Fredi Bach",

    -- Luading simulator extension; ignored by Disting NT.
    luading = {
        parameterPresets = {
            {
                name = "Independent 50",
                values = {50, 100, 0, 0, 0, 0, 0, 0, 0}
            },
            {
                name = "Markov Flavor",
                values = {50, 100, 15, 0, 0, 0, 0, 0, 0}
            },
            {
                name = "All Flavors",
                values = {50, 100, 20, 20, 15, 20, 15, 15, 15}
            }
        }
    },

    init = function(self)
        restoreProcesses(self.state)
        return {
            inputs = {
                kGate,    -- Type: Gate, Synced: true, Division: 1/4
                kTrigger  -- Type: Trigger, Synced: true, Division: 1 bar
            },
            inputNames = {"Gate", "Reset"},
            outputs = {
                kStepped, -- Type: Synth Trigger
                kStepped  -- Type: Synth Trigger
            },
            outputNames = {"Pass", "Reject"},
            parameters = {
                {"Base", 0, 100, 50, kPercent},
                {"Independent", 0, 100, 100, kPercent},
                {"Markov", 0, 100, 0, kPercent},
                {"Bag", 0, 100, 0, kPercent},
                {"Hazard", 0, 100, 0, kPercent},
                {"Weighted cycle", 0, 100, 0, kPercent},
                {"Random walk", 0, 100, 0, kPercent},
                {"Alternating", 0, 100, 0, kPercent},
                {"Streaky", 0, 100, 0, kPercent}
            }
        }
    end,

    trigger = function(self, input)
        if input ~= 2 then return {} end
        resetProcesses(self.parameters[1])
        return {0, 0}
    end,

    gate = function(self, input, rising)
        if input ~= 1 then return {} end

        if not rising then
            if selectedOutput == 0 then return {} end
            local outs = {}
            outs[selectedOutput] = 0
            selectedOutput = 0
            return outs
        end

        calculateSources(self.parameters[1])
        lastProbability = mixProbability(self)
        local passed = randomUnit() * 100 < lastProbability
        selectedOutput = passed and 1 or 2
        stepIndex = stepIndex + 1
        advanceProcesses(self.parameters[1], passed)

        local outs = {}
        outs[selectedOutput] = 5
        return outs
    end,

    draw = function(self)
        drawTinyText(4, 5, "PROBABILITY MIXER", 10)
        drawTinyText(252, 5, rounded(lastProbability) .. "%", 15, "right")

        drawBox(4, 9, 251, 16, 4)
        local probabilityWidth = math.floor(245 * lastProbability / 100)
        if probabilityWidth > 0 then
            drawRectangle(5, 10, 4 + probabilityWidth, 15, 12)
        end

        for engine = 1, #ENGINE_NAMES do
            local x = 3 + (engine - 1) * 31
            local weight = self.parameters[engine + 1]
            local source = sourceProbabilities[engine]
            drawTinyText(x + 12, 25, ENGINE_NAMES[engine], 8, "centre")
            drawBox(x + 2, 29, x + 22, 61, 3)

            local weightHeight = math.floor(30 * weight / 100)
            if weightHeight > 0 then
                drawRectangle(
                    x + 3,
                    60 - weightHeight,
                    x + 21,
                    60,
                    selectedOutput == 1 and 9 or 6
                )
            end

            local markerY = 60 - math.floor(30 * source / 100)
            drawLine(x + 1, markerY, x + 23, markerY, 15)
        end

        return true
    end,

    serialise = function(self)
        return {
            rngState = rngState,
            stepIndex = stepIndex,
            lastPassed = lastPassed,
            hasLastResult = hasLastResult,
            failureRun = failureRun,
            markovActive = markovActive,
            walkProbability = walkProbability,
            bag = bag,
            bagIndex = bagIndex,
            bagHits = bagHits,
            passCount = passCount,
            rejectCount = rejectCount,
            lastProbability = lastProbability
        }
    end
}
