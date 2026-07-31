-- Song Mode LFO
--[[
Bar-synchronized LFOs for song structure control. Clocked and resettable,
ideal for arrangement automation. Outputs include gate (on/off) and ramp
(0-5V). Set cycle length, active duration, and offset in bars. Active
region can be placed at start or end of cycle.
]]

--------------------------------------------------------------------------------
-- Local State
--------------------------------------------------------------------------------

-- Beat and bar tracking
local beatCount = 0          -- Total beats since last reset
local currentBar = 0         -- Current bar position within cycle (0-indexed)
local beatInBar = 0          -- Current beat within bar (0-indexed)

-- Output state
local gateState = false      -- Current gate state
local rampValue = 0.0        -- Current ramp value (0-5V)

-- For smooth ramp interpolation
local targetRamp = 0.0       -- Target ramp value
local rampPhase = 0.0        -- Phase within active region (0-1)

--------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------

-- Calculate if we're in the active region of the cycle
local function isInActiveRegion(barInCycle, cycleLen, activeLen, offset, fromEnd)
    local activeStart, activeEnd
    
    if fromEnd == 2 then  -- "End" selected (enum index 2)
        -- Active region ends at cycle end
        activeEnd = cycleLen
        activeStart = cycleLen - activeLen
        -- Apply offset (shifts active region earlier)
        activeStart = activeStart - offset
        activeEnd = activeEnd - offset
    else  -- "Start" selected (enum index 1)
        -- Active region starts at cycle start + offset
        activeStart = offset
        activeEnd = offset + activeLen
    end
    
    -- Wrap handling for when active region extends beyond cycle
    if activeStart < 0 then activeStart = 0 end
    if activeEnd > cycleLen then activeEnd = cycleLen end
    
    return barInCycle >= activeStart and barInCycle < activeEnd, activeStart, activeEnd
end

-- Calculate ramp phase (0-1) within the active region
local function calculateRampPhase(barInCycle, beatInBar, beatsPerBar, activeStart, activeEnd)
    if activeEnd <= activeStart then return 0 end
    
    local activeLen = activeEnd - activeStart
    local barsIntoActive = barInCycle - activeStart
    local totalBeatsInActive = activeLen * beatsPerBar
    local beatsIntoActive = (barsIntoActive * beatsPerBar) + beatInBar
    
    return beatsIntoActive / totalBeatsInActive
end

-- Generate ramp value based on shape and phase
local function calculateRampValue(phase, shape)
    -- shape: 1=Up, 2=Down, 3=Triangle, 4=Smooth Up, 5=Smooth Down
    local v = 0
    
    if shape == 1 then      -- Up
        v = phase
    elseif shape == 2 then  -- Down
        v = 1 - phase
    elseif shape == 3 then  -- Triangle
        v = phase < 0.5 and (phase * 2) or (2 - phase * 2)
    elseif shape == 4 then  -- Smooth Up (S-curve)
        v = phase * phase * (3 - 2 * phase)
    elseif shape == 5 then  -- Smooth Down (S-curve)
        v = 1 - (phase * phase * (3 - 2 * phase))
    end
    
    return v * 5.0  -- Scale to 0-5V
end

--------------------------------------------------------------------------------
-- Main Script
--------------------------------------------------------------------------------

