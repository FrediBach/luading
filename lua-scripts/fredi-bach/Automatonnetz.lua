-- Automatonnetz
-- A Disting NT recreation of Ornament & Crime's vector-driven triad sequencer.
--
-- Based on the behavior documented for Ornament & Crime firmware 1.3 and on
-- the MIT-licensed Automatonnetz and Tonnetz sources by Patrick Dowling and
-- Tim Churches. This adaptation keeps the 5x5 fractional vector grid,
-- neo-Riemannian transforms, per-cell offsets/inversions/mutations, and the
-- root/trigger/arpeggio/strum modes while mapping them to Disting NT controls.
--
-- Inputs 1/2 clock the grid and arpeggiator. Input 3 resets the grid to its
-- origin when held during a grid clock, input 4 inhibits arpeggiator clocks,
-- and input 5 clears the grid using the selected Clear mode. CV inputs 6/7
-- provide the quantized root and additional inversion respectively.
--
-- Encoder 1 selects a cell and its push toggles the grid/cell settings page.
-- Encoder 2 selects settings; push it to toggle value editing. Pot 3 push
-- resets the current position, and pot 2 push manually advances the grid.
--
-- Copyright (c) 2015, 2016 Patrick Dowling, Tim Churches
--
-- Permission is hereby granted, free of charge, to any person obtaining a copy
-- of this software and associated documentation files (the "Software"), to deal
-- in the Software without restriction, including without limitation the rights
-- to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
-- copies of the Software, and to permit persons to whom the Software is
-- furnished to do so, subject to the following conditions:
--
-- The above copyright notice and this permission notice shall be included in
-- all copies or substantial portions of the Software.
--
-- THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
-- IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
-- FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
-- AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
-- LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
-- OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
-- SOFTWARE.

local GRID_SIZE = 5
local CELL_COUNT = GRID_SIZE * GRID_SIZE
local TICKS_PER_CELL = 840
local GRID_TICKS = GRID_SIZE * TICKS_PER_CELL
local FRACTION_TICKS = { 0, 105, 120, 140, 168, 210, 280, 420 }

local INPUT_GRID_CLOCK = 1
local INPUT_ARP_CLOCK = 2
local INPUT_RESET = 3
local INPUT_ARP_INHIBIT = 4
local INPUT_CLEAR = 5
local INPUT_ROOT_CV = 6
local INPUT_INVERSION_CV = 7

local MODE_MAJOR = 1
local MODE_MINOR = 2

local TRANSFORM_NONE = 1
local TRANSFORM_P = 2
local TRANSFORM_L = 3
local TRANSFORM_R = 4
local TRANSFORM_N = 5
local TRANSFORM_S = 6
local TRANSFORM_H = 7
local TRANSFORM_RESET = 8

local OUTPUT_ROOT = 1
local OUTPUT_TRIGGER = 2
local OUTPUT_ARP = 3
local OUTPUT_STRUM = 4

local CLEAR_ZERO = 1
local CLEAR_RANDOM_TRANSFORM = 2
local CLEAR_RANDOM_EVENT = 3

local TRANSFORM_NAMES = { "*", "P", "L", "R", "N", "S", "H", "@" }
local MODE_NAMES = { "maj", "min" }
local OUTPUT_NAMES = { "root", "trig", "arp", "strm" }
local CLEAR_NAMES = { "zero", "rT", "rTev" }
local MUTATION_NAMES = {
    "none", "rT__", "r_O_", "rTO_", "r__I", "rT_I", "r_OI", "rTOI",
}
local NOTE_NAMES = {
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
}

-- Each entry stores root rotation and note offsets for major, then minor.
-- Notes are kept as a voiced abstract triad so transformations preserve their
-- characteristic minimal voice-leading instead of rebuilding a root-position
-- chord after every clock.
local TRANSFORMATIONS = {
    [TRANSFORM_NONE] = {
        { 0, { 0, 0, 0 } }, { 0, { 0, 0, 0 } },
    },
    [TRANSFORM_P] = {
        { 0, { 0, -1, 0 } }, { 0, { 0, 1, 0 } },
    },
    [TRANSFORM_L] = {
        { 1, { -1, 0, 0 } }, { 2, { 0, 0, 1 } },
    },
    [TRANSFORM_R] = {
        { 2, { 0, 0, 2 } }, { 1, { -2, 0, 0 } },
    },
    [TRANSFORM_N] = {
        { 1, { 0, 1, 1 } }, { 2, { -1, -1, 0 } },
    },
    [TRANSFORM_S] = {
        { 0, { 1, 0, 1 } }, { 0, { -1, 0, -1 } },
    },
    [TRANSFORM_H] = {
        { 2, { -1, -1, 1 } }, { 1, { -1, 1, 1 } },
    },
}

