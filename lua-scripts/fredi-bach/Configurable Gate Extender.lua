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

--------------------------------------------------------------------------------
-- Main Script Table
--------------------------------------------------------------------------------

return
{
    name = 'Gate Extender'
    , author = 'Expert Sleepers Ltd'
    
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
        
        return {
            inputs = { kGate, kCV }
            , inputNames = { "Gate In", "Extend CV" }
            , outputs = { kStepped }
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
            
            if state == STATE_IDLE then
                -- Normal case: start output immediately
                state = STATE_ACTIVE
                endTime = 0  -- Not scheduled yet (input still high)
                hasPendingGate = false
                return { GATE_HIGH }
                
            elseif state == STATE_ACTIVE then
                -- New gate while we're extending the previous one
                -- Force end, enforce gap, queue the new gate
                state = STATE_GAP
                gapEndTime = time + minGapS
                hasPendingGate = true
                return { GATE_LOW }
                
            else -- STATE_GAP
                -- Already in gap period, just mark that we have a pending gate
                hasPendingGate = true
                return {}
            end
        else
            -----------------------------------------------------------------
            -- INPUT GATE WENT LOW
            -----------------------------------------------------------------
            inputHigh = false
            inputFellAt = time
            
            if state == STATE_ACTIVE and endTime == 0 then
                -- Schedule when to end the output gate
                endTime = time + getEffectiveExtend(self)
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
                        
                        result[1] = GATE_HIGH
                    end
                else
                    -- No pending gate, return to idle
                    state = STATE_IDLE
                    gapEndTime = 0
                end
            end
        end
        
        return result
    end
    
    --------------------------------------------------------------------------
    -- Draw Function - Custom display (30fps)
    --------------------------------------------------------------------------
    , draw = function(self)
        -- State indicator
        local stateNames = {
            [STATE_IDLE] = "IDLE",
            [STATE_ACTIVE] = "HIGH",
            [STATE_GAP] = "GAP"
        }
        local stateName = stateNames[state] or "?"
        
        -- Color based on state (brighter when active)
        local stateColor = (state == STATE_ACTIVE) and 15 or 8
        
        -- Draw state in center
        drawText(128, 32, stateName, stateColor, "centre")
        
        -- Draw parameter summary
        local extendMs = self.parameters[1]
        local cvAmt = self.parameters[2]
        local minGapMs = self.parameters[3]
        
        -- Show effective extend time (with CV modulation)
        local effectiveMs = math.max(0, extendMs + (cvAmt / 100) * lastCv * 200)
        
        drawTinyText(128, 45, string.format("Extend: %dms (eff: %dms)", 
            extendMs, math.floor(effectiveMs + 0.5)), 7, "centre")
        drawTinyText(128, 55, string.format("Gap: %dms  CV: %d%%", 
            minGapMs, cvAmt), 7, "centre")
        
        -- Visual gate indicator bar at bottom
        local barY = 60
        local barWidth = 200
        local barX = (256 - barWidth) / 2
        
        -- Background bar
        drawRectangle(barX, barY, barX + barWidth, barY + 3, 2)
        
        -- Filled portion based on state
        if state == STATE_ACTIVE then
            drawRectangle(barX, barY, barX + barWidth, barY + 3, 12)
        elseif state == STATE_GAP and gapEndTime > 0 then
            -- Show gap progress
            local minGapS = self.parameters[3] / 1000
            local gapProgress = 1.0 - math.max(0, (gapEndTime - time) / minGapS)
            local fillWidth = math.floor(barWidth * gapProgress)
            drawRectangle(barX, barY, barX + fillWidth, barY + 3, 6)
        end
    end
}
