-- Gate Suppressor
--[[
Enforces a minimum distance between the end of one gate and the start
of the next gate. Gates arriving too soon are suppressed (blocked).
Useful for thinning busy sequences, preventing envelope retriggering,
and creating rhythmic variations. The minimum distance is CV controllable.
]]

--------------------------------------------------------------------------------
-- Local state variables (script-local for efficiency)
--------------------------------------------------------------------------------
local lastGateEndTime = -1000  -- Large negative so first gate always passes
local currentTime = 0          -- Accumulated time in seconds
local gatePassedThrough = false -- Is current gate being passed through?
local storedCV = 0             -- CV value stored from step for use in gate
local suppressedCount = 0      -- Count of suppressed gates (for display)
local passedCount = 0          -- Count of passed gates (for display)

--------------------------------------------------------------------------------
-- Main script table
--------------------------------------------------------------------------------
return {
    name = 'Gate Suppressor'
    , author = 'Expert Sleepers Ltd'
    
    ----------------------------------------------------------------------------
    -- Initialization
    ----------------------------------------------------------------------------
    , init = function(self)
        -- Reset state on load
        lastGateEndTime = -1000
        currentTime = 0
        gatePassedThrough = false
        storedCV = 0
        suppressedCount = 0
        passedCount = 0
        
        return {
            -- Input 1: Gate to process
            -- Input 2: CV for modulating minimum distance
            inputs = { kGate, kCV }
            , inputNames = { "Gate In", "Min Dist CV" }
            
            -- Output 1: Filtered gate (stepped is appropriate for gates)
            , outputs = { kStepped }
            , outputNames = { "Gate Out" }
            
            -- Parameters
            , parameters = {
                -- Min Distance: 0-5000ms with 10ms resolution
                -- Using kBy10 scale: values 0-5000 displayed as 0.0-500.0ms? 
                -- Actually let's keep it simple: 0-5000ms integer
                { "Min Distance", 0, 5000, 100, kMs }
                
                -- CV Amount: how much CV affects the min distance
                -- -200% to +200% allows for dramatic modulation
                , { "CV Amount", -200, 200, 100, kPercent }
            }
        }
    end
    
    ----------------------------------------------------------------------------
    -- Step function - called every ~1ms
    -- Used to track time and read CV input
    ----------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        -- Accumulate elapsed time
        currentTime = currentTime + dt
        
        -- Store CV value for use in gate function
        -- inputs[2] is the CV input voltage (typically -5V to +5V)
        storedCV = inputs[2] or 0
        
        -- No outputs to update from step
        return {}
    end
    
    ----------------------------------------------------------------------------
    -- Gate function - called when gate input changes state
    ----------------------------------------------------------------------------
    , gate = function(self, input, rising)
        -- Only process the first input (the gate input)
        if input ~= 1 then
            return {}
        end
        
        if rising then
            -- Gate just went high - decide whether to pass or suppress
            
            -- Get base minimum distance from parameter (in ms)
            local baseDistanceMs = self.parameters[1]
            local baseDistanceSec = baseDistanceMs / 1000
            
            -- Get CV modulation amount (as percentage, e.g., 100 = 100%)
            local cvAmountPercent = self.parameters[2]
            local cvAmountNorm = cvAmountPercent / 100  -- Convert to multiplier
            
            -- Calculate CV contribution
            -- CV is typically -5V to +5V, normalize to -1 to +1
            local cvNormalized = storedCV / 5
            
            -- CV modulates the base distance
            -- At 100% CV amount, +5V doubles the distance, -5V sets it to 0
            local cvContributionSec = baseDistanceSec * cvNormalized * cvAmountNorm
            
            -- Calculate effective minimum distance (clamped to non-negative)
            local effectiveDistanceSec = math.max(0, baseDistanceSec + cvContributionSec)
            
            -- Calculate time elapsed since last gate ended
            local timeSinceEnd = currentTime - lastGateEndTime
            
            -- Decision: pass or suppress?
            if timeSinceEnd >= effectiveDistanceSec then
                -- Enough time has passed - pass the gate through
                gatePassedThrough = true
                passedCount = passedCount + 1
                return { 5.0 }  -- Output high gate (5V)
            else
                -- Too soon - suppress this gate
                gatePassedThrough = false
                suppressedCount = suppressedCount + 1
                return {}  -- No output change
            end
            
        else
            -- Gate just went low (falling edge)
            if gatePassedThrough then
                -- We were passing this gate through, so end it
                lastGateEndTime = currentTime
                gatePassedThrough = false
                return { 0.0 }  -- Output low (0V)
            else
                -- This gate was suppressed, nothing to do
                return {}
            end
        end
    end
    
    ----------------------------------------------------------------------------
    -- Draw function - custom display (called at ~30fps)
    ----------------------------------------------------------------------------
    , draw = function(self)
        -- Calculate values for display
        local baseDistanceMs = self.parameters[1]
        local cvAmountPercent = self.parameters[2]
        
        -- Calculate effective min distance for display
        local cvNormalized = storedCV / 5
        local cvContributionMs = baseDistanceMs * cvNormalized * (cvAmountPercent / 100)
        local effectiveDistanceMs = math.max(0, baseDistanceMs + cvContributionMs)
        
        -- Time since last gate ended (in ms)
        local timeSinceEndMs = (currentTime - lastGateEndTime) * 1000
        -- Cap display value to something reasonable
        if timeSinceEndMs > 99999 then
            timeSinceEndMs = 99999
        end
        
        -- Layout: display is 256x64 pixels
        -- Leave top ~20px for parameter line
        
        -- Left column: timing info
        drawText(5, 35, "Min:")
        drawText(50, 35, string.format("%.0fms", effectiveDistanceMs))
        
        drawText(5, 50, "Since:")
        if timeSinceEndMs < 10000 then
            drawText(50, 50, string.format("%.0fms", timeSinceEndMs))
        else
            drawText(50, 50, ">10s")
        end
        
        -- Right column: status and counts
        -- Gate activity indicator
        local statusX = 150
        if gatePassedThrough then
            -- Draw filled box when gate is active
            drawRectangle(statusX, 28, statusX + 40, 40, 15)
            drawText(statusX + 3, 38, "GATE", 0)
        else
            -- Draw outline when idle
            drawBox(statusX, 28, statusX + 40, 40, 8)
            drawText(statusX + 5, 38, "IDLE", 8)
        end
        
        -- Pass/suppress counts
        drawText(statusX, 50, string.format("P:%d S:%d", passedCount, suppressedCount))
        
        -- CV indicator bar (bottom right)
        local barX = 220
        local barW = 30
        local barY = 28
        local barH = 24
        
        -- Draw bar outline
        drawBox(barX, barY, barX + barW, barY + barH, 6)
        
        -- Draw CV level (centered, bipolar)
        local barMidY = barY + barH / 2
        local cvLevel = math.max(-1, math.min(1, storedCV / 5))  -- Clamp to -1..1
        local cvBarHeight = math.abs(cvLevel) * (barH / 2 - 1)
        
        if cvLevel > 0 then
            -- Positive CV - draw upward from center
            drawRectangle(barX + 2, barMidY - cvBarHeight, barX + barW - 2, barMidY, 12)
        elseif cvLevel < 0 then
            -- Negative CV - draw downward from center
            drawRectangle(barX + 2, barMidY, barX + barW - 2, barMidY + cvBarHeight, 12)
        end
        
        -- Center line for CV bar
        drawLine(barX, barMidY, barX + barW, barMidY, 10)
        
        -- CV label
        drawTinyText(barX + barW / 2, barY + barH + 8, "CV", 8, "centre")
        
        -- Return false to show standard parameter line at top
        return false
    end
}
