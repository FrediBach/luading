-- Particle Bursts
-- Four-channel clock-distributed trigger variation inspired by Patching Panda Particles.
--[[
Independent Disting NT recreation of the musical ideas documented at:
https://patchingpanda.com/wp-content/uploads/Particles_manual.pdf

This is not a source port or a panel-level clone. It adapts the central ideas
into explicit Disting parameters: clock-distributed repetitions, rotating
input-to-output assignment, probability that may remove any pulse, Absorb that
only removes repeats, clocked gater muting, per-channel limits, bypass, mute,
and a clocked 0-10 V random output.

Inputs:
  1-4. Trigger inputs
  5. Clock (measures the distribution interval and advances shift/gater)
  6. Reset (clears bursts and returns sequential shifting to zero)
  7. Rate CV (one repetition-menu step per volt)
  8. Shift CV (one lane per volt)
  9. Probability CV (20 percentage points per volt)
 10. Absorb CV (20 percentage points per volt)
 11. Gater CV (one division-menu step per volt)

Outputs 1-4 are +5 V triggers. Output 5 is a 0-10 V random CV updated by
each clock. Before two clocks have been measured, one clock is treated as
125 ms. Burst timing follows the documented 1 ms Lua control cadence.
]]

local CHANNEL_COUNT = 4
local OUTPUT_RANDOM = 5
local GATE_VOLTAGE = 5.0
local DEFAULT_CLOCK_PERIOD = 0.125
local MAX_QUEUED_PER_CHANNEL = 512

local INPUT_CLOCK = 5
local INPUT_RESET = 6
local INPUT_RATE_CV = 7
local INPUT_SHIFT_CV = 8
local INPUT_PROBABILITY_CV = 9
local INPUT_ABSORB_CV = 10
local INPUT_GATER_CV = 11

local P_RATE = 1
local P_DISTRIBUTION = 2
local P_TRIPLETS = 3
local P_SHIFT_MODE = 4
local P_SHIFT = 5
local P_PROBABILITY = 6
local P_ABSORB = 7
local P_GATER = 8
local P_PULSE_MS = 9
local CHANNEL_PARAMETER_START = 10
local CHANNEL_PARAMETER_COUNT = 5

local CP_RATE_LIMIT = 0
local CP_PROBABILITY_LIMIT = 1
local CP_ABSORB_LIMIT = 2
local CP_GATER_LIMIT = 3
local CP_STATE = 4

local TRIPLETS_ALLOWED = 1
local TRIPLETS_FILTERED = 2
local SHIFT_FIXED = 1
local SHIFT_FORWARD = 2
local SHIFT_RANDOM = 3
local STATE_PROCESS = 1
local STATE_BYPASS = 2
local STATE_MUTE = 3

local RATE_VALUES = { 1, 2, 3, 4, 6, 8, 12, 16, 24, 48, 64, 96, 128 }
local RATE_NAMES = {
    "1", "2", "3", "4", "6", "8", "12", "16", "24", "48", "64", "96", "128",
}
local DISTRIBUTION_VALUES = { 16, 24, 32, 40, 48, 56, 64 }
local DISTRIBUTION_NAMES = { "C16", "C24", "C32", "C40", "C48", "C56", "C64" }
local GATER_VALUES = { 0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128 }
local GATER_NAMES = {
    "Off", "1/1", "1/2", "1/3", "1/4", "1/6", "1/8", "1/12",
    "1/16", "1/24", "1/32", "1/48", "1/64", "1/96", "1/128",
}

local DEFAULT_PARAMETERS = {
    8, 1, TRIPLETS_FILTERED, SHIFT_FIXED, 0, 0, 0, 1, 10,
    13, 100, 100, 15, STATE_PROCESS,
    13, 100, 100, 15, STATE_PROCESS,
    13, 100, 100, 15, STATE_PROCESS,
    13, 100, 100, 15, STATE_PROCESS,
}

