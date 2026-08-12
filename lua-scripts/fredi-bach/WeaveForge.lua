-- WeaveForge
-- A Disting NT recreation of two Turing Machines that probabilistically trade bits.
--
-- Independently written from the behavior documented by Voltage Foundry Modular
-- and informed by the project's public implementation and regression tests:
-- https://vfmod.com/modules/weaveforge/
-- https://github.com/VoltageFoundryMod/ForgeSeries/tree/main/apps/wea
--
-- Disting adaptation:
--   Input 1 is the external clock. Inputs 2/3 are assignable bipolar CVs.
--   Outputs use WeaveForge's DUO layout: A1/B1 are quantized notes and A2/B2
--   are gates. The original custom output matrix, trigger layout, panel pattern
--   actions, PPQN setting, and preset slots are intentionally omitted.
--
-- The central bit machinery is preserved: two 16-bit registers, independent
-- 2-16 step feedback lengths and mutation chances, bidirectional or one-way
-- WEAVE, rotated 1-8 bit windows, scale quantization, density gates, and exact
-- locked endpoints at CHANCE/WEAVE 0% and 100%. Save state stores both patterns
-- and the deterministic random stream. Timing and slew run at Disting's
-- documented 1 ms Lua control cadence and are not hardware emulation.

local INPUT_CLOCK = 1
local INPUT_CV_1 = 2
local INPUT_CV_2 = 3

local OUTPUT_NOTE_A = 1
local OUTPUT_NOTE_B = 2
local OUTPUT_GATE_A = 3
local OUTPUT_GATE_B = 4

local P_LENGTH_A = 1
local P_CHANCE_A = 2
local P_LENGTH_B = 3
local P_CHANCE_B = 4
local P_WEAVE = 5
local P_DIRECTION = 6
local P_CLOCK = 7
local P_BPM = 8
local P_RATE = 9
local P_ROOT = 10
local P_SCALE = 11
local P_TRANSPOSE = 12
local P_NOTE_DEPTH = 13
local P_NOTE_RANGE = 14
local P_NOTE_SLEW = 15
local P_NOTE_ROTATE_A = 16
local P_NOTE_ROTATE_B = 17
local P_GATE_DEPTH = 18
local P_GATE_DENSITY = 19
local P_GATE_ROTATE_A = 20
local P_GATE_ROTATE_B = 21
local P_CV_1_DEST = 22
local P_CV_1_DEPTH = 23
local P_CV_2_DEST = 24
local P_CV_2_DEPTH = 25

local DIRECTION_BOTH = 1
local DIRECTION_A_TO_B = 2
local DIRECTION_B_TO_A = 3
local CLOCK_EXTERNAL = 1
local CLOCK_INTERNAL = 2

local CV_OFF = 1
local CV_LENGTH_A = 2
local CV_LENGTH_B = 3
local CV_LENGTH_BOTH = 4
local CV_CHANCE_A = 5
local CV_CHANCE_B = 6
local CV_CHANCE_BOTH = 7
local CV_WEAVE = 8
local CV_TRANSPOSE = 9
local CV_ROTATE = 10
local CV_RESET = 11
local CV_LOCK = 12

local REGISTER_BITS = 16
local MIN_LENGTH = 2
local MAX_LENGTH = 16
local MAX_DEPTH = 8
local UINT16_MASK = 0xffff
local UINT32_MASK = 0xffffffff
local DEFAULT_RANDOM_STATE = 0x2545f491
local GATE_VOLTAGE = 5

