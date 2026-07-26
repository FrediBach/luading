-- Drunken Walk Arpeggio
--[[
Probabilistic arpeggiator that stumbles forward and backward through a 
note sequence. Clock input advances steps, CV controls direction probability.
At 50% probability, movement is equally likely forward or backward.
Higher probability favors forward motion, lower favors backward.
Perfect for generative melodies and evolving patterns.
]]

--------------------------------------------------------------------------------
-- Configuration Constants
--------------------------------------------------------------------------------
local MAX_STEPS = 8
local GATE_TIME = 0.02          -- Gate duration in seconds (20ms)
local CV_SCALE = 0.1            -- CV input scaling: ±5V maps to ±50% probability

--------------------------------------------------------------------------------
-- Local State Variables
--------------------------------------------------------------------------------
local currentStep = 1           -- Current position in the arpeggio (1-indexed)
local lastProbCV = 0            -- Cached probability CV value
local gateTimer = 0             -- Countdown for gate high duration
local lastDirection = 1         -- Track last movement direction for display

--------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------

--- Convert MIDI note number to V/Oct voltage (0V = C4 = MIDI 60)
local function midiToVolt(midiNote)
    return (midiNote - 60) / 12
end

--- Clamp a value between min and max
local function clamp(value, minVal, maxVal)
    return math.max(minVal, math.min(maxVal, value))
end

--- Calculate final probability from CV and parameter offset
local function calculateProbability(probCV, probOffset)
    -- Base probability is 50% (equal chance forward/backward)
    -- CV adds ±50% at ±5V
    -- Parameter offset adds ±50%
    local prob = 0.5 + (probCV * CV_SCALE) + (probOffset / 100)
    return clamp(prob, 0, 1)
end

--- Handle edge behavior when step goes out of bounds
local function handleEdge(step, numSteps, edgeMode)
    if step >= 1 and step <= numSteps then
        return step
    end
    
    if edgeMode == 1 then       -- Wrap
        if step > numSteps then
            return 1
        else
            return numSteps
        end
    elseif edgeMode == 2 then   -- Bounce
        if step > numSteps then
            return numSteps - 1
        else
            return 2
        end
    else                        -- Sticky (edgeMode == 3)
        return clamp(step, 1, numSteps)
    end
end

