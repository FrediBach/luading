-- Euclidean Gate Skip
--[[
Euclidean rhythm gate processor with probability control.
Passes or blocks incoming gates/triggers based on a Euclidean
pattern and random probability, transforming boring clock
signals into interesting rhythmic patterns.

Inputs:
  1. Gate/Trigger In - The signal to process
  2. Reset - Restart pattern from step 1

Outputs:
  1. Gate Out - Gates that passed through
  2. Skipped - Gates that were blocked (for alternate triggering)

Classic Euclidean patterns:
  E(3,8)  = Cuban tresillo
  E(5,8)  = Cuban cinquillo  
  E(7,12) = West African bell pattern
  E(5,16) = Bossa nova
]]

--------------------------------------------------------------------------------
-- Euclidean Pattern Generator (Bjorklund algorithm via accumulator method)
--------------------------------------------------------------------------------
local function generateEuclidean(hits, steps)
    local pattern = {}
    
    -- Handle edge cases
    if steps <= 0 then return pattern end
    for i = 1, steps do
        pattern[i] = false
    end
    if hits <= 0 then return pattern end
    if hits >= steps then
        for i = 1, steps do pattern[i] = true end
        return pattern
    end
    
    -- Bresenham-style accumulator distribution
    -- Distributes 'hits' as evenly as possible across 'steps'
    local bucket = 0
    for i = 1, steps do
        bucket = bucket + hits
        if bucket >= steps then
            bucket = bucket - steps
            pattern[i] = true
        end
    end
    
    return pattern
end

--------------------------------------------------------------------------------
-- Pattern visualization helper
--------------------------------------------------------------------------------
local function getPatternString(pattern, steps, currentStep, offset)
    local chars = {}
    for i = 1, steps do
        local idx = ((i - 1 + offset) % steps) + 1
        if i == currentStep then
            chars[i] = pattern[idx] and "●" or "○"
        else
            chars[i] = pattern[idx] and "•" or "·"
        end
    end
    return table.concat(chars)
end

