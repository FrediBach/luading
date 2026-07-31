-- Note Slew Limiter
--[[
Limits how fast notes can change with direction control.
Creates stepped portamento effects where notes move one
semitone at a time toward the target, respecting configurable
slew rates and directional constraints.
]]

--------------------------------------------------------------------------------
-- State variables (local to script)
--------------------------------------------------------------------------------
local currentNoteSemitones = 0    -- Current output note in semitones (0 = 0V)
local targetNoteSemitones = 0     -- Target note from input
local timeSinceLastChange = 0     -- Accumulator for timing note changes
local gateHigh = false            -- Track gate output state
local gateTimer = 0               -- Timer for gate pulse duration

--------------------------------------------------------------------------------
-- Constants
--------------------------------------------------------------------------------
local SEMITONE_VOLTS = 1.0 / 12.0  -- V/Oct: 1 semitone = 1/12 volt
local GATE_PULSE_TIME = 0.010      -- 10ms gate pulse on note change
local GATE_HIGH_VOLTAGE = 5.0
local GATE_LOW_VOLTAGE = 0.0

--------------------------------------------------------------------------------
-- Direction mode enum values (matching parameter order)
--------------------------------------------------------------------------------
local DIR_BOTH = 1       -- Slew limited in both directions
local DIR_UP_ONLY = 2    -- Only upward movement is slew limited
local DIR_DOWN_ONLY = 3  -- Only downward movement is slew limited

--------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------

--- Quantize a voltage to the nearest semitone and return semitone count
-- @param voltage V/Oct voltage
-- @return integer semitone value
local function voltageToSemitones(voltage)
    return math.floor(voltage * 12.0 + 0.5)
end

--- Convert semitones back to V/Oct voltage
-- @param semitones integer semitone count
-- @return voltage in V/Oct
local function semitonesToVoltage(semitones)
    return semitones * SEMITONE_VOLTS
end

--- Clamp a value between min and max
-- @param value the value to clamp
-- @param minVal minimum allowed value
-- @param maxVal maximum allowed value
-- @return clamped value
local function clamp(value, minVal, maxVal)
    if value < minVal then return minVal end
    if value > maxVal then return maxVal end
    return value
end

--- Calculate the sign of a number
-- @param x the number
-- @return -1, 0, or 1
local function sign(x)
    if x > 0 then return 1
    elseif x < 0 then return -1
    else return 0 end
end

