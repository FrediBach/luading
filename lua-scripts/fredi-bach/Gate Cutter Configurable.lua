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
-- Display helpers
--------------------------------------------------------------------------------

local DISPLAY_CUT_FLASH_TIME = 0.08
local DISPLAY_RELEASE_TIME = 0.18

local function clamp(value, minimum, maximum)
    return math.max(minimum, math.min(maximum, value))
end

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

        self.display_time = 0
        self.display_state_started = 0
        self.display_cut_flash_started = -1
        self.display_release_started = -1
        self.display_blade_phase = 0
        self.display_ribbon_distance = 0

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
            self.display_state_started = self.display_time
            self.display_release_started = -1
        else
            -- Gate closed: return to idle
            local wasActive = state ~= "idle"
            state = "idle"
            timer = 0
            gateOut = false
            self.display_state_started = self.display_time
            if wasActive then
                self.display_release_started = self.display_time
            end
        end
        return { gateOut and 5.0 or 0.0 }
    end

    ----------------------------------------------------------------------------
    -- Step function: called every 1ms for timing logic
    ----------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        self.display_time = self.display_time + dt

        -- Blade motion is display-only and follows the real cutting state.
        -- Closure is nearly immediate; reopening leaves the action legible for
        -- another frame without changing gate timing.
        local bladeTarget = state == "cutting" and 1 or 0
        local bladeTime = bladeTarget > self.display_blade_phase
            and 0.012 or 0.045
        local bladeAmount = clamp(dt / bladeTime, 0, 1)
        self.display_blade_phase = self.display_blade_phase
            + (bladeTarget - self.display_blade_phase) * bladeAmount

        local cycleTime = self.parameters[1] + self.parameters[2]
        if (state == "waiting" or state == "cutting") and cycleTime > 0 then
            self.display_ribbon_distance = (
                self.display_ribbon_distance
                + dt * 1000 / cycleTime * 48
            ) % 48
        end

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
                    self.display_state_started = self.display_time
                    self.display_cut_flash_started = self.display_time
                    return { 0.0 }
                else
                    -- Max cuts reached, just pass gate through
                    state = "done"
                    gateOut = true
                    self.display_state_started = self.display_time
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
                self.display_state_started = self.display_time
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
        local ribbonLeft = 7
        local cutterX = 142
        local inputRight = 136
        local outputLeft = 166
        local ribbonRight = 250
        local ribbonTop = 29
        local ribbonBottom = 33

        -- Planned cuts are sockets; completed cuts become bright notches.
        for i = 1, maxCuts do
            local amount
            if maxCuts <= 1 then
                amount = 0.5
            else
                amount = (i - 1) / (maxCuts - 1)
            end
            local x = 18 + amount * 218
            if i <= cutCount then
                local shade = state == "cutting" and i == cutCount and 15 or 11
                drawRectangle(x - 1, 7, x + 1, 12, shade)
            else
                drawLine(x, 8, x, 12, 3)
            end
        end

        drawTinyText(ribbonLeft, 20, "IN", state == "idle" and 4 or 8)
        drawTinyText(
            ribbonRight,
            20,
            "OUT",
            gateOut and 15 or 5,
            "right"
        )
        drawLine(ribbonLeft, 31, ribbonRight, 31, 2)

        -- Time to Cut changes the spacing between seam marks on the incoming
        -- material. The marks advance one configured wait+gap cycle in real
        -- elapsed time.
        local totalTime = math.max(1, timeToCut + cutLength)
        local solidFraction = timeToCut / totalTime
        local seamSpacing = 18 + solidFraction * 34
        local seamOffset = self.display_ribbon_distance % seamSpacing

        if state ~= "idle" then
            drawRectangle(
                ribbonLeft,
                ribbonTop,
                inputRight,
                ribbonBottom,
                state == "cutting" and 11 or 13
            )
            local seamX = inputRight - seamOffset
            while seamX > ribbonLeft do
                drawLine(seamX, ribbonTop, seamX, ribbonBottom, 5)
                seamX = seamX - seamSpacing
            end
        end

        if state == "waiting" or state == "done" then
            -- A bright ribbon reaching the edge is the output-high indicator.
            drawRectangle(
                outputLeft,
                ribbonTop,
                ribbonRight,
                ribbonBottom,
                state == "done" and 12 or 15
            )
        elseif state == "cutting" then
            -- Cut Length controls the dark spatial gap. Dim fragments are
            -- history only; the right edge remains dark for the whole cut,
            -- matching the authoritative low output.
            local gapProgress = clamp(timer / math.max(1, cutLength), 0, 1)
            local gapWidth = 7 + (cutLength / totalTime) * 31
            local gapCentre = outputLeft
                + gapProgress * (ribbonRight - outputLeft)
            local beforeGap = gapCentre - gapWidth / 2
            local afterGap = gapCentre + gapWidth / 2
            if beforeGap > outputLeft then
                drawRectangle(
                    outputLeft,
                    ribbonTop,
                    math.min(beforeGap, ribbonRight),
                    ribbonBottom,
                    6
                )
            end
            if afterGap < ribbonRight then
                drawRectangle(
                    math.max(afterGap, outputLeft),
                    ribbonTop,
                    ribbonRight,
                    ribbonBottom,
                    3
                )
            end
        elseif self.display_release_started >= 0 then
            -- Input fall lets a dim remembered tail leave the stage while the
            -- actual output is already low.
            local releaseAge = self.display_time - self.display_release_started
            if releaseAge < DISPLAY_RELEASE_TIME then
                local releaseProgress = releaseAge / DISPLAY_RELEASE_TIME
                local tailLeft = outputLeft
                    + releaseProgress * (ribbonRight - outputLeft)
                drawRectangle(
                    tailLeft,
                    ribbonTop,
                    ribbonRight,
                    ribbonBottom,
                    7 - math.floor(releaseProgress * 4)
                )
            end
        end

        -- Two handles, a pivot, and two blades form the scissors. The blade
        -- tips converge on the ribbon from the latched cutting state.
        local bladePhase = clamp(self.display_blade_phase, 0, 1)
        local tipOffset = 10 - bladePhase * 9
        local flashAge = self.display_time - self.display_cut_flash_started
        local bladeShade = 10 + math.floor(bladePhase * 3)
        if self.display_cut_flash_started >= 0
            and flashAge < DISPLAY_CUT_FLASH_TIME then
            bladeShade = 15
        end
        drawSmoothCircle(132, 22, 4, 7)
        drawSmoothCircle(132, 40, 4, 7)
        drawSmoothLine(135, 25, cutterX, 31, bladeShade)
        drawSmoothLine(135, 37, cutterX, 31, bladeShade)
        drawSmoothLine(
            cutterX,
            31,
            160,
            31 - tipOffset,
            bladeShade
        )
        drawSmoothLine(
            cutterX,
            31,
            160,
            31 + tipOffset,
            bladeShade
        )
        drawSmoothCircle(cutterX, 31, 2, 15)

        local cutText = string.format("cut %d/%d", cutCount, maxCuts)
        local timerText = "idle"
        if state == "waiting" then
            timerText = string.format(
                "wait %.0fms",
                math.max(0, timeToCut - timer)
            )
        elseif state == "cutting" then
            timerText = string.format(
                "gap %.0fms",
                math.max(0, cutLength - timer)
            )
        elseif state == "done" then
            timerText = "done"
        end
        drawTinyText(4, 62, cutText, 10)
        drawTinyText(252, 62, timerText, gateOut and 12 or 7, "right")

        return true
    end
}
