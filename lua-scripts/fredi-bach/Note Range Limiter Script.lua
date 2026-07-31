-- Note Range Limiter
--[[
MIDI note range limiter with CV control. Constrains incoming MIDI notes to
a configurable range. Notes outside the range can be suppressed, clamped to
the boundary, or folded by octaves until within range. CV inputs modulate
min/max thresholds at the standard 1V/octave rate (12 semitones per volt).

Useful for: keyboard splits, safe VCO ranges, constraining generative
sequences, drum mapping zones, and layered voice allocation.
]]

--------------------------------------------------------------------------------
-- Local helper functions
--------------------------------------------------------------------------------

-- Convert MIDI note number to name string (e.g., 60 -> "C4")
local noteNames = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" }

local function midiToNoteName(note)
    local name = noteNames[(note % 12) + 1]
    local octave = math.floor(note / 12) - 1
    return name .. octave
end

-- Clamp a value to a range
local function clamp(value, min, max)
    return math.max(min, math.min(max, value))
end

-- Fold a note by octaves until it's within the range
local function foldToRange(note, minNote, maxNote)
    if minNote > maxNote then
        minNote, maxNote = maxNote, minNote
    end
    
    local rangeSize = maxNote - minNote
    if rangeSize < 12 then
        -- Range is less than an octave, just clamp
        return clamp(note, minNote, maxNote)
    end
    
    -- Transpose by octaves until in range
    while note < minNote do
        note = note + 12
    end
    while note > maxNote do
        note = note - 12
    end
    
    -- Final safety clamp (in case range doesn't align with octaves)
    return clamp(note, minNote, maxNote)
end

--------------------------------------------------------------------------------
-- Main script table
--------------------------------------------------------------------------------

return
{
    name = 'Note Range Limiter'
    , author = 'Expert Sleepers Ltd'
    
    --------------------------------------------------------------------------
    -- Initialization
    --------------------------------------------------------------------------
    , init = function(self)
        -- State tracking
        self.activeNotes = {}       -- Maps input note -> output note for proper note-off
        self.suppressPulse = 0      -- Counter for filtered output trigger
        self.lastProcessedNote = nil
        self.lastWasFiltered = false
        
        -- Effective range (updated in step with CV modulation)
        self.effectiveMin = 36      -- C2
        self.effectiveMax = 84      -- C6
        
        return
        {
            -- Two CV inputs for range modulation
            inputs = {
                kCV, -- Type: Sine LFO, Synced: true, Division: 2 bars
                kCV, -- Type: Triangle LFO, Synced: true, Division: 1 bar
            }
            , inputNames = { "Min CV", "Max CV" }
            
            -- Gate output and filtered trigger
            , outputs = {
                kStepped, -- Type: Kick Trigger
                kStepped, -- Type: Snare Trigger
            }
            , outputNames = { "Gate Out", "Filtered" }
            
            , parameters = 
            {
                -- Range parameters (displayed as MIDI note names)
                { "Min Note", 0, 127, 36, kMIDINote }           -- 1: Default C2
                , { "Max Note", 0, 127, 84, kMIDINote }         -- 2: Default C6
                
                -- Processing mode
                , { "Mode", { "Suppress", "Clamp", "Oct Fold" }, 1 }  -- 3
                
                -- MIDI configuration
                , { "MIDI Ch", 0, 16, 0 }                       -- 4: 0=off, 1-16=channel
                , { "Output", { "Breakout", "SelBus", "USB", "Internal", "All" }, 1 }  -- 5
            }
            
            -- MIDI reception: listen for note messages on configured channel
            , midi = { 
                channelParameter = 4, 
                messages = { "note" } 
            }
        }
    end
    
    --------------------------------------------------------------------------
    -- Step function (called every 1ms)
    --------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        -- Get base parameter values
        local minBase = self.parameters[1]
        local maxBase = self.parameters[2]
        
        -- Apply CV modulation at 1V/octave (12 semitones per volt)
        local minMod = inputs[1] * 12
        local maxMod = inputs[2] * 12
        
        -- Calculate effective range with CV, clamped to valid MIDI range
        self.effectiveMin = clamp(minBase + minMod, 0, 127)
        self.effectiveMax = clamp(maxBase + maxMod, 0, 127)
        
        -- Ensure min <= max (swap if necessary)
        if self.effectiveMin > self.effectiveMax then
            self.effectiveMin, self.effectiveMax = self.effectiveMax, self.effectiveMin
        end
        
        -- Gate output: high (5V) when any notes are active
        local hasActiveNotes = next(self.activeNotes) ~= nil
        local gateOut = hasActiveNotes and 5.0 or 0.0
        
        -- Filtered output: brief trigger pulse when note is suppressed/modified
        local filteredOut = 0.0
        if self.suppressPulse > 0 then
            filteredOut = 5.0
            self.suppressPulse = self.suppressPulse - 1
        end
        
        return { gateOut, filteredOut }
    end
    
    --------------------------------------------------------------------------
    -- MIDI message handler
    --------------------------------------------------------------------------
    , midiMessage = function(self, message)
        -- Parse MIDI message
        local status = message[1] & 0xF0
        local channel = message[1] & 0x0F
        local note = message[2]
        local velocity = message[3]
        
        -- Identify message type
        local isNoteOn = (status == 0x90) and (velocity > 0)
        local isNoteOff = (status == 0x80) or ((status == 0x90) and (velocity == 0))
        
        -- Only process note messages
        if not (isNoteOn or isNoteOff) then 
            return 
        end
        
        -- Get current effective range (integers for MIDI)
        local minNote = math.floor(self.effectiveMin + 0.5)
        local maxNote = math.floor(self.effectiveMax + 0.5)
        
        -- Get processing mode and output destination
        local mode = self.parameters[3]
        local outputSel = self.parameters[5]
        
        -- MIDI output destination bitmask
        local destMap = { 0x1, 0x2, 0x4, 0x8, 0xF }  -- Breakout, SelBus, USB, Internal, All
        local dest = destMap[outputSel] or 0x1
        
        -- Process Note On
        if isNoteOn then
            local outNote = note
            local shouldSend = true
            local wasFiltered = false
            
            if note < minNote then
                -- Note is below range
                if mode == 1 then          -- Suppress
                    shouldSend = false
                    wasFiltered = true
                elseif mode == 2 then      -- Clamp
                    outNote = minNote
                    wasFiltered = true
                else                        -- Octave Fold
                    outNote = foldToRange(note, minNote, maxNote)
                    wasFiltered = (outNote ~= note)
                end
            elseif note > maxNote then
                -- Note is above range
                if mode == 1 then          -- Suppress
                    shouldSend = false
                    wasFiltered = true
                elseif mode == 2 then      -- Clamp
                    outNote = maxNote
                    wasFiltered = true
                else                        -- Octave Fold
                    outNote = foldToRange(note, minNote, maxNote)
                    wasFiltered = (outNote ~= note)
                end
            end
            
            -- Track state and send MIDI
            if shouldSend then
                self.activeNotes[note] = outNote
                sendMIDI(dest, 0x90 | channel, outNote, velocity)
            end
            
            -- Trigger filtered output if note was modified or suppressed
            if wasFiltered then
                self.suppressPulse = 10  -- ~10ms pulse
            end
            
            -- Track for display
            self.lastProcessedNote = note
            self.lastWasFiltered = wasFiltered
            
        -- Process Note Off
        elseif isNoteOff then
            local outNote = self.activeNotes[note]
            if outNote then
                self.activeNotes[note] = nil
                sendMIDI(dest, 0x80 | channel, outNote, velocity)
            end
        end
    end
    
    --------------------------------------------------------------------------
    -- Custom display
    --------------------------------------------------------------------------
    , draw = function(self)
        -- Get display values
        local minNote = math.floor(self.effectiveMin + 0.5)
        local maxNote = math.floor(self.effectiveMax + 0.5)
        local mode = self.parameters[3]
        
        -- Mode labels
        local modeLabels = { "SUPPRESS", "CLAMP", "OCT FOLD" }
        local modeText = modeLabels[mode] or "?"
        
        -- Drawing coordinates
        local x0, x1 = 8, 248          -- Horizontal bounds
        local barY0, barY1 = 24, 44    -- Range bar vertical bounds
        local barWidth = x1 - x0
        
        -- Draw outer frame
        drawBox(x0, barY0, x1, barY1, 4)
        
        -- Calculate range bar positions
        local minX = x0 + (minNote / 127) * barWidth
        local maxX = x0 + (maxNote / 127) * barWidth
        
        -- Draw active range (filled rectangle)
        if minX < maxX then
            drawRectangle(minX, barY0 + 1, maxX, barY1 - 1, 5)
        end
        
        -- Draw boundary markers
        drawLine(minX, barY0, minX, barY1, 12)
        drawLine(maxX, barY0, maxX, barY1, 12)
        
        -- Draw active notes as vertical lines
        for inputNote, outputNote in pairs(self.activeNotes) do
            -- Show input note position (dimmer)
            local inX = x0 + (inputNote / 127) * barWidth
            drawLine(inX, barY0 + 2, inX, barY1 - 2, 8)
            
            -- Show output note position (brighter) if different
            if outputNote ~= inputNote then
                local outX = x0 + (outputNote / 127) * barWidth
                drawLine(outX, barY0, outX, barY1, 15)
            else
                drawLine(inX, barY0, inX, barY1, 15)
            end
        end
        
        -- Draw text labels
        -- Min note name (left aligned)
        drawTinyText(x0, 56, midiToNoteName(minNote), 15)
        
        -- Max note name (right aligned)
        drawTinyText(x1, 56, midiToNoteName(maxNote), 15, "right")
        
        -- Mode label (centered)
        drawTinyText(128, 56, modeText, 10, "centre")
        
        -- Show active note count if any
        local noteCount = 0
        for _ in pairs(self.activeNotes) do
            noteCount = noteCount + 1
        end
        
        if noteCount > 0 then
            drawTinyText(128, 18, noteCount .. " active", 8, "centre")
        end
    end
}