local settings
local cells
local positionX
local positionY
local chord
local selectedCell
local cellPage
local valueEditing
local gridCursor
local cellCursor
local resetHigh
local arpInhibitHigh
local arpIndex
local strumInhibited
local triggerRemaining
local pendingGridClock
local pendingArpClock
local pendingClear
local latestInputs
local outputBuffer
local cellHistory

local function clamp(value, minimum, maximum)
    return math.max(minimum, math.min(maximum, value))
end

local function round(value)
    if value >= 0 then return math.floor(value + 0.5) end
    return math.ceil(value - 0.5)
end

local function wrapIndex(index, count)
    return ((index - 1) % count) + 1
end

local function sequenceValue(sequence, index)
    if sequence[0] ~= nil then return sequence[index - 1] end
    return sequence[index]
end

local function isIndexable(value)
    local valueType = type(value)
    return valueType == "table" or valueType == "userdata"
end

local function validInteger(value, minimum, maximum)
    return type(value) == "number"
        and value == math.floor(value)
        and value >= minimum
        and value <= maximum
end

local function newCell(transform)
    return {
        transform = transform or TRANSFORM_NONE,
        transpose = 0,
        inversion = 0,
        mutation = 1,
    }
end

local function validCell(candidate)
    return isIndexable(candidate)
        and validInteger(candidate.transform, 1, 8)
        and validInteger(candidate.transpose, -12, 12)
        and validInteger(candidate.inversion, -3, 3)
        and validInteger(candidate.mutation, 1, 8)
end

local function copyCell(source)
    return {
        transform = source.transform,
        transpose = source.transpose,
        inversion = source.inversion,
        mutation = source.mutation,
    }
end

local function randomTransform()
    return math.random(TRANSFORM_NONE, TRANSFORM_RESET)
end

local function clearGrid(mode)
    cells = {}
    for index = 1, CELL_COUNT do
        local cell = newCell()
        if mode == CLEAR_RANDOM_TRANSFORM then
            cell.transform = randomTransform()
        elseif mode == CLEAR_RANDOM_EVENT then
            cell.mutation = 2
        end
        cells[index] = cell
    end
end

local function resetChord(mode)
    chord = {
        mode = mode,
        rootIndex = 1,
        notes = mode == MODE_MAJOR and { 0, 4, 7 } or { 0, 3, 7 },
    }
end

local function chordNoteIndex(offset)
    return ((chord.rootIndex - 1 + offset) % 3) + 1
end

local function applyTransformation(transform)
    local definition = TRANSFORMATIONS[transform]
    if not definition then return false end

    local modeDefinition = definition[chord.mode]
    local rootShift = modeDefinition[1]
    local offsets = modeDefinition[2]
    for offset = 0, 2 do
        local index = chordNoteIndex(offset)
        chord.notes[index] = chord.notes[index] + offsets[offset + 1]
    end
    chord.rootIndex = chordNoteIndex(rootShift)
    chord.mode = chord.mode == MODE_MAJOR and MODE_MINOR or MODE_MAJOR
    return transform ~= TRANSFORM_NONE
end

local function currentCoordinates()
    return math.floor(positionX / TICKS_PER_CELL), math.floor(positionY / TICKS_PER_CELL)
end

local function cellIndexAt(x, y)
    return y * GRID_SIZE + x + 1
end

local function currentCellIndex()
    local x, y = currentCoordinates()
    return cellIndexAt(x, y)
end

local function pushHistory(index)
    table.insert(cellHistory, 1, index)
    while #cellHistory > 4 do table.remove(cellHistory) end
end

