-- Stutter Gate
--[[
Probabilistic gate stutter effect for rhythmic variations and fills.
Each incoming gate is either passed through unchanged or replaced 
with a rapid burst of shorter gates. CV control over probability 
and stutter density allows for evolving, dynamic patterns.

Inputs:
  1. Gate In    - Gate signal to process
  2. Prob CV    - Modulates stutter probability (+/-5V = +/-100%)
  3. Count CV   - Modulates stutter count (+/-5V = +/-8 steps)

Outputs:
  1. Gate Out   - Processed gate (pass-through or stuttered)
  2. EOC Trig   - Trigger at end of stutter cycle (for chaining)

Use cases:
  - Add glitchy fills to drum sequences
  - Create build-ups and tension before drops
  - Generate polyrhythmic variations
  - Humanize rigid sequences with controlled chaos
]]

return {
    name = 'Stutter Gate'
    , author = 'Expert Sleepers Ltd'
    
    , init = function(self)
        -- State variables
        self.stuttering = false       -- Currently in stutter sequence
        self.stutterPhase = 0         -- Progress through stutter (0-1)
        self.effectiveCount = 4       -- Actual stutter count (with CV)
        self.gateHigh = false         -- Current gate output state
        self.passThrough = false      -- Passing original gate through
        self.eocPending = false       -- EOC trigger waiting to fire
        self.eocCountdown = 0         -- EOC pulse duration timer
        
        -- CV values (updated each step)
        self.cvProb = 0
        self.cvCount = 0
        
        -- Statistics for display
        self.lastDecision = "IDLE"    -- Last probability decision
        self.stuttersDone = 0         -- Counter for display
        
        return {
            inputs = {
                kGate, -- Type: Gate, Synced: true, Division: 1/4
                kCV,   -- Type: Sine LFO, Synced: true, Division: 2 bars
                kCV,   -- Type: Triangle LFO, Synced: true, Division: 1 bar
            }
            , inputNames = { "Gate In", "Prob CV", "Count CV" }
            , outputs = {
                kStepped, -- Type: Kick Trigger
                kStepped, -- Type: Hi-hat Trigger
            }
            , outputNames = { "Gate Out", "EOC Trig" }
            , parameters = {
                { "Probability", 0, 100, 50, kPercent }
                , { "Stutter Count", 2, 16, 4, kNone }
                , { "Stutter Time", 10, 500, 200, kMs }
                , { "Gate %", 5, 95, 50, kPercent }
                , { "CV Prob Amt", -100, 100, 50, kPercent }
                , { "CV Count Amt", -80, 80, 20, kNone, kBy10 }
            }
        }
    end
    
    --=========================================================================
    -- GATE CALLBACK
    -- Called by system when gate input changes state (rising/falling edge)
    --=========================================================================
    , gate = function(self, input, rising)
        -- Only respond to input 1 (Gate In)
        if input ~= 1 then return {} end
        
        local p = self.parameters
        
        if rising then
            -----------------------------------------------------------------
            -- RISING EDGE: Decide whether to stutter or pass through
            -----------------------------------------------------------------
            
            -- Calculate effective probability with CV modulation
            -- CV range is +/-5V, scale by CV amount parameter
            local baseProb = p[1]
            local cvAmt = p[5]  -- -100 to +100
            local cvContrib = (self.cvProb / 5.0) * cvAmt
            local effectiveProb = math.max(0, math.min(100, baseProb + cvContrib))
            
            -- Calculate effective stutter count with CV modulation
            local baseCount = p[2]
            local cvCountAmt = p[6]  -- -8.0 to +8.0 (stored as -80 to 80, /10)
            local cvCountContrib = (self.cvCount / 5.0) * cvCountAmt
            local rawCount = baseCount + cvCountContrib
            self.effectiveCount = math.floor(math.max(2, math.min(16, rawCount)) + 0.5)
            
            -- Make the probability decision
            local roll = math.random(100)
            
            if roll <= effectiveProb then
                ---------------------------------------------------------
                -- STUTTER: Start a stutter sequence
                ---------------------------------------------------------
                self.stuttering = true
                self.stutterPhase = 0
                self.gateHigh = true
                self.passThrough = false
                self.lastDecision = "STUTTER"
                self.stuttersDone = 0
                
                return { 5.0, 0.0 }  -- Gate high, EOC low
            else
                ---------------------------------------------------------
                -- PASS THROUGH: Let the original gate through
                ---------------------------------------------------------
                self.passThrough = true
                self.stuttering = false
                self.gateHigh = true
                self.lastDecision = "PASS"
                
                return { 5.0, 0.0 }  -- Gate high, EOC low
            end
            
        else
            -----------------------------------------------------------------
            -- FALLING EDGE: Handle gate going low
            -----------------------------------------------------------------
            if self.passThrough then
                -- In pass-through mode, follow the input
                self.gateHigh = false
                self.passThrough = false
                self.lastDecision = "IDLE"
                return { 0.0 }  -- Gate low (EOC unchanged)
            end
            -- If stuttering, ignore the falling edge - we control timing
        end
        
        return {}
    end
    
    --=========================================================================
    -- STEP FUNCTION
    -- Called every 1ms to update CV readings and generate stutter pattern
    --=========================================================================
    , step = function(self, dt, inputs)
        -- Always update CV readings for use in gate callback
        self.cvProb = inputs[2] or 0
        self.cvCount = inputs[3] or 0
        
        local outs = {}
        
        ---------------------------------------------------------------------
        -- Handle EOC trigger pulse (bring it low after ~5ms)
        ---------------------------------------------------------------------
        if self.eocCountdown > 0 then
            self.eocCountdown = self.eocCountdown - dt
            if self.eocCountdown <= 0 then
                outs[2] = 0.0
            end
        end
        
        ---------------------------------------------------------------------
        -- Generate stutter pattern
        ---------------------------------------------------------------------
        if not self.stuttering then
            return outs
        end
        
        local p = self.parameters
        local gateLen = p[4] / 100.0           -- Gate length as fraction
        local stutterTime = p[3] / 1000.0      -- Total stutter time in seconds
        
        -- Advance through the stutter sequence
        local prevPhase = self.stutterPhase
        self.stutterPhase = self.stutterPhase + (dt / stutterTime)
        
        -- Check if stutter sequence is complete
        if self.stutterPhase >= 1.0 then
            self.stuttering = false
            self.gateHigh = false
            self.lastDecision = "IDLE"
            
            -- Fire EOC trigger
            outs[1] = 0.0   -- Gate goes low
            outs[2] = 5.0   -- EOC trigger fires
            self.eocCountdown = 0.005  -- 5ms trigger pulse
            
            return outs
        end
        
        -- Calculate current position within the stutter pattern
        -- Each stutter cycle goes: gate high -> gate low -> gate high -> ...
        local prevStepIndex = math.floor(prevPhase * self.effectiveCount)
        local stepIndex = math.floor(self.stutterPhase * self.effectiveCount)
        local posInStep = (self.stutterPhase * self.effectiveCount) % 1.0
        
        -- Determine if gate should be high or low at this point
        local newGateHigh = posInStep < gateLen
        
        -- Detect rising edge of new stutter step
        if stepIndex > prevStepIndex then
            self.stuttersDone = stepIndex
        end
        
        -- Only update output on state change
        if newGateHigh ~= self.gateHigh then
            self.gateHigh = newGateHigh
            outs[1] = newGateHigh and 5.0 or 0.0
        end
        
        return outs
    end
    
    --=========================================================================
    -- DRAW FUNCTION
    -- Called at 30fps to render custom display
    --=========================================================================
    , draw = function(self)
        local p = self.parameters
        
        -- Layout constants
        local boxX = 16
        local boxY = 26
        local boxW = 224
        local boxH = 22
        
        -- Draw stutter pattern visualization box
        drawBox(boxX, boxY, boxX + boxW, boxY + boxH, 4)
        
        -- Get display parameters
        local displayCount = self.stuttering and self.effectiveCount or p[2]
        local gateLen = p[4] / 100.0
        local stepW = boxW / displayCount
        
        -- Draw individual stutter gate rectangles
        for i = 0, displayCount - 1 do
            local sx = boxX + i * stepW
            local gateW = math.max(2, (stepW - 2) * gateLen)
            
            -- Determine brightness based on state
            local brightness = 4
            
            if self.stuttering then
                local currentStep = math.floor(self.stutterPhase * self.effectiveCount)
                
                if i == currentStep then
                    -- Current step
                    brightness = self.gateHigh and 15 or 7
                elseif i < currentStep then
                    -- Completed steps
                    brightness = 2
                else
                    -- Upcoming steps
                    brightness = 5
                end
            end
            
            drawRectangle(
                sx + 1, 
                boxY + 3, 
                sx + gateW, 
                boxY + boxH - 3, 
                brightness
            )
        end
        
        -- Draw progress indicator line when stuttering
        if self.stuttering then
            local progressX = boxX + self.stutterPhase * boxW
            drawLine(progressX, boxY - 4, progressX, boxY + boxH + 4, 15)
            
            -- Small triangle indicator at top
            drawLine(progressX - 3, boxY - 6, progressX, boxY - 3, 12)
            drawLine(progressX + 3, boxY - 6, progressX, boxY - 3, 12)
        end
        
        -- Status display
        local statusColor = 6
        local status = self.lastDecision
        
        if status == "STUTTER" then
            statusColor = 15
        elseif status == "PASS" then
            statusColor = 10
        end
        
        drawText(boxX, boxY + boxH + 14, status, statusColor)
        
        -- Parameter summary (right side)
        local summaryText = string.format(
            "P:%d%%  x%d  %dms", 
            p[1], 
            self.stuttering and self.effectiveCount or p[2], 
            p[3]
        )
        drawText(boxX + boxW, boxY + boxH + 14, summaryText, 8, "right")
        
        -- CV indicators (show when CV is active)
        local cvIndicators = ""
        if math.abs(self.cvProb) > 0.1 then
            local cvProbEffect = (self.cvProb / 5.0) * p[5]
            cvIndicators = cvIndicators .. string.format("P%+.0f ", cvProbEffect)
        end
        if math.abs(self.cvCount) > 0.1 then
            local cvCountEffect = (self.cvCount / 5.0) * p[6]
            cvIndicators = cvIndicators .. string.format("N%+.1f", cvCountEffect)
        end
        
        if cvIndicators ~= "" then
            drawTinyText(boxX + boxW/2, boxY - 6, cvIndicators, 7, "centre")
        end
    end
}
