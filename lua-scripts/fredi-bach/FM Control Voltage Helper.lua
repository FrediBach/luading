-- FM Helper
--[[
Generates precise CV offsets for FM synthesis ratios.
Feed V/Oct to input, get ratio-offset CVs for carrier/modulator pairs.
]]

--------------------------------------------------------------------------------
-- Configuration: FM Ratio Presets
--------------------------------------------------------------------------------

-- Each entry: { name, numerator, denominator }
-- Ratio = num/den, so 2:1 means modulator is 2x carrier frequency
local RATIOS = {
    { "1:1",   1, 1 },    -- Unison
    { "2:1",   2, 1 },    -- Octave up
    { "3:1",   3, 1 },    -- Octave + fifth
    { "4:1",   4, 1 },    -- Two octaves
    { "5:1",   5, 1 },    -- Two oct + major third
    { "6:1",   6, 1 },    -- Two oct + fifth
    { "7:1",   7, 1 },    -- Harmonic 7th
    { "8:1",   8, 1 },    -- Three octaves
    { "1:2",   1, 2 },    -- Octave down
    { "1:3",   1, 3 },    -- Octave + fifth down
    { "1:4",   1, 4 },    -- Two octaves down
    { "3:2",   3, 2 },    -- Perfect fifth
    { "4:3",   4, 3 },    -- Perfect fourth
    { "5:4",   5, 4 },    -- Major third
    { "5:3",   5, 3 },    -- Major sixth
    { "6:5",   6, 5 },    -- Minor third
    { "7:4",   7, 4 },    -- Harmonic seventh
    { "9:8",   9, 8 },    -- Major second
    { "5:2",   5, 2 },    -- Octave + major third
    { "7:2",   7, 2 },    -- ~Octave + minor 7th
    { "9:4",   9, 4 },    -- Octave + major second
    { "11:4", 11, 4 },    -- Harmonic 11th
    { "2:3",   2, 3 },    -- Fifth down
    { "3:4",   3, 4 },    -- Fourth down
}

-- Build enum names array for parameter definition
local ratioNames = {}
for i, r in ipairs(RATIOS) do
    ratioNames[i] = r[1]
end

--------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------

-- Calculate voltage offset for a given ratio index
local function getOffsetVoltage(ratioIndex)
    local r = RATIOS[ratioIndex]
    if not r then return 0 end
    local ratio = r[2] / r[3]
    return math.log(ratio) / math.log(2)  -- log2(ratio)
end

-- Format voltage for display
local function formatVoltage(v)
    if v >= 0 then
        return string.format("+%.3fV", v)
    else
        return string.format("%.3fV", v)
    end
end

--------------------------------------------------------------------------------
-- Script Definition
--------------------------------------------------------------------------------

return {
    name = 'FM Helper'
    , author = 'Expert Sleepers Ltd'
    
    , init = function(self)
        -- Initialize state
        self.inputVoltage = 0
        self.offsets = { 0, 0, 0, 0 }
        self.outputVoltages = { 0, 0, 0, 0 }
        
        return {
            inputs = 1
            , outputs = { kLinear, kLinear, kLinear, kLinear }
            , inputNames = { "V/Oct In" }
            , outputNames = { "Ratio 1", "Ratio 2", "Ratio 3", "Ratio 4" }
            , parameters = {
                { "Ratio 1", ratioNames, 1 }      -- Default 1:1
                , { "Ratio 2", ratioNames, 2 }    -- Default 2:1
                , { "Ratio 3", ratioNames, 5 }    -- Default 5:1
                , { "Ratio 4", ratioNames, 12 }   -- Default 3:2
            }
        }
    end
    
    , step = function(self, dt, inputs)
        -- Read input voltage
        self.inputVoltage = inputs[1]
        
        -- Calculate offset for each output based on parameter selection
        local outputs = {}
        for i = 1, 4 do
            local ratioIndex = self.parameters[i]
            self.offsets[i] = getOffsetVoltage(ratioIndex)
            self.outputVoltages[i] = self.inputVoltage + self.offsets[i]
            outputs[i] = self.outputVoltages[i]
        end
        
        return outputs
    end
    
    , draw = function(self)
        -- Display layout constants
        local colX = { 8, 136 }   -- Two columns
        local startY = 16
        local lineHeight = 12
        
        -- Title
        drawText(128, 10, "FM Helper", 12, "centre")
        
        -- Draw horizontal separator
        drawLine(0, 14, 256, 14, 4)
        
        -- Input voltage display
        drawTinyText(4, 24, "IN: " .. formatVoltage(self.inputVoltage), 8)
        
        -- Draw each output's info in two columns
        for i = 1, 4 do
            local col = ((i - 1) % 2) + 1
            local row = math.floor((i - 1) / 2)
            local x = colX[col]
            local y = 36 + row * 14
            
            local ratioIndex = self.parameters[i]
            local ratioName = RATIOS[ratioIndex][1]
            local offsetStr = formatVoltage(self.offsets[i])
            
            -- Output number and ratio
            drawText(x, y, i .. ": " .. ratioName, 15)
            
            -- Offset value (smaller, dimmer)
            drawTinyText(x + 50, y, offsetStr, 10)
        end
        
        -- Output voltage bar visualization
        local barY = 56
        local barHeight = 6
        local centerX = 128
        local scale = 20  -- pixels per volt
        
        drawLine(centerX, barY - 1, centerX, barY + barHeight + 1, 4)  -- Zero line
        
        for i = 1, 4 do
            local offset = self.offsets[i]
            local barWidth = math.abs(offset) * scale
            local x1, x2
            
            if offset >= 0 then
                x1 = centerX
                x2 = math.min(centerX + barWidth, 254)
            else
                x1 = math.max(centerX - barWidth, 2)
                x2 = centerX
            end
            
            -- Stagger bars vertically by output number would be nice but space is tight
            -- Just draw a tick for each output
            local tickX = centerX + offset * scale
            tickX = math.max(2, math.min(254, tickX))
            
            -- Color intensity based on output number
            local color = 6 + i * 2
            drawRectangle(tickX - 1, barY, tickX + 1, barY + barHeight, color)
        end
        
        return true  -- Suppress standard parameter line
    end
}
