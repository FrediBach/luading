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
local DISPLAY_RING_COUNT = 6
local DISPLAY_RING_LIFETIME = 0.42

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
    pulseTimer = 0.0,

    -- Read-only presentation state consumed by draw()
    displayMultiplier = 1.0,
    displayPeriodValid = false,
    displayRingTimes = {},
    displayRingCursor = 0
}

local function clamp(value, minimum, maximum)
    return math.max(minimum, math.min(maximum, value))
end

local function clearDisplayRings()
    for i = 1, DISPLAY_RING_COUNT do
        state.displayRingTimes[i] = -1.0
    end
    state.displayRingCursor = 0
end

local function recordDisplayClock()
    state.displayRingCursor = (state.displayRingCursor % DISPLAY_RING_COUNT) + 1
    state.displayRingTimes[state.displayRingCursor] = state.totalTime
end

--------------------------------------------------------------------------------
-- Main Script Table
--------------------------------------------------------------------------------

return
{
    name = 'Clock Speed Up'
,   author = 'Modular Synthesis'

    -- Luading simulator extension; ignored by Disting NT.
,   luading = {
        parameterPresets = {
            { name = 'Default', values = { 4, 4, 4 } }
        ,   { name = 'Quick Launch', values = { 1, 8, 3 } }
        ,   { name = 'Long Build', values = { 12, 16, 4 } }
        }
    }

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
        state.displayMultiplier = 1.0
        state.displayPeriodValid = false
        state.displayRingTimes = {}
        clearDisplayRings()
        
        return
        {
            -- Input 1: Clock trigger to pass through or measure
            -- Input 2: Gate to enable acceleration mode
            inputs = {
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/4
                kGate,    -- Type: Gate, Synced: true, Division: 1 bar
            }
        ,   inputNames = { "Clock In", "Accel Gate" }
        
            -- Single clock output
        ,   outputs = {
                kStepped, -- Type: Hi-hat Trigger
            }
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

        -- Smooth only the presentation of the multiplier. Musical timing
        -- continues to use state.currentMultiplier directly.
        local displayTarget = state.gateHigh and state.currentMultiplier or 1.0
        local displayAlpha = clamp(dt * 12.0, 0, 1)
        state.displayMultiplier = state.displayMultiplier
            + (displayTarget - state.displayMultiplier) * displayAlpha
        
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
            recordDisplayClock()
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
                    state.displayPeriodValid = true
                end
            end
            state.lastTriggerTime = state.totalTime
            
            -- In pass-through mode: output the trigger
            if not state.gateHigh then
                state.outputHigh = true
                state.pulseTimer = 0
                recordDisplayClock()
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
                state.displayMultiplier = 1.0
                clearDisplayRings()
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

        drawStandardParameterLine()

        local centerX = 128
        local centerY = 34
        local outerRadius = 24
        local progress = 0.0
        if state.gateHigh then
            local elapsed = state.totalTime - state.accelStartTime
            progress = clamp(elapsed / rampTime, 0, 1)
        end

        if not state.displayPeriodValid then
            -- A tempo needs two input clocks. Until then, use a waiting
            -- crosshair rather than presenting DEFAULT_PERIOD as measured.
            drawCircle(centerX, centerY, 8, 3)
            drawLine(centerX - 14, centerY, centerX + 14, centerY, 6)
            drawLine(centerX, centerY - 14, centerX, centerY + 14, 6)
            drawCircle(centerX, centerY, 2, 10)
            drawTinyText(centerX, centerY + 20, "CLOCK?", 6, "centre")
        elseif state.gateHigh then
            -- Six guide rings form the tunnel. Their spacing is the selected
            -- easing curve itself, so changing Easing changes the picture
            -- without adding a curve-name label.
            local easingFunc = easingFunctions[easingIdx]
            for i = 1, DISPLAY_RING_COUNT do
                local ringProgress = i / DISPLAY_RING_COUNT
                local easedRadius = easingFunc(ringProgress)
                local radius = 3 + easedRadius * (outerRadius - 5)
                local shade = 2 + math.floor((i / DISPLAY_RING_COUNT) * 3)
                drawCircle(centerX, centerY, radius, shade)
            end

            -- Max Speed is the fixed target at the mouth of the tunnel.
            local maxShade = 4 + math.floor(
                clamp((maxSpeed - 1.5) / 14.5, 0, 1) * 4
            )
            drawCircle(centerX, centerY, outerRadius, maxShade)
            drawLine(
                centerX,
                centerY - outerRadius - 2,
                centerX,
                centerY - outerRadius + 2,
                maxShade + 2
            )
            drawLine(
                centerX + outerRadius - 2,
                centerY,
                centerX + outerRadius + 2,
                centerY,
                maxShade + 2
            )
            drawLine(
                centerX,
                centerY + outerRadius - 2,
                centerX,
                centerY + outerRadius + 2,
                maxShade + 2
            )
            drawLine(
                centerX - outerRadius - 2,
                centerY,
                centerX - outerRadius + 2,
                centerY,
                maxShade + 2
            )
        else
            -- Pass-through settles immediately to one calm clock face.
            drawCircle(centerX, centerY, 9, 5)
            drawLine(centerX, centerY - 7, centerX, centerY - 2, 7)
            drawLine(centerX, centerY, centerX + 5, centerY + 3, 7)
            drawCircle(centerX, centerY, 1, 10)
        end

        -- Real output clocks rush from the center to the tunnel mouth. The
        -- fixed six-slot history naturally compresses as clocks accelerate.
        if state.displayPeriodValid then
            for i = 1, DISPLAY_RING_COUNT do
                local started = state.displayRingTimes[i]
                if started >= 0 then
                    local age = state.totalTime - started
                    local ringProgress = age / DISPLAY_RING_LIFETIME
                    if ringProgress >= 0 and ringProgress <= 1 then
                        local easedTravel = 1
                            - (1 - ringProgress) * (1 - ringProgress)
                        local radius = 2
                            + easedTravel * (outerRadius - 2)
                        local shade = 15 - math.floor(ringProgress * 9)
                        drawSmoothCircle(centerX, centerY, radius, shade)
                    end
                end
            end
        end

        -- Ramp Time appears as a faint radial progress arc.
        if state.gateHigh and progress > 0 then
            local arcSegments = 16
            local visibleSegments = math.max(
                1,
                math.floor(progress * arcSegments)
            )
            local previousX = centerX
            local previousY = centerY - outerRadius - 2
            for i = 1, visibleSegments do
                local arcProgress = (i / visibleSegments) * progress
                local angle = -math.pi / 2 + arcProgress * math.pi * 2
                local x = centerX
                    + math.cos(angle) * (outerRadius + 2)
                local y = centerY
                    + math.sin(angle) * (outerRadius + 2)
                drawSmoothLine(previousX, previousY, x, y, 8)
                previousX = x
                previousY = y
            end
        end

        local modeText = state.gateHigh and "ACCEL" or "PASS"
        drawTinyText(4, 13, modeText, state.gateHigh and 12 or 6)
        drawTinyText(
            centerX,
            63,
            string.format("x%.2f", state.displayMultiplier),
            15,
            "centre"
        )

        if state.displayPeriodValid then
            local baseBPM = 60.0 / state.measuredPeriod
            local currentPeriod = math.max(
                state.measuredPeriod / state.displayMultiplier,
                MIN_PERIOD
            )
            local currentBPM = 60.0 / currentPeriod
            drawTinyText(4, 63, string.format("%.0fBPM", baseBPM), 8)
            drawTinyText(
                252,
                63,
                string.format("%.0fBPM", currentBPM),
                11,
                "right"
            )
        else
            drawTinyText(4, 63, "WAIT", 6)
            drawTinyText(252, 63, "--BPM", 4, "right")
        end

        return true
    end
}
