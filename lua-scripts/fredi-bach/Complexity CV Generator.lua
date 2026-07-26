-- Complexity CV
--[[
Generates CV based on incoming gate/trigger activity density.
Monitor up to 8 inputs - the more activity detected, the higher
the output CV. Use for self-regulating patches, adaptive effects,
generative systems, or dynamic mixing automation.
]]

--------------------------------------------------------------------------------
-- Configuration Constants
--------------------------------------------------------------------------------

local NUM_INPUTS = 8           -- Number of gate/trigger inputs to monitor
local MAX_ACTIVITY = 100.0     -- Maximum internal activity score
local TRIGGER_IMPULSE = 12.5   -- Activity added per trigger (100/8 = full scale)
local GATE_WEIGHT = 1.0        -- Multiplier for gate contribution per ms

--------------------------------------------------------------------------------
-- Local State Variables
--------------------------------------------------------------------------------

-- Activity tracking for each input
local inputActivity = {}       -- Decaying activity level per input
local gateStates = {}          -- Current gate state (high/low) per input
local triggerCounts = {}       -- Recent trigger count per input

-- Smoothed output values
local rawComplexity = 0.0      -- Unsmoothed complexity value (0-1)
local smoothedComplexity = 0.0 -- Smoothed output (0-1)
local gateOutput = false       -- Threshold gate state

-- Timing
local lastActivityTime = 0     -- Time since last activity (for display)

--------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------

--- Attempt to linearly interpolate toward target using separate attack/decay rates
-- @param current Current value
-- @param target Target value
-- @param attackRate Rate when moving toward higher values (per second)
-- @param decayRate Rate when moving toward lower values (per second)
-- @param dt Delta time in seconds
-- @return New interpolated value
local function slewValue(current, target, attackRate, decayRate, dt)
    if target > current then
        local step = attackRate * dt
        return math.min(current + step, target)
    else
        local step = decayRate * dt
        return math.max(current - step, target)
    end
end

--- Apply response curve to linear value
-- @param value Linear input (0-1)
-- @param curveType 1=Linear, 2=Exponential, 3=Logarithmic, 4=S-Curve
-- @return Curved output (0-1)
local function applyCurve(value, curveType)
    value = math.max(0, math.min(1, value))
    
    if curveType == 1 then
        -- Linear: direct passthrough
        return value
    elseif curveType == 2 then
        -- Exponential: slow start, fast finish
        return value * value
    elseif curveType == 3 then
        -- Logarithmic: fast start, slow finish
        return math.sqrt(value)
    elseif curveType == 4 then
        -- S-Curve: smooth transitions at extremes
        return value * value * (3 - 2 * value)
    end
    
    return value
end

--- Convert normalized value (0-1) to voltage range
-- @param normalized Input value 0-1
-- @param minV Minimum voltage
-- @param maxV Maximum voltage
-- @param invert Whether to invert the output
-- @return Output voltage
local function toVoltage(normalized, minV, maxV, invert)
    if invert then
        normalized = 1 - normalized
    end
    return minV + normalized * (maxV - minV)
end

--------------------------------------------------------------------------------
-- Main Script Table
--------------------------------------------------------------------------------

