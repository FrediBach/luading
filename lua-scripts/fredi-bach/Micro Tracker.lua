-- Micro Tracker
-- Four-track pattern and song sequencer for the documented Disting NT custom UI.

local TRACK_COUNT = 4
local PATTERN_COUNT = 8
local ROW_COUNT = 16
local SONG_SLOT_COUNT = 16
local CELL_COUNT = PATTERN_COUNT * ROW_COUNT * TRACK_COUNT
local MAX_RATCHETS = 4

local NOTE_TIE = -2
local NOTE_REST = -1
local NOTE_MIN = 24
local NOTE_MAX = 96
local DEFAULT_VELOCITY = 100
local DEFAULT_PROBABILITY = 100
local DEFAULT_RATCHET = 1

local CLOCK_INTERNAL = 1
local CLOCK_EXTERNAL = 2
local MODE_PATTERN = 1
local MODE_SONG = 2
local RNG = {
    modulus = 4294967296,
    maximum = 4294967295,
    multiplier = 1664525,
    increment = 1013904223,
}
local LONG_PRESS_SECONDS = 0.5
local MESSAGE_SECONDS = 0.8
local LOW_STEP_SECONDS = 0.001

local VIEW_GRID = 1
local VIEW_CELL = 2
local VIEW_SONG = 3
local VIEW_SETTINGS = 4
local VIEW_HELP = 5
local VIEW_COMMANDS = 6
local VIEW_CONFIRM = 7

local COMMAND_COPY = 1
local COMMAND_PASTE = 2
local COMMAND_CLEAR_CELL = 3
local COMMAND_CLEAR_ROW = 4
local COMMAND_CLONE_PATTERN = 5
local COMMAND_MUTE = 6
local COMMAND_SONG = 7
local COMMAND_SETTINGS = 8
local COMMAND_UNDO = 9
local COMMAND_HELP = 10

local CONFIRM_NONE = 0
local CONFIRM_CLEAR_ROW = 1
local CONFIRM_CLONE_PATTERN = 2

local SETTING_CLOCK = 1
local SETTING_TEMPO = 2
local SETTING_ROWS_PER_BEAT = 3
local SETTING_GATE = 4
local SETTING_SWING = 5
local SETTING_TRANSPOSE = 6
local SETTING_MODE = 7
local SETTING_SEED = 8
local SETTING_COUNT = 8

local notes = {}
local velocities = {}
local probabilities = {}
local ratchets = {}
local song = {}
local mutes = {}
local settings = {}
local rngState = 2026

local selectedPattern = 1
local cursorRow = 1
local cursorTrack = 1
local playingPattern = 1
local playRow = 1
local nextRow = 1
local songSlot = 1
local songCursor = 1
local queuedPattern = 0

local running = false
local pendingReset = false
local pendingExternalClock = false
local pendingExternalClockTime = 0
local lastExternalClockTime = -1
local externalInterval = 0
local rowCountdown = 0
local currentTime = 0
local immediateInternalRow = false
local emptySongWarning = false

local outputs = { 0, 0, 0, 0, 0, 0, 0, 0 }
local gateHigh = { false, false, false, false }
local scheduledCount = { 0, 0, 0, 0 }
local scheduledIndex = { 1, 1, 1, 1 }
local scheduledPitch = { 0, 0, 0, 0 }
local scheduledGate = { 0, 0, 0, 0 }
local scheduledOnsets = { {}, {}, {}, {} }
local gateOffTime = { -1, -1, -1, -1 }

local view = VIEW_GRID
local commandCursor = 1
local commandReturnView = VIEW_GRID
local confirmKind = CONFIRM_NONE
local confirmYes = false
local cloneDestination = 2
local helpPage = 1
local cellField = 1
local cellWorking = { NOTE_REST, DEFAULT_VELOCITY, DEFAULT_PROBABILITY, DEFAULT_RATCHET }
local cellOriginal = { NOTE_REST, DEFAULT_VELOCITY, DEFAULT_PROBABILITY, DEFAULT_RATCHET }
local songWorking = 1
local songOriginal = 1
local songEditing = false
local settingCursor = 1
local settingWorking = 1
local settingOriginal = 1
local settingEditing = false
local encoderHeld = false
local encoderHeldAt = 0
local encoderChord = false
local encoderLongOpened = false
local copyBuffer = nil
local undoRecord = nil
local messageText = ""
local messageUntil = 0
local openCommands
local handleLongPress

local function clamp(value, low, high)
    return math.max(low, math.min(high, value))
end

local function rounded(value)
    if value >= 0 then return math.floor(value + 0.5) end
    return math.ceil(value - 0.5)
end

local function wrap(value, low, high)
    local size = high - low + 1
    return ((value - low) % size) + low
end

local function isIndexable(value)
    local kind = type(value)
    return kind == "table" or kind == "userdata"
end

local function sequenceValue(sequence, index)
    if not isIndexable(sequence) then return nil end
    if sequence[0] ~= nil then return sequence[index - 1] end
    return sequence[index]
end

local function validInteger(value, low, high)
    return type(value) == "number"
        and value == math.floor(value)
        and value >= low
        and value <= high
end

local function cellIndex(pattern, row, track)
    return ((pattern - 1) * ROW_COUNT + (row - 1)) * TRACK_COUNT + track
end

local function defaultSettings()
    return {
        clock = CLOCK_INTERNAL,
        tempo = 120,
        rowsPerBeat = 2,
        gate = 60,
        swing = 0,
        transpose = 0,
        mode = MODE_PATTERN,
        seed = 2026,
    }
end

local function setCell(pattern, row, track, note, velocity, probability, ratchet)
    local index = cellIndex(pattern, row, track)
    notes[index] = note
    velocities[index] = velocity
    probabilities[index] = probability
    ratchets[index] = ratchet
end

