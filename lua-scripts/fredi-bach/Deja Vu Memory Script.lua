-- Deja-Vu
--[[
Probabilistic note memory processor. Remembers past notes and randomly 
replaces incoming notes with memories. Creates melodic callbacks and 
controlled variation. Memory size and probability are CV controllable.
]]

--------------------------------------------------------------------------------
-- Configuration Constants
--------------------------------------------------------------------------------

local MAX_MEMORY = 32          -- Maximum notes in buffer
local MIN_MEMORY = 2           -- Minimum notes in buffer
local DEFAULT_MEMORY = 8       -- Default memory size
local DEFAULT_PROBABILITY = 25 -- Default probability (%)

--------------------------------------------------------------------------------
-- Local State
--------------------------------------------------------------------------------

local noteBuffer = {}          -- Circular buffer for note storage
local bufferIndex = 0          -- Current write position in buffer
local bufferCount = 0          -- Number of notes currently stored
local currentOutput = 0        -- Current output voltage
local lastTriggered = false    -- Track if we just had a deja-vu moment
local cachedPitch = 0          -- Cached pitch input (updated in step)
local cachedMemoryCv = 0       -- Cached memory CV input
local cachedProbCv = 0         -- Cached probability CV input

--------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------

--- Clamps a value between min and max
-- @param value number The value to clamp
-- @param min number Minimum bound
-- @param max number Maximum bound
-- @return number The clamped value
local function clamp(value, min, max)
    if value < min then return min end
    if value > max then return max end
    return value
end

--- Gets a random note from the buffer
-- @param maxIndex number Maximum index to consider (based on effective memory size)
-- @return number|nil The randomly selected note voltage, or nil if buffer empty
local function getRandomNote(maxIndex)
    if bufferCount == 0 then
        return nil
    end
    
    -- Limit to actual stored notes and effective memory size
    local availableNotes = math.min(bufferCount, maxIndex)
    if availableNotes == 0 then
        return nil
    end
    
    -- Select random index from available notes
    local randomIndex = math.random(1, availableNotes)
    
    -- Calculate actual buffer position (working backwards from current position)
    local actualIndex = ((bufferIndex - randomIndex) % MAX_MEMORY) + 1
    
    return noteBuffer[actualIndex]
end

--- Adds a note to the circular buffer
-- @param voltage number The V/Oct voltage to store
local function addNoteToBuffer(voltage)
    bufferIndex = (bufferIndex % MAX_MEMORY) + 1
    noteBuffer[bufferIndex] = voltage
    if bufferCount < MAX_MEMORY then
        bufferCount = bufferCount + 1
    end
end

--- Calculates effective memory size with CV modulation
-- @param self table The script's self table
-- @param cvInput number The CV input voltage
-- @return number The effective memory size (integer)
local function getEffectiveMemorySize(self, cvInput)
    local baseSize = self.parameters[1]
    local cvAmount = self.parameters[3] / 100  -- Convert from percentage
    
    -- CV scales ±10 notes per volt (when CV amount is 100%)
    local cvOffset = cvInput * 10 * cvAmount
    local effectiveSize = math.floor(baseSize + cvOffset + 0.5)
    
    return clamp(effectiveSize, MIN_MEMORY, MAX_MEMORY)
end

--- Calculates effective probability with CV modulation
-- @param self table The script's self table
-- @param cvInput number The CV input voltage
-- @return number The effective probability (0-100)
local function getEffectiveProbability(self, cvInput)
    local baseProbability = self.parameters[2]
    local cvAmount = self.parameters[4] / 100  -- Convert from percentage
    
    -- CV scales ±20% per volt (when CV amount is 100%)
    local cvOffset = cvInput * 20 * cvAmount
    local effectiveProbability = baseProbability + cvOffset
    
    return clamp(effectiveProbability, 0, 100)
end

--------------------------------------------------------------------------------
-- Main Script Table
--------------------------------------------------------------------------------