local function applyMutation(cell)
    local mask = cell.mutation - 1
    if (mask & 1) ~= 0 then cell.transform = randomTransform() end
    if (mask & 2) ~= 0 then cell.transpose = math.random(-12, 12) end
    if (mask & 4) ~= 0 then cell.inversion = math.random(-3, 3) end
end

local function enterCurrentCell(forceReset)
    local cell = cells[currentCellIndex()]
    pushHistory(currentCellIndex())

    local changed = false
    if forceReset or cell.transform == TRANSFORM_RESET then
        resetChord(settings.mode)
        changed = true
    elseif cell.transform ~= TRANSFORM_NONE then
        changed = applyTransformation(cell.transform)
    end

    applyMutation(cell)
    return changed
end

local function resetPosition(applyCell)
    positionX = 0
    positionY = 0
    arpIndex = 1
    strumInhibited = false
    resetChord(settings.mode)
    if applyCell then
        enterCurrentCell(true)
    else
        pushHistory(currentCellIndex())
    end
end

local function vectorTicks(value)
    local whole = math.floor(value / 8)
    return whole * TICKS_PER_CELL + FRACTION_TICKS[(value % 8) + 1]
end

local function moveGrid()
    local oldX, oldY = currentCoordinates()
    positionX = (positionX + vectorTicks(settings.dx)) % GRID_TICKS
    positionY = (positionY + vectorTicks(settings.dy)) % GRID_TICKS
    local newX, newY = currentCoordinates()
    if oldX == newX and oldY == newY then return false, false end
    return true, enterCurrentCell(false)
end

local function renderedTriad(root, inversion)
    local offsets = { 0, 0, 0 }
    local baseIndex = chord.rootIndex

    if inversion > 0 then
        offsets[baseIndex] = offsets[baseIndex] + math.floor((inversion + 2) / 3) * 12
        local second = ((baseIndex - 1 + 1) % 3) + 1
        local third = ((baseIndex - 1 + 2) % 3) + 1
        offsets[second] = offsets[second] + math.floor((inversion + 1) / 3) * 12
        offsets[third] = offsets[third] + math.floor(inversion / 3) * 12
        baseIndex = ((baseIndex - 1 + inversion) % 3) + 1
    elseif inversion < 0 then
        local amount = -inversion
        local third = ((baseIndex - 1 + 2) % 3) + 1
        local second = ((baseIndex - 1 + 1) % 3) + 1
        offsets[third] = offsets[third] - math.floor((amount + 2) / 3) * 12
        offsets[second] = offsets[second] - math.floor((amount + 1) / 3) * 12
        offsets[baseIndex] = offsets[baseIndex] - math.floor(amount / 3) * 12
        baseIndex = ((baseIndex - 1 + 2 * amount) % 3) + 1
    end

    local result = {}
    for offset = 0, 2 do
        local index = ((baseIndex - 1 + offset) % 3) + 1
        result[offset + 1] = root + chord.notes[index] + offsets[index]
    end
    return result
end

local function currentPitches()
    local cell = cells[currentCellIndex()]
    local rootCv = latestInputs[INPUT_ROOT_CV] or 0
    local inversionCv = latestInputs[INPUT_INVERSION_CV] or 0
    local root = round(rootCv * 12) + cell.transpose
    local inversion = clamp(cell.inversion + round(inversionCv), -6, 6)
    return root, renderedTriad(root, inversion)
end

local function rebuildOutputs()
    local root, triad = currentPitches()
    local octave = settings.octave

    if settings.outputMode == OUTPUT_ROOT then
        outputBuffer[1] = root / 12 + octave
    elseif settings.outputMode == OUTPUT_TRIGGER then
        outputBuffer[1] = triggerRemaining > 0 and 5 or 0
    elseif settings.outputMode == OUTPUT_ARP then
        outputBuffer[1] = triad[arpIndex] / 12 + octave
    elseif settings.outputMode == OUTPUT_STRUM and not strumInhibited then
        outputBuffer[1] = triad[arpIndex] / 12 + octave
    end

    outputBuffer[2] = triad[1] / 12 + octave
    outputBuffer[3] = triad[2] / 12 + octave
    outputBuffer[4] = triad[3] / 12 + octave
    return outputBuffer
end

