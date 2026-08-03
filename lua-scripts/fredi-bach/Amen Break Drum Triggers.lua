-- Amen Break
--[[
CV-controllable Amen Break pattern generator.
Generates triggers for kick, snare, closed hi-hat, and open hi-hat.
CV inputs allow smooth morphing between classic and variation patterns.

Inputs:
1. Clock (16th notes) - External clock input
2. Reset - Reset to step 1
3. Pattern CV - Morph between variations (0-5V)
4. Swing CV - Add shuffle (0-5V = 0-50%)
5. Density CV - Ghost note probability (0-5V)

Outputs:
1. Kick trigger
2. Snare trigger  
3. Hi-Hat Closed trigger
4. Hi-Hat Open trigger
5. Accent CV (0-5V velocity)

The classic Amen Break is a 4-beat pattern (16 steps at 16th note resolution).
Pattern CV smoothly crossfades between 4 variations from classic to jungle.
]]

--------------------------------------------------------------------------------
-- PATTERN DATA
-- Each pattern is an array of {step, accent} pairs
-- Steps are 0-15 for one bar of 16th notes (pattern repeats)
-- Accent is 0.0-1.0 for velocity/dynamics
--------------------------------------------------------------------------------

local patterns = {
    -- KICK patterns (4 variations)
    kick = {
        -- Classic Amen: kicks on 1, "and" of 2, "and" of 3
        { {0, 1.0}, {3, 0.8}, {6, 0.9}, {10, 0.7} },
        -- Variation 1: Added syncopation
        { {0, 1.0}, {3, 0.8}, {6, 0.9}, {10, 0.7}, {14, 0.5} },
        -- Variation 2: More driving
        { {0, 1.0}, {3, 0.7}, {4, 0.5}, {6, 0.9}, {10, 0.7}, {12, 0.4} },
        -- Variation 3: Jungle style - busy kicks
        { {0, 1.0}, {3, 0.6}, {6, 0.9}, {9, 0.5}, {10, 0.7}, {12, 0.4}, {14, 0.6} },
    },
    
    -- SNARE patterns (4 variations)
    snare = {
        -- Classic: snares on 2 and 4 (steps 4 and 12), with ghost on "and" of 3
        { {4, 1.0}, {10, 0.6}, {12, 1.0} },
        -- Variation 1: Added ghost notes
        { {4, 1.0}, {7, 0.3}, {10, 0.6}, {12, 1.0}, {15, 0.4} },
        -- Variation 2: Syncopated
        { {4, 1.0}, {8, 0.5}, {10, 0.7}, {12, 1.0}, {14, 0.4} },
        -- Variation 3: Breakcore density
        { {2, 0.4}, {4, 1.0}, {7, 0.3}, {10, 0.7}, {12, 1.0}, {13, 0.3}, {15, 0.5} },
    },
    
    -- CLOSED HI-HAT patterns (4 variations)
    hihat_closed = {
        -- Classic: 8th notes
        { {0, 0.8}, {2, 0.6}, {4, 0.8}, {6, 0.6}, {8, 0.8}, {10, 0.6}, {12, 0.8} },
        -- Variation 1: With pickup 16ths
        { {0, 0.8}, {2, 0.6}, {4, 0.8}, {6, 0.6}, {8, 0.8}, {10, 0.6}, {12, 0.8}, {13, 0.4}, {15, 0.4} },
        -- Variation 2: Full 16ths
        { {0, 0.8}, {1, 0.3}, {2, 0.6}, {3, 0.3}, {4, 0.8}, {5, 0.3}, {6, 0.6}, {7, 0.3},
          {8, 0.8}, {9, 0.3}, {10, 0.6}, {11, 0.3}, {12, 0.8}, {13, 0.3} },
        -- Variation 3: Sparse/broken
        { {0, 0.8}, {4, 0.7}, {6, 0.5}, {8, 0.8}, {12, 0.7} },
    },
    
    -- OPEN HI-HAT patterns (4 variations)
    hihat_open = {
        -- Classic: open on "and" of 4
        { {14, 0.9} },
        -- Variation 1: Two opens
        { {6, 0.6}, {14, 0.9} },
        -- Variation 2: Ride-like
        { {2, 0.5}, {6, 0.5}, {10, 0.5}, {14, 0.9} },
        -- Variation 3: Sparse/dramatic
        { {14, 1.0} },
    },
}

