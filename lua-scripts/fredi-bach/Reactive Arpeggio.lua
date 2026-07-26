-- Reactive Arpeggio
--[[
Transforms held notes into scale-based arpeggios. When a note is played,
subsequent clock pulses generate additional notes moving up or down through
the selected scale, creating musical fills and runs from simple melodies.

Inputs:
  1. Pitch CV (1V/oct) - Input melody pitch
  2. Gate - Detects new notes, controls arpeggio activity
  3. Clock - Advances to next arpeggio step

Outputs:
  1. Pitch CV - Quantized output pitch (smoothed)
  2. Gate - Trigger pulse for each arpeggio step
]]

--------------------------------------------------------------------------------
-- Scale Definitions (semitone intervals from root)
--------------------------------------------------------------------------------
local scaleIntervals = {
    {0, 2, 4, 5, 7, 9, 11},           -- Major
    {0, 2, 3, 5, 7, 8, 10},           -- Minor
    {0, 2, 3, 5, 7, 9, 10},           -- Dorian
    {0, 1, 3, 5, 7, 8, 10},           -- Phrygian
    {0, 2, 4, 6, 7, 9, 11},           -- Lydian
    {0, 2, 4, 5, 7, 9, 10},           -- Mixolydian
    {0, 2, 4, 7, 9},                  -- Pentatonic Maj
    {0, 3, 5, 7, 10},                 -- Pentatonic Min
    {0, 3, 5, 6, 7, 10},              -- Blues
    {0, 2, 3, 5, 6, 8, 9, 11},        -- Diminished
    {0, 2, 4, 6, 8, 10},              -- Whole Tone
    {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11}  -- Chromatic
}

local scaleNames = {
    "Major", "Minor", "Dorian", "Phrygian", "Lydian", "Mixolydian",
    "Penta Maj", "Penta Min", "Blues", "Diminished", "Whole Tone", "Chromatic"
}

local rootNames = {"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"}

local directionNames = {"Up", "Down", "Up-Down", "Random"}

--------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------

-- Convert CV voltage to note number (0V = C0, 1V = C1, etc.)
local function cvToNote(cv)
    return cv * 12.0
end

-- Convert note number back to CV voltage
local function noteToCv(note)
    return note / 12.0
end

-- Find the closest scale degree for a given note
-- Returns: scale degree index (1-based), octave offset, and the quantized note
local function quantizeToScale(noteNum, scale, rootSemitone)
    local intervals = scaleIntervals[scale]
    local numDegrees = #intervals
    
    -- Separate into octave and semitone within octave
    local octave = math.floor(noteNum / 12)
    local semitone = noteNum - (octave * 12)
    
    -- Adjust for root note (make relative to scale root)
    local relativeNote = (semitone - rootSemitone + 12) % 12
    
    -- Find closest interval in the scale
    local bestIndex = 1
    local bestDist = 12
    
    for i, interval in ipairs(intervals) do
        local dist = math.abs(relativeNote - interval)
        -- Also check wrapping around the octave
        local wrapDist = 12 - dist
        if wrapDist < dist then
            dist = wrapDist
        end
        if dist < bestDist then
            bestDist = dist
            bestIndex = i
        end
    end
    
    -- Calculate the actual quantized note
    local quantizedSemitone = (intervals[bestIndex] + rootSemitone) % 12
    local quantizedNote = octave * 12 + quantizedSemitone
    
    -- Handle case where quantization pushes us into next/previous octave
    if quantizedSemitone < rootSemitone and semitone >= rootSemitone then
        quantizedNote = quantizedNote + 12
    elseif quantizedSemitone >= rootSemitone and semitone < rootSemitone then
        quantizedNote = quantizedNote - 12
    end
    
    return bestIndex, octave, quantizedNote
end

-- Get note from scale degree, handling octave wrapping
local function getNoteFromDegree(degreeIndex, baseOctave, scale, rootSemitone)
    local intervals = scaleIntervals[scale]
    local numDegrees = #intervals
    
    -- Handle wrapping across octaves
    local octaveOffset = 0
    while degreeIndex > numDegrees do
        degreeIndex = degreeIndex - numDegrees
        octaveOffset = octaveOffset + 1
    end
    while degreeIndex < 1 do
        degreeIndex = degreeIndex + numDegrees
        octaveOffset = octaveOffset - 1
    end
    
    local semitone = (intervals[degreeIndex] + rootSemitone) % 12
    return (baseOctave + octaveOffset) * 12 + semitone, degreeIndex
