-- Gate Extender
--[[
Extends incoming gates by a configurable and CV-controllable amount.
Ensures gates are never merged by enforcing a configurable minimum gap.

INPUTS:
  1. Gate In   - The gate signal to extend
  2. Extend CV - Bipolar CV to modulate extension time (±5V)

OUTPUTS:
  1. Gate Out  - The extended gate signal

PARAMETERS:
  - Extend Time: Base extension duration (0-2000ms)
  - CV Amount:   How much CV affects extension (-100% to +100%)
  - Min Gap:     Minimum time between output gates (1-500ms)

USE CASES:
  - Convert short triggers to usable gates for envelopes
  - Create legato effects from staccato sequences
  - Ensure downstream modules receive adequate gate lengths
  - Rhythmic gate manipulation with CV modulation
]]

--------------------------------------------------------------------------------
-- Constants
--------------------------------------------------------------------------------

local STATE_IDLE   = 0  -- Output low, waiting for input
local STATE_ACTIVE = 1  -- Output high (input high or extending)
local STATE_GAP    = 2  -- Output low, enforcing minimum gap

local GATE_HIGH = 5.0   -- Output voltage when gate is high
local GATE_LOW  = 0.0   -- Output voltage when gate is low

local MIN_PULSE_S = 0.005  -- Minimum output pulse duration (5ms)

--------------------------------------------------------------------------------
-- State Variables (local to chunk, persistent across calls)
--------------------------------------------------------------------------------

local state = STATE_IDLE
local time = 0              -- Elapsed time since init
local endTime = 0           -- When to end current output gate (0 = not scheduled)
local gapEndTime = 0        -- When gap period ends (0 = not in gap)
local inputHigh = false     -- Current state of input gate
local inputFellAt = 0       -- Time when input last went low
local hasPendingGate = false -- A gate is waiting to be output after gap
local lastCv = 0            -- Most recent CV input value

--------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------

--- Calculate effective extension time with CV modulation
-- @param self The script table containing parameters
-- @return Extension time in seconds
local function getEffectiveExtend(self)
    local extendMs = self.parameters[1]  -- Base extend time in ms
    local cvAmt = self.parameters[2] / 100  -- CV amount as fraction (-1 to +1)
    
    -- CV modulation: ±5V with 100% CV amount gives ±1000ms
    local cvMod = cvAmt * lastCv * 200
    
    -- Calculate final extend time, clamped to non-negative
    local effectiveMs = math.max(0, extendMs + cvMod)
    
    return effectiveMs / 1000  -- Convert to seconds
end

local function clamp(value, minimum, maximum)
    return math.max(minimum, math.min(maximum, value))
end

--------------------------------------------------------------------------------
-- Main Script Table
--------------------------------------------------------------------------------

