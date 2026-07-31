-- Drunken Walk Sequential Switch
--[[
Probabilistic sequential switch with CV-controlled forward/backward movement.
Clock input advances position based on probability setting - higher values
favor forward movement, lower values favor backward. Great for generative
patches and adding controlled randomness to CV routing.
]]

--------------------------------------------------------------------------------
-- Local state
--------------------------------------------------------------------------------
local currentStep = 1          -- Current active step (1-indexed)
local heldValues = {}          -- S&H values for each output
local lastDirection = 1        -- Track last direction for bounce mode (1=fwd, -1=back)

--------------------------------------------------------------------------------
-- Display constants
--------------------------------------------------------------------------------
local DISPLAY_CUP_LEFT = 34
local DISPLAY_CUP_RIGHT = 222
local DISPLAY_CUP_TOP = 28
local DISPLAY_CUP_BOTTOM = 41
local DISPLAY_TRANSITION_TIME = 0.24
local DISPLAY_EDGE_FLASH_TIME = 0.28
local DISPLAY_OUTPUT_FLASH_TIME = 0.14

--------------------------------------------------------------------------------
-- Helper: Clamp value to range
--------------------------------------------------------------------------------
local function clamp(value, min, max)
    if value < min then return min end
    if value > max then return max end
    return value
end

--------------------------------------------------------------------------------
-- Helper: Calculate next step based on probability and edge mode
--------------------------------------------------------------------------------
local function calculateNextStep(current, numSteps, goForward, edgeMode)
    local next
    local direction = goForward and 1 or -1
    
    if edgeMode == 1 then
        -- Wrap mode
        next = current + direction
        if next > numSteps then
            next = 1
        elseif next < 1 then
            next = numSteps
        end
        lastDirection = direction
    else
        -- Bounce mode
        -- If we're at an edge, reverse direction
        if current == numSteps and direction == 1 then
            direction = -1
        elseif current == 1 and direction == -1 then
            direction = 1
        end
        -- Apply movement
        next = current + direction
        -- Clamp just in case
        next = clamp(next, 1, numSteps)
        lastDirection = direction
    end
    
    return next
end

local function lerp(from, to, amount)
    return from + (to - from) * amount
end

local function smoothStep(amount)
    local clamped = clamp(amount, 0, 1)
    return clamped * clamped * (3 - 2 * clamped)
end

local function getCupX(step, numSteps)
    if numSteps <= 1 then return 128 end
    return DISPLAY_CUP_LEFT
        + (step - 1) / (numSteps - 1)
        * (DISPLAY_CUP_RIGHT - DISPLAY_CUP_LEFT)
end

local function getCupHalfWidth(numSteps)
    if numSteps <= 1 then return 10 end
    local spacing = (DISPLAY_CUP_RIGHT - DISPLAY_CUP_LEFT)
        / (numSteps - 1)
    return clamp(spacing * 0.32, 6, 10)
end

