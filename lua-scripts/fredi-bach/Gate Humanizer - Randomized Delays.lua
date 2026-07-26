-- Gate Humanizer
--[[
Humanizes gates and triggers by adding random timing delays.
Shifts gates in time while preserving their original duration.
4 independent channels for processing multiple gate streams.

Perfect for adding human feel to sequenced drums, melodies, or any
rhythmic content that needs to sound less mechanical.

Inputs: 4 gate/trigger inputs
Outputs: 4 delayed gate/trigger outputs
]]

--------------------------------------------------------------------------------
-- Module: Gate Humanizer
-- Author: Expert Sleepers Ltd
-- 
-- Eurorack Context:
-- Place this between your sequencer/clock source and your sound generators
-- (envelopes, drum modules, etc.). Each channel independently delays its
-- input gate by a random amount, simulating the natural timing variations
-- of human performance.
--
-- The key feature is that both rising and falling edges of each gate use
-- the SAME random delay, preserving the original gate length. This ensures
-- envelope shapes remain consistent while only the timing varies.
--------------------------------------------------------------------------------

return {
    name = 'Gate Humanizer'
    , author = 'Expert Sleepers Ltd'
    
    ------------------------------------------------------------------------
    -- Initialization
    -- Sets up 4 independent channels, each tracking:
    --   - Pending rising/falling edge events
    --   - Current output state
    --   - The delay amount applied to the current gate
    ------------------------------------------------------------------------
    , init = function(self)
        -- Initialize per-channel state
        self.ch = {}
        for i = 1, 4 do
            self.ch[i] = {
                risingPending = nil,    -- Time remaining until rising edge fires
                fallingPending = nil,   -- Time remaining until falling edge fires
                output = 0.0,           -- Current output voltage
                currentDelay = 0,       -- Delay applied to current gate (for matching falling edge)
                lastDelayMs = 0         -- Last delay in ms (for display)
            }
        end
        
        return {
            -- Use kGate for efficient edge detection by the system
            inputs = { kGate, kGate, kGate, kGate }
            , inputNames = { "Gate 1", "Gate 2", "Gate 3", "Gate 4" }
            , outputs = 4
            , outputNames = { "Out 1", "Out 2", "Out 3", "Out 4" }
            , parameters = {
                -- Amount: Scales the randomness (0% = no delay, 100% = full random range)
                { "Amount", 0, 100, 50, kPercent }
                -- Max Delay: The maximum possible delay in milliseconds
                , { "Max Delay", 1, 100, 25, kMs }
            }
        }
    end
    
    ------------------------------------------------------------------------
    -- Gate Handler
    -- Called by the system when a gate edge is detected.
    -- For rising edges: Calculate a new random delay
    -- For falling edges: Use the same delay to preserve gate length
    ------------------------------------------------------------------------
    , gate = function(self, input, rising)
        local amount = self.parameters[1] / 100.0       -- 0.0 to 1.0
        local maxDelayMs = self.parameters[2]           -- milliseconds
        local ch = self.ch[input]
        
        if rising then
            -- New gate: calculate a fresh random delay
            local delayMs = math.random() * maxDelayMs * amount
            local delaySeconds = delayMs / 1000.0
            
            ch.currentDelay = delaySeconds
            ch.lastDelayMs = delayMs
            ch.risingPending = delaySeconds
            
            -- If there's a pending falling edge from a previous gate,
            -- we let the new rising edge take priority (start fresh)
            ch.fallingPending = nil
        else
            -- Gate release: use the same delay to preserve gate duration
            ch.fallingPending = ch.currentDelay
        end
        
        -- Don't output anything immediately; step() will handle timing
        return {}
    end
    
    ------------------------------------------------------------------------
    -- Step Function
    -- Called every ~1ms. Decrements pending event timers and fires
    -- outputs when their time arrives.
    ------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        local outs = {}
        
        for i = 1, 4 do
            local ch = self.ch[i]
            
            -- Process pending rising edge
            if ch.risingPending then
                ch.risingPending = ch.risingPending - dt
                if ch.risingPending <= 0 then
                    ch.output = 5.0
                    outs[i] = 5.0
                    ch.risingPending = nil
                end
            end
            
            -- Process pending falling edge
            -- Only fire if gate is currently high (rising already fired)
            if ch.fallingPending then
                ch.fallingPending = ch.fallingPending - dt
                if ch.fallingPending <= 0 then
                    -- Only go low if we're not waiting for a rising edge
                    if not ch.risingPending then
                        ch.output = 0.0
                        outs[i] = 0.0
                    end
                    ch.fallingPending = nil
                end
            end
        end
        
        return outs
    end
    
    ------------------------------------------------------------------------
    -- Draw Function
    -- Displays parameter values and visual feedback for each channel.
    -- Shows gate activity and pending states.
    ------------------------------------------------------------------------
    , draw = function(self)
        local amount = self.parameters[1]
        local maxD = self.parameters[2]
        
        -- Title and parameters
        drawText(128, 14, "GATE HUMANIZER", 10, "centre")
        drawText(128, 28, amount .. "% / " .. maxD .. "ms max", 15, "centre")
        
        -- Draw horizontal divider
        drawLine(10, 34, 246, 34, 4)
        
        -- Channel status display
        local baseY = 44
        for i = 1, 4 do
            local ch = self.ch[i]
            local x = 16 + (i - 1) * 62
            local barWidth = 50
            
            -- Channel label
            drawTinyText(x + barWidth/2, baseY, "CH " .. i, 8, "centre")
            
            -- Activity indicator bar
            local active = ch.output > 2.5
            local pendingRise = ch.risingPending ~= nil
            local pendingFall = ch.fallingPending ~= nil
            
            local barY = baseY + 5
            local barH = 10
            
            if active then
                -- Gate is high: bright filled bar
                drawRectangle(x, barY, x + barWidth, barY + barH, 15)
            elseif pendingRise then
                -- Waiting to go high: dim fill (anticipation)
                drawRectangle(x, barY, x + barWidth, barY + barH, 6)
            else
                -- Gate is low: outline only
                drawBox(x, barY, x + barWidth, barY + barH, 5)
            end
            
            -- Show last delay amount below each channel
            local delayStr = string.format("%.1fms", ch.lastDelayMs)
            drawTinyText(x + barWidth/2, baseY + 20, delayStr, 7, "centre")
        end
    end
}
