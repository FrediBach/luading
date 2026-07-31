-- Note Mirror
--[[
Reflects incoming notes around a configurable mirror line.
Notes below the line are mirrored above, and vice versa.
Useful for creating melodic inversions, counterpoint, and 
harmonic transformations in real-time.
]]

--------------------------------------------------------------------------------
-- SCALE DEFINITIONS
-- Each scale is defined as semitone offsets from the root (0-11)
--------------------------------------------------------------------------------
local scales = {
    { name = "Chromatic",   notes = {0,1,2,3,4,5,6,7,8,9,10,11} },
    { name = "Major",       notes = {0,2,4,5,7,9,11} },
    { name = "Minor",       notes = {0,2,3,5,7,8,10} },
    { name = "Dorian",      notes = {0,2,3,5,7,9,10} },
    { name = "Phrygian",    notes = {0,1,3,5,7,8,10} },
    { name = "Lydian",      notes = {0,2,4,6,7,9,11} },
    { name = "Mixolydian",  notes = {0,2,4,5,7,9,10} },
    { name = "Locrian",     notes = {0,1,3,5,6,8,10} },
    { name = "Pentatonic",  notes = {0,2,4,7,9} },
    { name = "Blues",       notes = {0,3,5,6,7,10} },
    { name = "Harm Minor",  notes = {0,2,3,5,7,8,11} },
    { name = "Whole Tone",  notes = {0,2,4,6,8,10} },
}

-- Build scale name array for parameter enum
local scaleNames = {}
for i, scale in ipairs(scales) do
    scaleNames[i] = scale.name
end

--------------------------------------------------------------------------------
-- HELPER FUNCTIONS
--------------------------------------------------------------------------------

--- Convert MIDI note number to voltage (1V/oct, C4 = 0V)
-- @param midiNote MIDI note number (60 = C4)
-- @return Voltage value
local function midiToVoltage(midiNote)
    return (midiNote - 60) / 12
end

--- Convert voltage to MIDI note number
-- @param voltage Input voltage (1V/oct)
-- @return MIDI note number (may be fractional)
local function voltageToMidi(voltage)
    return voltage * 12 + 60
end

--- Quantize a MIDI note to the nearest note in a scale
-- @param midiNote The MIDI note to quantize (can be fractional)
-- @param scaleIndex Index into the scales table
-- @return Quantized MIDI note number
local function quantizeToScale(midiNote, scaleIndex)
    local scale = scales[scaleIndex].notes
    local octave = math.floor(midiNote / 12)
    local noteInOctave = midiNote - (octave * 12)
    
    -- Find the closest scale degree
    local closest = scale[1]
    local minDist = math.abs(noteInOctave - scale[1])
    
    for _, scaleNote in ipairs(scale) do
        local dist = math.abs(noteInOctave - scaleNote)
        if dist < minDist then
            minDist = dist
            closest = scaleNote
        end
        -- Also check wrapping to next octave
        local distUp = math.abs(noteInOctave - (scaleNote + 12))
        if distUp < minDist then
            minDist = distUp
            closest = scaleNote + 12
        end
    end
    
    return octave * 12 + closest
end

--- Get note name from MIDI note number
-- @param midiNote MIDI note number
-- @return Note name string (e.g., "C4", "F#3")
local function getNoteName(midiNote)
    local noteNames = {"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"}
    local note = math.floor(midiNote + 0.5)
    local octave = math.floor(note / 12) - 1
    local noteIndex = (note % 12) + 1
    return noteNames[noteIndex] .. octave
end

--------------------------------------------------------------------------------
-- MAIN SCRIPT
--------------------------------------------------------------------------------

