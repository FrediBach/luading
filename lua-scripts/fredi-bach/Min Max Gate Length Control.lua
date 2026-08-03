-- Gate Length
--[[
Min/Max Gate Length Processor

Constrains all gates to be within configurable minimum and maximum lengths.
Useful for extending short triggers, truncating long gates, or normalizing
gate lengths from various sources in your modular system.

INPUTS:
  1. Gate    - Input gate signal to process
  2. Min CV  - Modulates minimum length (1V = 100ms, bipolar)
  3. Max CV  - Modulates maximum length (1V = 100ms, bipolar)

OUTPUT:
  1. Out     - Processed gate signal (0V/5V)

PARAMETERS:
  - Min: Minimum gate length in ms (0 = disabled, gate passes through)
  - Max: Maximum gate length in ms (10000 = infinite/disabled)

BEHAVIOR:
  - When input gate rises, output goes HIGH and timer starts
  - If input falls before Min is reached, output stays HIGH until Min
  - If input stays HIGH past Max, output goes LOW at Max
  - Output stays LOW until input completes a full LOW->HIGH cycle

CV MODULATION:
  - ±5V CV = ±500ms modulation
  - Negative CV can reduce lengths (clamped to safe minimums)
]]

--------------------------------------------------------------------------------
-- Constants
--------------------------------------------------------------------------------

local MAX_MS = 10000          -- Maximum configurable length (also means "disabled")
local GATE_HIGH = 5.0         -- Output voltage for gate HIGH
local GATE_LOW = 0.0          -- Output voltage for gate LOW
local CV_SCALE = 100          -- Milliseconds per volt of CV modulation

--------------------------------------------------------------------------------
-- Script Definition
--------------------------------------------------------------------------------

