-- Deja-Vu
--[[
Probabilistic note memory processor. Remembers past notes and randomly 
replaces incoming notes with memories. Creates melodic callbacks and 
controlled variation. Memory size and probability are CV controllable.
]]

--------------------------------------------------------------------------------
-- Configuration Constants
--------------------------------------------------------------------------------

local MAX_MEMORY = 32          -- Maximum notes in buffer
local MIN_MEMORY = 2           -- Minimum notes in buffer
local DEFAULT_MEMORY = 8       -- Default memory size
local DEFAULT_PROBABILITY = 25 -- Default probability (%)

--------------------------------------------------------------------------------
-- Local State
--------------------------------------------------------------------------------

local noteBuffer = {}          -- Circular buffer for note storage
local bufferIndex = 0          -- Current write position in buffer
local bufferCount = 0          -- Number of notes currently stored
local currentOutput = 0        -- Current output voltage
local lastTriggered = false    -- Track if we just had a deja-vu moment
local cachedPitch = 0          -- Cached pitch input (updated in step)
local cachedMemoryCv = 0       -- Cached memory CV input
local cachedProbCv = 0         -- Cached probability CV input

--------------------------------------------------------------------------------
-- Display Constants
--------------------------------------------------------------------------------

local DISPLAY_CENTRE_X = 128
local DISPLAY_CENTRE_Y = 30
local DISPLAY_RADIUS_X = 62
local DISPLAY_RADIUS_Y = 15
local DISPLAY_WRITE_X = 66
local DISPLAY_WRITE_Y = 30
local DISPLAY_READ_X = 190
local DISPLAY_READ_Y = 30
local DISPLAY_INPUT_X = 22
local DISPLAY_OUTPUT_X = 244
local DISPLAY_RECORD_TIME = 0.12
local DISPLAY_SHIFT_TIME = 0.18
local DISPLAY_OUTPUT_TIME = 0.30
local DISPLAY_FLASH_TIME = 0.45
local NOTE_NAMES = {
    "C", "C#", "D", "D#", "E", "F",
    "F#", "G", "G#", "A", "A#", "B"
}

--------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------

--- Clamps a value between min and max
-- @param value number The value to clamp
-- @param min number Minimum bound
-- @param max number Maximum bound
-- @return number The clamped value
local function clamp(value, min, max)
    if value < min then return min end
    if value > max then return max end
    return value
end

--- Gets a random note from the buffer
-- @param maxIndex number Maximum index to consider (based on effective memory size)
-- @return number|nil The randomly selected note voltage, or nil if buffer empty
local function getRandomNote(maxIndex)
    if bufferCount == 0 then
        return nil, 0
    end
    
    -- Limit to actual stored notes and effective memory size
    local availableNotes = math.min(bufferCount, maxIndex)
    if availableNotes == 0 then
        return nil, 0
    end
    
    -- Select random index from available notes
    local randomIndex = math.random(1, availableNotes)
    
    -- Calculate actual buffer position (working backwards from current position)
    local actualIndex = ((bufferIndex - randomIndex) % MAX_MEMORY) + 1
    
    return noteBuffer[actualIndex], randomIndex
end

--- Adds a note to the circular buffer
-- @param voltage number The V/Oct voltage to store
local function addNoteToBuffer(voltage)
    bufferIndex = (bufferIndex % MAX_MEMORY) + 1
    noteBuffer[bufferIndex] = voltage
    if bufferCount < MAX_MEMORY then
        bufferCount = bufferCount + 1
    end
end

--- Calculates effective memory size with CV modulation
-- @param self table The script's self table
-- @param cvInput number The CV input voltage
-- @return number The effective memory size (integer)
local function getEffectiveMemorySize(self, cvInput)
    local baseSize = self.parameters[1]
    local cvAmount = self.parameters[3] / 100  -- Convert from percentage
    
    -- CV scales ±10 notes per volt (when CV amount is 100%)
    local cvOffset = cvInput * 10 * cvAmount
    local effectiveSize = math.floor(baseSize + cvOffset + 0.5)
    
    return clamp(effectiveSize, MIN_MEMORY, MAX_MEMORY)
end

--- Calculates effective probability with CV modulation
-- @param self table The script's self table
-- @param cvInput number The CV input voltage
-- @return number The effective probability (0-100)
local function getEffectiveProbability(self, cvInput)
    local baseProbability = self.parameters[2]
    local cvAmount = self.parameters[4] / 100  -- Convert from percentage
    
    -- CV scales ±20% per volt (when CV amount is 100%)
    local cvOffset = cvInput * 20 * cvAmount
    local effectiveProbability = baseProbability + cvOffset
    
    return clamp(effectiveProbability, 0, 100)
end