return {
    name = 'Note Mirror'
    , author = 'Expert Sleepers Ltd'
    
    ----------------------------------------------------------------------------
    -- INITIALIZATION
    ----------------------------------------------------------------------------
    , init = function(self)
        -- State variables
        self.gateState = false
        self.inputNote = 0       -- Current input voltage
        self.outputNote = 0      -- Current output voltage
        self.mirrorLine = 0      -- Current mirror line voltage
        
        return {
            -- Input configuration
            -- Input 1: Note CV (1V/oct pitch)
            -- Input 2: Gate signal
            -- Input 3: Mirror line CV modulation
            inputs = {
                kCV,   -- Type: Note Sequencer (V/Oct), Synced: true, Division: 1/4
                kGate, -- Type: Gate, Synced: true, Division: 1/4
                kCV,   -- Type: Sine LFO, Synced: true, Division: 2 bars
            }
            , inputNames = { 
                "Note In", 
                "Gate In", 
                "Mirror CV" 
            }
            
            -- Output configuration
            -- Output 1: Mirrored note CV (linear interpolation for smooth glides)
            -- Output 2: Gate pass-through (stepped for clean gates)
            , outputs = {
                kLinear,  -- Type: Synth Note
                kStepped, -- Type: Synth Trigger
            }
            , outputNames = { 
                "Note Out", 
                "Gate Out" 
            }
            
            -- Parameters
            , parameters = {
                -- Mirror line base note (MIDI note number)
                { "Mirror Note", 0, 127, 60, kMIDINote }
                -- Quantization on/off
                , { "Quantize", { "Off", "On" }, 1 }
                -- Scale selection (only applies when Quantize is On)
                , { "Scale", scaleNames, 1 }
            }
        }
    end
    
    ----------------------------------------------------------------------------
    -- GATE HANDLING
    -- Called when gate input changes state - more efficient than polling
    ----------------------------------------------------------------------------
    , gate = function(self, input, rising)
        self.gateState = rising
        -- Pass gate through to output 2
        return { [2] = rising and 5.0 or 0.0 }
    end
    
    ----------------------------------------------------------------------------
    -- STEP FUNCTION
    -- Called every 1ms to process CV
    ----------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        -- Read inputs
        local noteInVoltage = inputs[1]
        local mirrorCVMod = inputs[3]
        
        -- Read parameters
        local mirrorNoteMidi = self.parameters[1]
        local quantizeOn = self.parameters[2] == 2
        local scaleIndex = self.parameters[3]
        
        -- Calculate mirror line voltage
        -- Base mirror note + CV modulation (1V/oct)
        self.mirrorLine = midiToVoltage(mirrorNoteMidi) + mirrorCVMod
        
        -- Store input for display
        self.inputNote = noteInVoltage
        
        -- Apply mirror transformation: output = 2 * mirror - input
        local mirroredVoltage = 2 * self.mirrorLine - noteInVoltage
        
        -- Apply quantization if enabled
        if quantizeOn then
            local mirroredMidi = voltageToMidi(mirroredVoltage)
            local quantizedMidi = quantizeToScale(mirroredMidi, scaleIndex)
            mirroredVoltage = midiToVoltage(quantizedMidi)
        end
        
        -- Store output for display
        self.outputNote = mirroredVoltage
        
        -- Return mirrored note on output 1
        return { mirroredVoltage }
    end
    
    ----------------------------------------------------------------------------
    -- DISPLAY
    -- Custom visualization of the mirror operation
    ----------------------------------------------------------------------------
    , draw = function(self)
        -- Screen dimensions: 256x64
        local screenW = 256
        local screenH = 64
        
        -- Drawing area (leave space for parameter line)
        local topMargin = 12
        local bottomMargin = 4
        local sideMargin = 8
        
        local drawH = screenH - topMargin - bottomMargin
        local drawW = screenW - (2 * sideMargin)
        local centerY = topMargin + drawH / 2
        local centerX = sideMargin + drawW / 2
        
        -- Voltage range to display (typically -3V to +3V covers most melodies)
        local voltageRange = 3.0  -- +/- 3V = 6 octaves total
        
        -- Helper to convert voltage to Y coordinate
        local function voltageToY(v)
            -- Clamp to range
            v = math.max(-voltageRange, math.min(voltageRange, v))
            -- Map: +voltageRange -> topMargin, -voltageRange -> topMargin + drawH
            return centerY - (v / voltageRange) * (drawH / 2)
        end
        
        -- Helper to convert voltage to X coordinate (for the piano roll style)
        local function voltageToX(v)
            v = math.max(-voltageRange, math.min(voltageRange, v))
            return centerX + (v / voltageRange) * (drawW / 2 - 40)
        end
        
        -- Draw mirror line (horizontal dashed line)
        local mirrorY = voltageToY(self.mirrorLine)
        for x = sideMargin, screenW - sideMargin, 8 do
            drawLine(x, mirrorY, x + 4, mirrorY, 6)
        end
        
        -- Draw mirror line label
        local mirrorNoteName = getNoteName(voltageToMidi(self.mirrorLine))
        drawTinyText(screenW - sideMargin - 2, mirrorY - 2, mirrorNoteName, 8, "right")
        
        -- Draw input note indicator (left side, filled circle)
        local inputY = voltageToY(self.inputNote)
        local inputX = sideMargin + 20
        if self.gateState then
            drawCircle(inputX, inputY, 5, 15)
        else
            drawCircle(inputX, inputY, 5, 8)
        end
        
        -- Draw output note indicator (right side, filled circle)
        local outputY = voltageToY(self.outputNote)
        local outputX = screenW - sideMargin - 20
        if self.gateState then
            drawCircle(outputX, outputY, 5, 15)
        else
            drawCircle(outputX, outputY, 5, 8)
        end
        
        -- Draw connecting line showing the mirror relationship
        if self.gateState then
            -- Bright line when gate is high
            drawLine(inputX, inputY, centerX, mirrorY, 10)
            drawLine(centerX, mirrorY, outputX, outputY, 10)
        else
            -- Dim line when gate is low
            drawLine(inputX, inputY, centerX, mirrorY, 4)
            drawLine(centerX, mirrorY, outputX, outputY, 4)
        end
        
        -- Draw small dot at mirror point
        drawCircle(centerX, mirrorY, 2, 12)
        
        -- Draw labels
        local inputNoteName = getNoteName(voltageToMidi(self.inputNote))
        local outputNoteName = getNoteName(voltageToMidi(self.outputNote))
        
        drawTinyText(inputX, screenH - bottomMargin, "IN", 10, "centre")
        drawTinyText(inputX, inputY + 10, inputNoteName, 12, "centre")
        
        drawTinyText(outputX, screenH - bottomMargin, "OUT", 10, "centre")
        drawTinyText(outputX, outputY + 10, outputNoteName, 12, "centre")
        
        -- Draw scale indicator if quantization is on
        if self.parameters[2] == 2 then
            local scaleIndex = self.parameters[3]
            drawTinyText(centerX, screenH - bottomMargin, scales[scaleIndex].name, 6, "centre")
        end
        
        -- Return false to show standard parameter line at top
        return false
    end
}