return {
    name = 'Deja-Vu'
    , author = 'Claude'
    
    ------------------------------------------------------------------------
    -- Initialization
    ------------------------------------------------------------------------
    , init = function(self)
        -- Initialize the note buffer
        for i = 1, MAX_MEMORY do
            noteBuffer[i] = 0
        end
        bufferIndex = 0
        bufferCount = 0
        currentOutput = 0
        lastTriggered = false
        
        -- Seed random number generator
        math.randomseed(os.time())
        
        return {
            -- Input 1: Pitch CV (V/Oct)
            -- Input 2: Gate (triggers note processing)
            -- Input 3: Memory Size CV
            -- Input 4: Probability CV
            inputs = { kCV, kGate, kCV, kCV }
            , inputNames = { 
                "Pitch In", 
                "Gate In", 
                "Memory CV", 
                "Prob CV" 
            }
            
            -- Output 1: Processed Pitch CV (linear for smooth output)
            -- Output 2: Gate pass-through
            , outputs = { kLinear, kStepped }
            , outputNames = { 
                "Pitch Out", 
                "Gate Out" 
            }
            
            -- Algorithm parameters
            , parameters = {
                -- Memory Size: 2-32 notes
                { "Memory Size", MIN_MEMORY, MAX_MEMORY, DEFAULT_MEMORY, kNone }
                -- Probability: 0-100%
                , { "Probability", 0, 100, DEFAULT_PROBABILITY, kPercent }
                -- Memory CV Amount: -100% to +100%
                , { "Mem CV Amt", -100, 100, 0, kPercent }
                -- Probability CV Amount: -100% to +100%
                , { "Prob CV Amt", -100, 100, 0, kPercent }
            }
        }
    end
    
    ------------------------------------------------------------------------
    -- Gate Handler (called on gate rising/falling edge)
    ------------------------------------------------------------------------
    , gate = function(self, input, rising)
        if input ~= 2 then return {} end  -- Only respond to Gate input (input 2)
        
        if rising then
            -- Gate just opened - process the incoming note
            -- Use cached values from the step function
            local pitchIn = cachedPitch
            
            local memorySize = getEffectiveMemorySize(self, cachedMemoryCv)
            local probability = getEffectiveProbability(self, cachedProbCv)
            
            -- Decide whether to trigger deja-vu
            local roll = math.random(100)
            
            if roll <= probability and bufferCount > 0 then
                -- Deja-vu triggered! Get a random past note
                local pastNote = getRandomNote(memorySize)
                if pastNote then
                    currentOutput = pastNote
                    lastTriggered = true
                else
                    currentOutput = pitchIn
                    lastTriggered = false
                end
            else
                -- No deja-vu, pass through the incoming note
                currentOutput = pitchIn
                lastTriggered = false
            end
            
            -- Always add the incoming note to memory (not the output)
            -- This ensures memory represents what was played, not what was output
            addNoteToBuffer(pitchIn)
            
            -- Return gate high
            return { currentOutput, 5.0 }
        else
            -- Gate closed
            return { [2] = 0.0 }  -- Only update gate output
        end
    end
    
    ------------------------------------------------------------------------
    -- Step Function (called every 1ms)
    ------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        -- Cache input values for use by gate function
        -- inputs[1] = Pitch CV, inputs[2] = Gate (handled separately)
        -- inputs[3] = Memory CV, inputs[4] = Probability CV
        cachedPitch = inputs[1] or 0
        cachedMemoryCv = inputs[3] or 0
        cachedProbCv = inputs[4] or 0
        
        -- Continuously output the current pitch (for sample & hold behavior)
        -- Gate output is handled by the gate function
        return { currentOutput }
    end
    
    ------------------------------------------------------------------------
    -- Custom Display
    ------------------------------------------------------------------------
    , draw = function(self)
        local memorySize = getEffectiveMemorySize(self, cachedMemoryCv)
        local probability = getEffectiveProbability(self, cachedProbCv)
        
        -- Title
        drawText(128, 12, "DEJA-VU", 15, "centre")
        
        -- Memory visualization (show buffer as boxes)
        local boxWidth = 6
        local boxSpacing = 2
        local totalWidth = memorySize * (boxWidth + boxSpacing) - boxSpacing
        local startX = 128 - totalWidth / 2
        local boxY = 28
        
        for i = 1, memorySize do
            local x = startX + (i - 1) * (boxWidth + boxSpacing)
            local filled = i <= bufferCount
            
            if filled then
                -- Filled box for stored notes
                drawRectangle(x, boxY, x + boxWidth, boxY + 8, 8)
            else
                -- Empty box for unused slots
                drawBox(x, boxY, x + boxWidth, boxY + 8, 4)
            end
        end
        
        -- Stats line
        local statsY = 48
        drawText(5, statsY, "Mem:" .. memorySize, 10)
        drawText(70, statsY, "Prob:" .. math.floor(probability) .. "%", 10)
        drawText(150, statsY, "Notes:" .. bufferCount, 10)
        
        -- Deja-vu indicator
        if lastTriggered then
            drawText(230, statsY, "!", 15)
            drawCircle(242, statsY - 4, 6, 12)
        end
        
        -- Current output voltage display
        local outputStr = string.format("%.2fV", currentOutput)
        drawText(128, 60, outputStr, 12, "centre")
    end
}