local function clockGrid()
    local chordChanged = false
    if resetHigh then
        resetPosition(true)
        chordChanged = true
    else
        local _, changed = moveGrid()
        chordChanged = changed
    end

    if chordChanged and settings.outputMode == OUTPUT_STRUM then
        arpIndex = 1
        strumInhibited = false
    end
    if chordChanged and settings.outputMode == OUTPUT_TRIGGER then
        triggerRemaining = 0.001
    end
end

local function clockArpeggiator()
    if resetHigh or arpInhibitHigh then return end
    arpIndex = arpIndex + 1
    if arpIndex > 3 then
        arpIndex = 1
        strumInhibited = true
    end
end

local function formatVector(value)
    local ticks = vectorTicks(value)
    if ticks > GRID_TICKS / 2 then ticks = ticks - GRID_TICKS end
    if ticks == 0 then return "0" end

    local sign = ticks < 0 and "-" or ""
    ticks = math.abs(ticks)
    local whole = math.floor(ticks / TICKS_PER_CELL)
    local remainder = ticks % TICKS_PER_CELL
    local fractions = {
        [105] = "1/8", [120] = "1/7", [140] = "1/6", [168] = "1/5",
        [210] = "1/4", [280] = "1/3", [420] = "1/2",
    }
    if remainder == 0 then return sign .. tostring(whole) end
    local fraction = fractions[remainder] or "?"
    if whole == 0 then return sign .. fraction end
    return sign .. tostring(whole) .. "+" .. fraction
end

local function noteName(note)
    local pitchClass = ((note % 12) + 12) % 12
    local octave = math.floor(note / 12)
    return NOTE_NAMES[pitchClass + 1] .. tostring(octave)
end

local function drawGrid()
    local current = currentCellIndex()
    for index = 1, CELL_COUNT do
        local x = (index - 1) % GRID_SIZE
        local y = math.floor((index - 1) / GRID_SIZE)
        local left = 2 + x * 12
        local top = 2 + y * 12
        local isCurrent = index == current
        local isSelected = index == selectedCell
        drawBox(left, top, left + 10, top + 10, isSelected and 15 or 4)
        if isCurrent then
            drawRectangle(left + 2, top + 2, left + 8, top + 8, 5)
        end
        drawTinyText(left + 5, top + 8, TRANSFORM_NAMES[cells[index].transform],
            isCurrent and 15 or 9, "centre")
    end
end

local function menuValue(page, index)
    if page == "grid" then
        if index == 1 then return formatVector(settings.dx) end
        if index == 2 then return formatVector(settings.dy) end
        if index == 3 then return MODE_NAMES[settings.mode] end
        if index == 4 then return tostring(settings.octave) end
        if index == 5 then return OUTPUT_NAMES[settings.outputMode] end
        return CLEAR_NAMES[settings.clearMode]
    end

    local cell = cells[selectedCell]
    if index == 1 then return TRANSFORM_NAMES[cell.transform] end
    if index == 2 then return tostring(cell.transpose) end
    if index == 3 then return tostring(cell.inversion) end
    return MUTATION_NAMES[cell.mutation]
end

local function drawMenu()
    local page = cellPage and "cell" or "grid"
    local labels = page == "cell"
        and { "Trfm", "Offs", "Inv", "Muta" }
        or { "dx", "dy", "Mode", "Oct", "OutA", "Clr" }
    local cursor = page == "cell" and cellCursor or gridCursor
    local root, triad = currentPitches()
    local x, y = currentCoordinates()

    drawTinyText(66, 7, "AUTOMATONNETZ", 15)
    drawTinyText(251, 7, page == "cell"
        and ("CELL " .. tostring(math.floor((selectedCell - 1) / 5) + 1)
            .. "," .. tostring(((selectedCell - 1) % 5) + 1))
        or ("GRID " .. tostring(y + 1) .. "," .. tostring(x + 1)), 8, "right")
    drawTinyText(66, 15, noteName(root) .. "  " .. noteName(triad[1])
        .. " " .. noteName(triad[2]) .. " " .. noteName(triad[3]), 7)

    for index, label in ipairs(labels) do
        local baseline = 23 + (index - 1) * 8
        local selected = index == cursor
        if selected then
            drawRectangle(65, baseline - 5, 67, baseline, valueEditing and 15 or 8)
        end
        drawTinyText(71, baseline, label, selected and 15 or 7)
        drawTinyText(251, baseline, menuValue(page, index), selected and 15 or 9, "right")
    end
