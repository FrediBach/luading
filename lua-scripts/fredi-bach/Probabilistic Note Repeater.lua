-- Probabilistic Note Repeater
--[[
A probability-based note processor for sequences. When a new note arrives,
it either passes through unchanged, or is replaced by the previously-played
note. Perfect for adding controlled variation to melodic sequences.

Inputs:
  1. Gate In  - triggers probability decision on rising edge
  2. CV In    - pitch voltage (1V/oct)

Outputs:
  1. Gate Out - passes through input gate
  2. CV Out   - new note or repeated previous note

Parameters:
  - Probability: 0-100% chance that new notes pass through
    * 100% = fully transparent (all new notes pass)
    * 0%   = infinite repeat (first note held forever)
    * 50%  = musical randomness
]]

return
{
    name = 'Prob Note Repeat'
    , author = 'Expert Sleepers Ltd'
    
    , init = function(self)
        -- State variables
        self.lastCV = 0.0           -- The CV of the last note actually output
        self.outputCV = 0.0         -- Current CV being output
        self.inputCV = 0.0          -- Continuously tracked input CV
        self.lastWasNew = true      -- Visual feedback: was last note new?
        self.gateState = false      -- Current gate state for display
        
        return
        {
            inputs = { kGate, kCV }
            , inputNames = { "Gate In", "CV In" }
            , outputs = { kStepped, kLinear }
            , outputNames = { "Gate Out", "CV Out" }
            , parameters = 
            {
                { "Probability", 0, 100, 50, kPercent }
            }
        }
    end
    
    , gate = function(self, input, rising)
        -- Only respond to input 1 (the gate input)
        if input ~= 1 then
            return {}
        end
        
        if rising then
            -- Gate rising edge: make probability decision
            self.gateState = true
            
            local rand = math.random()
            local prob = self.parameters[1] / 100.0
            
            if rand < prob then
                -- Probability check passed: use new note
                self.outputCV = self.inputCV
                self.lastCV = self.inputCV
                self.lastWasNew = true
            else
                -- Probability check failed: repeat previous note
                self.outputCV = self.lastCV
                self.lastWasNew = false
            end
            
            -- Return gate high (5V) and the decided CV
            return { 5.0, self.outputCV }
        else
            -- Gate falling edge
            self.gateState = false
            return { 0.0 }
        end
    end
    
    , step = function(self, dt, inputs)
        -- Continuously track input CV so it's available when gate fires
        self.inputCV = inputs[2]
        
        -- Output current CV (only updated on gate rising edge)
        -- First output (gate) is handled by gate function, so nil here
        return { nil, self.outputCV }
    end
    
    , draw = function(self)
        -- Layout constants
        local centerX = 128
        local prob = self.parameters[1]
        
        -- Title area
        drawText(centerX, 18, "PROB NOTE REPEAT", 10, "centre")
        
        -- Probability bar visualization
        local barLeft = 40
        local barRight = 216
        local barY = 28
        local barHeight = 6
        local barWidth = barRight - barLeft
        local fillWidth = math.floor(barWidth * prob / 100)
        
        -- Bar outline
        drawBox(barLeft, barY, barRight, barY + barHeight, 4)
        -- Bar fill
        if fillWidth > 0 then
            drawRectangle(barLeft + 1, barY + 1, barLeft + fillWidth, barY + barHeight - 1, 8)
        end
        -- Probability text
        drawText(centerX, barY + barHeight + 10, string.format("%d%%", prob), 15, "centre")
        
        -- Input/Output display
        local rowY = 52
        
        -- Input CV
        drawText(50, rowY, "IN:", 6, "right")
        drawText(55, rowY, string.format("%.2fV", self.inputCV), 10, "left")
        
        -- Output CV with indicator
        drawText(175, rowY, "OUT:", 6, "right")
        local outColor = self.lastWasNew and 15 or 7
        drawText(180, rowY, string.format("%.2fV", self.outputCV), outColor, "left")
        
        -- New/Repeat indicator
        local statusX = centerX
        local statusY = rowY
        if self.gateState then
            if self.lastWasNew then
                drawText(statusX, statusY, "NEW", 15, "centre")
            else
                drawText(statusX, statusY, "RPT", 7, "centre")
            end
        else
            drawText(statusX, statusY, "-", 4, "centre")
        end
    end
}
