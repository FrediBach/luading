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
-- MAIN SCRIPT TABLE
--------------------------------------------------------------------------------

return {
    name = 'Arp Weaver'
    , author = 'Claude / Expert Sleepers'
    
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
        
        return {
            -- Input configuration
            inputs = { kTrigger, kCV, kTrigger }
            , inputNames = { "Clock", "LFO CV", "Reset" }
            
            -- Output configuration (V/Oct and Weave are linear for smooth CV)
            , outputs = { kLinear, kStepped, kStepped, kLinear }
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
                end
            end
            
            -- Check if we can switch arpeggios now (gate is low)
            if switchPending and not gateHigh then
                currentArp = pendingArp
                switchPending = false
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
        end
        
        return {}
    end
    
    ------------------------------------------------------------------------
    -- STEP FUNCTION (called every 1ms)
    ------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        local p = self.parameters
        local outputs = {}
        
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
        
        -- Only switch arpeggios when gate is low (note has completed)
        if desiredArp ~= currentArp then
            if not gateHigh then
                currentArp = desiredArp
                switchPending = false
            else
                -- Mark that we want to switch when the note ends
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
        
        -- Draw standard parameter line at top
        drawStandardParameterLine()
        
        -- Display area dimensions
        local screenW = 256
        local screenH = 64
        local topMargin = 12
        
        -- Draw 4 arpeggio lanes
        local laneHeight = 10
        local laneGap = 2
        local laneY = topMargin + 4
        
        for i = 1, NUM_ARPS do
            local y = laneY + (i - 1) * (laneHeight + laneGap)
            local isActive = (currentArp == i)
            local isPending = (switchPending and pendingArp == i)
            
            -- Lane background
            local bgColor = isActive and 4 or 1
            drawRectangle(0, y, screenW - 1, y + laneHeight - 1, bgColor)
            
            -- Arp number
            local labelColor = isActive and 15 or 6
            drawTinyText(4, y + 7, tostring(i), labelColor)
            
            -- Pattern name
            local baseIdx = 8 + (i - 1) * 4
            local patternIdx = p[baseIdx]
            local patternName = PATTERN_NAMES[patternIdx] or "?"
            drawTinyText(14, y + 7, string.sub(patternName, 1, 4), labelColor)
            
            -- Divider
            local divider = p[baseIdx + 1]
            drawTinyText(38, y + 7, "/" .. divider, labelColor)
            
            -- Current position indicator (visual representation of arp progress)
            local arp = arps[i]
            local octaves = p[baseIdx + 2]
            local scale = p[2]
            local notes = buildNoteSequence(scale, octaves)
            local numNotes = #notes
            
            if numNotes > 0 then
                local barWidth = 140
                local barX = 55
                local noteWidth = barWidth / numNotes
                
                -- Draw position markers
                for n = 1, numNotes do
                    local x = barX + (n - 1) * noteWidth
                    local noteColor = (n == arp.position and isActive) and 15 or 2
                    if n == arp.position then
                        drawRectangle(x, y + 2, x + noteWidth - 2, y + laneHeight - 3, noteColor)
                    else
                        drawRectangle(x, y + 4, x + noteWidth - 2, y + laneHeight - 5, noteColor)
                    end
                end
            end
            
            -- Pending indicator
            if isPending then
                drawTinyText(200, y + 7, ">>", 12)
            end
            
            -- Active indicator
            if isActive then
                drawCircle(210, y + 5, 3, 15)
            end
        end
        
        -- Draw LFO visualization at bottom
        local lfoY = screenH - 8
        local lfoBarWidth = 80
        local lfoBarX = screenW - lfoBarWidth - 10
        
        -- LFO bar background
        drawBox(lfoBarX, lfoY - 4, lfoBarX + lfoBarWidth, lfoY + 4, 3)
        
        -- LFO position indicator
        local lfoPos = (lfoValue + 1) / 2  -- 0 to 1
        local lfoIndicatorX = lfoBarX + lfoPos * lfoBarWidth
        drawRectangle(lfoIndicatorX - 2, lfoY - 3, lfoIndicatorX + 2, lfoY + 3, 15)
        
        -- LFO label
        drawTinyText(lfoBarX - 18, lfoY + 2, "LFO", 8)
        
        -- Current arp indicator
        drawTinyText(10, lfoY + 2, "Arp:" .. currentArp, 12)
        
        -- Scale name
        local scaleName = SCALE_NAMES[p[2]] or "?"
        drawTinyText(50, lfoY + 2, scaleName, 8)
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
