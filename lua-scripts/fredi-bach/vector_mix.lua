-- Vector Mix
--[[
Triangular vector mixer for three VCOs/sound sources.
Uses X/Y position to crossfade between three sources using
barycentric coordinates. Includes internal LFO for automated
vector movement (orbit). Patch outputs to VCAs controlling
each sound source's level.
]]

--------------------------------------------------------------------------------
-- Constants
--------------------------------------------------------------------------------

-- Triangle vertices (equilateral, centered at origin, radius 1)
-- A = top, B = bottom-left, C = bottom-right
local SQRT3 = math.sqrt(3)
local AX, AY = 0, 1                           -- Top vertex
local BX, BY = -SQRT3/2, -0.5                 -- Bottom-left vertex
local CX, CY = SQRT3/2, -0.5                  -- Bottom-right vertex

-- Voltage scaling
local INPUT_SCALE = 0.2                        -- ±5V input -> ±1 normalized
local MAX_OUTPUT_VOLTAGE = 8.0                 -- Maximum output voltage

--------------------------------------------------------------------------------
-- Local State
--------------------------------------------------------------------------------

local lfoPhase = 0                             -- Internal LFO phase [0, 1)
local lfoRadius = 0                            -- Smoothed LFO radius
local weights = { 0.333, 0.333, 0.333 }        -- Current mix weights

--------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------

--- Calculate barycentric weights for point (px, py) in triangle ABC
-- Returns three weights that sum to ~1 when inside triangle
-- Weights are clamped to [0, 1] for points outside triangle
local function barycentricWeights(px, py)
    -- Using the standard barycentric formula
    local denom = (BY - CY) * (AX - CX) + (CX - BX) * (AY - CY)
    
    -- Avoid division by zero
    if math.abs(denom) < 0.0001 then
        return 0.333, 0.333, 0.333
    end
    
    local wA = ((BY - CY) * (px - CX) + (CX - BX) * (py - CY)) / denom
    local wB = ((CY - AY) * (px - CX) + (AX - CX) * (py - CY)) / denom
    local wC = 1 - wA - wB
    
    -- Clamp weights to [0, 1]
    wA = math.max(0, math.min(1, wA))
    wB = math.max(0, math.min(1, wB))
    wC = math.max(0, math.min(1, wC))
    
    -- Normalize so they sum to 1
    local sum = wA + wB + wC
    if sum > 0 then
        wA, wB, wC = wA / sum, wB / sum, wC / sum
    end
    
    return wA, wB, wC
end

--- Apply response curve to weight
-- mode: 1=linear, 2=equal power, 3=logarithmic
local function applyResponseCurve(w, mode)
    if mode == 2 then
        -- Equal power (sine curve) - better for audio crossfades
        return math.sin(w * math.pi / 2)
    elseif mode == 3 then
        -- Logarithmic - more dramatic response
        return w * w
    end
    -- Linear (mode 1 or default)
    return w
end

--- Simple one-pole lowpass filter for smoothing
local function smooth(current, target, coeff)
    return current + (target - current) * coeff
end

--------------------------------------------------------------------------------
-- Script Definition
--------------------------------------------------------------------------------

