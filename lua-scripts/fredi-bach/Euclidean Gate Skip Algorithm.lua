-- Euclidean Gate Skip
--[[
Euclidean rhythm gate processor with probability control.
Passes or blocks incoming gates/triggers based on a Euclidean
pattern and random probability, transforming boring clock
signals into interesting rhythmic patterns.

Inputs:
  1. Gate/Trigger In - The signal to process
  2. Reset - Restart pattern from step 1

Outputs:
  1. Gate Out - Gates that passed through
  2. Skipped - Gates that were blocked (for alternate triggering)

Classic Euclidean patterns:
  E(3,8)  = Cuban tresillo
  E(5,8)  = Cuban cinquillo  
  E(7,12) = West African bell pattern
  E(5,16) = Bossa nova
]]

--------------------------------------------------------------------------------
-- Euclidean Pattern Generator (Bjorklund algorithm via accumulator method)
--------------------------------------------------------------------------------
local function generateEuclidean(hits, steps)
    local pattern = {}
    
    -- Handle edge cases
    if steps <= 0 then return pattern end
    for i = 1, steps do
        pattern[i] = false
    end
    if hits <= 0 then return pattern end
    if hits >= steps then
        for i = 1, steps do pattern[i] = true end
        return pattern
    end
    
    -- Bresenham-style accumulator distribution
    -- Distributes 'hits' as evenly as possible across 'steps'
    local bucket = 0
    for i = 1, steps do
        bucket = bucket + hits
        if bucket >= steps then
            bucket = bucket - steps
            pattern[i] = true
        end
    end
    
    return pattern
end

--------------------------------------------------------------------------------
-- Display helpers
--------------------------------------------------------------------------------
local DISPLAY_WHEEL_X = 79
local DISPLAY_WHEEL_Y = 31
local DISPLAY_WHEEL_RADIUS = 17
local DISPLAY_FORK_X = 148
local DISPLAY_OUT_X = 218
local DISPLAY_OUT_Y = 21
local DISPLAY_SKIP_X = 218
local DISPLAY_SKIP_Y = 44
local DISPLAY_ROTATE_TIME = 0.18
local DISPLAY_TOKEN_TIME = 0.34
local DISPLAY_TOKEN_TRAIL_TIME = 0.48
local DISPLAY_TOKEN_COUNT = 6
local DISPLAY_HISTORY_COUNT = 12

local function clamp(value, minimum, maximum)
    return math.max(minimum, math.min(maximum, value))
end

local function lerp(from, to, amount)
    return from + (to - from) * amount
end

local function smoothStep(amount)
    local clamped = clamp(amount, 0, 1)
    return clamped * clamped * (3 - 2 * clamped)
end

local function ensurePattern(self, steps, hits)
    if steps ~= self.lastSteps or hits ~= self.lastHits then
        self.pattern = generateEuclidean(hits, steps)
        self.lastSteps = steps
        self.lastHits = hits
    end
end

local function captureDisplayDecision(
    self,
    previousStep,
    currentStep,
    decision,
    probability
)
    self.display_previous_step = previousStep
    self.display_current_step = currentStep
    self.display_transition_started = self.display_time
    self.display_last_decision = decision

    if decision == 0 then return end

    self.display_token_index = (
        self.display_token_index % DISPLAY_TOKEN_COUNT
    ) + 1
    local token = self.display_tokens[self.display_token_index]
    token.started = self.display_time
    token.decision = decision
    token.probability = probability

    self.display_history_index = (
        self.display_history_index % DISPLAY_HISTORY_COUNT
    ) + 1
    self.display_history[self.display_history_index] = decision
    self.display_history_used = math.min(
        DISPLAY_HISTORY_COUNT,
        self.display_history_used + 1
    )
end