local DIRECTION_NAMES = { "BOTH", "A>B", "B>A" }
local RATE_NAMES = {
    "/16", "/8", "/6", "/4", "/3", "/2",
    "x1", "x2", "x3", "x4", "x6", "x8", "x16",
}
local RATE_MULTIPLIERS = {
    1 / 16, 1 / 8, 1 / 6, 1 / 4, 1 / 3, 1 / 2,
    1, 2, 3, 4, 6, 8, 16,
}
local ROOT_NAMES = {
    "C", "C#", "D", "D#", "E", "F",
    "F#", "G", "G#", "A", "A#", "B",
}
local SCALE_NAMES = {
    "Chromatic", "Major", "Minor", "Dorian", "Phrygian",
    "Lydian", "Mixolydian", "Locrian", "Major Pent",
    "Minor Pent", "Harmonic Minor", "Melodic Minor",
    "Whole Tone", "Diminished", "Blues",
}
local SCALES = {
    { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 },
    { 0, 2, 4, 5, 7, 9, 11 },
    { 0, 2, 3, 5, 7, 8, 10 },
    { 0, 2, 3, 5, 7, 9, 10 },
    { 0, 1, 3, 5, 7, 8, 10 },
    { 0, 2, 4, 6, 7, 9, 11 },
    { 0, 2, 4, 5, 7, 9, 10 },
    { 0, 1, 3, 5, 6, 8, 10 },
    { 0, 2, 4, 7, 9 },
    { 0, 3, 5, 7, 10 },
    { 0, 2, 3, 5, 7, 8, 11 },
    { 0, 2, 3, 5, 7, 9, 11 },
    { 0, 2, 4, 6, 8, 10 },
    { 0, 2, 3, 5, 6, 8, 9, 11 },
    { 0, 3, 5, 6, 7, 10 },
}
local CV_DESTINATION_NAMES = {
    "Off", "Length A", "Length B", "Length Both",
    "Chance A", "Chance B", "Chance Both", "Weave",
    "Transpose", "Rotate", "Reset", "Lock",
}

local DEFAULT_PARAMETERS = {
    16, 20, 13, 30, 35, DIRECTION_BOTH,
    CLOCK_EXTERNAL, 120, 7,
    1, 3, 0,
    5, 2, 0, 0, 0,
    3, 50, 0, 0,
    CV_WEAVE, 100, CV_TRANSPOSE, 100,
}

local registers
local randomState
local latestInputs
local clockPending
local elapsedTime
local lastClockMode
local internalCountdown
local externalDivisionCount
local lastExternalEdgeTime
local externalPeriod
local externalSubstepsRemaining
local nextExternalSubstepTime
local resetLevelHigh
local noteCurrent
local noteTarget
local gateHigh
local outputBuffer
local displayLive
local clockFlash

local function clamp(value, minimum, maximum)
    return math.max(minimum, math.min(maximum, value))
end

local function round(value)
    if value >= 0 then return math.floor(value + 0.5) end
    return math.ceil(value - 0.5)
end

local function parameter(self, index)
    if self.parameters and self.parameters[index] ~= nil then
        return self.parameters[index]
    end
    return DEFAULT_PARAMETERS[index]
end

local function isIndexable(value)
    local valueType = type(value)
    return valueType == "table" or valueType == "userdata"
end

local function randomNext()
    randomState = randomState ~ ((randomState << 13) & UINT32_MASK)
    randomState = randomState ~ (randomState >> 17)
    randomState = randomState ~ ((randomState << 5) & UINT32_MASK)
    randomState = randomState & UINT32_MASK
    if randomState == 0 then randomState = DEFAULT_RANDOM_STATE end
    return randomState
end

local function randomPercent(percent)
    if percent <= 0 then return false end
    if percent >= 100 then return true end
    return ((randomNext() >> 8) % 100) < percent
end

local function tail(register, length)
    return ((register >> (length - 1)) & 1) == 1
end

local function shiftIn(register, bit)
    return (((register << 1) & UINT16_MASK) | (bit and 1 or 0)) & UINT16_MASK
end

local function rotatedWindow(register, rotate, depth)
    local rotation = round(rotate) % REGISTER_BITS
    local rotated = register & UINT16_MASK
    if rotation ~= 0 then
        rotated = ((register >> rotation)
            | ((register << (REGISTER_BITS - rotation)) & UINT16_MASK)) & UINT16_MASK
    end
    local width = clamp(round(depth), 1, MAX_DEPTH)
    return rotated & ((1 << width) - 1)
end

