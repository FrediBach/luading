-- Analog Drift
--[[
Adds organic analog-style drift to a CV source using multiple 
unsynced LFOs. Perfect for adding warmth and movement to 
oscillators, filters, or any CV that needs humanization.
]]

--------------------------------------------------------------------------------
-- LFO Configuration
-- Using prime-related ratios to maximize variation before pattern repetition
-- Base frequencies chosen to span useful drift ranges
--------------------------------------------------------------------------------
local LFO_COUNT = 5

-- Base frequencies in Hz (very slow to medium)
-- These create a combined pattern that takes hours to repeat
local baseFrequencies = {
    0.0173,   -- ~58 second period (very slow thermal drift)
    0.0311,   -- ~32 second period  
    0.0532,   -- ~19 second period
    0.1173,   -- ~8.5 second period (medium drift)
    0.2719    -- ~3.7 second period (subtle warble)
}

-- Amplitude weights (slower LFOs contribute more to realistic drift)
local weights = {
    0.35,     -- dominant slow component
    0.28,
    0.18,
    0.12,
    0.07      -- subtle fast component
}

-- Phase accumulators for each LFO (0.0 to 1.0)
local phases = { 0.0, 0.0, 0.0, 0.0, 0.0 }

-- Initialize with random phases so each instance sounds different
local function randomizePhases()
    for i = 1, LFO_COUNT do
        phases[i] = math.random()
    end
end

--------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------

-- Attempt to seed random from time, fall back to fixed seed
local function initRandom()
    local seed = os.time and os.time() or 12345
    math.randomseed(seed)
    -- Warm up the RNG
    for _ = 1, 10 do math.random() end
end

-- Attempt to seed random from time, fall back to fixed seed
initRandom()

-- Attempt to seed random from time, fall back to fixed seed
initRandom()

-- Calculate weighted sum of all LFO outputs
-- Returns bipolar value in range approximately [-1, 1]
local function calculateDrift(speed, character)
    local sum = 0.0
    
    for i = 1, LFO_COUNT do
        -- Character parameter shifts weight between slow and fast LFOs
        -- character = 0: favor slow LFOs (thermal drift)
        -- character = 1: favor faster LFOs (warble/wobble)
        local charWeight = 1.0
        if character < 0.5 then
            -- Boost slow LFOs (indices 1-2), reduce fast (4-5)
            local boost = (0.5 - character) * 2  -- 0 to 1
            if i <= 2 then
                charWeight = 1.0 + boost * 0.5
            elseif i >= 4 then
                charWeight = 1.0 - boost * 0.5
            end
        else
            -- Boost fast LFOs, reduce slow
            local boost = (character - 0.5) * 2  -- 0 to 1
            if i <= 2 then
                charWeight = 1.0 - boost * 0.5
            elseif i >= 4 then
                charWeight = 1.0 + boost * 0.5
            end
        end
        
        -- Sine wave output for smooth drift
        local sineValue = math.sin(phases[i] * 2.0 * math.pi)
        sum = sum + sineValue * weights[i] * charWeight
    end
    
    return sum
end

-- Update all LFO phases
local function updatePhases(dt, speed)
    for i = 1, LFO_COUNT do
        local freq = baseFrequencies[i] * speed
        phases[i] = phases[i] + dt * freq
        
        -- Wrap phase to prevent floating point issues over long periods
        if phases[i] >= 1.0 then
            phases[i] = phases[i] - 1.0
        end
    end
end

-- Generate an orthogonal display component from the same LFO phases. This
-- never feeds the CV outputs; it gives the two-dimensional particle view an
-- organic path without introducing another oscillator or random source.
local function calculateDisplayDriftY(character)
    local sum = 0.0

    for i = 1, LFO_COUNT do
        local charWeight = 1.0
        if character < 0.5 then
            local boost = (0.5 - character) * 2
            if i <= 2 then
                charWeight = 1.0 + boost * 0.5
            elseif i >= 4 then
                charWeight = 1.0 - boost * 0.5
            end
        else
            local boost = (character - 0.5) * 2
            if i <= 2 then
                charWeight = 1.0 - boost * 0.5
            elseif i >= 4 then
                charWeight = 1.0 + boost * 0.5
            end
        end

        local phaseOffset = i * 0.37
        local cosineValue = math.cos(phases[i] * 2.0 * math.pi + phaseOffset)
        sum = sum + cosineValue * weights[i] * charWeight
    end

    return sum
