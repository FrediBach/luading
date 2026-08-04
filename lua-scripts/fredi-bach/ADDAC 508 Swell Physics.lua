-- ADDAC 508 Swell Physics
-- Four related ocean-swell CVs, their average, and two comparator gates.
--[[
An independently authored Disting NT recreation of the behavior documented in
the ADDAC508 Swell Physics user guide (Revision 01, January 2024):
https://www.addacsystem.com/contents/productdownload/ADDAC508_SwellPhysics_A_1-compressed.pdf

The original module describes a Gerstner wave driving four equally spaced
buoys. This script uses its own deterministic sum of Gerstner-style vertical
wave components; ADDAC's coefficients and implementation are not published.

Inputs 1-4 modulate Swell, Agitation, Spread, and Speed through their matching
bipolar CV Depth parameters. Input 5 is routed to Offset or Gain by Aux target.

Outputs 1-4 are the buoy heights, output 5 is their average, output 6 is +5 V
while buoy 1 is below buoy 2, and output 7 is +5 V while buoy 3 is above buoy 4.

Scrolling mode gives every buoy the same path with a Spread-controlled delay.
Evolving mode samples four corners of a square, producing paths whose relation
decreases as Spread and Agitation increase. Fold, Thru, and Limit explicitly
select the three overflow behaviors described in the hardware manual.
]]

local TWO_PI = 2.0 * math.pi
local GATE_VOLTAGE = 5.0

local INPUT_SWELL = 1
local INPUT_AGITATION = 2
local INPUT_SPREAD = 3
local INPUT_SPEED = 4
local INPUT_AUX = 5

local PARAM_SWELL = 1
local PARAM_AGITATION = 2
local PARAM_SPREAD = 3
local PARAM_SPEED = 4
local PARAM_OFFSET = 5
local PARAM_GAIN = 6
local PARAM_RANGE = 7
local PARAM_MODE = 8
local PARAM_CLIPPING = 9
local PARAM_SWELL_CV = 10
local PARAM_AGITATION_CV = 11
local PARAM_SPREAD_CV = 12
local PARAM_SPEED_CV = 13
local PARAM_AUX_TARGET = 14
local PARAM_AUX_CV = 15

local RANGE_BIPOLAR = 1
local RANGE_POSITIVE = 2
local MODE_SCROLLING = 1
local MODE_EVOLVING = 2
local CLIP_FOLD = 1
local CLIP_THRU = 2
local CLIP_LIMIT = 3
local AUX_OFFSET = 1
local AUX_GAIN = 2

local DEFAULT_PARAMETERS = {
    70, 35, 35, 100, 0.0, 100,
    RANGE_BIPOLAR, MODE_EVOLVING, CLIP_FOLD,
    0, 0, 0, 0, AUX_OFFSET, 0,
}

-- Original wave coefficients. The first component is the ocean swell;
-- Agitation progressively mixes in shorter, differently directed waves.
-- Frequencies are cycles per second at 100% Speed and spatialFrequency is in
-- radians per model-space unit.
local WAVES = {
    { amplitude = 1.00, spatialFrequency = 0.70, frequency = 0.080, dx = 0.970, dy = 0.243, phase = 0.20 },
    { amplitude = 0.46, spatialFrequency = 1.15, frequency = 0.137, dx = -0.342, dy = 0.940, phase = 1.70 },
    { amplitude = 0.31, spatialFrequency = 1.90, frequency = 0.223, dx = 0.707, dy = 0.707, phase = 3.10 },
    { amplitude = 0.21, spatialFrequency = 3.10, frequency = 0.371, dx = -0.906, dy = 0.423, phase = 4.40 },
    { amplitude = 0.13, spatialFrequency = 4.80, frequency = 0.593, dx = 0.174, dy = -0.985, phase = 5.30 },
}

-- Four equally spaced points at the corners of a unit square.
local BUOY_POSITIONS = {
    { -0.5, -0.5 },
    {  0.5, -0.5 },
    {  0.5,  0.5 },
    { -0.5,  0.5 },
}

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

local function cvAmount(self, parameterIndex)
    return parameter(self, parameterIndex) / 100.0
end

