-- FM Helper
--[[
Generates precise CV offsets for FM synthesis ratios.
Feed V/Oct to input, get ratio-offset CVs for carrier/modulator pairs.
]]

--------------------------------------------------------------------------------
-- Configuration: FM Ratio Presets
--------------------------------------------------------------------------------

-- Each entry: { name, numerator, denominator }
-- Ratio = num/den, so 2:1 means modulator is 2x carrier frequency
local RATIOS = {
    { "1:1",   1, 1 },    -- Unison
    { "2:1",   2, 1 },    -- Octave up
    { "3:1",   3, 1 },    -- Octave + fifth
    { "4:1",   4, 1 },    -- Two octaves
    { "5:1",   5, 1 },    -- Two oct + major third
    { "6:1",   6, 1 },    -- Two oct + fifth
    { "7:1",   7, 1 },    -- Harmonic 7th
    { "8:1",   8, 1 },    -- Three octaves
    { "1:2",   1, 2 },    -- Octave down
    { "1:3",   1, 3 },    -- Octave + fifth down
    { "1:4",   1, 4 },    -- Two octaves down
    { "3:2",   3, 2 },    -- Perfect fifth
    { "4:3",   4, 3 },    -- Perfect fourth
    { "5:4",   5, 4 },    -- Major third
    { "5:3",   5, 3 },    -- Major sixth
    { "6:5",   6, 5 },    -- Minor third
    { "7:4",   7, 4 },    -- Harmonic seventh
    { "9:8",   9, 8 },    -- Major second
    { "5:2",   5, 2 },    -- Octave + major third
    { "7:2",   7, 2 },    -- ~Octave + minor 7th
    { "9:4",   9, 4 },    -- Octave + major second
    { "11:4", 11, 4 },    -- Harmonic 11th
    { "2:3",   2, 3 },    -- Fifth down
    { "3:4",   3, 4 },    -- Fourth down
}

-- Build enum names array for parameter definition
local ratioNames = {}
for i, r in ipairs(RATIOS) do
    ratioNames[i] = r[1]
end

--------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------

-- Calculate voltage offset for a given ratio index
local function getOffsetVoltage(ratioIndex)
    local r = RATIOS[ratioIndex]
    if not r then return 0 end
    local ratio = r[2] / r[3]
    return math.log(ratio) / math.log(2)  -- log2(ratio)
end

--------------------------------------------------------------------------------
-- Display Helpers
--------------------------------------------------------------------------------

local DISPLAY_TWO_PI = math.pi * 2
local DISPLAY_IMPULSE_TIME = 0.18
local DISPLAY_RULER_LEFT = 72
local DISPLAY_RULER_RIGHT = 247
local DISPLAY_RULER_MIN = -2
local DISPLAY_RULER_MAX = 3

local function clamp(value, minimum, maximum)
    return math.max(minimum, math.min(maximum, value))
end

local function ratioValue(ratioIndex)
    local ratio = RATIOS[ratioIndex]
    if not ratio then return 1 end
    return ratio[2] / ratio[3]
end

local function gearRadius(offset)
    -- An octave of ratio change alters the radius by half a pixel. Keeping the
    -- range narrow leaves every embedded ratio legible in the 2x2 gear train.
    return clamp(9 - offset * 0.5, 7.5, 10.5)
end

local function rulerX(offset)
    local normalized = (
        clamp(offset, DISPLAY_RULER_MIN, DISPLAY_RULER_MAX)
        - DISPLAY_RULER_MIN
    ) / (DISPLAY_RULER_MAX - DISPLAY_RULER_MIN)
    return DISPLAY_RULER_LEFT
        + normalized * (DISPLAY_RULER_RIGHT - DISPLAY_RULER_LEFT)
end

local function beltEndpoints(fromX, fromY, fromRadius, toX, toY, toRadius)
    local dx = toX - fromX
    local dy = toY - fromY
    local length = math.sqrt(dx * dx + dy * dy)
    local ux = dx / length
    local uy = dy / length
    return fromX + ux * fromRadius,
        fromY + uy * fromRadius,
        toX - ux * toRadius,
        toY - uy * toRadius
