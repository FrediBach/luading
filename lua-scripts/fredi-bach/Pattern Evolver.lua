-- Pattern Evolver
--[[
Captures incoming gate patterns, detects repetition, then evolves
the pattern with configurable probability and mutation modes.
Feed it a drum pattern and watch it slowly drift into new territory.

Inputs:
  1. Clock (trigger) - advances pattern position
  2. Pattern (gate) - gate pattern to record/evolve
  3. Reset (trigger) - restart pattern recording

Outputs:
  1. Evolved pattern (gate)
  2. End of cycle trigger
  3. Original pattern (for comparison)
]]

--------------------------------------------------------------------------------
-- Constants
--------------------------------------------------------------------------------
local STATE_RECORDING = 1
local STATE_EVOLVING  = 2

local MODE_FLIP   = 1  -- Toggle gates on/off
local MODE_SKIP   = 2  -- Remove gates (bias toward silence)
local MODE_ADD    = 3  -- Add gates (bias toward density)
local MODE_SHIFT  = 4  -- Shift gates in time (swap with neighbor)
local MODE_ALL    = 5  -- Random mix of all modes

local MAX_PATTERN_LENGTH = 128

--------------------------------------------------------------------------------
-- Script-local state
--------------------------------------------------------------------------------
local state = STATE_RECORDING
local recordBuffer = {}        -- Recording buffer for pattern detection
local pattern = {}             -- The detected/locked pattern
local evolvedPattern = {}      -- Current evolved version
local patternLength = 0        -- Detected pattern length
local currentStep = 0          -- Current playback position
local recordPosition = 0       -- Current recording position
local cycleCount = 0           -- Number of evolution cycles completed
local lastGateValue = false    -- For tracking input gate state
local eocPending = false       -- End of cycle trigger pending

--------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------

--- Deep copy a table (for pattern copying)
local function copyPattern(src)
    local dst = {}
    for i = 1, #src do
        dst[i] = src[i]
    end
    return dst
end

--- Check if two pattern segments match
--- @param buf table The buffer to check
--- @param startA number Start index of first segment
--- @param startB number Start index of second segment  
--- @param length number Length to compare
--- @return boolean True if segments match
local function patternsMatch(buf, startA, startB, length)
    for i = 0, length - 1 do
        if buf[startA + i] ~= buf[startB + i] then
            return false
        end
    end
    return true
end

--- Detect if a repeating pattern exists in the buffer
--- @param buf table The recording buffer
--- @param minLen number Minimum pattern length to detect
--- @param maxLen number Maximum pattern length to detect
--- @return number|nil Pattern length if found, nil otherwise
local function detectPattern(buf, minLen, maxLen)
    local bufLen = #buf
    
    -- Need at least 2x minimum length to detect repetition
    if bufLen < minLen * 2 then
        return nil
    end
    
    -- Try pattern lengths from minimum to maximum
    for tryLen = minLen, math.min(maxLen, math.floor(bufLen / 2)) do
        -- Check if the last tryLen steps match the tryLen steps before that
        local matchStart1 = bufLen - tryLen + 1
        local matchStart2 = bufLen - (tryLen * 2) + 1
        
        if matchStart2 >= 1 then
            if patternsMatch(buf, matchStart1, matchStart2, tryLen) then
                return tryLen
            end
        end
    end
    
    return nil
end

--- Apply a single mutation to a pattern
--- @param pat table The pattern to mutate
--- @param step number The step to potentially mutate
--- @param mode number Mutation mode
--- @param probability number Mutation probability (0-100)
local function mutateStep(pat, step, mode, probability)
    -- Roll for mutation
    if math.random(100) > probability then
        return
    end
    
    local actualMode = mode
    if mode == MODE_ALL then
        actualMode = math.random(1, 4)  -- Pick random mode (excluding ALL)
    end
    
    if actualMode == MODE_FLIP then
        -- Toggle the gate
        pat[step] = not pat[step]
        
    elseif actualMode == MODE_SKIP then
        -- Remove gate (set to false)
        pat[step] = false
        
    elseif actualMode == MODE_ADD then
        -- Add gate (set to true)
        pat[step] = true
        
    elseif actualMode == MODE_SHIFT then
        -- Swap with next step (wrapping)
        local nextStep = step % #pat + 1
        pat[step], pat[nextStep] = pat[nextStep], pat[step]
    end
end