local function buildDefaultState()
    settings = defaultSettings()
    notes = {}
    velocities = {}
    probabilities = {}
    ratchets = {}
    for index = 1, CELL_COUNT do
        notes[index] = NOTE_REST
        velocities[index] = DEFAULT_VELOCITY
        probabilities[index] = DEFAULT_PROBABILITY
        ratchets[index] = DEFAULT_RATCHET
    end

    -- Pattern 1 is a deliberately small consonant demo. It includes a tie,
    -- accents, a probability event, and a ratchet without overwhelming startup.
    setCell(1, 1, 1, 48, 112, 100, 1)
    setCell(1, 2, 1, NOTE_TIE, 112, 100, 1)
    setCell(1, 5, 1, 43, 108, 100, 1)
    setCell(1, 9, 1, 46, 108, 100, 1)
    setCell(1, 13, 1, 41, 118, 100, 1)
    for row = 1, ROW_COUNT, 4 do
        setCell(1, row, 2, 60 + ((row - 1) / 4) % 3 * 4, 127, 100, 1)
    end
    setCell(1, 9, 2, 64, 96, 75, 1)
    for row = 3, ROW_COUNT, 4 do
        setCell(1, row, 3, 67, 88, 100, 1)
    end
    setCell(1, 5, 4, 72, 84, 100, 1)
    setCell(1, 13, 4, 74, 104, 100, 2)

    -- Pattern 2 gives the default song a restrained answer phrase.
    setCell(2, 1, 1, 48, 112, 100, 1)
    setCell(2, 5, 1, 46, 108, 100, 1)
    setCell(2, 9, 1, 43, 108, 100, 1)
    setCell(2, 13, 1, 36, 118, 100, 1)
    setCell(2, 1, 2, 60, 120, 100, 1)
    setCell(2, 9, 2, 67, 120, 100, 1)
    setCell(2, 5, 3, 64, 90, 100, 1)
    setCell(2, 13, 4, 72, 104, 100, 4)

    song = { 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 }
    mutes = { false, false, false, false }
    selectedPattern = 1
    cursorRow = 1
    cursorTrack = 1
    rngState = settings.seed
end

local function copyDense(candidate, low, high)
    if not isIndexable(candidate) then return nil end
    local copied = {}
    for index = 1, CELL_COUNT do
        local value = sequenceValue(candidate, index)
        if not validInteger(value, low, high) then return nil end
        copied[index] = value
    end
    if sequenceValue(candidate, CELL_COUNT + 1) ~= nil then return nil end
    return copied
end

local function copyNotes(candidate)
    if not isIndexable(candidate) then return nil end
    local copied = {}
    for index = 1, CELL_COUNT do
        local value = sequenceValue(candidate, index)
        if not validInteger(value, NOTE_TIE, NOTE_MAX)
            or (value > NOTE_REST and value < NOTE_MIN) then
            return nil
        end
        copied[index] = value
    end
    if sequenceValue(candidate, CELL_COUNT + 1) ~= nil then return nil end
    return copied
end

local function copySong(candidate)
    if not isIndexable(candidate) then return nil end
    local copied = {}
    for index = 1, SONG_SLOT_COUNT do
        local value = sequenceValue(candidate, index)
        if not validInteger(value, 0, PATTERN_COUNT) then return nil end
        copied[index] = value
    end
    if sequenceValue(candidate, SONG_SLOT_COUNT + 1) ~= nil then return nil end
    return copied
end

local function copyMutes(candidate)
    if not isIndexable(candidate) then return nil end
    local copied = {}
    for index = 1, TRACK_COUNT do
        local value = sequenceValue(candidate, index)
        if type(value) ~= "boolean" then return nil end
        copied[index] = value
    end
    if sequenceValue(candidate, TRACK_COUNT + 1) ~= nil then return nil end
    return copied
end

local function normalizedSetting(candidate, name, low, high, fallback)
    if isIndexable(candidate) and validInteger(candidate[name], low, high) then
        return candidate[name]
    end
    return fallback
end

local function restoreState(candidate)
    buildDefaultState()
    if not isIndexable(candidate) or candidate.version ~= 1 then return end

    local restoredNotes = copyNotes(candidate.notes)
    local restoredVelocities = copyDense(candidate.velocities, 1, 127)
    local restoredProbabilities = copyDense(candidate.probabilities, 0, 100)
    local restoredRatchets = copyDense(candidate.ratchets, 1, MAX_RATCHETS)
    local restoredSong = copySong(candidate.song)
    local restoredMutes = copyMutes(candidate.mutes)
    if restoredNotes then notes = restoredNotes end
    if restoredVelocities then velocities = restoredVelocities end
    if restoredProbabilities then probabilities = restoredProbabilities end
    if restoredRatchets then ratchets = restoredRatchets end
    if restoredSong then song = restoredSong end
    if restoredMutes then mutes = restoredMutes end

    local defaults = defaultSettings()
    local candidateSettings = candidate.settings
    settings.clock = normalizedSetting(candidateSettings, "clock", 1, 2, defaults.clock)
    settings.tempo = normalizedSetting(candidateSettings, "tempo", 30, 300, defaults.tempo)
    local rowsPerBeat = normalizedSetting(candidateSettings, "rowsPerBeat", 1, 4, defaults.rowsPerBeat)
    settings.rowsPerBeat = (rowsPerBeat == 1 or rowsPerBeat == 2 or rowsPerBeat == 4)
        and rowsPerBeat or defaults.rowsPerBeat
    settings.gate = normalizedSetting(candidateSettings, "gate", 10, 90, defaults.gate)
    settings.swing = normalizedSetting(candidateSettings, "swing", 0, 60, defaults.swing)
    settings.transpose = normalizedSetting(candidateSettings, "transpose", -24, 24, defaults.transpose)
    settings.mode = normalizedSetting(candidateSettings, "mode", 1, 2, defaults.mode)
    settings.seed = normalizedSetting(candidateSettings, "seed", 1, RNG.maximum, defaults.seed)
    selectedPattern = validInteger(candidate.selectedPattern, 1, PATTERN_COUNT)
        and candidate.selectedPattern or 1
    cursorRow = validInteger(candidate.cursorRow, 1, ROW_COUNT) and candidate.cursorRow or 1
    cursorTrack = validInteger(candidate.cursorTrack, 1, TRACK_COUNT) and candidate.cursorTrack or 1
    rngState = validInteger(candidate.rng, 1, RNG.maximum)
        and candidate.rng or settings.seed
end

local function copyArray(source, length)
    local copied = {}
    for index = 1, length do copied[index] = source[index] end
    return copied
end

local function resetVolatileState()
    playingPattern = selectedPattern
    playRow = 1
    nextRow = 1
    songSlot = 1
    songCursor = 1
    queuedPattern = 0
    running = false
    pendingReset = false
    pendingExternalClock = false
    pendingExternalClockTime = 0
    lastExternalClockTime = -1
    externalInterval = 0
    rowCountdown = 0
    currentTime = 0
    immediateInternalRow = false
    emptySongWarning = false
    view = VIEW_GRID
    commandCursor = 1
    confirmKind = CONFIRM_NONE
    confirmYes = false
    helpPage = 1
    cellField = 1
    songEditing = false
    settingCursor = 1
    settingEditing = false
    encoderHeld = false
    encoderChord = false
    encoderLongOpened = false
    copyBuffer = nil
    undoRecord = nil
    messageText = ""
    messageUntil = 0
    for track = 1, TRACK_COUNT do
        outputs[(track - 1) * 2 + 1] = 0
        outputs[(track - 1) * 2 + 2] = 0
        gateHigh[track] = false
        scheduledCount[track] = 0
        scheduledIndex[track] = 1
        scheduledPitch[track] = 0
        scheduledGate[track] = 0
        gateOffTime[track] = -1
        scheduledOnsets[track] = { 0, 0, 0, 0 }
    end
