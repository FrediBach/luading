-- Arpeggio Weaver
--[[
Multiple arpeggios run simultaneously with different patterns and speeds.
An internal LFO (or external CV) weaves between them, creating evolving
melodic patterns. Notes always complete before switching to ensure
musical coherence. Perfect for generative patches.

Inputs:
  1. Clock - Master tempo reference (trigger)
  2. LFO CV - External weaving control (optional, -5V to +5V)
  3. Reset - Reset all arpeggios to start (trigger)

Outputs:
  1. V/Oct - Pitch CV for oscillator
  2. Gate - Gate output for envelope
  3. Trigger - Trigger pulse on each new note
  4. Weave - Internal LFO output (for visualization/external use)
]]

--------------------------------------------------------------------------------
-- CONSTANTS
--------------------------------------------------------------------------------

local NUM_ARPS = 4
local VOLTS_PER_SEMITONE = 1.0 / 12.0
local TRIGGER_DURATION = 0.005  -- 5ms trigger pulse
local MIN_GATE_TIME = 0.010     -- Minimum gate time in seconds

-- Pattern definitions
local PATTERN_NAMES = { "Up", "Down", "Up-Down", "Down-Up", "Random", "As Played" }
local PATTERN_UP = 1
local PATTERN_DOWN = 2
local PATTERN_UP_DOWN = 3
local PATTERN_DOWN_UP = 4
local PATTERN_RANDOM = 5
local PATTERN_AS_PLAYED = 6

-- Scale definitions (semitone offsets from root)
local SCALE_NAMES = { "Major", "Minor", "Dorian", "Penta Maj", "Penta Min", "Blues", "Chromatic" }
local SCALE_INTERVALS = {
    { 0, 2, 4, 5, 7, 9, 11 },           -- Major
    { 0, 2, 3, 5, 7, 8, 10 },           -- Minor (Natural)
    { 0, 2, 3, 5, 7, 9, 10 },           -- Dorian
    { 0, 2, 4, 7, 9 },                  -- Pentatonic Major
    { 0, 3, 5, 7, 10 },                 -- Pentatonic Minor
    { 0, 3, 5, 6, 7, 10 },              -- Blues
    { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 }  -- Chromatic
}

-- LFO shape names
local LFO_SHAPE_NAMES = { "Sine", "Triangle", "Saw Up", "Saw Down", "Square", "Random S&H" }

-- Weave mode names
local WEAVE_MODE_NAMES = { "Smooth", "Stepped", "Probability" }

--------------------------------------------------------------------------------
-- STATE VARIABLES
--------------------------------------------------------------------------------

-- Arpeggio state for each of the 4 arpeggios
local arps = {}
for i = 1, NUM_ARPS do
    arps[i] = {
        position = 1,           -- Current position in note sequence
        direction = 1,          -- 1 = ascending, -1 = descending
        clockCount = 0,         -- Counter for clock division
        lastNote = 0            -- Last played note (semitones from root)
    }
end

-- Global playback state
local currentArp = 1            -- Currently active arpeggio (1-4)
local pendingArp = 1            -- Arpeggio to switch to when gate ends
local switchPending = false     -- Flag: waiting to switch arpeggios

-- Output state
local currentPitch = 0          -- Current V/Oct output
local gateHigh = false          -- Is gate currently high?
local gateTimer = 0             -- Time remaining on current gate
local triggerTimer = 0          -- Time remaining on trigger pulse

-- LFO state
local lfoPhase = 0              -- Internal LFO phase (0-1)
local lfoValue = 0              -- Current LFO output (-1 to 1)
local lastRandomLfo = 0         -- Last S&H random value

-- Random state for pattern randomization
local randomSeed = 12345

--------------------------------------------------------------------------------
-- HELPER FUNCTIONS
--------------------------------------------------------------------------------

--- Simple pseudo-random number generator (deterministic for reproducibility)
local function pseudoRandom()
    randomSeed = (randomSeed * 1103515245 + 12345) % 2147483648
    return randomSeed / 2147483648
end