return
{
    name = 'Song Mode LFO'
    , author = 'Expert Sleepers Ltd'
    
    --------------------------------------------------------------------------
    -- Initialization
    --------------------------------------------------------------------------
    , init = function(self)
        -- Initialize state
        beatCount = 0
        currentBar = 0
        beatInBar = 0
        gateState = false
        rampValue = 0.0
        rampPhase = 0.0
        
        return
        {
            -- Inputs: Clock and Reset as triggers
            inputs = {
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/4
                kTrigger, -- Type: Trigger, Synced: true, Division: 2 bars
            }
            , inputNames = { "Clock", "Reset" }
            
            -- Outputs: Gate (stepped) and Ramp (linear for smooth CV)
            , outputs = {
                kStepped, -- Type: Hi-hat Trigger
                kLinear,  -- Type: Off
            }
            , outputNames = { "Gate", "Ramp" }
            
            -- Parameters
            , parameters = 
            {
                -- Time signature
                { "Beats/Bar", 1, 16, 4, kNone }
                
                -- Cycle configuration
                , { "Cycle Bars", 1, 128, 16, kNone }
                , { "Active Bars", 1, 128, 4, kNone }
                , { "Offset Bars", 0, 127, 0, kNone }
                
                -- Offset mode
                , { "Offset From", { "Start", "End" }, 1 }
                
                -- Ramp shape
                , { "Ramp Shape", { "Up", "Down", "Triangle", "Smooth Up", "Smooth Dn" }, 1 }
                
                -- Gate polarity option
                , { "Gate High V", 0, 100, 50, kVolts, kBy10 }
                , { "Gate Low V", -50, 50, 0, kVolts, kBy10 }
            }
        }
    end
    
    --------------------------------------------------------------------------
    -- Trigger Handler (Clock and Reset)
    --------------------------------------------------------------------------
    , trigger = function(self, input)
        local p = self.parameters
        local beatsPerBar = p[1]
        local cycleLen = p[2]
        local activeLen = p[3]
        local offset = p[4]
        local fromEnd = p[5]
        local rampShape = p[6]
        local gateHighV = p[7]
        local gateLowV = p[8]
        
        -- Clamp active length to cycle length
        if activeLen > cycleLen then activeLen = cycleLen end
        
        -- Clamp offset to valid range
        local maxOffset = cycleLen - 1
        if offset > maxOffset then offset = maxOffset end
        
        if input == 1 then
            -- Clock input: advance beat counter
            beatCount = beatCount + 1
            beatInBar = beatCount % beatsPerBar
            
            -- Calculate current bar within cycle
            local totalBars = math.floor(beatCount / beatsPerBar)
            currentBar = totalBars % cycleLen
            
        elseif input == 2 then
            -- Reset input: restart cycle
            beatCount = 0
            beatInBar = 0
            currentBar = 0
        end
        
        -- Calculate active state and ramp
        local inActive, activeStart, activeEnd = isInActiveRegion(
            currentBar, cycleLen, activeLen, offset, fromEnd
        )
        
        -- Update gate state
        gateState = inActive
        local gateOut = gateState and gateHighV or gateLowV
        
        -- Update ramp value
        if inActive then
            rampPhase = calculateRampPhase(
                currentBar, beatInBar, beatsPerBar, activeStart, activeEnd
            )
            rampValue = calculateRampValue(rampPhase, rampShape)
        else
            -- Outside active region: hold at start or end value based on shape
            if rampShape == 1 or rampShape == 4 then      -- Up shapes
                rampValue = 0.0
            elseif rampShape == 2 or rampShape == 5 then  -- Down shapes
                rampValue = 5.0
            else  -- Triangle
                rampValue = 0.0
            end
            rampPhase = 0.0
        end
        
        return { gateOut, rampValue }
    end
    
    --------------------------------------------------------------------------
    -- Step Function (for display updates between triggers)
    --------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        -- No continuous processing needed - all updates happen on triggers
        -- Return empty to maintain current output values
        return {}
    end
    
    --------------------------------------------------------------------------
    -- Draw Function (Custom Display)
    --------------------------------------------------------------------------
    , draw = function(self)
        local p = self.parameters
        local beatsPerBar = p[1]
        local cycleLen = p[2]
        local activeLen = p[3]
        local offset = p[4]
        local fromEnd = p[5]
        local rampShape = p[6]
        
        -- Clamp values for display
        if activeLen > cycleLen then activeLen = cycleLen end
        
        -- Calculate active region bounds
        local activeStart, activeEnd
        if fromEnd == 2 then
            activeEnd = cycleLen
            activeStart = cycleLen - activeLen - offset
            if activeStart < 0 then activeStart = 0 end
            activeEnd = activeEnd - offset
        else
            activeStart = offset
            activeEnd = offset + activeLen
            if activeEnd > cycleLen then activeEnd = cycleLen end
        end
        
        -- Display dimensions
        local screenW = 256
        local screenH = 64
        local margin = 4
        local barHeight = 16
        local timelineY = 28
        local rampY = 50
        
        -- Draw cycle timeline
        local timelineW = screenW - margin * 2
        local barW = timelineW / cycleLen
        
        -- Background bar
        drawRectangle(margin, timelineY, margin + timelineW, timelineY + barHeight, 2)
        
        -- Active region
        local activeX1 = margin + (activeStart / cycleLen) * timelineW
        local activeX2 = margin + (activeEnd / cycleLen) * timelineW
        drawRectangle(activeX1, timelineY, activeX2, timelineY + barHeight, 8)
        
        -- Current position marker
        local posX = margin + (currentBar / cycleLen) * timelineW
        drawRectangle(posX, timelineY - 2, posX + math.max(barW, 2), timelineY + barHeight + 2, 15)
        
        -- Draw bar grid lines
        if cycleLen <= 32 then
            for i = 1, cycleLen - 1 do
                local x = margin + (i / cycleLen) * timelineW
                drawLine(x, timelineY, x, timelineY + barHeight, 4)
            end
        end
        
        -- Status text
        local barNum = currentBar + 1  -- Display as 1-indexed
        local statusText = string.format("Bar %d/%d", barNum, cycleLen)
        drawText(margin, 14, statusText, 15)
        
        -- Gate/Ramp status
        local gateText = gateState and "ACTIVE" or "---"
        local gateColor = gateState and 15 or 6
        drawText(screenW - margin, 14, gateText, gateColor, "right")
        
        -- Beat indicator dots
        local dotY = timelineY + barHeight + 6
        local dotSpacing = 8
        local dotStartX = margin
        for i = 0, beatsPerBar - 1 do
            local dotColor = (i == beatInBar) and 15 or 4
            local dx = dotStartX + i * dotSpacing
            drawCircle(dx + 2, dotY, 2, dotColor)
        end
        
        -- Ramp preview (small waveform)
        local rampW = 60
        local rampH = 10
        local rampX = screenW - margin - rampW
        drawBox(rampX, rampY - rampH, rampX + rampW, rampY, 4)
        
        -- Draw ramp shape preview
        local prevX = rampX
        local prevY = rampY
        for i = 0, rampW - 1 do
            local phase = i / (rampW - 1)
            local val = calculateRampValue(phase, rampShape) / 5.0
            local x = rampX + i
            local y = rampY - val * rampH
            if i > 0 then
                drawLine(prevX, prevY, x, y, 10)
            end
            prevX = x
            prevY = y
        end
        
        -- Current ramp value indicator
        local rampBarW = 40
        local rampBarX = margin
        drawBox(rampBarX, rampY - rampH, rampBarX + rampBarW, rampY, 4)
        local fillW = (rampValue / 5.0) * rampBarW
        if fillW > 0 then
            drawRectangle(rampBarX, rampY - rampH, rampBarX + fillW, rampY, 12)
        end
        drawTinyText(rampBarX + rampBarW + 4, rampY - 2, string.format("%.2fV", rampValue), 10)
        
        -- Don't draw standard parameter line (we have custom UI)
        return false
    end
}