end

local function serialisedState()
    return {
        version = 1,
        settings = {
            clock = settings.clock,
            tempo = settings.tempo,
            rowsPerBeat = settings.rowsPerBeat,
            gate = settings.gate,
            swing = settings.swing,
            transpose = settings.transpose,
            mode = settings.mode,
            seed = settings.seed,
        },
        notes = copyArray(notes, CELL_COUNT),
        velocities = copyArray(velocities, CELL_COUNT),
        probabilities = copyArray(probabilities, CELL_COUNT),
        ratchets = copyArray(ratchets, CELL_COUNT),
        song = copyArray(song, SONG_SLOT_COUNT),
        selectedPattern = selectedPattern,
        cursorRow = cursorRow,
        cursorTrack = cursorTrack,
        mutes = copyArray(mutes, TRACK_COUNT),
        rng = rngState,
    }
end

local function showMessage(text)
    messageText = text
    messageUntil = currentTime + MESSAGE_SECONDS
end

local function randomUnit()
    rngState = (rngState * RNG.multiplier + RNG.increment) % RNG.modulus
    if rngState == 0 then rngState = settings.seed end
    return rngState / RNG.modulus
end

local function baseRowInterval()
    return 60 / settings.tempo / settings.rowsPerBeat
end

local function rowInterval(row)
    local base = baseRowInterval()
    if settings.clock == CLOCK_EXTERNAL and externalInterval > 0 then
        return externalInterval
    end
    if settings.clock == CLOCK_EXTERNAL or settings.swing == 0 then return base end
    if row % 2 == 1 then return base * (1 + settings.swing / 100) end
    return base * (1 - settings.swing / 100)
end

local function lowerGate(track)
    local gateOutput = (track - 1) * 2 + 2
    outputs[gateOutput] = 0
    gateHigh[track] = false
    gateOffTime[track] = -1
end

local function cancelTrack(track, lower)
    scheduledCount[track] = 0
    scheduledIndex[track] = 1
    gateOffTime[track] = -1
    if lower then lowerGate(track) end
end

local function cancelAllEvents()
    for track = 1, TRACK_COUNT do cancelTrack(track, true) end
end

local function resolveSongPattern()
    local entry = song[songSlot]
    if entry == 0 then
        songSlot = 1
        entry = song[1]
    end
    if entry == 0 then
        emptySongWarning = true
        showMessage("EMPTY SONG: P01")
        return 1
    end
    emptySongWarning = false
    return entry
end

local function resetPosition(reseed)
    cancelAllEvents()
    nextRow = 1
    playRow = 1
    songSlot = 1
    queuedPattern = 0
    rowCountdown = 0
    lastExternalClockTime = -1
    externalInterval = 0
    if reseed then rngState = settings.seed end
    if settings.mode == MODE_SONG then
        playingPattern = resolveSongPattern()
    else
        playingPattern = selectedPattern
    end
end

local function stopTransport(showStatus)
    running = false
    immediateInternalRow = false
    cancelAllEvents()
    if showStatus then showMessage("STOP") end
end

local function startTransport()
    resetPosition(false)
    running = true
    if settings.clock == CLOCK_INTERNAL then
        immediateInternalRow = true
    end
    showMessage(settings.clock == CLOCK_INTERNAL and "RUN" or "EXT ARMED")
end

local function restartForClockChange()
    stopTransport(false)
    resetPosition(false)
    showMessage("CLOCK: STOPPED")
end

local function scheduleNote(track, pitch, gateVoltage, count, interval)
    local subdivision = interval / count
    local firstOnset = currentTime
    if gateHigh[track] then
        lowerGate(track)
        firstOnset = currentTime + LOW_STEP_SECONDS
    end
    scheduledCount[track] = count
    scheduledIndex[track] = 1
    scheduledPitch[track] = pitch
    scheduledGate[track] = gateVoltage
    gateOffTime[track] = -1
    for index = 1, MAX_RATCHETS do
        scheduledOnsets[track][index] = firstOnset + (index - 1) * subdivision
    end
end

local function evaluateRow(pattern, row, interval, transposeCv)
    for track = 1, TRACK_COUNT do
        local index = cellIndex(pattern, row, track)
        local note = notes[index]
        if not validInteger(note, NOTE_TIE, NOTE_MAX)
            or (note > NOTE_REST and note < NOTE_MIN) then
            note = NOTE_REST
        end

        if mutes[track] then
            cancelTrack(track, true)
        elseif note == NOTE_REST then
            cancelTrack(track, true)
        elseif note == NOTE_TIE then
            scheduledCount[track] = 0
            scheduledIndex[track] = 1
            gateOffTime[track] = -1
        else
            local probability = validInteger(probabilities[index], 0, 100)
                and probabilities[index] or DEFAULT_PROBABILITY
            local accepted = randomUnit() * 100 < probability
            if not accepted then
                cancelTrack(track, true)
            else
                local velocity = validInteger(velocities[index], 1, 127)
                    and velocities[index] or DEFAULT_VELOCITY
                local count = validInteger(ratchets[index], 1, MAX_RATCHETS)
                    and ratchets[index] or DEFAULT_RATCHET
                local pitch = (note - 60) / 12 + settings.transpose / 12 + transposeCv
                local gateVoltage = 5 + (velocity - 1) * 5 / 126
                scheduleNote(
                    track,
                    clamp(pitch, -10, 10),
                    clamp(gateVoltage, 5, 10),
                    count,
                    interval
                )
            end
        end
    end
end

local function advanceAfterRow(row)
    if row < ROW_COUNT then
        nextRow = row + 1
        return
    end

    nextRow = 1
    if settings.mode == MODE_SONG then
        songSlot = songSlot + 1
        if songSlot > SONG_SLOT_COUNT then songSlot = 1 end
        playingPattern = resolveSongPattern()
    elseif queuedPattern > 0 then
        playingPattern = queuedPattern
        queuedPattern = 0
        showMessage("PATTERN CHANGED")
    end
