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
local MODE_NAMES = { "STD", "DRM", "AMB", "RCT" }

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
        self.display_input_flashes = {}
        self.display_input_peaks = {}
        for i = 1, NUM_INPUTS do
            inputActivity[i] = 0.0
            gateStates[i] = false
            triggerCounts[i] = 0
            self.display_input_flashes[i] = 0.0
            self.display_input_peaks[i] = 0.0
        end
        
        rawComplexity = 0.0
        smoothedComplexity = 0.0
        gateOutput = false
        lastActivityTime = 0
        self.display_threshold_flash = 0.0
        self.display_output_voltage = 0.0
        
        return {
            -- 8 trigger/gate inputs for activity monitoring
            inputs = { 
                kGate, -- Type: Gate, Synced: true, Division: 1/4
                kGate, -- Type: Gate, Synced: true, Division: 1/8
                kGate, -- Type: Gate, Synced: true, Division: 1/2
                kGate, -- Type: Gate, Synced: true, Division: 1 bar
                kGate, -- Type: Gate, Synced: true, Division: 1/16
                kGate, -- Type: Gate, Synced: true, Division: 2 bars
                kGate, -- Type: Gate, Synced: true, Division: 1/32
                kGate, -- Type: Gate, Synced: true, Division: 1/4
            }
            , inputNames = {
                "Gate 1", "Gate 2", "Gate 3", "Gate 4",
                "Gate 5", "Gate 6", "Gate 7", "Gate 8"
            }
            
            -- 2 outputs: main CV and threshold gate
            , outputs = {
                kLinear,  -- Type: Off
                kStepped, -- Type: Synth Trigger
            }
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
            self.display_input_flashes[input] = 1.0
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
        local eventLifetime = math.max(0.08, activityWindowMs / 1000)
        local peakLifetime = math.max(0.12, eventLifetime * 1.5)
        
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

            -- Presentation latches retain fast events for the 30 fps screen.
            -- Their lifetimes follow the effective activity window, including
            -- the selected mode's timing adjustments.
            local normalizedActivity = inputActivity[i]
                / (MAX_ACTIVITY / NUM_INPUTS)
            self.display_input_flashes[i] = math.max(
                0,
                self.display_input_flashes[i] - dt / eventLifetime
            )
            self.display_input_peaks[i] = math.max(
                normalizedActivity,
                self.display_input_peaks[i] - dt / peakLifetime
            )
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
        self.display_output_voltage = outputVoltage
        
        -- Calculate threshold gate with hysteresis
        local threshold = p[8] / 100.0
        local hysteresis = p[9] / 100.0
        
        local previousGateOutput = gateOutput
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

        if gateOutput ~= previousGateOutput then
            self.display_threshold_flash = 1.0
        else
            self.display_threshold_flash = math.max(
                0,
                self.display_threshold_flash - dt * 8
            )
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

        drawStandardParameterLine()

        local tankLeft = 7
        local tankRight = 200
        local tankTop = 31
        local tankBottom = 54
        local pipeTop = 14
        local pipeBottom = tankTop

        -- Eight activity pipes feed one shared reservoir. Current activity
        -- forms the live column; the slower peak is its fading wake.
        for i = 1, NUM_INPUTS do
            local x = 16 + (i - 1) * 24
            local activity = inputActivity[i] / (MAX_ACTIVITY / NUM_INPUTS)
            local peak = self.display_input_peaks[i]
            local gateShade = gateStates[i] and 15 or 8

            drawTinyText(
                x,
                13,
                tostring(i),
                gateStates[i] and 15 or 5,
                "centre"
            )
            drawLine(x - 3, pipeTop, x - 3, pipeBottom, 2)
            drawLine(x + 3, pipeTop, x + 3, pipeBottom, 2)

            if peak > 0.01 then
                local peakTop = pipeBottom
                    - math.floor(peak * (pipeBottom - pipeTop - 1))
                drawLine(x, peakTop, x, pipeBottom - 1, 4)
            end

            if activity > 0.01 then
                local activityTop = pipeBottom
                    - math.floor(activity * (pipeBottom - pipeTop - 1))
                drawRectangle(
                    x - 1,
                    activityTop,
                    x + 1,
                    pipeBottom - 1,
                    gateShade
                )
            end

            -- A rising gate sends a bright droplet down the pipe. The elapsed
            -- position is derived from the latched flash, never draw frames.
            local flash = self.display_input_flashes[i]
            if flash > 0 then
                local dropletY = pipeTop
                    + (1 - flash) * (pipeBottom - pipeTop - 1)
                drawSmoothCircle(
                    x,
                    dropletY,
                    gateStates[i] and 2.2 or 1.7,
                    9 + math.floor(flash * 6)
                )
            end
        end

        -- Complexity literally fills the shared tank. The threshold remains
        -- linear even when Response curves or Invert alter the CV output.
        drawBox(tankLeft, tankTop, tankRight, tankBottom, 4)
        local fillHeight = math.floor(
            smoothedComplexity * (tankBottom - tankTop - 3)
        )
        if fillHeight > 0 then
            local surfaceY = tankBottom - 1 - fillHeight
            local fillShade = 5 + math.floor(smoothedComplexity * 6)
            drawRectangle(
                tankLeft + 2,
                surfaceY,
                tankRight - 2,
                tankBottom - 2,
                fillShade
            )
            drawLine(
                tankLeft + 2,
                surfaceY,
                tankRight - 2,
                surfaceY,
                12
            )
        end

        local threshold = p[8] / 100.0
        local thresholdY = tankBottom - 2
            - math.floor(threshold * (tankBottom - tankTop - 4))
        drawRectangle(
            tankLeft + 1,
            thresholdY - 1,
            tankRight - 1,
            thresholdY + 1,
            gateOutput and 15 or 7
        )

        drawText(
            104,
            49,
            string.format("%d%%", math.floor(smoothedComplexity * 100)),
            15,
            "centre"
        )

        -- The threshold gate opens the outlet valve. Invert flips only this
        -- output indicator vertically; the activity story remains unchanged.
        local invert = p[7] == 2
        local outletY = invert and 48 or 38
        local flash = self.display_threshold_flash
        local valveShade = gateOutput and 15 or 5
        drawLine(tankRight, outletY, 204, outletY, valveShade)
        drawBox(204, outletY - 3, 212, outletY + 3, valveShade)
        if gateOutput then
            drawRectangle(205, outletY - 2, 211, outletY + 2, 15)
        end
        drawLine(212, outletY, 218, outletY, valveShade)
        drawSmoothCircle(
            218 + flash * 3,
            outletY,
            flash > 0 and 2.2 or 1.2,
            math.min(15, valveShade + math.floor(flash * 7))
        )
        drawTinyText(
            252,
            outletY + 2,
            string.format("%+.2fV", self.display_output_voltage),
            gateOutput and 13 or 8,
            "right"
        )

        drawTinyText(252, 13, MODE_NAMES[p[10]] or "???", 10, "right")

        return true
    end
}