--------------------------------------------------------------------------------
-- Main Algorithm
--------------------------------------------------------------------------------
return {
    name = 'Euclidean Gate Skip'
    , author = 'Expert Sleepers Ltd'
    
    ------------------------------------------------------------------------
    -- Initialization
    ------------------------------------------------------------------------
    , init = function(self)
        -- State variables
        self.currentStep = 0       -- Current step in pattern (0 = not started)
        self.pattern = {}          -- Cached Euclidean pattern
        self.lastSteps = 0         -- For detecting parameter changes
        self.lastHits = 0          -- For detecting parameter changes
        self.passing = false       -- Currently passing a gate through?
        self.skipping = false      -- Currently outputting to skip output?
        self.lastDecision = ""     -- For display: "pass", "skip", "rest"
        self.hitCount = 0          -- Stats: total hits passed
        self.skipCount = 0         -- Stats: total hits skipped

        -- Display-only event state uses fixed-size token and decision rings.
        self.display_time = 0
        self.display_previous_step = 0
        self.display_current_step = 0
        self.display_transition_started = -1
        self.display_last_decision = 0
        self.display_probability = 1
        self.display_token_index = 0
        self.display_tokens = {}
        for i = 1, DISPLAY_TOKEN_COUNT do
            self.display_tokens[i] = {
                started = -1,
                decision = 0,
                probability = 1
            }
        end
        self.display_history_index = 0
        self.display_history_used = 0
        self.display_history = {}
        for i = 1, DISPLAY_HISTORY_COUNT do
            self.display_history[i] = 0
        end

        -- Provide a useful first frame before the first control step.
        self.pattern = generateEuclidean(4, 16)
        self.lastSteps = 16
        self.lastHits = 4
        
        return {
            inputs = {
                kGate,    -- Type: Gate, Synced: true, Division: 1/8
                kTrigger, -- Type: Trigger, Synced: true, Division: 2 bars
            }
            , inputNames = { "Gate In", "Reset" }
            , outputs = {
                kStepped, -- Type: Kick Trigger
                kStepped, -- Type: Snare Trigger
            }
            , outputNames = { "Gate Out", "Skipped" }
            , parameters = {
                { "Steps", 1, 32, 16, kNone }
                , { "Hits", 1, 32, 4, kNone }
                , { "Offset", 0, 31, 0, kNone }
                , { "Probability", 0, 100, 100, kPercent }
            }
        }
    end
    
    ------------------------------------------------------------------------
    -- Gate Handler (called on rising and falling edges)
    ------------------------------------------------------------------------
    , gate = function(self, input, rising)
        if input ~= 1 then return {} end
        
        -- Read parameters
        local steps = self.parameters[1]
        local hits = math.min(self.parameters[2], steps)
        local offset = self.parameters[3] % steps
        local probability = self.parameters[4]
        
        -- Regenerate pattern if parameters changed.
        ensurePattern(self, steps, hits)
        if self.currentStep > steps then
            self.currentStep = steps
        end
        
        if rising then
            -- === Rising Edge: Advance step and make decision ===
            
            -- Advance step counter
            local previousStep = self.currentStep
            self.currentStep = self.currentStep + 1
            if self.currentStep > steps then
                self.currentStep = 1
            end
            
            -- Get pattern value at current position (with offset)
            local patternIdx = (
                (self.currentStep - 1 + offset) % steps
            ) + 1
            local isHit = self.pattern[patternIdx] or false
            
            if isHit then
                -- This step is active in the Euclidean pattern
                -- Apply probability check
                local roll = math.random(100)
                if roll <= probability then
                    -- PASS: Gate goes through
                    self.passing = true
                    self.skipping = false
                    self.lastDecision = "pass"
                    self.hitCount = self.hitCount + 1
                    captureDisplayDecision(
                        self,
                        previousStep,
                        self.currentStep,
                        1,
                        probability / 100
                    )
                    return { 5.0, 0.0 }
                else
                    -- SKIP: Gate blocked by probability
                    self.passing = false
                    self.skipping = true
                    self.lastDecision = "skip"
                    self.skipCount = self.skipCount + 1
                    captureDisplayDecision(
                        self,
                        previousStep,
                        self.currentStep,
                        -1,
                        probability / 100
                    )
                    return { 0.0, 5.0 }
                end
            else
                -- REST: Not a hit in the pattern
                self.passing = false
                self.skipping = false
                self.lastDecision = "rest"
                captureDisplayDecision(
                    self,
                    previousStep,
                    self.currentStep,
                    0,
                    probability / 100
                )
                return { 0.0, 0.0 }
            end
        else
            -- === Falling Edge: Close gates ===
            local wasP = self.passing
            local wasS = self.skipping
            self.passing = false
            self.skipping = false
            
            -- Only update outputs that were high
            if wasP or wasS then
                return { 0.0, 0.0 }
            end
            return {}
        end
    end
    
    ------------------------------------------------------------------------
    -- Trigger Handler (for reset input)
    ------------------------------------------------------------------------
    , trigger = function(self, input)
        if input == 2 then
            -- Reset pattern to beginning
            self.currentStep = 0
            self.hitCount = 0
            self.skipCount = 0
            self.lastDecision = ""
            self.display_previous_step = 0
            self.display_current_step = 0
            self.display_transition_started = -1
            self.display_last_decision = 0
            self.display_token_index = 0
            for i = 1, DISPLAY_TOKEN_COUNT do
                self.display_tokens[i].started = -1
                self.display_tokens[i].decision = 0
                self.display_tokens[i].probability = 1
            end
            self.display_history_index = 0
            self.display_history_used = 0
            for i = 1, DISPLAY_HISTORY_COUNT do
                self.display_history[i] = 0
            end
        end
        return {}
    end

    ------------------------------------------------------------------------
    -- Control Step
    ------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        self.display_time = self.display_time + dt

        local steps = self.parameters[1]
        local hits = math.min(self.parameters[2], steps)
        ensurePattern(self, steps, hits)

        local probabilityTarget = self.parameters[4] / 100
        local displayAlpha = clamp(dt * 10, 0, 1)
        self.display_probability = self.display_probability
            + (probabilityTarget - self.display_probability) * displayAlpha

        return {}
    end
    
    ------------------------------------------------------------------------
    -- Display Drawing
    ------------------------------------------------------------------------
    , draw = function(self)
        drawStandardParameterLine()

        local steps = self.parameters[1]
        local hits = math.min(self.parameters[2], steps)
        local offset = self.parameters[3] % steps
        local probability = clamp(self.display_probability, 0, 1)
        local probabilityPercent = math.floor(probability * 100 + 0.5)
        local transitionAge = self.display_time
            - self.display_transition_started
        local visiblePatternStep = clamp(self.currentStep, 0, steps)
        local visiblePreviousStep = clamp(
            self.display_previous_step,
            0,
            steps
        )
        local visibleTargetStep = clamp(
            self.display_current_step,
            0,
            steps
        )
        local transitionProgress = smoothStep(
            transitionAge / DISPLAY_ROTATE_TIME
        )
        local wheelPosition = visibleTargetStep
        if (
            self.display_transition_started >= 0
            and transitionAge < DISPLAY_ROTATE_TIME
        ) then
            local previousStep = visiblePreviousStep
            local targetStep = visibleTargetStep
            if previousStep == steps and targetStep == 1 then
                targetStep = steps + 1
            end
            wheelPosition = lerp(
                previousStep,
                targetStep,
                transitionProgress
            )
        end

        -- The wheel rotates under a fixed twelve-o'clock playhead.
        drawCircle(
            DISPLAY_WHEEL_X,
            DISPLAY_WHEEL_Y,
            DISPLAY_WHEEL_RADIUS + 3,
            3
        )
        drawLine(75, 10, DISPLAY_WHEEL_X, 15, 12)
        drawLine(83, 10, DISPLAY_WHEEL_X, 15, 12)
        drawLine(75, 10, 83, 10, 12)

        for i = 1, steps do
            local patternIdx = ((i - 1 + offset) % steps) + 1
            local isHit = self.pattern[patternIdx] or false
            local angle = -math.pi / 2
                + (i - wheelPosition) / steps * math.pi * 2
            local x = DISPLAY_WHEEL_X
                + math.cos(angle) * DISPLAY_WHEEL_RADIUS
            local y = DISPLAY_WHEEL_Y
                + math.sin(angle) * DISPLAY_WHEEL_RADIUS
            local isCurrent = (
                visiblePatternStep > 0
                and i == visiblePatternStep
            )

            if isCurrent then
                drawSmoothCircle(x, y, 3, 15)
            end

            if isHit then
                drawRectangle(
                    x - 1,
                    y - 1,
                    x + 1,
                    y + 1,
                    isCurrent and 15 or 10
                )
            else
                drawSmoothCircle(
                    x,
                    y,
                    1.2,
                    isCurrent and 9 or 4
                )
            end
        end

        -- A short track leaves the wheel and bends through the probability
        -- pivot before splitting into complementary bins.
        local pivotY = lerp(DISPLAY_SKIP_Y, DISPLAY_OUT_Y, probability)
        drawSmoothLine(99, DISPLAY_WHEEL_Y, 135, DISPLAY_WHEEL_Y, 6)
        drawSmoothLine(
            135,
            DISPLAY_WHEEL_Y,
            DISPLAY_FORK_X,
            pivotY,
            8
        )
        drawSmoothLine(
            DISPLAY_FORK_X,
            pivotY,
            DISPLAY_OUT_X,
            DISPLAY_OUT_Y,
            10
        )
        drawSmoothLine(
            DISPLAY_FORK_X,
            pivotY,
            DISPLAY_SKIP_X,
            DISPLAY_SKIP_Y,
            5
        )
        drawSmoothCircle(DISPLAY_FORK_X, pivotY, 3, 12)

        local outShade = self.passing and 15 or 8
        local skipShade = self.skipping and 15 or 6
        if (
            self.display_last_decision > 0
            and transitionAge >= 0
            and transitionAge < 0.12
        ) then
            outShade = math.max(
                outShade,
                math.floor(15 - transitionAge / 0.12 * 6)
            )
        elseif (
            self.display_last_decision < 0
            and transitionAge >= 0
            and transitionAge < 0.12
        ) then
            skipShade = math.max(
                skipShade,
                math.floor(15 - transitionAge / 0.12 * 7)
            )
        end
        drawBox(218, 15, 251, 27, outShade)
        drawTinyText(234, 24, "OUT", outShade, "centre")
        drawBox(218, 38, 251, 50, skipShade)
        drawTinyText(234, 47, "SKIP", skipShade, "centre")

        -- Fixed token slots preserve several fast pass/skip decisions.
        for i = 1, DISPLAY_TOKEN_COUNT do
            local token = self.display_tokens[i]
            local age = self.display_time - token.started
            if token.started >= 0 and age < DISPLAY_TOKEN_TRAIL_TIME then
                local progress = clamp(age / DISPLAY_TOKEN_TIME, 0, 1)
                local tokenPivotY = lerp(
                    DISPLAY_SKIP_Y,
                    DISPLAY_OUT_Y,
                    token.probability
                )
                local tokenX
                local tokenY
                if progress < 0.4 then
                    local stage = progress / 0.4
                    tokenX = lerp(99, DISPLAY_FORK_X, stage)
                    tokenY = lerp(
                        DISPLAY_WHEEL_Y,
                        tokenPivotY,
                        stage
                    )
                else
                    local stage = (progress - 0.4) / 0.6
                    local targetY = token.decision > 0
                        and DISPLAY_OUT_Y
                        or DISPLAY_SKIP_Y
                    tokenX = lerp(DISPLAY_FORK_X, DISPLAY_OUT_X, stage)
                    tokenY = lerp(tokenPivotY, targetY, stage)
                end
                local fade = clamp(
                    1 - age / DISPLAY_TOKEN_TRAIL_TIME,
                    0,
                    1
                )
                local shade = math.floor(
                    (token.decision > 0 and 8 or 5) + fade * 7
                )
                drawSmoothCircle(tokenX, tokenY, 2, shade)
            end
        end

        local recentPasses = 0
        local recentSkips = 0
        for i = 1, self.display_history_used do
            if self.display_history[i] > 0 then
                recentPasses = recentPasses + 1
            elseif self.display_history[i] < 0 then
                recentSkips = recentSkips + 1
            end
        end

        if self.display_history_used > 0 then
            drawTinyText(
                234,
                57,
                "R " .. recentPasses .. ":" .. recentSkips,
                7,
                "centre"
            )
        else
            drawTinyText(234, 57, "R --", 4, "centre")
        end

        drawTinyText(
            4,
            63,
            string.format("E(%d,%d)", hits, steps),
            9
        )
        drawTinyText(
            128,
            63,
            visiblePatternStep > 0
                and (visiblePatternStep .. "/" .. steps)
                or "-/" .. steps,
            6,
            "centre"
        )
        drawTinyText(
            252,
            63,
            "P " .. probabilityPercent .. "%",
            10,
            "right"
        )

        return true
    end
}
