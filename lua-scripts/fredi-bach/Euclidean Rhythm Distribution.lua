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
-- Display helpers
--------------------------------------------------------------------------------
local DISPLAY_RAIL_LEFT = 22
local DISPLAY_RAIL_RIGHT = 234
local DISPLAY_RAIL_CENTRE_Y = 30
local DISPLAY_MORPH_TIME = 0.16
local DISPLAY_SCAN_TIME = 0.12
local DISPLAY_MAX_BEADS = 32

local function clamp(value, minimum, maximum)
    return math.max(minimum, math.min(maximum, value))
end

local function lerp(from, to, amount)
    return from + (to - from) * amount
end

local function smoothStep(amount)
    local clamped = clamp(amount, 0, 1)
    return clamped * clamped * (3 - 2 * clamped)
end

local function railY(position)
    local distance = position - 0.5
    return DISPLAY_RAIL_CENTRE_Y + distance * distance * 12
end

local function normalizedStep(step, steps)
    if steps <= 1 then return 0.5 end
    return (step - 1) / (steps - 1)
end

local function collectHitPositions(sourcePattern, steps)
    local positions = {}
    for i = 1, steps do
        if sourcePattern[i] then
            positions[#positions + 1] = normalizedStep(i, steps)
        end
    end
    return positions
end

local function initializeDisplayPattern(self, sourcePattern, steps)
    local positions = collectHitPositions(sourcePattern, steps)
    self.display_bead_count = #positions
    for i = 1, DISPLAY_MAX_BEADS do
        local position = positions[i] or 0.5
        local active = i <= #positions and 1 or 0
        self.display_from_positions[i] = position
        self.display_to_positions[i] = position
        self.display_from_active[i] = active
        self.display_to_active[i] = active
    end
end

local function beginDisplayMorph(self, sourcePattern, steps)
    local targets = collectHitPositions(sourcePattern, steps)
    local age = self.display_time - self.display_morph_started
    local progress = 1
    if self.display_morph_started >= 0 and age < DISPLAY_MORPH_TIME then
        progress = smoothStep(age / DISPLAY_MORPH_TIME)
    end

    local previousCount = self.display_bead_count
    local nextCount = #targets
    local beadCount = math.max(previousCount, nextCount)
    local magnetPosition = clamp(self.display_magnet_position, 0, 1)

    for i = 1, DISPLAY_MAX_BEADS do
        local currentPosition = magnetPosition
        local currentActive = 0
        if i <= previousCount then
            currentPosition = lerp(
                self.display_from_positions[i],
                self.display_to_positions[i],
                progress
            )
            currentActive = lerp(
                self.display_from_active[i],
                self.display_to_active[i],
                progress
            )
        end

        self.display_from_positions[i] = currentPosition
        self.display_from_active[i] = currentActive
        self.display_to_positions[i] = targets[i] or magnetPosition
        self.display_to_active[i] = i <= nextCount and 1 or 0
    end

    self.display_bead_count = beadCount
    self.display_morph_started = self.display_time
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

        -- Fixed display buffers hold interpolated bead positions. They are
        -- driven from the pattern installed by trigger(), never from draw().
        self.display_time = 0
        self.display_magnet_position = 0.5
        self.display_morph_started = -1
        self.display_bead_count = 0
        self.display_from_positions = {}
        self.display_to_positions = {}
        self.display_from_active = {}
        self.display_to_active = {}
        for i = 1, DISPLAY_MAX_BEADS do
            self.display_from_positions[i] = 0.5
            self.display_to_positions[i] = 0.5
            self.display_from_active[i] = 0
            self.display_to_active[i] = 0
        end
        initializeDisplayPattern(self, pattern, patternLength)
        self.display_previous_step = 0
        self.display_current_step = 0
        self.display_scan_started = -1
        self.display_event_started = -1
        self.display_event_hit = false
        self.display_event_step = 0
        self.display_event_length_ms = 10
        
        return
        {
            -- Input definitions
            -- kTrigger: system calls trigger() on rising edge
            -- kCV: continuous voltage available in step()
            inputs = {
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/8
                kTrigger, -- Type: Trigger, Synced: true, Division: 2 bars
                kCV,      -- Type: Sine LFO, Synced: true, Division: 2 bars
            }
            , inputNames = { "Clock", "Reset", "Dist CV" }
            
            -- Output definitions
            -- kStepped: discrete values, no interpolation between steps
            , outputs = {
                kStepped, -- Type: Kick Trigger
                kStepped, -- Type: Snare Trigger
            }
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

        self.display_time = self.display_time + dt
        local baseDist = self.parameters[3] / 100
        local magnetTarget = clamp(baseDist + self.distCV * 0.1, 0, 1)
        local displayAlpha = clamp(dt * 10, 0, 1)
        self.display_magnet_position = self.display_magnet_position
            + (magnetTarget - self.display_magnet_position) * displayAlpha
        
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
            local nextPattern = calculatePattern(
                steps,
                hits,
                dist,
                rotation
            )
            beginDisplayMorph(self, nextPattern, steps)
            pattern = nextPattern
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
            local previousStep = currentStep
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

            self.display_previous_step = previousStep
            self.display_current_step = currentStep
            self.display_scan_started = self.display_time
            self.display_event_started = self.display_time
            self.display_event_hit = isHit
            self.display_event_step = currentStep
            self.display_event_length_ms = trigLengthMs
            
            return { triggerOut, invertedOut }
        
        -- Handle reset input (input 2)
        elseif input == 2 then
            -- Reset step counter to 0 (next clock will advance to step 1)
            currentStep = 0
            self.display_previous_step = 0
            self.display_current_step = 0
            self.display_scan_started = -1
            self.display_event_started = -1
            self.display_event_step = 0
            return {}
        end
        
        return {}
    end
    
    ------------------------------------------------------------------------
    -- Draw function: Called at ~30fps to render custom display
    ------------------------------------------------------------------------
    , draw = function(self)
        drawStandardParameterLine()

        local steps = patternLength
        local hits = math.min(cachedHits, steps)
        local distribution = clamp(self.display_magnet_position, 0, 1)
        local morphAge = self.display_time - self.display_morph_started
        local morphProgress = 1
        if self.display_morph_started >= 0 and morphAge < DISPLAY_MORPH_TIME then
            morphProgress = smoothStep(morphAge / DISPLAY_MORPH_TIME)
        end

        -- Slightly curved rail with one socket per authoritative pattern step.
        local previousX = DISPLAY_RAIL_LEFT
        local previousY = railY(0)
        for i = 2, steps do
            local position = normalizedStep(i, steps)
            local x = lerp(DISPLAY_RAIL_LEFT, DISPLAY_RAIL_RIGHT, position)
            local y = railY(position)
            drawSmoothLine(previousX, previousY, x, y, 3)
            previousX = x
            previousY = y
        end

        for i = 1, steps do
            local position = normalizedStep(i, steps)
            local x = lerp(DISPLAY_RAIL_LEFT, DISPLAY_RAIL_RIGHT, position)
            drawSmoothCircle(x, railY(position), 1.1, 4)
        end

        -- Rotation phase moves beneath a fixed origin notch.
        drawLine(DISPLAY_RAIL_LEFT, 23, DISPLAY_RAIL_LEFT, 28, 10)
        drawLine(
            DISPLAY_RAIL_LEFT - 3,
            23,
            DISPLAY_RAIL_LEFT + 3,
            23,
            10
        )
        local rotationPosition = normalizedStep(
            (cachedRotation % steps) + 1,
            steps
        )
        local rotationX = lerp(
            DISPLAY_RAIL_LEFT,
            DISPLAY_RAIL_RIGHT,
            rotationPosition
        )
        drawSmoothCircle(rotationX, railY(rotationPosition) + 5, 1.5, 7)

        -- Hit beads slide between cached positions; new/removed hits emerge
        -- from or return to the magnet.
        for i = 1, self.display_bead_count do
            local position = lerp(
                self.display_from_positions[i],
                self.display_to_positions[i],
                morphProgress
            )
            local active = lerp(
                self.display_from_active[i],
                self.display_to_active[i],
                morphProgress
            )
            if active > 0.03 then
                local x = lerp(
                    DISPLAY_RAIL_LEFT,
                    DISPLAY_RAIL_RIGHT,
                    position
                )
                local y = railY(position)
                drawSmoothCircle(
                    x,
                    y,
                    0.7 + active * 1.5,
                    math.floor(7 + active * 6)
                )
            end
        end

        -- A vertical beam scans between the previous and current sockets.
        local scanAge = self.display_time - self.display_scan_started
        local scanProgress = 1
        if self.display_scan_started >= 0 and scanAge < DISPLAY_SCAN_TIME then
            scanProgress = smoothStep(scanAge / DISPLAY_SCAN_TIME)
        end
        local fromStep = clamp(self.display_previous_step, 0, steps)
        local toStep = clamp(self.display_current_step, 0, steps)
        local fromPosition = fromStep > 0
            and normalizedStep(fromStep, steps)
            or 0
        local toPosition = toStep > 0
            and normalizedStep(toStep, steps)
            or 0
        local scanPosition = lerp(
            fromPosition,
            toPosition,
            scanProgress
        )
        local scanX = lerp(
            DISPLAY_RAIL_LEFT,
            DISPLAY_RAIL_RIGHT,
            scanPosition
        )
        local scanShade = currentStep > 0 and 11 or 5
        drawSmoothLine(scanX, 24, scanX, 45, scanShade)

        -- Hit pulses rise toward Trigger; rests drop toward Inverted.
        local eventAge = self.display_time - self.display_event_started
        local eventDuration = 0.06
            + self.display_event_length_ms / 50 * 0.14
        if (
            self.display_event_started >= 0
            and eventAge < eventDuration
        ) then
            local eventProgress = clamp(eventAge / eventDuration, 0, 1)
            local eventPosition = normalizedStep(
                clamp(self.display_event_step, 1, steps),
                steps
            )
            local eventX = lerp(
                DISPLAY_RAIL_LEFT,
                DISPLAY_RAIL_RIGHT,
                eventPosition
            )
            local eventRailY = railY(eventPosition)
            local direction = self.display_event_hit and -1 or 1
            local pulseY = eventRailY + direction * eventProgress * 12
            local pulseShade = math.floor(15 - eventProgress * 7)
            drawSmoothCircle(eventX, pulseY, 2.2, pulseShade)

            if self.display_event_hit then
                drawSmoothCircle(
                    eventX,
                    eventRailY - math.sin(eventProgress * math.pi) * 4,
                    2.5,
                    15
                )
            end
        end

        -- The magnet moves continuously with effective Distribution.
        local magnetX = lerp(
            DISPLAY_RAIL_LEFT,
            DISPLAY_RAIL_RIGHT,
            distribution
        )
        drawLine(magnetX - 4, 13, magnetX - 4, 19, 10)
        drawLine(magnetX + 4, 13, magnetX + 4, 19, 10)
        drawLine(magnetX - 4, 19, magnetX + 4, 19, 10)
        drawLine(magnetX - 4, 13, magnetX - 1, 13, 14)
        drawLine(magnetX + 1, 13, magnetX + 4, 13, 14)

        local distributionLabel
        if distribution <= 0.1 then
            distributionLabel = "FRONT"
        elseif distribution >= 0.9 then
            distributionLabel = "BACK"
        elseif math.abs(distribution - 0.5) <= 0.05 then
            distributionLabel = "EUCLID"
        else
            distributionLabel = math.floor(distribution * 100 + 0.5) .. "%"
        end

        drawTinyText(
            4,
            63,
            string.format("E(%d,%d)", hits, steps),
            9
        )
        drawTinyText(128, 63, distributionLabel, 10, "centre")
        drawTinyText(
            252,
            63,
            currentStep > 0
                and (currentStep .. "/" .. steps)
                or "-/" .. steps,
            7,
            "right"
        )

        return true
    end
}