-- Ghost note positions (added based on Density CV)
local ghost_notes = {
    kick =   { {1, 0.3}, {5, 0.25}, {9, 0.3}, {13, 0.25} },
    snare =  { {1, 0.2}, {3, 0.25}, {5, 0.2}, {9, 0.25}, {11, 0.2} },
    hihat =  { {1, 0.3}, {3, 0.3}, {5, 0.3}, {7, 0.3}, {9, 0.3}, {11, 0.3}, {13, 0.3}, {15, 0.3} },
}

--------------------------------------------------------------------------------
-- LOCAL STATE
--------------------------------------------------------------------------------

local current_step = 0
local phase = 0.0
local trigger_states = { 0, 0, 0, 0 }  -- Trigger countdown timers (ms)
local accent_value = 0.0
local last_pattern_cv = 0
local last_swing_cv = 0
local last_density_cv = 0

-- Pseudo-random for probability (deterministic per step for consistency)
local seed = 12345
local function pseudo_random(step_offset)
    seed = (seed * 1103515245 + 12345) % 2147483648
    return (seed / 2147483648)
end

--------------------------------------------------------------------------------
-- HELPER FUNCTIONS
--------------------------------------------------------------------------------

-- Linear interpolation
local function lerp(a, b, t)
    return a + (b - a) * t
end

-- Clamp value to range
local function clamp(v, min_val, max_val)
    if v < min_val then return min_val end
    if v > max_val then return max_val end
    return v
end

-- Convert CV (0-5V) to normalized (0-1)
local function cv_to_normalized(cv)
    return clamp(cv / 5.0, 0.0, 1.0)
end

-- Check if a step should trigger based on pattern interpolation
local function should_trigger(pattern_array, step, pattern_cv, density_cv, ghost_array)
    local norm_pattern = cv_to_normalized(pattern_cv)
    local norm_density = cv_to_normalized(density_cv)
    
    -- Determine which two patterns to blend between
    local pattern_idx = norm_pattern * 3.0  -- 0-3 range for 4 patterns
    local pattern_low = math.floor(pattern_idx) + 1
    local pattern_high = math.min(pattern_low + 1, 4)
    local blend = pattern_idx - (pattern_low - 1)
    
    local pattern_a = pattern_array[pattern_low]
    local pattern_b = pattern_array[pattern_high]
    
    -- Check if step exists in either pattern
    local accent_a, accent_b = 0, 0
    local found_a, found_b = false, false
    
    for _, hit in ipairs(pattern_a) do
        if hit[1] == step then
            accent_a = hit[2]
            found_a = true
            break
        end
    end
    
    for _, hit in ipairs(pattern_b) do
        if hit[1] == step then
            accent_b = hit[2]
            found_b = true
            break
        end
    end
    
    -- Probabilistic blending between patterns
    local trigger = false
    local accent = 0
    
    if found_a and found_b then
        -- Both patterns have this step - always trigger, blend accent
        trigger = true
        accent = lerp(accent_a, accent_b, blend)
    elseif found_a then
        -- Only in pattern A - probability decreases as we move toward B
        trigger = (pseudo_random(step) > blend)
        accent = accent_a
    elseif found_b then
        -- Only in pattern B - probability increases as we move toward B
        trigger = (pseudo_random(step + 100) < blend)
        accent = accent_b
    end
    
    -- Check ghost notes based on density
    if not trigger and ghost_array and norm_density > 0 then
        for _, ghost in ipairs(ghost_array) do
            if ghost[1] == step then
                if pseudo_random(step + 200) < norm_density then
                    trigger = true
                    accent = ghost[2] * norm_density  -- Scale ghost accent by density
                end
                break
            end
        end
    end
    
    return trigger, accent
end

-- Apply swing to step timing (returns adjusted phase threshold)
local function apply_swing(step, swing_amount)
    -- Swing affects even-numbered 16th notes (the "ands")
    if step % 2 == 1 then
        return swing_amount * 0.5  -- Delay by up to 50% of step duration
    end
    return 0