return
{
    name = 'Gate Extender'
    , author = 'Expert Sleepers Ltd'

    -- Luading simulator extension; ignored by Disting NT.
    , luading = {
        parameterPresets = {
            { name = 'Default', values = { 100, 0, 10 } }
            , { name = 'Short', values = { 25, 0, 2 } }
            , { name = 'CV Tail', values = { 500, 75, 25 } }
        }
    }
    
    --------------------------------------------------------------------------
    -- Initialization
    --------------------------------------------------------------------------
    , init = function(self)
        -- Reset all state
        state = STATE_IDLE
        time = 0
        endTime = 0
        gapEndTime = 0
        inputHigh = false
        inputFellAt = 0
        hasPendingGate = false
        lastCv = 0

        -- Display state is captured at edge/step cadence and consumed
        -- read-only by draw().
        self.display_input_rise_time = -1
        self.display_input_fall_time = -1
        self.display_output_rise_time = -1
        self.display_extension_end = -1
        self.display_scheduled_extend = 0
        self.display_gap_started = -1
        self.display_gap_duration = 0
        self.display_retrigger_flash = 0
        self.display_effective_extend = 0
        self.display_cv_bend = 0
        
        return {
            inputs = {
                kGate, -- Type: Gate, Synced: true, Division: 1/4
                kCV,   -- Type: Sine LFO, Synced: true, Division: 2 bars
            }
            , inputNames = { "Gate In", "Extend CV" }
            , outputs = {
                kStepped, -- Type: Hi-hat Trigger
            }
            , outputNames = { "Gate Out" }
            , parameters = {
                { "Extend Time", 0, 2000, 100, kMs }
                , { "CV Amount", -100, 100, 0, kPercent }
                , { "Min Gap", 1, 500, 10, kMs }
            }
        }
    end
    
    --------------------------------------------------------------------------
    -- Gate Callback - Called on input gate edges
    --------------------------------------------------------------------------
    , gate = function(self, input, rising)
        -- Only process the first input (the gate input)
        if input ~= 1 then
            return {}
        end
        
        local minGapS = self.parameters[3] / 1000
        
        if rising then
            -----------------------------------------------------------------
            -- INPUT GATE WENT HIGH
            -----------------------------------------------------------------
            inputHigh = true
            self.display_input_rise_time = time
            
            if state == STATE_IDLE then
                -- Normal case: start output immediately
                state = STATE_ACTIVE
                endTime = 0  -- Not scheduled yet (input still high)
                hasPendingGate = false
                self.display_input_fall_time = -1
                self.display_output_rise_time = time
                self.display_extension_end = -1
                self.display_scheduled_extend = 0
                self.display_gap_started = -1
                return { GATE_HIGH }
                
            elseif state == STATE_ACTIVE then
                -- New gate while we're extending the previous one
                -- Force end, enforce gap, queue the new gate
                state = STATE_GAP
                gapEndTime = time + minGapS
                hasPendingGate = true
                self.display_gap_started = time
                self.display_gap_duration = minGapS
                self.display_retrigger_flash = 1
                return { GATE_LOW }
                
            else -- STATE_GAP
                -- Already in gap period, just mark that we have a pending gate
                hasPendingGate = true
                self.display_retrigger_flash = 1
                return {}
            end
        else
            -----------------------------------------------------------------
            -- INPUT GATE WENT LOW
            -----------------------------------------------------------------
            inputHigh = false
            inputFellAt = time
            self.display_input_fall_time = time
            
            if state == STATE_ACTIVE and endTime == 0 then
                -- Schedule when to end the output gate
                local effectiveExtend = getEffectiveExtend(self)
                endTime = time + effectiveExtend
                self.display_scheduled_extend = effectiveExtend
                self.display_extension_end = endTime
            end
            
            return {}
        end
    end
    
    --------------------------------------------------------------------------
    -- Step Function - Called every ~1ms for timing operations
    --------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        -- Update time and CV value
        time = time + dt
        lastCv = inputs[2] or 0

        local displayAlpha = clamp(dt * 10, 0, 1)
        local effectiveExtend = getEffectiveExtend(self)
        self.display_effective_extend = self.display_effective_extend
            + (effectiveExtend - self.display_effective_extend) * displayAlpha
        local cvAmount = self.parameters[2] / 100
        local bendTarget = clamp(lastCv / 5, -1, 1) * cvAmount * 7
        self.display_cv_bend = self.display_cv_bend
            + (bendTarget - self.display_cv_bend) * displayAlpha
        self.display_retrigger_flash = math.max(
            0,
            self.display_retrigger_flash - dt * 8
        )
        
        local minGapS = self.parameters[3] / 1000
        local result = {}
        
        -----------------------------------------------------------------
        -- STATE: ACTIVE - Check if extension period has ended
        -----------------------------------------------------------------
        if state == STATE_ACTIVE then
            -- Only end if: input is low, end time is scheduled, and time reached
            if not inputHigh and endTime > 0 and time >= endTime then
                state = STATE_GAP
                gapEndTime = time + minGapS
                endTime = 0
                self.display_gap_started = time
                self.display_gap_duration = minGapS
                result[1] = GATE_LOW
            end
        
        -----------------------------------------------------------------
        -- STATE: GAP - Check if gap period has ended
        -----------------------------------------------------------------
        elseif state == STATE_GAP then
            if time >= gapEndTime then
                if hasPendingGate then
                    -- There's a gate waiting to be output
                    if inputHigh then
                        -- Input is still high, start new active period
                        state = STATE_ACTIVE
                        endTime = 0  -- Will be set when input goes low
                        hasPendingGate = false
                        self.display_input_fall_time = -1
                        self.display_output_rise_time = time
                        self.display_extension_end = -1
                        self.display_scheduled_extend = 0
                        self.display_gap_started = -1
                        result[1] = GATE_HIGH
                    else
                        -- Input went low during gap - output delayed pulse
                        state = STATE_ACTIVE
                        hasPendingGate = false
                        
                        -- Calculate when this delayed gate should end
                        endTime = inputFellAt + getEffectiveExtend(self)
                        
                        -- Ensure minimum pulse duration
                        if endTime <= time then
                            endTime = time + MIN_PULSE_S
                        end

                        self.display_output_rise_time = time
                        self.display_extension_end = endTime
                        self.display_scheduled_extend = math.max(
                            0,
                            endTime - time
                        )
                        self.display_gap_started = -1
                        
                        result[1] = GATE_HIGH
                    end
                else
                    -- No pending gate, return to idle
                    state = STATE_IDLE
                    gapEndTime = 0
                    self.display_gap_started = -1
                end
            end
        end
        
        return result
    end
    
    --------------------------------------------------------------------------
    -- Draw Function - Custom display (30fps)
    --------------------------------------------------------------------------
    , draw = function(self)
        drawStandardParameterLine()

        local stateName = state == STATE_IDLE
            and "IDLE"
            or (state == STATE_ACTIVE and "HIGH" or "GAP")
        local minGapMs = self.parameters[3]

        local inputX = 28
        local outputX = 226
        local baseY = 34
        local segments = 24
        local gapProgress = 0
        if state == STATE_GAP and self.display_gap_duration > 0 then
            gapProgress = clamp(
                (time - self.display_gap_started)
                    / self.display_gap_duration,
                0,
                1
            )
        end

        local extensionProgress = 0
        if (
            state == STATE_ACTIVE
            and not inputHigh
            and self.display_extension_end >= 0
        ) then
            local duration = self.display_extension_end
                - self.display_input_fall_time
            if duration <= 0 then
                extensionProgress = 1
            else
                extensionProgress = clamp(
                    (time - self.display_input_fall_time) / duration,
                    0,
                    1
                )
            end
        end

        -- Input and output pegs frame a single elastic timeline.
        drawLine(inputX, 23, inputX, 46, 5)
        drawCircle(inputX, baseY, 3, inputHigh and 15 or 8)
        drawLine(outputX, 23, outputX, 46, 5)
        drawCircle(
            outputX,
            baseY,
            3,
            state == STATE_ACTIVE and 15 or 8
        )

        -- CV bends the strip while state determines which portion remains
        -- taut. During extension the dim region advances left-to-right;
        -- during GAP the lit strip retracts toward the output peg.
        local previousX = inputX
        local previousY = baseY
        for i = 1, segments do
            local position = i / segments
            local x = inputX + position * (outputX - inputX)
            local y = baseY
                - math.sin(position * math.pi) * self.display_cv_bend

            drawSmoothLine(previousX, previousY, x, y, 2)

            local midpoint = (i - 0.5) / segments
            local liveShade = nil
            if state == STATE_ACTIVE then
                if inputHigh then
                    liveShade = 14
                elseif midpoint <= extensionProgress then
                    liveShade = 4
                else
                    liveShade = 13
                end
            elseif state == STATE_GAP and midpoint >= gapProgress then
                liveShade = hasPendingGate and 10 or 7
            end

            if liveShade then
                drawSmoothLine(previousX, previousY, x, y, liveShade)
            end
            previousX = x
            previousY = y
        end

        -- The fixed fall marker separates the natural input gate from the
        -- elastic extension. Effective Extend and Min Gap divide the remaining
        -- timeline proportionally.
        local fallX = 72
        local effectiveMs = self.display_effective_extend * 1000
        local timelineExtendMs = effectiveMs
        if state ~= STATE_IDLE and self.display_extension_end >= 0 then
            timelineExtendMs = self.display_scheduled_extend * 1000
        end
        local totalTimedMs = math.max(1, timelineExtendMs + minGapMs)
        local extensionX = fallX
            + (218 - fallX) * (timelineExtendMs / totalTimedMs)
        if self.display_input_fall_time >= 0 then
            drawLine(fallX, 27, fallX, 42, 8)
        else
            drawLine(fallX, 30, fallX, 38, 3)
        end
        drawLine(extensionX, 25, extensionX, 43, 12)
        drawCircle(extensionX, baseY, 1, 15)

        -- The protected gap is a dotted recovery segment.
        local hatchStart = math.floor(extensionX + 4)
        for x = hatchStart, 218, 7 do
            drawLine(x, baseY - 3, x + 3, baseY + 3, 5)
        end

        -- A gate arriving during extension/GAP presses visibly against the
        -- input peg without lighting the output.
        local bump = self.display_retrigger_flash
        if hasPendingGate or bump > 0 then
            local bumpHeight = 3 + bump * 5
            local bumpShade = 7 + math.floor(bump * 8)
            drawSmoothLine(inputX, baseY, inputX + 8, baseY - bumpHeight, bumpShade)
            drawSmoothLine(
                inputX + 8,
                baseY - bumpHeight,
                inputX + 18,
                baseY,
                bumpShade
            )
            drawSmoothCircle(inputX + 8, baseY - bumpHeight, 1.5, bumpShade)
        end

        drawTinyText(
            4,
            63,
            string.format("EXT %dms", math.floor(effectiveMs + 0.5)),
            8
        )
        drawTinyText(128, 63, stateName, state == STATE_ACTIVE and 15 or 7, "centre")
        drawTinyText(
            252,
            63,
            string.format("GAP %dms", minGapMs),
            8,
            "right"
        )

        return true
    end
}
