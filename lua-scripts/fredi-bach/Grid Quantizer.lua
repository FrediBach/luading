-- Grid Quantizer
--[[
Quantizes incoming gates and triggers to a clock grid.
The reverse of a humanizer - snaps timing precisely to the beat.

Four channels of gate/trigger input are synced to a master clock.
Any event arriving between clock pulses is held and output on the
next clock tick.

Modes:
- Trigger: Always outputs fixed-length triggers on clock
- Gate: Quantizes gate start to clock, end follows input

Use cases:
- Snap hand-triggered events to the beat
- Tame chaotic gate sources onto a rhythmic grid
- Align signals from different sources to a master clock
- Re-quantize patterns to a different rhythmic resolution
]]

return {
    name = 'GridQuantizer'
    , author = 'Expert Sleepers Ltd'
    
    , init = function(self)
        -- Pending flags: true when input fired but awaiting next clock
        self.pending = { false, false, false, false }
        -- Output state: true when output is currently high
        self.outputHigh = { false, false, false, false }
        -- Input gate state: true when input is currently high
        self.inputHigh = { false, false, false, false }
        -- Timer for trigger/minimum pulse auto-off (in seconds)
        self.offTimer = { 0, 0, 0, 0 }
        
        return {
            inputs = { kTrigger, kGate, kGate, kGate, kGate }
            , inputNames = { 
                "Clock", 
                "In 1", 
                "In 2", 
                "In 3", 
                "In 4" 
            }
            , outputs = { kStepped, kStepped, kStepped, kStepped }
            , outputNames = { 
                "Out 1", 
                "Out 2", 
                "Out 3", 
                "Out 4" 
            }
            , parameters = {
                { "Mode", { "Trigger", "Gate" }, 1 }
                , { "Trig ms", 1, 50, 10, kMs }
            }
        }
    end
    
    -------------------------------------------------------------------------
    -- Clock input (input 1): fires all pending outputs
    -------------------------------------------------------------------------
    , trigger = function(self, input)
        -- Only respond to clock (input 1)
        if input ~= 1 then 
            return {} 
        end
        
        local outs = {}
        local mode = self.parameters[1]           -- 1=Trigger, 2=Gate
        local trigLengthSec = self.parameters[2] / 1000.0
        
        for ch = 1, 4 do
            if self.pending[ch] then
                -- Clear pending flag and fire output
                self.pending[ch] = false
                self.outputHigh[ch] = true
                outs[ch] = 5.0
                
                -- Determine if we need an auto-off timer
                if mode == 1 then
                    -- Trigger mode: always use fixed-length pulse
                    self.offTimer[ch] = trigLengthSec
                elseif not self.inputHigh[ch] then
                    -- Gate mode but input already went low:
                    -- Use minimum pulse length so output is detectable
                    self.offTimer[ch] = trigLengthSec
                end
                -- Gate mode with input still high: 
                -- No timer needed, output follows input falling edge
            end
        end
        
        return outs
    end
    
    -------------------------------------------------------------------------
    -- Gate inputs (inputs 2-5): track pending events and gate state
    -------------------------------------------------------------------------
    , gate = function(self, input, rising)
        -- Map inputs 2-5 to channels 1-4
        local ch = input - 1
        
        if rising then
            -- Rising edge: mark this channel as pending
            self.pending[ch] = true
            self.inputHigh[ch] = true
        else
            -- Falling edge: update input state
            self.inputHigh[ch] = false
            
            -- In gate mode, falling edge should turn off output
            -- (unless we're in the minimum pulse period)
            local mode = self.parameters[1]
            if mode == 2 and self.outputHigh[ch] and self.offTimer[ch] <= 0 then
                self.outputHigh[ch] = false
                local outs = {}
                outs[ch] = 0.0
                return outs
            end
        end
        
        return {}
    end
    
    -------------------------------------------------------------------------
    -- Step function: handles trigger timing and auto-off
    -------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        local outs = {}
        
        for ch = 1, 4 do
            if self.offTimer[ch] > 0 then
                self.offTimer[ch] = self.offTimer[ch] - dt
                
                if self.offTimer[ch] <= 0 then
                    -- Timer expired: turn off output
                    self.offTimer[ch] = 0
                    self.outputHigh[ch] = false
                    outs[ch] = 0.0
                end
            end
        end
        
        return outs
    end
    
    -------------------------------------------------------------------------
    -- Custom display
    -------------------------------------------------------------------------
    , draw = function(self)
        -- Title bar
        drawRectangle(0, 0, 255, 12, 2)
        drawText(128, 10, "GRID QUANTIZER", 15, "centre")
        
        -- Channel status display
        local statusY = 35
        local labelY = 50
        
        for ch = 1, 4 do
            local x = 32 + (ch - 1) * 64
            
            -- Draw channel box
            local boxColor = 3
            local statusText = "-"
            
            if self.pending[ch] then
                -- Waiting for clock
                boxColor = 8
                statusText = "WAIT"
            elseif self.outputHigh[ch] then
                -- Currently outputting
                boxColor = 15
                statusText = "ON"
            end
            
            -- Channel indicator circle
            drawCircle(x, statusY, 10, boxColor)
            if self.outputHigh[ch] then
                -- Fill when on
                drawRectangle(x-6, statusY-6, x+6, statusY+6, boxColor)
            end
            
            -- Channel label
            drawText(x, labelY + 12, ch .. ":" .. statusText, 10, "centre")
        end
        
        -- Mode indicator at bottom
        local modeText = self.parameters[1] == 1 and "MODE: TRIGGER" or "MODE: GATE"
        drawText(128, 62, modeText, 8, "centre")
    end
}