return {
    name = 'Complexity CV'
    , author = 'Expert Sleepers Ltd'
    
    ----------------------------------------------------------------------------
    -- Initialization
    ----------------------------------------------------------------------------
    , init = function(self)
        -- Initialize state arrays
        for i = 1, NUM_INPUTS do
            inputActivity[i] = 0.0
            gateStates[i] = false
            triggerCounts[i] = 0
        end
        
        rawComplexity = 0.0
        smoothedComplexity = 0.0
        gateOutput = false
        lastActivityTime = 0
        
        return {
            -- 8 trigger/gate inputs for activity monitoring
            inputs = { 
                kGate, kGate, kGate, kGate,
                kGate, kGate, kGate, kGate
            }
            , inputNames = {
                "Gate 1", "Gate 2", "Gate 3", "Gate 4",
                "Gate 5", "Gate 6", "Gate 7", "Gate 8"
            }
            
            -- 2 outputs: main CV and threshold gate
            , outputs = { kLinear, kStepped }
            , outputNames = { "Complexity CV", "Threshold Gate" }
            
            -- Algorithm parameters
            , parameters = {
                -- Timing parameters
                { "Attack", 1, 500, 20, kMs }              -- 1: Attack time
                , { "Decay", 10, 5000, 500, kMs }          -- 2: Decay time
                , { "Activity Window", 10, 2000, 200, kMs } -- 3: Activity decay window
                
                -- Output range
                , { "Min Output", -100, 100, 0, kVolts, kBy10 }   -- 4: Min voltage
                , { "Max Output", -100, 100, 80, kVolts, kBy10 }  -- 5: Max voltage
                
                -- Response shaping
                , { "Response", { "Linear", "Exponential", "Logarithmic", "S-Curve" }, 1 } -- 6
                , { "Invert", { "Off", "On" }, 1 }         -- 7: Invert output
                
                -- Threshold gate
                , { "Gate Threshold", 0, 100, 50, kPercent } -- 8: Gate trigger level
                , { "Gate Hysteresis", 0, 20, 5, kPercent }  -- 9: Hysteresis amount
                
                -- Musical presets/modes
                , { "Mode", { "Standard", "Drums", "Ambient", "Reactive" }, 1 } -- 10
            }
        }
    end
    
    ----------------------------------------------------------------------------
    -- Gate Callback (called when any gate input changes)
    ----------------------------------------------------------------------------
    , gate = function(self, input, rising)
        gateStates[input] = rising
        
        if rising then
            -- Gate rising edge acts like a trigger
            inputActivity[input] = math.min(
                inputActivity[input] + TRIGGER_IMPULSE,
                MAX_ACTIVITY / NUM_INPUTS
            )
            triggerCounts[input] = triggerCounts[input] + 1
            lastActivityTime = 0
        end
        
        return {}
    end
    
    ----------------------------------------------------------------------------
    -- Step Function (called every ~1ms)
    ----------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        local p = self.parameters
        
        -- Get mode-adjusted parameters
        local mode = p[10]
        local attackMs, decayMs, activityWindowMs
        
        if mode == 1 then
            -- Standard: use parameter values directly
            attackMs = p[1]
            decayMs = p[2]
            activityWindowMs = p[3]
        elseif mode == 2 then
            -- Drums: fast attack, medium decay, short window
            attackMs = math.min(p[1], 10)
            decayMs = math.min(p[2], 300)
            activityWindowMs = math.min(p[3], 100)
        elseif mode == 3 then
            -- Ambient: slow attack, very slow decay, long window
            attackMs = math.max(p[1], 100)
            decayMs = math.max(p[2], 2000)
            activityWindowMs = math.max(p[3], 1000)
        elseif mode == 4 then
            -- Reactive: very fast attack, fast decay
            attackMs = 5
            decayMs = math.min(p[2], 200)
            activityWindowMs = p[3]
        end
        
        -- Convert ms to rates (change per second)
        local attackRate = 1000 / attackMs
        local decayRate = 1000 / decayMs
        local activityDecayRate = 1000 / activityWindowMs
        
        -- Update activity tracking for each input
        local totalActivity = 0.0
        
        for i = 1, NUM_INPUTS do
            -- Decay existing activity
            inputActivity[i] = math.max(0, inputActivity[i] - activityDecayRate * dt)
            
            -- Add continuous contribution from held gates
            if gateStates[i] then
                inputActivity[i] = math.min(
                    inputActivity[i] + GATE_WEIGHT * dt * 1000,
                    MAX_ACTIVITY / NUM_INPUTS
                )
            end
            
            -- Sum total activity
            totalActivity = totalActivity + inputActivity[i]
        end
        
        -- Normalize to 0-1 range
        rawComplexity = math.min(1.0, totalActivity / MAX_ACTIVITY)
        
        -- Apply slew/smoothing
        smoothedComplexity = slewValue(
            smoothedComplexity,
            rawComplexity,
            attackRate,
            decayRate,
            dt
        )
        
        -- Apply response curve
        local curvedComplexity = applyCurve(smoothedComplexity, p[6])
        
        -- Calculate output voltage
        local minV = p[4]
        local maxV = p[5]
        local invert = (p[7] == 2)
        local outputVoltage = toVoltage(curvedComplexity, minV, maxV, invert)
        
        -- Calculate threshold gate with hysteresis
        local threshold = p[8] / 100.0
        local hysteresis = p[9] / 100.0
        
        if gateOutput then
            -- Gate is high, check for low threshold
            if smoothedComplexity < (threshold - hysteresis) then
                gateOutput = false
            end
        else
            -- Gate is low, check for high threshold
            if smoothedComplexity > (threshold + hysteresis) then
                gateOutput = true
            end
        end
        
        local gateVoltage = gateOutput and 5.0 or 0.0
        
        -- Track time since last activity
        lastActivityTime = lastActivityTime + dt
        
        return { outputVoltage, gateVoltage }
    end
    
    ----------------------------------------------------------------------------
    -- Display Drawing
    ----------------------------------------------------------------------------
    , draw = function(self)
        local p = self.parameters
        
        -- Mode names for display
        local modeNames = { "STD", "DRM", "AMB", "RCT" }
        local modeName = modeNames[p[10]] or "???"
        
        -- Draw mode indicator
        drawTinyText(240, 8, modeName, 10, "right")
        
        -- Draw activity bars for each input (bottom section)
        local barWidth = 28
        local barHeight = 16
        local barY = 46
        local barSpacing = 32
        local startX = 4
        
        for i = 1, NUM_INPUTS do
            local x = startX + (i - 1) * barSpacing
            local activity = inputActivity[i] / (MAX_ACTIVITY / NUM_INPUTS)
            
            -- Draw bar outline
            drawBox(x, barY, x + barWidth - 2, barY + barHeight, 3)
            
            -- Draw filled portion based on activity
            if activity > 0.01 then
                local fillHeight = math.floor(activity * barHeight)
                local fillY = barY + barHeight - fillHeight
                drawRectangle(x + 1, fillY, x + barWidth - 3, barY + barHeight - 1, 
                    gateStates[i] and 15 or 8)
            end
            
            -- Draw gate indicator dot
            if gateStates[i] then
                drawRectangle(x + 12, barY - 3, x + 14, barY - 1, 15)
            end
            
            -- Draw input number
            drawTinyText(x + 13, barY + barHeight + 8, tostring(i), 6, "centre")
        end
        
        -- Draw main complexity meter (top right area)
        local meterX = 180
        local meterY = 16
        local meterWidth = 70
        local meterHeight = 24
        
        -- Meter outline
        drawBox(meterX, meterY, meterX + meterWidth, meterY + meterHeight, 6)
        
        -- Filled portion
        local fillWidth = math.floor(smoothedComplexity * (meterWidth - 2))
        if fillWidth > 0 then
            -- Color based on level
            local brightness = 4 + math.floor(smoothedComplexity * 11)
            drawRectangle(meterX + 1, meterY + 1, 
                meterX + 1 + fillWidth, meterY + meterHeight - 1, brightness)
        end
        
        -- Draw threshold marker
        local threshold = p[8] / 100.0
        local thresholdX = meterX + math.floor(threshold * meterWidth)
        drawLine(thresholdX, meterY - 2, thresholdX, meterY + meterHeight + 2, 
            gateOutput and 15 or 5)
        
        -- Draw percentage text
        local pctText = string.format("%d%%", math.floor(smoothedComplexity * 100))
        drawText(meterX + meterWidth / 2, meterY + 18, pctText, 15, "centre")
        
        -- Draw output voltage
        local minV = p[4]
        local maxV = p[5]
        local invert = (p[7] == 2)
        local curvedComplexity = applyCurve(smoothedComplexity, p[6])
        local outV = toVoltage(curvedComplexity, minV, maxV, invert)
        local voltText = string.format("%.2fV", outV)
        drawText(meterX + meterWidth / 2, meterY - 4, voltText, 12, "centre")
        
        -- Draw gate output indicator
        if gateOutput then
            drawRectangle(meterX + meterWidth + 4, meterY + 4, 
                meterX + meterWidth + 12, meterY + meterHeight - 4, 15)
            drawTinyText(meterX + meterWidth + 8, meterY + meterHeight + 6, "G", 10, "centre")
        else
            drawBox(meterX + meterWidth + 4, meterY + 4,
                meterX + meterWidth + 12, meterY + meterHeight - 4, 4)
            drawTinyText(meterX + meterWidth + 8, meterY + meterHeight + 6, "G", 4, "centre")
        end
        
        -- Label
        drawTinyText(meterX, meterY - 4, "OUT", 8)
        
        -- Draw invert indicator if active
        if invert then
            drawTinyText(meterX + meterWidth - 8, meterY - 4, "INV", 10, "right")
        end
    end
}
