-- Wind Meadow Physics
-- Four patches of springy grass bend as gusts travel across a meadow.
--[[
This independently authored Disting NT model treats four meadow patches as
damped angular springs. A deterministic wind field travels from the windward
edge to the lee edge, combining a steady flow, broad gust envelopes, and
shorter turbulent eddies. Each patch responds to aerodynamic drag proportional
to the signed square of the wind relative to the moving grass.

Inputs 1-5 modulate Wind, Gusts, Turbulence, Flexibility, and Travel through
their matching bipolar CV Depth parameters. Outputs 1-4 are the signed bend of
the four patches, output 5 is their mean, output 6 is the instantaneous wind at
the windward patch, and output 7 is +5 V while a strong gust is present.

Direction reverses both the sign and travel direction of the wind. Flexibility
changes spring stiffness, Damping controls how long the grass continues to
sway, and Travel sets how quickly weather features cross the four patches.
This is a control-rate creative model, not calibrated fluid or plant mechanics.
]]

local TWO_PI = 2.0 * math.pi
local GATE_VOLTAGE = 5.0
local MAX_ANGLE = 1.18

local INPUT_WIND = 1
local INPUT_GUSTS = 2
local INPUT_TURBULENCE = 3
local INPUT_FLEXIBILITY = 4
local INPUT_TRAVEL = 5

local PARAM_WIND = 1
local PARAM_GUSTS = 2
local PARAM_TURBULENCE = 3
local PARAM_FLEXIBILITY = 4
local PARAM_TRAVEL = 5
local PARAM_DAMPING = 6
local PARAM_DIRECTION = 7
local PARAM_WIND_CV = 8
local PARAM_GUSTS_CV = 9
local PARAM_TURBULENCE_CV = 10
local PARAM_FLEXIBILITY_CV = 11
local PARAM_TRAVEL_CV = 12

local DIRECTION_RIGHT = 1
local DIRECTION_LEFT = 2

local DEFAULT_PARAMETERS = {
    45, 55, 30, 60, 100, 85, DIRECTION_RIGHT,
    0, 0, 0, 0, 0,
}

local PATCH_POSITIONS = { 0.0, 0.85, 1.70, 2.55 }
local outputBuffer = { 0, 0, 0, 0, 0, 0, 0 }

local function clamp(value, minimum, maximum)
    if value < minimum then return minimum end
    if value > maximum then return maximum end
    return value
end

local function parameter(self, index)
    if self.parameters and self.parameters[index] ~= nil then
        return self.parameters[index]
    end
    return DEFAULT_PARAMETERS[index]
end

local function cvAmount(self, index)
    return parameter(self, index) / 100.0
end

local function normalizedControl(self, inputs, parameterIndex, inputIndex, cvIndex)
    return clamp(
        parameter(self, parameterIndex)
            + (inputs[inputIndex] or 0) * 20.0 * cvAmount(self, cvIndex),
        0,
        100
    ) / 100.0
end

local function effectiveControls(self, inputs)
    local wind = normalizedControl(self, inputs, PARAM_WIND, INPUT_WIND, PARAM_WIND_CV)
    local gusts = normalizedControl(self, inputs, PARAM_GUSTS, INPUT_GUSTS, PARAM_GUSTS_CV)
    local turbulence = normalizedControl(
        self,
        inputs,
        PARAM_TURBULENCE,
        INPUT_TURBULENCE,
        PARAM_TURBULENCE_CV
    )
    local flexibility = normalizedControl(
        self,
        inputs,
        PARAM_FLEXIBILITY,
        INPUT_FLEXIBILITY,
        PARAM_FLEXIBILITY_CV
    )
    local travel = clamp(
        parameter(self, PARAM_TRAVEL)
            + (inputs[INPUT_TRAVEL] or 0) * 75.0 * cvAmount(self, PARAM_TRAVEL_CV),
        25,
        400
    ) / 100.0
    local damping = parameter(self, PARAM_DAMPING) / 100.0
    local direction = parameter(self, PARAM_DIRECTION) == DIRECTION_LEFT and -1.0 or 1.0
    return wind, gusts, turbulence, flexibility, travel, damping, direction
end

local function gustEnvelope(phase)
    local broad = 0.5 + 0.5 * math.sin(phase)
    local narrow = 0.5 + 0.5 * math.sin(phase * 0.53 + 1.9)
    return 0.72 * broad * broad * broad
        + 0.28 * narrow * narrow * narrow * narrow * narrow
end

