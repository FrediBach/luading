-- Melody Range Quantizer
--[[
Quantizes a V/oct melody to semitones and keeps it inside CV-controlled
minimum and maximum notes. Pitches below the range play the minimum note;
pitches above it play the maximum note.

Patch the same positive envelope or sequencer lane to Min CV and Max CV to
open a melody out from a single note. The default Min CV amount is negative,
so Min CV moves the lower boundary down while Max CV moves the upper boundary
up. The two attenuverters can be changed for other range movements.

V/oct uses C4 (MIDI note 60) as 0 V. Boundary CV is applied at one octave per
volt before the result is rounded to a MIDI note and constrained to 0-127.
]]

local NOTE_NAMES = {
    "C", "C#", "D", "D#", "E", "F",
    "F#", "G", "G#", "A", "A#", "B",
}

local function clamp(value, minimum, maximum)
    return math.max(minimum, math.min(maximum, value))
end

local function round(value)
    return math.floor(value + 0.5)
end

local function voltageToNote(voltage)
    return round(voltage * 12 + 60)
end

local function noteToVoltage(note)
    return (note - 60) / 12
end

local function noteName(note)
    local rounded = round(note)
    return NOTE_NAMES[(rounded % 12) + 1] .. (math.floor(rounded / 12) - 1)
end

local function noteToX(note)
    return 8 + math.floor(clamp(note, 0, 127) * 239 / 127 + 0.5)
end

return {
    name = "Melody Range Quantizer",
    author = "Luading",

    -- Luading simulator extension; ignored by Disting NT.
    luading = {
        parameterPresets = {
            { name = "Closed C4", values = { 60, 60, -100, 100 } },
            { name = "C3 to C5", values = { 48, 72, -100, 100 } },
            { name = "Gentle Window", values = { 55, 67, -50, 50 } },
        },
    },

    init = function(self)
        self.pitchOutput = { 0 }
        self.gateOutput = { [2] = 0 }
        self.inputNote = 60
        self.outputNote = 60
        self.currentMin = 60
        self.currentMax = 60
        self.gateHigh = false

        return {
            inputs = {
                kCV,   -- Type: Note Sequencer (V/Oct), Synced: true, Division: 1/4
                kGate, -- Type: Gate, Synced: true, Division: 1/4
                kCV,   -- Type: Sine LFO, Synced: true, Division: 2 bars
                kCV,   -- Type: Sine LFO, Synced: true, Division: 2 bars
            },
            inputNames = { "Pitch", "Gate", "Min CV", "Max CV" },
            outputs = {
                kStepped, -- Type: Synth Note
                kStepped, -- Type: Synth Trigger
            },
            outputNames = { "Pitch", "Gate" },
            parameters = {
                { "Min Note", 0, 127, 60, kMIDINote },
                { "Max Note", 0, 127, 60, kMIDINote },
                { "Min CV Amt", -100, 100, -100, kPercent },
                { "Max CV Amt", -100, 100, 100, kPercent },
            },
        }
    end,

    step = function(self, dt, inputs)
        local minimum = self.parameters[1]
            + inputs[3] * 12 * self.parameters[3] / 100
        local maximum = self.parameters[2]
            + inputs[4] * 12 * self.parameters[4] / 100

        minimum = clamp(round(minimum), 0, 127)
        maximum = clamp(round(maximum), 0, 127)
        if minimum > maximum then
            minimum, maximum = maximum, minimum
        end

        local inputNote = voltageToNote(inputs[1])
        local outputNote = clamp(inputNote, minimum, maximum)

        self.inputNote = inputNote
        self.outputNote = outputNote
        self.currentMin = minimum
        self.currentMax = maximum
        self.pitchOutput[1] = noteToVoltage(outputNote)
        return self.pitchOutput
    end,

    gate = function(self, input, rising)
        self.gateHigh = rising
        self.gateOutput[2] = rising and 5 or 0
        return self.gateOutput
    end,

    draw = function(self)
        drawText(128, 11, "MELODY RANGE", 15, "centre")
        drawTinyText(
            128,
            21,
            noteName(self.currentMin) .. " - " .. noteName(self.currentMax),
            10,
            "centre"
        )

        local minimumX = noteToX(self.currentMin)
        local maximumX = noteToX(self.currentMax)
        local inputX = noteToX(self.inputNote)
        local outputX = noteToX(self.outputNote)

        drawBox(8, 27, 247, 43, 3)
        if minimumX < maximumX then
            drawRectangle(minimumX, 30, maximumX, 40, 6)
        else
            drawLine(minimumX, 29, minimumX, 41, 10)
        end

        drawLine(inputX, 24, inputX, 27, 8)
        drawLine(outputX, 43, outputX, 47, 15)
        drawTinyText(8, 59, "IN " .. noteName(self.inputNote), 8)
        drawTinyText(248, 59, "OUT " .. noteName(self.outputNote), 15, "right")
        drawCircle(246, 8, 4, self.gateHigh and 15 or 4)
        return true
    end,
}
