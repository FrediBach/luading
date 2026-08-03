-- XOR Drum Sequencer
--[[
Generative drum sequencer using XOR'd clock dividers.
Each layer divides the clock (1/1, 1/2, 1/3...) and layers
are XOR'd together to create complex polyrhythmic patterns.
CV control over number of layers and start layer.
]]

--------------------------------------------------------------------------------
-- Configuration Constants
--------------------------------------------------------------------------------

local MAX_LAYERS = 16           -- Maximum number of clock divider layers
local TRIGGER_LENGTH_MS = 10    -- Output trigger duration in milliseconds
local TRIGGER_VOLTAGE = 5.0     -- Trigger output voltage

--------------------------------------------------------------------------------
-- Local State
--------------------------------------------------------------------------------

local stepCounter = 0           -- Main step counter (increments on each clock)
local triggerTimer = 0          -- Timer for trigger pulse duration
local currentOutput = false     -- Current output state
local lastPattern = 0           -- For display: shows which layers are active

--------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------

--- Check if a layer fires on the current step
-- @param step Current step count
-- @param division The clock division for this layer (1 = every step, 2 = every 2nd, etc.)
-- @return boolean True if the layer fires on this step
local function layerFires(step, division)
    return (step % division) == 0
end

--- Calculate the XOR pattern for active layers
-- @param step Current step count  
-- @param startLayer First layer to include (1-indexed)
-- @param numLayers How many consecutive layers to include
-- @return boolean The XOR'd result of all active layers
-- @return number Bitmask of which layers fired (for display)
local function calculateXorPattern(step, startLayer, numLayers)
    local result = false
    local pattern = 0
    
    for i = 0, numLayers - 1 do
        local layerNum = startLayer + i
        if layerNum <= MAX_LAYERS then
            local fires = layerFires(step, layerNum)
            if fires then
                result = not result  -- XOR operation
                pattern = pattern | (1 << i)
            end
        end
    end
    
    return result, pattern
end

--------------------------------------------------------------------------------
-- Main Script
--------------------------------------------------------------------------------

