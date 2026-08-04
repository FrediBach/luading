-- Configurable Swing Sequence
--[=[
Delays successive input-clock triggers by a repeating microtiming pattern.
Each Step parameter is a percentage of the measured input-clock interval:
20% is the same microtiming value as 0.2 in a pattern such as { 0, 0.2 }.

Set Length to choose how many Step parameters are active. For example:
  Length 2, Step 1 = 0%, Step 2 = 20% gives traditional swing.
  Length 4, Step 1 = 0%, Step 2 = 0%, Step 3 = 20%, Step 4 = 0%
  delays only every third position in each four-step loop.

Inputs:
  1. Clock - advances the pattern and supplies the base interval
  2. Reset - makes the next clock use Step 1

Output:
  1. Clock - a fixed-width +5 V trigger at the microtimed position

Only delays are available because the script cannot know a future external
clock edge. The first clock after loading passes immediately; after that, the
most recently measured interval supplies the delay. Disting NT's 1 ms script
cadence quantizes the scheduled time to the next control step.
]=]

local MAX_STEPS = 16
local MAX_DELAY_PERCENT = 90
local CLOCK_INPUT = 1
local RESET_INPUT = 2
local OUTPUT_CLOCK = 1
local HIGH = 5.0
local LOW = 0.0

local P_LENGTH = 1
local P_TIMING_FIRST = 2
local P_PULSE = P_TIMING_FIRST + MAX_STEPS

local state = {
    time = 0.0,
    lastClockTime = nil,
    measuredPeriod = nil,
    stepIndex = 0,
    pending = {},
    outputHigh = false,
    pulseEndTime = 0.0,
    lastDelay = 0.0,
}

local function clamp(value, minimum, maximum)
    return math.max(minimum, math.min(maximum, value))
end

local function activeLength(self)
    return clamp(math.floor(self.parameters[P_LENGTH]), 1, MAX_STEPS)
end

local function timingAt(self, index)
    return clamp(
        self.parameters[P_TIMING_FIRST + index - 1],
        0,
        MAX_DELAY_PERCENT
    )
end

local function startPulse(self)
    state.outputHigh = true
    state.pulseEndTime = state.time + self.parameters[P_PULSE] / 1000.0
end

local function scheduleClock(self)
    local length = activeLength(self)
    state.stepIndex = (state.stepIndex % length) + 1

    local timing = timingAt(self, state.stepIndex)
    local delay = 0.0
    if state.measuredPeriod ~= nil then
        delay = state.measuredPeriod * timing / 100.0
    end
    state.lastDelay = delay

    if delay <= 0.0 then
        startPulse(self)
        return true
    end

    state.pending[#state.pending + 1] = {
        due = state.time + delay,
        step = state.stepIndex,
    }
    return false
end

local function resetState(keepPeriod)
    local period = keepPeriod and state.measuredPeriod or nil
    state.time = 0.0
    state.lastClockTime = nil
    state.measuredPeriod = period
    state.stepIndex = 0
    state.pending = {}
    state.outputHigh = false
    state.pulseEndTime = 0.0
    state.lastDelay = 0.0
end

return {
    name = 'Configurable Swing Sequence',
    author = 'Luading Examples',

    -- Luading simulator extension; ignored by Disting NT.
    luading = {
        parameterPresets = {
            {
                name = 'Classic swing',
                values = {
                    2,
                    0, 20, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0,
                    10,
                },
            },
            {
                name = 'Straight eight',
                values = {
                    8,
                    0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0,
                    10,
                },
            },
            {
                name = 'Four-step skip',
                values = {
                    4,
                    0, 0, 20, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0,
                    10,
                },
            },
        },
    },

    init = function(self)
        resetState(false)

        local parameters = {
            { 'Length', 1, MAX_STEPS, 2, kNone },
        }
        for index = 1, MAX_STEPS do
            local default = index == 2 and 20 or 0
            parameters[#parameters + 1] = {
                string.format('Step %02d', index),
                0,
                MAX_DELAY_PERCENT,
                default,
                kPercent,
            }
        end
        parameters[#parameters + 1] = { 'Pulse', 1, 100, 10, kMs }

        return {
            inputs = {
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/4
                kTrigger, -- Type: Trigger, Synced: true, Division: 1 bar
            },
            inputNames = { 'Clock', 'Reset' },
            outputs = {
                kStepped, -- Type: Hi-hat Trigger
            },
            outputNames = { 'Swung Clock' },
            parameters = parameters,
        }
    end,

    trigger = function(self, input)
        if input == RESET_INPUT then
            -- Keep the last trustworthy interval so playback can resume with
            -- Step 1 immediately, but do not measure across the reset gap.
            resetState(true)
            return { LOW }
        end

        if input ~= CLOCK_INPUT then
            return {}
        end

        if state.lastClockTime ~= nil then
            local period = state.time - state.lastClockTime
            if period >= 0.002 and period <= 60.0 then
                state.measuredPeriod = period
            end
        end
        state.lastClockTime = state.time

        if scheduleClock(self) then
            return { HIGH }
        end
        return {}
    end,

    step = function(self, dt, inputs)
        state.time = state.time + dt
        local output = {}

        if state.outputHigh and state.time >= state.pulseEndTime then
            state.outputHigh = false
            output[OUTPUT_CLOCK] = LOW
        end

        local fired = false
        for index = #state.pending, 1, -1 do
            local event = state.pending[index]
            if state.time >= event.due then
                table.remove(state.pending, index)
                fired = true
            end
        end

        if fired then
            startPulse(self)
            output[OUTPUT_CLOCK] = HIGH
        end

        return output
    end,

    draw = function(self)
        drawStandardParameterLine()

        local length = activeLength(self)
        local baseY = 51
        local maxHeight = 27
        local slotWidth = 15

        drawTinyText(4, 13, string.format('L%02d', length), 8)
        if state.measuredPeriod == nil then
            drawTinyText(252, 13, 'CLOCK?', 6, 'right')
        else
            drawTinyText(
                252,
                13,
                string.format('%.0fms', state.measuredPeriod * 1000.0),
                8,
                'right'
            )
        end

        for index = 1, MAX_STEPS do
            local x = 8 + (index - 1) * slotWidth
            if index <= length then
                local timing = timingAt(self, index)
                local height = math.max(
                    2,
                    math.floor(timing / MAX_DELAY_PERCENT * maxHeight + 0.5)
                )
                local shade = index == state.stepIndex and 15 or 8
                drawBox(x, baseY - maxHeight, x + 9, baseY, 3)
                drawRectangle(x + 2, baseY - height, x + 7, baseY - 1, shade)
                if index == state.stepIndex then
                    drawBox(x - 2, 20, x + 11, 54, 11)
                end
            else
                drawLine(x, baseY, x + 9, baseY, 2)
            end
        end

        if state.stepIndex == 0 then
            drawTinyText(4, 63, 'STEP --', 6)
            drawTinyText(252, 63, 'WAIT', 6, 'right')
        else
            drawTinyText(
                4,
                63,
                string.format('STEP %02d', state.stepIndex),
                10
            )
            drawTinyText(
                252,
                63,
                string.format('+%d%%', timingAt(self, state.stepIndex)),
                #state.pending > 0 and 15 or 9,
                'right'
            )
        end

        return true
    end,
}