local function windAt(time, position, wind, gusts, turbulence, travel, direction)
    -- Spatial phase changes sign with Direction, so the same weather feature
    -- reaches the windward patch first whichever way the wind is travelling.
    local phase = TWO_PI * 0.115 * travel * time - direction * position * 1.18
    local gust = gustEnvelope(phase)
    local eddies = 0.62 * math.sin(phase * 2.7 + position * 1.31)
        + 0.25 * math.sin(phase * 5.1 - position * 2.17 + 0.8)
        + 0.13 * math.sin(phase * 9.4 + position * 4.03 + 2.1)
    local speed = wind * 1.25 + gusts * 0.95 * gust + turbulence * 0.34 * eddies
    return direction * speed
end

local function isIndexable(value)
    local valueType = type(value)
    return valueType == "table" or valueType == "userdata"
end

local function sequenceValue(sequence, index)
    if sequence[0] ~= nil then return sequence[index - 1] end
    return sequence[index]
end

local function restoreVector(value)
    local restored = { 0, 0, 0, 0 }
    if not isIndexable(value) then return restored end
    for index = 1, 4 do restored[index] = tonumber(sequenceValue(value, index)) or 0 end
    return restored
end

local function integratePatch(angle, velocity, airflow, flexibility, damping, dt)
    -- A flexible stem has a weaker restoring spring. Aerodynamic torque uses
    -- signed v^2 drag and subtracts a little tip velocity from the local flow.
    local stiffness = 34.0 - 27.0 * flexibility
    local dampingRate = 1.6 + 5.2 * damping
    local relativeWind = airflow - velocity * 0.11
    local windTorque = 5.4 * relativeWind * math.abs(relativeWind) * math.cos(angle)
    local acceleration = windTorque - stiffness * angle - dampingRate * velocity

    velocity = velocity + acceleration * dt
    angle = angle + velocity * dt
    if angle > MAX_ANGLE then
        angle = MAX_ANGLE
        if velocity > 0 then velocity = -velocity * 0.18 end
    elseif angle < -MAX_ANGLE then
        angle = -MAX_ANGLE
        if velocity < 0 then velocity = -velocity * 0.18 end
    end
    return angle, velocity
end

local function normalizedBend(angle)
    return clamp(angle / MAX_ANGLE, -1.0, 1.0)
end

local function interpolate(values, position)
    local scaled = clamp(position, 0, 1) * 3.0
    local left = math.floor(scaled) + 1
    if left >= 4 then return values[4] or 0 end
    local mix = scaled - math.floor(scaled)
    return (values[left] or 0) * (1.0 - mix) + (values[left + 1] or 0) * mix
end