return
{
    name = 'Vector Mix'
    , author = 'Expert Sleepers Ltd'
    
    ------------------------------------------------------------------------
    -- Initialization
    ------------------------------------------------------------------------
    , init = function(self)
        -- Initialize state
        lfoPhase = 0
        lfoRadius = 0
        weights = { 0.333, 0.333, 0.333 }
        
        return
        {
            inputs = { kCV, kCV }                       -- X and Y position CVs
            , inputNames = { "X Position", "Y Position" }
            , outputs = { kLinear, kLinear, kLinear }   -- Three VCA CVs
            , outputNames = { "VCO A Level", "VCO B Level", "VCO C Level" }
            , parameters = 
            {
                { "LFO Rate", 0, 100, 0, kPercent }               -- 1: Internal LFO speed (0=off)
                , { "LFO Depth", 0, 100, 50, kPercent }           -- 2: LFO modulation depth
                , { "X Offset", -100, 100, 0, kPercent }          -- 3: Manual X offset
                , { "Y Offset", -100, 100, 0, kPercent }          -- 4: Manual Y offset
                , { "Response", { "Linear", "EqualPow", "Log" }, 1 }  -- 5: Crossfade curve
                , { "Out Range", { "5V", "8V", "10V" }, 2 }       -- 6: Output voltage range
                , { "Smoothing", 0, 100, 30, kPercent }           -- 7: Output smoothing
            }
        }
    end
    
    ------------------------------------------------------------------------
    -- Main Processing Step (called every 1ms)
    ------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        local params = self.parameters
        
        -- Get parameters
        local lfoRate = params[1] / 100           -- 0 to 1
        local lfoDepth = params[2] / 100          -- 0 to 1
        local xOffset = params[3] / 100           -- -1 to 1
        local yOffset = params[4] / 100           -- -1 to 1
        local responseMode = params[5]            -- 1, 2, or 3
        local outRangeMode = params[6]            -- 1, 2, or 3
        local smoothing = params[7] / 100         -- 0 to 1
        
        -- Determine output voltage range
        local outVoltage
        if outRangeMode == 1 then
            outVoltage = 5.0
        elseif outRangeMode == 2 then
            outVoltage = 8.0
        else
            outVoltage = 10.0
        end
        
        -- Calculate smoothing coefficient (higher = faster response)
        local smoothCoeff = 0.05 + (1 - smoothing) * 0.95
        
        -- Update internal LFO (circular orbit)
        local lfoX, lfoY = 0, 0
        if lfoRate > 0 then
            -- LFO frequency: 0.01 Hz to 2 Hz
            local freq = 0.01 + lfoRate * lfoRate * 2
            lfoPhase = lfoPhase + dt * freq
            if lfoPhase >= 1 then
                lfoPhase = lfoPhase - 1
            end
            
            -- Smooth the radius for clean starts/stops
            local targetRadius = lfoDepth
            lfoRadius = smooth(lfoRadius, targetRadius, 0.1)
            
            -- Circular motion
            local angle = lfoPhase * 2 * math.pi
            lfoX = math.cos(angle) * lfoRadius
            lfoY = math.sin(angle) * lfoRadius
        else
            lfoRadius = smooth(lfoRadius, 0, 0.1)
        end
        
        -- Combine all position sources:
        -- External CV + manual offset + internal LFO
        local x = inputs[1] * INPUT_SCALE + xOffset + lfoX
        local y = inputs[2] * INPUT_SCALE + yOffset + lfoY
        
        -- Clamp to reasonable range (slightly beyond triangle)
        x = math.max(-1.5, math.min(1.5, x))
        y = math.max(-1.5, math.min(1.5, y))
        
        -- Calculate barycentric weights
        local wA, wB, wC = barycentricWeights(x, y)
        
        -- Apply response curve
        wA = applyResponseCurve(wA, responseMode)
        wB = applyResponseCurve(wB, responseMode)
        wC = applyResponseCurve(wC, responseMode)
        
        -- Smooth the weights to avoid zipper noise
        weights[1] = smooth(weights[1], wA, smoothCoeff)
        weights[2] = smooth(weights[2], wB, smoothCoeff)
        weights[3] = smooth(weights[3], wC, smoothCoeff)
        
        -- Store position for display
        self.displayX = x
        self.displayY = y
        
        -- Convert weights to output voltages
        return {
            weights[1] * outVoltage,
            weights[2] * outVoltage,
            weights[3] * outVoltage
        }
    end
    
    ------------------------------------------------------------------------
    -- Custom Display
    ------------------------------------------------------------------------
    , draw = function(self)
        local cx, cy = 180, 32                    -- Center of display area
        local scale = 25                          -- Triangle size in pixels
        
        -- Triangle vertex positions on screen
        local screenAX = cx + AX * scale
        local screenAY = cy - AY * scale          -- Y inverted for screen coords
        local screenBX = cx + BX * scale
        local screenBY = cy - BY * scale
        local screenCX = cx + CX * scale
        local screenCY = cy - CY * scale
        
        -- Draw triangle outline
        drawLine(screenAX, screenAY, screenBX, screenBY, 4)
        drawLine(screenBX, screenBY, screenCX, screenCY, 4)
        drawLine(screenCX, screenCY, screenAX, screenAY, 4)
        
        -- Draw vertex labels with brightness based on weight
        local brightnessA = math.floor(4 + weights[1] * 11)
        local brightnessB = math.floor(4 + weights[2] * 11)
        local brightnessC = math.floor(4 + weights[3] * 11)
        
        drawText(screenAX, screenAY - 4, "A", brightnessA, "centre")
        drawText(screenBX - 6, screenBY + 8, "B", brightnessB, "centre")
        drawText(screenCX + 6, screenCY + 8, "C", brightnessC, "centre")
        
        -- Draw current position marker
        if self.displayX and self.displayY then
            local posX = cx + self.displayX * scale
            local posY = cy - self.displayY * scale
            -- Filled circle for position
            drawCircle(posX, posY, 3, 15)
        end
        
        -- Draw weight bars on the left side
        local barX = 10
        local barWidth = 40
        local barHeight = 10
        
        -- Labels and bars for each output
        drawTinyText(barX, 18, "A", 8)
        drawBox(barX + 8, 12, barX + 8 + barWidth, 12 + barHeight, 4)
        drawRectangle(barX + 8, 12, barX + 8 + weights[1] * barWidth, 12 + barHeight, 12)
        
        drawTinyText(barX, 34, "B", 8)
        drawBox(barX + 8, 28, barX + 8 + barWidth, 28 + barHeight, 4)
        drawRectangle(barX + 8, 28, barX + 8 + weights[2] * barWidth, 28 + barHeight, 12)
        
        drawTinyText(barX, 50, "C", 8)
        drawBox(barX + 8, 44, barX + 8 + barWidth, 44 + barHeight, 4)
        drawRectangle(barX + 8, 44, barX + 8 + weights[3] * barWidth, 44 + barHeight, 12)
        
        -- Show LFO indicator if active
        if self.parameters[1] > 0 then
            local lfoIndicator = math.sin(lfoPhase * 2 * math.pi) > 0 and "*" or "o"
            drawTinyText(cx, 58, "LFO " .. lfoIndicator, 6)
        end
        
        -- Don't suppress standard parameter line
        return false
    end
}