--------------------------------------------------------------------------------
-- Main script table
--------------------------------------------------------------------------------
return
{
    name = 'Drunken Walk Switch'
    , author = 'Claude'
    
    ------------------------------------------------------------------------
    -- Initialization
    ------------------------------------------------------------------------
    , init = function(self)
        -- Initialize held values for all 8 possible outputs
        for i = 1, 8 do
            heldValues[i] = 0.0
        end

        -- Display state captures routing decisions and bounded sampled values.
        -- It is deliberately excluded from serialise().
        self.display_time = 0
        self.display_previous_step = 1
        self.display_current_step = 1
        self.display_transition_started = -1
        self.display_output_started = -1
        self.display_edge_hit = 0
        self.display_edge_mode = 1
        self.display_probability = 0.75
        self.display_values = {}
        for i = 1, 8 do
            self.display_values[i] = 0
        end
        
        -- Seed random number generator
        math.randomseed(os.time())
        
        return
        {
            inputs = {
                kCV,      -- Type: Note Sequencer (V/Oct), Synced: true, Division: 1/4
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/4
                kCV,      -- Type: Sine LFO, Synced: true, Division: 2 bars
                kTrigger, -- Type: Trigger, Synced: true, Division: 2 bars
            }
            , inputNames = { 
                "Signal", 
                "Clock", 
                "Prob CV", 
                "Reset" 
            }
            , outputs = { 
                kStepped, -- Type: Kick Trigger
                kStepped, -- Type: Snare Trigger
                kStepped, -- Type: Hi-hat Trigger
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kLinear,  -- Type: Synth Note
            }
            , outputNames = { 
                "Step 1", "Step 2", "Step 3", "Step 4",
                "Step 5", "Step 6", "Step 7", "Step 8",
                "Step CV"
            }
            , parameters = 
            {
                { "Steps", 2, 8, 8 }
                , { "Probability", 0, 100, 75, kPercent }
                , { "Edge Mode", { "Wrap", "Bounce" }, 1 }
                , { "Output Mode", { "Gate", "S&H" }, 2 }
            }
        }
    end
    
    ------------------------------------------------------------------------
    -- Trigger handler (for Clock and Reset inputs)
    ------------------------------------------------------------------------
    , trigger = function(self, input)
        local numSteps = self.parameters[1]
        local baseProbability = self.parameters[2] / 100.0
        local edgeMode = self.parameters[3]
        local outputMode = self.parameters[4]
        
        if input == 2 then
            -- Clock input triggered
            -- Get probability CV (input 3) - need to read from bus
            -- Note: In trigger context, we use the last known CV value
            -- Scale: ±5V = ±50% probability adjustment
            local probCV = self.lastProbCV or 0
            local adjustedProb = clamp(baseProbability + (probCV / 10.0), 0, 1)
            
            -- Determine direction based on probability
            local roll = math.random()
            local goForward = roll < adjustedProb
            
            -- Calculate next step
            local previousStep = currentStep
            local requestedDirection = goForward and 1 or -1
            local edgeHit = 0
            if (
                previousStep == 1
                and requestedDirection < 0
            ) then
                edgeHit = -1
            elseif (
                previousStep == numSteps
                and requestedDirection > 0
            ) then
                edgeHit = 1
            end
            currentStep = calculateNextStep(currentStep, numSteps, goForward, edgeMode)

            self.display_previous_step = previousStep
            self.display_current_step = currentStep
            self.display_transition_started = self.display_time
            self.display_output_started = self.display_time
            self.display_edge_hit = edgeHit
            self.display_edge_mode = edgeMode
            
        elseif input == 4 then
            -- Reset input triggered
            currentStep = 1
            lastDirection = 1

            self.display_previous_step = 1
            self.display_current_step = 1
            self.display_transition_started = -1
            self.display_output_started = self.display_time
            self.display_edge_hit = 0
        end
        
        -- Build output table
        local outs = {}
        local signalValue = self.lastSignal or 0
        
        -- Update held value for current step
        heldValues[currentStep] = signalValue
        self.display_values[currentStep] = clamp(signalValue / 10, -1, 1)
        
        -- Set outputs based on mode
        for i = 1, 8 do
            if i <= numSteps then
                if i == currentStep then
                    outs[i] = signalValue
                else
                    if outputMode == 1 then
                        -- Gate mode: inactive outputs go to 0V
                        outs[i] = 0.0
                    else
                        -- S&H mode: outputs hold their last active value
                        outs[i] = heldValues[i]
                    end
                end
            else
                -- Steps beyond numSteps are always 0V
                outs[i] = 0.0
            end
        end
        
        -- Step CV output (0-10V scaled to number of steps)
        outs[9] = ((currentStep - 1) / (numSteps - 1)) * 10.0
        
        return outs
    end
    
    ------------------------------------------------------------------------
    -- Step function (called every 1ms)
    ------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        -- Cache CV inputs for use in trigger function
        self.lastSignal = inputs[1]
        self.lastProbCV = inputs[3] or 0

        self.display_time = self.display_time + dt
        local probabilityTarget = clamp(
            self.parameters[2] / 100.0 + self.lastProbCV / 10.0,
            0,
            1
        )
        local displayAlpha = clamp(dt * 10, 0, 1)
        self.display_probability = self.display_probability
            + (probabilityTarget - self.display_probability) * displayAlpha
        
        local numSteps = self.parameters[1]
        local outputMode = self.parameters[4]
        
        -- Continuously update outputs (important for Gate mode and signal changes)
        local outs = {}
        local signalValue = inputs[1]
        
        for i = 1, 8 do
            if i <= numSteps then
                if i == currentStep then
                    outs[i] = signalValue
                    heldValues[i] = signalValue  -- Update held value
                    self.display_values[i] = clamp(signalValue / 10, -1, 1)
                else
                    if outputMode == 1 then
                        -- Gate mode
                        outs[i] = 0.0
                    else
                        -- S&H mode
                        outs[i] = heldValues[i]
                    end
                end
            else
                outs[i] = 0.0
            end
        end
        
        -- Step CV
        if numSteps > 1 then
            outs[9] = ((currentStep - 1) / (numSteps - 1)) * 10.0
        else
            outs[9] = 0.0
        end
        
        return outs
    end
    
    ------------------------------------------------------------------------
    -- Custom display
    ------------------------------------------------------------------------
    , draw = function(self)
        drawStandardParameterLine()

        local numSteps = self.parameters[1]
        local edgeMode = self.parameters[3]
        local outputMode = self.parameters[4]
        local probability = clamp(self.display_probability, 0, 1)
        local probabilityPercent = math.floor(probability * 100 + 0.5)
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
        local activeX = getCupX(visibleCurrentStep, numSteps)
        local cupHalfWidth = getCupHalfWidth(numSteps)

        -- One input rail feeds only the selected cup and its output stem.
        drawSmoothLine(4, 24, activeX, 24, 8)
        drawSmoothLine(activeX, 24, 252, 24, 2)
        drawSmoothLine(activeX, 24, activeX, 48, 11)
        drawSmoothLine(activeX - 6, 48, activeX + 6, 48, 11)

        local outputAge = self.display_time - self.display_output_started
        local outputFlash = (
            self.display_output_started >= 0
            and outputAge < DISPLAY_OUTPUT_FLASH_TIME
        )

        -- Shallow numbered cups retain bipolar sampled values in S&H mode.
        for i = 1, numSteps do
            local cupX = getCupX(i, numSteps)
            local value = clamp(self.display_values[i] or 0, -1, 1)
            local magnitude = math.abs(value)
            local cupShade = i == visibleCurrentStep and 10 or 5
            if (
                outputMode == 1
                and i == visibleCurrentStep
                and outputFlash
            ) then
                cupShade = math.floor(
                    15 - outputAge / DISPLAY_OUTPUT_FLASH_TIME * 5
                )
            end

            if outputMode == 2 and magnitude > 0.001 then
                local fillTop
                local fillBottom
                if value > 0 then
                    fillTop = 34 - magnitude * 6
                    fillBottom = 34
                else
                    fillTop = 34
                    fillBottom = 34 + magnitude * 6
                end
                drawRectangle(
                    cupX - cupHalfWidth + 2,
                    fillTop,
                    cupX + cupHalfWidth - 2,
                    fillBottom,
                    math.floor(5 + magnitude * 7)
                )
            end

            drawSmoothLine(
                cupX - cupHalfWidth,
                DISPLAY_CUP_TOP,
                cupX - cupHalfWidth + 2,
                DISPLAY_CUP_BOTTOM,
                cupShade
            )
            drawSmoothLine(
                cupX - cupHalfWidth + 2,
                DISPLAY_CUP_BOTTOM,
                cupX + cupHalfWidth - 2,
                DISPLAY_CUP_BOTTOM,
                cupShade
            )
            drawSmoothLine(
                cupX + cupHalfWidth - 2,
                DISPLAY_CUP_BOTTOM,
                cupX + cupHalfWidth,
                DISPLAY_CUP_TOP,
                cupShade
            )
            drawLine(
                cupX - cupHalfWidth + 2,
                34,
                cupX + cupHalfWidth - 2,
                34,
                3
            )
            drawTinyText(
                cupX,
                40,
                tostring(i),
                i == visibleCurrentStep and 15 or 7,
                "centre"
            )
        end

        -- The marble follows the captured decision, including edge behavior.
        local transitionAge = self.display_time
            - self.display_transition_started
        local transitioning = (
            self.display_transition_started >= 0
            and transitionAge < DISPLAY_TRANSITION_TIME
        )
        local transition = smoothStep(
            transitionAge / DISPLAY_TRANSITION_TIME
        )
        local previousX = getCupX(visiblePreviousStep, numSteps)
        local targetX = getCupX(visibleTargetStep, numSteps)
        local marbleX = targetX
        local marbleY = 27

        if transitioning then
            if (
                self.display_edge_hit ~= 0
                and self.display_edge_mode == 1
            ) then
                if transition < 0.5 then
                    local portalX = self.display_edge_hit > 0 and 242 or 14
                    local progress = transition / 0.5
                    marbleX = lerp(previousX, portalX, progress)
                    marbleY = 27 + progress * 5
                else
                    local portalX = self.display_edge_hit > 0 and 14 or 242
                    local progress = (transition - 0.5) / 0.5
                    marbleX = lerp(portalX, targetX, progress)
                    marbleY = lerp(32, 27, progress)
                end
            elseif self.display_edge_hit ~= 0 then
                local wallX = self.display_edge_hit > 0 and 236 or 20
                if transition < 0.35 then
                    local progress = transition / 0.35
                    marbleX = lerp(previousX, wallX, progress)
                    marbleY = 27 - math.sin(progress * math.pi) * 5
                else
                    local progress = (transition - 0.35) / 0.65
                    marbleX = lerp(wallX, targetX, progress)
                    marbleY = 27 - math.sin(progress * math.pi) * 9
                end
            else
                marbleX = lerp(previousX, targetX, transition)
                marbleY = 27 - math.sin(transition * math.pi) * 11
            end
        end

        drawSmoothCircle(marbleX, marbleY, 3, 15)

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
                drawCircle(14, 27, 3, edgeShade)
                drawCircle(242, 27, 3, edgeShade)
            else
                local wallX = self.display_edge_hit > 0 and 236 or 20
                drawLine(wallX, 15, wallX, 35, edgeShade)
                drawLine(
                    wallX - self.display_edge_hit * 4,
                    18,
                    wallX,
                    22,
                    edgeShade
                )
                drawLine(
                    wallX - self.display_edge_hit * 4,
                    32,
                    wallX,
                    28,
                    edgeShade
                )
            end
        end

        -- Effective probability becomes a small gravity arrow.
        local gravityX = 76
        local gravityBaseY = 56
        local gravityTipX = gravityX + (probability - 0.5) * 34
        local gravityTipY = 50
        drawSmoothLine(
            gravityX,
            gravityBaseY,
            gravityTipX,
            gravityTipY,
            10
        )
        local arrowDirection = gravityTipX >= gravityX and 1 or -1
        drawLine(
            gravityTipX - arrowDirection * 4,
            gravityTipY,
            gravityTipX,
            gravityTipY,
            10
        )
        drawLine(
            gravityTipX,
            gravityTipY,
            gravityTipX - arrowDirection * 2,
            gravityTipY + 4,
            10
        )

        -- Fixed 1-8 dots make the linear Step CV output immediately legible.
        drawTinyText(142, 56, "CV", 5)
        drawLine(158, 53, 228, 53, 3)
        for i = 1, 8 do
            local dotX = 158 + (i - 1) * 10
            local shade = i == visibleCurrentStep
                and 15
                or (i <= numSteps and 6 or 2)
            drawSmoothCircle(
                dotX,
                53,
                i == visibleCurrentStep and 1.8 or 0.8,
                shade
            )
        end

        local modeName = outputMode == 1 and "GATE" or "S&H"
        local edgeName = edgeMode == 1 and "WRAP" or "BOUNCE"
        drawTinyText(4, 63, modeName, 8)
        drawTinyText(128, 63, edgeName, 7, "centre")
        drawTinyText(
            252,
            63,
            probabilityPercent .. "% FWD",
            10,
            "right"
        )

        return true
    end
    
    ------------------------------------------------------------------------
    -- Serialisation for preset save/load
    ------------------------------------------------------------------------
    , serialise = function(self)
        return {
            currentStep = currentStep,
            heldValues = heldValues,
            lastDirection = lastDirection
        }
    end
}
