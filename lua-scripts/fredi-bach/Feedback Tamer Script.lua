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
local DISPLAY_WIDTH = 256
local DISPLAY_HEIGHT = 64

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

        return {
            -- Input: Audio signal to monitor (typically feedback return)
            inputs = 1
            -- Outputs: CV control (linear for smooth VCA control)
            --          Audio passthrough (linear for clean audio)
            , outputs = { kLinear, kLinear }
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
        local input_level = math.abs(audio_in)

        -- Simple one-pole high-pass filter for sidechain (optional)
        -- This helps prevent low frequencies from triggering reduction
        if hpf_freq > 0 then
            -- Store HPF state in self for persistence
            if not self.hpf_state then
                self.hpf_state = 0.0
            end
            local hpf_coef = calc_coef(dt, 1000.0 / (2.0 * math.pi * hpf_freq))
            self.hpf_state = self.hpf_state + hpf_coef * (audio_in - self.hpf_state)
            input_level = math.abs(audio_in - self.hpf_state)
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
        elseif peak_hold_time > PEAK_HOLD_DURATION then
            peak_hold = envelope
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
        -- Get display values (with defaults for first frame)
        local env = self.display_envelope or 0
        local gr = self.display_gr or 1
        local peak = self.display_peak or 0
        local thresh = self.display_threshold or 1
        local cv = self.display_cv or 0

        -- Layout constants
        local meter_left = 10
        local meter_right = 180
        local meter_width = meter_right - meter_left
        local meter_top = 20
        local meter_height = 12
        local gr_top = 38
        local gr_height = 10

        -- Draw title
        drawText(128, 12, "FEEDBACK TAMER", 15, "centre")

        -- === Input Level Meter ===
        drawText(meter_left, meter_top - 2, "IN", 8)

        -- Meter background
        drawBox(meter_left, meter_top, meter_right, meter_top + meter_height, 4)

        -- Convert envelope to meter position (0-5V range mapped to meter)
        local env_normalized = clamp(env / 5.0, 0, 1)
        local env_pos = meter_left + math.floor(env_normalized * meter_width)

        -- Draw level bar with color coding
        if env_pos > meter_left then
            local color = 10  -- Normal: cyan-ish
            if env > thresh then
                color = 15  -- Over threshold: bright/white
            end
            drawRectangle(meter_left + 1, meter_top + 1, 
                         env_pos, meter_top + meter_height - 1, color)
        end

        -- Draw threshold marker
        local thresh_normalized = clamp(thresh / 5.0, 0, 1)
        local thresh_pos = meter_left + math.floor(thresh_normalized * meter_width)
        drawLine(thresh_pos, meter_top - 2, thresh_pos, meter_top + meter_height + 2, 12)

        -- Draw peak hold marker
        local peak_normalized = clamp(peak / 5.0, 0, 1)
        local peak_pos = meter_left + math.floor(peak_normalized * meter_width)
        if peak_pos > meter_left then
            drawLine(peak_pos, meter_top + 1, peak_pos, meter_top + meter_height - 1, 15)
        end

        -- === Gain Reduction Meter ===
        drawText(meter_left, gr_top - 2, "GR", 8)

        -- GR meter background
        drawBox(meter_left, gr_top, meter_right, gr_top + gr_height, 4)

        -- GR is shown as reduction from right (1.0 = no reduction = empty)
        local gr_amount = 1.0 - gr  -- Amount of reduction (0 to 1)
        local gr_pos = meter_left + math.floor(gr_amount * meter_width)

        if gr_pos > meter_left then
            -- Color based on amount of reduction
            local gr_color = 6  -- Mild reduction
            if gr_amount > 0.5 then
                gr_color = 12  -- Heavy reduction
            end
            if gr_amount > 0.8 then
                gr_color = 15  -- Extreme reduction
            end
            drawRectangle(meter_left + 1, gr_top + 1, 
                         gr_pos, gr_top + gr_height - 1, gr_color)
        end

        -- === CV Output Display ===
        local cv_text = string.format("CV: %.2fV", cv)
        drawText(200, meter_top + 6, cv_text, 15)

        -- === Status indicator ===
        local status = "PASS"
        local status_color = 10
        if gr < 0.99 then
            status = "TAMING"
            status_color = 12
        end
        if gr < 0.5 then
            status = "LIMITING"
            status_color = 15
        end
        drawText(200, gr_top + 5, status, status_color)

        -- === Scale markers ===
        drawTinyText(meter_left, meter_top + meter_height + 8, "0", 6)
        drawTinyText(meter_left + meter_width // 2, meter_top + meter_height + 8, "2.5", 6, "centre")
        drawTinyText(meter_right, meter_top + meter_height + 8, "5V", 6, "right")

        -- Return false to show standard parameter line at top
        return false
    end
}
