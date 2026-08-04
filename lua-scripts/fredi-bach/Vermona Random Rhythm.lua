-- Vermona Random Rhythm
-- Dual probability rhythm generator inspired by Vermona's randomRHYTHM.
--[[
Independent Disting NT recreation of the musical behavior documented at:
https://www.vermona.com/en/products/modules/product/randomrhythm/

The two sections each combine quarter, eighth, sixteenth, and eighth-triplet
events. Dice mode stores a repeating bar of random thresholds; Realtime mode
draws a new value for every event. The individual division outputs can follow
the probabilities or act as straight clock multipliers.

Disting adaptation:
  Inputs 1/2 are quarter-note clocks for sections 1/2.
  Input 3 is the shared reset gate.
  Inputs 4/5 re-dice sections 1/2 (standing in for the panel buttons).
  Internal clocks use the two BPM parameters when Clock is set to Internal.

Outputs per section: SEQ, 1/4, 1/8, 1/16, 1/3.
All triggers are +10 V for 10 ms, matching the published module specification.
]]

local SECTION_COUNT = 2
local OUTPUTS_PER_SECTION = 5
local PARAMS_PER_SECTION = 12
local PULSE_SECONDS = 0.010
local DEFAULT_PERIOD = 0.5

local DIV_QUARTER = 1
local DIV_EIGHTH = 2
local DIV_SIXTEENTH = 3
local DIV_TRIPLET = 4

local P_CLOCK = 1
local P_BPM = 2
local P_QUARTER = 3
local P_EIGHTH = 4
local P_SIXTEENTH = 5
local P_TRIPLET = 6
local P_MODE = 7
local P_BAR = 8
local P_DIVISION_OUTPUT = 9
local P_OFFBEAT = 10
local P_RESET = 11
local P_SWING = 12

local CLOCK_INTERNAL = 1
local CLOCK_INPUT = 2
local MODE_DICE = 1
local MODE_REALTIME = 2
local BAR_FOUR = 1
local BAR_THREE = 2
local DIVISION_RANDOM = 1
local DIVISION_CLOCK = 2
local OFFBEAT_ON = 1
local OFFBEAT_OFF = 2
local RESET_RESTART = 1
local RESET_MUTE = 2

local DIVISION_SIZES = { 4, 8, 16, 12 }
local PROBABILITY_PARAMETERS = {
    P_QUARTER,
    P_EIGHTH,
    P_SIXTEENTH,
    P_TRIPLET,
}

local DEFAULT_PARAMETERS = {
    CLOCK_INTERNAL, 120, 100, 65, 25, 35,
    MODE_DICE, BAR_FOUR, DIVISION_RANDOM, OFFBEAT_ON, RESET_RESTART, 0,
    CLOCK_INTERNAL, 120, 100, 45, 55, 20,
    MODE_DICE, BAR_FOUR, DIVISION_RANDOM, OFFBEAT_ON, RESET_RESTART, 0,
}

local sections = {}
local pulseRemaining = {}
local outputBuffer = {}
local totalTime = 0
local resetHigh = false

local function parameter(self, sectionIndex, relativeIndex)
    local index = (sectionIndex - 1) * PARAMS_PER_SECTION + relativeIndex
    if self.parameters and self.parameters[index] ~= nil then
        return self.parameters[index]
    end
    return DEFAULT_PARAMETERS[index]
end

local function barBeats(self, sectionIndex)
    return parameter(self, sectionIndex, P_BAR) == BAR_THREE and 3 or 4
end

local function outputIndex(sectionIndex, relativeIndex)
    return (sectionIndex - 1) * OUTPUTS_PER_SECTION + relativeIndex
end

local function newDiceValues()
    local dice = {}
    for division = 1, 4 do
        dice[division] = {}
        for slot = 1, DIVISION_SIZES[division] do
            dice[division][slot] = 1
        end
    end
    return dice
end

local function sequenceValue(sequence, index)
    if sequence[0] ~= nil then return sequence[index - 1] end
    return sequence[index]
end

local function isIndexable(value)
    local valueType = type(value)
    return valueType == "table" or valueType == "userdata"
end

