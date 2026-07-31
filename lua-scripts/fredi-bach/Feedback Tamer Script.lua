-- Feedback Tamer
--[[
Monitors audio level and outputs CV to control feedback amount.
Prevents runaway feedback while allowing musical feedback levels.

Patch Example:
  Audio → Delay Input
  Delay Output → [This Script Audio In]
  [This Script CV Out] → VCA CV (in feedback path)
  VCA Out → Delay Feedback Input

The CV output is HIGH when signal is quiet (allowing feedback)
and reduces when signal gets too hot (taming the feedback).
]]

--------------------------------------------------------------------------------
-- Local State Variables
--------------------------------------------------------------------------------
local envelope = 0.0          -- Current envelope level (peak follower)
local gain_reduction = 1.0    -- Current gain reduction (1.0 = no reduction)
local peak_hold = 0.0         -- Peak hold for display
local peak_hold_time = 0.0    -- Timer for peak hold decay

--------------------------------------------------------------------------------
-- Constants
--------------------------------------------------------------------------------
local PEAK_HOLD_DURATION = 1.0  -- How long to hold peak display (seconds)
local DISPLAY_HISTORY_SIZE = 30
local DISPLAY_SAMPLE_TIME = 1.0 / 30.0
local DISPLAY_CENTRE_Y = 31
local DISPLAY_WAVE_HEIGHT = 14

--------------------------------------------------------------------------------
-- Utility Functions
--------------------------------------------------------------------------------

-- Convert dB to linear amplitude
local function db_to_linear(db)
    return 10 ^ (db / 20)
end

-- Convert linear amplitude to dB (with floor)
local function linear_to_db(lin)
    if lin <= 0.0001 then
        return -80
    end
    return 20 * math.log(lin) / math.log(10)
end

-- Calculate time constant coefficient for exponential smoothing
-- dt: time step in seconds
-- time_ms: desired time constant in milliseconds
local function calc_coef(dt, time_ms)
    if time_ms <= 0 then
        return 1.0
    end
    return 1.0 - math.exp(-dt / (time_ms / 1000.0))
end

-- Clamp a value between min and max
local function clamp(value, min_val, max_val)
    if value < min_val then return min_val end
    if value > max_val then return max_val end
    return value
end

local function history_slot(self, chronological_index)
    local slot = self.display_history_write
        - self.display_history_count
        + chronological_index
    while slot <= 0 do
        slot = slot + DISPLAY_HISTORY_SIZE
    end
    while slot > DISPLAY_HISTORY_SIZE do
        slot = slot - DISPLAY_HISTORY_SIZE
    end
    return slot
end

local function waveform_y(sample)
    local normalized = clamp(sample / 5.0, -1, 1)
    return DISPLAY_CENTRE_Y - normalized * DISPLAY_WAVE_HEIGHT
end