local function effectiveControls(self, inputs)
    local swell = clamp(
        parameter(self, PARAM_SWELL)
            + (inputs[INPUT_SWELL] or 0) * 20.0 * cvAmount(self, PARAM_SWELL_CV),
        0,
        200
    ) / 100.0
    local agitation = clamp(
        parameter(self, PARAM_AGITATION)
            + (inputs[INPUT_AGITATION] or 0) * 20.0 * cvAmount(self, PARAM_AGITATION_CV),
        0,
        100
    ) / 100.0
    local spread = clamp(
        parameter(self, PARAM_SPREAD)
            + (inputs[INPUT_SPREAD] or 0) * 20.0 * cvAmount(self, PARAM_SPREAD_CV),
        0,
        100
    ) / 100.0
    local speed = clamp(
        parameter(self, PARAM_SPEED)
            + (inputs[INPUT_SPEED] or 0) * 40.0 * cvAmount(self, PARAM_SPEED_CV),
        0,
        400
    ) / 100.0

    local offset = parameter(self, PARAM_OFFSET)
    local gain = parameter(self, PARAM_GAIN) / 100.0
    local aux = inputs[INPUT_AUX] or 0
    local auxDepth = cvAmount(self, PARAM_AUX_CV)
    if parameter(self, PARAM_AUX_TARGET) == AUX_OFFSET then
        offset = clamp(offset + aux * auxDepth, -5.0, 5.0)
    else
        gain = clamp(gain + aux * 0.2 * auxDepth, 0.0, 2.0)
    end

    return swell, agitation, spread, speed, offset, gain
end

local function waveHeight(time, x, y, agitation, speed)
    local height = 0.0
    local normalization = 0.0

    for index, wave in ipairs(WAVES) do
        local mix = index == 1 and 1.0 or agitation ^ (0.72 + index * 0.14)
        local amplitude = wave.amplitude * mix
        local position = wave.dx * x + wave.dy * y
        local phase = wave.spatialFrequency * position
            - TWO_PI * wave.frequency * speed * time
            + wave.phase
        height = height + amplitude * math.sin(phase)
        normalization = normalization + amplitude
    end

    if normalization == 0 then return 0 end
    return height / normalization
end

local function clipWave(value, clippingMode)
    if clippingMode == CLIP_LIMIT then
        return clamp(value, -1.0, 1.0)
    end
    if clippingMode == CLIP_THRU then
        return (value + 1.0) % 2.0 - 1.0
    end

    -- Triangle-fold every excursion back into the normalized range.
    local folded = (value + 1.0) % 4.0
    if folded <= 2.0 then return folded - 1.0 end
    return 3.0 - folded
end

local function heightsForStep(self, swell, agitation, spread, speed)
    local heights = {}
    local clippingMode = parameter(self, PARAM_CLIPPING)
    local mode = parameter(self, PARAM_MODE)

    if mode == MODE_SCROLLING then
        -- At maximum Spread adjacent buoys follow the same path two seconds
        -- apart. Squaring Spread gives finer delay control near zero.
        local delay = 2.0 * spread * spread
        for index = 1, 4 do
            local delayedTime = self.time - (index - 1) * delay
            local raw = swell * waveHeight(delayedTime, 0, 0, agitation, speed)
            heights[index] = clipWave(raw, clippingMode)
        end
    else
        -- At zero Spread the four locations coincide. At maximum they occupy
        -- a square six model-space units wide.
        local distance = spread * 6.0
        for index, position in ipairs(BUOY_POSITIONS) do
            local raw = swell * waveHeight(
                self.time,
                position[1] * distance,
                position[2] * distance,
                agitation,
                speed
            )
            heights[index] = clipWave(raw, clippingMode)
        end
    end

    return heights
end

local function voltageForHeight(height, range, offset, gain)
    local base = range == RANGE_POSITIVE
        and 5.0 + height * 5.0
        or height * 5.0
    return base * gain + offset
end

local function formatVoltage(value)
    return string.format("%+.1fV", value)
end