local function validDiceValues(candidate)
    if not isIndexable(candidate) then return false end
    for division = 1, 4 do
        local divisionValues = sequenceValue(candidate, division)
        if not isIndexable(divisionValues) then return false end
        for slot = 1, DIVISION_SIZES[division] do
            local value = sequenceValue(divisionValues, slot)
            if type(value) ~= "number" or value < 1 or value > 100 then
                return false
            end
        end
    end
    return true
end

local function copyDiceValues(source)
    local copy = newDiceValues()
    for division = 1, 4 do
        local divisionValues = sequenceValue(source, division)
        for slot = 1, DIVISION_SIZES[division] do
            copy[division][slot] = sequenceValue(divisionValues, slot)
        end
    end
    return copy
end

local function rollDice(section)
    for division = 1, 4 do
        for slot = 1, DIVISION_SIZES[division] do
            section.dice[division][slot] = math.random(1, 100)
        end
    end
end

local function newSection(restoredDice)
    local section = {
        dice = validDiceValues(restoredDice)
            and copyDiceValues(restoredDice)
            or newDiceValues(),
        started = false,
        barBeat = 0,
        elapsed = 0,
        period = DEFAULT_PERIOD,
        lastClockTime = nil,
        lastClockSource = nil,
        lastMode = nil,
        fired = { false, false, false, false, false },
        laneFlash = { 0, 0, 0, 0 },
        seqFlash = 0,
        muted = false,
    }
    if not validDiceValues(restoredDice) then rollDice(section) end
    return section
end

local function updateOutputBuffer()
    for index = 1, SECTION_COUNT * OUTPUTS_PER_SECTION do
        outputBuffer[index] = pulseRemaining[index] > 0 and 10 or 0
    end
    return outputBuffer
end

local function clearSectionPulses(sectionIndex)
    local first = outputIndex(sectionIndex, 1)
    for index = first, first + OUTPUTS_PER_SECTION - 1 do
        pulseRemaining[index] = 0
    end
end

local function fireOutput(sectionIndex, relativeIndex)
    if sections[sectionIndex].muted then return end
    pulseRemaining[outputIndex(sectionIndex, relativeIndex)] = PULSE_SECONDS
end

local function randomValue(self, sectionIndex, division, slot)
    if parameter(self, sectionIndex, P_MODE) == MODE_REALTIME then
        return math.random(1, 100)
    end
    return sections[sectionIndex].dice[division][slot]
end

local function emitDivision(
    self,
    sectionIndex,
    division,
    slot,
    includeInSequence
)
    local section = sections[sectionIndex]
    local probability = parameter(
        self,
        sectionIndex,
        PROBABILITY_PARAMETERS[division]
    )
    local passed = probability >= randomValue(
        self,
        sectionIndex,
        division,
        slot
    )

    if passed and not section.muted then
        section.laneFlash[division] = 0.08
        if includeInSequence then
            fireOutput(sectionIndex, 1)
            section.seqFlash = 0.08
        end
    end

    local straightClock = parameter(
        self,
        sectionIndex,
        P_DIVISION_OUTPUT
    ) == DIVISION_CLOCK
    if straightClock or passed then
        fireOutput(sectionIndex, division + 1)
    end
end

local function resetTimedEvents(section)
    for index = 1, 5 do section.fired[index] = false end
end

local function fireBeatStart(self, sectionIndex)
    local section = sections[sectionIndex]
    local beat = section.barBeat

    emitDivision(self, sectionIndex, DIV_QUARTER, beat + 1, true)

    if parameter(self, sectionIndex, P_OFFBEAT) == OFFBEAT_OFF then
        emitDivision(self, sectionIndex, DIV_EIGHTH, beat * 2 + 1, false)
        emitDivision(self, sectionIndex, DIV_SIXTEENTH, beat * 4 + 1, false)
        emitDivision(self, sectionIndex, DIV_TRIPLET, beat * 3 + 1, false)
    end
end

local function startBeat(self, sectionIndex, beat)
    local section = sections[sectionIndex]
    section.started = true
    section.barBeat = beat % barBeats(self, sectionIndex)
    section.elapsed = 0
    resetTimedEvents(section)
    fireBeatStart(self, sectionIndex)
end

local function advanceBeat(self, sectionIndex)
    local section = sections[sectionIndex]
    startBeat(
        self,
        sectionIndex,
        (section.barBeat + 1) % barBeats(self, sectionIndex)
    )