local function applyCv(live, destination, depth, voltage)
    local amount = clamp(depth, 0, 100) / 100
    if destination == CV_LENGTH_A then
        live.length[1] = live.length[1] + voltage * 3 * amount
    elseif destination == CV_LENGTH_B then
        live.length[2] = live.length[2] + voltage * 3 * amount
    elseif destination == CV_LENGTH_BOTH then
        live.length[1] = live.length[1] + voltage * 3 * amount
        live.length[2] = live.length[2] + voltage * 3 * amount
    elseif destination == CV_CHANCE_A then
        live.chance[1] = live.chance[1] + voltage * 20 * amount
    elseif destination == CV_CHANCE_B then
        live.chance[2] = live.chance[2] + voltage * 20 * amount
    elseif destination == CV_CHANCE_BOTH then
        live.chance[1] = live.chance[1] + voltage * 20 * amount
        live.chance[2] = live.chance[2] + voltage * 20 * amount
    elseif destination == CV_WEAVE then
        live.weave = live.weave + voltage * 20 * amount
    elseif destination == CV_TRANSPOSE then
        live.transpose = live.transpose + voltage * 12 * amount
    elseif destination == CV_ROTATE then
        live.rotate = live.rotate + voltage * 3 * amount
    elseif destination == CV_RESET and voltage > 1 then
        live.reset = true
    elseif destination == CV_LOCK and voltage > 1 then
        live.lock = true
    end
end

local function liveControls(self)
    local live = {
        length = { parameter(self, P_LENGTH_A), parameter(self, P_LENGTH_B) },
        chance = { parameter(self, P_CHANCE_A), parameter(self, P_CHANCE_B) },
        weave = parameter(self, P_WEAVE),
        direction = parameter(self, P_DIRECTION),
        transpose = parameter(self, P_TRANSPOSE),
        rotate = 0,
        reset = false,
        lock = false,
    }

    applyCv(
        live,
        parameter(self, P_CV_1_DEST),
        parameter(self, P_CV_1_DEPTH),
        latestInputs[INPUT_CV_1] or 0
    )
    applyCv(
        live,
        parameter(self, P_CV_2_DEST),
        parameter(self, P_CV_2_DEPTH),
        latestInputs[INPUT_CV_2] or 0
    )

    live.length[1] = clamp(round(live.length[1]), MIN_LENGTH, MAX_LENGTH)
    live.length[2] = clamp(round(live.length[2]), MIN_LENGTH, MAX_LENGTH)
    live.chance[1] = clamp(round(live.chance[1]), 0, 100)
    live.chance[2] = clamp(round(live.chance[2]), 0, 100)
    live.weave = clamp(round(live.weave), 0, 100)
    live.direction = clamp(round(live.direction), DIRECTION_BOTH, DIRECTION_B_TO_A)
    live.transpose = clamp(round(live.transpose), -24, 24)
    live.rotate = round(live.rotate)
    if live.lock then
        live.chance[1] = 0
        live.chance[2] = 0
    end
    return live
end

local function resetRegisters()
    registers[1] = 0xace1
    registers[2] = 0x1d87
end

