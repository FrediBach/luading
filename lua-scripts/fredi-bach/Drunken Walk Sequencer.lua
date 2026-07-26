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
        
        -- Seed random number generator
        math.randomseed(os.time())
        
        return
        {
            inputs = { kCV, kTrigger, kCV, kTrigger }
            , inputNames = { 
                "Signal", 
                "Clock", 
                "Prob CV", 
                "Reset" 
            }
            , outputs = { 
                kStepped, kStepped, kStepped, kStepped,  -- Steps 1-4
                kStepped, kStepped, kStepped, kStepped,  -- Steps 5-8
                kLinear                                   -- Step CV output
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
            currentStep = calculateNextStep(currentStep, numSteps, goForward, edgeMode)
            
        elseif input == 4 then
            -- Reset input triggered
            currentStep = 1
            lastDirection = 1
        end
        
        -- Build output table
        local outs = {}
        local signalValue = self.lastSignal or 0
        
        -- Update held value for current step
        heldValues[currentStep] = signalValue
        
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
        self.lastProbCV = inputs[3]
        
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
        local numSteps = self.parameters[1]
        local probability = self.parameters[2]
        local edgeMode = self.parameters[3]
        local outputMode = self.parameters[4]
        
        -- Calculate layout
        local stepWidth = 24
        local totalWidth = numSteps * stepWidth
        local startX = (256 - totalWidth) / 2
        local centerY = 38
        local boxHeight = 20
        
        -- Draw step boxes
        for i = 1, numSteps do
            local x = startX + (i - 1) * stepWidth
            local boxLeft = x + 2
            local boxRight = x + stepWidth - 2
            local boxTop = centerY - boxHeight / 2
            local boxBottom = centerY + boxHeight / 2
            
            if i == currentStep then
                -- Active step: filled box
                drawRectangle(boxLeft, boxTop, boxRight, boxBottom, 15)
                drawText(x + stepWidth / 2, centerY + 4, tostring(i), 0, "centre")
            else
                -- Inactive step: outline only
                drawBox(boxLeft, boxTop, boxRight, boxBottom, 8)
                drawText(x + stepWidth / 2, centerY + 4, tostring(i), 8, "centre")
            end
        end
        
        -- Draw direction indicator
        local arrowY = centerY + boxHeight / 2 + 8
        local arrowX = startX + (currentStep - 0.5) * stepWidth
        
        if lastDirection > 0 then
            -- Forward arrow
            drawLine(arrowX - 8, arrowY, arrowX + 8, arrowY, 12)
            drawLine(arrowX + 4, arrowY - 3, arrowX + 8, arrowY, 12)
            drawLine(arrowX + 4, arrowY + 3, arrowX + 8, arrowY, 12)
        else
            -- Backward arrow
            drawLine(arrowX - 8, arrowY, arrowX + 8, arrowY, 12)
            drawLine(arrowX - 4, arrowY - 3, arrowX - 8, arrowY, 12)
            drawLine(arrowX - 4, arrowY + 3, arrowX - 8, arrowY, 12)
        end
        
        -- Draw probability bar at bottom
        local barY = 58
        local barWidth = 100
        local barX = (256 - barWidth) / 2
        local probWidth = (probability / 100.0) * barWidth
        
        -- Draw bar background
        drawBox(barX, barY - 3, barX + barWidth, barY + 3, 4)
        -- Draw probability fill
        if probWidth > 0 then
            drawRectangle(barX, barY - 2, barX + probWidth, barY + 2, 10)
        end
        -- Draw center mark (50%)
        drawLine(barX + barWidth / 2, barY - 4, barX + barWidth / 2, barY + 4, 6)
        
        -- Labels
        drawTinyText(barX - 2, barY + 2, "B", 6, "right")
        drawTinyText(barX + barWidth + 2, barY + 2, "F", 6)
        
        -- Mode indicators in corners
        local modeStr = (edgeMode == 1) and "WRAP" or "BNCE"
        local outStr = (outputMode == 1) and "GATE" or "S&H"
        drawTinyText(4, 62, modeStr, 6)
        drawTinyText(252, 62, outStr, 6, "right")
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
