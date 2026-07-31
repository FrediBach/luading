-- Note Compressor
--[[
Compress melodic CV into a configurable note range. Min and Max boundaries 
are CV controllable, allowing dynamic "opening" or "closing" of the melodic 
range - from full expression down to a single droning note.

INPUTS:
  1. Pitch CV  - 1V/oct pitch input from sequencer or other source
  2. Gate      - Gate input, passed through to output
  3. Min CV    - CV modulation for minimum note boundary
  4. Max CV    - CV modulation for maximum note boundary

OUTPUTS:
  1. Pitch     - Compressed 1V/oct pitch output (linear interpolated)
  2. Gate      - Gate passthrough

MODES:
  Clamp - Notes outside range snap to nearest boundary
  Fold  - Notes reflect back into range (creates melodic variations)
  Scale - Proportionally maps input range to output range

USAGE IN EURORACK:
  - Patch a melody (pitch CV + gate) through the compressor
  - Set min/max to define the allowed note range
  - Use CV to dynamically open/close the range:
    * Slowly open from unison to full range for builds
    * Close down to create drone sections
    * Use LFO for rhythmic range pumping
  - Fold mode creates interesting melodic variations
  - Scale mode works well with generative/random sequences
]]

--------------------------------------------------------------------------------
-- Helper: Convert MIDI note number to note name for display
--------------------------------------------------------------------------------
local NOTE_NAMES = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" }

local function midiToNoteName(midiNote)
    local note = math.floor(midiNote + 0.5)
    local octave = math.floor(note / 12) - 1
    local noteName = NOTE_NAMES[(note % 12) + 1]
    return noteName .. octave
end

