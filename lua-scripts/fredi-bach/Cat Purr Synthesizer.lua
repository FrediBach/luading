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

-- Fixed display metadata
local DISPLAY_METER_LABELS = { "P", "F", "A" }
local DISPLAY_METER_Y = { 23, 33, 43 }
local DISPLAY_METER_SLOPE = { -2, 0, 2 }

--------------------------------------------------------------------------------
-- UTILITY FUNCTIONS
--------------------------------------------------------------------------------

local function clamp(value, minimum, maximum)
    return math.max(minimum, math.min(maximum, value))
end

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

        -- Display state is captured by step() and only consumed by draw().
        -- Scalars and this fixed-size peak table avoid allocating at display
        -- cadence while still retaining short events for the 30 fps screen.
        self.display_body_radius = 13.0
        self.display_tail_offset = 0.0
        self.display_output_peaks = { 0.0, 0.0, 0.0 }
        self.display_whisker_flash = 0.0
        
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

            local displayAlpha = clamp(dt * 8.0, 0, 1)
            self.display_body_radius = smooth(
                self.display_body_radius,
                13.0,
                displayAlpha
            )
            self.display_tail_offset = smooth(
                self.display_tail_offset,
                0.0,
                displayAlpha
            )
            self.display_whisker_flash = math.max(
                0,
                self.display_whisker_flash - dt * 10
            )
            prevGate = false

            self.display_output_peaks[1] = math.max(
                clamp(basePitch + 0.5, 0, 1),
                self.display_output_peaks[1] - dt * 2.5
            )
            self.display_output_peaks[2] = math.max(
                clamp(smoothedVCF / 5.0, 0, 1),
                self.display_output_peaks[2] - dt * 2.5
            )
            self.display_output_peaks[3] = math.max(
                clamp(smoothedVCA / 8.0, 0, 1),
                self.display_output_peaks[3] - dt * 2.5
            )

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
        -- DISPLAY STATE
        -- All animation inputs are derived from the real phases and outputs.
        --------------------------------------------------------------------

        local displayAlpha = clamp(dt * 8.0, 0, 1)
        local breathMotion = math.abs(math.sin(breathPhase * math.pi * 2))
        local bodyTarget = 13.0
            + vcaFloor * 2.0
            + breathMotion * intensity * 4.0
        self.display_body_radius = smooth(
            self.display_body_radius,
            bodyTarget,
            displayAlpha
        )

        local tailTarget = math.sin(variationPhase * math.pi * 4)
            * variation * 2.5
        self.display_tail_offset = smooth(
            self.display_tail_offset,
            tailTarget,
            displayAlpha
        )

        local gateIsHigh = gateOut > 0
        if gateIsHigh and not prevGate then
            self.display_whisker_flash = 1.0
        else
            self.display_whisker_flash = math.max(
                0,
                self.display_whisker_flash - dt * 10
            )
        end
        prevGate = gateIsHigh

        self.display_output_peaks[1] = math.max(
            clamp(vcoOut + 0.5, 0, 1),
            self.display_output_peaks[1] - dt * 2.5
        )
        self.display_output_peaks[2] = math.max(
            clamp(vcfOut / 5.0, 0, 1),
            self.display_output_peaks[2] - dt * 2.5
        )
        self.display_output_peaks[3] = math.max(
            clamp(vcaOut / 8.0, 0, 1),
            self.display_output_peaks[3] - dt * 2.5
        )
        
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
        local variation = params[4] / 100
        local vcaFloor = params[8] / 100
        local mode = params[9]

        drawStandardParameterLine()

        local running = mode == 1 or (self.gateOpen or false)
        local silhouetteShade = running
            and (7 + math.floor(intensity * 7))
            or 5
        local bodyX = 126
        local bodyY = 33
        local bodyRadiusX = 49
        local bodyRadiusY = self.display_body_radius

        -- Breathing body: a compact ellipse built from smooth segments. Its
        -- vertical radius follows the real breath phase with step-time
        -- smoothing, so dropped draw frames do not alter the pose.
        local previousX = nil
        local previousY = nil
        for i = 0, 24 do
            local angle = (i / 24) * math.pi * 2
            local x = bodyX + math.cos(angle) * bodyRadiusX
            local y = bodyY + math.sin(angle) * bodyRadiusY
            if previousX then
                drawSmoothLine(previousX, previousY, x, y, silhouetteShade)
            end
            previousX = x
            previousY = y
        end

        -- VCA output fills the curled body with five quiet ribs. VCA Floor
        -- establishes the minimum fill while the held output supplies motion.
        local bodyFill = clamp(
            math.max(vcaFloor, self.display_output_peaks[3]),
            0,
            1
        )
        local fillShade = 3 + math.floor(bodyFill * 8)
        for row = -2, 2 do
            local normalizedY = row / 3
            local halfWidth = math.sqrt(1 - normalizedY * normalizedY)
                * (bodyRadiusX - 9) * bodyFill
            local y = bodyY + row * (bodyRadiusY / 3)
            if halfWidth >= 1 then
                drawSmoothLine(
                    bodyX - halfWidth,
                    y,
                    bodyX + halfWidth,
                    y,
                    fillShade
                )
            end
        end

        -- Curled tail. Variation moves the curl as a whole instead of adding
        -- decorative random pixels.
        local tailCenterX = 178
        local tailCenterY = 33 + self.display_tail_offset
        previousX = bodyX + bodyRadiusX - 2
        previousY = bodyY + 5
        for i = 0, 15 do
            local angle = -0.25 + (i / 15) * math.pi * 1.75
            local radius = 13 - i * 0.45
            local x = tailCenterX + math.cos(angle) * radius
            local y = tailCenterY + math.sin(angle) * radius
            drawSmoothLine(previousX, previousY, x, y, silhouetteShade)
            previousX = x
            previousY = y
        end
        drawSmoothCircle(previousX, previousY, 1.5, silhouetteShade + 1)

        -- Head, ears, face, and paws establish the sleeping-cat silhouette.
        -- Organic variation gently twitches the ears only while the cat runs.
        local earMotion = running
            and math.sin(variationPhase * math.pi * 6) * variation * 1.5
            or 0
        drawSmoothCircle(71, 32, 11, silhouetteShade)
        drawSmoothLine(62, 26, 64 + earMotion, 16, silhouetteShade)
        drawSmoothLine(64 + earMotion, 16, 70, 23, silhouetteShade)
        drawSmoothLine(72, 23, 79 - earMotion, 16, silhouetteShade)
        drawSmoothLine(79 - earMotion, 16, 81, 27, silhouetteShade)

        if running then
            -- Sleeping eyes.
            drawSmoothLine(64, 29, 68, 29, 13)
            drawSmoothLine(73, 29, 77, 29, 13)
        else
            -- Gated mode opens the eyes when stopped.
            drawSmoothCircle(66, 29, 1.5, 15)
            drawSmoothCircle(75, 29, 1.5, 15)
        end

        drawSmoothLine(69, 34, 71, 35, 11)
        drawSmoothLine(71, 35, 73, 34, 11)
        drawSmoothLine(61, 35, 51, 32, 7)
        drawSmoothLine(61, 37, 50, 37, 7)
        drawSmoothLine(62, 39, 52, 42, 7)
        drawSmoothLine(83, 45, 96, 47, silhouetteShade)
        drawSmoothLine(97, 47, 108, 46, silhouetteShade)

        -- Two throat lines show the aliased laryngeal phase. Their speed comes
        -- from Purr Rate, amplitude and shade from Intensity.
        local throatAmplitude = running and (0.5 + intensity * 1.8) or 0
        local throatShade = running and (8 + math.floor(intensity * 6)) or 3
        for line = 0, 1 do
            previousX = 79
            previousY = 35 + line * 4
            for segment = 1, 6 do
                local x = 79 + segment * 3
                local phase = purrPhase + segment / 6 + line * 0.25
                local y = 35 + line * 4
                    + math.sin(phase * math.pi * 2) * throatAmplitude
                drawSmoothLine(previousX, previousY, x, y, throatShade)
                previousX = x
                previousY = y
            end
        end

        -- The three output whiskers are ordered pitch, filter, amplitude.
        -- Peak holds make narrow purr pulses readable at the 30 fps cadence,
        -- and every Purr Gate briefly pushes all three tips outward.
        local meterStartX = 211
        local flash = self.display_whisker_flash
        for i = 1, 3 do
            local level = clamp(self.display_output_peaks[i], 0, 1)
            local tipX = math.min(
                250,
                meterStartX + 4 + level * 27 + flash * 8
            )
            local tipY = DISPLAY_METER_Y[i] + DISPLAY_METER_SLOPE[i]
            local meterShade = 6 + math.floor(level * 6 + flash * 3)
            drawTinyText(
                202,
                DISPLAY_METER_Y[i] + 2,
                DISPLAY_METER_LABELS[i],
                6,
                "right"
            )
            drawLine(meterStartX, DISPLAY_METER_Y[i], 250, tipY, 2)
            drawSmoothLine(
                meterStartX,
                DISPLAY_METER_Y[i],
                tipX,
                tipY,
                math.min(15, meterShade)
            )
            drawSmoothCircle(tipX, tipY, flash > 0 and 1.8 or 1, math.min(15, meterShade + 2))
        end

        local modeText = mode == 1 and "FREE" or "GATED"
        local runText = running and "RUN" or "STOP"
        drawTinyText(4, 63, modeText, mode == 1 and 8 or 10)
        drawTinyText(252, 63, runText, running and 15 or 6, "right")

        return true
    end
}