end

local function playNextRow(transposeCv, forcedInterval)
    local row = nextRow
    local interval = forcedInterval or rowInterval(row)
    playRow = row
    evaluateRow(playingPattern, row, interval, transposeCv)
    advanceAfterRow(row)
    return interval
end

local function processScheduledEvents()
    for track = 1, TRACK_COUNT do
        if gateOffTime[track] >= 0 and currentTime + 0.0000001 >= gateOffTime[track] then
            lowerGate(track)
        end

        local index = scheduledIndex[track]
        if index <= scheduledCount[track]
            and currentTime + 0.0000001 >= scheduledOnsets[track][index] then
            if gateHigh[track] then
                lowerGate(track)
                scheduledOnsets[track][index] = currentTime + LOW_STEP_SECONDS
            else
                local pitchOutput = (track - 1) * 2 + 1
                local gateOutput = pitchOutput + 1
                outputs[pitchOutput] = scheduledPitch[track]
                outputs[gateOutput] = scheduledGate[track]
                gateHigh[track] = true
                scheduledIndex[track] = index + 1
                if index < scheduledCount[track] then
                    local subdivision = scheduledOnsets[track][index + 1]
                        - scheduledOnsets[track][index]
                    local duration = subdivision * settings.gate / 100
                    duration = math.min(duration, math.max(LOW_STEP_SECONDS, subdivision - LOW_STEP_SECONDS))
                    gateOffTime[track] = currentTime + duration
                else
                    gateOffTime[track] = -1
                end
            end
        end
    end
end

local function processTransport(dt, inputs)
    currentTime = currentTime + dt

    if pendingReset then
        resetPosition(true)
        pendingReset = false
        showMessage("RESET")
    end

    if pendingExternalClock then
        if running and settings.clock == CLOCK_EXTERNAL then
            if lastExternalClockTime >= 0 then
                local measured = pendingExternalClockTime - lastExternalClockTime
                if measured >= LOW_STEP_SECONDS then externalInterval = measured end
            end
            lastExternalClockTime = pendingExternalClockTime
            for track = 1, TRACK_COUNT do
                scheduledCount[track] = 0
                scheduledIndex[track] = 1
                gateOffTime[track] = -1
            end
            playNextRow(inputs[3] or 0, externalInterval > 0 and externalInterval or baseRowInterval())
        end
        pendingExternalClock = false
    end

    if running and settings.clock == CLOCK_INTERNAL then
        if immediateInternalRow then
            immediateInternalRow = false
            rowCountdown = playNextRow(inputs[3] or 0)
        else
            rowCountdown = rowCountdown - dt
            local catchUp = 0
            while rowCountdown <= 0 and catchUp < 4 do
                rowCountdown = rowCountdown + playNextRow(inputs[3] or 0)
                catchUp = catchUp + 1
            end
        end
    end

    processScheduledEvents()

    if encoderHeld and not encoderChord and not encoderLongOpened
        and currentTime - encoderHeldAt + 0.000000001 >= LONG_PRESS_SECONDS then
        encoderLongOpened = true
        handleLongPress()
    end
end

local function currentCellValues()
    local index = cellIndex(selectedPattern, cursorRow, cursorTrack)
    return { notes[index], velocities[index], probabilities[index], ratchets[index] }
end

local function sameCell(left, right)
    for index = 1, 4 do
        if left[index] ~= right[index] then return false end
    end
    return true
end

local function writeCell(pattern, row, track, values)
    local index = cellIndex(pattern, row, track)
    notes[index] = values[1]
    velocities[index] = values[2]
    probabilities[index] = values[3]
    ratchets[index] = values[4]
end

local function beginCellEdit()
    cellOriginal = currentCellValues()
    cellWorking = copyArray(cellOriginal, 4)
    cellField = 1
    view = VIEW_CELL
end

local function commitCellEdit()
    if view ~= VIEW_CELL then return end
    if not sameCell(cellWorking, cellOriginal) then
        undoRecord = {
            kind = "cell",
            pattern = selectedPattern,
            row = cursorRow,
            track = cursorTrack,
            values = copyArray(cellOriginal, 4),
        }
        writeCell(selectedPattern, cursorRow, cursorTrack, cellWorking)
        showMessage("CELL SAVED")
    end
end

local function settingValue(index)
    if index == SETTING_CLOCK then return settings.clock end
    if index == SETTING_TEMPO then return settings.tempo end
    if index == SETTING_ROWS_PER_BEAT then return settings.rowsPerBeat end
    if index == SETTING_GATE then return settings.gate end
    if index == SETTING_SWING then return settings.swing end
    if index == SETTING_TRANSPOSE then return settings.transpose end
    if index == SETTING_MODE then return settings.mode end
    return settings.seed
end

local function setSettingValue(index, value)
    if index == SETTING_CLOCK then settings.clock = value
    elseif index == SETTING_TEMPO then settings.tempo = value
    elseif index == SETTING_ROWS_PER_BEAT then settings.rowsPerBeat = value
    elseif index == SETTING_GATE then settings.gate = value
    elseif index == SETTING_SWING then settings.swing = value
    elseif index == SETTING_TRANSPOSE then settings.transpose = value
    elseif index == SETTING_MODE then settings.mode = value
    else settings.seed = value
    end
end

local function beginSettingEdit()
    settingOriginal = settingValue(settingCursor)
    settingWorking = settingOriginal
    settingEditing = true
end

local function commitSettingEdit()
    if not settingEditing then return end
    if settingWorking ~= settingOriginal then
        undoRecord = {
            kind = "setting",
            setting = settingCursor,
            value = settingOriginal,
        }
        setSettingValue(settingCursor, settingWorking)
        if settingCursor == SETTING_CLOCK then
            restartForClockChange()
        elseif settingCursor == SETTING_MODE then
            stopTransport(false)
            resetPosition(false)
        elseif settingCursor == SETTING_SEED and rngState == 0 then
            rngState = settings.seed
        end
    end
    settingEditing = false
end

local function beginSongEdit()
    songOriginal = song[songCursor]
    songWorking = songOriginal
    songEditing = true
end

local function commitSongEdit()
    if not songEditing then return end
    if songWorking ~= songOriginal then
        undoRecord = { kind = "song", slot = songCursor, value = songOriginal }
        song[songCursor] = songWorking
    end
    songEditing = false
end

local function leaveEditableView()
    if view == VIEW_CELL then commitCellEdit()
    elseif view == VIEW_SONG then commitSongEdit()
    elseif view == VIEW_SETTINGS then commitSettingEdit()
    end
