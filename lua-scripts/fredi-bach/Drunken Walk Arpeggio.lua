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
-- Display Constants
--------------------------------------------------------------------------------
local DISPLAY_STAGE_LEFT = 24
local DISPLAY_STAGE_WIDTH = 208
local DISPLAY_STEP_BOTTOM = 46
local DISPLAY_TRANSITION_TIME = 0.24
local DISPLAY_EDGE_FLASH_TIME = 0.28
local DISPLAY_GATE_FLASH_TIME = 0.12
local NOTE_NAMES = {
    "C", "C#", "D", "D#", "E", "F",
    "F#", "G", "G#", "A", "A#", "B"
}

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

local function midiToNoteName(midiNote, includeOctave)
    local note = math.floor(midiNote + 0.5)
    local pitchClass = note % 12
    if pitchClass < 0 then pitchClass = pitchClass + 12 end
    local name = NOTE_NAMES[pitchClass + 1]
    if not includeOctave then return name end
    return name .. (math.floor(note / 12) - 1)
end

local function getDisplayStepGeometry(self, step, numSteps)
    local stepWidth = math.floor(DISPLAY_STAGE_WIDTH / numSteps)
    local totalWidth = stepWidth * numSteps
    local startX = math.floor((256 - totalWidth) / 2)
    local offset = self.parameters[2 + step]
    local height = math.floor(
        6 + ((clamp(offset, -24, 24) + 24) / 48) * 18 + 0.5
    )
    local left = startX + (step - 1) * stepWidth + 2
    local right = startX + step * stepWidth - 2
    local top = DISPLAY_STEP_BOTTOM - height
    return left, right, top, (left + right) / 2
end

local function lerp(from, to, amount)
    return from + (to - from) * amount
end