--------------------------------------------------------------------------------
-- Main Script Table
--------------------------------------------------------------------------------
return
{
    name = 'Note Slew Limiter'
    , author = 'Expert Sleepers Ltd'

    ----------------------------------------------------------------------------
    -- Initialization
    ----------------------------------------------------------------------------
    , init = function(self)
        -- Initialize state
        currentNoteSemitones = 0
        targetNoteSemitones = 0
        timeSinceLastChange = 0
        gateHigh = false
        gateTimer = 0

        return
        {
            -- Input configuration
            -- Input 1: V/Oct pitch (CV for continuous reading)
            -- Input 2: Slew rate CV modulation
            inputs = {
                kCV, -- Type: Note Sequencer (V/Oct), Synced: true, Division: 1/4
                kCV, -- Type: Sine LFO, Synced: true, Division: 2 bars
            }
            , inputNames = { "V/Oct In", "Slew CV" }

            -- Output configuration
            -- Output 1: Slewed pitch (linear for smooth transitions)
            -- Output 2: Gate (stepped, fires on note changes)
            , outputs = {
                kLinear,  -- Type: Synth Note
                kStepped, -- Type: Synth Trigger
            }
            , outputNames = { "V/Oct Out", "Gate Out" }

            -- Parameters
            , parameters =
            {
                -- Slew Rate: semitones per second (1-48, default 12 = 1 oct/sec)
                { "Slew Rate", 1, 48, 12, kNone }

                -- Direction mode
                , { "Direction", { "Both", "Up Only", "Down Only" }, 1 }

                -- Whether to quantize the input to semitones
                , { "Quantize In", { "Yes", "No" }, 1 }

                -- CV modulation amount for slew rate (scaled by 10)
                , { "Slew CV Amt", 0, 100, 50, kPercent }
            }
        }
    end

    ----------------------------------------------------------------------------
    -- Step function - called every 1ms
    ----------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        local params = self.parameters

        -- Read parameters
        local baseSlew = params[1]                      -- Semitones per second
        local directionMode = params[2]                 -- 1=Both, 2=Up, 3=Down
        local quantizeInput = (params[3] == 1)          -- true if "Yes"
        local slewCvAmount = params[4] / 100.0          -- 0.0 to 1.0

        -- Read inputs
        local inputVoltage = inputs[1]                  -- V/Oct input
        local slewCv = inputs[2]                        -- Slew CV (-5V to +5V range)

        -- Calculate effective slew rate with CV modulation
        -- CV adds/subtracts up to 24 semitones/sec at full CV amount
        local cvModulation = slewCv * 4.8 * slewCvAmount  -- ±5V * 4.8 = ±24
        local effectiveSlew = clamp(baseSlew + cvModulation, 0.5, 96)

        -- Determine target note
        if quantizeInput then
            targetNoteSemitones = voltageToSemitones(inputVoltage)
        else
            -- Even without quantization, we work in semitones internally
            -- but allow the target to be the exact input for comparison
            targetNoteSemitones = voltageToSemitones(inputVoltage)
        end

        -- Calculate time needed per semitone change
        local timePerSemitone = 1.0 / effectiveSlew

        -- Update timing accumulator
        timeSinceLastChange = timeSinceLastChange + dt

        -- Calculate the difference to target
        local noteDifference = targetNoteSemitones - currentNoteSemitones
        local noteChanged = false

        if noteDifference ~= 0 then
            -- Determine if this direction should be slew-limited
            local applySlew = false

            if directionMode == DIR_BOTH then
                -- Always apply slew
                applySlew = true
            elseif directionMode == DIR_UP_ONLY then
                -- Only slew when going up (noteDifference > 0)
                applySlew = (noteDifference > 0)
            elseif directionMode == DIR_DOWN_ONLY then
                -- Only slew when going down (noteDifference < 0)
                applySlew = (noteDifference < 0)
            end

            if applySlew then
                -- Calculate how many semitones we're allowed to move
                local allowedSteps = math.floor(timeSinceLastChange / timePerSemitone)

                if allowedSteps >= 1 then
                    -- Move toward target by allowed amount (clamped to actual difference)
                    local stepsToMove = math.min(allowedSteps, math.abs(noteDifference))
                    local direction = sign(noteDifference)

                    currentNoteSemitones = currentNoteSemitones + (direction * stepsToMove)
                    timeSinceLastChange = timeSinceLastChange - (stepsToMove * timePerSemitone)
                    noteChanged = true
                end
            else
                -- No slew in this direction - instant change
                currentNoteSemitones = targetNoteSemitones
                timeSinceLastChange = 0
                noteChanged = true
            end
        else
            -- Already at target, reset accumulator
            timeSinceLastChange = 0
        end

        -- Handle gate output pulse
        if noteChanged then
            gateHigh = true
            gateTimer = GATE_PULSE_TIME
        end

        if gateHigh then
            gateTimer = gateTimer - dt
            if gateTimer <= 0 then
                gateHigh = false
                gateTimer = 0
            end
        end

        -- Convert current note back to voltage and return outputs
        local outputVoltage = semitonesToVoltage(currentNoteSemitones)
        local gateVoltage = gateHigh and GATE_HIGH_VOLTAGE or GATE_LOW_VOLTAGE

        return { outputVoltage, gateVoltage }
    end

    ----------------------------------------------------------------------------
    -- Draw function - custom display
    ----------------------------------------------------------------------------
    , draw = function(self)
        -- Draw standard parameter line at top
        drawStandardParameterLine()

        -- Display current state
        local currentV = semitonesToVoltage(currentNoteSemitones)
        local targetV = semitonesToVoltage(targetNoteSemitones)
        local diff = targetNoteSemitones - currentNoteSemitones

        -- Format note display (show semitones relative to 0V)
        local currentStr = string.format("%.2fV", currentV)
        local targetStr = string.format("%.2fV", targetV)

        -- Draw labels and values
        drawTinyText(10, 28, "OUT:", 8)
        drawText(40, 30, currentStr, 15)

        drawTinyText(10, 42, "TGT:", 8)
        drawText(40, 44, targetStr, 10)

        -- Draw direction indicator
        local directionMode = self.parameters[2]
        local dirStr = ""
        if directionMode == DIR_BOTH then
            dirStr = "BOTH"
        elseif directionMode == DIR_UP_ONLY then
            dirStr = "UP"
        elseif directionMode == DIR_DOWN_ONLY then
            dirStr = "DOWN"
        end
        drawTinyText(120, 28, "LIMIT:", 8)
        drawText(155, 30, dirStr, 12)

        -- Draw visual indicator of slew progress
        local barX = 120
        local barY = 40
        local barWidth = 120
        local barHeight = 8

        -- Draw bar outline
        drawBox(barX, barY, barX + barWidth, barY + barHeight, 4)

        -- Draw current position indicator
        -- Map note range to bar width (assume ±5 octaves = ±60 semitones)
        local noteRange = 120  -- -60 to +60 semitones
        local currentPos = clamp((currentNoteSemitones + 60) / noteRange, 0, 1)
        local targetPos = clamp((targetNoteSemitones + 60) / noteRange, 0, 1)

        local currentX = barX + math.floor(currentPos * barWidth)
        local targetX = barX + math.floor(targetPos * barWidth)

        -- Draw target as dim line
        if targetX >= barX and targetX <= barX + barWidth then
            drawLine(targetX, barY, targetX, barY + barHeight, 6)
        end

        -- Draw current as bright line
        if currentX >= barX and currentX <= barX + barWidth then
            drawRectangle(currentX - 1, barY + 1, currentX + 1, barY + barHeight - 1, 15)
        end

        -- Draw semitone difference
        local diffStr = ""
        if diff > 0 then
            diffStr = "+" .. diff .. " st"
        elseif diff < 0 then
            diffStr = diff .. " st"
        else
            diffStr = "= 0"
        end
        drawTinyText(200, 58, diffStr, 10)
    end
}