end

-- Find the accent at a step without consuming the musical random sequence.
local function find_hit_accent(pattern, step)
    for _, hit in ipairs(pattern) do
        if hit[1] == step then
            return hit[2]
        end
    end
    return nil
end

-- Calculate a deterministic display strength for a pattern step. This is a
-- preview of likelihood/accent only; actual trigger decisions remain in
-- should_trigger() and are never made by draw().
local function preview_hit_strength(pattern_array, step, pattern_cv, density_cv, ghost_array)
    local norm_pattern = cv_to_normalized(pattern_cv)
    local pattern_position = norm_pattern * 3.0
    local pattern_low = math.floor(pattern_position) + 1
    local pattern_high = math.min(pattern_low + 1, 4)
    local blend = pattern_position - (pattern_low - 1)

    local accent_a = find_hit_accent(pattern_array[pattern_low], step)
    local accent_b = find_hit_accent(pattern_array[pattern_high], step)
    local strength = 0

    if accent_a and accent_b then
        strength = lerp(accent_a, accent_b, blend)
    elseif accent_a then
        strength = accent_a * (1.0 - blend)
    elseif accent_b then
        strength = accent_b * blend
    end

    if ghost_array then
        local ghost_accent = find_hit_accent(ghost_array, step)
        if ghost_accent then
            local ghost_strength = ghost_accent * cv_to_normalized(density_cv)
            strength = math.max(strength, ghost_strength)
        end
    end

    return clamp(strength, 0, 1)
end

local function update_display_preview(self, pattern_cv, density_cv)
    local lanes = {
        { patterns.kick, ghost_notes.kick },
        { patterns.snare, ghost_notes.snare },
        { patterns.hihat_closed, ghost_notes.hihat },
        { patterns.hihat_open, nil },
    }

    for lane = 1, 4 do
        for step = 0, 15 do
            self.display_preview[lane][step + 1] = preview_hit_strength(
                lanes[lane][1],
                step,
                pattern_cv,
                density_cv,
                lanes[lane][2]
            )
        end
    end

    self.display_preview_pattern_cv = pattern_cv
    self.display_preview_density_cv = density_cv
end

local function begin_display_step(self, previous_step, next_step, total_steps)
    self.display_step_from = previous_step
    self.display_step_to = next_step
    if next_step < previous_step then
        self.display_step_to = next_step + total_steps
    end
    self.display_step_started = self.display_time
end

local function record_external_clock(self)
    local now = self.display_time or 0
    if self.display_last_clock_time ~= nil then
        local period = now - self.display_last_clock_time
        if period > 0 then
            self.display_clock_period = period
        end
    end
    self.display_last_clock_time = now
end

--------------------------------------------------------------------------------
-- MAIN SCRIPT
--------------------------------------------------------------------------------

