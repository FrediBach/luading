-- Note Selective Trigger
--[[
Outputs a trigger and gate when a specific MIDI note is played.
The target note can be set via parameter and modulated via CV input.
CV input follows 1V/octave standard (1V = 12 semitones).

Outputs:
  1. Trigger - Short pulse on note-on (configurable duration)
  2. Gate - High while note is held
  3. Velocity - 0-10V proportional to MIDI velocity

Inputs:
  1. Note CV - Offsets the target note (1V/oct, range configurable)

Use cases:
  - Trigger drum modules from specific MIDI keys
  - Create note-selective gates for envelopes
  - Extract velocity CV from specific notes
  - Build custom MIDI-to-CV routing
]]

--------------------------------------------------------------------------------
-- Note name lookup table
--------------------------------------------------------------------------------
local NOTE_NAMES = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" }

--------------------------------------------------------------------------------
-- Helper: Convert MIDI note number to display string (e.g., "C4", "F#2")
--------------------------------------------------------------------------------
local function noteToString(note)
    local name = NOTE_NAMES[(note % 12) + 1]
    local octave = math.floor(note / 12) - 1
    return name .. octave
end

--------------------------------------------------------------------------------
-- Main script table
--------------------------------------------------------------------------------
return
{
    name = 'Note Selective Trigger'
    , author = 'Expert Sleepers Ltd'
    
    --------------------------------------------------------------------------
    -- Initialization
    --------------------------------------------------------------------------
    , init = function(self)
        -- State variables
        self.triggerActive = false
        self.triggerTimer = 0
        self.gateActive = false
        self.targetNote = 60          -- Current target note (base + CV)
        self.heldNote = -1            -- Note currently holding gate open (-1 = none)
        self.lastVelocity = 0         -- Last received velocity (0-127)
        
        return
        {
            -- One CV input for note offset
            inputs = {
                kCV, -- Type: Note Sequencer (V/Oct), Synced: true, Division: 1/4
            }
            , inputNames = { "Note CV" }
            
            -- Three outputs: trigger, gate, velocity
            , outputs = {
                kStepped, -- Type: Kick Trigger
                kStepped, -- Type: Off
                kLinear,  -- Type: Off
            }
            , outputNames = { "Trigger", "Gate", "Velocity" }
            
            -- User-configurable parameters
            , parameters = 
            {
                { "Base Note", 0, 127, 60, kMIDINote }      -- Target note
                , { "CV Range", 0, 48, 12, kSemitones }     -- How much CV can shift note
                , { "Trigger ms", 1, 50, 5, kMs }          -- Trigger pulse duration
                , { "MIDI Channel", 0, 16, 0 }             -- 0=omni, 1-16=specific
            }
            
            -- MIDI configuration
            , midi = { 
                channelParameter = 4,                       -- Parameter 4 = MIDI Channel
                messages = { "note" }                       -- Receive note on/off
            }
        }
    end
    
    --------------------------------------------------------------------------
    -- Step function - called every 1ms
    -- Handles CV input processing and trigger timing
    --------------------------------------------------------------------------
    , step = function(self, dt, inputs)
        local outs = {}
        
        -- Calculate target note from base parameter + CV offset
        local baseNote = self.parameters[1]
        local cvRange = self.parameters[2]
        local cvOffset = 0
        
        if cvRange > 0 and inputs[1] then
            -- CV input uses 1V/octave standard: 1V = 12 semitones
            -- Round to nearest semitone for discrete note selection
            cvOffset = math.floor(inputs[1] * 12 + 0.5)
            -- Clamp to configured CV range (bipolar)
            cvOffset = math.max(-cvRange, math.min(cvRange, cvOffset))
        end
        
        -- Calculate final target note, clamped to valid MIDI range
        self.targetNote = math.max(0, math.min(127, baseNote + cvOffset))
        
        -- Handle trigger pulse timing
        if self.triggerActive then
            -- dt is in seconds, convert trigger duration from ms
            self.triggerTimer = self.triggerTimer - (dt * 1000)
            if self.triggerTimer <= 0 then
                self.triggerActive = false
                outs[1] = 0.0  -- Trigger goes low
            end
        end
        
        -- Continuous gate output based on state
        outs[2] = self.gateActive and 5.0 or 0.0
        
        -- Velocity output (scaled 0-10V from 0-127)
        -- Only update when gate is active to hold last velocity
        if self.gateActive then
            outs[3] = (self.lastVelocity / 127.0) * 10.0
        end
        
        return outs
    end
    
    --------------------------------------------------------------------------
    -- MIDI message handler
    -- Called when matching MIDI messages arrive (filtered by channel)
    --------------------------------------------------------------------------
    , midiMessage = function(self, message)
        local status = message[1] & 0xF0  -- Strip channel nibble
        local note = message[2]
        local velocity = message[3] or 0
        
        -- Note On (0x90 with velocity > 0)
        if status == 0x90 and velocity > 0 then
            -- Only respond if this note matches our current target
            if note == self.targetNote then
                -- Fire trigger
                self.triggerActive = true
                self.triggerTimer = self.parameters[3]  -- Trigger duration in ms
                
                -- Open gate and record which note opened it
                self.gateActive = true
                self.heldNote = note
                self.lastVelocity = velocity
                
                -- Immediate output update
                local velCV = (velocity / 127.0) * 10.0
                return { 5.0, 5.0, velCV }
            end
        
        -- Note Off (0x80 or 0x90 with velocity 0)
        elseif status == 0x80 or (status == 0x90 and velocity == 0) then
            -- Only close gate if this is the note that opened it
            -- This prevents issues if target note changes while held
            if note == self.heldNote then
                self.gateActive = false
                self.heldNote = -1
                -- Keep velocity at last value (sample & hold behavior)
                return { nil, 0.0, nil }
            end
        end
    end
    
    --------------------------------------------------------------------------
    -- Draw function - called at ~30fps for custom display
    --------------------------------------------------------------------------
    , draw = function(self)
        -- Screen is 256x64 pixels
        
        -- === Target Note Display (Center) ===
        local noteStr = noteToString(self.targetNote)
        drawText(128, 32, noteStr, 15, "centre")
        drawTinyText(128, 45, "Target: " .. self.targetNote, 10, "centre")
        
        -- === Base Note Info (Top Left) ===
        local baseStr = noteToString(self.parameters[1])
        drawTinyText(5, 10, "Base", 6, "left")
        drawText(5, 24, baseStr, 8, "left")
        
        -- === CV Offset Display (Top Right) ===
        local cvRange = self.parameters[2]
        if cvRange > 0 then
            local offset = self.targetNote - self.parameters[1]
            local offsetStr = offset >= 0 and ("+" .. offset) or tostring(offset)
            drawTinyText(251, 10, "CV", 6, "right")
            drawText(251, 24, offsetStr, 8, "right")
        end
        
        -- === Trigger Indicator (Bottom Left) ===
        local trigX, trigY = 30, 54
        if self.triggerActive then
            drawRectangle(trigX - 12, trigY - 8, trigX + 12, trigY + 4, 15)
        else
            drawBox(trigX - 12, trigY - 8, trigX + 12, trigY + 4, 6)
        end
        drawTinyText(trigX, trigY + 12, "TRIG", 8, "centre")
        
        -- === Gate Indicator (Bottom Center) ===
        local gateX, gateY = 128, 54
        if self.gateActive then
            drawRectangle(gateX - 12, gateY - 8, gateX + 12, gateY + 4, 15)
        else
            drawBox(gateX - 12, gateY - 8, gateX + 12, gateY + 4, 6)
        end
        drawTinyText(gateX, gateY + 12, "GATE", 8, "centre")
        
        -- === Velocity Bar (Bottom Right) ===
        local velX, velY = 226, 54
        local velWidth = 24
        local velHeight = 12
        -- Draw outline
        drawBox(velX - velWidth/2, velY - velHeight/2, 
                velX + velWidth/2, velY + velHeight/2, 6)
        -- Draw filled portion based on velocity
        if self.lastVelocity > 0 then
            local fillWidth = math.floor((self.lastVelocity / 127.0) * (velWidth - 2))
            if fillWidth > 0 then
                drawRectangle(velX - velWidth/2 + 1, velY - velHeight/2 + 1,
                             velX - velWidth/2 + 1 + fillWidth, velY + velHeight/2 - 1, 
                             self.gateActive and 15 or 8)
            end
        end
        drawTinyText(velX, velY + 12, "VEL", 8, "centre")
    end
}