end

local function changeGridValue(index, delta)
    if index == 1 then settings.dx = clamp(settings.dx + delta, 0, 39)
    elseif index == 2 then settings.dy = clamp(settings.dy + delta, 0, 39)
    elseif index == 3 then settings.mode = clamp(settings.mode + delta, 1, 2)
    elseif index == 4 then settings.octave = clamp(settings.octave + delta, -3, 3)
    elseif index == 5 then settings.outputMode = clamp(settings.outputMode + delta, 1, 4)
    else settings.clearMode = clamp(settings.clearMode + delta, 1, 3)
    end
end

local function changeCellValue(index, delta)
    local cell = cells[selectedCell]
    if index == 1 then cell.transform = clamp(cell.transform + delta, 1, 8)
    elseif index == 2 then cell.transpose = clamp(cell.transpose + delta, -12, 12)
    elseif index == 3 then cell.inversion = clamp(cell.inversion + delta, -3, 3)
    else cell.mutation = clamp(cell.mutation + delta, 1, 8)
    end
end

local function restoreSettings(candidate)
    local result = {
        dx = 8,
        dy = 4,
        mode = MODE_MAJOR,
        octave = 0,
        outputMode = OUTPUT_ROOT,
        clearMode = CLEAR_ZERO,
    }
    if not isIndexable(candidate) then return result end
    if validInteger(candidate.dx, 0, 39) then result.dx = candidate.dx end
    if validInteger(candidate.dy, 0, 39) then result.dy = candidate.dy end
    if validInteger(candidate.mode, 1, 2) then result.mode = candidate.mode end
    if validInteger(candidate.octave, -3, 3) then result.octave = candidate.octave end
    if validInteger(candidate.outputMode, 1, 4) then result.outputMode = candidate.outputMode end
    if validInteger(candidate.clearMode, 1, 3) then result.clearMode = candidate.clearMode end
    return result
end

local function restoreCells(candidate)
    if not isIndexable(candidate) then
        clearGrid(CLEAR_RANDOM_TRANSFORM)
        return
    end

    local restored = {}
    for index = 1, CELL_COUNT do
        local cell = sequenceValue(candidate, index)
        if not validCell(cell) then
            clearGrid(CLEAR_RANDOM_TRANSFORM)
            return
        end
        restored[index] = copyCell(cell)
    end
    cells = restored
end

local function initialize(self)
    local restored = isIndexable(self.state) and self.state or nil
    settings = restoreSettings(restored and restored.settings or nil)
    restoreCells(restored and restored.cells or nil)

    positionX = restored and validInteger(restored.positionX, 0, GRID_TICKS - 1)
        and restored.positionX or 0
    positionY = restored and validInteger(restored.positionY, 0, GRID_TICKS - 1)
        and restored.positionY or 0
    selectedCell = restored and validInteger(restored.selectedCell, 1, CELL_COUNT)
        and restored.selectedCell or 1
    cellPage = restored and restored.cellPage == true or false
    valueEditing = false
    gridCursor = restored and validInteger(restored.gridCursor, 1, 6)
        and restored.gridCursor or 1
    cellCursor = restored and validInteger(restored.cellCursor, 1, 4)
        and restored.cellCursor or 1

    resetHigh = false
    arpInhibitHigh = false
    arpIndex = restored and validInteger(restored.arpIndex, 1, 3)
        and restored.arpIndex or 1
    strumInhibited = restored and restored.strumInhibited == true or false
    triggerRemaining = 0
    pendingGridClock = false
    pendingArpClock = false
    pendingClear = false
    latestInputs = { 0, 0, 0, 0, 0, 0, 0 }
    outputBuffer = { 0, 0, 0, 0 }
    cellHistory = {}

    local restoredChord = restored and restored.chord or nil
    if isIndexable(restoredChord)
        and validInteger(restoredChord.mode, 1, 2)
        and validInteger(restoredChord.rootIndex, 1, 3)
        and isIndexable(restoredChord.notes)
    then
        local notes = {}
        local valid = true
        for index = 1, 3 do
            local note = sequenceValue(restoredChord.notes, index)
            if not validInteger(note, -127, 127) then valid = false break end
            notes[index] = note
        end
        if valid then
            chord = {
                mode = restoredChord.mode,
                rootIndex = restoredChord.rootIndex,
                notes = notes,
            }
        else
            resetChord(settings.mode)
        end
    else
        resetChord(settings.mode)
    end
    pushHistory(currentCellIndex())
    rebuildOutputs()