end

local function fireTimedEvent(self, sectionIndex, eventIndex)
    local section = sections[sectionIndex]
    if section.fired[eventIndex] then return end
    section.fired[eventIndex] = true

    local beat = section.barBeat
    if eventIndex == 1 then
        emitDivision(self, sectionIndex, DIV_SIXTEENTH, beat * 4 + 2, true)
    elseif eventIndex == 2 then
        emitDivision(self, sectionIndex, DIV_TRIPLET, beat * 3 + 2, true)
    elseif eventIndex == 3 then
        emitDivision(self, sectionIndex, DIV_EIGHTH, beat * 2 + 2, true)
    elseif eventIndex == 4 then
        emitDivision(self, sectionIndex, DIV_TRIPLET, beat * 3 + 3, true)
    else
        emitDivision(self, sectionIndex, DIV_SIXTEENTH, beat * 4 + 4, true)
    end
end

local function processTimedEvents(self, sectionIndex)
    local section = sections[sectionIndex]
    if not section.started or section.period <= 0 then return end

    local phase = section.elapsed / section.period
    local swing = parameter(self, sectionIndex, P_SWING) / 100
    local swingShift = swing * 0.125

    if phase >= 0.25 + swingShift then fireTimedEvent(self, sectionIndex, 1) end
    if phase >= 1 / 3 then fireTimedEvent(self, sectionIndex, 2) end
    if phase >= 0.5 then fireTimedEvent(self, sectionIndex, 3) end
    if phase >= 2 / 3 then fireTimedEvent(self, sectionIndex, 4) end
    if phase >= 0.75 + swingShift then fireTimedEvent(self, sectionIndex, 5) end
end

local function ensureConfiguration(self, sectionIndex)
    local section = sections[sectionIndex]
    local clockSource = parameter(self, sectionIndex, P_CLOCK)
    local mode = parameter(self, sectionIndex, P_MODE)

    if section.lastClockSource == nil then
        section.lastClockSource = clockSource
    elseif section.lastClockSource ~= clockSource then
        section.lastClockSource = clockSource
        section.started = false
        section.elapsed = 0
        section.lastClockTime = nil
        resetTimedEvents(section)
    end

    if section.lastMode == nil then
        section.lastMode = mode
    elseif section.lastMode ~= mode then
        section.lastMode = mode
        if mode == MODE_DICE then rollDice(section) end
    end

    local beats = barBeats(self, sectionIndex)
    if section.barBeat >= beats then section.barBeat = section.barBeat % beats end
end

local function handleInputClock(self, sectionIndex)
    ensureConfiguration(self, sectionIndex)
    if parameter(self, sectionIndex, P_CLOCK) ~= CLOCK_INPUT then return end

    local section = sections[sectionIndex]
    if section.lastClockTime ~= nil then
        local measured = totalTime - section.lastClockTime
        if measured >= 0.02 and measured <= 10 then section.period = measured end
    end
    section.lastClockTime = totalTime

    local beat = section.started
        and (section.barBeat + 1) % barBeats(self, sectionIndex)
        or 0
    startBeat(self, sectionIndex, beat)
end

local function restartSection(self, sectionIndex)
    local section = sections[sectionIndex]
    section.lastClockTime = nil
    startBeat(self, sectionIndex, 0)
end

local function updateMuteState(self, sectionIndex)
    local section = sections[sectionIndex]
    local shouldMute = resetHigh
        and parameter(self, sectionIndex, P_RESET) == RESET_MUTE
    if shouldMute and not section.muted then clearSectionPulses(sectionIndex) end
    section.muted = shouldMute
end

local function advanceSection(self, sectionIndex, dt)
    ensureConfiguration(self, sectionIndex)
    updateMuteState(self, sectionIndex)
    local section = sections[sectionIndex]

    if parameter(self, sectionIndex, P_CLOCK) == CLOCK_INTERNAL then
        section.period = 60 / parameter(self, sectionIndex, P_BPM)
        if not section.started then startBeat(self, sectionIndex, 0) end

        section.elapsed = section.elapsed + dt
        while section.elapsed >= section.period do
            section.elapsed = section.elapsed - section.period
            local carry = section.elapsed
            advanceBeat(self, sectionIndex)
            section.elapsed = carry
        end
    elseif section.started then
        section.elapsed = section.elapsed + dt
    end

    processTimedEvents(self, sectionIndex)