local queues = {}
local pulseRemaining = {}
local outputBuffer = {}
local pendingTriggers = {}
local clockPending = false
local resetPending = false
local totalTime = 0
local lastClockTime = nil
local clockPeriod = DEFAULT_CLOCK_PERIOD
local clockCount = 0
local currentShift = 0
local randomState = 20250804
local randomVoltage = 0
local lastInputs = {}

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

local function channelParameterIndex(channel, offset)
    return CHANNEL_PARAMETER_START + (channel - 1) * CHANNEL_PARAMETER_COUNT + offset
end

local function channelParameter(self, channel, offset)
    return parameter(self, channelParameterIndex(channel, offset))
end

local function nextRandom()
    randomState = (1664525 * randomState + 1013904223) % 4294967296
    return randomState / 4294967296
end

local function effectiveMenuIndex(self, parameterIndex, inputIndex, maximum)
    local base = parameter(self, parameterIndex)
    local cv = lastInputs[inputIndex] or 0
    return clamp(base + round(cv), 1, maximum)
end

local function effectiveRateIndex(self, channel)
    local globalIndex = effectiveMenuIndex(
        self,
        P_RATE,
        INPUT_RATE_CV,
        #RATE_VALUES
    )
    return math.min(
        globalIndex,
        channelParameter(self, channel, CP_RATE_LIMIT)
    )
end

local function effectiveRate(self, channel)
    local index = effectiveRateIndex(self, channel)
    if parameter(self, P_TRIPLETS) == TRIPLETS_FILTERED then
        while index > 1 and RATE_VALUES[index] % 3 == 0 do index = index - 1 end
    end
    return RATE_VALUES[index]
end

local function effectiveProbability(self, channel)
    local global = clamp(
        parameter(self, P_PROBABILITY)
            + (lastInputs[INPUT_PROBABILITY_CV] or 0) * 20,
        0,
        100
    )
    return math.min(
        global,
        channelParameter(self, channel, CP_PROBABILITY_LIMIT)
    )
end

local function effectiveAbsorb(self, channel)
    local global = clamp(
        parameter(self, P_ABSORB)
            + (lastInputs[INPUT_ABSORB_CV] or 0) * 20,
        0,
        100
    )
    return math.min(
        global,
        channelParameter(self, channel, CP_ABSORB_LIMIT)
    )
end

local function effectiveGaterIndex(self, channel)
    local globalIndex = effectiveMenuIndex(
        self,
        P_GATER,
        INPUT_GATER_CV,
        #GATER_VALUES
    )
    return math.min(
        globalIndex,
        channelParameter(self, channel, CP_GATER_LIMIT)
    )
end

local function effectiveShift(self)
    local cvShift = round(lastInputs[INPUT_SHIFT_CV] or 0)
    return (parameter(self, P_SHIFT) + currentShift + cvShift) % CHANNEL_COUNT
end

local function isGated(self, channel)
    local division = GATER_VALUES[effectiveGaterIndex(self, channel)]
    if division == 0 then return false end
    return math.floor(clockCount / division) % 2 == 1
end

local function clearOutputs()
    for output = 1, CHANNEL_COUNT do
        pulseRemaining[output] = 0
        outputBuffer[output] = 0
    end
end

local function clearQueues()
    for channel = 1, CHANNEL_COUNT do queues[channel] = {} end
end

local function clearPendingTriggers()
    for channel = 1, CHANNEL_COUNT do pendingTriggers[channel] = false end
end

local function restoreNumber(state, key, fallback)
    if state and type(state[key]) == "number" then return state[key] end
    return fallback
end

local function resetRuntime(self)
    clearQueues()
    clearOutputs()
    clearPendingTriggers()
    clockPending = false
    resetPending = false
    totalTime = 0
    lastClockTime = nil
    clockPeriod = DEFAULT_CLOCK_PERIOD
    clockCount = 0
    currentShift = 0
    randomState = 20250804
    randomVoltage = 0
    lastInputs = {}

    local state = self.state
    if state then
        randomState = math.floor(restoreNumber(state, "randomState", randomState))
            % 4294967296
        currentShift = math.floor(restoreNumber(state, "currentShift", 0))
            % CHANNEL_COUNT
        clockCount = math.max(0, math.floor(restoreNumber(state, "clockCount", 0)))
        clockPeriod = clamp(
            restoreNumber(state, "clockPeriod", DEFAULT_CLOCK_PERIOD),
            0.005,
            10
        )
        randomVoltage = clamp(restoreNumber(state, "randomVoltage", 0), 0, 10)
    end
    outputBuffer[OUTPUT_RANDOM] = randomVoltage
