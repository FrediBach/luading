-- Loudness Fix
--[[
Pitch-based CV compensation for correcting level inconsistencies across 
the keyboard range. Feed a V/Oct signal and get a compensation CV out.

Use cases:
- Tame loud high notes on VCOs (negative slope)
- Boost filter resonance on low notes (negative slope)
- Add more PWM/FM on high notes (positive slope)
- Any pitch-dependent parameter modulation

Connect the output to a VCA, filter CV, or any destination that needs
pitch-dependent adjustment.
]]

--------------------------------------------------------------------------------
-- Local state
--------------------------------------------------------------------------------
local currentInput = 0.0      -- Current input voltage (V/Oct)
local currentOutput = 0.0     -- Current output voltage
local peakInput = 0.0         -- For display: track recent peak
local peakDecay = 0.995       -- Decay rate for peak indicator

--------------------------------------------------------------------------------
-- Helper: Convert voltage to note name for display
--------------------------------------------------------------------------------
local NOTE_NAMES = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" }

local function voltageToNoteName(v)
    -- Assuming 0V = C0, 1V = C1, etc. (standard V/Oct)
    local semitones = math.floor(v * 12 + 0.5)
    local octave = math.floor(semitones / 12)
    local noteIndex = (semitones % 12) + 1
    if noteIndex < 1 then noteIndex = noteIndex + 12 end
    if noteIndex > 12 then noteIndex = noteIndex - 12 end
    return NOTE_NAMES[noteIndex] .. octave
end

--------------------------------------------------------------------------------
-- Helper: Clamp a value between min and max
--------------------------------------------------------------------------------
local function clamp(value, minVal, maxVal)
    if value < minVal then return minVal end
    if value > maxVal then return maxVal end
    return value
end