return
{
    name = 'XOR Drums'
    , author = 'Claude'

    -- Luading simulator extension; ignored by Disting NT.
    , luading = {
        parameterPresets = {
            { name = 'Default', values = { 4, 1, 0, 0 } }
            , { name = 'Minimal', values = { 2, 1, 0, 0 } }
            , { name = 'Dense CV', values = { 12, 4, 50, -50 } }
        }
    }
    
    ------------------------------------------------------------------------
    -- Initialization
    ------------------------------------------------------------------------
    , init = function(self)
        -- Reset state
        stepCounter = 0
        triggerTimer = 0
        currentOutput = false
        lastPattern = 0
        
        return
        {
            -- Input 1: Clock (trigger)
            -- Input 2: Reset (trigger)
            -- Input 3: Layers CV (-5V to +5V mapped to parameter range)
            -- Input 4: Start Layer CV (-5V to +5V mapped to parameter range)
            inputs = {
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/8
                kTrigger, -- Type: Trigger, Synced: true, Division: 2 bars
                kCV,      -- Type: Sine LFO, Synced: true, Division: 2 bars
                kCV,      -- Type: Triangle LFO, Synced: true, Division: 1 bar
            }
            , inputNames = { 
                "Clock", 
                "Reset", 
                "Layers CV", 
                "Start CV" 
            }
            
            -- Output 1: Main XOR trigger output
            -- Output 2: Inverse output (for complementary patterns)
            , outputs = {
                kStepped, -- Type: Kick Trigger
                kStepped, -- Type: Snare Trigger
            }
            , outputNames = { 
                "XOR Out", 
                "Inv Out" 
            }
            
            -- Parameters
            , parameters = 
            {
                -- Number of layers to XOR together
                { "Layers", 1, MAX_LAYERS, 4 }
                -- Which layer to start from
                , { "Start Layer", 1, MAX_LAYERS, 1 }
                -- CV amount for Layers parameter
                , { "Layers CV", -100, 100, 0, kPercent }
                -- CV amount for Start Layer parameter
                , { "Start CV", -100, 100, 0, kPercent }
            }
        }
    end
    
    ------------------------------------------------------------------------
    -- Clock Trigger Handler
    ------------------------------------------------------------------------
    , trigger = function(self, input)
        if input == 1 then
            -- Clock input received
            stepCounter = stepCounter + 1
            
            -- Handle counter wrap (use large number to avoid pattern repetition)
            if stepCounter > 1000000 then
                stepCounter = 1
            end
            
            -- Get parameter values
            local numLayers = self.parameters[1]
            local startLayer = self.parameters[2]
            local layersCV = self.parameters[3] / 100.0  -- Convert to -1 to +1
            local startCV = self.parameters[4] / 100.0
            
            -- Store for CV modulation in step function
            self.baseNumLayers = numLayers
            self.baseStartLayer = startLayer
            self.layersCV = layersCV
            self.startCV = startCV
            self.needsUpdate = true
        
        elseif input == 2 then
            -- Reset input received
            stepCounter = 0
            currentOutput = false
            triggerTimer = 0
            return { 0.0, 0.0 }
        end
        
        return {}
    end
    
    ------------------------------------------------------------------------
    -- Step Function (called every 1ms)
    ------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        local outputs = {}
        
        -- Apply CV modulation to parameters
        if self.needsUpdate then
            self.needsUpdate = false
            
            local numLayers = self.baseNumLayers or self.parameters[1]
            local startLayer = self.baseStartLayer or self.parameters[2]
            local layersCV = self.layersCV or 0
            local startCV = self.startCV or 0
            
            -- Apply CV modulation (±5V input scaled by CV amount)
            -- Input 3 is Layers CV, Input 4 is Start CV
            local layersMod = inputs[3] / 5.0 * layersCV * (MAX_LAYERS - 1)
            local startMod = inputs[4] / 5.0 * startCV * (MAX_LAYERS - 1)
            
            -- Calculate modulated values and clamp to valid range
            numLayers = math.floor(numLayers + layersMod + 0.5)
            numLayers = math.max(1, math.min(MAX_LAYERS, numLayers))
            
            startLayer = math.floor(startLayer + startMod + 0.5)
            startLayer = math.max(1, math.min(MAX_LAYERS, startLayer))
            
            -- Ensure we don't exceed MAX_LAYERS total
            if startLayer + numLayers - 1 > MAX_LAYERS then
                numLayers = MAX_LAYERS - startLayer + 1
            end
            
            -- Calculate the XOR pattern
            local result, pattern = calculateXorPattern(stepCounter, startLayer, numLayers)
            lastPattern = pattern
            
            if result then
                -- Start trigger pulse
                currentOutput = true
                triggerTimer = TRIGGER_LENGTH_MS / 1000.0
                outputs[1] = TRIGGER_VOLTAGE
                outputs[2] = 0.0
            else
                outputs[1] = 0.0
                outputs[2] = TRIGGER_VOLTAGE
            end
        end
        
        -- Handle trigger timing
        if triggerTimer > 0 then
            triggerTimer = triggerTimer - dt
            if triggerTimer <= 0 then
                triggerTimer = 0
                currentOutput = false
                outputs[1] = 0.0
            end
        end
        
        return outputs
    end
    
    ------------------------------------------------------------------------
    -- Display Function
    ------------------------------------------------------------------------
    , draw = function(self)
        -- Get current parameter values for display
        local numLayers = self.parameters[1]
        local startLayer = self.parameters[2]
        
        -- Draw title
        drawText(128, 12, "XOR DRUM SEQUENCER", 12, "centre")
        
        -- Draw step counter
        drawText(10, 28, "Step: " .. tostring(stepCounter % 1000), 8)
        
        -- Draw parameter values
        drawText(10, 42, "Layers: " .. tostring(numLayers), 10)
        drawText(10, 54, "Start: " .. tostring(startLayer), 10)
        
        -- Draw layer visualization
        local boxWidth = 12
        local boxHeight = 8
        local startX = 90
        local startY = 35
        
        -- Draw active layers as boxes
        for i = 0, numLayers - 1 do
            local x = startX + (i % 8) * (boxWidth + 2)
            local y = startY + math.floor(i / 8) * (boxHeight + 2)
            
            -- Check if this layer fired in the current pattern
            local fired = (lastPattern & (1 << i)) ~= 0
            
            if fired then
                -- Filled box for firing layers
                drawRectangle(x, y, x + boxWidth, y + boxHeight, 15)
            else
                -- Empty box for non-firing layers
                drawBox(x, y, x + boxWidth, y + boxHeight, 8)
            end
            
            -- Draw division number
            local divNum = startLayer + i
            drawTinyText(x + boxWidth/2, y + boxHeight - 1, tostring(divNum), fired and 0 or 12, "centre")
        end
        
        -- Draw output state indicator
        local outX = 220
        local outY = 40
        if currentOutput then
            drawRectangle(outX, outY, outX + 20, outY + 15, 15)
            drawText(outX + 10, outY + 12, "ON", 0, "centre")
        else
            drawBox(outX, outY, outX + 20, outY + 15, 6)
            drawText(outX + 10, outY + 12, "OFF", 6, "centre")
        end
        
        -- Return false to show standard parameter line
        return false
    end
}