--- Build the complete note sequence for an arpeggio
-- @param scaleIndex Index into SCALE_INTERVALS
-- @param octaves Number of octaves to span
-- @return Array of semitone offsets from root
local function buildNoteSequence(scaleIndex, octaves)
    local scale = SCALE_INTERVALS[scaleIndex] or SCALE_INTERVALS[1]
    local notes = {}
    
    for oct = 0, octaves - 1 do
        for _, interval in ipairs(scale) do
            table.insert(notes, interval + (oct * 12))
        end
    end
    
    return notes
end

--- Get the next note index based on pattern
-- @param arp Arpeggio state table
-- @param pattern Pattern index (1-6)
-- @param numNotes Total notes in sequence
-- @return New position index
local function advancePattern(arp, pattern, numNotes)
    if numNotes <= 1 then
        return 1
    end
    
    local pos = arp.position
    local dir = arp.direction
    
    if pattern == PATTERN_UP then
        pos = pos + 1
        if pos > numNotes then pos = 1 end
        
    elseif pattern == PATTERN_DOWN then
        pos = pos - 1
        if pos < 1 then pos = numNotes end
        
    elseif pattern == PATTERN_UP_DOWN then
        pos = pos + dir
        if pos >= numNotes then
            pos = numNotes
            dir = -1
        elseif pos <= 1 then
            pos = 1
            dir = 1
        end
        arp.direction = dir
        
    elseif pattern == PATTERN_DOWN_UP then
        pos = pos - dir
        if pos >= numNotes then
            pos = numNotes
            dir = 1
        elseif pos <= 1 then
            pos = 1
            dir = -1
        end
        arp.direction = dir
        
    elseif pattern == PATTERN_RANDOM then
        pos = math.floor(pseudoRandom() * numNotes) + 1
        
    elseif pattern == PATTERN_AS_PLAYED then
        -- Sequential order without direction change
        pos = pos + 1
        if pos > numNotes then pos = 1 end
    end
    
    return pos
end

--- Calculate LFO value based on phase and shape
-- @param phase LFO phase (0-1)
-- @param shape Shape index (1-6)
-- @return LFO value (-1 to 1)
local function calculateLfo(phase, shape)
    if shape == 1 then      -- Sine
        return math.sin(phase * 2 * math.pi)
        
    elseif shape == 2 then  -- Triangle
        if phase < 0.5 then
            return 4 * phase - 1
        else
            return 3 - 4 * phase
        end
        
    elseif shape == 3 then  -- Saw Up
        return 2 * phase - 1
        
    elseif shape == 4 then  -- Saw Down
        return 1 - 2 * phase
        
    elseif shape == 5 then  -- Square
        return phase < 0.5 and 1 or -1
        
    elseif shape == 6 then  -- Random S&H (handled specially in step)
        return lastRandomLfo
    end
    
    return 0
end

--- Map LFO value to arpeggio selection
-- @param lfoVal LFO value (-1 to 1)
-- @param extLfo External LFO CV value
-- @param extMix External LFO mix amount (0-100)
-- @param weaveMode Weave mode (1=Smooth, 2=Stepped, 3=Probability)
-- @return Selected arpeggio index (1-4)
local function selectArpeggio(lfoVal, extLfo, extMix, weaveMode)
    -- Mix internal and external LFO
    local mix = extMix / 100.0
    local extNormalized = math.max(-1, math.min(1, extLfo / 5.0))  -- Normalize ±5V to ±1
    local combined = lfoVal * (1 - mix) + extNormalized * mix
    
    -- Map -1..1 to 1..4
    local normalized = (combined + 1) / 2  -- 0 to 1
    
    if weaveMode == 1 then      -- Smooth (continuous selection)
        return math.floor(normalized * 3.999) + 1
        
    elseif weaveMode == 2 then  -- Stepped (quantized selection)
        local arp = math.floor(normalized * 4) + 1
        return math.min(arp, 4)
        
    elseif weaveMode == 3 then  -- Probability
        -- Weighted random selection based on LFO position
        local weights = { 0.25, 0.25, 0.25, 0.25 }
        local primary = math.floor(normalized * 3.999) + 1
        weights[primary] = weights[primary] + 0.5
        
        -- Normalize weights
        local total = 0
        for i = 1, 4 do total = total + weights[i] end
        for i = 1, 4 do weights[i] = weights[i] / total end
        
        -- Random selection based on weights
        local r = pseudoRandom()
        local cumulative = 0
        for i = 1, 4 do
            cumulative = cumulative + weights[i]
            if r <= cumulative then
                return i
            end
        end
        return 4
    end
    
    return 1
