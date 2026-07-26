-- Melody Bernoulli Gate
--[[
Probabilistically splits a CV/Gate melody into two CV/Gate output pairs.
Like the classic Bernoulli Gate but for complete melodic phrases.
Perfect for call-and-response patterns, random voice distribution,
and adding organic variation to sequences.

Inputs:
  1. CV In     - Pitch CV from sequencer (sampled on gate rise)
  2. Gate In   - Gate/trigger from sequencer
  3. Prob CV   - Probability modulation (±5V = ±50%)

Outputs:
  1. CV A      - Pitch CV for voice A
  2. Gate A    - Gate for voice A
  3. CV B      - Pitch CV for voice B
  4. Gate B    - Gate for voice B

Parameters:
  - Probability: 0-100% chance of routing to output B
  - Mode: Gate (follows input) or Toggle (stays high until other output fires)
]]

--------------------------------------------------------------------------------
-- Local state (script-level variables)
--------------------------------------------------------------------------------

local lastRoute = 1         -- Last routing decision: 1 = A, 2 = B
local currentCV = 0         -- Most recent CV input value
local probCV = 0            -- Probability modulation CV
local gateAHigh = false     -- Current state of Gate A output
local gateBHigh = false     -- Current state of Gate B output
local cvA = 0               -- Last CV value sent to output A
local cvB = 0               -- Last CV value sent to output B
local noteCountA = 0        -- Count of notes routed to A
local noteCountB = 0        -- Count of notes routed to B

--------------------------------------------------------------------------------
-- Script table
--------------------------------------------------------------------------------