end

local function scheduleBurst(self, channel)
    local state = channelParameter(self, channel, CP_STATE)
    if state == STATE_MUTE then return end

    if state == STATE_BYPASS then
        queues[channel][#queues[channel] + 1] = {
            remaining = 0,
            span = 0,
            original = true,
            bypass = true,
        }
        return
    end

    local count = effectiveRate(self, channel)
    local distribution = DISTRIBUTION_VALUES[parameter(self, P_DISTRIBUTION)]
    local span = distribution * clockPeriod
    local interval = span / count
    local queue = queues[channel]
    for pulse = 1, count do
        if #queue >= MAX_QUEUED_PER_CHANNEL then break end
        queue[#queue + 1] = {
            remaining = (pulse - 1) * interval,
            span = span,
            original = pulse == 1,
            bypass = false,
        }
    end
end

local function shouldEmit(self, channel, event)
    local state = channelParameter(self, channel, CP_STATE)
    if state == STATE_MUTE then return false end
    if event.bypass then return state == STATE_BYPASS end
    if state == STATE_BYPASS then return false end
    if isGated(self, channel) then return false end
    if nextRandom() * 100 < effectiveProbability(self, channel) then return false end
    if not event.original
        and nextRandom() * 100 < effectiveAbsorb(self, channel)
    then
        return false
    end
    return true
end

local function fireEvent(self, channel, event)
    if not shouldEmit(self, channel, event) then return false end
    local output = event.bypass
        and channel
        or ((channel - 1 + effectiveShift(self)) % CHANNEL_COUNT) + 1
    pulseRemaining[output] = parameter(self, P_PULSE_MS) / 1000
    outputBuffer[output] = GATE_VOLTAGE
    return true
end

local function drainDueEvents(self)
    local changed = false
    for channel = 1, CHANNEL_COUNT do
        local queue = queues[channel]
        local write = 1
        for read = 1, #queue do
            local event = queue[read]
            if event.remaining <= 0 then
                if fireEvent(self, channel, event) then changed = true end
            else
                queue[write] = event
                write = write + 1
            end
        end
        for index = #queue, write, -1 do queue[index] = nil end
    end
    return changed
end

local function ageEvents(dt)
    for channel = 1, CHANNEL_COUNT do
        for _, event in ipairs(queues[channel]) do
            event.remaining = event.remaining - dt
        end
    end
end

local function processClock(self, resetNow)
    if not clockPending then return false end
    clockPending = false

    if lastClockTime ~= nil then
        local measured = totalTime - lastClockTime
        if measured >= 0.005 and measured <= 10 then clockPeriod = measured end
    end
    lastClockTime = totalTime
    clockCount = clockCount + 1
    randomVoltage = nextRandom() * 10
    outputBuffer[OUTPUT_RANDOM] = randomVoltage

    if not resetNow then
        local mode = parameter(self, P_SHIFT_MODE)
        if mode == SHIFT_FORWARD then
            currentShift = (currentShift + 1) % CHANNEL_COUNT
        elseif mode == SHIFT_RANDOM then
            currentShift = math.floor(nextRandom() * CHANNEL_COUNT)
        else
            currentShift = 0
        end
    end
    return true
end

local function stateLabel(value)
    if value == STATE_BYPASS then return "B" end
    if value == STATE_MUTE then return "M" end
    return "P"
end