end

--------------------------------------------------------------------------------
-- DISPLAY HELPERS
--------------------------------------------------------------------------------

local DISPLAY_LANE_Y = { 16, 26, 36, 46 }
local DISPLAY_NOTE_LIMIT = 48
local DISPLAY_BEAD_COUNT = 6
local DISPLAY_LFO_HISTORY = 32
local NOTE_NAMES = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" }

local function clamp(value, minimum, maximum)
    if value < minimum then return minimum end
    if value > maximum then return maximum end
    return value
end

local function midiToNoteName(midiNote)
    local note = math.floor(midiNote + 0.5)
    local pitchClass = note % 12
    if pitchClass < 0 then pitchClass = pitchClass + 12 end
    local octave = math.floor(note / 12) - 1
    return NOTE_NAMES[pitchClass + 1] .. octave
end

-- Fill fixed display note buffers without allocating note sequences in draw().
local function updateDisplayNoteCache(self, parameters)
    local scaleIndex = parameters[2]
    local scale = SCALE_INTERVALS[scaleIndex] or SCALE_INTERVALS[1]

    for lane = 1, NUM_ARPS do
        local baseIdx = 8 + (lane - 1) * 4
        local octaves = parameters[baseIdx + 2]
        local count = 0

        for octave = 0, octaves - 1 do
            for _, interval in ipairs(scale) do
                count = count + 1
                if count <= DISPLAY_NOTE_LIMIT then
                    self.display_lane_notes[lane][count] = interval + octave * 12
                end
            end
        end

        self.display_lane_note_counts[lane] = math.min(count, DISPLAY_NOTE_LIMIT)
        self.display_lane_octaves[lane] = octaves
    end

    self.display_cached_scale = scaleIndex
end

local function displayNoteCacheNeedsUpdate(self, parameters)
    if self.display_cached_scale ~= parameters[2] then return true end
    for lane = 1, NUM_ARPS do
        local baseIdx = 8 + (lane - 1) * 4
        if self.display_lane_octaves[lane] ~= parameters[baseIdx + 2] then
            return true
        end
    end
    return false
end

local function pushDisplayOutputBead(self, lane, midiNote)
    self.display_bead_index = (self.display_bead_index % DISPLAY_BEAD_COUNT) + 1
    local bead = self.display_beads[self.display_bead_index]
    bead.started = self.display_time
    bead.lane = lane
    bead.midi = midiNote
end

local function clearDisplayBeads(self)
    for i = 1, DISPLAY_BEAD_COUNT do
        self.display_beads[i].started = -1
    end
end

--------------------------------------------------------------------------------
-- MAIN SCRIPT TABLE
--------------------------------------------------------------------------------