return
{
    name = 'Melody Bernoulli'
    , author = 'Expert Sleepers Ltd'
    
    ----------------------------------------------------------------------------
    -- Initialization
    ----------------------------------------------------------------------------
    , init = function(self)
        -- Reset state
        lastRoute = 1
        currentCV = 0
        probCV = 0
        gateAHigh = false
        gateBHigh = false
        cvA = 0
        cvB = 0
        noteCountA = 0
        noteCountB = 0
        
        return
        {
            -- Input configuration
            -- kCV for continuous voltage, kGate for gate detection
            inputs = { kCV, kGate, kCV }
            , inputNames = { "CV In", "Gate In", "Prob CV" }
            
            -- Output configuration
            -- All stepped since we're dealing with discrete note events
            , outputs = { kStepped, kStepped, kStepped, kStepped }
            , outputNames = { "CV A", "Gate A", "CV B", "Gate B" }
            
            -- User-adjustable parameters
            , parameters = 
            {
                { "Probability", 0, 100, 50, kPercent }
                , { "Mode", { "Gate", "Toggle" }, 1 }
            }
        }
    end
    
    ----------------------------------------------------------------------------
    -- Gate callback - called when Gate In crosses threshold
    ----------------------------------------------------------------------------
    , gate = function(self, input, rising)
        -- Only respond to the Gate In (input 2)
        if input ~= 2 then 
            return {} 
        end
        
        local outs = {}
        
        if rising then
            ------------------------------------------------
            -- Gate rising: make routing decision
            ------------------------------------------------
            
            -- Calculate effective probability (base + CV modulation)
            local prob = self.parameters[1] / 100.0
            -- CV modulation: ±5V maps to ±50% probability shift
            prob = prob + probCV * 0.1
            -- Clamp to valid range
            prob = math.max(0, math.min(1, prob))
            
            -- Bernoulli decision
            local routeToB = math.random() < prob
            
            if routeToB then
                -- Route to output B
                lastRoute = 2
                noteCountB = noteCountB + 1
                
                -- Sample and output CV
                cvB = currentCV
                outs[3] = cvB           -- CV B
                outs[4] = 5.0           -- Gate B high
                gateBHigh = true
                
                -- In Toggle mode, turn off the other gate
                if self.parameters[2] == 2 then
                    outs[2] = 0.0       -- Gate A low
                    gateAHigh = false
                end
            else
                -- Route to output A
                lastRoute = 1
                noteCountA = noteCountA + 1
                
                -- Sample and output CV
                cvA = currentCV
                outs[1] = cvA           -- CV A
                outs[2] = 5.0           -- Gate A high
                gateAHigh = true
                
                -- In Toggle mode, turn off the other gate
                if self.parameters[2] == 2 then
                    outs[4] = 0.0       -- Gate B low
                    gateBHigh = false
                end
            end
        else
            ------------------------------------------------
            -- Gate falling: close the active gate (Gate mode only)
            ------------------------------------------------
            if self.parameters[2] == 1 then
                -- Gate mode: follow input gate timing
                if lastRoute == 1 then
                    outs[2] = 0.0       -- Gate A low
                    gateAHigh = false
                else
                    outs[4] = 0.0       -- Gate B low
                    gateBHigh = false
                end
            end
            -- In Toggle mode, gates stay high until next routing decision
        end
        
        return outs
    end
    
    ----------------------------------------------------------------------------
    -- Step callback - called every 1ms for continuous processing
    ----------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        -- Continuously sample CV input so it's ready when gate arrives
        -- This ensures we capture the pitch at the moment of the gate
        currentCV = inputs[1]
        
        -- Store probability CV modulation
        probCV = inputs[3]
        
        -- No outputs to update in step
        return {}
    end
    
    ----------------------------------------------------------------------------
    -- Draw callback - called at 30fps for custom display
    ----------------------------------------------------------------------------
    , draw = function(self)
        local prob = self.parameters[1]
        local modeText = self.parameters[2] == 1 and "Gate" or "Toggle"
        
        -- Layout constants
        local centerX = 128
        local barY = 26
        local barW = 120
        local barH = 12
        local barX = centerX - barW // 2
        
        --------------------------------------------------------
        -- Probability bar
        --------------------------------------------------------
        
        -- Background/outline
        drawBox(barX, barY, barX + barW, barY + barH, 5)
        
        -- Fill based on probability
        local fillW = math.floor(barW * prob / 100)
        if fillW > 1 then
            drawRectangle(barX + 1, barY + 1, barX + fillW - 1, barY + barH - 1, 9)
        end
        
        -- Center marker (50% reference line)
        local centerMark = barX + barW // 2
        drawLine(centerMark, barY - 2, centerMark, barY + barH + 2, 7)
        
        -- A/B labels
        drawText(barX - 10, barY + 9, "A", 11, "right")
        drawText(barX + barW + 10, barY + 9, "B", 11)
        
        -- Probability percentage
        drawText(centerX, barY + barH + 11, prob .. "%", 10, "centre")
        
        -- Mode indicator
        drawTinyText(centerX, barY - 5, modeText, 6, "centre")
        
        --------------------------------------------------------
        -- Output status section
        --------------------------------------------------------
        local statusY = 52
        
        -- Output A status (left side)
        local colorA = gateAHigh and 15 or 4
        drawCircle(45, statusY, 7, colorA)
        if gateAHigh then
            drawRectangle(43, statusY - 2, 47, statusY + 2, 0)
        end
        drawTinyText(45, statusY + 2, "A", gateAHigh and 0 or 8, "centre")
        
        -- CV A value
        local cvAStr = string.format("%.2fV", cvA)
        drawTinyText(45, statusY - 12, cvAStr, 8, "centre")
        
        -- Note count A
        drawTinyText(45, statusY + 12, tostring(noteCountA), 5, "centre")
        
        -- Output B status (right side)
        local colorB = gateBHigh and 15 or 4
        drawCircle(211, statusY, 7, colorB)
        if gateBHigh then
            drawRectangle(209, statusY - 2, 213, statusY + 2, 0)
        end
        drawTinyText(211, statusY + 2, "B", gateBHigh and 0 or 8, "centre")
        
        -- CV B value
        local cvBStr = string.format("%.2fV", cvB)
        drawTinyText(211, statusY - 12, cvBStr, 8, "centre")
        
        -- Note count B
        drawTinyText(211, statusY + 12, tostring(noteCountB), 5, "centre")
        
        --------------------------------------------------------
        -- Routing indicator (center)
        --------------------------------------------------------
        local arrowY = statusY
        if lastRoute == 1 then
            -- Arrow pointing to A
            drawLine(centerX + 20, arrowY, centerX - 20, arrowY, 12)
            drawLine(centerX - 20, arrowY, centerX - 12, arrowY - 5, 12)
            drawLine(centerX - 20, arrowY, centerX - 12, arrowY + 5, 12)
        else
            -- Arrow pointing to B
            drawLine(centerX - 20, arrowY, centerX + 20, arrowY, 12)
            drawLine(centerX + 20, arrowY, centerX + 12, arrowY - 5, 12)
            drawLine(centerX + 20, arrowY, centerX + 12, arrowY + 5, 12)
        end
    end
}
