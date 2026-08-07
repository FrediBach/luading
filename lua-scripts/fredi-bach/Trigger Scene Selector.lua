-- Trigger Scene Selector
-- Select one of three user-defined CV scenes and combine the selector gates.
--[[
Inspired by the core patching idea of the Jasmine & Olive Trees Traffic module.

Each input selects a row of three CV values. Input 1 has priority over input 2,
and input 2 has priority over input 3 when several gates overlap. The last
selected scene stays latched after all inputs return low. Trigger Sum is high
while any selector input is high, so short input gates behave as triggers while
longer gates retain their duration.

Inputs:
  1. Trig 1 - selects Scene 1
  2. Trig 2 - selects Scene 2
  3. Trig 3 - selects Scene 3

Outputs:
  1-3. CV A-C     - values from the selected scene
  4.   Trigger Sum - high while any selector input is high
]]

local GATE_VOLTAGE = 5.0
local gateStates = {false, false, false}
local selectedScene = 1

local function anyGateHigh()
    return gateStates[1] or gateStates[2] or gateStates[3]
end

local function updateSelection()
    for scene = 1, 3 do
        if gateStates[scene] then
            selectedScene = scene
            return
        end
    end
end

local function sceneOutputs(self)
    local firstParameter = (selectedScene - 1) * 3 + 1
    return {
        self.parameters[firstParameter],
        self.parameters[firstParameter + 1],
        self.parameters[firstParameter + 2],
        anyGateHigh() and GATE_VOLTAGE or 0.0
    }
end

local function voltageText(value)
    return string.format("%+.2f", value)
end

return {
    name = "Trigger Scene Selector",
    author = "Fredi Bach",

    -- Luading simulator extension; ignored by Disting NT.
    luading = {
        parameterPresets = {
            {
                name = "Zeroed",
                values = {0, 0, 0, 0, 0, 0, 0, 0, 0}
            },
            {
                name = "Ascending",
                values = {0, 1, 2, 2, 3, 4, 4, 5, 6}
            },
            {
                name = "Bipolar",
                values = {-4, 0, 4, 0, 2, -2, 4, -4, 0}
            }
        }
    },

    init = function(self)
        gateStates = {false, false, false}
        selectedScene = 1

        return {
            -- Gate typing exposes both edges. Short gates may still be used as
            -- triggers, while longer gates are preserved by Trigger Sum.
            inputs = {
                kGate, -- Type: Gate, Synced: true, Division: 1/4
                kGate, -- Type: Gate, Synced: true, Division: 1/4
                kGate  -- Type: Gate, Synced: true, Division: 1/4
            },
            inputNames = {"Trig 1", "Trig 2", "Trig 3"},
            outputs = {
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped  -- Type: Synth Trigger
            },
            outputNames = {"CV A", "CV B", "CV C", "Trigger Sum"},
            parameters = {
                {"Scene 1 CV A", -800, 800, 0, kVolts, kBy100},
                {"Scene 1 CV B", -800, 800, 0, kVolts, kBy100},
                {"Scene 1 CV C", -800, 800, 0, kVolts, kBy100},
                {"Scene 2 CV A", -800, 800, 0, kVolts, kBy100},
                {"Scene 2 CV B", -800, 800, 0, kVolts, kBy100},
                {"Scene 2 CV C", -800, 800, 0, kVolts, kBy100},
                {"Scene 3 CV A", -800, 800, 0, kVolts, kBy100},
                {"Scene 3 CV B", -800, 800, 0, kVolts, kBy100},
                {"Scene 3 CV C", -800, 800, 0, kVolts, kBy100}
            }
        }
    end,

    gate = function(self, input, rising)
        if input < 1 or input > 3 then return {} end
        gateStates[input] = rising
        updateSelection()
        return sceneOutputs(self)
    end,

    -- Refresh the latched scene at control rate so parameter edits reach the
    -- outputs even when no new selector edge arrives.
    step = function(self, dt, inputs)
        return sceneOutputs(self)
    end,

    draw = function(self)
        drawTinyText(4, 5, "TRIGGER SCENES", 12)
        drawTinyText(
            252,
            5,
            anyGateHigh() and "SUM HIGH" or "SUM LOW",
            anyGateHigh() and 15 or 6,
            "right"
        )

        drawTinyText(76, 14, "CV A", 7, "centre")
        drawTinyText(145, 14, "CV B", 7, "centre")
        drawTinyText(214, 14, "CV C", 7, "centre")

        for scene = 1, 3 do
            local y = 18 + (scene - 1) * 15
            local selected = scene == selectedScene
            drawBox(3, y, 252, y + 12, selected and 9 or 3)
            if gateStates[scene] then
                drawRectangle(5, y + 2, 9, y + 10, 15)
            end
            drawTinyText(14, y + 8, tostring(scene), selected and 15 or 7)

            local firstParameter = (scene - 1) * 3 + 1
            drawTinyText(
                76, y + 8, voltageText(self.parameters[firstParameter]),
                selected and 15 or 7, "centre"
            )
            drawTinyText(
                145, y + 8, voltageText(self.parameters[firstParameter + 1]),
                selected and 15 or 7, "centre"
            )
            drawTinyText(
                214, y + 8, voltageText(self.parameters[firstParameter + 2]),
                selected and 15 or 7, "centre"
            )
        end

        return true
    end
}