--- Converts a V/Oct voltage to a compact note name, treating 0V as C4.
-- @param voltage number Pitch voltage
-- @return string Note name and octave
local function voltageToNoteName(voltage)
    local midiNote = math.floor(60 + voltage * 12 + 0.5)
    local pitchClass = midiNote % 12
    if pitchClass < 0 then pitchClass = pitchClass + 12 end
    local octave = math.floor(midiNote / 12) - 1
    return NOTE_NAMES[pitchClass + 1] .. octave
end

--- Returns the position of one logical memory slot on the tape loop.
-- Slot one sits just beyond the write head so new notes visibly join the loop.
-- @param slot number One-based slot index
-- @param slotCount number Number of visible slots
-- @return number, number Display x and y
local function getDisplaySlotPosition(slot, slotCount)
    local progress = slot / math.max(1, slotCount)
    local angle = math.pi + progress * math.pi * 2
    return DISPLAY_CENTRE_X + math.cos(angle) * DISPLAY_RADIUS_X,
        DISPLAY_CENTRE_Y + math.sin(angle) * DISPLAY_RADIUS_Y
end

local function lerp(from, to, amount)
    return from + (to - from) * amount
end

local function getStoredNote(logicalAge)
    if logicalAge < 1 or logicalAge > bufferCount then return nil, 0 end
    local actualIndex = ((bufferIndex - logicalAge) % MAX_MEMORY) + 1
    return noteBuffer[actualIndex], actualIndex
end

--------------------------------------------------------------------------------
-- Main Script Table
--------------------------------------------------------------------------------