end

local function decayPulsesAndFlashes(dt)
    for index = 1, SECTION_COUNT * OUTPUTS_PER_SECTION do
        pulseRemaining[index] = math.max(0, pulseRemaining[index] - dt)
    end
    for sectionIndex = 1, SECTION_COUNT do
        local section = sections[sectionIndex]
        section.seqFlash = math.max(0, section.seqFlash - dt)
        for division = 1, 4 do
            section.laneFlash[division] = math.max(
                0,
                section.laneFlash[division] - dt
            )
        end
    end
end

local function sectionParameterDefinitions(prefix)
    return {
        { prefix .. " Clock", { "Internal", "Input" }, CLOCK_INTERNAL },
        { prefix .. " BPM", 30, 300, 120, kBPM },
        { prefix .. " 1/4", 0, 100, 100, kPercent },
        { prefix .. " 1/8", 0, 100, prefix == "Ch1" and 65 or 45, kPercent },
        { prefix .. " 1/16", 0, 100, prefix == "Ch1" and 25 or 55, kPercent },
        { prefix .. " 1/3", 0, 100, prefix == "Ch1" and 35 or 20, kPercent },
        { prefix .. " Mode", { "Dice", "Realtime" }, MODE_DICE },
        { prefix .. " Bar", { "4/4", "3/4" }, BAR_FOUR },
        { prefix .. " Div out", { "Random", "Clock" }, DIVISION_RANDOM },
        { prefix .. " Offbeat", { "On", "Off" }, OFFBEAT_ON },
        { prefix .. " Reset", { "Restart", "Mute", "Off" }, RESET_RESTART },
        { prefix .. " Swing", -50, 50, 0, kPercent },
    }
end

