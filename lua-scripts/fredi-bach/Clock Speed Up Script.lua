-- Clock Speed Up
--[[
Gate-triggered clock accelerator for build-ups before drops.
When gate is LOW: passes through the input clock unchanged.
When gate is HIGH: generates an accelerating internal clock that 
speeds up from the original tempo toward a configurable maximum.
When gate returns LOW: instantly snaps back to the original clock.

Patch example:
  Master Clock -> Input 1 (Clock)
  Trigger/Gate -> Input 2 (Accel Gate)  
  Output 1     -> Sequencer/Drums

Perfect for EDM build-ups, tension risers, and dramatic transitions.
]]

--------------------------------------------------------------------------------
-- Configuration Constants
--------------------------------------------------------------------------------

local PULSE_WIDTH = 0.01       -- Output trigger pulse width (10ms)
local MIN_PERIOD = 0.025       -- Minimum period cap (prevents >2400 BPM)
local DEFAULT_PERIOD = 0.5     -- Default period before first clock (120 BPM)
local PERIOD_SMOOTHING = 0.3   -- Smoothing factor for period measurement

--------------------------------------------------------------------------------
-- Easing Functions
-- All take progress (0-1) and return eased value (0-1)
--------------------------------------------------------------------------------

local easingFunctions = {
    -- Linear: constant acceleration rate
    function(t) 
        return t 
    end,
    
    -- Exponential In: slow start, accelerates rapidly toward end
    function(t) 
        return t * t 
    end,
    
    -- Exponential Out: fast start, decelerates toward end  
    function(t) 
        return 1 - (1 - t) * (1 - t) 
    end,
    
    -- S-Curve (Smoothstep): smooth start and end, fast middle
    function(t) 
        return t * t * (3 - 2 * t) 
    end,
    
    -- Cubic In: very slow start, very fast end
    function(t) 
        return t * t * t 
    end,
    
    -- Cubic Out: very fast start, very slow end
    function(t) 
        local inv = 1 - t
        return 1 - inv * inv * inv 
    end
}

local easingNames = { "Linear", "Exp In", "Exp Out", "S-Curve", "Cubic In", "Cubic Out" }

--------------------------------------------------------------------------------
-- State Variables (local to script chunk)
--------------------------------------------------------------------------------

local state = {
    -- Gate and mode tracking
    gateHigh = false,
    accelStartTime = 0.0,
    
    -- Clock timing
    totalTime = 0.0,
    measuredPeriod = DEFAULT_PERIOD,
    lastTriggerTime = 0.0,
    triggerCount = 0,
    
    -- Internal clock generator (used during acceleration)
    internalPhase = 0.0,
    currentMultiplier = 1.0,
    
    -- Output pulse management
    outputHigh = false,
    pulseTimer = 0.0
}

--------------------------------------------------------------------------------
-- Main Script Table
--------------------------------------------------------------------------------

