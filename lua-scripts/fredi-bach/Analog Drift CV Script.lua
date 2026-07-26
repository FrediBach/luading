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

--------------------------------------------------------------------------------
-- Main Script
--------------------------------------------------------------------------------

return {
    name = 'Analog Drift'
    , author = 'Expert Sleepers Ltd'
    
    , init = function(self)
        -- Randomize starting phases for unique character per instance
        randomizePhases()
        
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
        
        -- Output processed CV and raw drift
        return { 
            inputCV + driftVoltage,   -- CV + Drift
            driftVoltage              -- Drift Only (for parallel routing)
        }
    end
    
    , draw = function(self)
        -- Draw a simple visualization of the drift state
        local centerX = 128
        local centerY = 40
        local maxRadius = 20
        
        -- Calculate current drift for visualization
        local character = (self.parameters[3] or 30) / 100.0
        local driftVal = calculateDrift(1.0, character)
        
        -- Draw reference circle
        drawCircle(centerX, centerY, maxRadius, 2)
        
        -- Draw drift position as a dot
        local dotX = centerX + driftVal * maxRadius * 0.8
        local dotY = centerY
        drawSmoothCircle(dotX, dotY, 3, 15)
        
        -- Draw amount bar
        local amount = self.parameters[1] or 50
        local barWidth = (amount / 100.0) * 60
        drawRectangle(98, 58, 98 + barWidth, 62, 8)
        drawBox(98, 58, 158, 62, 4)
        
        -- Labels
        drawTinyText(128, 10, "DRIFT", 10, "centre")
        drawTinyText(98, 56, "AMT", 6, "left")
    end
}
