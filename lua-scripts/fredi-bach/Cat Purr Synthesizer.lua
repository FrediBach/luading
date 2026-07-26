-- Cat Purr CV Generator
--[[
Physically accurate cat purr simulation for VCO/VCF/VCA control.
Generates CV signals based on the biological characteristics of feline purring:
- Laryngeal oscillation at 25-50 Hz (the "rumble")
- Breathing cycle modulation (purring on both inhale and exhale)
- Natural organic variation for realistic character
Outputs: VCO Pitch, VCF Cutoff, VCA Level, Purr Gate
]]

--------------------------------------------------------------------------------
-- LOCAL STATE VARIABLES
--------------------------------------------------------------------------------

-- Time accumulators
local breathPhase = 0.0      -- Breathing cycle phase (0-1)
local purrPhase = 0.0        -- Individual purr oscillation phase (0-1)
local variationPhase = 0.0   -- Slow variation LFO phase

-- Noise state for organic variation (simple LCG)
local noiseState = 12345

-- Previous gate state for edge detection
local prevGate = false

-- Smoothed values for natural transitions
local smoothedVCA = 0.0
local smoothedVCF = 0.0

--------------------------------------------------------------------------------
-- UTILITY FUNCTIONS
--------------------------------------------------------------------------------

-- Simple pseudo-random number generator (0-1)
local function nextRandom()
    noiseState = (noiseState * 1103515245 + 12345) % 2147483648
    return noiseState / 2147483648
end

-- Attempt at smooth sine approximation (cheaper than math.sin in tight loop)
local function fastSin(phase)
    -- Attempt quadratic approximation of sine
    local x = phase * 2 - 1  -- Map 0-1 to -1 to 1
    return x * (1.27323954 - 0.405284735 * math.abs(x))
end

-- Attempt at smooth cosine using sine
local function fastCos(phase)
    return fastSin((phase + 0.25) % 1.0)
end

-- Attempt at exponential-like curve for envelope shaping
local function expCurve(x, curvature)
    -- attempt curve from 0-1 input to shaped 0-1 output
    if curvature > 0 then
        return (math.exp(x * curvature) - 1) / (math.exp(curvature) - 1)
    else
        return x
    end
end

-- Attempt at linear interpolation
local function lerp(a, b, t)
    return a + (b - a) * t
end

-- Attempt at one-pole lowpass filter for smoothing
local function smooth(current, target, coefficient)
    return current + (target - current) * coefficient
end

--------------------------------------------------------------------------------
-- MAIN SCRIPT TABLE
--------------------------------------------------------------------------------