end

openCommands = function()
    leaveEditableView()
    commandReturnView = view == VIEW_CELL and VIEW_GRID or view
    if commandReturnView == VIEW_COMMANDS or commandReturnView == VIEW_CONFIRM then
        commandReturnView = VIEW_GRID
    end
    view = VIEW_COMMANDS
    commandCursor = 1
end

handleLongPress = function()
    if view == VIEW_COMMANDS then
        view = commandReturnView
        if view == VIEW_SONG then beginSongEdit()
        elseif view == VIEW_SETTINGS then beginSettingEdit()
        end
    elseif view == VIEW_HELP or view == VIEW_CONFIRM then
        confirmKind = CONFIRM_NONE
        confirmYes = false
        view = VIEW_GRID
    else
        openCommands()
    end
end

local function copyPattern(pattern)
    local result = { notes = {}, velocities = {}, probabilities = {}, ratchets = {} }
    for row = 1, ROW_COUNT do
        for track = 1, TRACK_COUNT do
            local index = cellIndex(pattern, row, track)
            local target = (row - 1) * TRACK_COUNT + track
            result.notes[target] = notes[index]
            result.velocities[target] = velocities[index]
            result.probabilities[target] = probabilities[index]
            result.ratchets[target] = ratchets[index]
        end
    end
    return result
end

local function writePattern(pattern, source)
    for row = 1, ROW_COUNT do
        for track = 1, TRACK_COUNT do
            local index = cellIndex(pattern, row, track)
            local sourceIndex = (row - 1) * TRACK_COUNT + track
            notes[index] = source.notes[sourceIndex]
            velocities[index] = source.velocities[sourceIndex]
            probabilities[index] = source.probabilities[sourceIndex]
            ratchets[index] = source.ratchets[sourceIndex]
        end
    end
end

local function clearCellAtCursor()
    local previous = currentCellValues()
    local cleared = { NOTE_REST, DEFAULT_VELOCITY, DEFAULT_PROBABILITY, DEFAULT_RATCHET }
    if sameCell(previous, cleared) then
        showMessage("ALREADY CLEAR")
        return
    end
    undoRecord = {
        kind = "cell",
        pattern = selectedPattern,
        row = cursorRow,
        track = cursorTrack,
        values = previous,
    }
    writeCell(selectedPattern, cursorRow, cursorTrack, cleared)
    showMessage("CELL CLEARED")
end

local function clearRowAtCursor()
    local previous = { cells = {} }
    for track = 1, TRACK_COUNT do
        local index = cellIndex(selectedPattern, cursorRow, track)
        previous.cells[track] = {
            notes[index], velocities[index], probabilities[index], ratchets[index]
        }
        writeCell(
            selectedPattern,
            cursorRow,
            track,
            { NOTE_REST, DEFAULT_VELOCITY, DEFAULT_PROBABILITY, DEFAULT_RATCHET }
        )
    end
    undoRecord = {
        kind = "row",
        pattern = selectedPattern,
        row = cursorRow,
        cells = previous.cells,
    }
    showMessage("ROW CLEARED")
end

local function clonePattern()
    local source = copyPattern(selectedPattern)
    local previous = copyPattern(cloneDestination)
    undoRecord = { kind = "pattern", pattern = cloneDestination, values = previous }
    writePattern(cloneDestination, source)
    showMessage("CLONED P" .. string.format("%02d", cloneDestination))
end

local function applyUndo()
    local record = undoRecord
    if not record then
        showMessage("NOTHING TO UNDO")
        return
    end
    if record.kind == "cell" then
        writeCell(record.pattern, record.row, record.track, record.values)
    elseif record.kind == "row" then
        for track = 1, TRACK_COUNT do
            writeCell(record.pattern, record.row, track, record.cells[track])
        end
    elseif record.kind == "pattern" then
        writePattern(record.pattern, record.values)
    elseif record.kind == "song" then
        song[record.slot] = record.value
    elseif record.kind == "mute" then
        mutes[record.track] = record.value
    elseif record.kind == "setting" then
        setSettingValue(record.setting, record.value)
        if record.setting == SETTING_CLOCK or record.setting == SETTING_MODE then
            stopTransport(false)
            resetPosition(false)
        end
    end
    undoRecord = nil
    showMessage("UNDONE")
end

local function activateCommand()
    if commandCursor == COMMAND_COPY then
        copyBuffer = currentCellValues()
        showMessage("CELL COPIED")
        view = VIEW_GRID
    elseif commandCursor == COMMAND_PASTE then
        if not copyBuffer then
            showMessage("COPY FIRST")
        else
            local previous = currentCellValues()
            undoRecord = {
                kind = "cell",
                pattern = selectedPattern,
                row = cursorRow,
                track = cursorTrack,
                values = previous,
            }
            writeCell(selectedPattern, cursorRow, cursorTrack, copyArray(copyBuffer, 4))
            showMessage("CELL PASTED")
            view = VIEW_GRID
        end
    elseif commandCursor == COMMAND_CLEAR_CELL then
        clearCellAtCursor()
        view = VIEW_GRID
    elseif commandCursor == COMMAND_CLEAR_ROW then
        confirmKind = CONFIRM_CLEAR_ROW
        confirmYes = false
        view = VIEW_CONFIRM
    elseif commandCursor == COMMAND_CLONE_PATTERN then
        confirmKind = CONFIRM_CLONE_PATTERN
        confirmYes = false
        cloneDestination = selectedPattern == 1 and 2 or 1
        view = VIEW_CONFIRM
    elseif commandCursor == COMMAND_MUTE then
        undoRecord = { kind = "mute", track = cursorTrack, value = mutes[cursorTrack] }
        mutes[cursorTrack] = not mutes[cursorTrack]
        if mutes[cursorTrack] then cancelTrack(cursorTrack, true) end
        showMessage(mutes[cursorTrack] and "TRACK MUTED" or "TRACK LIVE")
        view = VIEW_GRID
    elseif commandCursor == COMMAND_SONG then
        view = VIEW_SONG
        beginSongEdit()
    elseif commandCursor == COMMAND_SETTINGS then
        view = VIEW_SETTINGS
        beginSettingEdit()
    elseif commandCursor == COMMAND_UNDO then
        applyUndo()
        view = VIEW_GRID
    elseif commandCursor == COMMAND_HELP then
        helpPage = 1
        view = VIEW_HELP
    end
end