--- Apply evolution to the entire pattern for a new cycle
--- @param pat table The pattern to evolve
--- @param mode number Mutation mode
--- @param probability number Mutation probability per step
local function evolvePattern(pat, mode, probability)
    for i = 1, #pat do
        mutateStep(pat, i, mode, probability)
    end
end

--- Reset to recording state
local function resetToRecording()
    state = STATE_RECORDING
    recordBuffer = {}
    pattern = {}
    evolvedPattern = {}
    patternLength = 0
    currentStep = 0
    recordPosition = 0
    cycleCount = 0
end

--------------------------------------------------------------------------------
-- Main Script Table
--------------------------------------------------------------------------------
return
{
    name = 'Pattern Evolver'
    , author = 'Expert Sleepers Ltd'
    
    ------------------------------------------------------------------------
    -- Initialization
    ------------------------------------------------------------------------
    , init = function(self)
        -- Initialize random seed (will be somewhat random from timing)
        math.randomseed(os.time())
        
        -- Reset state
        resetToRecording()
        
        return
        {
            -- Input 1: Clock (trigger)
            -- Input 2: Pattern (gate to record/evolve)
            -- Input 3: Reset (trigger)
            inputs = {
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/8
                kGate,    -- Type: Gate, Synced: true, Division: 1/4
                kTrigger, -- Type: Trigger, Synced: true, Division: 2 bars
            }
            , inputNames = { "Clock", "Pattern In", "Reset" }
            
            -- Output 1: Evolved pattern
            -- Output 2: End of cycle trigger
            -- Output 3: Original pattern (for comparison)
            , outputs = {
                kStepped, -- Type: Kick Trigger
                kStepped, -- Type: Hi-hat Trigger
                kStepped, -- Type: Snare Trigger
            }
            , outputNames = { "Evolved Out", "EOC", "Original Out" }
            
            , parameters = 
            {
                -- Minimum pattern length before detection (4-64 steps)
                { "Min Length", 4, 64, 8 }
                -- Maximum pattern length to detect (4-128 steps)
                , { "Max Length", 4, MAX_PATTERN_LENGTH, 32 }
                -- Evolution probability per step (0-100%)
                , { "Probability", 0, 100, 15, kPercent }
                -- Evolution mode
                , { "Mode", { "Flip", "Skip", "Add", "Shift", "All" }, 1 }
                -- Evolve every N cycles (1 = every cycle)
                , { "Every N Cyc", 1, 16, 1 }
            }
        }
    end
    
    ------------------------------------------------------------------------
    -- Clock Trigger Handler
    ------------------------------------------------------------------------
    , trigger = function(self, input)
        local outputs = {}
        
        if input == 1 then
            -- Clock input triggered
            local minLen = self.parameters[1]
            local maxLen = self.parameters[2]
            local probability = self.parameters[3]
            local mode = self.parameters[4]
            local everyN = self.parameters[5]
            
            if state == STATE_RECORDING then
                -- We're still recording - the gate handler stores values
                -- Here we just advance position and check for pattern
                recordPosition = recordPosition + 1
                
                -- Try to detect pattern
                local detected = detectPattern(recordBuffer, minLen, maxLen)
                if detected then
                    -- Pattern found! Extract it and switch to evolving
                    patternLength = detected
                    pattern = {}
                    local startIdx = #recordBuffer - patternLength + 1
                    for i = 1, patternLength do
                        pattern[i] = recordBuffer[startIdx + i - 1]
                    end
                    
                    -- Initialize evolved pattern as copy of original
                    evolvedPattern = copyPattern(pattern)
                    
                    -- Start playback from beginning
                    currentStep = 1
                    cycleCount = 0
                    state = STATE_EVOLVING
                    
                    -- Output current step
                    outputs[1] = evolvedPattern[currentStep] and 5.0 or 0.0
                    outputs[3] = pattern[currentStep] and 5.0 or 0.0
                end
                
            else
                -- STATE_EVOLVING
                -- Advance to next step
                currentStep = currentStep + 1
                
                if currentStep > patternLength then
                    -- End of cycle - wrap around
                    currentStep = 1
                    cycleCount = cycleCount + 1
                    eocPending = true
                    
                    -- Apply evolution if this is an evolution cycle
                    if cycleCount % everyN == 0 then
                        evolvePattern(evolvedPattern, mode, probability)
                    end
                end
                
                -- Output current step values
                outputs[1] = evolvedPattern[currentStep] and 5.0 or 0.0
                outputs[3] = pattern[currentStep] and 5.0 or 0.0
                
                -- Send EOC trigger if pending
                if eocPending then
                    outputs[2] = 5.0
                    eocPending = false
                else
                    outputs[2] = 0.0
                end
            end
            
        elseif input == 3 then
            -- Reset input triggered
            resetToRecording()
            outputs[1] = 0.0
            outputs[2] = 0.0
            outputs[3] = 0.0
        end
        
        return outputs
    end
    
    ------------------------------------------------------------------------
    -- Gate Handler (for pattern input)
    ------------------------------------------------------------------------
    , gate = function(self, input, rising)
        if input == 2 then
            -- Pattern input gate changed
            if state == STATE_RECORDING then
                -- Record the gate state at the current position
                -- Note: We record on both rising and falling edges
                -- The actual value is sampled when clock arrives
                lastGateValue = rising
            end
        end
        return {}
    end
    
    ------------------------------------------------------------------------
    -- Step Function (called every 1ms)
    ------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        -- During recording, continuously sample the gate input
        -- so we have the value ready when clock triggers
        if state == STATE_RECORDING then
            -- Sample gate input (> 1V = high)
            local gateHigh = inputs[2] > 1.0
            
            -- Store in buffer if we have a valid position
            if recordPosition > 0 and recordPosition <= MAX_PATTERN_LENGTH * 2 then
                recordBuffer[recordPosition] = gateHigh
            end
        end
        
        return {}
    end
    
    ------------------------------------------------------------------------
    -- Display
    ------------------------------------------------------------------------
    , draw = function(self)
        local params = self.parameters
        
        -- Header info
        if state == STATE_RECORDING then
            drawText(128, 15, "RECORDING", 15, "centre")
            drawText(128, 28, "Steps: " .. recordPosition, 8, "centre")
            drawText(128, 40, "Min: " .. params[1] .. " Max: " .. params[2], 6, "centre")
        else
            drawText(128, 15, "EVOLVING", 15, "centre")
            drawText(128, 28, "Len: " .. patternLength .. " Cycle: " .. cycleCount, 8, "centre")
        end
        
        -- Draw pattern visualization
        if state == STATE_EVOLVING and patternLength > 0 then
            local startX = 10
            local endX = 246
            local width = endX - startX
            local stepWidth = math.min(width / patternLength, 8)
            local actualWidth = stepWidth * patternLength
            local offsetX = (width - actualWidth) / 2 + startX
            
            -- Original pattern (top row)
            local y1 = 48
            for i = 1, patternLength do
                local x = offsetX + (i - 1) * stepWidth
                if pattern[i] then
                    drawRectangle(x, y1, x + stepWidth - 2, y1 + 5, 4)
                else
                    drawBox(x, y1, x + stepWidth - 2, y1 + 5, 2)
                end
            end
            
            -- Evolved pattern (bottom row)
            local y2 = 56
            for i = 1, patternLength do
                local x = offsetX + (i - 1) * stepWidth
                local brightness = (i == currentStep) and 15 or (evolvedPattern[i] and 10 or 3)
                if evolvedPattern[i] then
                    drawRectangle(x, y2, x + stepWidth - 2, y2 + 5, brightness)
                else
                    if i == currentStep then
                        drawBox(x, y2, x + stepWidth - 2, y2 + 5, 8)
                    else
                        drawBox(x, y2, x + stepWidth - 2, y2 + 5, 2)
                    end
                end
            end
            
            -- Playhead indicator
            local phX = offsetX + (currentStep - 1) * stepWidth + stepWidth / 2
            drawLine(phX, 44, phX, 63, 12)
        elseif state == STATE_RECORDING and recordPosition > 0 then
            -- Show recording progress bar
            local progress = math.min(recordPosition / (params[1] * 2), 1.0)
            local barWidth = 200
            local barX = (256 - barWidth) / 2
            drawBox(barX, 50, barX + barWidth, 58, 4)
            drawRectangle(barX + 1, 51, barX + 1 + (barWidth - 2) * progress, 57, 8)
        end
    end
    
    ------------------------------------------------------------------------
    -- Serialization (save/restore state with preset)
    ------------------------------------------------------------------------
    , serialise = function(self)
        return {
            pattern = pattern,
            evolvedPattern = evolvedPattern,
            patternLength = patternLength,
            currentStep = currentStep,
            cycleCount = cycleCount,
            state = state
        }
    end
}