return {
    name = "Wind Meadow Physics",
    author = "Fredi Bach",

    -- Luading simulator extension; ignored by Disting NT.
    luading = {
        parameterPresets = {
            { name = "Summer breeze", values = { 45, 55, 30, 60, 100, 85, 1, 0, 0, 0, 0, 0 } },
            { name = "Still morning", values = { 12, 12, 5, 45, 55, 120, 1, 0, 0, 0, 0, 0 } },
            { name = "Rolling gusts", values = { 42, 95, 18, 72, 70, 65, 1, 0, 0, 0, 0, 0 } },
            { name = "Storm front", values = { 85, 100, 88, 85, 185, 45, 1, 0, 0, 0, 0, 0 } },
            { name = "West wind", values = { 52, 62, 38, 60, 115, 80, 2, 0, 0, 0, 0, 0 } },
        },
    },

    init = function(self)
        self.state = self.state or {}
        self.time = tonumber(self.state.time) or 0.0
        self.angles = restoreVector(self.state.angles)
        self.velocities = restoreVector(self.state.velocities)
        self.localWind = { 0, 0, 0, 0 }
        self.bends = { 0, 0, 0, 0 }
        self.meanBend = 0.0
        self.gustGate = false
        self.direction = 1.0
        self.turbulence = 0.0

        return {
            inputs = {
                kCV, -- Type: Manual / DC
                kCV, -- Type: Manual / DC
                kCV, -- Type: Manual / DC
                kCV, -- Type: Manual / DC
                kCV, -- Type: Manual / DC
            },
            inputNames = { "Wind CV", "Gusts CV", "Turbulence CV", "Flexibility CV", "Travel CV" },
            outputs = {
                kLinear,  -- Type: Off
                kLinear,  -- Type: Off
                kLinear,  -- Type: Off
                kLinear,  -- Type: Off
                kLinear,  -- Type: Off
                kLinear,  -- Type: Off
                kStepped, -- Type: Off
            },
            outputNames = { "Grass 1", "Grass 2", "Grass 3", "Grass 4", "Mean bend", "Wind field", "Gust gate" },
            parameters = {
                { "Wind", 0, 100, 45, kPercent },
                { "Gusts", 0, 100, 55, kPercent },
                { "Turbulence", 0, 100, 30, kPercent },
                { "Flexibility", 0, 100, 60, kPercent },
                { "Travel", 25, 400, 100, kPercent },
                { "Damping", 0, 200, 85, kPercent },
                { "Direction", { "Left to right", "Right to left" }, DIRECTION_RIGHT },
                { "Wind CV", -100, 100, 0, kPercent },
                { "Gusts CV", -100, 100, 0, kPercent },
                { "Turbulence CV", -100, 100, 0, kPercent },
                { "Flexibility CV", -100, 100, 0, kPercent },
                { "Travel CV", -100, 100, 0, kPercent },
            },
        }
    end,

    step = function(self, dt, inputs)
        self.time = self.time + dt
        local wind, gusts, turbulence, flexibility, travel, damping, direction =
            effectiveControls(self, inputs)
        local sum = 0.0
        local strongestWind = 0.0

        for index, position in ipairs(PATCH_POSITIONS) do
            local airflow = windAt(
                self.time,
                position,
                wind,
                gusts,
                turbulence,
                travel,
                direction
            )
            local angle, velocity = integratePatch(
                self.angles[index],
                self.velocities[index],
                airflow,
                flexibility,
                damping,
                dt
            )
            local bend = normalizedBend(angle)
            local voltage = bend * 5.0
            self.localWind[index] = airflow
            self.angles[index] = angle
            self.velocities[index] = velocity
            self.bends[index] = bend
            outputBuffer[index] = voltage
            sum = sum + voltage
            strongestWind = math.max(strongestWind, math.abs(airflow))
        end

        self.meanBend = sum / 4.0
        self.gustGate = strongestWind >= 1.15
        self.direction = direction
        self.turbulence = turbulence
        outputBuffer[5] = self.meanBend
        outputBuffer[6] = clamp(self.localWind[direction > 0 and 1 or 4] / 1.7, -1, 1) * 5.0
        outputBuffer[7] = self.gustGate and GATE_VOLTAGE or 0.0
        return outputBuffer
    end,

    serialise = function(self)
        return {
            time = self.time,
            angles = self.angles,
            velocities = self.velocities,
        }
    end,

    draw = function(self)
        local groundY = 58
        local meadowLeft = 29
        local meadowRight = 158
        local windLeft = 6
        local windRight = 181
        local bladeCount = 22
        local arrow = self.direction > 0 and "WIND >" or "< WIND"

        drawTinyText(4, 7, "MEADOW PHYSICS", 15)
        drawTinyText(181, 7, arrow, 9, "right")
        drawLine(4, groundY, 183, groundY, 5)

        local windSpeed = math.abs(self.localWind[self.direction > 0 and 1 or 4] or 0)
        for streak = 1, 3 do
            local span = windRight - windLeft + 28
            local progress = (
                self.time * (0.08 + windSpeed * 0.16) + streak * 0.31
            ) % 1.0
            if self.direction < 0 then progress = 1.0 - progress end
            local x = windLeft - 14 + progress * span
            local y = 13 + streak * 7
            drawSmoothLine(clamp(x - 8, windLeft, windRight), y, clamp(x + 8, windLeft, windRight), y, 4 + streak)
        end

        for blade = 1, bladeCount do
            local fraction = (blade - 1) / (bladeCount - 1)
            local rootX = meadowLeft + fraction * (meadowRight - meadowLeft)
            local baseAngle = interpolate(self.angles, fraction)
            local flutter = self.turbulence * 0.055
                * math.sin(self.time * (4.1 + (blade % 5) * 0.73) + blade * 1.91)
            local angle = clamp(baseAngle + flutter, -MAX_ANGLE, MAX_ANGLE)
            local height = 14 + (blade * 7 % 13)
            local midX = rootX + math.sin(angle * 0.62) * height * 0.48
            local midY = groundY - math.cos(angle * 0.62) * height * 0.48
            local tipX = rootX + math.sin(angle) * height
            local tipY = groundY - math.cos(angle) * height
            local shade = 7 + blade % 7
            drawSmoothLine(rootX, groundY, midX, midY, shade)
            drawSmoothLine(midX, midY, tipX, tipY, shade + 1)
            if blade % 4 == 0 then drawSmoothCircle(tipX, tipY, 0.8, 13) end
        end

        drawLine(188, 4, 188, 59, 4)
        drawTinyText(193, 13, arrow, 9)
        drawTinyText(193, 27, string.format("MEAN %+.1fV", self.meanBend or 0), 15)
        drawTinyText(193, 40, self.gustGate and "GUST HIGH" or "GUST LOW", self.gustGate and 15 or 6)
        drawTinyText(193, 53, string.format("AIR %+.1fV", outputBuffer[6] or 0), 11)
        return true
    end,
}