local function applyConfirmation()
    if not confirmYes then
        view = VIEW_GRID
        showMessage("CANCELLED")
        return
    end
    if confirmKind == CONFIRM_CLEAR_ROW then clearRowAtCursor()
    elseif confirmKind == CONFIRM_CLONE_PATTERN then clonePattern()
    end
    confirmKind = CONFIRM_NONE
    confirmYes = false
    view = VIEW_GRID
end

local function changeCellWorking(delta, coarse)
    local amount = delta
    if cellField == 1 then
        if coarse then amount = delta * 12 end
        cellWorking[1] = clamp(cellWorking[1] + amount, NOTE_TIE, NOTE_MAX)
        if cellWorking[1] > NOTE_REST and cellWorking[1] < NOTE_MIN then
            cellWorking[1] = delta > 0 and NOTE_MIN or NOTE_REST
        end
    elseif cellField == 2 then
        if coarse then amount = delta * 16 end
        cellWorking[2] = clamp(cellWorking[2] + amount, 1, 127)
    elseif cellField == 3 then
        if coarse then amount = delta * 10 end
        cellWorking[3] = clamp(cellWorking[3] + amount, 0, 100)
    else
        cellWorking[4] = clamp(cellWorking[4] + delta, 1, MAX_RATCHETS)
    end
end

local function changeSettingWorking(delta, coarse)
    local amount = delta
    if settingCursor == SETTING_CLOCK or settingCursor == SETTING_MODE then
        settingWorking = clamp(settingWorking + delta, 1, 2)
    elseif settingCursor == SETTING_TEMPO then
        settingWorking = clamp(settingWorking + delta * (coarse and 10 or 1), 30, 300)
    elseif settingCursor == SETTING_ROWS_PER_BEAT then
        local rowValues = { 1, 2, 4 }
        local position = settingWorking == 1 and 1 or (settingWorking == 2 and 2 or 3)
        position = clamp(position + delta, 1, 3)
        settingWorking = rowValues[position]
    elseif settingCursor == SETTING_GATE then
        settingWorking = clamp(settingWorking + delta * (coarse and 10 or 1), 10, 90)
    elseif settingCursor == SETTING_SWING then
        settingWorking = clamp(settingWorking + delta * (coarse and 10 or 1), 0, 60)
    elseif settingCursor == SETTING_TRANSPOSE then
        settingWorking = clamp(settingWorking + delta * (coarse and 12 or 1), -24, 24)
    else
        settingWorking = clamp(
            settingWorking + delta * (coarse and 100 or 1),
            1,
            RNG.maximum
        )
    end
end

local function encoder1Turn(delta)
    delta = rounded(delta or 0)
    if delta == 0 then return end
    if view == VIEW_GRID then
        cursorRow = wrap(cursorRow + delta, 1, ROW_COUNT)
    elseif view == VIEW_CELL then
        cellField = wrap(cellField + delta, 1, 4)
    elseif view == VIEW_SONG then
        commitSongEdit()
        songCursor = wrap(songCursor + delta, 1, SONG_SLOT_COUNT)
        beginSongEdit()
    elseif view == VIEW_SETTINGS then
        commitSettingEdit()
        settingCursor = wrap(settingCursor + delta, 1, SETTING_COUNT)
        beginSettingEdit()
    elseif view == VIEW_HELP then
        helpPage = wrap(helpPage + delta, 1, 3)
    elseif view == VIEW_COMMANDS then
        commandCursor = wrap(commandCursor + delta, 1, COMMAND_HELP)
    elseif view == VIEW_CONFIRM then
        confirmYes = delta > 0
    end
end

local function encoder2Turn(delta)
    delta = rounded(delta or 0)
    if delta == 0 then return end
    local coarse = encoderHeld
    if encoderHeld then encoderChord = true end

    if view == VIEW_GRID then
        cursorTrack = wrap(cursorTrack + delta, 1, TRACK_COUNT)
    elseif view == VIEW_CELL then
        changeCellWorking(delta, coarse)
    elseif view == VIEW_SONG then
        songWorking = clamp(songWorking + delta * (coarse and 2 or 1), 0, PATTERN_COUNT)
    elseif view == VIEW_SETTINGS then
        changeSettingWorking(delta, coarse)
    elseif view == VIEW_CONFIRM then
        if confirmKind == CONFIRM_CLONE_PATTERN then
            local destination = cloneDestination
            repeat
                destination = wrap(destination + delta, 1, PATTERN_COUNT)
            until destination ~= selectedPattern
            cloneDestination = destination
        else
            confirmYes = delta > 0
        end
    end
end

local function encoder2Push()
    if encoderHeld then return end
    encoderHeld = true
    encoderHeldAt = currentTime
    encoderChord = false
    encoderLongOpened = false
end

local function encoder2Release()
    if not encoderHeld then return end
    local elapsed = currentTime - encoderHeldAt
    local shortPress = not encoderChord and not encoderLongOpened
        and elapsed + 0.000000001 < LONG_PRESS_SECONDS
    encoderHeld = false
    encoderChord = false
    encoderLongOpened = false
    if not shortPress then return end

    if view == VIEW_GRID then
        beginCellEdit()
    elseif view == VIEW_CELL then
        commitCellEdit()
        view = VIEW_GRID
    elseif view == VIEW_SONG then
        commitSongEdit()
        view = VIEW_GRID
    elseif view == VIEW_SETTINGS then
        commitSettingEdit()
        view = VIEW_GRID
    elseif view == VIEW_HELP then
        view = VIEW_GRID
    elseif view == VIEW_COMMANDS then
        activateCommand()
    elseif view == VIEW_CONFIRM then
        applyConfirmation()
    end
end

local function pot1Turn(value)
    local pattern = clamp(math.floor(clamp(value or 0, 0, 1) * PATTERN_COUNT) + 1, 1, PATTERN_COUNT)
    if pattern == selectedPattern then return end
    if view == VIEW_CELL then
        commitCellEdit()
        view = VIEW_GRID
    end
    selectedPattern = pattern
    if settings.mode == MODE_PATTERN then
        if running then
            queuedPattern = pattern == playingPattern and 0 or pattern
            showMessage(queuedPattern > 0 and "PATTERN QUEUED" or "QUEUE CLEARED")
        else
            playingPattern = pattern
            queuedPattern = 0
        end
    end
end

local function pot2Turn(value)
    local tempo = rounded(30 + clamp(value or 0, 0, 1) * 270)
    settings.tempo = tempo
    if view == VIEW_SETTINGS and settingCursor == SETTING_TEMPO then
        settingOriginal = tempo
        settingWorking = tempo
    end
end