return {
    name = 'Arp Weaver'
    , author = 'Claude / Expert Sleepers'

    -- Luading simulator extension; ignored by Disting NT.
    , luading = {
        parameterPresets = {
            { name = 'Default', values = { 48, 1, 0.5, 1, 0, 2, 50, 1, 1, 2, 0, 2, 2, 1, 0, 3, 3, 2, 12, 5, 4, 3, -12 } }
            , { name = 'Gentle Major', values = { 48, 1, 0.25, 1, 25, 1, 70, 1, 1, 2, 0, 1, 2, 1, 0, 2, 4, 2, 12, 2, 8, 2, -12 } }
            , { name = 'Chaotic Blues', values = { 48, 6, 2, 6, 50, 3, 30, 5, 1, 3, 0, 5, 2, 2, 7, 5, 3, 3, 12, 5, 4, 4, -12 } }
        }
    }
    
    ------------------------------------------------------------------------
    -- INITIALIZATION
    ------------------------------------------------------------------------
    , init = function(self)
        -- Initialize arpeggio states
        for i = 1, NUM_ARPS do
            arps[i] = {
                position = 1,
                direction = 1,
                clockCount = 0,
                lastNote = 0
            }
        end
        
        -- Reset global state
        currentArp = 1
        pendingArp = 1
        switchPending = false
        currentPitch = 0
        gateHigh = false
        gateTimer = 0
        triggerTimer = 0
        lfoPhase = 0
        lfoValue = 0

        -- Display-only animation state. Buffers are fixed-size and reused.
        self.display_time = 0
        self.display_lane_notes = { {}, {}, {}, {} }
        self.display_lane_note_counts = { 0, 0, 0, 0 }
        self.display_lane_octaves = { 0, 0, 0, 0 }
        self.display_lane_from = { 1, 1, 1, 1 }
        self.display_lane_to = { 1, 1, 1, 1 }
        self.display_lane_started = { 0, 0, 0, 0 }
        self.display_cached_scale = nil
        self.display_shuttle_position = 2.5
        self.display_shuttle_target = 2.5
        self.display_pending_started = -1
        self.display_current_midi = 48
        self.display_bead_index = 0
        self.display_beads = {}
        for i = 1, DISPLAY_BEAD_COUNT do
            self.display_beads[i] = { started = -1, lane = 1, midi = 48 }
        end
        self.display_lfo_history = {}
        for i = 1, DISPLAY_LFO_HISTORY do
            self.display_lfo_history[i] = 0
        end
        self.display_lfo_history_index = 0
        self.display_lfo_history_count = 0
        self.display_lfo_history_timer = 0
        
        return {
            -- Input configuration
            inputs = {
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/8
                kCV,      -- Type: Sine LFO, Synced: true, Division: 1 bar
                kTrigger, -- Type: Trigger, Synced: true, Division: 2 bars
            }
            , inputNames = { "Clock", "LFO CV", "Reset" }
            
            -- Output configuration (V/Oct and Weave are linear for smooth CV)
            , outputs = {
                kLinear,  -- Type: Synth Note
                kStepped, -- Type: Synth Trigger
                kStepped, -- Type: Hi-hat Trigger
                kLinear,  -- Type: Off
            }
            , outputNames = { "V/Oct", "Gate", "Trigger", "Weave" }
            
            -- Parameters
            , parameters = {
                -- === GLOBAL PARAMETERS ===
                { "Root Note", 0, 127, 48, kMIDINote }           -- 1: C3 default
                , { "Scale", SCALE_NAMES, 1 }                    -- 2: Major
                , { "LFO Rate", 1, 500, 50, kHz, kBy100 }        -- 3: 0.50 Hz
                , { "LFO Shape", LFO_SHAPE_NAMES, 1 }            -- 4: Sine
                , { "Ext LFO Mix", 0, 100, 0, kPercent }         -- 5: 0%
                , { "Weave Mode", WEAVE_MODE_NAMES, 2 }          -- 6: Stepped
                , { "Gate Length", 10, 100, 50, kPercent }       -- 7: 50%
                
                -- === ARPEGGIO 1 ===
                , { "Arp1 Pattern", PATTERN_NAMES, 1 }           -- 8: Up
                , { "Arp1 Divider", 1, 16, 1 }                   -- 9: /1
                , { "Arp1 Octaves", 1, 4, 2 }                    -- 10: 2 octaves
                , { "Arp1 Offset", -24, 24, 0, kSemitones }      -- 11: 0 semitones
                
                -- === ARPEGGIO 2 ===
                , { "Arp2 Pattern", PATTERN_NAMES, 2 }           -- 12: Down
                , { "Arp2 Divider", 1, 16, 2 }                   -- 13: /2
                , { "Arp2 Octaves", 1, 4, 1 }                    -- 14: 1 octave
                , { "Arp2 Offset", -24, 24, 0, kSemitones }      -- 15: 0 semitones
                
                -- === ARPEGGIO 3 ===
                , { "Arp3 Pattern", PATTERN_NAMES, 3 }           -- 16: Up-Down
                , { "Arp3 Divider", 1, 16, 3 }                   -- 17: /3
                , { "Arp3 Octaves", 1, 4, 2 }                    -- 18: 2 octaves
                , { "Arp3 Offset", -24, 24, 12, kSemitones }     -- 19: +12 semitones
                
                -- === ARPEGGIO 4 ===
                , { "Arp4 Pattern", PATTERN_NAMES, 5 }           -- 20: Random
                , { "Arp4 Divider", 1, 16, 4 }                   -- 21: /4
                , { "Arp4 Octaves", 1, 4, 3 }                    -- 22: 3 octaves
                , { "Arp4 Offset", -24, 24, -12, kSemitones }    -- 23: -12 semitones
            }
        }
    end
    
    ------------------------------------------------------------------------
    -- CLOCK TRIGGER HANDLER
    ------------------------------------------------------------------------
    , trigger = function(self, input)
        if input == 1 then  -- Clock input
            local p = self.parameters
            local gateLen = p[7] / 100.0  -- Gate length as fraction
            
            -- Process each arpeggio's clock divider
            for i = 1, NUM_ARPS do
                local arp = arps[i]
                local previousPosition = arp.position
                local baseIdx = 8 + (i - 1) * 4  -- Parameter base index for this arp
                local divider = p[baseIdx + 1]   -- Arp divider parameter
                
                arp.clockCount = arp.clockCount + 1
                
                if arp.clockCount >= divider then
                    arp.clockCount = 0
                    
                    -- Advance this arpeggio's pattern
                    local pattern = p[baseIdx]       -- Pattern
                    local octaves = p[baseIdx + 2]   -- Octaves
                    local scale = p[2]               -- Global scale
                    
                    local notes = buildNoteSequence(scale, octaves)
                    arp.position = advancePattern(arp, pattern, #notes)
                    arp.lastNote = notes[arp.position] or 0

                    if arp.position ~= previousPosition then
                        self.display_lane_from[i] = previousPosition
                        self.display_lane_to[i] = arp.position
                        self.display_lane_started[i] = self.display_time
                    end
                end
            end
            
            -- Check if we can switch arpeggios now (gate is low)
            if switchPending and not gateHigh then
                currentArp = pendingArp
                switchPending = false
                self.display_pending_started = -1
            end
            
            -- Get the currently active arpeggio's note
            local activeArp = arps[currentArp]
            local baseIdx = 8 + (currentArp - 1) * 4
            local offset = p[baseIdx + 3]  -- Offset in semitones
            local rootNote = p[1]          -- Root note (MIDI)
            
            -- Calculate pitch: (root + arp note + offset) converted to V/Oct
            -- MIDI note 0 = C-1, MIDI note 60 = C4 = 0V in most systems
            -- We'll use MIDI note 60 as 0V reference
            local totalSemitones = (rootNote - 60) + activeArp.lastNote + offset
            currentPitch = totalSemitones * VOLTS_PER_SEMITONE

            self.display_current_midi = rootNote + activeArp.lastNote + offset
            pushDisplayOutputBead(self, currentArp, self.display_current_midi)
            
            -- Start gate and trigger
            gateHigh = true
            gateTimer = gateLen * 0.5  -- We'll calculate actual time based on expected clock interval
            triggerTimer = TRIGGER_DURATION
            
            return { currentPitch, 5.0, 5.0 }  -- V/Oct, Gate high, Trigger high
        
        elseif input == 3 then  -- Reset input
            -- Reset all arpeggios to start
            for i = 1, NUM_ARPS do
                arps[i].position = 1
                arps[i].direction = 1
                arps[i].clockCount = 0
            end
            currentArp = 1
            pendingArp = 1
            switchPending = false
            lfoPhase = 0

            for i = 1, NUM_ARPS do
                self.display_lane_from[i] = 1
                self.display_lane_to[i] = 1
                self.display_lane_started[i] = self.display_time
            end
            self.display_shuttle_position = 1
            self.display_shuttle_target = 1
            self.display_pending_started = -1
            self.display_current_midi = self.parameters[1]
            self.display_lfo_history_index = 0
            self.display_lfo_history_count = 0
            self.display_lfo_history_timer = 0
            clearDisplayBeads(self)
        end
        
        return {}
    end
    
    ------------------------------------------------------------------------
    -- STEP FUNCTION (called every 1ms)
    ------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        local p = self.parameters
        local outputs = {}

        self.display_time = self.display_time + dt
        if displayNoteCacheNeedsUpdate(self, p) then
            updateDisplayNoteCache(self, p)
        end
        
        -- Update internal LFO
        local lfoRate = p[3] / 100.0  -- Hz (parameter is scaled by 100)
        local lfoShape = p[4]
        local oldPhase = lfoPhase
        
        lfoPhase = lfoPhase + dt * lfoRate
        if lfoPhase >= 1.0 then
            lfoPhase = lfoPhase - 1.0
            -- Update S&H random on phase wrap
            if lfoShape == 6 then
                lastRandomLfo = pseudoRandom() * 2 - 1
            end
        end
        
        lfoValue = calculateLfo(lfoPhase, lfoShape)
        
        -- Determine which arpeggio the LFO wants to select
        local extLfo = inputs[2] or 0
        local extMix = p[5]
        local weaveMode = p[6]
        local desiredArp = selectArpeggio(lfoValue, extLfo, extMix, weaveMode)

        -- Continuous display position uses the same internal/external mix but
        -- does not call the probabilistic selector or consume random state.
        local extNormalized = clamp(extLfo / 5.0, -1, 1)
        local mix = extMix / 100.0
        local combinedLfo = lfoValue * (1 - mix) + extNormalized * mix
        self.display_shuttle_target = 1 + ((combinedLfo + 1) / 2) * 3
        local shuttleAlpha = clamp(dt * 14.0, 0, 1)
        self.display_shuttle_position = self.display_shuttle_position
            + (self.display_shuttle_target - self.display_shuttle_position) * shuttleAlpha

        self.display_lfo_history_timer = self.display_lfo_history_timer + dt
        if self.display_lfo_history_timer >= (1.0 / 30.0) then
            self.display_lfo_history_timer = self.display_lfo_history_timer % (1.0 / 30.0)
            self.display_lfo_history_index = (
                self.display_lfo_history_index % DISPLAY_LFO_HISTORY
            ) + 1
            self.display_lfo_history[self.display_lfo_history_index] = lfoValue
            self.display_lfo_history_count = math.min(
                self.display_lfo_history_count + 1,
                DISPLAY_LFO_HISTORY
            )
        end
        
        -- Only switch arpeggios when gate is low (note has completed)
        if desiredArp ~= currentArp then
            if not gateHigh then
                currentArp = desiredArp
                switchPending = false
                self.display_pending_started = -1
            else
                -- Mark that we want to switch when the note ends
                if not switchPending or pendingArp ~= desiredArp then
                    self.display_pending_started = self.display_time
                end
                pendingArp = desiredArp
                switchPending = true
            end
        end
        
        -- Update gate timer
        if gateTimer > 0 then
            gateTimer = gateTimer - dt
            if gateTimer <= 0 then
                gateHigh = false
                outputs[2] = 0.0  -- Gate low
                
                -- If switch was pending, do it now
                if switchPending then
                    currentArp = pendingArp
                    switchPending = false
                    self.display_pending_started = -1
                end
            end
        end
        
        -- Update trigger timer
        if triggerTimer > 0 then
            triggerTimer = triggerTimer - dt
            if triggerTimer <= 0 then
                outputs[3] = 0.0  -- Trigger low
            end
        end
        
        -- Output LFO value (scaled to ±5V)
        outputs[4] = lfoValue * 5.0
        
        return outputs
    end
    
    ------------------------------------------------------------------------
    -- DISPLAY FUNCTION
    ------------------------------------------------------------------------
    , draw = function(self)
        local p = self.parameters
        drawStandardParameterLine()

        local laneStartX = 30
        local laneEndX = 166
        local shuttleX = 178
        local outputHubX = 193
        local outputY = 31

        -- Four arpeggio threads. Each lane shows a bounded sample of its note
        -- sequence, with pitch encoded vertically and position horizontally.
        for lane = 1, NUM_ARPS do
            local y = DISPLAY_LANE_Y[lane]
            local isActive = currentArp == lane
            local baseIdx = 8 + (lane - 1) * 4
            local divider = p[baseIdx + 1]
            local labelShade = isActive and 15 or 6
            local threadShade = isActive and 8 or 3
            local noteCount = self.display_lane_note_counts[lane] or 0

            drawTinyText(4, y + 2, tostring(lane), labelShade)
            drawTinyText(14, y + 2, "/" .. divider, labelShade)
            drawSmoothLine(laneStartX - 3, y, laneEndX + 5, y, isActive and 5 or 2)

            local visibleNotes = math.min(noteCount, 16)
            local previousX = nil
            local previousY = nil
            local maxNote = noteCount > 0 and self.display_lane_notes[lane][noteCount] or 1
            if maxNote <= 0 then maxNote = 1 end

            for slot = 1, visibleNotes do
                local noteIndex
                local x
                if visibleNotes == 1 then
                    noteIndex = 1
                    x = (laneStartX + laneEndX) / 2
                else
                    noteIndex = math.floor(
                        ((slot - 1) / (visibleNotes - 1)) * (noteCount - 1) + 1.5
                    )
                    x = laneStartX
                        + ((slot - 1) / (visibleNotes - 1)) * (laneEndX - laneStartX)
                end

                local note = self.display_lane_notes[lane][noteIndex] or 0
                local noteY = y + 3 - (note / maxNote) * 6
                if previousX then
                    drawSmoothLine(previousX, previousY, x, noteY, threadShade)
                end
                drawSmoothCircle(x, noteY, 1, threadShade + 1)
                previousX = x
                previousY = noteY
            end

            if noteCount > 0 then
                local positionElapsed = self.display_time - self.display_lane_started[lane]
                local positionProgress = clamp(positionElapsed / 0.10, 0, 1)
                local positionEased = 1 - (1 - positionProgress) * (1 - positionProgress)
                local displayPosition = self.display_lane_from[lane]
                    + (self.display_lane_to[lane] - self.display_lane_from[lane]) * positionEased
                displayPosition = clamp(displayPosition, 1, noteCount)

                local markerX = laneStartX
                if noteCount > 1 then
                    markerX = laneStartX
                        + ((displayPosition - 1) / (noteCount - 1)) * (laneEndX - laneStartX)
                end

                local fromIndex = clamp(math.floor(displayPosition), 1, noteCount)
                local toIndex = clamp(fromIndex + 1, 1, noteCount)
                local noteFraction = displayPosition - math.floor(displayPosition)
                local fromNote = self.display_lane_notes[lane][fromIndex] or 0
                local toNote = self.display_lane_notes[lane][toIndex] or fromNote
                local markerNote = fromNote + (toNote - fromNote) * noteFraction
                local markerY = y + 3 - (markerNote / maxNote) * 6

                drawSmoothLine(markerX, markerY, shuttleX - 5, y, isActive and 7 or 3)
                drawSmoothCircle(markerX, markerY, isActive and 2.4 or 1.6, isActive and 15 or 8)
            end
        end

        -- The vertical shuttle separates the continuous weave request from the
        -- lane that is actually sounding. A pending switch gets a ghost frame.
        drawLine(shuttleX, 13, shuttleX, 49, 4)
        local requestedY = DISPLAY_LANE_Y[1]
            + (self.display_shuttle_position - 1) * 10
        drawCircle(shuttleX, requestedY, 2, 8)

        if switchPending then
            local pendingY = DISPLAY_LANE_Y[pendingArp]
            local pendingAge = math.max(0, self.display_time - self.display_pending_started)
            local pendingShade = 7 + math.floor((math.sin(pendingAge * 18) + 1) * 1.5)
            drawBox(shuttleX - 6, pendingY - 4, shuttleX + 6, pendingY + 4, pendingShade)
        end

        local activeY = DISPLAY_LANE_Y[currentArp]
        drawRectangle(shuttleX - 4, activeY - 3, shuttleX + 4, activeY + 3, 13)
        drawCircle(shuttleX, activeY, 2, 15)

        -- The selected thread converges into one output ribbon.
        drawSmoothLine(shuttleX + 4, activeY, outputHubX, outputY, gateHigh and 12 or 5)
        drawSmoothLine(outputHubX, outputY, 250, outputY, gateHigh and 12 or 5)
        drawSmoothCircle(250, outputY, gateHigh and 2.5 or 1.5, gateHigh and 15 or 7)

        -- New notes travel down the output ribbon. The six-slot queue permits
        -- fast clocks without allocating tables or losing overlapping beads.
        for i = 1, DISPLAY_BEAD_COUNT do
            local bead = self.display_beads[i]
            if bead.started >= 0 then
                local age = self.display_time - bead.started
                local progress = age / 0.28
                if progress >= 0 and progress <= 1 then
                    local beadX
                    local beadY
                    local startY = DISPLAY_LANE_Y[bead.lane]
                    if progress < 0.35 then
                        local firstLeg = progress / 0.35
                        beadX = shuttleX + (outputHubX - shuttleX) * firstLeg
                        beadY = startY + (outputY - startY) * firstLeg
                    else
                        local secondLeg = (progress - 0.35) / 0.65
                        beadX = outputHubX + (250 - outputHubX) * secondLeg
                        beadY = outputY
                    end
                    drawSmoothCircle(beadX, beadY, 2.2, 15 - math.floor(progress * 6))
                end
            end
        end

        -- Compact internal LFO history behind the shuttle.
        local traceLeft = 195
        local traceRight = 249
        local traceCenterY = 46
        drawBox(traceLeft - 2, 40, traceRight + 1, 52, 2)
        drawTinyText(traceLeft, 39, "LFO", 5)
        local tracePreviousX = nil
        local tracePreviousY = nil
        for n = 1, self.display_lfo_history_count do
            local index = (
                self.display_lfo_history_index - self.display_lfo_history_count + n - 1
            ) % DISPLAY_LFO_HISTORY + 1
            local value = self.display_lfo_history[index]
            local x = traceLeft
            if self.display_lfo_history_count > 1 then
                x = traceLeft
                    + ((n - 1) / (self.display_lfo_history_count - 1))
                    * (traceRight - traceLeft)
            end
            local y = traceCenterY - value * 4
            if tracePreviousX then
                drawSmoothLine(tracePreviousX, tracePreviousY, x, y, 6)
            end
            tracePreviousX = x
            tracePreviousY = y
        end

        local scaleText = midiToNoteName(p[1]) .. " " .. (SCALE_NAMES[p[2]] or "?")
        drawTinyText(4, 63, scaleText, 7)
        if switchPending then
            drawTinyText(
                128,
                63,
                string.format("A%d>%d", currentArp, pendingArp),
                10,
                "centre"
            )
        else
            drawTinyText(128, 63, "ARP " .. currentArp, 10, "centre")
        end
        drawTinyText(252, 63, midiToNoteName(self.display_current_midi), 12, "right")

        return true
    end
    
    ------------------------------------------------------------------------
    -- SERIALIZATION (save/restore state)
    ------------------------------------------------------------------------
    , serialise = function(self)
        local state = {
            arps = {},
            currentArp = currentArp,
            lfoPhase = lfoPhase,
            randomSeed = randomSeed
        }
        
        for i = 1, NUM_ARPS do
            state.arps[i] = {
                position = arps[i].position,
                direction = arps[i].direction,
                clockCount = arps[i].clockCount
            }
        end
        
        return state
    end
}