return
{
    name = 'Cat Purr'
    , author = 'Claude / Anthropic'
    
    ------------------------------------------------------------------------
    -- INITIALIZATION
    ------------------------------------------------------------------------
    , init = function(self)
        -- Seed the random state with something
        noiseState = 12345 + math.floor(os.clock() * 1000) % 10000
        
        return
        {
            -- No CV inputs needed - this is a generator
            -- But we add a gate input for external sync/trigger
            inputs = { kGate }
            , inputNames = { "Run Gate" }
            
            -- Four CV outputs, all smoothly interpolated
            , outputs = { kLinear, kLinear, kLinear, kStepped }
            , outputNames = { 
                "VCO Pitch",    -- Pitch CV for oscillator
                "VCF Cutoff",   -- Filter cutoff modulation
                "VCA Level",    -- Amplitude envelope
                "Purr Gate"     -- Gate output on each purr cycle
            }
            
            -- Algorithm parameters
            , parameters = 
            {
                -- Purr characteristics
                { "Purr Rate", 20, 60, 30, kHz }           -- Laryngeal frequency
                , { "Breath Rate", 8, 40, 18, kBPM }       -- Breaths per minute
                
                -- Intensity and character
                , { "Intensity", 0, 100, 75, kPercent }    -- Overall intensity
                , { "Variation", 0, 100, 30, kPercent }    -- Organic randomness
                
                -- Output scaling
                , { "Base Pitch", -50, 50, 0, kCents }     -- VCO pitch offset
                , { "Pitch Mod", 0, 100, 20, kPercent }    -- Pitch modulation depth
                , { "Filter Depth", 0, 100, 60, kPercent } -- VCF mod depth
                , { "VCA Floor", 0, 100, 10, kPercent }    -- Minimum VCA level
                
                -- Behavior
                , { "Mode", { "Free Run", "Gated" }, 1 }   -- Run mode
            }
        }
    end
    
    ------------------------------------------------------------------------
    -- GATE HANDLER (for gated mode)
    ------------------------------------------------------------------------
    , gate = function(self, input, rising)
        if input == 1 then
            self.gateOpen = rising
            if rising then
                -- Reset phases on gate open for consistent start
                breathPhase = 0.0
                purrPhase = 0.0
            end
        end
        return {}
    end
    
    ------------------------------------------------------------------------
    -- MAIN PROCESSING STEP (called every 1ms)
    ------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        local params = self.parameters
        
        -- Extract parameters
        local purrRate = params[1]          -- Hz
        local breathRate = params[2] / 60   -- Convert BPM to Hz
        local intensity = params[3] / 100   -- 0-1
        local variation = params[4] / 100   -- 0-1
        local basePitch = params[5] / 100   -- Convert cents to volts (roughly)
        local pitchMod = params[6] / 100    -- 0-1
        local filterDepth = params[7] / 100 -- 0-1
        local vcaFloor = params[8] / 100    -- 0-1
        local mode = params[9]              -- 1=Free, 2=Gated
        
        -- Check run state
        local running = true
        if mode == 2 then  -- Gated mode
            running = self.gateOpen or false
        end
        
        if not running then
            -- When stopped, smoothly fade out
            smoothedVCA = smooth(smoothedVCA, 0, 0.01)
            smoothedVCF = smooth(smoothedVCF, 0, 0.01)
            return { basePitch, smoothedVCF, smoothedVCA, 0 }
        end
        
        --------------------------------------------------------------------
        -- PHASE ACCUMULATORS
        --------------------------------------------------------------------
        
        -- Add slow variation to rates
        variationPhase = variationPhase + dt * 0.1  -- Slow ~0.1Hz variation
        if variationPhase >= 1.0 then variationPhase = variationPhase - 1.0 end
        
        local variationMod = fastSin(variationPhase) * variation
        local randomJitter = (nextRandom() - 0.5) * variation * 0.1
        
        -- Breathing cycle (inhale/exhale, ~0.05-0.5 Hz)
        local actualBreathRate = breathRate * (1 + variationMod * 0.2 + randomJitter)
        breathPhase = breathPhase + dt * actualBreathRate
        if breathPhase >= 1.0 then breathPhase = breathPhase - 1.0 end
        
        -- Purr oscillation (laryngeal muscle, 25-50 Hz)
        -- Slight variation in purr rate based on breath phase
        local breathInfluence = 1 + fastSin(breathPhase) * 0.05 * variation
        local actualPurrRate = purrRate * breathInfluence * (1 + randomJitter * 0.5)
        purrPhase = purrPhase + dt * actualPurrRate
        local purrCycleComplete = purrPhase >= 1.0
        if purrCycleComplete then purrPhase = purrPhase - 1.0 end
        
        --------------------------------------------------------------------
        -- BREATH ENVELOPE
        -- Cats purr on both inhale and exhale, creating a double-hump
        -- pattern within each breath cycle
        --------------------------------------------------------------------
        
        -- Create a breath envelope with two peaks (inhale and exhale)
        -- Using absolute value of sine for double-hump
        local breathEnv = math.abs(fastSin(breathPhase))
        
        -- Shape the envelope to be more natural (softer peaks)
        breathEnv = math.sqrt(breathEnv)
        
        -- Add a slight dip at the transition points
        local transitionDip = 1 - 0.3 * math.exp(-50 * math.min(
            breathPhase,
            math.abs(breathPhase - 0.5),
            1 - breathPhase
        ) ^ 2)
        breathEnv = breathEnv * transitionDip
        
        --------------------------------------------------------------------
        -- PURR WAVEFORM
        -- The individual purr is a soft, rounded pulse
        --------------------------------------------------------------------
        
        -- Create a soft pulse waveform for the purr
        -- Rising edge faster than falling (asymmetric)
        local purrWave
        if purrPhase < 0.3 then
            -- Fast attack
            purrWave = purrPhase / 0.3
            purrWave = purrWave * purrWave  -- Quadratic ease in
        elseif purrPhase < 0.6 then
            -- Sustain/peak region with slight wobble
            purrWave = 1.0 - (purrPhase - 0.3) * 0.5
        else
            -- Slow decay
            purrWave = 0.85 * (1 - (purrPhase - 0.6) / 0.4)
            purrWave = purrWave * purrWave  -- Quadratic ease out
        end
        
        -- Add some harmonic content variation
        local harmonicVar = 1 + 0.1 * fastSin(purrPhase * 2) * variation
        purrWave = purrWave * harmonicVar
        
        --------------------------------------------------------------------
        -- COMBINE MODULATIONS
        --------------------------------------------------------------------
        
        -- VCA: Breath envelope modulates purr amplitude
        local vcaRaw = vcaFloor + (1 - vcaFloor) * intensity * breathEnv * purrWave
        
        -- Add subtle random amplitude variation
        vcaRaw = vcaRaw * (1 + (nextRandom() - 0.5) * variation * 0.05)
        
        -- Smooth the VCA to avoid clicks
        smoothedVCA = smooth(smoothedVCA, vcaRaw, 0.3)
        
        -- Scale to eurorack levels (0-8V for VCA)
        local vcaOut = smoothedVCA * 8.0
        
        --------------------------------------------------------------------
        -- VCF CUTOFF
        -- Filter opens with breath, slight purr modulation
        --------------------------------------------------------------------
        
        -- Filter follows breath primarily, with subtle purr influence
        local vcfRaw = breathEnv * (0.7 + 0.3 * purrWave)
        vcfRaw = vcfRaw * filterDepth * intensity
        
        -- Add variation
        vcfRaw = vcfRaw * (1 + fastSin(variationPhase * 3) * variation * 0.1)
        
        -- Smooth for natural filter movement
        smoothedVCF = smooth(smoothedVCF, vcfRaw, 0.2)
        
        -- Scale to eurorack levels (0-5V typical for filter CV)
        local vcfOut = smoothedVCF * 5.0
        
        --------------------------------------------------------------------
        -- VCO PITCH
        -- Subtle pitch movement adds organic character
        --------------------------------------------------------------------
        
        -- Gentle pitch modulation following breath
        local pitchBreath = fastSin(breathPhase) * 0.1
        
        -- Subtle vibrato-like movement from purr
        local pitchPurr = fastSin(purrPhase * 2) * 0.02
        
        -- Slow drift
        local pitchDrift = fastSin(variationPhase * 2) * 0.05
        
        -- Combine pitch modulations
        local pitchModulation = (pitchBreath + pitchPurr + pitchDrift) 
                                * pitchMod * variation
        
        -- Output in volts (base pitch + modulation)
        local vcoOut = basePitch + pitchModulation
        
        --------------------------------------------------------------------
        -- PURR GATE
        -- Outputs a gate/trigger on each purr cycle
        --------------------------------------------------------------------
        
        local gateOut = 0
        if purrWave > 0.5 then
            gateOut = 5.0  -- 5V gate
        end
        
        --------------------------------------------------------------------
        -- RETURN OUTPUT VOLTAGES
        --------------------------------------------------------------------
        
        return { vcoOut, vcfOut, vcaOut, gateOut }
    end
    
    ------------------------------------------------------------------------
    -- CUSTOM DISPLAY
    ------------------------------------------------------------------------
    , draw = function(self)
        local params = self.parameters
        local intensity = params[3] / 100
        local mode = params[9]
        
        -- Draw title
        drawText(128, 12, "~ Cat Purr ~", 15, "centre")
        
        -- Draw breath indicator (sine wave visualization)
        local breathY = 35
        local waveWidth = 100
        local startX = 78
        
        -- Draw breath waveform
        for i = 0, waveWidth do
            local phase = (breathPhase + i / waveWidth) % 1.0
            local y = math.abs(math.sin(phase * math.pi * 2)) * 10
            local brightness = math.floor(4 + y)
            drawRectangle(startX + i, breathY - y, startX + i, breathY + y, brightness)
        end
        
        -- Draw phase marker
        local markerX = startX + breathPhase * waveWidth
        drawLine(markerX, breathY - 12, markerX, breathY + 12, 15)
        
        -- Draw purr pulses visualization
        local purrY = 52
        for i = 0, 50 do
            local phase = (purrPhase + i / 50 * 3) % 1.0
            local pulse = phase < 0.4 and (1 - phase / 0.4) or 0
            pulse = pulse * intensity * math.abs(math.sin(breathPhase * math.pi))
            local barHeight = math.floor(pulse * 8)
            if barHeight > 0 then
                drawRectangle(103 + i * 2, purrY - barHeight, 
                             104 + i * 2, purrY, 8 + math.floor(pulse * 7))
            end
        end
        
        -- Draw mode indicator
        local modeText = mode == 1 and "FREE" or "GATED"
        local runText = (mode == 1 or self.gateOpen) and "RUN" or "STOP"
        drawTinyText(20, 35, modeText, 10)
        drawTinyText(20, 45, runText, self.gateOpen and 15 or 6)
        
        -- Draw output level indicators
        drawTinyText(230, 25, "VCO", 8)
        drawTinyText(230, 35, "VCF", 8)
        drawTinyText(230, 45, "VCA", 8)
        drawTinyText(230, 55, "GATE", 8)
        
        -- Level bars
        local vcfLevel = math.floor(smoothedVCF * 20)
        local vcaLevel = math.floor(smoothedVCA * 20)
        drawRectangle(245, 31, 245 + vcfLevel, 33, 12)
        drawRectangle(245, 41, 245 + vcaLevel, 43, 14)
        
        return false  -- Show standard parameter line
    end
}