--------------------------------------------------------------------------------
-- Main Script
--------------------------------------------------------------------------------
return
{
    name = 'Note Compressor'
    , author = 'Expert Sleepers Ltd'
    
    ----------------------------------------------------------------------------
    -- Initialization
    ----------------------------------------------------------------------------
    , init = function(self)
        -- State variables for display
        self.gateState = false
        self.noteIn = 60      -- Input note (semitones, for display)
        self.noteOut = 60     -- Output note (semitones, for display)
        self.currentMin = 36  -- Current min after CV modulation
        self.currentMax = 84  -- Current max after CV modulation
        
        return
        {
            -- Input configuration
            -- All inputs appear in the inputs[] array
            -- kGate additionally triggers the gate() callback
            inputs = {
                kCV,   -- Type: Note Sequencer (V/Oct), Synced: true, Division: 1/4
                kGate, -- Type: Gate, Synced: true, Division: 1/4
                kCV,   -- Type: Sine LFO, Synced: true, Division: 2 bars
                kCV,   -- Type: Triangle LFO, Synced: true, Division: 2 bars
            }
            , inputNames = { "Pitch", "Gate", "Min CV", "Max CV" }
            
            -- Output configuration
            -- kLinear for smooth pitch output, kStepped for gate
            , outputs = {
                kLinear,  -- Type: Synth Note
                kStepped, -- Type: Synth Trigger
            }
            , outputNames = { "Pitch", "Gate" }
            
            -- Parameters exposed in the UI
            , parameters = 
            {
                -- Note boundaries (MIDI note numbers for musical intuition)
                { "Min Note", 0, 127, 36, kMIDINote }      -- C2 default
                , { "Max Note", 0, 127, 84, kMIDINote }    -- C6 default
                
                -- CV modulation amounts (attenuverters)
                -- At 100%, 1V of CV = 12 semitones (1 octave) of shift
                , { "Min CV Amt", -100, 100, 100, kPercent }
                , { "Max CV Amt", -100, 100, 100, kPercent }
                
                -- Compression mode
                , { "Mode", { "Clamp", "Fold", "Scale" }, 1 }
                
                -- Reference range for Scale mode (in octaves)
                , { "Scale Range", 1, 10, 5, kNone }
            }
        }
    end
    
    ----------------------------------------------------------------------------
    -- Step function - called every 1ms for continuous CV processing
    ----------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        -- Read inputs
        local pitchIn = inputs[1]   -- Pitch CV in volts
        local minCV = inputs[3]     -- Min modulation CV
        local maxCV = inputs[4]     -- Max modulation CV
        
        -- Read parameters
        local minNote = self.parameters[1]
        local maxNote = self.parameters[2]
        local minCVAmt = self.parameters[3] / 100    -- Convert to 0-1 range
        local maxCVAmt = self.parameters[4] / 100
        local mode = self.parameters[5]
        local scaleRange = self.parameters[6]
        
        -- Apply CV modulation to boundaries
        -- 1V of CV * 12 semitones * amount = boundary shift
        minNote = minNote + (minCV * 12 * minCVAmt)
        maxNote = maxNote + (maxCV * 12 * maxCVAmt)
        
        -- Clamp to valid MIDI range (with some headroom for modulation)
        minNote = math.max(-12, math.min(139, minNote))
        maxNote = math.max(-12, math.min(139, maxNote))
        
        -- Ensure min <= max (swap if crossed)
        if minNote > maxNote then
            minNote, maxNote = maxNote, minNote
        end
        
        -- Store current values for display
        self.currentMin = minNote
        self.currentMax = maxNote
        
        -- Convert input pitch to semitones
        -- Standard: 0V = C0 (MIDI note 0), 1V = C1, etc.
        local noteIn = pitchIn * 12
        self.noteIn = noteIn
        
        -- Calculate output range
        local range = maxNote - minNote
        local noteOut
        
        --------------------------------------------------------------------
        -- Mode 1: Clamp
        -- Simple hard limiting to boundaries
        --------------------------------------------------------------------
        if mode == 1 then
            noteOut = math.max(minNote, math.min(maxNote, noteIn))
        
        --------------------------------------------------------------------
        -- Mode 2: Fold
        -- Notes outside range reflect back in, creating variations
        -- Uses triangle wave folding for smooth behavior
        --------------------------------------------------------------------
        elseif mode == 2 then
            if range > 0 then
                -- Normalize input relative to min
                local relative = noteIn - minNote
                
                -- Calculate how many "folds" into the range
                local normalized = relative / range
                
                -- Triangle wave fold: maps any value into 0-1
                -- Using modulo 2 and reflection
                local folded = math.abs(normalized) % 2
                if folded > 1 then
                    folded = 2 - folded
                end
                
                noteOut = minNote + folded * range
            else
                -- Zero range = single note
                noteOut = minNote
            end
        
        --------------------------------------------------------------------
        -- Mode 3: Scale
        -- Proportionally map input range to output range
        -- Useful for compressing wide-ranging generative sequences
        --------------------------------------------------------------------
        else
            -- Reference input range centered at 0V
            local inputRangeSemitones = scaleRange * 12  -- Convert octaves to semitones
            
            -- Normalize input (0V = center of range)
            local normalized = (noteIn + inputRangeSemitones / 2) / inputRangeSemitones
            
            -- Clamp to 0-1 (hard limit at scale boundaries)
            normalized = math.max(0, math.min(1, normalized))
            
            -- Map to output range
            noteOut = minNote + normalized * range
        end
        
        -- Store for display
        self.noteOut = noteOut
        
        -- Convert back to V/oct
        local pitchOut = noteOut / 12
        
        -- Return only the pitch output
        -- Gate is handled by the gate() callback
        return { pitchOut }
    end
    
    ----------------------------------------------------------------------------
    -- Gate callback - called when gate input changes state
    ----------------------------------------------------------------------------
    , gate = function(self, input, rising)
        -- input = which input triggered (will be 2 for our Gate input)
        -- rising = true if gate just opened, false if just closed
        
        self.gateState = rising
        
        -- Return table with output index and value
        -- Gate output is output 2
        return { [2] = rising and 5.0 or 0.0 }
    end
    
    ----------------------------------------------------------------------------
    -- Custom display
    ----------------------------------------------------------------------------
    , draw = function(self)
        local screenWidth = 256
        local screenHeight = 64
        
        -- Layout constants
        local barY = 38
        local barHeight = 14
        local marginX = 12
        local barLeft = marginX
        local barRight = screenWidth - marginX
        local barWidth = barRight - barLeft
        
        -- Helper: map MIDI note to screen X coordinate
        local function noteToX(note)
            -- Display range: show -12 to 139 (wider than MIDI for headroom)
            local displayMin = -12
            local displayMax = 139
            local normalized = (note - displayMin) / (displayMax - displayMin)
            return barLeft + normalized * barWidth
        end
        
        -- Mode names
        local modeNames = { "CLAMP", "FOLD", "SCALE" }
        local modeName = modeNames[self.parameters[5]] or "?"
        
        -- Draw title and mode
        drawText(128, 12, "Note Compressor", 10, "centre")
        drawText(128, 24, modeName, 15, "centre")
        
        -- Draw the range bar background
        drawBox(barLeft, barY, barRight, barY + barHeight, 3)
        
        -- Draw octave markers
        for oct = 0, 10 do
            local note = oct * 12
            local x = noteToX(note)
            if x >= barLeft and x <= barRight then
                drawLine(x, barY + barHeight - 3, x, barY + barHeight, 4)
            end
        end
        
        -- Draw active compression range (filled rectangle)
        local activeMinX = math.max(barLeft, noteToX(self.currentMin))
        local activeMaxX = math.min(barRight, noteToX(self.currentMax))
        if activeMinX < activeMaxX then
            drawRectangle(activeMinX, barY + 2, activeMaxX, barY + barHeight - 2, 7)
        elseif math.abs(activeMinX - activeMaxX) < 2 then
            -- Very narrow range - draw a line
            drawLine(activeMinX, barY + 2, activeMinX, barY + barHeight - 2, 12)
        end
        
        -- Draw input note marker (inverted triangle above bar)
        local inX = noteToX(self.noteIn)
        inX = math.max(barLeft, math.min(barRight, inX))
        drawLine(inX - 4, barY - 6, inX, barY - 1, 8)
        drawLine(inX + 4, barY - 6, inX, barY - 1, 8)
        drawLine(inX - 4, barY - 6, inX + 4, barY - 6, 8)
        
        -- Draw output note marker (triangle below bar)
        local outX = noteToX(self.noteOut)
        outX = math.max(barLeft, math.min(barRight, outX))
        drawLine(outX - 4, barY + barHeight + 6, outX, barY + barHeight + 1, 15)
        drawLine(outX + 4, barY + barHeight + 6, outX, barY + barHeight + 1, 15)
        drawLine(outX - 4, barY + barHeight + 6, outX + 4, barY + barHeight + 6, 15)
        
        -- Draw note labels
        local minNoteName = midiToNoteName(self.currentMin)
        local maxNoteName = midiToNoteName(self.currentMax)
        
        -- Position labels to avoid overlap
        local minLabelX = math.max(barLeft + 10, activeMinX)
        local maxLabelX = math.min(barRight - 10, activeMaxX)
        
        if maxLabelX - minLabelX > 30 then
            -- Enough room for both labels
            drawTinyText(minLabelX, barY + 9, minNoteName, 12, "centre")
            drawTinyText(maxLabelX, barY + 9, maxNoteName, 12, "centre")
        else
            -- Show range as "Min-Max" in center
            local rangeText = minNoteName .. "-" .. maxNoteName
            drawTinyText((minLabelX + maxLabelX) / 2, barY + 9, rangeText, 12, "centre")
        end
        
        -- Gate indicator (top right)
        if self.gateState then
            drawRectangle(238, 4, 252, 16, 15)
            drawTinyText(245, 13, "G", 0, "centre")
        else
            drawBox(238, 4, 252, 16, 6)
            drawTinyText(245, 13, "G", 6, "centre")
        end
        
        -- Input/Output labels
        drawTinyText(barLeft, barY - 7, "IN", 8)
        drawTinyText(barLeft, barY + barHeight + 6, "OUT", 15)
    end
}
