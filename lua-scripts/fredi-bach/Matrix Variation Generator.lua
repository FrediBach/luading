-- Matrix Variation
-- Clocked 10-lane gate matrix with CV-controlled row and column rotation.
--[[
Inspired by Darwin Grosse's AC18 Variation Generator for ArdCore:
https://github.com/darwingrosse/ArdCore-Code/tree/master/20%20Objects/AC18_VariationGenerator

This is an independent Disting NT implementation with an original rhythm
matrix. It preserves the central musical idea: each clock reads one column of
a two-dimensional pattern, while static controls and CV rotate the rows and
columns to produce related variations.

Inputs:
  1. Clock      - advance the sixteen-step matrix
  2. Reset      - make the next clock read step one
  3. Row CV     - rotate output lanes by one row per volt
  4. Column CV  - rotate the pattern by one step per volt

Outputs 1-10 emit +5 V triggers for active cells. Row and column offsets wrap,
so bipolar CV moves backward as well as forward through the matrix.
]]

local LANE_COUNT = 10
local STEP_COUNT = 16
local GATE_VOLTAGE = 5.0

local INPUT_CLOCK = 1
local INPUT_RESET = 2
local INPUT_ROW_CV = 3
local INPUT_COLUMN_CV = 4

local PARAM_ROW_OFFSET = 1
local PARAM_COLUMN_OFFSET = 2
local PARAM_PULSE_MS = 3

local DEFAULT_PARAMETERS = { 0, 0, 25 }

-- An original collection of related quarter-note, offbeat, alternating,
-- syncopated, and asymmetric rhythms. Rotation is applied when a column is
-- read, leaving this source matrix immutable.
local PATTERN = {
    { 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0 },
    { 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0 },
    { 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0 },
    { 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1 },
    { 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0 },
    { 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1 },
    { 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0 },
    { 1, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0 },
    { 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0 },
    { 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0 },
}

local outputBuffer = {}

local function parameter(self, index)
    if self.parameters and self.parameters[index] ~= nil then
        return self.parameters[index]
    end
    return DEFAULT_PARAMETERS[index]
end

local function round(value)
    if value >= 0 then return math.floor(value + 0.5) end
    return math.ceil(value - 0.5)
end

local function wrapOffset(value, size)
    return value % size
end

local function effectiveOffsets(self, inputs)
    local rowCv = inputs[INPUT_ROW_CV] or 0
    local columnCv = inputs[INPUT_COLUMN_CV] or 0
    local rowOffset = wrapOffset(
        parameter(self, PARAM_ROW_OFFSET) + round(rowCv),
        LANE_COUNT
    )
    local columnOffset = wrapOffset(
        parameter(self, PARAM_COLUMN_OFFSET) + round(columnCv),
        STEP_COUNT
    )
    return rowOffset, columnOffset
end

local function clearOutputs()
    for output = 1, LANE_COUNT do outputBuffer[output] = 0.0 end
    return outputBuffer
end

local function fireColumn(self, rowOffset, columnOffset)
    local sourceColumn = wrapOffset(self.nextStep - 1 + columnOffset, STEP_COUNT) + 1

    for output = 1, LANE_COUNT do
        local sourceRow = wrapOffset(output - 1 + rowOffset, LANE_COUNT) + 1
        outputBuffer[output] = PATTERN[sourceRow][sourceColumn] == 1
            and GATE_VOLTAGE
            or 0.0
    end

    self.lastStep = self.nextStep
    self.lastSourceColumn = sourceColumn
    self.nextStep = wrapOffset(self.nextStep, STEP_COUNT) + 1
    self.pulseRemaining = parameter(self, PARAM_PULSE_MS) / 1000.0
    self.firing = true
    return outputBuffer
end

local function signedOffset(value)
    return value == 0 and "0" or "+" .. value
end

