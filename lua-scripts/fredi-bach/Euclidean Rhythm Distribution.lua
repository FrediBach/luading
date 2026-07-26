-- Skewed Euclidean
--[[
Euclidean rhythm generator with variable hit distribution.
At 50% distribution: standard Euclidean (evenly spaced hits).
At 0%: all hits clustered at the pattern start.
At 100%: all hits clustered at the pattern end.
CV input allows real-time morphing between these distributions.

Inputs: Clock, Reset, Distribution CV (±5V = ±50%)
Outputs: Trigger (on hits), Inverted (on non-hits)
]]

--------------------------------------------------------------------------------
-- Local state variables
--------------------------------------------------------------------------------
local currentStep = 0          -- Current position in the pattern (1-based when active)
local pattern = {}             -- Boolean array: true = hit, false = rest
local patternLength = 8        -- Cached pattern length
local triggerOut = 0           -- Current trigger output voltage
local invertedOut = 0          -- Current inverted output voltage
local triggerTimer = 0         -- Countdown for trigger pulse width (in seconds)

-- Cache for pattern recalculation optimization
local cachedSteps = -1
local cachedHits = -1
local cachedDist = -1
local cachedRotation = -1

--------------------------------------------------------------------------------
-- Pattern calculation function
-- Implements the skewed Euclidean algorithm with smooth distribution morphing
--------------------------------------------------------------------------------
local function calculatePattern(steps, hits, distribution, rotation)
    -- Initialize empty pattern
    local p = {}
    for i = 1, steps do
        p[i] = false
    end
    
    -- Edge cases
    if hits <= 0 or steps <= 0 then
        return p
    end
    hits = math.min(hits, steps)  -- Can't have more hits than steps
    
    -- Calculate interpolated positions for each hit
    local rawPositions = {}
    for i = 0, hits - 1 do
        -- Three reference positions for interpolation:
        -- 1. Front (dist=0): hits clustered at beginning [0, 1, 2, ...]
        local frontPos = i
        
        -- 2. Euclidean (dist=0.5): evenly distributed across pattern
        --    This is the Bresenham-style even spacing
        local euclidPos = (i * steps) / hits
        
        -- 3. Back (dist=1): hits clustered at end [N-K, N-K+1, ..., N-1]
        local backPos = steps - hits + i
        
        -- Piecewise linear interpolation
        local pos
        if distribution <= 0.5 then
            -- Interpolate between front-clustered and Euclidean
            local t = distribution * 2  -- Maps [0, 0.5] -> [0, 1]
            pos = frontPos + (euclidPos - frontPos) * t
        else
            -- Interpolate between Euclidean and back-clustered
            local t = (distribution - 0.5) * 2  -- Maps [0.5, 1] -> [0, 1]
            pos = euclidPos + (backPos - euclidPos) * t
        end
        
        rawPositions[i + 1] = pos
    end
    
    -- Convert continuous positions to discrete steps
    -- Handle potential collisions when positions round to the same step
    local occupied = {}
    
    for i = 1, hits do
        -- Round to nearest integer step
        local idealPos = math.floor(rawPositions[i] + 0.5)
        
        -- Apply rotation (pattern phase offset)
        local finalPos = (idealPos + rotation) % steps
        
        -- Collision resolution: if position is already occupied,
        -- search for nearest unoccupied position (alternating directions)
        if occupied[finalPos] then
            local found = false
            for searchRadius = 1, steps - 1 do
                -- Try position after
                local tryPos = (finalPos + searchRadius) % steps
                if not occupied[tryPos] then
                    finalPos = tryPos
                    found = true
                    break
                end
                -- Try position before
                tryPos = (finalPos - searchRadius + steps) % steps
                if not occupied[tryPos] then
                    finalPos = tryPos
                    found = true
                    break
                end
            end
            -- If still not found (shouldn't happen), skip this hit
            if not found then
                goto continue
            end
        end
        
        occupied[finalPos] = true
        p[finalPos + 1] = true  -- Convert 0-based to 1-based Lua indexing
        
        ::continue::
    end
    
    return p
end

--------------------------------------------------------------------------------
-- Helper function to check if pattern needs recalculation
--------------------------------------------------------------------------------
local function needsPatternUpdate(steps, hits, dist, rotation)
    -- Use small epsilon for float comparison on distribution
    local distChanged = math.abs(dist - cachedDist) > 0.005
    return steps ~= cachedSteps or 
           hits ~= cachedHits or 
           distChanged or 
           rotation ~= cachedRotation
end

--------------------------------------------------------------------------------
-- Main script table returned to the Disting NT system
--------------------------------------------------------------------------------
return
{
    name = 'SkewedEuclid'
    , author = 'Claude'
    
    ------------------------------------------------------------------------
    -- Initialization: Define inputs, outputs, and parameters
    ------------------------------------------------------------------------
    , init = function(self)
        -- Initialize state
        self.distCV = 0
        currentStep = 0
        triggerTimer = 0
        
        -- Calculate initial pattern with defaults
        pattern = calculatePattern(8, 3, 0.5, 0)
        patternLength = 8
        cachedSteps = 8
        cachedHits = 3
        cachedDist = 0.5
        cachedRotation = 0
        
        return
        {
            -- Input definitions
            -- kTrigger: system calls trigger() on rising edge
            -- kCV: continuous voltage available in step()
            inputs = { kTrigger, kTrigger, kCV }
            , inputNames = { "Clock", "Reset", "Dist CV" }
            
            -- Output definitions
            -- kStepped: discrete values, no interpolation between steps
            , outputs = { kStepped, kStepped }
            , outputNames = { "Trigger", "Inverted" }
            
            -- Parameter definitions
            -- Format: { name, min, max, default, unit, [scale] }
            , parameters = 
            {
                { "Steps", 2, 32, 8 }                    -- Pattern length
                , { "Hits", 0, 32, 3 }                   -- Number of active steps
                , { "Distribution", 0, 100, 50, kPercent }  -- Hit placement bias
                , { "Rotation", 0, 31, 0 }              -- Pattern phase offset
                , { "Trig Length", 1, 50, 10, kMs }     -- Output pulse width
            }
        }
    end
    
    ------------------------------------------------------------------------
    -- Step function: Called every 1ms for continuous processing
    -- Handles CV input reading and trigger timing
    ------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        -- Read distribution CV from input 3 (index 3 in inputs array)
        -- Store for use in trigger function
        self.distCV = inputs[3] or 0
        
        -- Handle trigger pulse timing
        -- Decrement timer and turn off outputs when timer expires
        if triggerTimer > 0 then
            triggerTimer = triggerTimer - dt
            if triggerTimer <= 0 then
                triggerTimer = 0
                triggerOut = 0
                invertedOut = 0
            end
        end
        
        return { triggerOut, invertedOut }
    end
    
    ------------------------------------------------------------------------
    -- Trigger function: Called when a trigger input fires
    -- Handles clock advancement and reset
    ------------------------------------------------------------------------
    , trigger = function(self, input)
        -- Read current parameter values
        local steps = self.parameters[1]
        local hits = math.min(self.parameters[2], steps)
        local baseDist = self.parameters[3] / 100.0  -- Convert percentage to 0-1
        local rotation = self.parameters[4] % steps
        local trigLengthMs = self.parameters[5]
        
        -- Apply CV modulation to distribution
        -- ±5V CV range maps to ±50% modulation
        local dist = baseDist + (self.distCV * 0.1)
        dist = math.max(0, math.min(1, dist))  -- Clamp to valid range
        
        -- Recalculate pattern if any parameters changed
        if needsPatternUpdate(steps, hits, dist, rotation) then
            pattern = calculatePattern(steps, hits, dist, rotation)
            patternLength = steps
            cachedSteps = steps
            cachedHits = hits
            cachedDist = dist
            cachedRotation = rotation
            
            -- Constrain current step to new pattern length
            if currentStep > patternLength then
                currentStep = 1
            end
        end
        
        -- Handle clock input (input 1)
        if input == 1 then
            -- Advance to next step (wrap around at pattern end)
            currentStep = currentStep + 1
            if currentStep > patternLength then
                currentStep = 1
            end
            
            -- Determine if current step is a hit
            local isHit = pattern[currentStep] or false
            
            -- Set output voltages
            -- Main output: 5V on hit, 0V on rest
            -- Inverted output: 0V on hit, 5V on rest
            triggerOut = isHit and 5.0 or 0.0
            invertedOut = isHit and 0.0 or 5.0
            
            -- Start trigger timer (convert ms to seconds)
            triggerTimer = trigLengthMs / 1000.0
            
            return { triggerOut, invertedOut }
        
        -- Handle reset input (input 2)
        elseif input == 2 then
            -- Reset step counter to 0 (next clock will advance to step 1)
            currentStep = 0
            return {}
        end
        
        return {}
    end
    
    ------------------------------------------------------------------------
    -- Draw function: Called at ~30fps to render custom display
    ------------------------------------------------------------------------
    , draw = function(self)
        -- Read parameters for display
        local steps = self.parameters[1]
        local hits = self.parameters[2]
        local dist = self.parameters[3]
        
        -- Calculate layout for pattern visualization
        -- Display is 256x64 pixels
        local margin = 8
        local maxStepWidth = 12
        local minStepWidth = 4
        
        -- Calculate step width to fit all steps on screen
        local availWidth = 256 - (2 * margin)
        local stepWidth = math.floor(availWidth / steps)
        stepWidth = math.max(minStepWidth, math.min(maxStepWidth, stepWidth))
        
        -- Center the pattern horizontally
        local totalWidth = stepWidth * steps
        local startX = math.floor((256 - totalWidth) / 2)
        local centerY = 34
        
        -- Draw each step as a box
        for i = 1, steps do
            local x = startX + (i - 1) * stepWidth
            local isHit = pattern[i]
            local isCurrent = (i == currentStep)
            
            -- Determine box height (current step is taller)
            local boxHeight = isCurrent and 13 or 10
            
            -- Determine brightness based on hit/current status
            local brightness
            if isHit then
                brightness = isCurrent and 15 or 9
            else
                brightness = isCurrent and 7 or 2
            end
            
            -- Draw filled rectangle for hits, outline for rests
            local x1 = x + 1
            local y1 = centerY - boxHeight
            local x2 = x + stepWidth - 2
            local y2 = centerY + boxHeight
            
            if isHit then
                drawRectangle(x1, y1, x2, y2, brightness)
            else
                drawBox(x1, y1, x2, y2, brightness)
            end
        end
        
        -- Draw info line at bottom
        -- Show distribution mode label
        local distLabel
        if dist < 20 then
            distLabel = "Front"
        elseif dist > 80 then
            distLabel = "Back"
        elseif dist >= 45 and dist <= 55 then
            distLabel = "Euclid"
        else
            distLabel = dist .. "%"
        end
        
        -- Format: E(hits,steps) Distribution
        local infoText = string.format("E(%d,%d) %s", hits, steps, distLabel)
        drawTinyText(128, 58, infoText, 10, "centre")
        
        -- Draw step counter
        local stepText = string.format("Step %d/%d", currentStep, steps)
        drawTinyText(128, 10, stepText, 6, "centre")
    end
}