return {
    name = 'Deja-Vu'
    , author = 'Claude'
    
    ------------------------------------------------------------------------
    -- Initialization
    ------------------------------------------------------------------------
    , init = function(self)
        -- Initialize the note buffer
        for i = 1, MAX_MEMORY do
            noteBuffer[i] = 0
        end
        bufferIndex = 0
        bufferCount = 0
        currentOutput = 0
        lastTriggered = false

        -- Fixed display state is written by step()/gate() and read by draw().
        self.display_time = 0
        self.display_memory_size = DEFAULT_MEMORY
        self.display_probability = DEFAULT_PROBABILITY
        self.display_event_started = -1
        self.display_event_input = 0
        self.display_event_output = 0
        self.display_event_memory_size = DEFAULT_MEMORY
        self.display_recall_slot = 0
        self.display_gate_high = false
        
        -- Seed random number generator
        math.randomseed(os.time())
        
        return {
            -- Input 1: Pitch CV (V/Oct)
            -- Input 2: Gate (triggers note processing)
            -- Input 3: Memory Size CV
            -- Input 4: Probability CV
            inputs = {
                kCV,   -- Type: Note Sequencer (V/Oct), Synced: true, Division: 1/4
                kGate, -- Type: Gate, Synced: true, Division: 1/4
                kCV,   -- Type: Sine LFO, Synced: true, Division: 2 bars
                kCV,   -- Type: Triangle LFO, Synced: true, Division: 1 bar
            }
            , inputNames = { 
                "Pitch In", 
                "Gate In", 
                "Memory CV", 
                "Prob CV" 
            }
            
            -- Output 1: Processed Pitch CV (linear for smooth output)
            -- Output 2: Gate pass-through
            , outputs = {
                kLinear,  -- Type: Synth Note
                kStepped, -- Type: Synth Trigger
            }
            , outputNames = { 
                "Pitch Out", 
                "Gate Out" 
            }
            
            -- Algorithm parameters
            , parameters = {
                -- Memory Size: 2-32 notes
                { "Memory Size", MIN_MEMORY, MAX_MEMORY, DEFAULT_MEMORY, kNone }
                -- Probability: 0-100%
                , { "Probability", 0, 100, DEFAULT_PROBABILITY, kPercent }
                -- Memory CV Amount: -100% to +100%
                , { "Mem CV Amt", -100, 100, 0, kPercent }
                -- Probability CV Amount: -100% to +100%
                , { "Prob CV Amt", -100, 100, 0, kPercent }
            }
        }
    end
    
    ------------------------------------------------------------------------
    -- Gate Handler (called on gate rising/falling edge)
    ------------------------------------------------------------------------
    , gate = function(self, input, rising)
        if input ~= 2 then return {} end  -- Only respond to Gate input (input 2)
        
        if rising then
            -- Gate just opened - process the incoming note
            -- Use cached values from the step function
            local pitchIn = cachedPitch
            
            local memorySize = getEffectiveMemorySize(self, cachedMemoryCv)
            local probability = getEffectiveProbability(self, cachedProbCv)
            
            -- Decide whether to trigger deja-vu
            local roll = math.random(100)
            local recallSlot = 0
            
            if roll <= probability and bufferCount > 0 then
                -- Deja-vu triggered! Get a random past note
                local pastNote
                pastNote, recallSlot = getRandomNote(memorySize)
                if pastNote then
                    currentOutput = pastNote
                    lastTriggered = true
                else
                    currentOutput = pitchIn
                    lastTriggered = false
                end
            else
                -- No deja-vu, pass through the incoming note
                currentOutput = pitchIn
                lastTriggered = false
            end
            
            -- Always add the incoming note to memory (not the output)
            -- This ensures memory represents what was played, not what was output
            addNoteToBuffer(pitchIn)

            self.display_event_started = self.display_time
            self.display_event_input = pitchIn
            self.display_event_output = currentOutput
            self.display_event_memory_size = memorySize
            self.display_recall_slot = recallSlot
            self.display_gate_high = true
            
            -- Return gate high
            return { currentOutput, 5.0 }
        else
            -- Gate closed
            self.display_gate_high = false
            return { [2] = 0.0 }  -- Only update gate output
        end
    end
    
    ------------------------------------------------------------------------
    -- Step Function (called every 1ms)
    ------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        -- Cache input values for use by gate function
        -- inputs[1] = Pitch CV, inputs[2] = Gate (handled separately)
        -- inputs[3] = Memory CV, inputs[4] = Probability CV
        cachedPitch = inputs[1] or 0
        cachedMemoryCv = inputs[3] or 0
        cachedProbCv = inputs[4] or 0

        self.display_time = self.display_time + dt
        local displayAlpha = clamp(dt * 10, 0, 1)
        local memoryTarget = getEffectiveMemorySize(self, cachedMemoryCv)
        local probabilityTarget = getEffectiveProbability(self, cachedProbCv)
        self.display_memory_size = self.display_memory_size
            + (memoryTarget - self.display_memory_size) * displayAlpha
        self.display_probability = self.display_probability
            + (probabilityTarget - self.display_probability) * displayAlpha
        
        -- Continuously output the current pitch (for sample & hold behavior)
        -- Gate output is handled by the gate function
        return { currentOutput }
    end
    
    ------------------------------------------------------------------------
    -- Custom Display
    ------------------------------------------------------------------------
    , draw = function(self)
        drawStandardParameterLine()

        local memorySize = clamp(
            math.floor(self.display_memory_size + 0.5),
            MIN_MEMORY,
            MAX_MEMORY
        )
        local probability = clamp(self.display_probability, 0, 100)
        local used = math.min(bufferCount, memorySize)
        local eventAge = self.display_time - self.display_event_started
        local eventActive = (
            self.display_event_started >= 0
            and eventAge <= DISPLAY_FLASH_TIME
        )
        local shiftProgress = clamp(
            (eventAge - DISPLAY_RECORD_TIME) / DISPLAY_SHIFT_TIME,
            0,
            1
        )

        -- The tape follows a 24-segment oval around two reels.
        local previousX = DISPLAY_CENTRE_X - DISPLAY_RADIUS_X
        local previousY = DISPLAY_CENTRE_Y
        for segment = 1, 24 do
            local angle = math.pi + segment / 24 * math.pi * 2
            local x = DISPLAY_CENTRE_X
                + math.cos(angle) * DISPLAY_RADIUS_X
            local y = DISPLAY_CENTRE_Y
                + math.sin(angle) * DISPLAY_RADIUS_Y
            drawSmoothLine(previousX, previousY, x, y, 3)
            previousX = x
            previousY = y
        end

        drawCircle(101, DISPLAY_CENTRE_Y, 8, 5)
        drawCircle(101, DISPLAY_CENTRE_Y, 2, 7)
        drawCircle(155, DISPLAY_CENTRE_Y, 8, 5)
        drawCircle(155, DISPLAY_CENTRE_Y, 2, 7)
        drawLine(93, DISPLAY_CENTRE_Y, 109, DISPLAY_CENTRE_Y, 2)
        drawLine(147, DISPLAY_CENTRE_Y, 163, DISPLAY_CENTRE_Y, 2)

        -- Input and output chutes meet the write and read heads.
        drawSmoothLine(
            4,
            DISPLAY_WRITE_Y,
            DISPLAY_WRITE_X,
            DISPLAY_WRITE_Y,
            eventActive and 8 or 4
        )
        drawSmoothLine(
            DISPLAY_READ_X,
            DISPLAY_READ_Y,
            252,
            DISPLAY_READ_Y,
            self.display_gate_high and 15 or 4
        )
        drawLine(61, 26, DISPLAY_WRITE_X, DISPLAY_WRITE_Y, 10)
        drawLine(61, 34, DISPLAY_WRITE_X, DISPLAY_WRITE_Y, 10)

        -- Probability makes the read head larger and brighter.
        local readRadius = 2 + probability / 100 * 3
        local readShade = math.floor(5 + probability / 10 + 0.5)
        drawSmoothCircle(
            DISPLAY_READ_X,
            DISPLAY_READ_Y,
            readRadius,
            readShade
        )

        -- Find the active pitch range once so bead shade can encode pitch.
        local minimumPitch = nil
        local maximumPitch = nil
        for logicalAge = 1, used do
            local note = getStoredNote(logicalAge)
            if note then
                minimumPitch = minimumPitch
                    and math.min(minimumPitch, note)
                    or note
                maximumPitch = maximumPitch
                    and math.max(maximumPitch, note)
                    or note
            end
        end

        -- Empty slots establish capacity; stored beads move forward after write.
        for logicalAge = 1, memorySize do
            local slotX, slotY = getDisplaySlotPosition(
                logicalAge,
                memorySize
            )
            if logicalAge <= used then
                local note = getStoredNote(logicalAge)
                local beadX = slotX
                local beadY = slotY

                if eventActive and logicalAge > 1 then
                    local fromX, fromY = getDisplaySlotPosition(
                        logicalAge - 1,
                        memorySize
                    )
                    beadX = lerp(fromX, slotX, shiftProgress)
                    beadY = lerp(fromY, slotY, shiftProgress)
                end

                local pitchAmount = 0.5
                if maximumPitch and minimumPitch
                    and maximumPitch > minimumPitch then
                    pitchAmount = (note - minimumPitch)
                        / (maximumPitch - minimumPitch)
                end
                local beadShade = math.floor(6 + pitchAmount * 6 + 0.5)
                if (
                    lastTriggered
                    and eventActive
                    and logicalAge == self.display_recall_slot + 1
                ) then
                    beadShade = 15
                end
                drawSmoothCircle(beadX, beadY, 1.5, beadShade)
            else
                drawSmoothCircle(slotX, slotY, 0.7, 3)
            end
        end

        if eventActive then
            -- The incoming bead first crosses the chute, then joins slot one.
            local inputX = DISPLAY_INPUT_X
            local inputY = DISPLAY_WRITE_Y
            if eventAge < DISPLAY_RECORD_TIME then
                local progress = clamp(
                    eventAge / DISPLAY_RECORD_TIME,
                    0,
                    1
                )
                inputX = lerp(
                    DISPLAY_INPUT_X,
                    DISPLAY_WRITE_X,
                    progress
                )
            else
                local slotX, slotY = getDisplaySlotPosition(1, memorySize)
                inputX = lerp(
                    DISPLAY_WRITE_X,
                    slotX,
                    shiftProgress
                )
                inputY = lerp(
                    DISPLAY_WRITE_Y,
                    slotY,
                    shiftProgress
                )
            end
            drawSmoothCircle(inputX, inputY, 2.2, 14)

            -- A recalled note is copied from its old slot to the read head.
            -- A new note follows the tape from the write head instead.
            local sourceX = DISPLAY_WRITE_X
            local sourceY = DISPLAY_WRITE_Y
            if lastTriggered then
                sourceX, sourceY = getDisplaySlotPosition(
                    self.display_recall_slot,
                    self.display_event_memory_size
                )
            end

            local outputX
            local outputY
            local firstStageEnd = DISPLAY_OUTPUT_TIME * 0.5
            if eventAge < firstStageEnd then
                local progress = clamp(eventAge / firstStageEnd, 0, 1)
                outputX = lerp(sourceX, DISPLAY_READ_X, progress)
                outputY = lerp(sourceY, DISPLAY_READ_Y, progress)
            else
                local progress = clamp(
                    (eventAge - firstStageEnd) / firstStageEnd,
                    0,
                    1
                )
                outputX = lerp(
                    DISPLAY_READ_X,
                    DISPLAY_OUTPUT_X,
                    progress
                )
                outputY = DISPLAY_READ_Y
            end
            drawSmoothCircle(outputX, outputY, 2.2, 15)
        elseif self.display_gate_high then
            drawSmoothCircle(
                DISPLAY_OUTPUT_X,
                DISPLAY_READ_Y,
                2.2,
                15
            )
        end

        if lastTriggered and eventActive then
            local flashShade = math.floor(
                7 + 8 * clamp(1 - eventAge / DISPLAY_FLASH_TIME, 0, 1)
            )
            drawTinyText(128, 14, "DEJA", flashShade, "centre")
        end

        local inputPitch = eventActive
            and self.display_event_input
            or cachedPitch
        drawTinyText(
            4,
            63,
            "IN " .. voltageToNoteName(inputPitch),
            8
        )
        drawTinyText(
            128,
            63,
            used .. "/" .. memorySize,
            10,
            "centre"
        )
        drawTinyText(
            252,
            63,
            voltageToNoteName(currentOutput) .. " OUT",
            self.display_gate_high and 15 or 8,
            "right"
        )

        return true
    end
}