return
{
    name = 'Clock Speed Up'
,   author = 'Modular Synthesis'

    ------------------------------------------------------------------------
    -- Initialization
    ------------------------------------------------------------------------
,   init = function(self)
        -- Reset state on load
        state.gateHigh = false
        state.totalTime = 0.0
        state.measuredPeriod = DEFAULT_PERIOD
        state.lastTriggerTime = 0.0
        state.triggerCount = 0
        state.internalPhase = 0.0
        state.currentMultiplier = 1.0
        state.outputHigh = false
        state.pulseTimer = 0.0
        
        return
        {
            -- Input 1: Clock trigger to pass through or measure
            -- Input 2: Gate to enable acceleration mode
            inputs = { kTrigger, kGate }
        ,   inputNames = { "Clock In", "Accel Gate" }
        
            -- Single clock output
        ,   outputs = { kStepped }
        ,   outputNames = { "Clock Out" }
        
            -- User-configurable parameters
        ,   parameters = 
            {
                -- Time to ramp from 1x to max speed (0.5 to 20.0 seconds)
                { "Ramp Time", 5, 200, 40, kSeconds, kBy10 }
                
                -- Maximum speed multiplier (1.5x to 16.0x)
            ,   { "Max Speed", 15, 160, 40, kNone, kBy10 }
                
                -- Easing curve selection
            ,   { "Easing", easingNames, 4 }  -- Default: S-Curve
            }
        }
    end

    ------------------------------------------------------------------------
    -- Step Function (called every ~1ms)
    -- Handles pulse timing and accelerated clock generation
    ------------------------------------------------------------------------
,   step = function(self, dt, inputs)
        state.totalTime = state.totalTime + dt
        
        -- Handle output pulse ending (both modes)
        if state.outputHigh then
            state.pulseTimer = state.pulseTimer + dt
            if state.pulseTimer >= PULSE_WIDTH then
                state.outputHigh = false
                state.pulseTimer = 0
                return { 0.0 }
            end
        end
        
        -- Pass-through mode: triggers handled by trigger() callback
        if not state.gateHigh then
            return {}
        end
        
        ----------------------------------------------------------------------
        -- Acceleration Mode: Generate speeding internal clock
        ----------------------------------------------------------------------
        
        local rampTime = self.parameters[1]     -- Seconds to reach max
        local maxSpeed = self.parameters[2]     -- Maximum multiplier
        local easingIdx = self.parameters[3]    -- Easing function index
        local easingFunc = easingFunctions[easingIdx]
        
        -- Calculate acceleration progress (0 to 1)
        local elapsed = state.totalTime - state.accelStartTime
        local progress = math.min(elapsed / rampTime, 1.0)
        
        -- Apply easing curve
        local easedProgress = easingFunc(progress)
        
        -- Calculate current speed multiplier (1.0 to maxSpeed)
        state.currentMultiplier = 1.0 + easedProgress * (maxSpeed - 1.0)
        
        -- Calculate current period with minimum cap
        local currentPeriod = math.max(
            state.measuredPeriod / state.currentMultiplier, 
            MIN_PERIOD
        )
        
        -- Advance internal clock phase
        state.internalPhase = state.internalPhase + dt / currentPeriod
        
        -- Generate trigger when phase wraps
        if state.internalPhase >= 1.0 then
            state.internalPhase = state.internalPhase - 1.0
            state.outputHigh = true
            state.pulseTimer = 0
            return { 5.0 }
        end
        
        return {}
    end

    ------------------------------------------------------------------------
    -- Trigger Callback
    -- Called when clock input receives a trigger
    ------------------------------------------------------------------------
,   trigger = function(self, input)
        if input == 1 then
            -- Always measure the incoming clock period
            if state.lastTriggerTime > 0 then
                local period = state.totalTime - state.lastTriggerTime
                
                -- Sanity check: accept periods from ~6 BPM to 3000 BPM
                if period > 0.02 and period < 10.0 then
                    -- Apply smoothing to reduce jitter
                    if state.triggerCount < 3 then
                        -- First few triggers: faster adaptation
                        state.measuredPeriod = period
                    else
                        -- Steady state: smooth the measurement
                        state.measuredPeriod = state.measuredPeriod * (1 - PERIOD_SMOOTHING) 
                                             + period * PERIOD_SMOOTHING
                    end
                    state.triggerCount = state.triggerCount + 1
                end
            end
            state.lastTriggerTime = state.totalTime
            
            -- In pass-through mode: output the trigger
            if not state.gateHigh then
                state.outputHigh = true
                state.pulseTimer = 0
                return { 5.0 }
            end
            -- In acceleration mode: we ignore input triggers for output
            -- (but still measure period above for when we return to pass-through)
        end
        return {}
    end

    ------------------------------------------------------------------------
    -- Gate Callback  
    -- Called when acceleration gate opens or closes
    ------------------------------------------------------------------------
,   gate = function(self, input, rising)
        if input == 2 then
            if rising then
                -- Gate opened: begin acceleration
                state.gateHigh = true
                state.accelStartTime = state.totalTime
                state.currentMultiplier = 1.0
                state.internalPhase = 0.0
            else
                -- Gate closed: return to pass-through mode
                state.gateHigh = false
                state.currentMultiplier = 1.0
                -- Note: output state is preserved; next trigger will come from input
            end
        end
        return {}
    end

    ------------------------------------------------------------------------
    -- Custom Display
    ------------------------------------------------------------------------
,   draw = function(self)
        local rampTime = self.parameters[1]
        local maxSpeed = self.parameters[2]
        local easingIdx = self.parameters[3]
        
        -- Mode indicator at top
        if state.gateHigh then
            drawRectangle(0, 12, 255, 24, 2)  -- Subtle background
            drawText(128, 22, "ACCELERATING", 15, "centre")
        else
            drawText(128, 22, "PASS-THROUGH", 8, "centre")
        end
        
        -- Large speed multiplier display
        local multStr = string.format("%.2fx", state.currentMultiplier)
        drawText(128, 42, multStr, 15, "centre")
        
        -- Progress bar (only during acceleration)
        local barX, barY, barW, barH = 24, 48, 208, 6
        if state.gateHigh then
            local elapsed = state.totalTime - state.accelStartTime
            local progress = math.min(elapsed / rampTime, 1.0)
            
            -- Bar background
            drawBox(barX, barY, barX + barW, barY + barH, 4)
            
            -- Filled portion
            if progress > 0 then
                local fillW = math.floor(progress * (barW - 2))
                if fillW > 0 then
                    drawRectangle(barX + 1, barY + 1, barX + 1 + fillW, barY + barH - 1, 12)
                end
            end
        else
            -- When not accelerating, show a dim empty bar
            drawBox(barX, barY, barX + barW, barY + barH, 2)
        end
        
        -- BPM info at bottom
        local baseBPM = 60.0 / state.measuredPeriod
        local currentBPM = baseBPM * state.currentMultiplier
        
        drawTinyText(barX, 62, string.format("%.0f BPM", baseBPM), 6)
        drawTinyText(barX + barW, 62, string.format("%.0f BPM", currentBPM), 10, "right")
        
        -- Easing indicator
        drawTinyText(128, 62, easingNames[easingIdx], 4, "centre")
    end
}
