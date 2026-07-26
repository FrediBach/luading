-- Spread Triangle LFOs
--[[
Multiple triangle LFOs with mathematically related frequencies.
Spread types: Pi, Fibonacci, Golden Ratio, Prime, Harmonic.
Great for generative patches and complex modulation sources.
]]

--------------------------------------------------------------------------------
-- Constants and Precomputed Values
--------------------------------------------------------------------------------

-- Golden ratio
local PHI = (1 + math.sqrt(5)) / 2

-- First 8 Fibonacci numbers (normalized to start at 1)
local FIBONACCI = { 1, 1, 2, 3, 5, 8, 13, 21 }

-- First 8 prime numbers
local PRIMES = { 1, 2, 3, 5, 7, 11, 13, 17 }

-- Maximum number of LFO outputs
local MAX_LFOS = 8

-- Spread type names for parameter enum
local SPREAD_NAMES = { "Pi", "Fibonacci", "Golden", "Prime", "Harmonic" }

--------------------------------------------------------------------------------
-- Spread Calculation Functions
--------------------------------------------------------------------------------

-- Calculate frequency multiplier for each spread type
-- @param spreadType: 1-5 corresponding to SPREAD_NAMES
-- @param index: which LFO (1-based)
-- @param intensity: 0-100, how strongly to apply the spread
-- @return frequency multiplier relative to base frequency
local function getSpreadMultiplier(spreadType, index, intensity)
    local rawMultiplier = 1.0
    
    if spreadType == 1 then
        -- Pi spread: π^(n-1)
        rawMultiplier = math.pi ^ (index - 1)
    elseif spreadType == 2 then
        -- Fibonacci spread
        rawMultiplier = FIBONACCI[index] or FIBONACCI[#FIBONACCI]
    elseif spreadType == 3 then
        -- Golden ratio spread: φ^(n-1)
        rawMultiplier = PHI ^ (index - 1)
    elseif spreadType == 4 then
        -- Prime spread
        rawMultiplier = PRIMES[index] or PRIMES[#PRIMES]
    else
        -- Harmonic spread: simple integer ratios
        rawMultiplier = index
    end
    
    -- Apply intensity: lerp between 1.0 (no spread) and rawMultiplier (full spread)
    local t = intensity / 100.0
    return 1.0 + (rawMultiplier - 1.0) * t
end

--------------------------------------------------------------------------------
-- Triangle Wave Generator
--------------------------------------------------------------------------------

-- Generate triangle wave from phase (0-1)
-- @param phase: 0.0 to 1.0
-- @return voltage: -5V to +5V
local function triangleWave(phase)
    -- Triangle: rises from -5V at phase=0 to +5V at phase=0.5, 
    -- then falls back to -5V at phase=1
    return 20.0 * math.min(phase, 1.0 - phase) - 5.0
end

--------------------------------------------------------------------------------
-- Main Script
--------------------------------------------------------------------------------

return
{
    name = 'Spread LFOs'
    , author = 'Claude'
    
    , init = function(self)
        -- Initialize phase accumulators for all possible LFOs
        self.phases = {}
        for i = 1, MAX_LFOS do
            self.phases[i] = 0.0
        end
        
        -- Build outputs array - all linear for smooth triangle waves
        local outputs = {}
        for i = 1, MAX_LFOS do
            outputs[i] = kLinear
        end
        
        -- Build output names
        local outputNames = {}
        for i = 1, MAX_LFOS do
            outputNames[i] = "LFO " .. i
        end
        
        return
        {
            inputs = { kCV, kTrigger }
            , inputNames = { "Speed CV", "Reset" }
            , outputs = outputs
            , outputNames = outputNames
            , parameters = 
            {
                -- Base speed: 0.01 Hz to 20 Hz (stored as mHz for precision)
                { "Base Speed", 10, 20000, 1000, kHz, kBy1000 }
                -- Spread type selector
                , { "Spread", SPREAD_NAMES, 3 }  -- Default to Golden Ratio
                -- Number of active LFOs
                , { "Num LFOs", 1, MAX_LFOS, 4 }
                -- Spread intensity: 0% = all same freq, 100% = full spread
                , { "Intensity", 0, 100, 100, kPercent }
            }
        }
    end
    
    , trigger = function(self, input)
        -- Reset trigger received - sync all phases to 0
        if input == 2 then
            for i = 1, MAX_LFOS do
                self.phases[i] = 0.0
            end
        end
        return {}
    end
    
    , step = function(self, dt, inputs)
        -- Read parameters
        local baseFreq = self.parameters[1]      -- Already in Hz due to kBy1000
        local spreadType = self.parameters[2]
        local numLfos = self.parameters[3]
        local intensity = self.parameters[4]
        
        -- Apply CV modulation to base frequency
        -- ±5V maps to ±5 Hz modulation
        local cvMod = inputs[1] or 0
        local modulatedFreq = baseFreq + cvMod
        
        -- Clamp frequency to reasonable range
        modulatedFreq = math.max(0.001, math.min(50, modulatedFreq))
        
        -- Build output table
        local outs = {}
        
        -- Update each active LFO
        for i = 1, numLfos do
            -- Calculate this LFO's frequency based on spread
            local multiplier = getSpreadMultiplier(spreadType, i, intensity)
            local freq = modulatedFreq * multiplier
            
            -- Update phase accumulator
            self.phases[i] = self.phases[i] + dt * freq
            
            -- Wrap phase to 0-1 range
            while self.phases[i] >= 1.0 do
                self.phases[i] = self.phases[i] - 1.0
            end
            while self.phases[i] < 0.0 do
                self.phases[i] = self.phases[i] + 1.0
            end
            
            -- Generate triangle output
            outs[i] = triangleWave(self.phases[i])
        end
        
        -- Set inactive outputs to 0V
        for i = numLfos + 1, MAX_LFOS do
            outs[i] = 0.0
        end
        
        return outs
    end
    
    , draw = function(self)
        local numLfos = self.parameters[3]
        local spreadType = self.parameters[2]
        local baseFreq = self.parameters[1]
        local intensity = self.parameters[4]
        
        -- Draw title
        drawText(128, 10, SPREAD_NAMES[spreadType] .. " Spread", 15, "centre")
        
        -- Draw mini waveform visualization for each active LFO
        local graphWidth = 240
        local graphLeft = 8
        local graphHeight = 36
        local graphTop = 18
        local lfoWidth = graphWidth / numLfos
        
        for i = 1, numLfos do
            local x = graphLeft + (i - 1) * lfoWidth + lfoWidth / 2
            
            -- Draw phase indicator as vertical position in a box
            local boxLeft = graphLeft + (i - 1) * lfoWidth + 2
            local boxRight = boxLeft + lfoWidth - 4
            local boxTop = graphTop
            local boxBottom = graphTop + graphHeight
            
            -- Draw box outline
            drawBox(boxLeft, boxTop, boxRight, boxBottom, 3)
            
            -- Draw current value as filled bar from center
            local centerY = (boxTop + boxBottom) / 2
            local value = triangleWave(self.phases[i])
            local normalizedValue = (value + 5) / 10  -- 0 to 1
            local valueY = boxBottom - normalizedValue * graphHeight
            
            -- Draw moving dot
            drawRectangle(x - 2, valueY - 2, x + 2, valueY + 2, 15)
            
            -- Draw center line
            drawLine(boxLeft, centerY, boxRight, centerY, 2)
            
            -- Draw LFO number
            drawTinyText(x, boxBottom + 7, tostring(i), 8, "centre")
            
            -- Draw frequency multiplier
            local mult = getSpreadMultiplier(spreadType, i, intensity)
            local freqStr = string.format("%.2fx", mult)
            drawTinyText(x, boxTop - 2, freqStr, 6, "centre")
        end
        
        -- Draw base frequency at bottom
        drawTinyText(128, 62, string.format("Base: %.2f Hz", baseFreq), 10, "centre")
    end
}
