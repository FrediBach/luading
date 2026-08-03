-- Tri-Phase Window
--[[
Three phase-shifted triangle LFOs feed a window comparator.
LFO A & B define the window bounds, LFO C is compared.
Gate outputs when C is within the A-B window.
CV control over phase offsets creates evolving polyrhythms.
]]

--------------------------------------------------------------------------------
-- Local State
--------------------------------------------------------------------------------
local phase = 0.0           -- Master phase accumulator (0.0 to 1.0)
local gateState = false     -- Current gate output state
local lfoA, lfoB, lfoC = 0, 0, 0  -- Current LFO values for display

--------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------

-- Attempt triangle calculation from phase (0-1) to bipolar output (-5V to +5V)
local function triangle(p)
    -- Normalize phase to 0-1 range (handle wrapping)
    p = p % 1.0
    if p < 0 then p = p + 1.0 end
    -- Triangle: rises 0->0.5, falls 0.5->1
    local tri = p < 0.5 and (p * 4.0 - 1.0) or (3.0 - p * 4.0)
    return tri * 5.0  -- Scale to ±5V
end

-- Wrap phase to 0-1 range
local function wrapPhase(p)
    p = p % 1.0
    if p < 0 then p = p + 1.0 end
    return p
end

--------------------------------------------------------------------------------
-- Script Definition
--------------------------------------------------------------------------------
return
{
    name = 'Tri-Phase Window'
    , author = 'Claude'

    -- Luading simulator extension; ignored by Disting NT.
    , luading = {
        parameterPresets = {
            { name = 'Default', values = { 1, 0, 33, 66, 10, 12, 1, 100 } }
            , { name = 'Slow Wide', values = { 0.1, 0, 25, 75, 5, 12, 2, 80 } }
            , { name = 'Fast Modulated', values = { 5, 0, 33, 66, 35, 48, 1, 100 } }
        }
    }

    --------------------------------------------------------------------------------
    -- Initialization
    --------------------------------------------------------------------------------
    , init = function(self)
        -- Initialize state
        phase = 0.0
        gateState = false
        lfoA, lfoB, lfoC = 0, 0, 0

        return
        {
            -- Inputs:
            -- 1: Rate CV (adds to base rate, ~1V/octave style scaling)
            -- 2: Phase A CV (adds to Phase A offset)
            -- 3: Phase B CV (adds to Phase B offset)
            -- 4: Phase C CV (adds to Phase C offset)
            inputs = {
                kCV, -- Type: Sine LFO, Synced: true, Division: 2 bars
                kCV, -- Type: Sine LFO, Synced: true, Division: 1 bar
                kCV, -- Type: Triangle LFO, Synced: true, Division: 1/2
                kCV, -- Type: Sine LFO, Synced: true, Division: 1/4
            }

            -- Outputs:
            -- 1: Gate (stepped - binary on/off)
            -- 2: LFO A - Upper threshold (linear for smooth CV)
            -- 3: LFO B - Lower threshold (linear for smooth CV)
            -- 4: LFO C - Compared signal (linear for smooth CV)
            , outputs = {
                kStepped, -- Type: Hi-hat Trigger
                kLinear,  -- Type: Off
                kLinear,  -- Type: Off
                kLinear,  -- Type: Off
            }

            -- Custom names for clarity in routing
            , inputNames = {
                "Rate CV",
                "Phase A CV",
                "Phase B CV",
                "Phase C CV"
            }
            , outputNames = {
                "Gate",
                "LFO A (Upper)",
                "LFO B (Lower)",
                "LFO C (Signal)"
            }

            -- Parameters
            , parameters =
            {
                -- Base rate in Hz (0.01 to 20 Hz, default 1 Hz)
                { "Rate", 1, 2000, 100, kHz, kBy100 }

                -- Phase offsets (0-100% of cycle, displayed as percentage)
                , { "Phase A", 0, 100, 0, kPercent }
                , { "Phase B", 0, 100, 33, kPercent }
                , { "Phase C", 0, 100, 66, kPercent }

                -- CV amount for phase modulation (how much CV affects phase)
                -- Scaled by 10, so 100 = 10% phase shift per volt
                , { "Phase CV Amt", 0, 500, 100, kPercent, kBy10 }

                -- Rate CV amount (semitones per volt, like 1V/oct but configurable)
                , { "Rate CV Amt", 0, 120, 12, kSemitones }

                -- Window mode: Normal or Auto-sort
                , { "Window Mode", { "Normal", "Auto-sort" }, 1 }

                -- Output amplitude (0-100%, default 100%)
                , { "Amplitude", 0, 100, 100, kPercent }
            }
        }
    end

    --------------------------------------------------------------------------------
    -- Step Function (called every ~1ms)
    --------------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        local params = self.parameters

        -- Read parameters
        local baseRate = params[1]           -- Hz (already scaled by kBy100)
        local phaseAOffset = params[2] / 100 -- Convert % to 0-1
        local phaseBOffset = params[3] / 100
        local phaseCOffset = params[4] / 100
        local phaseCVAmt = params[5] / 1000  -- Scaled: 100 = 0.1 phase shift per volt
        local rateCVAmt = params[6]          -- Semitones per volt
        local windowMode = params[7]         -- 1 = Normal, 2 = Auto-sort
        local amplitude = params[8] / 100    -- 0-1

        -- Read CV inputs
        local rateCV = inputs[1] or 0
        local phaseACV = inputs[2] or 0
        local phaseBCV = inputs[3] or 0
        local phaseCCV = inputs[4] or 0

        -- Calculate actual rate with CV modulation (exponential FM)
        -- rateCVAmt semitones per volt means rate multiplier of 2^(cv * rateCVAmt / 12)
        local rateMultiplier = 2 ^ (rateCV * rateCVAmt / 12)
        local actualRate = baseRate * rateMultiplier

        -- Clamp rate to reasonable bounds (0.001 Hz to 100 Hz)
        actualRate = math.max(0.001, math.min(100, actualRate))

        -- Advance master phase
        phase = phase + dt * actualRate
        phase = wrapPhase(phase)

        -- Calculate individual LFO phases with offsets and CV modulation
        local phaseA = wrapPhase(phase + phaseAOffset + phaseACV * phaseCVAmt)
        local phaseB = wrapPhase(phase + phaseBOffset + phaseBCV * phaseCVAmt)
        local phaseC = wrapPhase(phase + phaseCOffset + phaseCCV * phaseCVAmt)

        -- Generate triangle waveforms
        lfoA = triangle(phaseA) * amplitude
        lfoB = triangle(phaseB) * amplitude
        lfoC = triangle(phaseC) * amplitude

        -- Window comparison
        local upper, lower
        if windowMode == 2 then
            -- Auto-sort: always create valid window regardless of which is higher
            upper = math.max(lfoA, lfoB)
            lower = math.min(lfoA, lfoB)
        else
            -- Normal: A is upper, B is lower (may create inverted window)
            upper = lfoA
            lower = lfoB
        end

        -- Gate is high when C is within the window
        local newGateState
        if upper >= lower then
            -- Normal window: C must be between lower and upper
            newGateState = (lfoC >= lower) and (lfoC <= upper)
        else
            -- Inverted window (only in Normal mode): gate when C is outside
            newGateState = (lfoC >= upper) and (lfoC <= lower)
        end

        gateState = newGateState

        -- Output voltages
        local gateVoltage = gateState and 5.0 or 0.0

        return { gateVoltage, lfoA, lfoB, lfoC }
    end

    --------------------------------------------------------------------------------
    -- Custom Display
    --------------------------------------------------------------------------------
    , draw = function(self)
        local params = self.parameters
        local amplitude = params[8] / 100

        -- Screen dimensions: 256 x 64 pixels
        -- Leave top area for parameter line

        -- Draw waveform visualization area
        local leftMargin = 10
        local rightMargin = 246
        local topLine = 18
        local centerY = 40
        local waveHeight = 18

        -- Draw center line (zero voltage reference)
        drawLine(leftMargin, centerY, rightMargin, centerY, 2)

        -- Draw window bounds
        local scaleY = waveHeight / (5.0 * amplitude + 0.001)

        -- Map LFO values to screen Y coordinates (inverted: positive = up)
        local yA = centerY - lfoA * scaleY
        local yB = centerY - lfoB * scaleY
        local yC = centerY - lfoC * scaleY

        -- Draw window region (shaded area between A and B)
        local windowTop = math.min(yA, yB)
        local windowBottom = math.max(yA, yB)
        -- Draw faint window region
        drawRectangle(leftMargin, windowTop, rightMargin, windowBottom, 2)

        -- Draw threshold lines
        drawLine(leftMargin, yA, rightMargin, yA, 8)  -- LFO A - brighter
        drawLine(leftMargin, yB, rightMargin, yB, 6)  -- LFO B - medium

        -- Draw LFO C as a marker/cursor
        local cursorX = 128  -- Center of screen
        drawSmoothCircle(cursorX, yC, 4, 15)  -- Bright circle for C position

        -- Draw vertical line showing C position relative to window
        drawLine(cursorX, yC, cursorX, centerY, 10)

        -- Gate indicator
        if gateState then
            drawRectangle(230, 20, 250, 35, 15)
            drawTinyText(240, 32, "ON", 0, "centre")
        else
            drawBox(230, 20, 250, 35, 8)
            drawTinyText(240, 32, "OFF", 8, "centre")
        end

        -- Labels
        drawTinyText(leftMargin, 62, "A", 8)
        drawTinyText(leftMargin + 12, 62, "B", 6)
        drawTinyText(leftMargin + 24, 62, "C", 15)

        -- Show rate
        local rate = params[1]
        local rateStr
        if rate < 1 then
            rateStr = string.format("%.2fHz", rate)
        else
            rateStr = string.format("%.1fHz", rate)
        end
        drawTinyText(rightMargin - 30, 62, rateStr, 8, "centre")

        -- Return false to show standard parameter line at top
        return false
    end
}