local function scaleVoltage(self, window, depth, transpose)
    local scale = SCALES[parameter(self, P_SCALE)] or SCALES[1]
    local range = clamp(round(parameter(self, P_NOTE_RANGE)), 1, 5)
    local width = clamp(round(depth), 1, MAX_DEPTH)
    local span = #scale * range
    local index = math.floor(window * span / (1 << width))
    local octave = math.floor(index / #scale)
    local degree = scale[(index % #scale) + 1]
    local root = clamp(round(parameter(self, P_ROOT)), 1, 12) - 1
    local semitone = clamp(root + degree + octave * 12 + transpose, 0, 60)
    return semitone / 12
end

local function gateFires(window, depth, density)
    local width = clamp(round(depth), 1, MAX_DEPTH)
    local span = 1 << width
    local limit = math.floor(clamp(density, 0, 100) * span / 100)
    return window < limit
end

local function updateTargets(self, live)
    local noteDepth = clamp(round(parameter(self, P_NOTE_DEPTH)), 1, MAX_DEPTH)
    local noteRotateA = parameter(self, P_NOTE_ROTATE_A) + live.rotate
    local noteRotateB = parameter(self, P_NOTE_ROTATE_B) + live.rotate
    noteTarget[1] = scaleVoltage(
        self,
        rotatedWindow(registers[1], noteRotateA, noteDepth),
        noteDepth,
        live.transpose
    )
    noteTarget[2] = scaleVoltage(
        self,
        rotatedWindow(registers[2], noteRotateB, noteDepth),
        noteDepth,
        live.transpose
    )

    local gateDepth = clamp(round(parameter(self, P_GATE_DEPTH)), 1, MAX_DEPTH)
    local density = clamp(parameter(self, P_GATE_DENSITY), 0, 100)
    gateHigh[1] = gateFires(
        rotatedWindow(registers[1], parameter(self, P_GATE_ROTATE_A) + live.rotate, gateDepth),
        gateDepth,
        density
    )
    gateHigh[2] = gateFires(
        rotatedWindow(registers[2], parameter(self, P_GATE_ROTATE_B) + live.rotate, gateDepth),
        gateDepth,
        density
    )
end

local function advanceRegisters(self, live)
    local tails = {
        tail(registers[1], live.length[1]),
        tail(registers[2], live.length[2]),
    }
    local incoming = {}

    for index = 1, 2 do
        local other = index == 1 and 2 or 1
        local receives = live.direction == DIRECTION_BOTH
            or (live.direction == DIRECTION_A_TO_B and index == 2)
            or (live.direction == DIRECTION_B_TO_A and index == 1)
        local bit = tails[index]
        if receives and randomPercent(live.weave) then
            bit = tails[other]
        end
        if randomPercent(live.chance[index]) then bit = not bit end
        incoming[index] = bit
    end

    registers[1] = shiftIn(registers[1], incoming[1])
    registers[2] = shiftIn(registers[2], incoming[2])
    updateTargets(self, live)
    clockFlash = 0.1
end

local function rateMultiplier(self)
    return RATE_MULTIPLIERS[parameter(self, P_RATE)] or 1
end

local function internalInterval(self)
    local bpm = clamp(parameter(self, P_BPM), 20, 300)
    return 60 / bpm / rateMultiplier(self)
end

local function handleExternalEdge(self, live)
    local multiplier = rateMultiplier(self)
    if lastExternalEdgeTime >= 0 and elapsedTime > lastExternalEdgeTime then
        externalPeriod = elapsedTime - lastExternalEdgeTime
    end
    lastExternalEdgeTime = elapsedTime
    externalSubstepsRemaining = 0

    if multiplier < 1 then
        local division = round(1 / multiplier)
        externalDivisionCount = externalDivisionCount + 1
        if externalDivisionCount >= division then
            externalDivisionCount = 0
            advanceRegisters(self, live)
        end
        return
    end

    externalDivisionCount = 0
    advanceRegisters(self, live)
    local multipliedSteps = round(multiplier)
    if multipliedSteps > 1 and externalPeriod > 0 then
        externalSubstepsRemaining = multipliedSteps - 1
        nextExternalSubstepTime = elapsedTime + externalPeriod / multipliedSteps
    end
end

local function processClock(self, dt, live)
    local mode = parameter(self, P_CLOCK)
    if mode ~= lastClockMode then
        lastClockMode = mode
        internalCountdown = internalInterval(self)
        externalDivisionCount = 0
        externalSubstepsRemaining = 0
        if mode == CLOCK_INTERNAL then clockPending = 0 end
    end

    if mode == CLOCK_INTERNAL then
        internalCountdown = internalCountdown - dt
        local guard = 0
        while internalCountdown <= 0 and guard < 16 do
            advanceRegisters(self, live)
            internalCountdown = internalCountdown + internalInterval(self)
            guard = guard + 1
        end
        clockPending = 0
        return
    end

    while clockPending > 0 do
        handleExternalEdge(self, live)
        clockPending = clockPending - 1
    end

    local guard = 0
    while externalSubstepsRemaining > 0
        and elapsedTime >= nextExternalSubstepTime
        and guard < 16 do
        advanceRegisters(self, live)
        externalSubstepsRemaining = externalSubstepsRemaining - 1
        nextExternalSubstepTime = nextExternalSubstepTime
            + externalPeriod / math.max(1, round(rateMultiplier(self)))
        guard = guard + 1
    end
end

local function updateSlew(self, dt)
    local slew = clamp(parameter(self, P_NOTE_SLEW), 0, 100)
    if slew <= 0 then
        noteCurrent[1] = noteTarget[1]
        noteCurrent[2] = noteTarget[2]
        return
    end

    local normalized = slew / 100
    local timeConstant = 0.01 + normalized * normalized * 1.99
    local amount = 1 - math.exp(-dt / timeConstant)
    for index = 1, 2 do
        noteCurrent[index] = noteCurrent[index]
            + (noteTarget[index] - noteCurrent[index]) * amount
    end
end

local function validRegister(value)
    return type(value) == "number" and value >= 0 and value <= UINT16_MASK
end

local function validNote(value)
    return type(value) == "number" and value >= 0 and value <= 5
end

local function restoreState(self)
    local state = self.state
    if not isIndexable(state)
        or not validRegister(state.registerA)
        or not validRegister(state.registerB)
        or type(state.randomState) ~= "number"
        or state.randomState < 1
        or state.randomState > UINT32_MASK then
        return
    end

    registers[1] = math.floor(state.registerA) & UINT16_MASK
    registers[2] = math.floor(state.registerB) & UINT16_MASK
    randomState = math.floor(state.randomState) & UINT32_MASK
    if validNote(state.noteA) then noteCurrent[1] = state.noteA end
    if validNote(state.noteB) then noteCurrent[2] = state.noteB end
    if validNote(state.targetA) then noteTarget[1] = state.targetA end
    if validNote(state.targetB) then noteTarget[2] = state.targetB end
    if type(state.gateA) == "boolean" then gateHigh[1] = state.gateA end
    if type(state.gateB) == "boolean" then gateHigh[2] = state.gateB end
end

local function initialize(self)
    registers = { 0xace1, 0x1d87 }
    randomState = os.time() & UINT32_MASK
    if randomState == 0 then randomState = DEFAULT_RANDOM_STATE end
    latestInputs = { 0, 0, 0 }
    clockPending = 0
    elapsedTime = 0
    lastClockMode = CLOCK_EXTERNAL
    internalCountdown = 0.5
    externalDivisionCount = 0
    lastExternalEdgeTime = -1
    externalPeriod = 0
    externalSubstepsRemaining = 0
    nextExternalSubstepTime = 0
    resetLevelHigh = false
    noteCurrent = { 0, 0 }
    noteTarget = { 0, 0 }
    gateHigh = { false, false }
    outputBuffer = { 0, 0, 0, 0 }
    displayLive = {
        length = { DEFAULT_PARAMETERS[P_LENGTH_A], DEFAULT_PARAMETERS[P_LENGTH_B] },
        chance = { DEFAULT_PARAMETERS[P_CHANCE_A], DEFAULT_PARAMETERS[P_CHANCE_B] },
        weave = DEFAULT_PARAMETERS[P_WEAVE],
        direction = DEFAULT_PARAMETERS[P_DIRECTION],
        transpose = DEFAULT_PARAMETERS[P_TRANSPOSE],
        rotate = 0,
        reset = false,
        lock = false,
    }
    clockFlash = 0
    restoreState(self)
end

local function bitAt(register, position)
    return (register >> position) & 1
end

local function cellX(position, reverse)
    local column = reverse and (REGISTER_BITS - 1 - position) or position
    return 17 + column * 13
end

local function drawRegister(register, y, length, reverse)
    for position = 0, REGISTER_BITS - 1 do
        local x = cellX(position, reverse)
        if position < length then
            if bitAt(register, position) == 1 then
                drawRectangle(x, y, x + 8, y + 6, 12)
            else
                drawBox(x, y, x + 8, y + 6, 6)
            end
        else
            drawRectangle(x + 4, y + 3, x + 4, y + 3, 4)
        end
    end
end

local function drawTap(label, x, y, active)
    if active then drawBox(x - 3, y - 5, x + 9, y + 1, 15) end
    drawTinyText(x, y, label, active and 15 or 8)
end

local function drawWeave(live)
    local strands = clamp(round(live.weave / 20), 0, 5)
    for index = 1, strands do
        local left = 35 + (index - 1) * 38
        local right = 58 + (index - 1) * 34
        if live.direction == DIRECTION_BOTH or live.direction == DIRECTION_A_TO_B then
            drawLine(left, 23, right, 37, 5 + index)
        end
        if live.direction == DIRECTION_BOTH or live.direction == DIRECTION_B_TO_A then
            drawLine(right, 23, left, 37, 5 + index)
        end
    end
end

return {
    name = "WeaveForge",
    author = "Luading",

    -- Luading simulator extension; ignored by Disting NT.
    luading = {
        parameterPresets = {
            {
                name = "Drifting Duo",
                values = {
                    16, 20, 13, 30, 35, 1, 1, 120, 7,
                    1, 3, 0, 5, 2, 0, 0, 0, 3, 50, 0, 0,
                    8, 100, 9, 100,
                },
            },
            {
                name = "Theme and Answer",
                values = {
                    8, 0, 8, 25, 65, 2, 1, 110, 7,
                    3, 4, 0, 4, 2, 12, 0, 4, 2, 45, 0, 4,
                    8, 100, 10, 100,
                },
            },
            {
                name = "Long Woven Ring",
                values = {
                    16, 0, 16, 0, 100, 1, 1, 90, 7,
                    1, 2, 0, 6, 3, 0, 0, 15, 3, 38, 4, 12,
                    9, 100, 12, 100,
                },
            },
            {
                name = "Internal Drift",
                values = {
                    11, 12, 7, 18, 50, 1, 2, 96, 10,
                    6, 11, -12, 5, 2, 25, 0, 5, 4, 62, 0, 7,
                    8, 75, 10, 100,
                },
            },
        },
    },

    init = function(self)
        initialize(self)
        return {
            inputs = {
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/4
                kCV,      -- Type: Manual / DC
                kCV,      -- Type: Triangle LFO, Synced: true, Division: 2 bars
            },
            inputNames = { "Clock", "CV 1", "CV 2" },
            outputs = {
                kLinear,  -- Type: Synth Note
                kLinear,  -- Type: Synth Note
                kStepped, -- Type: Kick Trigger
                kStepped, -- Type: Hi-hat Trigger
            },
            outputNames = { "A1 Note", "B1 Note", "A2 Gate", "B2 Gate" },
            parameters = {
                { "Length A", MIN_LENGTH, MAX_LENGTH, 16, kNone },
                { "Chance A", 0, 100, 20, kPercent },
                { "Length B", MIN_LENGTH, MAX_LENGTH, 13, kNone },
                { "Chance B", 0, 100, 30, kPercent },
                { "Weave", 0, 100, 35, kPercent },
                { "Direction", { "Both", "A to B", "B to A" }, DIRECTION_BOTH },
                { "Clock", { "External", "Internal" }, CLOCK_EXTERNAL },
                { "BPM", 20, 300, 120, kBPM },
                { "Rate", RATE_NAMES, 7 },
                { "Root", ROOT_NAMES, 1 },
                { "Scale", SCALE_NAMES, 3 },
                { "Transpose", -24, 24, 0, kSemitones },
                { "Note Depth", 1, MAX_DEPTH, 5, kNone },
                { "Note Range", 1, 5, 2, kNone },
                { "Note Slew", 0, 100, 0, kPercent },
                { "Note Rotate A", 0, 15, 0, kNone },
                { "Note Rotate B", 0, 15, 0, kNone },
                { "Gate Depth", 1, MAX_DEPTH, 3, kNone },
                { "Gate Density", 0, 100, 50, kPercent },
                { "Gate Rotate A", 0, 15, 0, kNone },
                { "Gate Rotate B", 0, 15, 0, kNone },
                { "CV1 Dest", CV_DESTINATION_NAMES, CV_WEAVE },
                { "CV1 Depth", 0, 100, 100, kPercent },
                { "CV2 Dest", CV_DESTINATION_NAMES, CV_TRANSPOSE },
                { "CV2 Depth", 0, 100, 100, kPercent },
            },
        }
    end,

    trigger = function(self, input)
        if input == INPUT_CLOCK and parameter(self, P_CLOCK) == CLOCK_EXTERNAL then
            clockPending = clockPending + 1
        end
    end,

    step = function(self, dt, inputs)
        elapsedTime = elapsedTime + dt
        for index = 1, 3 do latestInputs[index] = inputs[index] or 0 end
        local live = liveControls(self)
        displayLive = live

        if live.reset and not resetLevelHigh then
            resetRegisters()
            externalDivisionCount = 0
            externalSubstepsRemaining = 0
        end
        resetLevelHigh = live.reset

        processClock(self, dt, live)
        updateSlew(self, dt)
        clockFlash = math.max(0, clockFlash - dt)

        outputBuffer[OUTPUT_NOTE_A] = noteCurrent[1]
        outputBuffer[OUTPUT_NOTE_B] = noteCurrent[2]
        outputBuffer[OUTPUT_GATE_A] = gateHigh[1] and GATE_VOLTAGE or 0
        outputBuffer[OUTPUT_GATE_B] = gateHigh[2] and GATE_VOLTAGE or 0
        return outputBuffer
    end,

    serialise = function(self)
        return {
            registerA = registers[1],
            registerB = registers[2],
            randomState = randomState,
            noteA = noteCurrent[1],
            noteB = noteCurrent[2],
            targetA = noteTarget[1],
            targetB = noteTarget[2],
            gateA = gateHigh[1],
            gateB = gateHigh[2],
        }
    end,

    draw = function(self)
        local live = displayLive
        drawTinyText(4, 6, "WEAVEFORGE", 15)
        local clockName = parameter(self, P_CLOCK) == CLOCK_INTERNAL
            and tostring(round(parameter(self, P_BPM)))
            or "EXT"
        drawTinyText(82, 6, clockName .. " " .. (RATE_NAMES[parameter(self, P_RATE)] or "?"), 10)
        drawTinyText(
            172,
            6,
            (DIRECTION_NAMES[live.direction] or "?") .. string.format(" W%03d", live.weave),
            12
        )

        drawTinyText(3, 19, "A", 15)
        drawTinyText(3, 45, "B", 15)
        drawRegister(registers[1], 14, live.length[1], false)
        drawRegister(registers[2], 40, live.length[2], true)
        drawWeave(live)

        drawTap(
            "A1",
            cellX((parameter(self, P_NOTE_ROTATE_A) + live.rotate) % 16, false),
            31,
            false
        )
        drawTap(
            "A2",
            cellX((parameter(self, P_GATE_ROTATE_A) + live.rotate) % 16, false),
            37,
            gateHigh[1]
        )
        drawTap(
            "B1",
            cellX((parameter(self, P_NOTE_ROTATE_B) + live.rotate) % 16, true),
            55,
            false
        )
        drawTap(
            "B2",
            cellX((parameter(self, P_GATE_ROTATE_B) + live.rotate) % 16, true),
            61,
            gateHigh[2]
        )

        drawTinyText(
            3,
            63,
            string.format(
                "A L%02d C%03d  B L%02d C%03d%s",
                live.length[1],
                live.chance[1],
                live.length[2],
                live.chance[2],
                live.lock and " LOCK" or ""
            ),
            clockFlash > 0 and 15 or 7
        )
        return true
    end,
}