--------------------------------------------------------------------------------
-- Main script table
--------------------------------------------------------------------------------
return
{
    name = 'Loudness Fix'
    , author = 'Claude'

    --------------------------------------------------------------------------------
    -- Initialization
    --------------------------------------------------------------------------------
    , init = function(self)
        return
        {
            inputs = {
                kCV, -- Type: Note Sequencer (V/Oct), Synced: true, Division: 1/4
            }
            , inputNames = { "V/Oct In" }
            , outputs = {
                kLinear, -- Type: Off
            }
            , outputNames = { "Comp CV" }
            , parameters = 
            {
                -- Slope: compensation amount per octave (per volt)
                -- Negative = reduce output for higher pitches
                -- Positive = increase output for higher pitches
                { "Slope", -100, 100, -20, kPercent }
                
                -- Reference pitch in volts (0V = C0, 5V = C5)
                -- This is the "neutral" point where output equals base level
                , { "Reference", 0, 100, 50, kMillivolts, kBy10 }
                
                -- Base level: output voltage at the reference pitch
                , { "Base Level", 0, 100, 50, kMillivolts, kBy10 }
                
                -- Output range clamping
                , { "Min Output", -100, 100, 0, kMillivolts, kBy10 }
                , { "Max Output", -100, 100, 100, kMillivolts, kBy10 }
                
                -- Curve type for future expansion
                , { "Curve", { "Linear", "Exponential", "S-Curve" }, 1 }
            }
        }
    end

    --------------------------------------------------------------------------------
    -- Step function: called every 1ms
    --------------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        -- Read parameters
        local slope = self.parameters[1] / 100.0          -- Convert from percent to ratio
        local reference = self.parameters[2]              -- Already in volts (kBy10)
        local baseLevel = self.parameters[3]              -- Already in volts (kBy10)
        local minOut = self.parameters[4]                 -- Already in volts (kBy10)
        local maxOut = self.parameters[5]                 -- Already in volts (kBy10)
        local curveType = self.parameters[6]              -- 1=Linear, 2=Exp, 3=S-Curve
        
        -- Get input pitch voltage
        currentInput = inputs[1]
        
        -- Calculate pitch difference from reference (in octaves/volts)
        local pitchDiff = currentInput - reference
        
        -- Apply curve transformation
        local compensation
        if curveType == 1 then
            -- Linear: direct multiplication
            compensation = pitchDiff * slope
        elseif curveType == 2 then
            -- Exponential: more aggressive at extremes
            local sign = pitchDiff >= 0 and 1 or -1
            compensation = sign * (math.abs(pitchDiff) ^ 1.5) * slope
        else
            -- S-Curve: gentle in middle, steeper at extremes
            local normalized = pitchDiff / 5.0  -- Normalize to roughly -1 to 1 range
            local sCurve = normalized / (1 + math.abs(normalized))
            compensation = sCurve * 5.0 * slope
        end
        
        -- Calculate final output
        currentOutput = baseLevel + compensation
        
        -- Clamp to specified range
        currentOutput = clamp(currentOutput, minOut, maxOut)
        
        -- Update peak tracker for display (with decay)
        local absInput = math.abs(currentInput)
        if absInput > peakInput then
            peakInput = absInput
        else
            peakInput = peakInput * peakDecay
        end
        
        return { currentOutput }
    end

    --------------------------------------------------------------------------------
    -- Draw function: custom display at 30fps
    --------------------------------------------------------------------------------
    , draw = function(self)
        -- Read parameters for display
        local slope = self.parameters[1]
        local reference = self.parameters[2]
        local baseLevel = self.parameters[3]
        local minOut = self.parameters[4]
        local maxOut = self.parameters[5]
        local curveNames = { "Lin", "Exp", "S" }
        local curveType = self.parameters[6]
        
        -- Screen dimensions: 256x64
        -- Leave top 12px for parameter line
        
        -- === Left side: Input/Output values ===
        local col1 = 5
        local col2 = 70
        
        -- Input voltage and note
        drawTinyText(col1, 22, "IN:", 8)
        drawText(col1 + 15, 22, string.format("%.2fV", currentInput), 15)
        drawTinyText(col1, 32, voltageToNoteName(currentInput), 10)
        
        -- Output voltage
        drawTinyText(col1, 46, "OUT:", 8)
        drawText(col1 + 20, 46, string.format("%.2fV", currentOutput), 15)
        
        -- Compensation indicator (+ or -)
        local compAmount = currentOutput - baseLevel
        local compStr = compAmount >= 0 and "+" or ""
        compStr = compStr .. string.format("%.2f", compAmount)
        drawTinyText(col1, 58, compStr, compAmount >= 0 and 12 or 6)
        
        -- === Right side: Slope visualization ===
        -- Draw a simple graph showing the compensation curve
        local graphX = 130
        local graphY = 18
        local graphW = 120
        local graphH = 42
        
        -- Graph border
        drawBox(graphX, graphY, graphX + graphW, graphY + graphH, 4)
        
        -- Center lines (reference point)
        local centerX = graphX + graphW / 2
        local centerY = graphY + graphH / 2
        drawLine(centerX, graphY + 1, centerX, graphY + graphH - 1, 2)
        drawLine(graphX + 1, centerY, graphX + graphW - 1, centerY, 2)
        
        -- Draw the compensation curve
        local prevY = nil
        for i = 0, graphW - 4 do
            -- Map x position to input voltage range (0V to 10V)
            local inV = (i / (graphW - 4)) * 10.0
            local diff = inV - reference
            
            -- Calculate compensation based on curve type
            local comp
            if curveType == 1 then
                comp = diff * (slope / 100.0)
            elseif curveType == 2 then
                local sign = diff >= 0 and 1 or -1
                comp = sign * (math.abs(diff) ^ 1.5) * (slope / 100.0)
            else
                local normalized = diff / 5.0
                local sCurve = normalized / (1 + math.abs(normalized))
                comp = sCurve * 5.0 * (slope / 100.0)
            end
            
            local outV = baseLevel + comp
            outV = clamp(outV, minOut, maxOut)
            
            -- Map output voltage to y position
            local yRange = maxOut - minOut
            if yRange == 0 then yRange = 1 end
            local yNorm = (outV - minOut) / yRange
            local y = graphY + graphH - 2 - (yNorm * (graphH - 4))
            
            if prevY ~= nil then
                drawLine(graphX + 2 + i - 1, prevY, graphX + 2 + i, y, 12)
            end
            prevY = y
        end
        
        -- Draw current position marker
        local markerX = graphX + 2 + ((currentInput / 10.0) * (graphW - 4))
        markerX = clamp(markerX, graphX + 2, graphX + graphW - 2)
        local yRange = maxOut - minOut
        if yRange == 0 then yRange = 1 end
        local yNorm = (currentOutput - minOut) / yRange
        local markerY = graphY + graphH - 2 - (yNorm * (graphH - 4))
        markerY = clamp(markerY, graphY + 2, graphY + graphH - 2)
        
        -- Filled circle for current position
        drawCircle(markerX, markerY, 3, 15)
        
        -- Labels
        drawTinyText(graphX, graphY - 2, "0V", 6)
        drawTinyText(graphX + graphW - 12, graphY - 2, "10V", 6)
        drawTinyText(graphX + graphW + 2, graphY + 2, string.format("%.1f", maxOut), 6)
        drawTinyText(graphX + graphW + 2, graphY + graphH - 4, string.format("%.1f", minOut), 6)
        
        -- Curve type indicator
        drawTinyText(graphX + graphW/2 - 6, graphY + graphH + 6, curveNames[curveType], 8, "centre")
        
        -- Don't suppress the standard parameter line
        return false
    end
}