local function append(target, values)
    for _, value in ipairs(values) do target[#target + 1] = value end
end

local function modeLabel(self, sectionIndex)
    return parameter(self, sectionIndex, P_MODE) == MODE_DICE and "DICE" or "REAL"
end

local function barLabel(self, sectionIndex)
    return parameter(self, sectionIndex, P_BAR) == BAR_THREE and "3/4" or "4/4"
end

local function drawSection(self, sectionIndex, left)
    local section = sections[sectionIndex]
    local header = tostring(sectionIndex)
        .. " " .. modeLabel(self, sectionIndex)
        .. " " .. barLabel(self, sectionIndex)
        .. " " .. tostring(parameter(self, sectionIndex, P_BPM))
    drawTinyText(left + 2, 7, header, 10)

    local beats = barBeats(self, sectionIndex)
    for beat = 0, 3 do
        local shade = beat < beats and 4 or 1
        if section.started and beat == section.barBeat then shade = 13 end
        drawRectangle(left + 3 + beat * 7, 12, left + 6 + beat * 7, 14, shade)
    end

    local labels = { "1/4", "1/8", "1/16", "1/3" }
    for division = 1, 4 do
        local x = left + 5 + (division - 1) * 26
        local probability = parameter(
            self,
            sectionIndex,
            PROBABILITY_PARAMETERS[division]
        )
        local height = math.floor(probability * 24 / 100 + 0.5)
        local shade = section.laneFlash[division] > 0 and 15 or 8
        drawBox(x, 20, x + 9, 47, 4)
        if height > 0 then
            drawRectangle(x + 2, 45 - height, x + 7, 45, shade)
        end
        drawTinyText(x + 4, 59, labels[division], shade, "centre")
    end

    local seqShade = section.seqFlash > 0 and 15 or 5
    drawCircle(left + 113, 34, 4, seqShade)
    drawTinyText(left + 113, 59, section.muted and "MUTE" or "SEQ", seqShade, "centre")
end

return {
    name = "Random Rhythm",
    author = "Fredi Bach",

    -- Luading simulator extension; ignored by Disting NT.
    luading = {
        parameterPresets = {
            { name = "Default", values = {
                1, 120, 100, 65, 25, 35, 1, 1, 1, 1, 1, 0,
                1, 120, 100, 45, 55, 20, 1, 1, 1, 1, 1, 0,
            } },
            { name = "Four on floor", values = {
                1, 120, 100, 0, 0, 0, 1, 1, 1, 1, 1, 0,
                1, 120, 0, 100, 0, 0, 1, 1, 1, 1, 1, 0,
            } },
            { name = "Realtime hats", values = {
                1, 126, 100, 35, 20, 10, 1, 1, 1, 1, 1, 0,
                1, 126, 0, 55, 85, 35, 2, 1, 1, 2, 2, 18,
            } },
            { name = "Three against four", values = {
                1, 110, 100, 45, 20, 30, 1, 1, 1, 1, 1, -12,
                1, 110, 85, 30, 60, 45, 1, 2, 1, 1, 1, 12,
            } },
            { name = "Clock bank", values = {
                1, 120, 0, 0, 0, 0, 1, 1, 2, 2, 3, 0,
                1, 120, 0, 0, 0, 0, 1, 1, 2, 2, 3, 0,
            } },
        },
    },

    init = function(self)
        totalTime = 0
        resetHigh = false
        sections = {}
        pulseRemaining = {}
        outputBuffer = {}

        local restoredSections = self.state
            and self.state.sections
            or nil
        for sectionIndex = 1, SECTION_COUNT do
            local restoredDice = restoredSections
                and sequenceValue(restoredSections, sectionIndex)
                and sequenceValue(restoredSections, sectionIndex).dice
                or nil
            sections[sectionIndex] = newSection(restoredDice)
        end
        for index = 1, SECTION_COUNT * OUTPUTS_PER_SECTION do
            pulseRemaining[index] = 0
            outputBuffer[index] = 0
        end

        local parameters = {}
        append(parameters, sectionParameterDefinitions("Ch1"))
        append(parameters, sectionParameterDefinitions("Ch2"))

        return {
            inputs = {
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/4
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/4
                kGate,    -- Type: Manual / DC
                kTrigger, -- Type: Manual / DC
                kTrigger, -- Type: Manual / DC
            },
            inputNames = { "Clock 1", "Clock 2", "Reset", "Dice 1", "Dice 2" },
            outputs = {
                kStepped, -- Type: Kick Trigger
                kStepped, -- Type: Kick Trigger
                kStepped, -- Type: Snare Trigger
                kStepped, -- Type: Hi-hat Trigger
                kStepped, -- Type: Hi-hat Trigger
                kStepped, -- Type: Snare Trigger
                kStepped, -- Type: Kick Trigger
                kStepped, -- Type: Snare Trigger
                kStepped, -- Type: Hi-hat Trigger
                kStepped, -- Type: Hi-hat Trigger
            },
            outputNames = {
                "Ch1 Seq", "Ch1 1/4", "Ch1 1/8", "Ch1 1/16", "Ch1 1/3",
                "Ch2 Seq", "Ch2 1/4", "Ch2 1/8", "Ch2 1/16", "Ch2 1/3",
            },
            parameters = parameters,
        }
    end,

    step = function(self, dt, _inputs)
        totalTime = totalTime + dt
        decayPulsesAndFlashes(dt)
        advanceSection(self, 1, dt)
        advanceSection(self, 2, dt)
        return updateOutputBuffer()
    end,

    trigger = function(self, input)
        if input == 1 then
            handleInputClock(self, 1)
        elseif input == 2 then
            handleInputClock(self, 2)
        elseif input == 4 then
            rollDice(sections[1])
        elseif input == 5 then
            rollDice(sections[2])
        end
        return updateOutputBuffer()
    end,

    gate = function(self, input, rising)
        if input ~= 3 then return updateOutputBuffer() end
        resetHigh = rising

        for sectionIndex = 1, SECTION_COUNT do
            updateMuteState(self, sectionIndex)
            if rising
                and parameter(self, sectionIndex, P_RESET) == RESET_RESTART
                and parameter(self, sectionIndex, P_MODE) == MODE_DICE then
                restartSection(self, sectionIndex)
            end
        end
        return updateOutputBuffer()
    end,

    serialise = function(_self)
        return {
            sections = {
                { dice = copyDiceValues(sections[1].dice) },
                { dice = copyDiceValues(sections[2].dice) },
            },
        }
    end,

    draw = function(self)
        drawLine(128, 3, 128, 61, 3)
        drawSection(self, 1, 4)
        drawSection(self, 2, 132)
        return true
    end,
}