return {
    name = "ADDAC 508 Swell Physics",
    author = "Fredi Bach",

    -- Luading simulator extension; ignored by Disting NT.
    luading = {
        parameterPresets = {
            { name = "Default sea", values = { 70, 35, 35, 100, 0.0, 100, 1, 2, 1, 0, 0, 0, 0, 1, 0 } },
            { name = "Calm bipolar", values = { 35, 5, 15, 60, 0.0, 100, 1, 2, 1, 0, 0, 0, 0, 1, 0 } },
            { name = "Rolling swell", values = { 80, 30, 35, 100, 0.0, 100, 1, 1, 1, 0, 0, 0, 0, 1, 0 } },
            { name = "High sea", values = { 155, 85, 75, 170, 0.0, 100, 1, 2, 1, 0, 0, 0, 0, 1, 0 } },
            { name = "Positive drift", values = { 70, 45, 55, 75, 0.0, 100, 2, 2, 3, 40, 30, 30, 25, 1, 100 } },
        },
    },

    init = function(self)
        self.state = self.state or {}
        self.time = tonumber(self.state.time) or 0.0
        self.heights = { 0, 0, 0, 0 }
        self.outputVoltages = { 0, 0, 0, 0 }
        self.average = 0.0
        self.gateOne = false
        self.gateTwo = false

        return {
            inputs = {
                kCV, -- Type: Sine LFO, Synced: true, Division: 2 bars
                kCV, -- Type: Triangle LFO, Synced: true, Division: 1 bar
                kCV, -- Type: Manual / DC
                kCV, -- Type: Manual / DC
                kCV, -- Type: Manual / DC
            },
            inputNames = { "Swell CV", "Agitation CV", "Spread CV", "Speed CV", "Aux CV" },
            outputs = {
                kLinear,  -- Type: Off
                kLinear,  -- Type: Off
                kLinear,  -- Type: Off
                kLinear,  -- Type: Off
                kLinear,  -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
            },
            outputNames = { "Buoy 1", "Buoy 2", "Buoy 3", "Buoy 4", "Average", "Gate 1<2", "Gate 3>4" },
            parameters = {
                { "Swell", 0, 200, 70, kPercent },
                { "Agitation", 0, 100, 35, kPercent },
                { "Spread", 0, 100, 35, kPercent },
                { "Speed", 0, 400, 100, kPercent },
                { "Offset", -500, 500, 0, kVolts, kBy100 },
                { "Gain", 0, 200, 100, kPercent },
                { "Range", { "Bipolar", "Positive" }, RANGE_BIPOLAR },
                { "Mode", { "Scrolling", "Evolving" }, MODE_EVOLVING },
                { "Clipping", { "Fold", "Thru", "Limit" }, CLIP_FOLD },
                { "Swell CV", -100, 100, 0, kPercent },
                { "Agitation CV", -100, 100, 0, kPercent },
                { "Spread CV", -100, 100, 0, kPercent },
                { "Speed CV", -100, 100, 0, kPercent },
                { "Aux target", { "Offset", "Gain" }, AUX_OFFSET },
                { "Aux CV", -100, 100, 0, kPercent },
            },
        }
    end,

    step = function(self, dt, inputs)
        self.time = self.time + dt
        local swell, agitation, spread, speed, offset, gain = effectiveControls(self, inputs)
        local heights = heightsForStep(self, swell, agitation, spread, speed)
        local range = parameter(self, PARAM_RANGE)
        local sum = 0.0

        for index = 1, 4 do
            local voltage = voltageForHeight(heights[index], range, offset, gain)
            outputBuffer[index] = voltage
            self.heights[index] = heights[index]
            self.outputVoltages[index] = voltage
            sum = sum + voltage
        end

        local average = sum / 4.0
        local gateOne = outputBuffer[1] < outputBuffer[2]
        local gateTwo = outputBuffer[3] > outputBuffer[4]
        outputBuffer[5] = average
        outputBuffer[6] = gateOne and GATE_VOLTAGE or 0.0
        outputBuffer[7] = gateTwo and GATE_VOLTAGE or 0.0
        self.average = average
        self.gateOne = gateOne
        self.gateTwo = gateTwo
        return outputBuffer
    end,

    serialise = function(self)
        return { time = self.time }
    end,

    draw = function(self)
        local mode = parameter(self, PARAM_MODE) == MODE_SCROLLING and "SCROLL" or "EVOLVE"
        local range = parameter(self, PARAM_RANGE) == RANGE_BIPOLAR and "BIPOLAR" or "POSITIVE"
        local clipLabels = { "FOLD", "THRU", "LIMIT" }
        local clipping = clipLabels[parameter(self, PARAM_CLIPPING)] or "FOLD"
        local buoyX = { 12, 66, 120, 174 }
        local previousX = nil
        local previousY = nil

        drawTinyText(4, 7, "SWELL PHYSICS", 15)
        drawTinyText(181, 7, mode, 8, "right")
        drawLine(4, 34, 181, 34, 3)
        drawBox(3, 12, 183, 59, 4)

        for index = 1, 4 do
            local height = clamp(self.heights[index] or 0, -1, 1)
            local x = buoyX[index]
            local y = 34 - height * 18
            drawLine(x, y + 3, x, 56, 3)
            if previousX then
                drawSmoothLine(previousX, previousY, x, y, 9)
            end
            drawSmoothCircle(x, y, 3.2, 15)
            drawTinyText(x, 58, tostring(index), 8, "centre")
            previousX = x
            previousY = y
        end

        drawLine(188, 4, 188, 59, 4)
        drawTinyText(193, 12, range, 9)
        drawTinyText(193, 23, clipping, 7)
        drawTinyText(193, 34, "AVG " .. formatVoltage(self.average or 0), 15)
        drawTinyText(193, 45, self.gateOne and "1<2 ON" or "1<2 OFF", self.gateOne and 15 or 5)
        drawTinyText(193, 56, self.gateTwo and "3>4 ON" or "3>4 OFF", self.gateTwo and 15 or 5)
        return true
    end,
}