return {
    name = "Particle Bursts",
    author = "Fredi Bach",

    -- Luading simulator extension; ignored by Disting NT.
    luading = {
        parameterPresets = {
            {
                name = "Straight",
                values = {
                    8, 1, 2, 1, 0, 0, 0, 1, 10,
                    13, 100, 100, 15, 1,
                    13, 100, 100, 15, 1,
                    13, 100, 100, 15, 1,
                    13, 100, 100, 15, 1,
                },
            },
            {
                name = "Glitch Fill",
                values = {
                    6, 1, 1, 2, 0, 15, 25, 4, 8,
                    6, 100, 100, 4, 1,
                    5, 75, 75, 3, 1,
                    4, 55, 45, 2, 1,
                    3, 35, 25, 1, 1,
                },
            },
            {
                name = "Sparse Orbit",
                values = {
                    8, 3, 2, 3, 0, 35, 60, 6, 12,
                    8, 90, 90, 6, 1,
                    6, 70, 80, 5, 1,
                    5, 55, 70, 4, 1,
                    4, 40, 60, 3, 2,
                },
            },
        },
    },

    init = function(self)
        resetRuntime(self)
        return {
            inputs = {
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/4
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/8
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/8
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/16
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/16
                kTrigger, -- Type: Trigger, Synced: true, Division: 2 bars
                kCV,      -- Type: Triangle LFO, Synced: true, Division: 2 bars
                kCV,      -- Type: Manual / DC, Synced: false, Division: 1 bar
                kCV,      -- Type: Sine LFO, Synced: true, Division: 2 bars
                kCV,      -- Type: Triangle LFO, Synced: true, Division: 1 bar
                kCV,      -- Type: Manual / DC, Synced: false, Division: 4 bars
            },
            inputNames = {
                "Trigger 1", "Trigger 2", "Trigger 3", "Trigger 4",
                "Clock", "Reset", "Rate CV", "Shift CV",
                "Probability CV", "Absorb CV", "Gater CV",
            },
            outputs = {
                kStepped, -- Type: Kick Trigger
                kStepped, -- Type: Snare Trigger
                kStepped, -- Type: Hi-hat Trigger
                kStepped, -- Type: Synth Trigger
                kStepped, -- Type: Synth Note
            },
            outputNames = {
                "Burst 1", "Burst 2", "Burst 3", "Burst 4", "Random CV",
            },
            parameters = {
                { "Repetitions", RATE_NAMES, 8 },
                { "Distribution", DISTRIBUTION_NAMES, 1 },
                { "Triplets", { "Allowed", "Filtered" }, 2 },
                { "Shift mode", { "Fixed", "Forward", "Random" }, 1 },
                { "Shift", 0, 3, 0, kNone },
                { "Probability", 0, 100, 0, kPercent },
                { "Absorb", 0, 100, 0, kPercent },
                { "Gater", GATER_NAMES, 1 },
                { "Pulse", 1, 100, 10, kMs },

                { "Ch1 Repeat limit", RATE_NAMES, 13 },
                { "Ch1 Probability limit", 0, 100, 100, kPercent },
                { "Ch1 Absorb limit", 0, 100, 100, kPercent },
                { "Ch1 Gater limit", GATER_NAMES, 15 },
                { "Ch1 State", { "Process", "Bypass", "Mute" }, 1 },

                { "Ch2 Repeat limit", RATE_NAMES, 13 },
                { "Ch2 Probability limit", 0, 100, 100, kPercent },
                { "Ch2 Absorb limit", 0, 100, 100, kPercent },
                { "Ch2 Gater limit", GATER_NAMES, 15 },
                { "Ch2 State", { "Process", "Bypass", "Mute" }, 1 },

                { "Ch3 Repeat limit", RATE_NAMES, 13 },
                { "Ch3 Probability limit", 0, 100, 100, kPercent },
                { "Ch3 Absorb limit", 0, 100, 100, kPercent },
                { "Ch3 Gater limit", GATER_NAMES, 15 },
                { "Ch3 State", { "Process", "Bypass", "Mute" }, 1 },

                { "Ch4 Repeat limit", RATE_NAMES, 13 },
                { "Ch4 Probability limit", 0, 100, 100, kPercent },
                { "Ch4 Absorb limit", 0, 100, 100, kPercent },
                { "Ch4 Gater limit", GATER_NAMES, 15 },
                { "Ch4 State", { "Process", "Bypass", "Mute" }, 1 },
            },
        }
    end,

    trigger = function(self, input)
        if input >= 1 and input <= CHANNEL_COUNT then
            pendingTriggers[input] = true
        elseif input == INPUT_CLOCK then
            clockPending = true
        elseif input == INPUT_RESET then
            resetPending = true
        end
    end,

    step = function(self, dt, inputs)
        totalTime = totalTime + dt
        lastInputs = inputs
        local changed = false

        for output = 1, CHANNEL_COUNT do
            if pulseRemaining[output] > 0 then
                pulseRemaining[output] = pulseRemaining[output] - dt
                if pulseRemaining[output] <= 0 then
                    pulseRemaining[output] = 0
                    outputBuffer[output] = 0
                    changed = true
                end
            end
        end

        local resetNow = resetPending
        resetPending = false
        if resetNow then
            clearQueues()
            clearOutputs()
            currentShift = 0
            clockCount = 0
            lastClockTime = nil
            changed = true
        end

        if processClock(self, resetNow) then changed = true end

        ageEvents(dt)
        if drainDueEvents(self) then changed = true end

        for channel = 1, CHANNEL_COUNT do
            if pendingTriggers[channel] then
                pendingTriggers[channel] = false
                scheduleBurst(self, channel)
            end
        end
        if drainDueEvents(self) then changed = true end

        if changed then return outputBuffer end
    end,

    draw = function(self)
        local railLeft = 14
        local railRight = 148
        local laneTop = 15
        local lanePitch = 12
        local summaryX = 157

        drawTinyText(4, 6, "PARTICLE BURSTS", 15)
        drawLine(153, 2, 153, 62, 3)

        for channel = 1, CHANNEL_COUNT do
            local y = laneTop + (channel - 1) * lanePitch
            drawTinyText(4, y + 2, tostring(channel), 8)
            drawLine(railLeft, y, railRight, y, 3)
            drawBox(railLeft - 2, y - 2, railLeft + 2, y + 2, 6)
            drawBox(
                railRight - 2,
                y - 3,
                railRight + 2,
                y + 3,
                pulseRemaining[channel] > 0 and 15 or 6
            )

            local shown = 0
            for _, event in ipairs(queues[channel]) do
                if shown >= 10 then break end
                local progress = event.span > 0
                    and clamp(1 - event.remaining / event.span, 0, 1)
                    or 1
                local x = railLeft + progress * (railRight - railLeft)
                drawCircle(x, y, event.original and 2 or 1, event.original and 15 or 10)
                shown = shown + 1
            end

            drawTinyText(
                150,
                y + 2,
                stateLabel(channelParameter(self, channel, CP_STATE)),
                9,
                "right"
            )
        end

        local rate = effectiveRate(self, 1)
        local distribution = DISTRIBUTION_NAMES[parameter(self, P_DISTRIBUTION)]
        local shift = effectiveShift(self)
        local gater = GATER_NAMES[effectiveGaterIndex(self, 1)]
        local probability = round(effectiveProbability(self, 1))
        local absorb = round(effectiveAbsorb(self, 1))
        drawTinyText(summaryX, 9, "R " .. rate .. " " .. distribution, 15)
        drawTinyText(summaryX, 19, "SHIFT " .. shift, 11)
        drawTinyText(
            summaryX,
            29,
            string.format("P%02d A%02d", probability, absorb),
            11
        )
        drawTinyText(summaryX, 39, "G " .. gater, 9)
        drawTinyText(summaryX, 49, string.format("CLK %.0fms", clockPeriod * 1000), 8)
        drawTinyText(summaryX, 59, string.format("RND %.1fV", randomVoltage), 15)
        return true
    end,

    serialise = function(self)
        return {
            randomState = randomState,
            currentShift = currentShift,
            clockCount = clockCount,
            clockPeriod = clockPeriod,
            randomVoltage = randomVoltage,
        }
    end,
}