local function smoothStep(amount)
    local clamped = clamp(amount, 0, 1)
    return clamped * clamped * (3 - 2 * clamped)
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

        -- Display-only state captures decisions made by trigger() and is
        -- advanced by step(). It never participates in musical decisions.
        self.display_time = 0
        self.display_previous_step = 1
        self.display_current_step = 1
        self.display_transition_started = -1
        self.display_gate_started = -1
        self.display_edge_hit = 0
        self.display_edge_mode = 1
        self.display_direction = 1
        self.display_probability = 0.5
        self.display_decision_probability = 0.5
        
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
            local previousStep = currentStep
            local newStep = currentStep + direction
            local edgeHit = 0
            if newStep < 1 then
                edgeHit = -1
            elseif newStep > numSteps then
                edgeHit = 1
            end
            currentStep = handleEdge(newStep, numSteps, edgeMode)

            self.display_previous_step = previousStep
            self.display_current_step = currentStep
            self.display_transition_started = self.display_time
            self.display_gate_started = self.display_time
            self.display_edge_hit = edgeHit
            self.display_edge_mode = edgeMode
            self.display_direction = direction
            self.display_decision_probability = probability
            
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

            self.display_previous_step = 1
            self.display_current_step = 1
            self.display_transition_started = -1
            self.display_gate_started = self.display_time
            self.display_edge_hit = 0
            self.display_direction = 1
            
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
        lastProbCV = inputs[2] or 0

        self.display_time = self.display_time + dt
        local probabilityTarget = calculateProbability(
            lastProbCV,
            self.parameters[11]
        )
        local displayAlpha = clamp(dt * 10, 0, 1)
        self.display_probability = self.display_probability
            + (probabilityTarget - self.display_probability) * displayAlpha
        
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
        drawStandardParameterLine()

        local numSteps = self.parameters[1]
        local rootNote = self.parameters[2]
        local edgeMode = self.parameters[12]
        local probability = clamp(self.display_probability, 0, 1)
        local probPercent = math.floor(probability * 100 + 0.5)
        local visibleCurrentStep = clamp(currentStep, 1, numSteps)
        local visiblePreviousStep = clamp(
            self.display_previous_step,
            1,
            numSteps
        )
        local visibleTargetStep = clamp(
            self.display_current_step,
            1,
            numSteps
        )

        -- Each note offset becomes a stair height on a stable -24..+24 scale.
        for i = 1, numSteps do
            local left, right, top, centreX = getDisplayStepGeometry(
                self,
                i,
                numSteps
            )
            local midiNote = rootNote + self.parameters[2 + i]
            if i == visibleCurrentStep then
                drawRectangle(
                    left,
                    top,
                    right,
                    DISPLAY_STEP_BOTTOM,
                    9
                )
                drawLine(left, top, right, top, 15)
                drawTinyText(
                    centreX,
                    DISPLAY_STEP_BOTTOM - 1,
                    midiToNoteName(midiNote, false),
                    0,
                    "centre"
                )
            else
                drawRectangle(
                    left,
                    top,
                    right,
                    DISPLAY_STEP_BOTTOM,
                    2
                )
                drawBox(left, top, right, DISPLAY_STEP_BOTTOM, 5)
                drawTinyText(
                    centreX,
                    DISPLAY_STEP_BOTTOM - 1,
                    midiToNoteName(midiNote, false),
                    8,
                    "centre"
                )
            end
        end

        local previousLeft, previousRight, previousTop, previousX =
            getDisplayStepGeometry(
                self,
                visiblePreviousStep,
                numSteps
            )
        local currentLeft, currentRight, currentTop, currentX =
            getDisplayStepGeometry(
                self,
                visibleTargetStep,
                numSteps
            )
        local transitionAge = self.display_time
            - self.display_transition_started
        local transitioning = (
            self.display_transition_started >= 0
            and transitionAge < DISPLAY_TRANSITION_TIME
        )
        local transition = smoothStep(
            transitionAge / DISPLAY_TRANSITION_TIME
        )
        local walkerX = currentX
        local walkerY = currentTop - 1
        local lean = 0

        if transitioning then
            local edgeHit = self.display_edge_hit
            local mode = self.display_edge_mode
            if edgeHit ~= 0 and mode == 1 then
                -- Wrap drops through one portal and reappears at the other.
                if transition < 0.5 then
                    local portalX = edgeHit > 0 and 242 or 14
                    local progress = transition / 0.5
                    walkerX = lerp(previousX, portalX, progress)
                    walkerY = previousTop - 1 + progress * 5
                else
                    local portalX = edgeHit > 0 and 14 or 242
                    local progress = (transition - 0.5) / 0.5
                    walkerX = lerp(portalX, currentX, progress)
                    walkerY = lerp(
                        currentTop + 4,
                        currentTop - 1,
                        progress
                    )
                end
            elseif edgeHit ~= 0 then
                -- Bounce and Sticky first press into the wall, then recoil.
                local wallX = edgeHit > 0
                    and DISPLAY_STAGE_LEFT + DISPLAY_STAGE_WIDTH + 4
                    or DISPLAY_STAGE_LEFT - 4
                if transition < 0.35 then
                    local progress = transition / 0.35
                    walkerX = lerp(previousX, wallX, progress)
                    walkerY = previousTop - 1 - math.sin(
                        progress * math.pi
                    ) * 3
                else
                    local progress = (transition - 0.35) / 0.65
                    walkerX = lerp(wallX, currentX, progress)
                    walkerY = lerp(
                        previousTop - 1,
                        currentTop - 1,
                        progress
                    ) - math.sin(progress * math.pi) * 4
                end
            else
                walkerX = lerp(previousX, currentX, transition)
                walkerY = lerp(
                    previousTop - 1,
                    currentTop - 1,
                    transition
                ) - math.sin(transition * math.pi) * 5
            end
            lean = self.display_direction
            if (
                self.display_edge_hit ~= 0
                and self.display_edge_mode ~= 1
                and transition >= 0.35
            ) then
                lean = -self.display_direction
            end
        else
            lean = 0
        end

        -- A short landing ring preserves the 20ms gate event at 30fps.
        local gateAge = self.display_time - self.display_gate_started
        if (
            self.display_gate_started >= 0
            and gateAge < DISPLAY_GATE_FLASH_TIME
        ) then
            local gateProgress = clamp(
                gateAge / DISPLAY_GATE_FLASH_TIME,
                0,
                1
            )
            local gateShade = math.floor(15 - gateProgress * 8)
            drawSmoothCircle(
                currentX,
                currentTop - 1,
                2 + gateProgress * 5,
                gateShade
            )
        end

        -- Portals and walls only brighten for the corresponding edge event.
        local edgeAge = self.display_time - self.display_transition_started
        if (
            self.display_edge_hit ~= 0
            and self.display_transition_started >= 0
            and edgeAge < DISPLAY_EDGE_FLASH_TIME
        ) then
            local edgeShade = math.floor(
                15 - clamp(
                    edgeAge / DISPLAY_EDGE_FLASH_TIME,
                    0,
                    1
                ) * 9
            )
            if self.display_edge_mode == 1 then
                drawCircle(14, 38, 3, edgeShade)
                drawCircle(242, 38, 3, edgeShade)
            else
                local wallX = self.display_edge_hit > 0
                    and DISPLAY_STAGE_LEFT + DISPLAY_STAGE_WIDTH + 4
                    or DISPLAY_STAGE_LEFT - 4
                drawLine(wallX, 22, wallX, 47, edgeShade)
                drawLine(
                    wallX + self.display_edge_hit * -4,
                    25,
                    wallX,
                    29,
                    edgeShade
                )
                drawLine(
                    wallX + self.display_edge_hit * -4,
                    44,
                    wallX,
                    40,
                    edgeShade
                )
            end
        end

        -- Two legs, a leaning body, and a bright head make the walker legible.
        local hipX = walkerX
        local hipY = walkerY - 4
        local headX = hipX + lean * 2
        local headY = walkerY - 9
        drawSmoothLine(walkerX - 3, walkerY, hipX, hipY, 13)
        drawSmoothLine(walkerX + 3, walkerY, hipX, hipY, 13)
        drawSmoothLine(hipX, hipY, headX, headY + 1, 14)
        drawSmoothCircle(headX, headY, 1.5, 15)

        local currentMidi = rootNote
            + self.parameters[2 + visibleCurrentStep]
        drawTinyText(
            walkerX,
            math.max(13, walkerY - 11),
            midiToNoteName(currentMidi, true),
            15,
            "centre"
        )

        -- Forward probability tilts a balance and moves its weight.
        local balanceLeftX = 96
        local balanceRightX = 160
        local balanceY = 53
        local tilt = (probability - 0.5) * 8
        local leftY = balanceY + tilt
        local rightY = balanceY - tilt
        local weightX = lerp(balanceLeftX, balanceRightX, probability)
        local weightY = lerp(leftY, rightY, probability)
        drawSmoothLine(
            balanceLeftX,
            leftY,
            balanceRightX,
            rightY,
            7
        )
        drawLine(128, balanceY, 128, 58, 4)
        drawSmoothCircle(weightX, weightY - 1.5, 2, 12)
        if transitioning then
            local decisionProbability = clamp(
                self.display_decision_probability,
                0,
                1
            )
            local decisionX = lerp(
                balanceLeftX,
                balanceRightX,
                decisionProbability
            )
            local decisionY = lerp(
                leftY,
                rightY,
                decisionProbability
            )
            drawSmoothCircle(decisionX, decisionY - 1.5, 0.8, 5)
        end

        local edgeName = edgeMode == 1
            and "WRAP"
            or (edgeMode == 2 and "BOUNCE" or "STICKY")
        drawTinyText(4, 63, edgeName, 7)
        drawTinyText(
            252,
            63,
            probPercent .. "% FWD",
            10,
            "right"
        )

        return true
    end
}