end

return {
    name = "Automatonnetz",
    author = "Fredi Bach",

    init = function(self)
        initialize(self)
        return {
            inputs = {
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/4
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/8
                kGate,    -- Type: Manual / DC
                kGate,    -- Type: Manual / DC
                kTrigger, -- Type: Manual / DC
                kCV,      -- Type: Manual / DC
                kCV,      -- Type: Manual / DC
            },
            inputNames = {
                "Grid clock", "Arp clock", "Reset", "Arp inhibit",
                "Clear grid", "Root CV", "Inversion CV",
            },
            outputs = {
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
            },
            outputNames = { "Root / Aux", "Triad 1", "Triad 2", "Triad 3" },
        }
    end,

    trigger = function(self, input)
        if input == INPUT_GRID_CLOCK then pendingGridClock = true
        elseif input == INPUT_ARP_CLOCK then pendingArpClock = true
        elseif input == INPUT_CLEAR then pendingClear = true
        end
        return rebuildOutputs()
    end,

    gate = function(self, input, rising)
        if input == INPUT_RESET then resetHigh = rising
        elseif input == INPUT_ARP_INHIBIT then arpInhibitHigh = rising
        end
        return rebuildOutputs()
    end,

    step = function(self, dt, inputs)
        for index = 1, 7 do latestInputs[index] = inputs[index] or 0 end

        if triggerRemaining > 0 then
            triggerRemaining = math.max(0, triggerRemaining - dt)
        end
        if pendingClear then
            clearGrid(settings.clearMode)
            resetPosition(false)
            pendingClear = false
        end
        if pendingGridClock then
            clockGrid()
            pendingGridClock = false
        end
        if pendingArpClock then
            clockArpeggiator()
            pendingArpClock = false
        end
        return rebuildOutputs()
    end,

    ui = function(self)
        return true
    end,

    encoder1Turn = function(self, delta)
        selectedCell = clamp(selectedCell + delta, 1, CELL_COUNT)
    end,

    encoder1Push = function(self)
        cellPage = not cellPage
        valueEditing = false
    end,

    encoder2Turn = function(self, delta)
        if valueEditing then
            if cellPage then changeCellValue(cellCursor, delta)
            else changeGridValue(gridCursor, delta)
            end
        elseif cellPage then
            cellCursor = clamp(cellCursor + delta, 1, 4)
        else
            gridCursor = clamp(gridCursor + delta, 1, 6)
        end
        rebuildOutputs()
    end,

    encoder2Push = function(self)
        valueEditing = not valueEditing
    end,

    pot3Push = function(self)
        resetPosition(true)
        rebuildOutputs()
    end,

    pot2Push = function(self)
        clockGrid()
        rebuildOutputs()
    end,

    draw = function(self)
        drawGrid()
        drawMenu()
        return true
    end,

    serialise = function(self)
        local storedCells = {}
        for index = 1, CELL_COUNT do storedCells[index] = copyCell(cells[index]) end
        return {
            version = 1,
            settings = {
                dx = settings.dx,
                dy = settings.dy,
                mode = settings.mode,
                octave = settings.octave,
                outputMode = settings.outputMode,
                clearMode = settings.clearMode,
            },
            cells = storedCells,
            positionX = positionX,
            positionY = positionY,
            selectedCell = selectedCell,
            cellPage = cellPage,
            gridCursor = gridCursor,
            cellCursor = cellCursor,
            arpIndex = arpIndex,
            strumInhibited = strumInhibited,
            chord = {
                mode = chord.mode,
                rootIndex = chord.rootIndex,
                notes = { chord.notes[1], chord.notes[2], chord.notes[3] },
            },
        }
    end,
}