local function pot3Turn(value)
    local swing = rounded(clamp(value or 0, 0, 1) * 60)
    settings.swing = swing
    if view == VIEW_SETTINGS and settingCursor == SETTING_SWING then
        settingOriginal = swing
        settingWorking = swing
    end
end

local function pot3Push()
    if running then stopTransport(true) else startTransport() end
end

local NOTE_NAMES = {
    "C-", "C#", "D-", "D#", "E-", "F-",
    "F#", "G-", "G#", "A-", "A#", "B-"
}

local function noteText(note)
    if note == NOTE_TIE then return "===" end
    if note == NOTE_REST then return "..." end
    if not validInteger(note, NOTE_MIN, NOTE_MAX) then return "..." end
    return NOTE_NAMES[(note % 12) + 1] .. tostring(math.floor(note / 12) - 1)
end

local function hexByte(value)
    return string.format("%02X", clamp(rounded(value), 0, 255))
end

local function rowHex(row)
    return string.format("%02X", row - 1)
end

local function drawHeader(title)
    drawTinyText(2, 7, title, 15)
    local transport = running and "RUN" or "STOP"
    drawTinyText(254, 7, transport, running and 15 or 7, "right")
    drawLine(0, 9, 255, 9, 3)
end

local function drawMessageOrHint(hint)
    local text = currentTime < messageUntil and messageText or hint
    drawTinyText(2, 63, text, currentTime < messageUntil and 15 or 7)
end

local function drawGrid()
    local modeText = settings.mode == MODE_SONG and "SONG" or "PTRN"
    local clockText = settings.clock == CLOCK_EXTERNAL and "EXT" or tostring(settings.tempo)
    drawTinyText(2, 7, "P" .. string.format("%02d", selectedPattern), 15)
    drawTinyText(32, 7, modeText, 8)
    drawTinyText(74, 7, "R" .. rowHex(playRow), running and 15 or 7)
    if queuedPattern > 0 then
        drawTinyText(108, 7, ">P" .. string.format("%02d", queuedPattern), 13)
    end
    drawTinyText(254, 7, (running and "RUN " or "STOP ") .. clockText, running and 15 or 7, "right")
    drawLine(0, 9, 255, 9, 3)

    local columnWidth = 58
    for track = 1, TRACK_COUNT do
        local left = 22 + (track - 1) * columnWidth
        drawTinyText(left + 3, 14, (mutes[track] and "M" or "T") .. tostring(track), mutes[track] and 5 or 10)
        drawLine(left, 10, left, 58, 2)
    end
    drawLine(254, 10, 254, 58, 2)

    local firstRow = clamp(cursorRow - 1, 1, ROW_COUNT - 3)
    for visible = 1, 4 do
        local row = firstRow + visible - 1
        local baseline = 23 + (visible - 1) * 11
        local top = baseline - 8
        if running and row == playRow then
            drawRectangle(0, top, 2, baseline + 1, 15)
        end
        drawTinyText(4, baseline, rowHex(row), row == cursorRow and 15 or 7)
        for track = 1, TRACK_COUNT do
            local left = 22 + (track - 1) * columnWidth
            local index = cellIndex(selectedPattern, row, track)
            local selected = row == cursorRow and track == cursorTrack
            if selected then drawBox(left + 1, top, left + columnWidth - 2, baseline + 1, 15) end
            drawTinyText(left + 4, baseline, noteText(notes[index]), selected and 15 or 9)
            local marks = ""
            if probabilities[index] < 100 then marks = tostring(probabilities[index]) .. "%" end
            if ratchets[index] > 1 then
                marks = marks .. (marks == "" and "" or " ") .. "x" .. tostring(ratchets[index])
            end
            if marks ~= "" then drawTinyText(left + 24, baseline, marks, selected and 13 or 6) end
        end
    end
    local hint = emptySongWarning and "EMPTY ORDER USES P01" or "E1 ROW  E2 TRACK/PUSH  HOLD MENU"
    drawMessageOrHint(hint)
end

local function drawCell()
    drawHeader(
        "CELL P" .. string.format("%02d", selectedPattern)
            .. " R" .. rowHex(cursorRow) .. " T" .. tostring(cursorTrack)
    )
    local labels = { "NOTE", "VELOCITY", "PROB", "RATCHET" }
    local values = {
        noteText(cellWorking[1]),
        hexByte(cellWorking[2]),
        tostring(cellWorking[3]) .. "%",
        "x" .. tostring(cellWorking[4]),
    }
    for index = 1, 4 do
        local baseline = 20 + (index - 1) * 11
        local selected = index == cellField
        if selected then drawRectangle(0, baseline - 8, 255, baseline + 1, 12) end
        drawTinyText(5, baseline, labels[index], selected and 0 or 7)
        drawTinyText(250, baseline, values[index], selected and 0 or 15, "right")
    end
    local pitchOutput = (cursorTrack - 1) * 2 + 1
    local telemetry = string.format("P %.2fV  G %.1fV", outputs[pitchOutput], outputs[pitchOutput + 1])
    drawMessageOrHint(telemetry .. "  TURN/HOLD+TURN")
end

local function fourRowWindow(cursor, count)
    return clamp(cursor - 1, 1, count - 3)
end

local function drawSong()
    drawHeader("SONG ORDER")
    local first = fourRowWindow(songCursor, SONG_SLOT_COUNT)
    for visible = 1, 4 do
        local slot = first + visible - 1
        local baseline = 20 + (visible - 1) * 11
        local selected = slot == songCursor
        local value = selected and songWorking or song[slot]
        if selected then drawRectangle(0, baseline - 8, 255, baseline + 1, 11) end
        if running and settings.mode == MODE_SONG and slot == songSlot then
            drawRectangle(0, baseline - 8, 2, baseline + 1, 15)
        end
        drawTinyText(6, baseline, "S" .. string.format("%02d", slot), selected and 0 or 8)
        drawTinyText(250, baseline, value == 0 and "END" or "P" .. string.format("%02d", value), selected and 0 or 15, "right")
    end
    drawMessageOrHint("E1 SLOT  E2 PATTERN/END  PUSH BACK")
end

local SETTING_LABELS = {
    "CLOCK", "TEMPO", "ROWS/BEAT", "GATE", "SWING", "TRANSPOSE", "MODE", "SEED"
}

