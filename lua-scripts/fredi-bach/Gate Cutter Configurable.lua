-- Gate Cutter
--[[
Cuts rhythmic gaps into incoming gate signals.
After a gate opens, waits for "Time to Cut", then creates a gap of "Cut Length".
This cycle repeats up to "Max Cuts" times per gate.
Perfect for adding rhythmic variation to sustained gates or breaking up drones.
]]

--------------------------------------------------------------------------------
-- State variables (local to script chunk)
--------------------------------------------------------------------------------
local state = "idle"    -- "idle", "waiting", "cutting", "done"
local timer = 0         -- Time accumulator in milliseconds
local cutCount = 0      -- Number of cuts performed in current gate
local gateOut = false   -- Current output state

--------------------------------------------------------------------------------
-- Main script table
--------------------------------------------------------------------------------
return {
    name = 'Gate Cutter'
    , author = 'Expert Sleepers Ltd'

    ----------------------------------------------------------------------------
    -- Initialization
    ----------------------------------------------------------------------------
    , init = function(self)
        -- Reset state
        state = "idle"
        timer = 0
        cutCount = 0
        gateOut = false

        return {
            -- Single gate input for efficient edge detection
            inputs = { kGate }
            , inputNames = { "Gate In" }

            -- Stepped output (gates don't need interpolation)
            , outputs = { kStepped }
            , outputNames = { "Gate Out" }

            -- User parameters
            , parameters = {
                -- Time to Cut: 10ms to 5000ms, default 500ms
                { "Time to Cut", 10, 5000, 500, kMs }
                -- Cut Length: 5ms to 2000ms, default 100ms
                , { "Cut Length", 5, 2000, 100, kMs }
                -- Max Cuts: 1 to 32, default 4
                , { "Max Cuts", 1, 32, 4, kNone }
            }
        }
    end

    ----------------------------------------------------------------------------
    -- Gate handler: called on rising/falling edges
    ----------------------------------------------------------------------------
    , gate = function(self, input, rising)
        if rising then
            -- Gate opened: start waiting for first cut
            state = "waiting"
            timer = 0
            cutCount = 0
            gateOut = true
        else
            -- Gate closed: return to idle
            state = "idle"
            timer = 0
            gateOut = false
        end
        return { gateOut and 5.0 or 0.0 }
    end

    ----------------------------------------------------------------------------
    -- Step function: called every 1ms for timing logic
    ----------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        -- Nothing to do if idle or done (gate passes through)
        if state == "idle" or state == "done" then
            return {}
        end

        -- Accumulate time (dt is in seconds, convert to ms)
        timer = timer + dt * 1000

        -- Read parameters
        local timeToCut = self.parameters[1]
        local cutLength = self.parameters[2]
        local maxCuts = self.parameters[3]

        if state == "waiting" then
            -- Waiting state: count down to next cut
            if timer >= timeToCut then
                if cutCount < maxCuts then
                    -- Start a cut
                    state = "cutting"
                    timer = 0
                    cutCount = cutCount + 1
                    gateOut = false
                    return { 0.0 }
                else
                    -- Max cuts reached, just pass gate through
                    state = "done"
                    gateOut = true
                    return { 5.0 }
                end
            end

        elseif state == "cutting" then
            -- Cutting state: count down until cut ends
            if timer >= cutLength then
                -- Cut finished, return to waiting
                state = "waiting"
                timer = 0
                gateOut = true
                return { 5.0 }
            end
        end

        -- No state change, no output update needed
        return {}
    end

    ----------------------------------------------------------------------------
    -- Draw function: custom visualization (called at 30fps)
    ----------------------------------------------------------------------------
    , draw = function(self)
        local timeToCut = self.parameters[1]
        local cutLength = self.parameters[2]
        local maxCuts = self.parameters[3]

        -- Display area constants
        local centerX = 128
        local topY = 28

        -- State indicator
        local stateText, stateColor
        if state == "idle" then
            stateText = "IDLE"
            stateColor = 5
        elseif state == "waiting" then
            stateText = "GATE ON"
            stateColor = 15
        elseif state == "cutting" then
            stateText = "CUTTING"
            stateColor = 10
        else -- done
            stateText = "DONE"
            stateColor = 12
        end

        drawText(centerX, topY, stateText, stateColor, "centre")

        -- Cut counter
        local cutText = "Cuts: " .. cutCount .. " / " .. maxCuts
        drawText(centerX, topY + 14, cutText, 10, "centre")

        -- Progress bar for timing (when active)
        if state == "waiting" or state == "cutting" then
            local barLeft = 64
            local barRight = 192
            local barY = topY + 26
            local barHeight = 6

            -- Background
            drawBox(barLeft, barY, barRight, barY + barHeight, 3)

            -- Progress fill
            local targetTime = (state == "waiting") and timeToCut or cutLength
            local progress = math.min(timer / targetTime, 1.0)
            local fillRight = barLeft + math.floor((barRight - barLeft) * progress)

            if fillRight > barLeft then
                local fillColor = (state == "cutting") and 8 or 12
                drawRectangle(barLeft + 1, barY + 1, fillRight, barY + barHeight - 1, fillColor)
            end

            -- Time display
            local timeText = string.format("%.0f / %.0f ms", timer, targetTime)
            drawTinyText(centerX, barY + barHeight + 8, timeText, 7, "centre")
        end

        -- Gate output indicator
        local outY = 58
        local indicatorSize = 4
        drawBox(centerX - indicatorSize, outY - indicatorSize, 
                centerX + indicatorSize, outY + indicatorSize, 7)
        if gateOut then
            drawRectangle(centerX - indicatorSize + 1, outY - indicatorSize + 1,
                         centerX + indicatorSize - 1, outY + indicatorSize - 1, 15)
        end
    end
}