return {
    name = 'Amen Break'
    , author = 'Expert Sleepers Ltd'

    -- Luading simulator extension; ignored by Disting NT.
    , luading = {
        parameterPresets = {
            { name = 'Default', values = { 136, 1, 0, 2, 5 } }
            , { name = 'Swung Break', values = { 136, 1, 18, 2, 5 } }
            , { name = 'Slow 32-step', values = { 90, 2, 8, 1, 8 } }
        }
    }
    
    , init = function(self)
        -- Initialize state
        self.current_step = 0
        self.phase = 0.0
        self.trigger_timers = { 0, 0, 0, 0 }
        self.accent = 0.0
        self.use_ext_clock = true
        self.last_step = -1
        self.swing_delay = 0
        self.pending_triggers = { false, false, false, false }
        self.pending_accents = { 0, 0, 0, 0 }

        -- Display-only state. Short trigger events are stretched visually so
        -- they remain visible at the 30 fps draw cadence.
        self.display_time = 0
        self.display_step_from = 0
        self.display_step_to = 0
        self.display_step_started = 0
        self.display_lane_flashes = { 0, 0, 0, 0 }
        self.display_accent_flash = 0
        self.display_preview = { {}, {}, {}, {} }
        self.display_preview_pattern_cv = nil
        self.display_preview_density_cv = nil
        self.display_last_clock_time = nil
        self.display_clock_period = nil
        
        return {
            inputs = {
                kTrigger, -- Type: Trigger, Synced: true, Division: 1/16
                kTrigger, -- Type: Trigger, Synced: true, Division: 2 bars
                kCV,      -- Type: Sine LFO, Synced: true, Division: 2 bars
                kCV,      -- Type: Triangle LFO, Synced: true, Division: 2 bars
                kCV,      -- Type: Sine LFO, Synced: true, Division: 1 bar
            }
            , inputNames = { "Clock", "Reset", "Pattern", "Swing", "Density" }
            , outputs = {
                kStepped, -- Type: Kick Trigger
                kStepped, -- Type: Snare Trigger
                kStepped, -- Type: Hi-hat Trigger
                kStepped, -- Type: Hi-hat Trigger
                kLinear,  -- Type: Off
            }
            , outputNames = { "Kick", "Snare", "HH Closed", "HH Open", "Accent" }
            , parameters = {
                { "Tempo", 60, 200, 136, kBPM }
                , { "Steps", { "16", "32" }, 1 }
                , { "Swing", 0, 50, 0, kPercent }
                , { "Ext Clock", { "No", "Yes" }, 2 }
                , { "Trigger ms", 1, 20, 5, kMs }
            }
        }
    end
    
    -- Handle clock trigger
    , trigger = function(self, input)
        if input == 1 then
            -- Clock input - advance step
            local steps_param = self.parameters[2]
            local total_steps = (steps_param == 2) and 32 or 16
            local previous_step = self.current_step
            self.current_step = (self.current_step + 1) % total_steps
            begin_display_step(self, previous_step, self.current_step, total_steps)
            record_external_clock(self)
        elseif input == 2 then
            -- Reset input
            self.current_step = 0
            self.phase = 0.0
            self.last_step = -1
            self.display_step_from = 0
            self.display_step_to = 0
            self.display_step_started = self.display_time
            self.display_lane_flashes = { 0, 0, 0, 0 }
            self.display_accent_flash = 0
            self.display_last_clock_time = nil
            self.display_clock_period = nil
        end
        return {}
    end
    
    -- Main processing loop (called every 1ms)
    , step = function(self, dt, inputs)
        local outputs = {}

        self.display_time = self.display_time + dt
        for i = 1, 4 do
            self.display_lane_flashes[i] = math.max(
                0,
                self.display_lane_flashes[i] - dt / 0.18
            )
        end
        self.display_accent_flash = math.max(0, self.display_accent_flash - dt / 0.22)
        
        -- Read CV inputs
        local pattern_cv = inputs[3] or 0
        local swing_cv = inputs[4] or 0
        local density_cv = inputs[5] or 0
        
        -- Read parameters
        local tempo = self.parameters[1]
        local steps_param = self.parameters[2]
        local swing_param = self.parameters[3]
        local use_ext = self.parameters[4]
        local trig_ms = self.parameters[5]
        
        local total_steps = (steps_param == 2) and 32 or 16

        if self.display_preview_pattern_cv == nil
            or math.abs(pattern_cv - self.display_preview_pattern_cv) >= 0.01
            or math.abs(density_cv - self.display_preview_density_cv) >= 0.01
        then
            update_display_preview(self, pattern_cv, density_cv)
        end
        
        -- Combine parameter swing with CV
        local total_swing = swing_param + (cv_to_normalized(swing_cv) * 50)
        total_swing = clamp(total_swing, 0, 50)
        
        -- Internal clock (if not using external)
        if use_ext == 1 then
            -- Calculate step duration for 16th notes
            -- At tempo BPM, one beat = 60/tempo seconds, one 16th = 60/(tempo*4) seconds
            local step_duration = 60.0 / (tempo * 4.0)
            
            self.phase = self.phase + dt
            
            if self.phase >= step_duration then
                self.phase = self.phase - step_duration
                local previous_step = self.current_step
                self.current_step = (self.current_step + 1) % total_steps
                begin_display_step(self, previous_step, self.current_step, total_steps)
                self.display_last_clock_time = self.display_time
                self.display_clock_period = step_duration
            end
        end
        
        -- Check if we need to trigger on this step (handles swing delay)
        if self.current_step ~= self.last_step then
            self.last_step = self.current_step
            
            local step_in_bar = self.current_step % 16
            
            -- Calculate swing delay for this step
            local swing_delay_ms = apply_swing(step_in_bar, total_swing / 100.0) * (60000.0 / (tempo * 4.0))
            
            -- Check each drum
            local kick_trig, kick_acc = should_trigger(patterns.kick, step_in_bar, pattern_cv, density_cv, ghost_notes.kick)
            local snare_trig, snare_acc = should_trigger(patterns.snare, step_in_bar, pattern_cv, density_cv, ghost_notes.snare)
            local hh_closed_trig, hh_closed_acc = should_trigger(patterns.hihat_closed, step_in_bar, pattern_cv, density_cv, ghost_notes.hihat)
            local hh_open_trig, hh_open_acc = should_trigger(patterns.hihat_open, step_in_bar, pattern_cv, 0, nil)
            
            -- Mute closed hi-hat if open hi-hat triggers (realistic hi-hat behavior)
            if hh_open_trig then
                hh_closed_trig = false
            end
            
            -- Store pending triggers (for swing delay)
            self.pending_triggers = { kick_trig, snare_trig, hh_closed_trig, hh_open_trig }
            self.pending_accents = { kick_acc, snare_acc, hh_closed_acc, hh_open_acc }
            self.swing_delay = swing_delay_ms
        end
        
        -- Process swing delay
        if self.swing_delay > 0 then
            self.swing_delay = self.swing_delay - (dt * 1000)
            if self.swing_delay <= 0 then
                -- Fire pending triggers
                for i = 1, 4 do
                    if self.pending_triggers[i] then
                        self.trigger_timers[i] = trig_ms
                        self.display_lane_flashes[i] = 1
                        self.display_accent_flash = math.max(
                            self.display_accent_flash,
                            self.pending_accents[i]
                        )
                        if self.pending_accents[i] > self.accent then
                            self.accent = self.pending_accents[i]
                        end
                    end
                end
            end
        elseif self.last_step == self.current_step and self.swing_delay <= 0 then
            -- Immediate trigger (no swing on this step)
            for i = 1, 4 do
                if self.pending_triggers[i] then
                    self.trigger_timers[i] = trig_ms
                    self.display_lane_flashes[i] = 1
                    self.display_accent_flash = math.max(
                        self.display_accent_flash,
                        self.pending_accents[i]
                    )
                    if self.pending_accents[i] > self.accent then
                        self.accent = self.pending_accents[i]
                    end
                    self.pending_triggers[i] = false
                end
            end
        end
        
        -- Process trigger timers and generate outputs
        for i = 1, 4 do
            if self.trigger_timers[i] > 0 then
                outputs[i] = 5.0  -- Trigger high
                self.trigger_timers[i] = self.trigger_timers[i] - (dt * 1000)
            else
                outputs[i] = 0.0  -- Trigger low
            end
        end
        
        -- Accent CV output (with slight decay for smooth transitions)
        outputs[5] = self.accent * 5.0
        self.accent = self.accent * 0.99  -- Gradual decay
        
        return outputs
    end
    
    -- Custom display
    , draw = function(self)
        drawStandardParameterLine()
        
        local total_steps = (self.parameters[2] == 2) and 32 or 16
        local cx = 64
        local cy = 34
        local groove_radii = { 23, 18, 13, 8 }
        local lane_labels = { "K", "S", "H", "O" }
        local lane_y = { 19, 30, 41, 52 }

        -- Four concentric grooves make the complete kick/snare/hat pattern
        -- visible. In 32-step mode the 16-step pattern repeats for the second
        -- bar while the outer tick ring retains all 32 clock positions.
        drawCircle(cx, cy, 25, 3)
        for lane = 1, 4 do
            drawCircle(cx, cy, groove_radii[lane], 2)
        end

        -- Outer clock ticks. Downbeats are longest; 32-step mode also uses
        -- medium ticks on alternating sixteenths.
        for i = 0, total_steps - 1 do
            local angle = (i / total_steps) * 2 * math.pi - math.pi / 2
            local tick_outer = 27
            local tick_shade = 3
            if i % 4 == 0 then
                tick_outer = 29
                tick_shade = 8
            elseif total_steps == 32 and i % 2 == 0 then
                tick_outer = 28
                tick_shade = 5
            end

            drawLine(
                cx + 26 * math.cos(angle),
                cy + 26 * math.sin(angle),
                cx + tick_outer * math.cos(angle),
                cy + tick_outer * math.sin(angle),
                tick_shade
            )
        end

        -- Pattern and ghost-note likelihoods appear as notches in their groove.
        for lane = 1, 4 do
            for i = 0, total_steps - 1 do
                local strength = self.display_preview[lane][(i % 16) + 1] or 0
                if strength >= 0.04 then
                    local angle = (i / total_steps) * 2 * math.pi - math.pi / 2
                    local radius = groove_radii[lane]
                    local notch_radius = strength >= 0.65 and 2 or 1
                    local shade = 3 + math.floor(strength * 9)
                    drawCircle(
                        cx + radius * math.cos(angle),
                        cy + radius * math.sin(angle),
                        notch_radius,
                        shade
                    )
                end
            end
        end

        -- Ease the needle between steps while retaining forward wrap motion.
        local elapsed = self.display_time - self.display_step_started
        local progress = clamp(elapsed / 0.08, 0, 1)
        local eased = 1 - ((1 - progress) * (1 - progress) * (1 - progress))
        local needle_step = lerp(self.display_step_from, self.display_step_to, eased)
        needle_step = needle_step % total_steps
        local needle_angle = (needle_step / total_steps) * 2 * math.pi - math.pi / 2
        local needle_x = cx + 27 * math.cos(needle_angle)
        local needle_y = cy + 27 * math.sin(needle_angle)

        drawSmoothLine(cx, cy, needle_x, needle_y, 13)
        drawSmoothCircle(needle_x, needle_y, 2.5, 15)
        drawCircle(cx, cy, 2, 10)

        -- Fired lanes launch accent-sized pulses from the needle into speaker
        -- bars. Flash latches outlive the actual trigger so 1-20 ms pulses are
        -- still visible at 30 fps.
        local bar_x = 145
        local bar_right = 242
        for lane = 1, 4 do
            local y = lane_y[lane]
            local flash = self.display_lane_flashes[lane] or 0
            drawTinyText(bar_x - 9, y + 2, lane_labels[lane], flash > 0 and 15 or 6, "centre")
            drawBox(bar_x, y - 3, bar_right, y + 3, 3)

            if flash > 0 then
                local fill_width = math.floor((bar_right - bar_x - 2) * flash)
                local shade = 8 + math.floor(flash * 7)
                if fill_width > 0 then
                    drawRectangle(bar_x + 1, y - 2, bar_x + 1 + fill_width, y + 2, shade)
                end

                local travel = clamp((1 - flash) * 1.5, 0, 1)
                local pulse_x = lerp(needle_x, bar_x - 5, travel)
                local pulse_y = lerp(needle_y, y, travel)
                local pulse_radius = 1 + self.display_accent_flash * 2
                drawSmoothLine(needle_x, needle_y, bar_x - 5, y, 4 + math.floor(flash * 7))
                drawSmoothCircle(pulse_x, pulse_y, pulse_radius, 10 + math.floor(flash * 5))
            end
        end

        local step_text = string.format("%02d/%02d", self.current_step + 1, total_steps)
        drawTinyText(bar_x, 63, step_text, 10)

        local clock_text
        if self.parameters[4] == 2 then
            if self.display_last_clock_time == nil then
                clock_text = "EXT WAIT"
            elseif self.display_clock_period == nil then
                clock_text = "EXT SYNC"
            else
                local clock_age = self.display_time - self.display_last_clock_time
                if clock_age > math.max(0.5, self.display_clock_period * 2.5) then
                    clock_text = "EXT IDLE"
                else
                    local measured_bpm = 60 / (self.display_clock_period * 4)
                    clock_text = string.format("%dBPM", math.floor(measured_bpm + 0.5))
                end
            end
        else
            clock_text = string.format("%dBPM", self.parameters[1])
        end
        drawTinyText(252, 63, clock_text, 7, "right")
    end
}