--------------------------------------------------------------------------------
-- Main Script Table
--------------------------------------------------------------------------------
return
{
    name = 'Drunken Walk Arp'
    , author = 'Expert Sleepers Ltd'
    
    ----------------------------------------------------------------------------
    -- Initialization
    ----------------------------------------------------------------------------
    , init = function(self)
        -- Initialize state
        currentStep = 1
        lastProbCV = 0
        gateTimer = 0
        lastDirection = 1
        
        return
        {
            -- Input definitions
            -- Input 1: Clock trigger - advances the arpeggio
            -- Input 2: Probability CV - controls forward/backward bias
            -- Input 3: Reset trigger - returns to step 1
            inputs = { kTrigger, kCV, kTrigger }
            , inputNames = { "Clock", "Prob CV", "Reset" }
            
            -- Output definitions
            -- Output 1: V/Oct pitch CV (linear for smooth portamento if desired)
            -- Output 2: Gate output (stepped, on/off)
            , outputs = { kLinear, kStepped }
            , outputNames = { "V/Oct", "Gate" }
            
            -- Parameter definitions
            , parameters =
            {
                -- Arpeggio structure
                { "Steps", 2, MAX_STEPS, 4 }                    -- [1] Number of active steps
                , { "Root", 0, 127, 48, kMIDINote }             -- [2] Root note (C3 default)
                
                -- Note offsets (semitones from root)
                , { "Note 1", -24, 24, 0, kSemitones }          -- [3]
                , { "Note 2", -24, 24, 4, kSemitones }          -- [4] Major 3rd
                , { "Note 3", -24, 24, 7, kSemitones }          -- [5] Perfect 5th
                , { "Note 4", -24, 24, 12, kSemitones }         -- [6] Octave
                , { "Note 5", -24, 24, 11, kSemitones }         -- [7] Major 7th
                , { "Note 6", -24, 24, 9, kSemitones }          -- [8] Major 6th
                , { "Note 7", -24, 24, 5, kSemitones }          -- [9] Perfect 4th
                , { "Note 8", -24, 24, 2, kSemitones }          -- [10] Major 2nd
                
                -- Probability control
                , { "Prob Ofs", -50, 50, 0, kPercent }          -- [11] Manual probability offset
                
                -- Edge behavior when step goes out of bounds
                , { "Edge", { "Wrap", "Bounce", "Sticky" }, 1 } -- [12]
            }
        }
    end
    
    ----------------------------------------------------------------------------
    -- Trigger Handler (called when trigger inputs fire)
    ----------------------------------------------------------------------------
    , trigger = function(self, input)
        local outputs = {}
        
        if input == 1 then
            -----------------------------------------------------------------
            -- CLOCK TRIGGER: Advance the arpeggio with probabilistic direction
            -----------------------------------------------------------------
            local numSteps = self.parameters[1]
            local rootNote = self.parameters[2]
            local probOffset = self.parameters[11]
            local edgeMode = self.parameters[12]
            
            -- Calculate probability of moving forward
            local probability = calculateProbability(lastProbCV, probOffset)
            
            -- Make the drunken decision: forward or backward?
            local roll = math.random()
            local direction = (roll < probability) and 1 or -1
            lastDirection = direction
            
            -- Calculate new step position with edge handling
            local newStep = currentStep + direction
            currentStep = handleEdge(newStep, numSteps, edgeMode)
            
            -- Get the note offset for current step (parameters 3-10 are notes 1-8)
            local noteOffset = self.parameters[2 + currentStep]
            
            -- Calculate output voltage
            local pitch = midiToVolt(rootNote + noteOffset)
            
            -- Start gate
            gateTimer = GATE_TIME
            
            -- Return pitch and gate high
            outputs[1] = pitch
            outputs[2] = 5.0
            
        elseif input == 3 then
            -----------------------------------------------------------------
            -- RESET TRIGGER: Return to step 1
            -----------------------------------------------------------------
            currentStep = 1
            lastDirection = 1
            
            -- Output the first note
            local rootNote = self.parameters[2]
            local noteOffset = self.parameters[3]  -- Note 1
            local pitch = midiToVolt(rootNote + noteOffset)
            
            -- Trigger gate on reset too
            gateTimer = GATE_TIME
            
            outputs[1] = pitch
            outputs[2] = 5.0
        end
        
        return outputs
    end
    
    ----------------------------------------------------------------------------
    -- Step Function (called every ~1ms for CV reading and gate timing)
    ----------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        local outputs = {}
        
        -- Cache the probability CV for use in trigger handler
        -- Input 2 is probability CV, scale from voltage to useful range
        lastProbCV = inputs[2]
        
        -- Handle gate timing
        if gateTimer > 0 then
            gateTimer = gateTimer - dt
            if gateTimer <= 0 then
                -- Gate time elapsed, turn gate off
                gateTimer = 0
                outputs[2] = 0.0
            end
        end
        
        return outputs
    end
    
    ----------------------------------------------------------------------------
    -- Custom Display (called at ~30fps)
    ----------------------------------------------------------------------------
    , draw = function(self)
        local numSteps = self.parameters[1]
        local probOffset = self.parameters[11]
        
        -- Calculate current probability for display
        local probability = calculateProbability(lastProbCV, probOffset)
        local probPercent = math.floor(probability * 100 + 0.5)
        
        -- ===== Step Indicator Display =====
        -- Draw boxes for each step, highlight current step
        local boxWidth = 14
        local boxHeight = 16
        local spacing = 4
        local totalWidth = numSteps * boxWidth + (numSteps - 1) * spacing
        local startX = math.floor((256 - totalWidth) / 2)
        local boxY = 22
        
        for i = 1, numSteps do
            local x = startX + (i - 1) * (boxWidth + spacing)
            
            if i == currentStep then
                -- Current step: filled bright rectangle
                drawRectangle(x, boxY, x + boxWidth, boxY + boxHeight, 15)
                -- Draw step number in inverse
                drawTinyText(x + boxWidth/2, boxY + boxHeight - 4, tostring(i), 0, "centre")
            else
                -- Other steps: hollow box
                drawBox(x, boxY, x + boxWidth, boxY + boxHeight, 6)
                drawTinyText(x + boxWidth/2, boxY + boxHeight - 4, tostring(i), 8, "centre")
            end
        end
        
        -- ===== Current Note Display =====
        local noteOffset = self.parameters[2 + currentStep]
        local rootNote = self.parameters[2]
        local noteNames = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" }
        local midiNote = rootNote + noteOffset
        local noteName = noteNames[(midiNote % 12) + 1]
        local octave = math.floor(midiNote / 12) - 1
        
        drawText(128, 16, noteName .. octave, 15, "centre")
        
        -- ===== Probability Bar =====
        -- Visual representation of forward/backward probability
        local barY = 48
        local barHeight = 6
        local barWidth = 160
        local barStartX = (256 - barWidth) / 2
        local barCenterX = barStartX + barWidth / 2
        
        -- Draw bar outline
        drawBox(barStartX, barY, barStartX + barWidth, barY + barHeight, 4)
        
        -- Draw center line (50% mark)
        drawLine(barCenterX, barY - 2, barCenterX, barY + barHeight + 2, 8)
        
        -- Draw probability indicator
        local indicatorX = barStartX + (probability * barWidth)
        drawRectangle(indicatorX - 2, barY - 1, indicatorX + 2, barY + barHeight + 1, 15)
        
        -- Labels
        drawTinyText(barStartX - 2, barY + 4, "<", 8, "right")
        drawTinyText(barStartX + barWidth + 2, barY + 4, ">", 8)
        
        -- ===== Probability Percentage =====
        drawText(128, 62, probPercent .. "% fwd", 10, "centre")
        
        -- ===== Direction Arrow =====
        local arrowX = 230
        local arrowY = 30
        if lastDirection > 0 then
            drawText(arrowX, arrowY, ">", 12, "centre")
        else
            drawText(arrowX, arrowY, "<", 12, "centre")
        end
    end
}