return {
    name = "Matrix Variation",
    author = "Fredi Bach",

    -- Luading simulator extension; ignored by Disting NT.
    luading = {
        parameterPresets = {
            { name = "Original", values = { 0, 0, 25 } },
            { name = "Diagonal", values = { 3, 5, 25 } },
            { name = "Long Gates", values = { 6, 11, 120 } },
        },
    },

    init = function(self)
        self.nextStep = 1
        self.lastStep = 0
        self.lastSourceColumn = 0
        self.clockPending = false
        self.resetPending = false
        self.pulseRemaining = 0
        self.firing = false
        self.displayRowOffset = 0
        self.displayColumnOffset = 0

        return {
            inputs = {
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/16
                kTrigger, -- Type: Trigger, Synced: true, Division: 2 bars
                kCV,      -- Type: Sine LFO, Synced: true, Division: 2 bars
                kCV,      -- Type: Triangle LFO, Synced: true, Division: 1 bar
            },
            inputNames = { "Clock", "Reset", "Row CV", "Column CV" },
            outputs = {
                kStepped, -- Type: Kick Trigger
                kStepped, -- Type: Snare Trigger
                kStepped, -- Type: Hi-hat Trigger
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
            },
            outputNames = {
                "Lane 1", "Lane 2", "Lane 3", "Lane 4", "Lane 5",
                "Lane 6", "Lane 7", "Lane 8", "Lane 9", "Lane 10",
            },
            parameters = {
                { "Row Offset", 0, LANE_COUNT - 1, 0, kNone },
                { "Column Offset", 0, STEP_COUNT - 1, 0, kNone },
                { "Pulse", 1, 250, 25, kMs },
            },
        }
    end,

    trigger = function(self, input)
        if input == INPUT_CLOCK then
            self.clockPending = true
        elseif input == INPUT_RESET then
            self.resetPending = true
        end
    end,

    step = function(self, dt, inputs)
        local rowOffset, columnOffset = effectiveOffsets(self, inputs)
        self.displayRowOffset = rowOffset
        self.displayColumnOffset = columnOffset
        local outputsChanged = false

        local resetNow = self.resetPending
        local clockNow = self.clockPending
        self.resetPending = false
        self.clockPending = false

        if resetNow then
            self.nextStep = 1
            self.lastStep = 0
            self.lastSourceColumn = 0
            self.pulseRemaining = 0
            self.firing = false
            clearOutputs()
            outputsChanged = true
        elseif self.firing then
            self.pulseRemaining = self.pulseRemaining - dt
            if self.pulseRemaining <= 0 then
                self.pulseRemaining = 0
                self.firing = false
                clearOutputs()
                outputsChanged = true
            end
        end

        -- A simultaneous reset and clock emits step one. Deferring clock work
        -- to step() also makes this event use the current control-step CVs.
        if clockNow then
            return fireColumn(self, rowOffset, columnOffset)
        end
        if outputsChanged then return outputBuffer end
    end,

    draw = function(self)
        local matrixX = 4
        local matrixY = 12
        local columnPitch = 7
        local rowPitch = 5
        local cellWidth = 4
        local cellHeight = 3
        local rowOffset = self.displayRowOffset or 0
        local columnOffset = self.displayColumnOffset or 0

        drawTinyText(4, 6, "MATRIX VARIATION", 15)

        for row = 1, LANE_COUNT do
            local sourceRow = wrapOffset(row - 1 + rowOffset, LANE_COUNT) + 1
            local y = matrixY + (row - 1) * rowPitch
            drawLine(matrixX, y + 1, matrixX + (STEP_COUNT - 1) * columnPitch + cellWidth, y + 1, 1)
            for column = 1, STEP_COUNT do
                local sourceColumn = wrapOffset(column - 1 + columnOffset, STEP_COUNT) + 1
                local hit = PATTERN[sourceRow][sourceColumn] == 1
                if hit then
                    local activeColumn = self.lastStep == column
                    local x = matrixX + (column - 1) * columnPitch
                    drawRectangle(
                        x,
                        y,
                        x + cellWidth,
                        y + cellHeight,
                        activeColumn and 15 or 7
                    )
                end
            end
        end

        if self.lastStep > 0 then
            local activeX = matrixX + (self.lastStep - 1) * columnPitch
            drawBox(
                activeX - 1,
                matrixY - 1,
                activeX + cellWidth + 1,
                matrixY + (LANE_COUNT - 1) * rowPitch + cellHeight + 1,
                self.firing and 15 or 5
            )
        end

        drawTinyText(
            123,
            14,
            string.format("STEP %02d > %02d", self.lastStep, self.lastSourceColumn),
            15
        )
        drawTinyText(123, 25, "ROW   " .. signedOffset(rowOffset), 11)
        drawTinyText(123, 36, "COLUMN " .. signedOffset(columnOffset), 11)
        drawTinyText(123, 47, "PULSE  " .. parameter(self, PARAM_PULSE_MS) .. "ms", 8)
        drawTinyText(123, 58, self.firing and "FIRING" or "READY", self.firing and 15 or 5)
        return true
    end,
}