local function settingText(index, value)
    if index == SETTING_CLOCK then return value == CLOCK_INTERNAL and "INTERNAL" or "EXTERNAL" end
    if index == SETTING_TEMPO then return tostring(value) .. " BPM" end
    if index == SETTING_ROWS_PER_BEAT then return tostring(value) end
    if index == SETTING_GATE then return tostring(value) .. "%" end
    if index == SETTING_SWING then return tostring(value) .. "%" end
    if index == SETTING_TRANSPOSE then return string.format("%+d ST", value) end
    if index == SETTING_MODE then return value == MODE_PATTERN and "PATTERN" or "SONG" end
    return tostring(value)
end

local function drawSettings()
    drawHeader("SETTINGS")
    local first = fourRowWindow(settingCursor, SETTING_COUNT)
    for visible = 1, 4 do
        local index = first + visible - 1
        local baseline = 20 + (visible - 1) * 11
        local selected = index == settingCursor
        local value = selected and settingWorking or settingValue(index)
        if selected then drawRectangle(0, baseline - 8, 255, baseline + 1, 11) end
        drawTinyText(5, baseline, SETTING_LABELS[index], selected and 0 or 8)
        drawTinyText(250, baseline, settingText(index, value), selected and 0 or 15, "right")
    end
    drawMessageOrHint("E1 ITEM  E2 VALUE  PUSH BACK")
end

local COMMAND_LABELS = {
    "COPY CELL", "PASTE CELL", "CLEAR CELL", "CLEAR ROW", "CLONE PATTERN",
    "TOGGLE MUTE", "SONG", "SETTINGS", "UNDO", "HELP"
}

local function commandEnabled(index)
    if index == COMMAND_PASTE then return copyBuffer ~= nil, "COPY FIRST" end
    if index == COMMAND_UNDO then return undoRecord ~= nil, "EMPTY" end
    return true, ""
end

local function drawCommands()
    drawHeader("COMMANDS")
    local first = fourRowWindow(commandCursor, COMMAND_HELP)
    for visible = 1, 4 do
        local index = first + visible - 1
        local baseline = 20 + (visible - 1) * 11
        local selected = index == commandCursor
        local enabled, reason = commandEnabled(index)
        if selected then drawRectangle(0, baseline - 8, 255, baseline + 1, enabled and 11 or 4) end
        drawTinyText(5, baseline, COMMAND_LABELS[index], selected and 0 or (enabled and 9 or 4))
        if not enabled then drawTinyText(250, baseline, reason, selected and 0 or 4, "right") end
    end
    drawMessageOrHint("E1 MOVE  PUSH SELECT  HOLD CLOSE")
end

local function drawConfirm()
    drawHeader("CONFIRM")
    local target
    if confirmKind == CONFIRM_CLEAR_ROW then
        target = "CLEAR ROW " .. rowHex(cursorRow) .. "?"
    else
        target = "CLONE P" .. string.format("%02d", selectedPattern)
            .. " > P" .. string.format("%02d", cloneDestination) .. "?"
    end
    drawTinyText(128, 25, target, 15, "centre")
    if not confirmYes then drawRectangle(44, 34, 116, 50, 12) end
    if confirmYes then drawRectangle(140, 34, 212, 50, 12) end
    drawText(80, 47, "NO", not confirmYes and 0 or 8, "centre")
    drawText(176, 47, "YES", confirmYes and 0 or 8, "centre")
    drawMessageOrHint(confirmKind == CONFIRM_CLONE_PATTERN
        and "E1 NO/YES  E2 DEST  PUSH APPLY" or "TURN NO/YES  PUSH APPLY")
end

local HELP_LINES = {
    {
        "GRID", "E1: MOVE ROW", "E2: MOVE TRACK", "PUSH E2: EDIT CELL",
        "HOLD E2: COMMANDS"
    },
    {
        "CELL", "E1: SELECT FIELD", "E2: FINE VALUE", "HOLD+TURN: COARSE",
        "PUSH E2: SAVE/BACK"
    },
    {
        "TRANSPORT", "POT1 PATTERN", "POT2 TEMPO", "POT3 SWING",
        "PUSH POT3 RUN/STOP"
    },
}

local function drawHelp()
    drawHeader("HELP " .. tostring(helpPage) .. "/3")
    local lines = HELP_LINES[helpPage]
    for index = 1, 5 do
        drawTinyText(8, 18 + (index - 1) * 9, lines[index], index == 1 and 15 or 8)
    end
    drawMessageOrHint("E1 PAGE  PUSH E2 BACK")
end

local function drawCurrentView()
    if view == VIEW_GRID then drawGrid()
    elseif view == VIEW_CELL then drawCell()
    elseif view == VIEW_SONG then drawSong()
    elseif view == VIEW_SETTINGS then drawSettings()
    elseif view == VIEW_HELP then drawHelp()
    elseif view == VIEW_COMMANDS then drawCommands()
    elseif view == VIEW_CONFIRM then drawConfirm()
    else drawGrid() end
end

return {
    name = "Micro Tracker",
    author = "Fredi Bach",

    init = function(self)
        restoreState(self.state)
        resetVolatileState()
        return {
            inputs = {
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/8
                kTrigger, -- Type: Trigger, Synced: true, Division: 1 bar
                kCV,      -- Type: Manual / DC
            },
            inputNames = { "Clock", "Reset", "Transpose CV" },
            outputs = {
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
            },
            outputNames = {
                "T1 Pitch", "T1 Gate", "T2 Pitch", "T2 Gate",
                "T3 Pitch", "T3 Gate", "T4 Pitch", "T4 Gate",
            },
            parameters = {},
        }
    end,

    trigger = function(self, input)
        if input == 1 then
            pendingExternalClock = true
            pendingExternalClockTime = currentTime
        elseif input == 2 then
            pendingReset = true
        end
    end,

    step = function(self, dt, inputs)
        processTransport(dt, inputs)
        return outputs
    end,

    ui = function(self)
        return true
    end,

    setupUi = function(self)
        return {
            (selectedPattern - 1) / (PATTERN_COUNT - 1),
            (settings.tempo - 30) / 270,
            settings.swing / 60,
        }
    end,

    pot1Turn = function(self, value) pot1Turn(value) end,
    pot2Turn = function(self, value) pot2Turn(value) end,
    pot3Turn = function(self, value) pot3Turn(value) end,
    encoder1Turn = function(self, delta) encoder1Turn(delta) end,
    encoder2Turn = function(self, delta) encoder2Turn(delta) end,
    encoder2Push = function(self) encoder2Push() end,
    encoder2Release = function(self) encoder2Release() end,
    pot3Push = function(self) pot3Push() end,
    pot3Release = function(self) end,

    draw = function(self)
        drawCurrentView()
        return true
    end,

    serialise = function(self)
        return serialisedState()
    end,
}