--------------------------------------------------------------------------------
-- Main Algorithm
--------------------------------------------------------------------------------
return {
    name = 'Euclidean Gate Skip'
    , author = 'Expert Sleepers Ltd'
    
    ------------------------------------------------------------------------
    -- Initialization
    ------------------------------------------------------------------------
    , init = function(self)
        -- State variables
        self.step = 0              -- Current step in pattern (0 = not started)
        self.pattern = {}          -- Cached Euclidean pattern
        self.lastSteps = 0         -- For detecting parameter changes
        self.lastHits = 0          -- For detecting parameter changes
        self.passing = false       -- Currently passing a gate through?
        self.skipping = false      -- Currently outputting to skip output?
        self.lastDecision = ""     -- For display: "pass", "skip", "rest"
        self.hitCount = 0          -- Stats: total hits passed
        self.skipCount = 0         -- Stats: total hits skipped
        
        return {
            inputs = { kGate, kTrigger }
            , inputNames = { "Gate In", "Reset" }
            , outputs = 2
            , outputNames = { "Gate Out", "Skipped" }
            , parameters = {
                { "Steps", 1, 32, 16, kNone }
                , { "Hits", 1, 32, 4, kNone }
                , { "Offset", 0, 31, 0, kNone }
                , { "Probability", 0, 100, 100, kPercent }
            }
        }
    end
    
    ------------------------------------------------------------------------
    -- Gate Handler (called on rising and falling edges)
    ------------------------------------------------------------------------
    , gate = function(self, input, rising)
        if input ~= 1 then return {} end
        
        -- Read parameters
        local steps = self.parameters[1]
        local hits = math.min(self.parameters[2], steps)
        local offset = self.parameters[3] % steps
        local probability = self.parameters[4]
        
        -- Regenerate pattern if parameters changed
        if steps ~= self.lastSteps or hits ~= self.lastHits then
            self.pattern = generateEuclidean(hits, steps)
            self.lastSteps = steps
            self.lastHits = hits
            -- Clamp current step to new range
            if self.step > steps then
                self.step = steps
            end
        end
        
        if rising then
            -- === Rising Edge: Advance step and make decision ===
            
            -- Advance step counter
            self.step = self.step + 1
            if self.step > steps then
                self.step = 1
            end
            
            -- Get pattern value at current position (with offset)
            local patternIdx = ((self.step - 1 + offset) % steps) + 1
            local isHit = self.pattern[patternIdx] or false
            
            if isHit then
                -- This step is active in the Euclidean pattern
                -- Apply probability check
                local roll = math.random(100)
                if roll <= probability then
                    -- PASS: Gate goes through
                    self.passing = true
                    self.skipping = false
                    self.lastDecision = "pass"
                    self.hitCount = self.hitCount + 1
                    return { 5.0, 0.0 }
                else
                    -- SKIP: Gate blocked by probability
                    self.passing = false
                    self.skipping = true
                    self.lastDecision = "skip"
                    self.skipCount = self.skipCount + 1
                    return { 0.0, 5.0 }
                end
            else
                -- REST: Not a hit in the pattern
                self.passing = false
                self.skipping = false
                self.lastDecision = "rest"
                return { 0.0, 0.0 }
            end
        else
            -- === Falling Edge: Close gates ===
            local wasP = self.passing
            local wasS = self.skipping
            self.passing = false
            self.skipping = false
            
            -- Only update outputs that were high
            if wasP or wasS then
                return { 0.0, 0.0 }
            end
            return {}
        end
    end
    
    ------------------------------------------------------------------------
    -- Trigger Handler (for reset input)
    ------------------------------------------------------------------------
    , trigger = function(self, input)
        if input == 2 then
            -- Reset pattern to beginning
            self.step = 0
            self.hitCount = 0
            self.skipCount = 0
            self.lastDecision = ""
        end
        return {}
    end
    
    ------------------------------------------------------------------------
    -- Display Drawing
    ------------------------------------------------------------------------
    , draw = function(self)
        local steps = self.parameters[1]
        local hits = math.min(self.parameters[2], steps)
        local offset = self.parameters[3] % steps
        local probability = self.parameters[4]
        
        -- Ensure pattern is current for display
        if steps ~= self.lastSteps or hits ~= self.lastHits then
            self.pattern = generateEuclidean(hits, steps)
            self.lastSteps = steps
            self.lastHits = hits
        end
        
        -- === Title line ===
        local title = string.format("E(%d,%d)", hits, steps)
        if offset > 0 then
            title = title .. string.format(" +%d", offset)
        end
        title = title .. string.format("  P:%d%%", probability)
        drawText(128, 12, title, 15, "centre")
        
        -- === Pattern visualization ===
        local maxBoxes = 32
        local boxSize = math.max(4, math.min(7, math.floor(240 / steps) - 1))
        local spacing = boxSize + 1
        local totalWidth = steps * spacing - 1
        local startX = (256 - totalWidth) / 2
        local y = 24
        
        for i = 1, steps do
            local patternIdx = ((i - 1 + offset) % steps) + 1
            local isHit = self.pattern[patternIdx] or false
            local x = startX + (i - 1) * spacing
            
            local isCurrent = (i == self.step)
            
            if isCurrent then
                -- Highlight current step with border
                drawBox(x - 1, y - 1, x + boxSize + 1, y + boxSize + 1, 15)
            end
            
            if isHit then
                -- Active step: filled box
                local brightness = isCurrent and 15 or 10
                drawRectangle(x, y, x + boxSize, y + boxSize, brightness)
            else
                -- Rest step: outline only
                local brightness = isCurrent and 8 or 3
                drawBox(x, y, x + boxSize, y + boxSize, brightness)
            end
        end
        
        -- === Status line ===
        local statusY = 45
        local stepStr = self.step > 0 and tostring(self.step) or "-"
        drawText(10, statusY, "Step: " .. stepStr .. "/" .. steps, 8)
        
        -- Show last decision indicator
        local decisionX = 180
        if self.lastDecision == "pass" then
            drawRectangle(decisionX, statusY - 8, decisionX + 20, statusY, 12)
            drawText(decisionX + 10, statusY, "▶", 15, "centre")
        elseif self.lastDecision == "skip" then
            drawBox(decisionX, statusY - 8, decisionX + 20, statusY, 8)
            drawText(decisionX + 10, statusY, "✕", 10, "centre")
        end
        
        -- === Stats line ===
        local statsY = 58
        local total = self.hitCount + self.skipCount
        if total > 0 then
            local passRate = math.floor((self.hitCount / total) * 100 + 0.5)
            drawText(10, statsY, string.format("Pass: %d  Skip: %d  (%d%%)", 
                self.hitCount, self.skipCount, passRate), 6)
        else
            drawText(10, statsY, "Waiting for gates...", 4)
        end
        
        -- Don't draw standard parameter line (return true)
        return true
    end
}