end

local function clamp(v, minValue, maxValue)
    if v < minValue then return minValue end
    if v > maxValue then return maxValue end
    return v
end

local function displayParticlePosition(self)
    local amount = (self.parameters[1] or 0) / 100.0
    local targetX = 154 + clamp(self.display_target_cv / 5.0, -1, 1) * 24
    local targetY = 33
    local radiusX = amount * 28
    local radiusY = amount * 17
    local x = targetX + self.display_drift_x * radiusX
    local y = targetY + self.display_drift_y * radiusY
    return clamp(x, 62, 247), clamp(y, 15, 51), targetX, targetY
end

--------------------------------------------------------------------------------
-- Main Script
--------------------------------------------------------------------------------

return {
    name = 'Analog Drift'
    , author = 'Expert Sleepers Ltd'
    
    , init = function(self)
        -- Randomize starting phases for unique character per instance
        randomizePhases()

        -- Display-only values. The fixed trail ring is allocated once and
        -- mutated in place so draw() remains bounded and read-only.
        self.display_input_cv = 0
        self.display_target_cv = 0
        self.display_output_cv = 0
        self.display_drift_voltage = 0
        self.display_drift_x = 0
        self.display_drift_y = 0
        self.display_trail = {}
        self.display_trail_size = 18
        self.display_trail_index = 0
        self.display_trail_count = 0
        self.display_trail_timer = 0
        for i = 1, self.display_trail_size do
            self.display_trail[i] = { x = 154, y = 33 }
        end
        
        return {
            -- Input 1: CV to process (pass-through with drift added)
            inputs = { kCV }
            , inputNames = { "CV In" }
            
            -- Output 1: Processed CV (input + drift)
            -- Output 2: Raw drift signal (for parallel/mult use)
            , outputs = { kLinear, kLinear }
            , outputNames = { "CV + Drift", "Drift Only" }
            
            , parameters = {
                -- Amount: 0-100 maps to 0-50mV (suitable for subtle pitch drift)
                -- At 100%, adds up to ±25mV variation (≈2.5 cents on 1V/oct)
                { "Amount", 0, 100, 50, kPercent }
                
                -- Speed: multiplier for all LFO rates
                -- 0.1x to 10x range via exponential mapping
                , { "Speed", -100, 100, 0, kPercent }
                
                -- Character: balance slow drift vs faster warble
                -- 0% = slow thermal drift, 100% = faster wobble
                , { "Character", 0, 100, 30, kPercent }
            }
        }
    end
    
    , step = function(self, dt, inputs)
        -- Read parameters
        local amountParam = self.parameters[1]      -- 0-100
        local speedParam = self.parameters[2]       -- -100 to 100
        local characterParam = self.parameters[3]   -- 0-100
        
        -- Convert amount to voltage (0-100% -> 0-0.05V max drift)
        -- This gives musically useful drift without going overboard
        local maxDrift = (amountParam / 100.0) * 0.05
        
        -- Convert speed to multiplier (exponential: -100->0.1x, 0->1x, 100->10x)
        local speedMult = 10 ^ (speedParam / 100.0)
        
        -- Normalize character to 0-1
        local character = characterParam / 100.0
        
        -- Update LFO phases
        updatePhases(dt, speedMult)
        
        -- Calculate current drift value (-1 to +1)
        local driftNormalized = calculateDrift(speedMult, character)
        
        -- Scale to voltage
        local driftVoltage = driftNormalized * maxDrift
        
        -- Input CV (default to 0 if nothing connected)
        local inputCV = inputs[1] or 0.0

        -- Capture presentation state after calculating the real outputs. The
        -- second axis is display-only and derived from the same LFO phases.
        local driftY = calculateDisplayDriftY(character)
        local displayAlpha = clamp(dt * 12.0, 0, 1)
        local targetAlpha = clamp(dt * 8.0, 0, 1)
        self.display_input_cv = inputCV
        self.display_target_cv = self.display_target_cv
            + (inputCV - self.display_target_cv) * targetAlpha
        self.display_output_cv = inputCV + driftVoltage
        self.display_drift_voltage = driftVoltage
        self.display_drift_x = self.display_drift_x
            + (driftNormalized - self.display_drift_x) * displayAlpha
        self.display_drift_y = self.display_drift_y
            + (driftY - self.display_drift_y) * displayAlpha

        self.display_trail_timer = self.display_trail_timer + dt
        if self.display_trail_timer >= (1.0 / 30.0) then
            self.display_trail_timer = self.display_trail_timer % (1.0 / 30.0)
            local trailX, trailY = displayParticlePosition(self)
            self.display_trail_index = (self.display_trail_index % self.display_trail_size) + 1
            local point = self.display_trail[self.display_trail_index]
            point.x = trailX
            point.y = trailY
            self.display_trail_count = math.min(
                self.display_trail_count + 1,
                self.display_trail_size
            )
        end
        
        -- Output processed CV and raw drift
        return { 
            inputCV + driftVoltage,   -- CV + Drift
            driftVoltage              -- Drift Only (for parallel routing)
        }
    end
    
    , draw = function(self)
        drawStandardParameterLine()

        local particleX, particleY, targetX, targetY = displayParticlePosition(self)
        local character = (self.parameters[3] or 30) / 100.0

        -- Laboratory window and moving tuning target.
        drawBox(60, 13, 250, 53, 2)
        drawCircle(targetX, targetY, 8, 3)
        drawLine(targetX - 12, targetY, targetX + 12, targetY, 4)
        drawLine(targetX, targetY - 12, targetX, targetY + 12, 4)
        drawCircle(targetX, targetY, 1, 8)

        -- Fixed-size fading trail, ordered from oldest to newest.
        local previousX = nil
        local previousY = nil
        for n = 1, self.display_trail_count do
            local index = (
                self.display_trail_index - self.display_trail_count + n - 1
            ) % self.display_trail_size + 1
            local point = self.display_trail[index]
            local shade = 2 + math.floor((n / self.display_trail_count) * 7)

            if previousX then
                drawSmoothLine(previousX, previousY, point.x, point.y, shade)
            end
            drawSmoothCircle(point.x, point.y, n == self.display_trail_count and 1.5 or 1, shade)
            previousX = point.x
            previousY = point.y
        end

        -- Current drift particle. Character makes the point feel more energetic
        -- while its actual path and speed remain tied to the LFO phases.
        local particleRadius = 2.2 + character
        drawSmoothLine(targetX, targetY, particleX, particleY, 5)
        drawSmoothCircle(particleX, particleY, particleRadius + 1.5, 4)
        drawSmoothCircle(particleX, particleY, particleRadius, 15)

        -- Bipolar drift-only ruler in millivolts.
        local rulerTop = 15
        local rulerBottom = 51
        local rulerCenter = 33
        local rulerX = 34
        drawLine(rulerX, rulerTop, rulerX, rulerBottom, 5)
        drawLine(rulerX - 4, rulerTop, rulerX + 4, rulerTop, 4)
        drawLine(rulerX - 5, rulerCenter, rulerX + 5, rulerCenter, 7)
        drawLine(rulerX - 4, rulerBottom, rulerX + 4, rulerBottom, 4)

        local driftPosition = rulerCenter
            - clamp(self.display_drift_voltage / 0.05, -1, 1) * 18
        drawRectangle(rulerX - 4, driftPosition - 1, rulerX + 4, driftPosition + 1, 15)
        drawTinyText(4, 17, "+50", 5)
        drawTinyText(4, 35, "0", 5)
        drawTinyText(4, 53, "-50", 5)
        drawTinyText(42, 53, "mV", 5)

        -- Exact values remain available without competing with the visual.
        local displayDriftMv = self.display_drift_voltage * 1000
        if math.abs(displayDriftMv) < 0.05 then
            displayDriftMv = 0
        end

        drawTinyText(
            4,
            63,
            string.format("IN %+.2fV", self.display_input_cv),
            7
        )
        drawTinyText(
            128,
            63,
            string.format("D %+.1fmV", displayDriftMv),
            10,
            "centre"
        )
        drawTinyText(
            252,
            63,
            string.format("OUT %+.2fV", self.display_output_cv),
            7,
            "right"
        )

        return true
    end
}