end

--------------------------------------------------------------------------------
-- Main Script
--------------------------------------------------------------------------------
return {
    name = 'ReactiveArpeggio'
    , author = 'Expert Sleepers Ltd'
    
    , init = function(self)
        -- State variables
        self.baseNote = 0           -- The captured input pitch (as note number)
        self.baseDegree = 1         -- Scale degree of the base note
        self.baseOctave = 0         -- Octave of the base note
        self.arpStep = 0            -- Current step in the arpeggio (0 = base note)
        self.arpDirection = 1       -- Current direction for Up-Down mode (1=up, -1=down)
        self.gateOpen = false       -- Is input gate currently high?
        self.outputPitch = 0        -- Current output pitch (voltage)
        self.outputGateTime = 0     -- Remaining time for output gate (seconds)
        self.lastPitchCV = 0        -- Last read pitch CV for capture on gate
        self.clockReceived = false  -- Flag for initial clock after gate
        
        return {
            inputs = {kCV, kGate, kTrigger}
            , inputNames = {"Pitch", "Gate", "Clock"}
            , outputs = {kLinear, kStepped}
            , outputNames = {"Pitch Out", "Gate Out"}
            , parameters = {
                {"Scale", scaleNames, 1}                           -- 1: Scale type
                , {"Root", rootNames, 1}                           -- 2: Root note (1=C)
                , {"Direction", directionNames, 1}                 -- 3: Arp direction
                , {"Steps", 1, 16, 4}                              -- 4: Number of arp steps
                , {"Gate ms", 5, 500, 50, kMs}                     -- 5: Output gate length
                , {"Octave Range", 1, 4, 2}                        -- 6: Octave range
                , {"Reset Mode", {"On Gate", "On Clock"}, 1}       -- 7: When to reset arp
            }
        }
    end
    
    -- Called when input gate changes state
    , gate = function(self, input, rising)
        if input == 2 then  -- Gate input
            self.gateOpen = rising
            
            if rising then
                -- Capture pitch and reset arpeggio
                local scale = self.parameters[1]
                local root = self.parameters[2] - 1  -- Convert to 0-11
                
                -- Convert last CV to note number and quantize
                local noteNum = cvToNote(self.lastPitchCV)
                self.baseDegree, self.baseOctave, self.baseNote = 
                    quantizeToScale(noteNum, scale, root)
                
                -- Reset arpeggio state
                self.arpStep = 0
                self.arpDirection = 1
                self.clockReceived = false
                
                -- Output the base note immediately with gate
                self.outputPitch = noteToCv(self.baseNote)
                self.outputGateTime = self.parameters[5] / 1000.0
                
                return {self.outputPitch, 5.0}
            else
                -- Gate closed - turn off output gate if not in middle of pulse
                if self.outputGateTime <= 0 then
                    return {nil, 0.0}
                end
            end
        end
        return {}
    end
    
    -- Called on clock trigger
    , trigger = function(self, input)
        if input == 3 and self.gateOpen then  -- Clock input, only when gate is high
            local scale = self.parameters[1]
            local root = self.parameters[2] - 1
            local direction = self.parameters[3]
            local maxSteps = self.parameters[4]
            local octaveRange = self.parameters[6]
            local resetMode = self.parameters[7]
            
            local intervals = scaleIntervals[scale]
            local numDegrees = #intervals
            local maxDegreeSteps = numDegrees * octaveRange
            
            -- Advance arpeggio step based on direction mode
            if direction == 1 then
                -- Up
                self.arpStep = self.arpStep + 1
                if self.arpStep > maxSteps or self.arpStep >= maxDegreeSteps then
                    if resetMode == 1 then
                        -- Stay at max until new gate
                        self.arpStep = math.min(maxSteps, maxDegreeSteps - 1)
                    else
                        self.arpStep = 0  -- Reset on clock
                    end
                end
                
            elseif direction == 2 then
                -- Down
                self.arpStep = self.arpStep - 1
                if self.arpStep < -maxSteps or self.arpStep <= -maxDegreeSteps then
                    if resetMode == 1 then
                        self.arpStep = math.max(-maxSteps, -(maxDegreeSteps - 1))
                    else
                        self.arpStep = 0
                    end
                end
                
            elseif direction == 3 then
                -- Up-Down
                self.arpStep = self.arpStep + self.arpDirection
                if self.arpStep >= maxSteps or self.arpStep >= maxDegreeSteps then
                    self.arpDirection = -1
                    self.arpStep = math.min(maxSteps, maxDegreeSteps - 1)
                elseif self.arpStep <= -maxSteps or self.arpStep <= -maxDegreeSteps then
                    self.arpDirection = 1
                    self.arpStep = math.max(-maxSteps, -(maxDegreeSteps - 1))
                end
                
            else
                -- Random
                self.arpStep = math.random(-maxSteps, maxSteps)
                -- Clamp to octave range
                self.arpStep = math.max(-maxDegreeSteps + 1, 
                               math.min(maxDegreeSteps - 1, self.arpStep))
            end
            
            -- Calculate the new note based on scale degree offset
            local targetDegree = self.baseDegree + self.arpStep
            local newNote = getNoteFromDegree(targetDegree, self.baseOctave, scale, root)
            
            -- Update output
            self.outputPitch = noteToCv(newNote)
            self.outputGateTime = self.parameters[5] / 1000.0
            self.clockReceived = true
            
            return {self.outputPitch, 5.0}
        end
        return {}
    end
    
    -- Called every 1ms for continuous processing
    , step = function(self, dt, inputs)
        -- Always track the input pitch for capture on next gate
        self.lastPitchCV = inputs[1]
        
        -- Handle gate timing
        local gateOut = nil
        if self.outputGateTime > 0 then
            self.outputGateTime = self.outputGateTime - dt
            if self.outputGateTime <= 0 then
                gateOut = 0.0  -- Turn gate off
            end
        end
        
        -- If gate closed and no output gate active, ensure output is low
        if not self.gateOpen and self.outputGateTime <= 0 then
            gateOut = 0.0
        end
        
        if gateOut ~= nil then
            return {nil, gateOut}
        end
        return {}
    end
    
    -- Custom display
    , draw = function(self)
        -- Draw standard parameter line at top
        drawStandardParameterLine()
        
        -- Display current state
        local scale = self.parameters[1]
        local root = self.parameters[2]
        local direction = self.parameters[3]
        
        -- Show scale and root
        drawText(5, 28, scaleNames[scale] .. " " .. rootNames[root], 12)
        
        -- Show direction
        drawText(5, 40, "Dir: " .. directionNames[direction], 8)
        
        -- Show current arp step
        local stepStr = "Step: " .. tostring(self.arpStep)
        drawText(100, 40, stepStr, 8)
        
        -- Visual representation of arpeggio position
        local cx = 200
        local cy = 45
        local maxSteps = self.parameters[4]
        
        -- Draw step indicator bar
        local barWidth = 50
        local barHeight = 10
        local barX = cx - barWidth / 2
        local barY = cy - barHeight / 2
        
        drawBox(barX, barY, barX + barWidth, barY + barHeight, 4)
        
        -- Draw current position
        local normalizedStep = (self.arpStep + maxSteps) / (2 * maxSteps)
        normalizedStep = math.max(0, math.min(1, normalizedStep))
        local posX = barX + normalizedStep * barWidth
        drawRectangle(posX - 2, barY, posX + 2, barY + barHeight, 15)
        
        -- Draw center line
        drawLine(cx, barY, cx, barY + barHeight, 8)
        
        -- Show gate state
        if self.gateOpen then
            drawText(5, 55, "GATE", 15)
        end
        
        -- Show output pitch as note name
        local outNote = math.floor(self.outputPitch * 12 + 0.5)
        local outOctave = math.floor(outNote / 12)
        local outSemitone = outNote % 12
        if outSemitone < 0 then
            outSemitone = outSemitone + 12
            outOctave = outOctave - 1
        end
        local noteName = rootNames[(outSemitone % 12) + 1] .. tostring(outOctave)
        drawText(200, 28, "Out: " .. noteName, 12)
    end
}