end

local function drawGear(x, y, radius, phase, label, shade)
    local teeth = 8
    drawSmoothCircle(x, y, radius, shade)

    for tooth = 0, teeth - 1 do
        local angle = (phase + tooth / teeth) * DISPLAY_TWO_PI
        local cosAngle = math.cos(angle)
        local sinAngle = math.sin(angle)
        drawSmoothLine(
            x + cosAngle * (radius + 0.5),
            y + sinAngle * (radius + 0.5),
            x + cosAngle * (radius + 2.5),
            y + sinAngle * (radius + 2.5),
            shade
        )
    end

    for spoke = 0, 3 do
        local angle = (phase + spoke / 4) * DISPLAY_TWO_PI
        drawSmoothLine(
            x + math.cos(angle) * 2,
            y + math.sin(angle) * 2,
            x + math.cos(angle) * (radius - 2),
            y + math.sin(angle) * (radius - 2),
            math.max(4, shade - 3)
        )
    end

    drawSmoothCircle(x, y, 1.3, math.min(15, shade + 2))
    drawTinyText(x, y + 2, label, math.min(15, shade + 1), "centre")
end

--------------------------------------------------------------------------------
-- Script Definition
--------------------------------------------------------------------------------

return {
    name = 'FM Helper'
    , author = 'Expert Sleepers Ltd'

    -- Luading simulator extension; ignored by Disting NT.
    , luading = {
        parameterPresets = {
            { name = 'Default', values = { 1, 2, 5, 12 } }
            , { name = 'Odd Harmonics', values = { 1, 3, 5, 7 } }
            , { name = 'Subharmonic Cluster', values = { 9, 12, 13, 18 } }
        }
    }
    
    , init = function(self)
        -- Initialize state
        self.inputVoltage = 0
        self.offsets = { 0, 0, 0, 0 }
        self.outputVoltages = { 0, 0, 0, 0 }

        -- Animation state is advanced at the 1 ms control cadence. draw() only
        -- consumes these phases and timestamps.
        self.display_time = 0
        self.display_carrier_phase = 0
        self.display_output_phases = { 0, 0, 0, 0 }
        self.display_last_input = 0
        self.display_has_input = false
        self.display_pitch_change_started = -1
        
        return {
            inputs = {
                kCV, -- Type: Note Sequencer (V/Oct), Synced: true, Division: 1/4
            }
            , outputs = {
                kLinear, -- Type: Synth Note
                kLinear, -- Type: Off
                kLinear, -- Type: Off
                kLinear, -- Type: Off
            }
            , inputNames = { "V/Oct In" }
            , outputNames = { "Ratio 1", "Ratio 2", "Ratio 3", "Ratio 4" }
            , parameters = {
                { "Ratio 1", ratioNames, 1 }      -- Default 1:1
                , { "Ratio 2", ratioNames, 2 }    -- Default 2:1
                , { "Ratio 3", ratioNames, 5 }    -- Default 5:1
                , { "Ratio 4", ratioNames, 12 }   -- Default 3:2
            }
        }
    end
    
    , step = function(self, dt, inputs)
        -- Read input voltage
        self.inputVoltage = inputs[1]
        self.display_time = self.display_time + dt

        if self.display_has_input then
            -- Ignore sub-semitone chatter; a deliberate pitch jump launches
            -- the short impulse shared by all four belts.
            if math.abs(self.inputVoltage - self.display_last_input) >= 1 / 12 then
                self.display_pitch_change_started = self.display_time
            end
        else
            self.display_has_input = true
        end
        self.display_last_input = self.inputVoltage
        
        -- Calculate offset for each output based on parameter selection
        local outputs = {}
        local displaySpeed = 0.12
            + clamp((self.inputVoltage + 5) / 10, 0, 1) * 0.12
        self.display_carrier_phase = (
            self.display_carrier_phase + dt * displaySpeed
        ) % 1

        for i = 1, 4 do
            local ratioIndex = self.parameters[i]
            self.offsets[i] = getOffsetVoltage(ratioIndex)
            self.outputVoltages[i] = self.inputVoltage + self.offsets[i]
            outputs[i] = self.outputVoltages[i]

            -- Belt-driven gears turn opposite the carrier. Their selected
            -- frequency ratio controls the illustrative rotation speed.
            local ratio = ratioValue(ratioIndex)
            self.display_output_phases[i] = (
                self.display_output_phases[i] - dt * displaySpeed * ratio
            ) % 1
        end
        
        return outputs
    end
    
    , draw = function(self)
        local carrierX = 38
        local carrierY = 29
        local carrierRadius = 13.5
        local gearX = { 104, 180, 104, 180 }
        local gearY = { 17, 17, 41, 41 }
        local telemetryX = { 118, 194, 118, 194 }

        -- Belts sit behind the gear silhouettes.
        for i = 1, 4 do
            local radius = gearRadius(self.offsets[i])
            local x1, y1, x2, y2 = beltEndpoints(
                carrierX,
                carrierY,
                carrierRadius,
                gearX[i],
                gearY[i],
                radius
            )
            drawSmoothLine(x1, y1, x2, y2, 4)
        end

        -- A pitch jump sends one bright impulse down every belt. The animation
        -- is elapsed-time based, so skipped draw frames do not change its path.
        local impulseAge = self.display_time - self.display_pitch_change_started
        if self.display_pitch_change_started >= 0
            and impulseAge < DISPLAY_IMPULSE_TIME then
            local progress = clamp(impulseAge / DISPLAY_IMPULSE_TIME, 0, 1)
            local shade = 15 - math.floor(progress * 5)
            for i = 1, 4 do
                local radius = gearRadius(self.offsets[i])
                local x1, y1, x2, y2 = beltEndpoints(
                    carrierX,
                    carrierY,
                    carrierRadius,
                    gearX[i],
                    gearY[i],
                    radius
                )
                drawSmoothCircle(
                    x1 + (x2 - x1) * progress,
                    y1 + (y2 - y1) * progress,
                    2,
                    shade
                )
            end
        end

        drawGear(
            carrierX,
            carrierY,
            carrierRadius,
            self.display_carrier_phase,
            "IN",
            11
        )
        drawTinyText(
            carrierX,
            50,
            string.format("%+.2fV", self.inputVoltage),
            13,
            "centre"
        )

        -- Ratio, diameter, and counter-rotation all express the same selected
        -- frequency relationship. Exact octave offsets remain adjacent.
        for i = 1, 4 do
            local ratioIndex = self.parameters[i]
            local ratioName = RATIOS[ratioIndex][1]
            drawGear(
                gearX[i],
                gearY[i],
                gearRadius(self.offsets[i]),
                self.display_output_phases[i],
                ratioName,
                8 + i
            )
            drawTinyText(
                telemetryX[i],
                gearY[i] + 2,
                string.format("%d %+.3f", i, self.offsets[i]),
                8 + i
            )
        end

        -- Shared -2 to +3 octave ruler. Each numbered tick is authoritative:
        -- it is positioned from the same offset used for the output CV.
        local zeroX = rulerX(0)
        drawLine(DISPLAY_RULER_LEFT, 59, DISPLAY_RULER_RIGHT, 59, 4)
        drawLine(zeroX, 56, zeroX, 62, 7)
        drawTinyText(DISPLAY_RULER_LEFT - 2, 62, "-2", 5, "right")
        drawTinyText(DISPLAY_RULER_RIGHT, 62, "+3", 5, "right")
        for i = 1, 4 do
            local tickX = rulerX(self.offsets[i])
            drawRectangle(tickX - 1, 56, tickX + 1, 61, 8 + i)
            drawTinyText(tickX, 55, tostring(i), 11 + i, "centre")
        end

        return true  -- Suppress standard parameter line
    end
}