return
{
    name = 'Gate Length'
    , author = 'Expert Sleepers Ltd'

    -- Luading simulator extension; ignored by Disting NT.
    , luading = {
        parameterPresets = {
            { name = 'Unrestricted', values = { 0, 10000 } }
            , { name = 'Percussive', values = { 5, 150 } }
            , { name = 'Held', values = { 250, 2000 } }
        }
    }
    
    ----------------------------------------------------------------------------
    -- Initialization
    ----------------------------------------------------------------------------
    , init = function(self)
        -- State tracking variables
        self.inputHigh = false      -- Current state of input gate
        self.outputHigh = false     -- Current state of output gate
        self.gateTimer = 0          -- Time since output went HIGH (in seconds)
        self.maxedOut = false       -- TRUE when max was reached, waiting for input release
        
        return
        {
            -- Input configuration: Gate input + 2 CV inputs for modulation
            inputs = {
                kGate, -- Type: Gate, Synced: true, Division: 1/4
                kCV,   -- Type: Sine LFO, Synced: true, Division: 2 bars
                kCV,   -- Type: Triangle LFO, Synced: true, Division: 1 bar
            }
            , inputNames = { "Gate", "Min CV", "Max CV" }
            
            -- Output configuration: Single stepped gate output
            , outputs = {
                kStepped, -- Type: Hi-hat Trigger
            }
            , outputNames = { "Out" }
            
            -- User-adjustable parameters
            , parameters = 
            {
                { "Min", 0, MAX_MS, 0, kMs }           -- 0 = disabled
                , { "Max", 0, MAX_MS, MAX_MS, kMs }   -- MAX_MS = infinite/disabled
            }
        }
    end
    
    ----------------------------------------------------------------------------
    -- Gate Callback: Handle rising/falling edges
    -- This is called by the system when a gate transition is detected
    -- More efficient than polling in step() for gate signals
    ----------------------------------------------------------------------------
    , gate = function(self, input, rising)
        -- Only process the gate input (input index 1)
        if input ~= 1 then 
            return {} 
        end
        
        if rising then
            -- Gate opened - start a new cycle
            -- But only if we're not in "maxed out" state waiting for release
            if not self.maxedOut then
                self.inputHigh = true
                self.outputHigh = true
                self.gateTimer = 0
                return { GATE_HIGH }
            end
        else
            -- Gate closed
            self.inputHigh = false
            self.maxedOut = false  -- Reset maxed state, allowing new gates
            
            -- Check if we should close output immediately
            -- (either min is disabled OR we've already exceeded min)
            local minMs = self.parameters[1]
            local timerMs = self.gateTimer * 1000
            
            if minMs == 0 or timerMs >= minMs then
                self.outputHigh = false
                return { GATE_LOW }
            end
            -- Otherwise, keep output HIGH - step() will close it when min is reached
        end
        
        return {}
    end
    
    ----------------------------------------------------------------------------
    -- Step Function: Called every ~1ms for timing and CV processing
    ----------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        -- Nothing to do if output is already LOW
        if not self.outputHigh then
            return {}
        end
        
        -- Update the timer
        self.gateTimer = self.gateTimer + dt
        local timerMs = self.gateTimer * 1000
        
        -- Calculate effective min/max lengths with CV modulation
        -- CV scaling: 1V = 100ms, so ±5V = ±500ms
        local minMs = math.max(0, self.parameters[1] + inputs[2] * CV_SCALE)
        local maxMs = math.max(1, self.parameters[2] + inputs[3] * CV_SCALE)
        
        -- Check if max is effectively disabled (parameter at maximum value)
        local maxDisabled = self.parameters[2] >= MAX_MS
        
        -- MAX CHECK: While input is still HIGH, enforce maximum length
        if self.inputHigh and not maxDisabled and timerMs >= maxMs then
            self.outputHigh = false
            self.maxedOut = true  -- Prevent re-triggering until input goes LOW
            return { GATE_LOW }
        end
        
        -- MIN CHECK: While extending (input LOW, output still HIGH)
        if not self.inputHigh then
            -- Close output when min length is reached (or min is disabled)
            if minMs == 0 or timerMs >= minMs then
                self.outputHigh = false
                return { GATE_LOW }
            end
        end
        
        return {}
    end
    
    ----------------------------------------------------------------------------
    -- Draw Function: Custom display (called at ~30fps)
    ----------------------------------------------------------------------------
    , draw = function(self)
        local timerMs = self.gateTimer * 1000
        
        -- Determine current status for display
        local status = "Ready"
        local statusColor = 6
        
        if self.outputHigh then
            if self.inputHigh then
                status = "Active"
                statusColor = 15
            else
                status = "Extending"
                statusColor = 12
            end
        elseif self.maxedOut then
            status = "Max Reached"
            statusColor = 8
        end
        
        -- Draw gate state indicators (LED style)
        -- Input indicator (left side)
        local inColor = self.inputHigh and 15 or 3
        drawText(50, 28, "IN", 8, "centre")
        drawCircle(50, 44, 7, inColor)
        if self.inputHigh then
            drawCircle(50, 44, 4, inColor)  -- Inner circle for "filled" effect
        end
        
        -- Output indicator (right side)
        local outColor = self.outputHigh and 15 or 3
        drawText(206, 28, "OUT", 8, "centre")
        drawCircle(206, 44, 7, outColor)
        if self.outputHigh then
            drawCircle(206, 44, 4, outColor)  -- Inner circle for "filled" effect
        end
        
        -- Status text (center)
        drawText(128, 32, status, statusColor, "centre")
        
        -- Timer display (center, below status) - only when relevant
        if self.outputHigh or self.maxedOut then
            local timerStr
            if timerMs >= 1000 then
                timerStr = string.format("%.2fs", timerMs / 1000)
            else
                timerStr = string.format("%.0fms", timerMs)
            end
            drawText(128, 50, timerStr, 10, "centre")
        end
        
        -- Show effective min/max on bottom line
        local minMs = self.parameters[1]
        local maxMs = self.parameters[2]
        
        local minStr = minMs == 0 and "off" or string.format("%dms", minMs)
        local maxStr = maxMs >= MAX_MS and "inf" or string.format("%dms", maxMs)
        
        drawTinyText(64, 62, "min:" .. minStr, 5, "centre")
        drawTinyText(192, 62, "max:" .. maxStr, 5, "centre")
    end
}