--------------------------------------------------------------------------------
-- Main Script Table
--------------------------------------------------------------------------------
return {
    name = 'Feedback Tamer'
    , author = 'Expert Sleepers Ltd'

    ------------------------------------------------------------------------
    -- Initialization
    ------------------------------------------------------------------------
    , init = function(self)
        -- Reset state
        envelope = 0.0
        gain_reduction = 1.0
        peak_hold = 0.0
        peak_hold_time = 0.0

        -- Fixed display buffers are sampled from the real script input,
        -- envelope, and reduced output at the documented draw cadence.
        self.display_time = 0.0
        self.display_sample_accumulator = 0.0
        self.display_history_write = 0
        self.display_history_count = 0
        self.display_input_history = {}
        self.display_output_history = {}
        self.display_envelope_history = {}
        for i = 1, DISPLAY_HISTORY_SIZE do
            self.display_input_history[i] = 0.0
            self.display_output_history[i] = 0.0
            self.display_envelope_history[i] = 0.0
        end
        self.display_jaw_open = 1.0
        self.display_peak_started = -1.0

        return {
            -- Input: Audio signal to monitor (typically feedback return)
            inputs = {
                kCV, -- Type: Sine LFO, Synced: false
            }
            -- Outputs: CV control (linear for smooth VCA control)
            --          Audio passthrough (linear for clean audio)
            , outputs = {
                kLinear, -- Type: Off
                kLinear, -- Type: Off
            }
            , inputNames = { "Audio In" }
            , outputNames = { "CV Out", "Audio Out" }
            , parameters = {
                -- Threshold: Level at which taming begins
                -- Range: -40dB to 0dB, default -6dB
                -- In Eurorack, 0dB typically = 5V peak
                { "Threshold", -40, 0, -6, kDb }

                -- Attack: How fast to respond to rising levels
                -- Fast attack is important for catching transients
                -- Range: 0.1ms to 50ms, default 1ms
                , { "Attack", 1, 500, 10, kMs, kBy10 }

                -- Release: How fast to recover when level drops
                -- Slower release prevents pumping artifacts
                -- Range: 10ms to 2000ms, default 200ms
                , { "Release", 10, 2000, 200, kMs }

                -- Ratio: Compression ratio (how aggressively to reduce)
                -- Higher = more aggressive limiting
                -- Range: 1:1 to 20:1, default 4:1
                , { "Ratio", 10, 200, 40, kNone, kBy10 }

                -- CV Max: Output voltage when no reduction needed
                -- This is the "full feedback" voltage for your VCA
                -- Range: 0V to 10V, default 5V
                , { "CV Max", 0, 100, 50, kVolts, kBy10 }

                -- CV Min: Output voltage at maximum reduction
                -- This is the "no feedback" voltage
                -- Range: 0V to 10V, default 0V
                , { "CV Min", 0, 100, 0, kVolts, kBy10 }

                -- Sidechain HPF: High-pass filter frequency for sidechain
                -- Helps ignore low-frequency content that might cause pumping
                -- Range: Off (0) to 500Hz, default 20Hz
                , { "SC HPF", 0, 500, 20, kHz }
            }
        }
    end

    ------------------------------------------------------------------------
    -- Step Function (called every ~1ms)
    ------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        local audio_in = inputs[1]
        local p = self.parameters
        self.display_time = self.display_time + dt

        -- Read parameters
        local threshold_db = p[1]
        local attack_ms = p[2]
        local release_ms = p[3]
        local ratio = p[4]
        local cv_max = p[5]
        local cv_min = p[6]
        local hpf_freq = p[7]

        -- Convert threshold from dB to linear
        -- In Eurorack context, we consider 5V as 0dB reference
        local threshold_lin = db_to_linear(threshold_db) * 5.0

        -- Calculate smoothing coefficients
        local attack_coef = calc_coef(dt, attack_ms)
        local release_coef = calc_coef(dt, release_ms)

        -- Get absolute value of input for level detection
        local sidechain_signal = audio_in
        local input_level = math.abs(sidechain_signal)

        -- Simple one-pole high-pass filter for sidechain (optional)
        -- This helps prevent low frequencies from triggering reduction
        if hpf_freq > 0 then
            -- Store HPF state in self for persistence
            if not self.hpf_state then
                self.hpf_state = 0.0
            end
            local hpf_coef = calc_coef(dt, 1000.0 / (2.0 * math.pi * hpf_freq))
            self.hpf_state = self.hpf_state + hpf_coef * (audio_in - self.hpf_state)
            sidechain_signal = audio_in - self.hpf_state
            input_level = math.abs(sidechain_signal)
        end

        -- Peak envelope follower with separate attack/release
        if input_level > envelope then
            -- Rising: use attack time
            envelope = envelope + attack_coef * (input_level - envelope)
        else
            -- Falling: use release time
            envelope = envelope + release_coef * (input_level - envelope)
        end

        -- Calculate gain reduction based on threshold and ratio
        if envelope > threshold_lin and threshold_lin > 0 then
            -- How many dB over threshold
            local over_db = linear_to_db(envelope / threshold_lin)

            -- Apply compression ratio
            -- For ratio R, output_db = input_db / R (above threshold)
            local reduced_db = over_db / ratio

            -- Gain reduction in dB
            local gr_db = over_db - reduced_db

            -- Convert to linear gain reduction
            gain_reduction = db_to_linear(-gr_db)
        else
            -- Below threshold: no reduction
            gain_reduction = 1.0
        end

        -- Ensure gain reduction stays in valid range
        gain_reduction = clamp(gain_reduction, 0.0, 1.0)

        -- Map gain reduction to CV output
        -- gain_reduction = 1.0 → cv_max (full feedback allowed)
        -- gain_reduction = 0.0 → cv_min (feedback cut)
        local cv_out = cv_min + gain_reduction * (cv_max - cv_min)

        -- Audio passthrough with optional limiting
        -- Apply same gain reduction to audio for inline limiting
        local audio_out = audio_in * gain_reduction

        -- Update peak hold for display
        peak_hold_time = peak_hold_time + dt
        if envelope > peak_hold then
            peak_hold = envelope
            peak_hold_time = 0.0
            self.display_peak_started = self.display_time
        elseif peak_hold_time > PEAK_HOLD_DURATION then
            peak_hold = envelope
        end

        -- The jaw follows the authoritative gain reduction. A minimum display
        -- time keeps very fast attack visible while the real release parameter
        -- controls its slower reopening.
        local jaw_time_ms
        if gain_reduction < self.display_jaw_open then
            jaw_time_ms = math.max(20, attack_ms)
        else
            jaw_time_ms = math.max(60, release_ms)
        end
        local jaw_coef = calc_coef(dt, jaw_time_ms)
        self.display_jaw_open = self.display_jaw_open
            + jaw_coef * (gain_reduction - self.display_jaw_open)

        self.display_sample_accumulator = self.display_sample_accumulator + dt
        while self.display_sample_accumulator >= DISPLAY_SAMPLE_TIME do
            self.display_sample_accumulator = self.display_sample_accumulator
                - DISPLAY_SAMPLE_TIME
            self.display_history_write = self.display_history_write + 1
            if self.display_history_write > DISPLAY_HISTORY_SIZE then
                self.display_history_write = 1
            end
            self.display_history_count = math.min(
                DISPLAY_HISTORY_SIZE,
                self.display_history_count + 1
            )
            self.display_input_history[self.display_history_write] =
                sidechain_signal
            self.display_output_history[self.display_history_write] = audio_out
            self.display_envelope_history[self.display_history_write] = envelope
        end

        -- Store current values for display
        self.display_envelope = envelope
        self.display_gr = gain_reduction
        self.display_peak = peak_hold
        self.display_threshold = threshold_lin
        self.display_cv = cv_out

        return { cv_out, audio_out }
    end

    ------------------------------------------------------------------------
    -- Custom Display
    ------------------------------------------------------------------------
    , draw = function(self)
        local gr = self.display_gr or 1
        local peak = self.display_peak or 0
        local thresh = self.display_threshold or 1
        local cv = self.display_cv or 0
        local history_count = self.display_history_count or 0

        drawTinyText(5, 9, "IN", 6)
        drawTinyText(170, 9, "OUT", 6)
        drawLine(5, DISPLAY_CENTRE_Y, 130, DISPLAY_CENTRE_Y, 2)
        drawLine(169, DISPLAY_CENTRE_Y, 250, DISPLAY_CENTRE_Y, 2)

        -- The input trace uses the exact signed side-chain sample. With SC HPF
        -- enabled, its low-frequency motion disappears just as it does from the
        -- envelope detector.
        local peak_x = 5
        local peak_y = DISPLAY_CENTRE_Y
        local history_peak = 0
        local previous_x = nil
        local previous_y = nil
        for i = 1, history_count do
            local slot = history_slot(self, i)
            local amount
            if history_count <= 1 then
                amount = 1
            else
                amount = (i - 1) / (history_count - 1)
            end
            local x = 5 + amount * 123
            local sample = self.display_input_history[slot]
            local y = waveform_y(sample)
            local env_amount = clamp(
                self.display_envelope_history[slot] / 5.0,
                0,
                1
            )
            local shade = 5 + math.floor(env_amount * 7)
            if previous_x then
                drawSmoothLine(previous_x, previous_y, x, y, shade)
            end
            previous_x = x
            previous_y = y

            if math.abs(sample) > history_peak then
                history_peak = math.abs(sample)
                peak_x = x
                peak_y = y
            end
        end

        -- The threshold bracket immediately before the jaws moves vertically
        -- with the authoritative linear threshold.
        local threshold_height = clamp(thresh / 5.0, 0, 1)
            * DISPLAY_WAVE_HEIGHT
        local threshold_top = DISPLAY_CENTRE_Y - threshold_height
        local threshold_bottom = DISPLAY_CENTRE_Y + threshold_height
        drawSmoothLine(132, threshold_top, 132, threshold_bottom, 7)
        drawSmoothLine(128, threshold_top, 136, threshold_top, 10)
        drawSmoothLine(128, threshold_bottom, 136, threshold_bottom, 10)

        -- Gain reduction closes the protective jaws. The exit trace contains
        -- the real reduced audio samples, so the mouth and waveform tell the
        -- same story without sampling anything outside the Lua algorithm.
        local jaw_open = clamp(self.display_jaw_open or 1, 0, 1)
        local jaw_gap = 3 + jaw_open * 11
        local jaw_shade = 8 + math.floor((1 - jaw_open) * 7)
        local upper_tip_y = DISPLAY_CENTRE_Y - jaw_gap
        local lower_tip_y = DISPLAY_CENTRE_Y + jaw_gap
        drawSmoothLine(137, 9, 152, upper_tip_y, jaw_shade)
        drawSmoothLine(152, upper_tip_y, 167, 9, jaw_shade)
        drawSmoothLine(137, 53, 152, lower_tip_y, jaw_shade)
        drawSmoothLine(152, lower_tip_y, 167, 53, jaw_shade)
        drawSmoothCircle(152, 8, 2, 6)
        drawSmoothCircle(152, 54, 2, 6)

        previous_x = nil
        previous_y = nil
        for i = 1, history_count do
            local slot = history_slot(self, i)
            local amount
            if history_count <= 1 then
                amount = 1
            else
                amount = (i - 1) / (history_count - 1)
            end
            local x = 170 + amount * 79
            local y = waveform_y(self.display_output_history[slot])
            if previous_x then
                drawSmoothLine(
                    previous_x,
                    previous_y,
                    x,
                    y,
                    7 + math.floor(gr * 5)
                )
            end
            previous_x = x
            previous_y = y
        end

        local peak_age = self.display_time - self.display_peak_started
        if self.display_peak_started >= 0
            and peak_age < PEAK_HOLD_DURATION
            and peak > 0 then
            local peak_fade = 1 - peak_age / PEAK_HOLD_DURATION
            drawSmoothCircle(
                peak_x,
                peak_y,
                1.5 + peak_fade,
                7 + math.floor(peak_fade * 8)
            )
        end

        local reduction_percent = math.floor((1 - gr) * 100 + 0.5)
        local status = "PASS"
        if gr < 0.99 then status = "TAME" end
        if gr < 0.5 then status = "LIMIT" end
        drawTinyText(252, 9, status, jaw_shade, "right")
        drawTinyText(
            4,
            62,
            string.format("TH %.0fdB", self.parameters[1]),
            8
        )
        drawTinyText(
            128,
            62,
            string.format("GR %d%%", reduction_percent),
            11 + math.floor((1 - gr) * 4),
            "centre"
        )
        drawTinyText(
            252,
            62,
            string.format("CV %+.2fV", cv),
            13,
            "right"
        )

        return true
    end
}
